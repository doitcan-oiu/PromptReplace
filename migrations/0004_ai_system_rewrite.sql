-- 默认关闭 AI 重写；接口、密钥和模型由管理页配置。
ALTER TABLE proxy_config ADD COLUMN ai_rewrite_json TEXT NOT NULL
  DEFAULT '{"enabled":false,"baseUrl":"","model":"","apiKey":"","timeoutSeconds":90,"cacheEnabled":true,"cacheTtlHours":24}'
  CHECK (json_valid(ai_rewrite_json));

-- 仅缓存带占位符的改写模板，动态值在每次请求中还原。
CREATE TABLE IF NOT EXISTS system_rewrite_cache (
  cache_key TEXT PRIMARY KEY,
  rewritten_template TEXT,
  expires_at INTEGER NOT NULL DEFAULT 0,
  lease_owner TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS system_rewrite_cache_expires_at
  ON system_rewrite_cache (expires_at);
