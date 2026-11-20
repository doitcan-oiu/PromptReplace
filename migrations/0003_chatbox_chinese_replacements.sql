-- 将 Chatbox 的记忆与运行时英文说明改写为中文；保留工具名、标签和动态值。
-- 只迁移已知的旧删除规则，已有非空自定义替换、顺序及启用状态保持原值。
WITH RECURSIVE
presets AS (
  SELECT CAST(key AS INTEGER) AS position, json(value) AS rule_json,
         json_extract(value, '$.id') AS rule_id,
         json_extract(value, '$.from') AS source,
         json_extract(value, '$.to') AS replacement
  FROM json_each('[{"id":"chatbox-cn-info-heading","from":"Additional info for this conversation:","to":"本次对话的补充信息：","enabled":true},{"id":"chatbox-cn-memories-heading","from":"## Memories","to":"## 记忆","enabled":true},{"id":"chatbox-cn-memory-guidance","from":"Facts saved from previous conversations via save_memory. Treat them as ground truth unless the user or direct evidence contradicts them — then delete or replace the stale entry.","to":"以下事实通过 save_memory 保存，来自以往对话。除非用户或直接证据与这些事实相矛盾，否则请将其作为可靠依据；发生矛盾时，请删除或替换过时的记录。","enabled":true},{"id":"chatbox-cn-runtime-heading","from":"## Runtime","to":"## 运行时信息","enabled":true},{"id":"chatbox-cn-current-model-label","from":"Current model:","to":"当前模型：","enabled":true},{"id":"chatbox-cn-conversation-start-label","from":"Conversation started:","to":"会话开始时间：","enabled":true},{"id":"chatbox-cn-runtime-guidance","from":"<system-reminder>...</system-reminder> blocks are out-of-band runtime metadata from Chatbox (e.g. the current date and time), not part of the user''s message. Treat their contents as authoritative; do not quote or acknowledge them.","to":"<system-reminder>...</system-reminder> 块是 Chatbox 提供的带外运行时元数据（例如当前日期和时间），不属于用户消息。请将其中内容作为权威依据，不要引用或特意提及这些内容。","enabled":true}]')
),
existing AS (
  SELECT CAST(entry.key AS INTEGER) AS position, json(entry.value) AS rule_json,
         json_extract(entry.value, '$.from') AS source,
         json_extract(entry.value, '$.to') AS replacement,
         replace(trim(json_extract(entry.value, '$.from'), char(13) || char(10) || ' '),
                 char(13) || char(10), char(10)) AS normalized_source
  FROM proxy_config AS config, json_each(config.rules_json) AS entry
  WHERE config.id = 1 AND json_type(config.rules_json) = 'array'
),
legacy_deletions AS (
  SELECT existing.*
  FROM existing
  WHERE replacement = '' AND (
    EXISTS (SELECT 1 FROM presets WHERE presets.source = existing.source)
    OR replace(normalized_source, ': ' || char(10), ':' || char(10)) =
       (SELECT source FROM presets WHERE position = 0) || char(10) ||
       (SELECT source FROM presets WHERE position = 1) || char(10) ||
       (SELECT source FROM presets WHERE position = 2)
    OR (
      normalized_source GLOB
        '## Runtime' || char(10) || 'Current model: *' || char(10) ||
        'Conversation started: *' || char(10) ||
        (SELECT source FROM presets WHERE position = 6)
      AND length(normalized_source) - length(replace(normalized_source, char(10), '')) = 3
    )
  )
),
translated(position, step, replacement) AS (
  SELECT position, 0, source FROM legacy_deletions
  UNION ALL
  SELECT translated.position, translated.step + 1,
         replace(translated.replacement, presets.source, presets.replacement)
  FROM translated JOIN presets ON presets.position = translated.step
),
updated_existing AS (
  SELECT existing.position,
         CASE WHEN translated.position IS NULL THEN existing.rule_json
              ELSE json_set(existing.rule_json, '$.to', translated.replacement)
         END AS rule_json
  FROM existing
  LEFT JOIN translated ON translated.position = existing.position
    AND translated.step = (SELECT count(*) FROM presets)
),
additions AS (
  SELECT (SELECT count(*) FROM existing) + presets.position AS position,
         CASE WHEN EXISTS (
           SELECT 1 FROM existing
           WHERE json_extract(existing.rule_json, '$.id') = presets.rule_id
         ) THEN json_set(presets.rule_json, '$.id',
                         'chatbox-cn-' || lower(hex(randomblob(16))))
           ELSE presets.rule_json END AS rule_json
  FROM presets
  WHERE NOT EXISTS (SELECT 1 FROM existing WHERE existing.source = presets.source)
),
combined AS (
  SELECT position, rule_json FROM updated_existing
  UNION ALL
  SELECT position, rule_json FROM additions
),
rebuilt AS (
  SELECT json_group_array(json(rule_json)) AS rules_json
  FROM (SELECT rule_json FROM combined ORDER BY position)
)
UPDATE proxy_config
SET rules_json = (SELECT rules_json FROM rebuilt),
    revision = revision + 1,
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE id = 1 AND json_type(rules_json) = 'array' AND (
  EXISTS (SELECT 1 FROM legacy_deletions)
  OR EXISTS (SELECT 1 FROM additions)
);
