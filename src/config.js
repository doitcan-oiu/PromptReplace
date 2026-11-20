import { readRules, upstreamUrl } from "./proxy.js";

export class ConfigurationError extends Error {
  constructor(message, status = 400, code = "invalid_configuration") {
    super(message);
    this.status = status;
    this.code = code;
  }
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
    "SELECT upstream_base_url, upstream_api_key, rules_json, revision, updated_at FROM proxy_config WHERE id = 1"
  ).first();
  if (row) {
    return {
      upstreamBaseUrl: row.upstream_base_url,
      upstreamApiKey: row.upstream_api_key,
      rules: normalizedRules(JSON.parse(row.rules_json)),
      revision: row.revision,
      updatedAt: row.updated_at,
    };
  }
  return {
    upstreamBaseUrl: "",
    upstreamApiKey: "",
    rules: [],
    revision: 0,
    updatedAt: null,
  };
}

export function publicConfig(config) {
  return {
    upstreamBaseUrl: config.upstreamBaseUrl,
    hasUpstreamKey: Boolean(config.upstreamApiKey),
    rules: config.rules,
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
  const updatedAt = new Date().toISOString();
  const values = [url, upstreamApiKey, JSON.stringify(rules), updatedAt];
  const statement = input.revision === 0
    ? env.DB.prepare(
      "INSERT INTO proxy_config (id, upstream_base_url, upstream_api_key, rules_json, revision, updated_at) VALUES (1, ?1, ?2, ?3, 1, ?4) ON CONFLICT (id) DO NOTHING RETURNING revision"
    ).bind(...values)
    : env.DB.prepare(
      "UPDATE proxy_config SET upstream_base_url = ?1, upstream_api_key = ?2, rules_json = ?3, updated_at = ?4, revision = revision + 1 WHERE id = 1 AND revision = ?5 RETURNING revision"
    ).bind(...values, input.revision);
  const saved = await statement.first();
  if (!saved) {
    throw new ConfigurationError("配置已在其他页面更新，请重新加载后再保存。", 409, "configuration_conflict");
  }
  return { upstreamBaseUrl: url, upstreamApiKey, rules, revision: saved.revision, updatedAt };
}
