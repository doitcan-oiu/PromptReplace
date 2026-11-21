-- 保留 0004 迁移历史；原有上游、密钥、规则和版本均不变。
DROP TABLE IF EXISTS system_rewrite_cache;
ALTER TABLE proxy_config DROP COLUMN ai_rewrite_json;
