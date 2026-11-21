const MAX_TEXT_BYTES = 850 * 1024;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class InterceptionError extends Error {
  constructor(message, status = 400, code = "invalid_interception") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function systemText(message) {
  if (message?.role !== "system") return null;
  if (typeof message.content === "string") return message.content;
  if (!Array.isArray(message.content)) return null;
  const parts = message.content.filter(part =>
    part && ["text", "input_text"].includes(part.type) && typeof part.text === "string");
  return parts.length ? parts.map(part => part.text).join("") : null;
}

export function collectSystemInterceptions(originalPayload, forwardedPayload) {
  if (!Array.isArray(originalPayload?.messages) || !Array.isArray(forwardedPayload?.messages)) return [];
  const records = new Map();
  for (let index = 0; index < forwardedPayload.messages.length; index++) {
    const originalText = systemText(originalPayload.messages[index]);
    const forwardedText = systemText(forwardedPayload.messages[index]);
    // Correlate the same original system message; never capture a user role renamed by a rule.
    if (originalText === null || forwardedText === null || (!originalText.trim() && !forwardedText.trim())) continue;
    records.set(forwardedText, { originalText, forwardedText });
  }
  return [...records.values()];
}

function characterCount(text) {
  let count = 0;
  for (const character of text) count++;
  return count;
}

function boundedText(text) {
  const bytes = encoder.encode(text);
  if (bytes.length <= MAX_TEXT_BYTES) return { text, truncated: false };
  let end = MAX_TEXT_BYTES;
  // The next byte begins a new code point; exclude any code point crossing the cap.
  while ((bytes[end] & 0xc0) === 0x80) end--;
  return { text: decoder.decode(bytes.subarray(0, end)), truncated: true };
}

function limitedMetadata(value, limit) {
  return typeof value === "string" ? [...value].slice(0, limit).join("") : "";
}

const UPSERT = `INSERT INTO system_interceptions (
  id, forwarded_text, original_text, forwarded_truncated, original_truncated,
  characters, original_characters, hit_count, first_seen_at, last_seen_at, last_model, last_path
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, ?8, ?8, ?9, ?10)
ON CONFLICT (id) DO UPDATE SET
  hit_count = system_interceptions.hit_count + 1,
  first_seen_at = min(system_interceptions.first_seen_at, excluded.first_seen_at),
  last_seen_at = max(system_interceptions.last_seen_at, excluded.last_seen_at),
  forwarded_text = CASE WHEN excluded.last_seen_at >= system_interceptions.last_seen_at THEN excluded.forwarded_text ELSE system_interceptions.forwarded_text END,
  original_text = CASE WHEN excluded.last_seen_at >= system_interceptions.last_seen_at THEN excluded.original_text ELSE system_interceptions.original_text END,
  forwarded_truncated = CASE WHEN excluded.last_seen_at >= system_interceptions.last_seen_at THEN excluded.forwarded_truncated ELSE system_interceptions.forwarded_truncated END,
  original_truncated = CASE WHEN excluded.last_seen_at >= system_interceptions.last_seen_at THEN excluded.original_truncated ELSE system_interceptions.original_truncated END,
  characters = CASE WHEN excluded.last_seen_at >= system_interceptions.last_seen_at THEN excluded.characters ELSE system_interceptions.characters END,
  original_characters = CASE WHEN excluded.last_seen_at >= system_interceptions.last_seen_at THEN excluded.original_characters ELSE system_interceptions.original_characters END,
  last_model = CASE WHEN excluded.last_seen_at >= system_interceptions.last_seen_at THEN excluded.last_model ELSE system_interceptions.last_model END,
  last_path = CASE WHEN excluded.last_seen_at >= system_interceptions.last_seen_at THEN excluded.last_path ELSE system_interceptions.last_path END`;

export async function recordInterceptions(env, records, { model = "", path = "", seenAt = new Date().toISOString() } = {}) {
  if (!env.DB || !records.length) return;
  const unique = new Map(records.map(record => [record.forwardedText, record]));
  const db = database(env);
  const statements = [];
  // Bound parameters and each row's two text values remain below D1's row-size limit.
  for (const { originalText, forwardedText } of unique.values()) {
    const digest = await crypto.subtle.digest("SHA-256", encoder.encode(forwardedText));
    const id = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
    const forwarded = boundedText(forwardedText);
    const original = boundedText(originalText);
    statements.push(db.prepare(UPSERT).bind(
      id, forwarded.text, original.text, Number(forwarded.truncated), Number(original.truncated),
      characterCount(forwardedText), characterCount(originalText), seenAt,
      limitedMetadata(model, 512), limitedMetadata(path, 2048),
    ));
  }
  if (typeof db.batch === "function") await db.batch(statements);
  else for (const statement of statements) await statement.run();
}

function database(env) {
  return typeof env.DB.withSession === "function" ? env.DB.withSession("first-primary") : env.DB;
}

const ITEM_COLUMNS = `id, substr(forwarded_text, 1, 200) AS preview, hit_count, first_seen_at,
  last_seen_at, last_model, last_path, status, note, characters, original_characters,
  forwarded_truncated, original_truncated`;

function publicItem(row, detail = false) {
  const item = {
    id: row.id, preview: row.preview, hitCount: row.hit_count,
    firstSeenAt: row.first_seen_at, lastSeenAt: row.last_seen_at,
    lastModel: row.last_model, lastPath: row.last_path, status: row.status, note: row.note,
    characters: row.characters, originalCharacters: row.original_characters,
    forwardedTruncated: Boolean(row.forwarded_truncated), originalTruncated: Boolean(row.original_truncated),
  };
  return detail ? { ...item, originalText: row.original_text, forwardedText: row.forwarded_text } : item;
}

function validId(id) {
  if (!/^[a-f0-9]{64}$/.test(id)) throw new InterceptionError("记录编号无效。");
}

function pagination(url) {
  const pageValue = url.searchParams.get("page") ?? "1";
  const sizeValue = url.searchParams.get("pageSize") ?? "10";
  const page = Number(pageValue);
  const pageSize = Number(sizeValue);
  const status = url.searchParams.get("status") ?? "all";
  const q = url.searchParams.get("q") ?? "";
  if (!/^[1-9]\d*$/.test(pageValue) || !Number.isSafeInteger(page) || !Number.isSafeInteger((page - 1) * pageSize) ||
    !["10", "20", "50"].includes(sizeValue) || !["all", "pending", "reviewed"].includes(status) || characterCount(q) > 500) {
    throw new InterceptionError("分页、状态或搜索条件无效。", 400, "invalid_interception_query");
  }
  return { page, pageSize, status, q };
}

export async function listInterceptions(env, url) {
  const { page, pageSize, status, q } = pagination(url);
  const db = database(env);
  const filter = `WHERE (?1 = 'all' OR status = ?1) AND (?2 = '' OR
    instr(forwarded_text, ?2) > 0 OR instr(original_text, ?2) > 0 OR instr(last_model, ?2) > 0 OR instr(note, ?2) > 0)`;
  const rowQuery = `SELECT ${ITEM_COLUMNS} FROM system_interceptions ${filter} ORDER BY last_seen_at DESC, id LIMIT ?3 OFFSET ?4`;
  const statements = [
    db.prepare(`SELECT COUNT(*) AS total FROM system_interceptions ${filter}`).bind(status, q),
    db.prepare(rowQuery).bind(status, q, pageSize, (page - 1) * pageSize),
    db.prepare("SELECT COUNT(*) AS unique_count, COALESCE(SUM(hit_count), 0) AS hits, COALESCE(SUM(status = 'pending'), 0) AS pending FROM system_interceptions"),
  ];
  let total, rows, summary;
  if (typeof db.batch === "function") {
    const results = await db.batch(statements);
    total = results[0].results[0].total;
    rows = results[1].results;
    summary = results[2].results[0];
  } else {
    total = (await statements[0].first()).total;
    rows = (await statements[1].all()).results;
    summary = await statements[2].first();
  }
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const actualPage = Math.min(page, pageCount);
  if (actualPage !== page) {
    rows = (await db.prepare(rowQuery).bind(status, q, pageSize, (actualPage - 1) * pageSize).all()).results;
  }
  return {
    items: rows.map(row => publicItem(row)), total, page: actualPage, pageSize, pageCount,
    summary: { unique: summary.unique_count, hits: summary.hits, pending: summary.pending },
  };
}

async function detail(db, id) {
  const row = await db.prepare(`SELECT ${ITEM_COLUMNS}, original_text, forwarded_text FROM system_interceptions WHERE id = ?1`).bind(id).first();
  if (!row) throw new InterceptionError("记录不存在或已删除。", 404, "interception_not_found");
  return publicItem(row, true);
}

export async function getInterception(env, id) {
  validId(id);
  return detail(database(env), id);
}

export async function updateInterception(env, id, input) {
  validId(id);
  if (!input || typeof input !== "object" || Array.isArray(input) ||
    !Object.keys(input).length || Object.keys(input).some(key => !["status", "note"].includes(key)) ||
    input.status !== undefined && !["pending", "reviewed"].includes(input.status) ||
    input.note !== undefined && (typeof input.note !== "string" || characterCount(input.note) > 2000)) {
    throw new InterceptionError("请提交待排查或已排查状态，备注最多 2000 个字符。");
  }
  const db = database(env);
  const row = await db.prepare(`UPDATE system_interceptions SET status = COALESCE(?1, status), note = COALESCE(?2, note) WHERE id = ?3 RETURNING ${ITEM_COLUMNS}, original_text, forwarded_text`)
    .bind(input.status ?? null, input.note ?? null, id).first();
  if (!row) throw new InterceptionError("记录不存在或已删除。", 404, "interception_not_found");
  return publicItem(row, true);
}

export async function deleteInterception(env, id) {
  validId(id);
  const row = await database(env).prepare("DELETE FROM system_interceptions WHERE id = ?1 RETURNING id").bind(id).first();
  if (!row) throw new InterceptionError("记录不存在或已删除。", 404, "interception_not_found");
  return { ok: true };
}
