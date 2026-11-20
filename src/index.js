import proxy from "./proxy.js";
import { handleAdminApi } from "./admin.js";
import { ConfigurationError, loadConfig } from "./config.js";

async function adminPage(request, env) {
  if (!env.ASSETS) {
    return new Response("请先运行 npm run build 构建管理页面。", { status: 503 });
  }
  const url = new URL(request.url);
  url.pathname = url.pathname === "/admin" || url.pathname === "/admin/"
    ? "/index.html"
    : url.pathname.slice("/admin".length);
  const asset = await env.ASSETS.fetch(new Request(url, request));
  const response = new Response(asset.body, asset);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "same-origin");
  response.headers.set("content-security-policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  if (url.pathname === "/index.html") response.headers.set("cache-control", "no-store");
  return response;
}

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    if (path === "/") return Response.redirect(new URL("/admin/", request.url), 302);
    if (path.startsWith("/admin/api/")) return handleAdminApi(request, env);
    if (path === "/admin" || path.startsWith("/admin/")) return adminPage(request, env);

    try {
      const config = await loadConfig(env);
      if (!config.upstreamBaseUrl) {
        throw new ConfigurationError("请先登录管理页并保存上游接口配置。", 503, "proxy_not_configured");
      }
      return proxy.fetch(request, {
        ...env,
        UPSTREAM_BASE_URL: config.upstreamBaseUrl,
        UPSTREAM_API_KEY: config.upstreamApiKey,
        REPLACEMENT_RULES: config.rules.filter(rule => rule.enabled),
        SYSTEM_REWRITE: config.aiRewrite,
      });
    } catch (error) {
      if (error instanceof ConfigurationError) {
        return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
      }
      return Response.json({ error: { code: "proxy_configuration_error", message: "无法读取代理配置，请检查 D1 绑定和迁移。" } }, { status: 500 });
    }
  },
};
