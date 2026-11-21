import { ConfigurationError, loadConfig, publicConfig, saveConfig } from "./config.js";
import { deleteInterception, getInterception, InterceptionError, listInterceptions, updateInterception } from "./interceptions.js";

const COOKIE_NAME = "promptreplace_admin";
const SESSION_SECONDS = 8 * 60 * 60;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function json(value, status = 200, headers = {}) {
  return Response.json(value, {
    status,
    headers: { "cache-control": "no-store", "x-content-type-options": "nosniff", ...headers },
  });
}

function error(status, code, message) {
  return json({ error: { code, message } }, status);
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBase64url(value) {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

function signingKey(password) {
  return crypto.subtle.importKey("raw", encoder.encode("PromptReplace session\0" + password),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function passwordMatches(input, password) {
  const [actual, expected] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(input)),
    crypto.subtle.digest("SHA-256", encoder.encode(password)),
  ]);
  const left = new Uint8Array(actual);
  const right = new Uint8Array(expected);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function cookie(value, request, maxAge) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${COOKIE_NAME}=${value}; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
}

async function createSession(password) {
  const payload = base64url(encoder.encode(JSON.stringify({
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
    nonce: crypto.randomUUID(),
  })));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(password), encoder.encode(payload));
  return payload + "." + base64url(signature);
}

async function authenticated(request, env) {
  if (!env.ADMIN_PASSWORD) return false;
  const entry = (request.headers.get("cookie") || "").split(";")
    .map(value => value.trim()).find(value => value.startsWith(COOKIE_NAME + "="));
  if (!entry) return false;
  const token = entry.slice(COOKIE_NAME.length + 1);
  const parts = token.split(".");
  if (parts.length !== 2 || parts.some(part => !/^[A-Za-z0-9_-]+$/.test(part))) return false;
  try {
    const valid = await crypto.subtle.verify("HMAC", await signingKey(env.ADMIN_PASSWORD),
      decodeBase64url(parts[1]), encoder.encode(parts[0]));
    if (!valid) return false;
    const session = JSON.parse(decoder.decode(decodeBase64url(parts[0])));
    return Number.isSafeInteger(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

async function jsonBody(request) {
  if (request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json") {
    throw new ConfigurationError("请求需要使用 application/json。", 415, "unsupported_content_type");
  }
  try {
    return await request.json();
  } catch {
    throw new ConfigurationError("请求正文不是有效的 JSON。", 400, "invalid_json");
  }
}

export async function handleAdminApi(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  const interceptionMatch = path.match(/^\/admin\/api\/interceptions\/([^/]+)$/);
  const allowed = interceptionMatch ? ["GET", "PATCH", "DELETE"] : {
    "/admin/api/session": ["GET"],
    "/admin/api/login": ["POST"],
    "/admin/api/logout": ["POST"],
    "/admin/api/config": ["GET", "PUT"],
    "/admin/api/interceptions": ["GET"],
  }[path];
  if (!allowed) return error(404, "not_found", "管理接口不存在。");
  if (!allowed.includes(request.method)) {
    return json({ error: { code: "method_not_allowed", message: "请求方法不支持。" } }, 405, { allow: allowed.join(", ") });
  }
  const origin = request.headers.get("origin");
  if (request.method !== "GET" && origin && origin !== new URL(request.url).origin) {
    return error(403, "origin_not_allowed", "请从管理页面提交修改。");
  }

  try {
    if (path === "/admin/api/session") {
      return json({ authenticated: await authenticated(request, env), configured: Boolean(env.ADMIN_PASSWORD) });
    }
    if (path === "/admin/api/logout") {
      return json({ ok: true }, 200, { "set-cookie": cookie("", request, 0) });
    }
    if (!env.ADMIN_PASSWORD) {
      return error(503, "admin_not_configured", "请先在 Worker 中设置 ADMIN_PASSWORD Secret。");
    }
    if (path === "/admin/api/login") {
      const input = await jsonBody(request);
      if (typeof input?.password !== "string" || !await passwordMatches(input.password, env.ADMIN_PASSWORD)) {
        return error(401, "invalid_credentials", "管理密码不正确。");
      }
      const token = await createSession(env.ADMIN_PASSWORD);
      return json({ ok: true }, 200, { "set-cookie": cookie(token, request, SESSION_SECONDS) });
    }
    if (!await authenticated(request, env)) {
      return error(401, "authentication_required", "登录已过期，请重新登录。");
    }
    if (!env.DB) {
      return error(503, "database_not_configured", "请先配置 D1 数据库绑定 DB 并执行数据库迁移。");
    }
    if (path === "/admin/api/interceptions") return json(await listInterceptions(env, url));
    if (interceptionMatch) {
      const id = interceptionMatch[1];
      if (request.method === "PATCH") return json(await updateInterception(env, id, await jsonBody(request)));
      if (request.method === "DELETE") return json(await deleteInterception(env, id));
      return json(await getInterception(env, id));
    }
    const configuration = request.method === "GET" ? await loadConfig(env) : await saveConfig(env, await jsonBody(request));
    return json(publicConfig(configuration));
  } catch (failure) {
    if (failure instanceof ConfigurationError || failure instanceof InterceptionError) return error(failure.status, failure.code, failure.message);
    return error(500, "admin_storage_error", "管理服务暂时不可用，请检查 D1 绑定及数据库迁移。");
  }
}
