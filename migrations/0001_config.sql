CREATE TABLE IF NOT EXISTS proxy_config (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  upstream_base_url TEXT NOT NULL,
  upstream_api_key TEXT NOT NULL DEFAULT '',
  rules_json TEXT NOT NULL CHECK (json_valid(rules_json)),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at TEXT NOT NULL
);
