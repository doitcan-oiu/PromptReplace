-- 首次安装的默认配置；已有网页配置会继续保留。
INSERT OR IGNORE INTO proxy_config (id, upstream_base_url, upstream_api_key, rules_json, revision, updated_at)
VALUES (1, 'http://104.168.101.204:8045/v1', '', '[{"from":"Use a skill when the task matches its description:","to":"当任务与某项技能的描述相符时，请使用该技能：","id":"default-1","enabled":true},{"from":"Kelivo supports native interactive calculators","to":"Kelivo 支持原生交互式计算器","id":"default-2","enabled":true}]', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
