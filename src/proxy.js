import { applyStringPatches, findSystemTextGroups } from "./json-patches.js";
import { prepareSystemTemplate, RewriteError, rewriteErrorResponse, rewriteSystemText } from "./rewrite.js";

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

async function requestBody(request, rules, env) {
  const encoding = request.headers.get("content-encoding");
  const type = (request.headers.get("content-type") || "").split(";", 1)[0].trim().toLowerCase();
  const isJson = type === "application/json" || type.endsWith("+json");
  const rewrite = Boolean(env.SYSTEM_REWRITE?.enabled);
  if (rewrite && isJson && encoding && encoding !== "identity") {
    throw new RewriteError(415, "system_rewrite_unsupported_encoding", "开启 AI 重写时请发送未压缩的 JSON 请求正文。");
  }
  if (!request.body || (!rules.length && !rewrite) || (encoding && encoding !== "identity") || (!isJson && !type.startsWith("text/"))) {
    return { body: request.body, changed: false };
  }

  const original = await request.arrayBuffer();
  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(original);
    if (isJson) JSON.parse(text);
  } catch {
    if (rewrite && isJson) throw new RewriteError(400, "system_rewrite_invalid_json", "AI 重写需要有效的 UTF-8 JSON 请求正文。");
    return { body: original, changed: false };
  }
  let replaced = isJson ? replaceJson(text, rules) : replaceText(text, rules);
  if (rewrite && isJson) {
    let groups;
    try { groups = findSystemTextGroups(replaced).filter(group => group.some(node => node.value.trim())); }
    catch (error) { throw new RewriteError(422, "system_rewrite_unsupported_content", error.message); }
    if (groups.length) {
      const payload = JSON.parse(replaced);
      const toolNames = (Array.isArray(payload.tools) ? payload.tools : [])
        .map(tool => tool?.function?.name || tool?.name).filter(name => typeof name === "string");
      if (Array.isArray(payload.functions)) toolNames.push(...payload.functions.map(tool => tool?.name).filter(name => typeof name === "string"));
      const jobs = new Map();
      const patches = await Promise.all(groups.map(async nodes => {
        const values = nodes.map(node => node.value);
        const key = JSON.stringify(values);
        if (!jobs.has(key)) jobs.set(key, rewriteParts(values, toolNames, request, env));
        const rewritten = await jobs.get(key);
        return nodes.map((node, index) => ({ start: node.start, end: node.end, value: rewritten[index] }));
      }));
      replaced = applyStringPatches(replaced, patches.flat());
    }
  }
  return {
    body: replaced === text ? original : new TextEncoder().encode(replaced),
    changed: replaced !== text,
  };
}

async function rewriteParts(values, toolNames, request, env) {
  const options = { signal: request.signal, toolNames, requestUrl: request.url };
  if (values.length === 1) return [(await rewriteSystemText(values[0], env.SYSTEM_REWRITE, env, options)).text];
  // Locate protected spans before adding part boundaries, so split memories/JSON stay opaque.
  const plain = values.join("");
  const ranges = prepareSystemTemplate(plain, toolNames).ranges;
  let prefix;
  do { prefix = "__PR_BOUNDARY_" + crypto.randomUUID().replaceAll("-", "") + "_"; }
  while (plain.includes(prefix));
  const boundaries = [];
  const inserts = [];
  const pieces = [];
  let offset = 0;
  for (let index = 0; index < values.length; index++) {
    pieces.push(values[index]);
    offset += values[index].length;
    if (index < values.length - 1) {
      const marker = prefix + index + "__";
      boundaries.push(marker); inserts.push({ at: offset, length: marker.length }); pieces.push(marker);
    }
  }
  const shift = (position, inclusive) => inserts.reduce((sum, insert) => sum + (insert.at < position || inclusive && insert.at === position ? insert.length : 0), position);
  options.protectedRanges = ranges.map(([start, end]) => [shift(start, true), shift(end, false)]);
  const rewritten = (await rewriteSystemText(pieces.join(""), env.SYSTEM_REWRITE, env, options)).text;
  const result = [];
  let cursor = 0;
  for (const marker of boundaries) {
    const index = rewritten.indexOf(marker, cursor);
    if (index < 0) throw new RewriteError(502, "system_rewrite_invalid_output", "AI 改动了系统消息的文本分段。");
    result.push(rewritten.slice(cursor, index)); cursor = index + marker.length;
  }
  result.push(rewritten.slice(cursor));
  return result;
}

function errorResponse(status, code, message) {
  return Response.json({ error: { code, message } }, { status });
}

export default {
  async fetch(request, env) {
    let target;
    let rules;
    try {
      target = upstreamUrl(request.url, env.UPSTREAM_BASE_URL);
      rules = readRules(env.REPLACEMENT_RULES);
    } catch (error) {
      return errorResponse(500, "proxy_configuration_error", error.message);
    }

    try {
      if (env.SYSTEM_REWRITE?.enabled && request.headers.get("x-promptreplace-rewrite-hop") === "1") {
        throw new RewriteError(508, "system_rewrite_recursive_endpoint", "检测到 AI 重写接口指向代理自身，已停止循环调用。");
      }
      const { body, changed } = await requestBody(request, rules, env);
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
      return await fetch(target, {
        method: request.method,
        headers,
        body,
        redirect: "manual",
        signal: request.signal,
      });
    } catch (error) {
      if (error instanceof RewriteError) return rewriteErrorResponse(error);
      return errorResponse(502, "upstream_connection_error", "连接上游失败或请求传输中断。");
    }
  },
};
