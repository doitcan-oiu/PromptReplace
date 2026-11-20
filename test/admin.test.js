import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import worker from "../src/index.js";
import { loadConfig } from "../src/config.js";

const migrations = await Promise.all(["0001_config.sql", "0002_initial_config.sql", "0003_chatbox_chinese_replacements.sql"].map(name =>
  readFile(new URL("../migrations/" + name, import.meta.url), "utf8")));
const chatboxRules = JSON.parse(await readFile(new URL("../presets/chatbox-chinese.json", import.meta.url), "utf8"));
const translateChatbox = text => chatboxRules.reduce((value, rule) => value.split(rule.from).join(rule.to), text);
const origin = "https://proxy.example";
const fixture = {
  upstreamBaseUrl: "https://upstream.example/v1",
  upstreamApiKey: "server-only-test-key",
  rules: [{ id: "default-1", from: "alpha", to: "initial", enabled: true }],
  revision: 1,
  updatedAt: "2026-11-20T00:00:00.000Z",
};

function environment(t, overrides = {}, { useFixture = true } = {}) {
  const database = new DatabaseSync(":memory:");
  for (const migration of migrations) database.exec(migration);
  if (useFixture) {
    database.prepare("UPDATE proxy_config SET upstream_base_url = ?, upstream_api_key = ?, rules_json = ?, revision = ?, updated_at = ? WHERE id = 1")
      .run(fixture.upstreamBaseUrl, fixture.upstreamApiKey, JSON.stringify(fixture.rules), fixture.revision, fixture.updatedAt);
  }
  t.after(() => database.close());
  const DB = {
    async exec(sql) { database.exec(sql); },
    prepare(sql) {
      let parameters = [];
      return {
        bind(...values) { parameters = values; return this; },
        async first() { return database.prepare(sql).get(...parameters) ?? null; },
        async run() { return database.prepare(sql).run(...parameters); },
      };
    },
  };
  return {
    DB,
    ADMIN_PASSWORD: "local-admin-test-password",
    ...overrides,
  };
}

function request(path, options = {}) {
  const { method = "GET", body, cookie, requestOrigin = origin, contentType = "application/json" } = options;
  const headers = { origin: requestOrigin, "content-type": contentType };
  if (cookie) headers.cookie = cookie;
  return new Request(origin + "/admin/api/" + path, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function call(env, path, options) {
  return worker.fetch(request(path, options), env);
}

async function login(env) {
  const response = await call(env, "login", { method: "POST", body: { password: env.ADMIN_PASSWORD } });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";", 1)[0];
}

function changes(config, overrides = {}) {
  return {
    revision: config.revision,
    upstreamBaseUrl: config.upstreamBaseUrl,
    rules: config.rules,
    ...overrides,
  };
}

test("admin login issues a private signed session and rejects wrong, altered and expired sessions", async t => {
  const env = environment(t);
  const wrong = await call(env, "login", { method: "POST", body: { password: "wrong" } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.headers.has("set-cookie"), false);

  const response = await call(env, "login", { method: "POST", body: { password: env.ADMIN_PASSWORD } });
  const header = response.headers.get("set-cookie");
  for (const part of ["Path=/admin", "HttpOnly", "SameSite=Strict", "Max-Age=28800", "Secure"]) assert.ok(header.includes(part), part);
  const cookie = header.split(";", 1)[0];
  const session = await call(env, "session", { cookie });
  assert.deepEqual(await session.json(), { authenticated: true, configured: true });
  const [nameAndPayload, signature] = cookie.split(".");
  const altered = nameAndPayload + "." + (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  assert.equal((await (await call(env, "session", { cookie: altered })).json()).authenticated, false);

  const now = Date.now();
  t.mock.method(Date, "now", () => now + 9 * 60 * 60 * 1000);
  assert.equal((await (await call(env, "session", { cookie })).json()).authenticated, false);
});

test("config requires authentication and exposes D1 settings without exposing the upstream key", async t => {
  const env = environment(t);
  const denied = await call(env, "config");
  assert.equal(denied.status, 401);
  assert.equal((await denied.text()).includes(fixture.upstreamApiKey), false);

  const cookie = await login(env);
  const response = await call(env, "config", { cookie });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const config = await response.json();
  assert.equal(config.revision, 1);
  assert.equal(config.upstreamBaseUrl, fixture.upstreamBaseUrl);
  assert.equal(config.hasUpstreamKey, true);
  assert.equal(config.upstreamApiKey, undefined);
  assert.deepEqual(config.rules, [{ id: "default-1", from: "alpha", to: "initial", enabled: true }]);
});

test("D1 saves persist settings, preserve an omitted key and support replacing then clearing it", async t => {
  const env = environment(t);
  const cookie = await login(env);
  const initial = await loadConfig(env);
  let response = await call(env, "config", {
    method: "PUT", cookie,
    body: changes(initial, { upstreamBaseUrl: "https://new-upstream.example/v1" }),
  });
  assert.equal(response.status, 200);
  let saved = await response.json();
  assert.equal(saved.revision, 2);
  assert.equal(saved.hasUpstreamKey, true);
  assert.equal((await loadConfig(env)).upstreamApiKey, "server-only-test-key");
  assert.equal((await loadConfig(env)).upstreamBaseUrl, "https://new-upstream.example/v1");

  response = await call(env, "config", { method: "PUT", cookie, body: changes(saved, { upstreamApiKey: "replacement-test-key" }) });
  saved = await response.json();
  assert.equal(saved.revision, 3);
  assert.equal(saved.upstreamApiKey, undefined);
  assert.equal((await loadConfig(env)).upstreamApiKey, "replacement-test-key");

  response = await call(env, "config", { method: "PUT", cookie, body: changes(saved, { clearUpstreamKey: true }) });
  saved = await response.json();
  assert.equal(saved.revision, 4);
  assert.equal(saved.hasUpstreamKey, false);
  assert.equal((await loadConfig(env)).upstreamApiKey, "");
  assert.equal((await (await call(env, "config", { cookie })).json()).hasUpstreamKey, false);
});

test("competing saves use optimistic revisions and a stale save leaves the winner intact", async t => {
  const env = environment(t);
  const cookie = await login(env);
  const initial = await loadConfig(env);
  const replies = await Promise.all([
    call(env, "config", { method: "PUT", cookie, body: changes(initial, { upstreamBaseUrl: "https://first.example/v1" }) }),
    call(env, "config", { method: "PUT", cookie, body: changes(initial, { upstreamBaseUrl: "https://second.example/v1" }) }),
  ]);
  assert.deepEqual(replies.map(reply => reply.status).sort(), [200, 409]);
  const winner = await replies.find(reply => reply.status === 200).json();
  const stale = await call(env, "config", { method: "PUT", cookie, body: changes(initial) });
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, "configuration_conflict");
  const actual = await loadConfig(env);
  assert.equal(actual.revision, 2);
  assert.equal(actual.upstreamBaseUrl, winner.upstreamBaseUrl);
});

test("invalid rules and key changes are rejected before storing a config", async t => {
  const env = environment(t);
  const cookie = await login(env);
  const initial = await loadConfig(env);
  const invalid = [
    { rules: [{ id: "same", from: "a", to: "b", enabled: true }, { id: "same", from: "b", to: "c", enabled: true }] },
    { rules: [{ id: "one", from: "a", to: "b" }] },
    { rules: [{ id: "one", from: "", to: "b", enabled: true }] },
    { upstreamBaseUrl: "https://user:pass@upstream.example" },
    { clearUpstreamKey: true, upstreamApiKey: "conflicting-key" },
  ];
  for (const overrides of invalid) {
    const response = await call(env, "config", { method: "PUT", cookie, body: changes(initial, overrides) });
    assert.equal(response.status, 400);
    assert.equal((await loadConfig(env)).revision, 1);
  }
});

test("admin writes reject another origin and require JSON", async t => {
  const env = environment(t);
  const cookie = await login(env);
  for (const path of ["login", "config", "logout"]) {
    const response = await call(env, path, { method: path === "config" ? "PUT" : "POST", cookie,
      body: path === "login" ? { password: env.ADMIN_PASSWORD } : {}, requestOrigin: "https://other.example" });
    assert.equal(response.status, 403);
  }
  const unsupported = await call(env, "login", { method: "POST", body: { password: env.ADMIN_PASSWORD }, contentType: "text/plain" });
  assert.equal(unsupported.status, 415);
  const malformed = await worker.fetch(new Request(origin + "/admin/api/login", {
    method: "POST", headers: { "content-type": "application/json" }, body: "{",
  }), env);
  assert.equal(malformed.status, 400);
});

test("proxy immediately uses persisted D1 rules and skips disabled rules", async t => {
  const env = environment(t);
  const cookie = await login(env);
  const initial = await loadConfig(env);
  const rules = [{ id: "first", from: "alpha", to: "beta", enabled: true }, { id: "second", from: "beta", to: "gamma", enabled: false }];
  const saved = await call(env, "config", { method: "PUT", cookie,
    body: changes(initial, { rules, upstreamBaseUrl: "https://d1-upstream.example/v1", upstreamApiKey: "d1-only-test-key" }) });
  assert.equal(saved.status, 200);
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: String(url), headers: options.headers, body: await new Response(options.body).text() });
    return new Response("upstream");
  });
  const proxyRequest = () => new Request(origin + "/v1/chat/completions?trace=one", {
    method: "POST", headers: { "content-type": "application/json" }, body: '{"content":"alpha"}',
  });
  assert.equal((await worker.fetch(proxyRequest(), env)).status, 200);
  assert.equal(calls[0].url, "https://d1-upstream.example/v1/chat/completions?trace=one");
  assert.equal(calls[0].headers.get("authorization"), "Bearer d1-only-test-key");
  assert.equal(calls[0].body, '{"content":"beta"}');

  const current = await loadConfig(env);
  rules[1].enabled = true;
  assert.equal((await call(env, "config", { method: "PUT", cookie, body: changes(current, { rules }) })).status, 200);
  await worker.fetch(proxyRequest(), env);
  assert.equal(calls[1].body, '{"content":"gamma"}');
});

test("setup state is explicit and logout clears the admin cookie", async t => {
  const env = environment(t);
  const missingPassword = { ...env, ADMIN_PASSWORD: undefined };
  assert.deepEqual(await (await call(missingPassword, "session")).json(), { authenticated: false, configured: false });
  assert.equal((await call(missingPassword, "login", { method: "POST", body: { password: "anything" } })).status, 503);
  const cookie = await login(env);
  assert.equal((await call({ ...env, DB: undefined }, "config", { cookie })).status, 503);
  const logout = await call(env, "logout", { method: "POST", cookie });
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie"), /Max-Age=0/);
  const changedPassword = { ...env, ADMIN_PASSWORD: "changed-admin-password" };
  assert.equal((await (await call(changedPassword, "session", { cookie })).json()).authenticated, false);
});

test("fresh D1 migrations seed the original and Chatbox Chinese rules without an upstream key", async t => {
  const env = environment(t, {}, { useFixture: false });
  const config = await loadConfig(env);
  assert.equal(config.upstreamBaseUrl, "http://104.168.101.204:8045/v1");
  assert.equal(config.upstreamApiKey, "");
  assert.equal(config.revision, 2);
  assert.ok(Number.isFinite(Date.parse(config.updatedAt)));
  assert.deepEqual(config.rules, [
    { id: "default-1", from: "Use a skill when the task matches its description:", to: "当任务与某项技能的描述相符时，请使用该技能：", enabled: true },
    { id: "default-2", from: "Kelivo supports native interactive calculators", to: "Kelivo 支持原生交互式计算器", enabled: true },
    ...chatboxRules,
  ]);
});

test("Chatbox migration translates known deletion rules and appends missing presets without disturbing saved settings", async t => {
  const env = environment(t);
  const memory = `${chatboxRules[0].from} \r\n${chatboxRules[1].from}\r\n${chatboxRules[2].from}\r\n`;
  const runtime = `${chatboxRules[3].from}\r\n${chatboxRules[4].from} model-with-dashes-99\r\n${chatboxRules[5].from} 2031-02-03 04:05 (UTC-05:00)\r\n${chatboxRules[6].from}\r\n`;
  const rules = [
    { id: "custom-first", from: "custom source", to: "custom replacement", enabled: false, note: "preserve unknown properties" },
    { id: "existing-empty", from: chatboxRules[0].from, to: "", enabled: false },
    { id: "custom-heading", from: chatboxRules[1].from, to: "用户自定义标题", enabled: false },
    { id: chatboxRules[2].id, from: "unrelated source with a colliding ID", to: "keep this", enabled: true },
    { id: "legacy-memory-delete", from: memory, to: "", enabled: false },
    { id: "legacy-runtime-delete", from: runtime, to: "", enabled: true },
    { id: "custom-deletion", from: "## Runtime\nCustom instructions", to: "", enabled: true },
  ];
  await env.DB.prepare("UPDATE proxy_config SET upstream_base_url = ?, upstream_api_key = ?, rules_json = ?, revision = ?, updated_at = ? WHERE id = 1")
    .bind("https://saved.example/custom/v1", "preserved-test-key", JSON.stringify(rules), 8, "2026-11-20T00:00:00.000Z").run();
  const before = await env.DB.prepare("SELECT * FROM proxy_config WHERE id = 1").first();

  await env.DB.exec(migrations[2]);
  const after = await env.DB.prepare("SELECT * FROM proxy_config WHERE id = 1").first();
  const actual = JSON.parse(after.rules_json);
  assert.equal(after.upstream_base_url, before.upstream_base_url);
  assert.equal(after.upstream_api_key, before.upstream_api_key);
  assert.equal(after.revision, 9);
  assert.notEqual(after.updated_at, before.updated_at);
  assert.ok(Number.isFinite(Date.parse(after.updated_at)));
  assert.deepEqual(actual.slice(0, rules.length), rules.map((rule, index) => [1, 4, 5].includes(index)
    ? { ...rule, to: translateChatbox(rule.from) }
    : rule));
  assert.ok(actual[5].to.includes("model-with-dashes-99"));
  assert.ok(actual[5].to.includes("2031-02-03 04:05 (UTC-05:00)"));
  assert.ok(actual[5].to.includes("<system-reminder>...</system-reminder>"));
  assert.ok(actual[5].to.includes("\r\n"));
  assert.ok(actual[4].to.includes("save_memory"));

  const missing = chatboxRules.filter(preset => !rules.some(rule => rule.from === preset.from));
  assert.equal(actual.length, rules.length + missing.length);
  assert.deepEqual(actual.slice(rules.length).map(rule => rule.from), missing.map(rule => rule.from));
  for (const preset of missing) {
    const inserted = actual.find(rule => rule.from === preset.from);
    assert.equal(inserted.to, preset.to);
    assert.equal(inserted.enabled, true);
    assert.equal(typeof inserted.id, "string");
  }
  assert.notEqual(actual.find(rule => rule.from === chatboxRules[2].from).id, chatboxRules[2].id);
  assert.equal(new Set(actual.map(rule => rule.id)).size, actual.length);

  await env.DB.exec(migrations[2]);
  assert.deepEqual(await env.DB.prepare("SELECT * FROM proxy_config WHERE id = 1").first(), after);
});

test("Chatbox migration preserves duplicate custom matches, translates empty ones, and appends to an empty rules array", async t => {
  const env = environment(t);
  const rules = [
    { id: "first-copy", from: chatboxRules[0].from, to: "第一份自定义", enabled: true },
    { id: "empty-copy", from: chatboxRules[0].from, to: "", enabled: false },
    { id: "last-copy", from: chatboxRules[0].from, to: "最后一份自定义", enabled: false },
  ];
  await env.DB.prepare("UPDATE proxy_config SET rules_json = ? WHERE id = 1").bind(JSON.stringify(rules)).run();
  await env.DB.exec(migrations[2]);
  const config = await loadConfig(env);
  assert.deepEqual(config.rules.slice(0, 3), [rules[0], { ...rules[1], to: chatboxRules[0].to }, rules[2]]);
  assert.equal(config.rules.filter(rule => rule.from === chatboxRules[0].from).length, 3);
  assert.equal(config.rules.length, 3 + chatboxRules.length - 1);

  await env.DB.prepare("UPDATE proxy_config SET rules_json = '[]' WHERE id = 1").run();
  await env.DB.exec(migrations[2]);
  assert.deepEqual((await loadConfig(env)).rules, chatboxRules);
  const complete = await env.DB.prepare("SELECT * FROM proxy_config WHERE id = 1").first();
  await env.DB.exec(migrations[2]);
  assert.deepEqual(await env.DB.prepare("SELECT * FROM proxy_config WHERE id = 1").first(), complete);

  await env.DB.prepare("UPDATE proxy_config SET rules_json = '{}' WHERE id = 1").run();
  const nonArray = await env.DB.prepare("SELECT * FROM proxy_config WHERE id = 1").first();
  await env.DB.exec(migrations[2]);
  assert.deepEqual(await env.DB.prepare("SELECT * FROM proxy_config WHERE id = 1").first(), nonArray);
});

test("Chatbox migration advances revisions so a stale page cannot overwrite the imported rules", async t => {
  const env = environment(t);
  const cookie = await login(env);
  const stale = await (await call(env, "config", { cookie })).json();
  await env.DB.exec(migrations[2]);
  const migrated = await loadConfig(env);
  assert.equal(migrated.revision, stale.revision + 1);
  const response = await call(env, "config", { method: "PUT", cookie, body: changes(stale) });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error.code, "configuration_conflict");
  assert.deepEqual(await loadConfig(env), migrated);
});

test("reapplying the seed migration preserves every field of saved D1 configuration", async t => {
  const env = environment(t);
  const cookie = await login(env);
  const response = await call(env, "config", { method: "PUT", cookie, body: changes(await loadConfig(env), {
    upstreamBaseUrl: "https://saved.example/custom/v1",
    upstreamApiKey: "saved-test-key",
    rules: [{ id: "saved-rule", from: "saved source", to: "saved destination", enabled: false }],
  }) });
  assert.equal(response.status, 200);
  const saved = await loadConfig(env);
  assert.equal(saved.revision, 2);
  const before = await env.DB.prepare("SELECT * FROM proxy_config WHERE id = 1").first();
  await env.DB.exec(migrations[1]);
  assert.deepEqual(await env.DB.prepare("SELECT * FROM proxy_config WHERE id = 1").first(), before);
  assert.deepEqual(await loadConfig(env), saved);
});

test("populated D1 configuration ignores legacy URL, key and replacement environment variables", async t => {
  const env = environment(t, {
    UPSTREAM_BASE_URL: "https://legacy.example/v1",
    UPSTREAM_API_KEY: "legacy-test-key",
    REPLACEMENT_RULES: [{ from: "alpha", to: "legacy" }],
  });
  assert.deepEqual(await loadConfig(env), fixture);
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: String(url), headers: options.headers, body: await new Response(options.body).text() });
    return new Response("upstream");
  });
  const response = await worker.fetch(new Request(origin + "/v1/chat/completions", {
    method: "POST", headers: { "content-type": "application/json" }, body: '{"content":"alpha"}',
  }), env);
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, fixture.upstreamBaseUrl + "/chat/completions");
  assert.equal(calls[0].headers.get("authorization"), "Bearer " + fixture.upstreamApiKey);
  assert.equal(calls[0].body, '{"content":"initial"}');
});

test("an empty D1 table ignores legacy defaults, stops proxying and accepts a first save from the UI", async t => {
  const env = environment(t, {
    UPSTREAM_BASE_URL: "https://legacy.example/v1",
    UPSTREAM_API_KEY: "legacy-test-key",
    REPLACEMENT_RULES: [{ from: "alpha", to: "legacy" }],
  });
  await env.DB.prepare("DELETE FROM proxy_config").run();
  assert.deepEqual(await loadConfig(env), {
    upstreamBaseUrl: "", upstreamApiKey: "", rules: [], revision: 0, updatedAt: null,
  });
  const upstream = t.mock.method(globalThis, "fetch", async () => new Response("unexpected upstream call"));
  const denied = await worker.fetch(new Request(origin + "/v1/models"), env);
  assert.equal(denied.status, 503);
  assert.equal((await denied.json()).error.code, "proxy_not_configured");
  assert.equal(upstream.mock.callCount(), 0);

  const cookie = await login(env);
  const config = await (await call(env, "config", { cookie })).json();
  assert.deepEqual(config, { upstreamBaseUrl: "", hasUpstreamKey: false, rules: [], revision: 0, updatedAt: null });
  const response = await call(env, "config", { method: "PUT", cookie,
    body: changes(config, { upstreamBaseUrl: "https://first-save.example/v1", rules: fixture.rules }) });
  assert.equal(response.status, 200);
  const saved = await response.json();
  assert.equal(saved.revision, 1);
  assert.equal(saved.hasUpstreamKey, false);
  const actual = await loadConfig(env);
  assert.equal(actual.upstreamBaseUrl, "https://first-save.example/v1");
  assert.equal(actual.upstreamApiKey, "");
  assert.deepEqual(actual.rules, fixture.rules);
});

test("missing D1 binding reports 503 without making an upstream request or using legacy settings", async t => {
  const env = {
    UPSTREAM_BASE_URL: "https://legacy.example/v1",
    UPSTREAM_API_KEY: "legacy-test-key",
    REPLACEMENT_RULES: [],
  };
  const upstream = t.mock.method(globalThis, "fetch", async () => new Response("unexpected upstream call"));
  await assert.rejects(loadConfig(env), error => error.status === 503 && error.code === "database_not_configured");
  const response = await worker.fetch(new Request(origin + "/v1/models"), env);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error.code, "database_not_configured");
  assert.equal(upstream.mock.callCount(), 0);
});
