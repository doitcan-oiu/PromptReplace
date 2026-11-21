import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../src/index.js";
import { recordInterceptions } from "../src/interceptions.js";

const migrationDirectory = new URL("../migrations/", import.meta.url);
const migrations = await Promise.all((await readdir(migrationDirectory))
  .filter(name => name.endsWith(".sql")).sort()
  .map(name => readFile(new URL(name, migrationDirectory), "utf8")));
const origin = "https://proxy.example";
const fixture = {
  upstreamBaseUrl: "https://upstream.example/v1",
  upstreamApiKey: "private-upstream-test-key",
  rules: [],
  revision: 17,
  updatedAt: "2026-11-20T00:00:00.000Z",
};

function environment(t, { rules = [], migrationCount = migrations.length } = {}) {
  const database = new DatabaseSync(":memory:");
  for (const migration of migrations.slice(0, migrationCount)) database.exec(migration);
  database.prepare("UPDATE proxy_config SET upstream_base_url = ?, upstream_api_key = ?, rules_json = ?, revision = ?, updated_at = ? WHERE id = 1")
    .run(fixture.upstreamBaseUrl, fixture.upstreamApiKey, JSON.stringify(rules), fixture.revision, fixture.updatedAt);
  t.after(() => database.close());
  const DB = {
    withSession() { return this; },
    prepare(sql) {
      let parameters = [];
      return {
        bind(...values) { parameters = values; return this; },
        async first(column) {
          const row = database.prepare(sql).get(...parameters) ?? null;
          return column && row ? row[column] : row;
        },
        async all() { return this.execute(); },
        async run() { return this.execute(); },
        execute() {
          const statement = database.prepare(sql);
          if (statement.columns().length) return { success: true, results: statement.all(...parameters) };
          const result = statement.run(...parameters);
          return { success: true, results: [], meta: { changes: Number(result.changes) } };
        },
      };
    },
    async batch(statements) {
      database.exec("BEGIN");
      try {
        const results = statements.map(statement => statement.execute());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
  return { database, env: { DB, ADMIN_PASSWORD: "local-admin-test-password" } };
}

function proxyRequest(body) {
  return new Request(origin + "/v1/chat/completions?trace=exact%20query", {
    method: "POST", headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function adminRequest(path, { method = "GET", cookie, body, requestOrigin = origin, contentType = "application/json" } = {}) {
  const headers = { origin: requestOrigin, "content-type": contentType };
  if (cookie) headers.cookie = cookie;
  return new Request(origin + "/admin/api/" + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function api(env, path, options) {
  return worker.fetch(adminRequest(path, options), env);
}

async function login(env) {
  const response = await api(env, "login", { method: "POST", body: { password: env.ADMIN_PASSWORD } });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

function rows(database) {
  return database.prepare("SELECT * FROM system_interceptions ORDER BY last_seen_at DESC, id").all();
}

function systemPayload(text) {
  return { model: "test-model", messages: [{ role: "system", content: text }] };
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("ten concurrent HTTP 429 requests atomically count one complete system once per request", async t => {
  const { env, database } = environment(t);
  const system = "完整 system：保留换行\n工具使用说明与重复消息。";
  const payload = systemPayload(system);
  payload.messages.push({ role: "system", content: system });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return new Response("provider 429", { status: 429, headers: { "retry-after": "8" } });
  });
  const replies = await Promise.all(Array.from({ length: 10 }, () => worker.fetch(proxyRequest(payload), env)));
  assert.equal(calls, 10);
  assert.deepEqual(replies.map(response => response.status), Array(10).fill(429));
  assert.ok(replies.every(response => response.headers.get("retry-after") === "8"));
  const stored = rows(database);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].hit_count, 10);
  assert.equal(stored[0].forwarded_text, system);
  assert.equal(stored[0].original_text, system);
  assert.equal(stored[0].last_model, "test-model");
  assert.equal(stored[0].last_path, "/v1/chat/completions");
});

test("capture depends on actual HTTP 429, never an SSE error, HTTP 503, or non-system text", async t => {
  const { env, database } = environment(t);
  const cases = [
    { status: 200, body: 'data: {"error":{"code":429}}\n\n', payload: systemPayload("SSE system") },
    { status: 503, body: "unavailable", payload: systemPayload("503 system") },
    { status: 429, body: "rate limit", payload: { messages: [{ role: "user", content: "private user" }], tools: [{ description: "private tool" }] } },
    { status: 429, body: "rate limit", payload: systemPayload(" \n\t") },
  ];
  let index = 0;
  t.mock.method(globalThis, "fetch", async () => {
    const item = cases[index++];
    return new Response(item.body, { status: item.status, headers: { "content-type": "text/event-stream", "retry-after": "4" } });
  });
  for (const item of cases) {
    const response = await worker.fetch(proxyRequest(item.payload), env);
    assert.equal(response.status, item.status);
    assert.equal(await response.text(), item.body);
    assert.equal(response.headers.get("retry-after"), "4");
  }
  assert.equal(rows(database).length, 0);
});

test("literal replacements capture original and actual text parts without recording users or tools or reencoding other bytes", async t => {
  const rules = [{ id: "translate", from: "alpha.*", to: "替换内容", enabled: true }];
  const { env, database } = environment(t, { rules });
  const raw = '{\n "model":"test-model", "n":9007199254740993, "messages":[' +
    '{"content":[{"type":"text","text":"alpha.*\\n"},{"type":"image_url","image_url":"private image"},{"type":"input_text","text":"second"}],"role":"system"},' +
    '{"role":"system","content":"other system"},' +
    '{"role":"user","content":"private user must stay outside records"}],' +
    '"tools":[{"type":"function","function":{"name":"private_tool","description":"private tool must stay outside records"}}]}';
  let forwarded;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    forwarded = await new Response(options.body).text();
    return new Response("rate limit", { status: 429 });
  });
  assert.equal((await worker.fetch(proxyRequest(raw), env)).status, 429);
  assert.equal(forwarded, raw.replace("alpha.*", "替换内容"));
  assert.ok(forwarded.includes("9007199254740993"));
  const stored = rows(database);
  assert.equal(stored.length, 2);
  const changed = stored.find(item => item.original_text.startsWith("alpha.*"));
  assert.equal(changed.original_text, "alpha.*\nsecond");
  assert.equal(changed.forwarded_text, "替换内容\nsecond");
  assert.equal(stored.find(item => item.forwarded_text === "other system").original_text, "other system");
  assert.equal(JSON.stringify(stored).includes("private"), false);
});

test("a nonempty system deleted by a literal rule is captured and deduplicated by its empty forwarded text", async t => {
  const originals = ["first complete system", "second complete system"];
  const rules = originals.map((from, index) => ({ id: "delete-" + index, from, to: "", enabled: true }));
  const { env, database } = environment(t, { rules });
  const forwarded = [];
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    forwarded.push(JSON.parse(await new Response(options.body).text()));
    return new Response("rate limit", { status: 429 });
  });
  const emptyHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  for (const [index, original] of originals.entries()) {
    const payload = systemPayload(original);
    payload.messages.push({ role: "system", content: original });
    assert.equal((await worker.fetch(proxyRequest(payload), env)).status, 429);
    assert.deepEqual(forwarded[index].messages.map(message => message.content), ["", ""]);
    const stored = rows(database);
    assert.equal(stored.length, 1);
    assert.equal(stored[0].id, emptyHash);
    assert.equal(stored[0].original_text, original);
    assert.equal(stored[0].forwarded_text, "");
    assert.equal(stored[0].characters, 0);
    assert.equal(stored[0].original_characters, original.length);
    assert.equal(stored[0].hit_count, index + 1);
  }
});

test("waitUntil allows the upstream response to return while D1 storage remains pending", async t => {
  const { env, database } = environment(t);
  const gate = deferred();
  const started = deferred();
  const batch = env.DB.batch.bind(env.DB);
  env.DB.batch = async statements => { started.resolve(); await gate.promise; return batch(statements); };
  const upstream = new Response("do not buffer", { status: 429, headers: { "retry-after": "9" } });
  t.mock.method(globalThis, "fetch", async () => upstream);
  const pending = [];
  const responsePromise = worker.fetch(proxyRequest(systemPayload("background capture")), env, {
    waitUntil(promise) { pending.push(promise); },
  });
  let timer;
  try {
    await started.promise;
    const response = await Promise.race([
      responsePromise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("response waited for D1")), 500); }),
    ]);
    assert.strictEqual(response, upstream);
    assert.equal(pending.length, 1);
    assert.equal(rows(database).length, 0);
    assert.equal(await response.text(), "do not buffer");
  } finally {
    clearTimeout(timer);
    gate.resolve();
    await Promise.all(pending);
  }
  assert.equal(rows(database).length, 1);
});

test("D1 capture failures leave the provider response intact and log no exception, prompt, or credential", async t => {
  const { env } = environment(t);
  const secret = "database-secret-and-sensitive-prompt";
  env.DB.batch = async () => { throw new Error(secret + fixture.upstreamApiKey); };
  const logs = [];
  t.mock.method(console, "error", (...args) => logs.push(args));
  const upstream = new Response("provider payload", { status: 429, headers: { "retry-after": "12" } });
  t.mock.method(globalThis, "fetch", async () => upstream);
  const response = await worker.fetch(proxyRequest(systemPayload(secret)), env);
  assert.strictEqual(response, upstream);
  assert.equal(await response.text(), "provider payload");
  assert.equal(response.headers.get("retry-after"), "12");
  assert.equal(logs.length, 1);
  assert.equal(logs[0].length, 1);
  assert.equal(typeof logs[0][0], "string");
  assert.equal(JSON.stringify(logs).includes(secret), false);
  assert.equal(JSON.stringify(logs).includes(fixture.upstreamApiKey), false);
});

test("out-of-order retries preserve earliest/latest timestamps, latest metadata and reviewed notes", async t => {
  const { env, database } = environment(t);
  const forwardedText = "same actual system";
  await recordInterceptions(env, [{ originalText: "newest original", forwardedText }], {
    seenAt: "2026-11-22T03:00:00.000Z", model: "latest-model", path: "/latest",
  });
  const id = rows(database)[0].id;
  const cookie = await login(env);
  const updated = await api(env, "interceptions/" + id, { method: "PATCH", cookie, body: { status: "reviewed", note: "confirmed note" } });
  assert.equal(updated.status, 200);
  await recordInterceptions(env, [{ originalText: "old original", forwardedText }], {
    seenAt: "2026-11-22T01:00:00.000Z", model: "old-model", path: "/old",
  });
  await recordInterceptions(env, [{ originalText: "middle original", forwardedText }], {
    seenAt: "2026-11-22T02:00:00.000Z", model: "middle-model", path: "/middle",
  });
  await recordInterceptions(env, [{ originalText: "other", forwardedText: "other" }], { seenAt: "2026-11-22T02:30:00.000Z" });
  const item = await (await api(env, "interceptions/" + id, { cookie })).json();
  assert.equal(item.hitCount, 3);
  assert.equal(item.firstSeenAt, "2026-11-22T01:00:00.000Z");
  assert.equal(item.lastSeenAt, "2026-11-22T03:00:00.000Z");
  assert.equal(item.lastModel, "latest-model");
  assert.equal(item.lastPath, "/latest");
  assert.equal(item.originalText, "newest original");
  assert.equal(item.status, "reviewed");
  assert.equal(item.note, "confirmed note");
  const list = await (await api(env, "interceptions", { cookie })).json();
  assert.equal(list.items[0].id, id);
  assert.deepEqual(list.summary, { unique: 2, hits: 4, pending: 1 });
});

test("Unicode storage truncates on character boundaries below D1 row limits but hashes the complete text", async t => {
  const { env, database } = environment(t);
  const prefix = "🙂汉".repeat(130000);
  const first = prefix + "first suffix";
  const second = prefix + "second suffix";
  await recordInterceptions(env, [
    { originalText: first, forwardedText: first },
    { originalText: second, forwardedText: second },
  ]);
  const stored = rows(database);
  assert.equal(stored.length, 2);
  assert.notEqual(stored[0].id, stored[1].id);
  assert.equal(stored[0].forwarded_text, stored[1].forwarded_text);
  const fullLengths = new Set([Array.from(first).length, Array.from(second).length]);
  for (const item of stored) {
    assert.equal(item.original_truncated, 1);
    assert.equal(item.forwarded_truncated, 1);
    assert.equal(item.forwarded_text.includes("\ufffd"), false);
    assert.equal(item.original_text.includes("\ufffd"), false);
    assert.ok(first.startsWith(item.forwarded_text));
    assert.ok(fullLengths.has(item.characters));
    assert.equal(item.characters, item.original_characters);
    assert.ok(Buffer.byteLength(item.forwarded_text) + Buffer.byteLength(item.original_text) < 2 * 1024 * 1024);
  }
});

test("interceptions API paginates and filters literal text while only details expose full prompt fields", async t => {
  const { env, database } = environment(t);
  await Promise.all(Array.from({ length: 23 }, (_, index) => recordInterceptions(env, [{
    originalText: index === 7 ? "only-in-original" : "original " + index,
    forwardedText: "entry " + index + " " + "long system body ".repeat(20),
  }], { model: index === 8 ? "rare-model" : "test-model", seenAt: `2026-11-22T00:00:${String(index).padStart(2, "0")}.000Z` })));
  const cookie = await login(env);
  const id = rows(database).find(row => row.original_text === "only-in-original").id;
  await api(env, "interceptions/" + id, { method: "PATCH", cookie, body: { status: "reviewed", note: "literal %_ note" } });
  const response = await api(env, "interceptions?page=999&pageSize=10", { cookie });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const list = await response.json();
  assert.equal(list.page, 3);
  assert.equal(list.pageCount, 3);
  assert.equal(list.total, 23);
  assert.equal(list.items.length, 3);
  assert.equal(list.items[0].preview.startsWith("entry 2 "), true);
  assert.deepEqual(list.summary, { unique: 23, hits: 23, pending: 22 });
  for (const item of list.items) {
    assert.equal(Object.hasOwn(item, "originalText"), false);
    assert.equal(Object.hasOwn(item, "forwardedText"), false);
    assert.equal(Array.from(item.preview).length, 200);
  }
  for (const query of ["q=only-in-original", "q=literal%20%25_&status=reviewed", "q=rare-model"]) {
    const result = await (await api(env, "interceptions?" + query, { cookie })).json();
    assert.equal(result.total, 1, query);
    assert.equal(result.summary.unique, 23);
  }
  const empty = await (await api(env, "interceptions?q=only-in-original&status=pending&page=100", { cookie })).json();
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.equal(empty.pageCount, 1);
  assert.deepEqual(empty.items, []);
  const detail = await (await api(env, "interceptions/" + id, { cookie })).json();
  assert.equal(detail.originalText, "only-in-original");
  assert.ok(detail.forwardedText.length > detail.preview.length);
  const cleared = await (await api(env, "interceptions/" + id, { method: "PATCH", cookie, body: { note: "" } })).json();
  assert.equal(cleared.note, "");
  assert.equal(cleared.status, "reviewed");
  const deleted = await api(env, "interceptions/" + id, { method: "DELETE", cookie });
  assert.deepEqual(await deleted.json(), { ok: true });
  assert.equal((await api(env, "interceptions/" + id, { cookie })).status, 404);
  assert.equal((await api(env, "interceptions/" + id, { method: "DELETE", cookie })).status, 404);
  assert.equal(rows(database).length, 22);
});

test("interceptions routes enforce authentication, methods, same-origin mutations and input bounds", async t => {
  const { env, database } = environment(t);
  await recordInterceptions(env, [{ originalText: "system", forwardedText: "system" }]);
  const id = rows(database)[0].id;
  for (const [path, method] of [["interceptions", "GET"], ["interceptions/" + id, "GET"], ["interceptions/" + id, "PATCH"], ["interceptions/" + id, "DELETE"]]) {
    assert.equal((await api(env, path, { method, body: method === "PATCH" ? { note: "unauthorized" } : undefined })).status, 401);
  }
  const cookie = await login(env);
  const method = await api(env, "interceptions/" + id, { method: "PUT", cookie, body: {} });
  assert.equal(method.status, 405);
  assert.equal(method.headers.get("allow"), "GET, PATCH, DELETE");
  assert.equal((await api(env, "interceptions", { method: "POST", cookie, body: {} })).status, 405);
  for (const method of ["PATCH", "DELETE"]) {
    assert.equal((await api(env, "interceptions/" + id, { method, cookie, body: method === "PATCH" ? { note: "cross-origin" } : undefined, requestOrigin: "https://other.example" })).status, 403);
  }
  for (const query of ["page=0", "page=1.5", "page=9007199254740992", "pageSize=11", "status=unknown", "q=" + "🙂".repeat(501)]) {
    const response = await api(env, "interceptions?" + query, { cookie });
    assert.equal(response.status, 400, query.slice(0, 60));
    assert.equal((await response.json()).error.code, "invalid_interception_query");
  }
  for (const body of [{}, [], { extra: true }, { status: "unknown" }, { note: 1 }, { note: "🙂".repeat(2001) }]) {
    assert.equal((await api(env, "interceptions/" + id, { method: "PATCH", cookie, body })).status, 400);
  }
  assert.equal((await api(env, "interceptions/" + id, { method: "PATCH", cookie, body: { note: "valid" }, contentType: "text/plain" })).status, 415);
  assert.equal((await api(env, "interceptions/not-a-hash", { cookie })).status, 400);
  assert.equal((await api(env, "interceptions/" + "a".repeat(64), { method: "PATCH", cookie, body: { note: "missing" } })).status, 404);
  assert.equal(rows(database)[0].note, "");
  assert.equal(rows(database)[0].hit_count, 1);
});

test("the interception migration preserves existing upstream configuration and replacement rules", async t => {
  const rules = [{ id: "existing-rule", from: "original", to: "replacement", enabled: false }];
  const { env, database } = environment(t, { rules, migrationCount: migrations.length - 1 });
  const before = database.prepare("SELECT * FROM proxy_config WHERE id = 1").get();
  database.exec(migrations.at(-1));
  database.exec(migrations.at(-1));
  assert.deepEqual(database.prepare("SELECT * FROM proxy_config WHERE id = 1").get(), before);
  assert.deepEqual(rows(database), []);
  const cookie = await login(env);
  const config = await (await api(env, "config", { cookie })).json();
  assert.equal(config.upstreamBaseUrl, fixture.upstreamBaseUrl);
  assert.equal(config.hasUpstreamKey, true);
  assert.equal(config.revision, fixture.revision);
  assert.deepEqual(config.rules, rules);
});
