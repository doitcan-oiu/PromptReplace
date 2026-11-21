import { collectSystemInterceptions, recordInterceptions } from "./interceptions.js";

const HOP_BY_HOP_HEADERS = [
  "connection", "keep-alive", "proxy-authenticate", "proxy-authorization",
  "proxy-connection", "te", "trailer", "transfer-encoding", "upgrade",
];

export function readRules(value = []) {
  const rules = typeof value === "string" ? JSON.parse(value) : value;
  if (!Array.isArray(rules) || rules.some(rule =>
    !rule || typeof rule.from !== "string" || !rule.from || typeof rule.to !== "string"
  )) {
    throw new Error("REPLACEMENT_RULES 必须是包含非空 from 和字符串 to 的数组。");
  }
  return rules;
}

export function upstreamUrl(clientUrl, baseUrl) {
  const base = new URL(baseUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new Error("UPSTREAM_BASE_URL 必须是 HTTP(S) 地址，且不包含账号、查询参数或片段。");
  }
  const client = new URL(clientUrl);
  const prefix = base.pathname.replace(/\/+$/, "");
  const hasPrefix = client.pathname === prefix || client.pathname.startsWith(prefix + "/");
  base.pathname = hasPrefix ? client.pathname : prefix + client.pathname;
  base.search = client.search;
  return base;
}

function replaceText(text, rules) {
  for (const { from, to } of rules) {
    text = text.split(from).join(to);
  }
  return text;
}

function replaceJson(text, rules) {
  // Change string values in place so numbers and JSON formatting remain intact.
  return text.replace(/"(?:\\[\s\S]|[^"\\])*"/g, (token, offset) => {
    let next = offset + token.length;
    while (next < text.length && /[\t\n\r ]/.test(text[next])) next++;
    if (text[next] === ":") return token;
    const value = JSON.parse(token);
    const replaced = replaceText(value, rules);
    return replaced === value ? token : JSON.stringify(replaced);
  });
}

async function requestBody(request, rules, capture) {
  const encoding = request.headers.get("content-encoding");
  const type = (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const isJson = type === "application/json" || type.endsWith("+json");
  if (!request.body || (!rules.length && !(capture && isJson)) || (encoding && encoding !== "identity") || (!isJson && !type.startsWith("text/"))) {
    return { body: request.body, changed: false };
  }

  const original = await request.arrayBuffer();
  let text;
  let payload;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(original);
    if (isJson) payload = JSON.parse(text);
  } catch {
    return { body: original, changed: false };
  }
  const replaced = isJson ? replaceJson(text, rules) : replaceText(text, rules);
  const forwardedPayload = capture && isJson ? (replaced === text ? payload : JSON.parse(replaced)) : null;
  return {
    body: replaced === text ? original : new TextEncoder().encode(replaced),
    changed: replaced !== text,
    interceptions: capture && isJson ? collectSystemInterceptions(payload, forwardedPayload) : [],
    model: typeof forwardedPayload?.model === "string" ? forwardedPayload.model : "",
  };
}

async function saveInterceptions(env, ctx, interceptions, metadata) {
  if (!interceptions?.length) return;
  const writing = recordInterceptions(env, interceptions, metadata).catch(() => {
    console.error("Failed to save upstream 429 system records.");
  });
  if (typeof ctx?.waitUntil === "function") {
    try { ctx.waitUntil(writing); }
    catch { await writing; }
  } else {
    await writing;
  }
}

function errorResponse(status, code, message) {
  return Response.json({ error: { code, message } }, { status });
}

export default {
  async fetch(request, env, ctx) {
    let target;
    let rules;
    try {
      target = upstreamUrl(request.url, env.UPSTREAM_BASE_URL);
      rules = readRules(env.REPLACEMENT_RULES);
    } catch (error) {
      return errorResponse(500, "proxy_configuration_error", error.message);
    }

    try {
      const { body, changed, interceptions, model } = await requestBody(request, rules, Boolean(env.DB));
      const headers = new Headers(request.headers);
      for (const name of (headers.get("connection") || "").split(",")) {
        if (name.trim()) headers.delete(name.trim());
      }
      for (const name of HOP_BY_HOP_HEADERS) headers.delete(name);
      headers.delete("host");
      if (changed) {
        headers.delete("content-length");
        headers.delete("content-md5");
        headers.delete("digest");
      }
      if (env.UPSTREAM_API_KEY) {
        headers.set("authorization", "Bearer " + env.UPSTREAM_API_KEY);
      }
      const response = await fetch(target, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: request.signal,
      });
      if (response.status === 429) {
        await saveInterceptions(env, ctx, interceptions, { model, path: target.pathname });
      }
      return response;
    } catch {
      return errorResponse(502, "upstream_connection_error", "连接上游失败或请求传输中断。");
    }
  },
};
