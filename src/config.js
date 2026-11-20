import { readRules, upstreamUrl } from "./proxy.js";

export class ConfigurationError extends Error {
  constructor(message, status = 400, code = "invalid_configuration") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const DEFAULT_AI_REWRITE = Object.freeze({
  enabled: false,
  baseUrl: "",
  model: "",
  apiKey: "",
  timeoutSeconds: 90,
  cacheEnabled: true,
  cacheTtlHours: 24,
});

export function resolveAiRewriteSettings(input, current = DEFAULT_AI_REWRITE, { requireConnection = false } = {}) {
  if (input !== undefined && (!input || typeof input !== "object" || Array.isArray(input))) {
    throw new ConfigurationError("AI 重写配置必须是一个 JSON 对象。");
  }
  const changes = input || {};
  const settings = { ...DEFAULT_AI_REWRITE, ...current };
  for (const field of ["enabled", "cacheEnabled"]) {
    if (changes[field] !== undefined) {
      if (typeof changes[field] !== "boolean") throw new ConfigurationError("AI 重写的启用和缓存选项必须是布尔值。");
      settings[field] = changes[field];
    }
  }
  for (const field of ["baseUrl", "model"]) {
    if (changes[field] !== undefined) {
      if (typeof changes[field] !== "string") throw new ConfigurationError("AI 重写接口地址和模型必须是文字。");
      settings[field] = changes[field].trim();
    }
  }
  for (const [field, minimum, maximum, label] of [
    ["timeoutSeconds", 5, 120, "AI 重写超时需要是 5–120 秒之间的整数。"],
    ["cacheTtlHours", 1, 720, "AI 重写缓存有效期需要是 1–720 小时之间的整数。"],
  ]) {
    if (changes[field] !== undefined) {
      if (!Number.isInteger(changes[field]) || changes[field] < minimum || changes[field] > maximum) {
        throw new ConfigurationError(label);
      }
      settings[field] = changes[field];
    }
  }
  if (changes.apiKey !== undefined && typeof changes.apiKey !== "string") {
    throw new ConfigurationError("AI 重写密钥必须是文字。");
  }
  if (changes.clearApiKey !== undefined && typeof changes.clearApiKey !== "boolean") {
    throw new ConfigurationError("清除 AI 重写密钥的选项无效。");
  }
  if (changes.clearApiKey && changes.apiKey) {
    throw new ConfigurationError("请先选择更换 AI 重写密钥或清除密钥。");
  }
  if (changes.apiKey && /[\r\n]/.test(changes.apiKey)) {
    throw new ConfigurationError("AI 重写密钥不能包含换行。");
  }
  settings.apiKey = changes.clearApiKey ? "" : changes.apiKey || settings.apiKey;
  if (settings.baseUrl) {
    try {
      const url = new URL(settings.baseUrl);
      if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error();
    } catch {
      throw new ConfigurationError("AI 重写地址必须是 HTTP(S) 地址，且不包含账号、查询参数或片段。");
    }
  }
  if ((settings.enabled || requireConnection) && (!settings.baseUrl || !settings.model)) {
    throw new ConfigurationError("请填写 AI 重写接口地址和模型。");
  }
  return settings;
}

function publicAiRewriteSettings(settings) {
  const { apiKey, ...configuration } = settings;
  return { ...configuration, hasApiKey: Boolean(apiKey) };
}

function normalizedRules(rules) {
  return readRules(rules).map((rule, index) => ({
    id: typeof rule.id === "string" && rule.id ? rule.id : `default-${index + 1}`,
    from: rule.from,
    to: rule.to,
    enabled: rule.enabled !== false,
  }));
}

export async function loadConfig(env) {
  if (!env.DB) {
    throw new ConfigurationError("请先配置 D1 数据库绑定 DB 并执行数据库迁移。", 503, "database_not_configured");
  }
  const row = await env.DB.prepare(
    "SELECT upstream_base_url, upstream_api_key, rules_json, ai_rewrite_json, revision, updated_at FROM proxy_config WHERE id = 1"
  ).first();
  if (row) {
    return {
      upstreamBaseUrl: row.upstream_base_url,
      upstreamApiKey: row.upstream_api_key,
      rules: normalizedRules(JSON.parse(row.rules_json)),
      aiRewrite: resolveAiRewriteSettings(JSON.parse(row.ai_rewrite_json)),
      revision: row.revision,
      updatedAt: row.updated_at,
    };
  }
  return {
    upstreamBaseUrl: "",
    upstreamApiKey: "",
    rules: [],
    aiRewrite: { ...DEFAULT_AI_REWRITE },
    revision: 0,
    updatedAt: null,
  };
}

export function publicConfig(config) {
  return {
    upstreamBaseUrl: config.upstreamBaseUrl,
    hasUpstreamKey: Boolean(config.upstreamApiKey),
    rules: config.rules,
    aiRewrite: publicAiRewriteSettings(config.aiRewrite),
    revision: config.revision,
    updatedAt: config.updatedAt,
  };
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ConfigurationError("配置必须是一个 JSON 对象。");
  }
  if (!Number.isSafeInteger(input.revision) || input.revision < 0) {
    throw new ConfigurationError("配置版本无效，请重新加载页面。");
  }
  if (typeof input.upstreamBaseUrl !== "string" || !input.upstreamBaseUrl.trim()) {
    throw new ConfigurationError("请填写上游基础地址。");
  }
  const url = input.upstreamBaseUrl.trim();
  try {
    upstreamUrl("https://proxy.invalid/v1/chat/completions", url);
  } catch {
    throw new ConfigurationError("上游地址必须是 HTTP(S) 地址，且不包含账号、查询参数或片段。");
  }
  let rules;
  if (!Array.isArray(input.rules)) {
    throw new ConfigurationError("替换规则必须是一个数组。");
  }
  try {
    rules = readRules(input.rules);
  } catch {
    throw new ConfigurationError("每条规则都需要非空的查找文字和字符串类型的替换文字。");
  }
  const ids = new Set();
  for (const rule of rules) {
    if (typeof rule.id !== "string" || !rule.id || ids.has(rule.id)) {
      throw new ConfigurationError("规则编号无效或重复，请重新加载页面。");
    }
    if (typeof rule.enabled !== "boolean") {
      throw new ConfigurationError("请为每条规则设置启用状态。");
    }
    ids.add(rule.id);
  }
  if (input.upstreamApiKey !== undefined && typeof input.upstreamApiKey !== "string") {
    throw new ConfigurationError("上游密钥必须是文字。");
  }
  if (input.clearUpstreamKey !== undefined && typeof input.clearUpstreamKey !== "boolean") {
    throw new ConfigurationError("清除密钥的选项无效。");
  }
  if (input.clearUpstreamKey && input.upstreamApiKey) {
    throw new ConfigurationError("请先选择更换密钥或清除密钥。");
  }
  if (input.upstreamApiKey && /[\r\n]/.test(input.upstreamApiKey)) {
    throw new ConfigurationError("上游密钥不能包含换行。");
  }
  return { url, rules: normalizedRules(rules) };
}

export async function saveConfig(env, input) {
  if (!env.DB) {
    throw new ConfigurationError("请先配置 D1 数据库绑定 DB 并执行数据库迁移。", 503, "database_not_configured");
  }
  const { url, rules } = validateInput(input);
  const current = await loadConfig(env);
  if (current.revision !== input.revision) {
    throw new ConfigurationError("配置已在其他页面更新，请重新加载后再保存。", 409, "configuration_conflict");
  }
  const upstreamApiKey = input.clearUpstreamKey ? "" : input.upstreamApiKey || current.upstreamApiKey;
  const aiRewrite = resolveAiRewriteSettings(input.aiRewrite, current.aiRewrite);
  const updatedAt = new Date().toISOString();
  const values = [url, upstreamApiKey, JSON.stringify(rules), updatedAt, JSON.stringify(aiRewrite)];
  const statement = input.revision === 0
    ? env.DB.prepare(
      "INSERT INTO proxy_config (id, upstream_base_url, upstream_api_key, rules_json, revision, updated_at, ai_rewrite_json) VALUES (1, ?1, ?2, ?3, 1, ?4, ?5) ON CONFLICT (id) DO NOTHING RETURNING revision"
    ).bind(...values)
    : env.DB.prepare(
      "UPDATE proxy_config SET upstream_base_url = ?1, upstream_api_key = ?2, rules_json = ?3, updated_at = ?4, ai_rewrite_json = ?5, revision = revision + 1 WHERE id = 1 AND revision = ?6 RETURNING revision"
    ).bind(...values, input.revision);
  const saved = await statement.first();
  if (!saved) {
    throw new ConfigurationError("配置已在其他页面更新，请重新加载后再保存。", 409, "configuration_conflict");
  }
  return { upstreamBaseUrl: url, upstreamApiKey, rules, aiRewrite, revision: saved.revision, updatedAt };
}
