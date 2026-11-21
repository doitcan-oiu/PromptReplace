CREATE TABLE IF NOT EXISTS system_interceptions (
  id TEXT PRIMARY KEY CHECK (length(id) = 64),
  forwarded_text TEXT NOT NULL,
  original_text TEXT NOT NULL,
  forwarded_truncated INTEGER NOT NULL DEFAULT 0 CHECK (forwarded_truncated IN (0, 1)),
  original_truncated INTEGER NOT NULL DEFAULT 0 CHECK (original_truncated IN (0, 1)),
  characters INTEGER NOT NULL CHECK (characters >= 0),
  original_characters INTEGER NOT NULL CHECK (original_characters >= 0),
  hit_count INTEGER NOT NULL DEFAULT 1 CHECK (hit_count > 0),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  last_model TEXT NOT NULL DEFAULT '',
  last_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed')),
  note TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS system_interceptions_last_seen
  ON system_interceptions (last_seen_at DESC, id);
CREATE INDEX IF NOT EXISTS system_interceptions_status_last_seen
  ON system_interceptions (status, last_seen_at DESC, id);
