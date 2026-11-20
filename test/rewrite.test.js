import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import proxy from "../src/proxy.js";
import { findSystemTextTokens } from "../src/json-patches.js";
import {
  RewriteError, prepareSystemTemplate, restoreSystemTemplate, rewriteSystemText,
  getRewriteCacheStats, clearRewriteCache,
} from "../src/rewrite.js";

const migrationDirectory = new URL("../migrations/", import.meta.url);
const migrations = await Promise.all((await readdir(migrationDirectory)).filter(name => name.endsWith(".sql")).sort()
  .map(name => readFile(new URL(name, migrationDirectory), "utf8")));

const defaults = {
  enabled: true, baseUrl: "https://rewrite.example/v1", model: "rewrite-test-model",
  apiKey: "rewrite-only-test-key", timeoutSeconds: 1, cacheEnabled: true, cacheTtlHours: 24,
};

function environment(t, settings = {}) {
  const database = new DatabaseSync(":memory:");
  for (const migration of migrations) database.exec(migration);
  t.after(() => database.close());
  const DB = {
    prepare(sql) {
      let parameters = [];
      return {
        bind(...values) { parameters = values; return this; },
        async first(column) {
          const value = database.prepare(sql).get(...parameters) ?? null;
          return column && value ? value[column] : value;
        },
        async all() { return { success: true, results: database.prepare(sql).all(...parameters) }; },
        async run() {
          const result = database.prepare(sql).run(...parameters);
          return { success: true, meta: { changes: result.changes } };
        },
      };
    },
    withSession() { return this; },
  };
  return {
    DB, database,
    UPSTREAM_BASE_URL: "https://upstream.example/v1", UPSTREAM_API_KEY: "primary-only-test-key",
    REPLACEMENT_RULES: [], SYSTEM_REWRITE: { ...defaults, ...settings },
  };
}

function request(body, headers = {}) {
  return new Request("https://proxy.example/v1/chat/completions?trace=exact%20query", {
    method: "POST", headers: { "content-type": "application/json", ...headers }, body,
  });
}

function sourceFrom(options) {
  const body = JSON.parse(options.body);
  assert.equal(body.stream, false);
  assert.equal(body.tools, undefined);
  assert.equal(body.tool_choice, undefined);
  assert.equal(body.messages[0].role, "system");
  assert.equal(body.messages.at(-1).role, "user");
  return JSON.parse(body.messages.at(-1).content).source;
}

function completion(text, { finishReason = "stop", fenced = false } = {}) {
  let content = JSON.stringify({ rewritten: text });
  if (fenced) content = "```json\n" + content + "\n```";
  return Response.json({ choices: [{ message: { role: "assistant", content }, finish_reason: finishReason }] });
}

// Synthetic model output checks the transport/protection contract, not semantic fidelity.
function rewrittenFixture(source, heading = "已改写的系统说明。") {
  const slots = source.match(/__PR_SLOT_\d{4,}__/g) ?? [];
  return [heading, ...slots].join("\n");
}

function rewriteMock(t, { delay = 0, response, transform = rewrittenFixture } = {}) {
  const ai = [];
  const primary = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    const call = { url: String(url), options };
    if (call.url.startsWith("https://upstream.example")) {
      primary.push({ ...call, body: await new Response(options.body).text() });
      return response ?? new Response("unchanged primary response");
    }
    const source = sourceFrom(options);
    ai.push({ ...call, source });
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    return completion(transform(source));
  });
  return { ai, primary };
}

test("disabled AI preserves the request bytes and performs only the primary call", async t => {
  const env = environment(t, { enabled: false });
  const capture = rewriteMock(t);
  const original = '{ "messages": [{"role":"system","content":"Leave this original."}], "n":9007199254740993, "escaped":"\\u4e2d\\/x" }\n';
  const response = await proxy.fetch(request(original), env);
  assert.equal(response.status, 200);
  assert.equal(capture.ai.length, 0);
  assert.equal(capture.primary.length, 1);
  assert.equal(capture.primary[0].body, original);
});

test("system token selection handles escaped keys, property order and text arrays without selecting user or tool strings", () => {
  const original = '{"\\u006dessages":[{"content":"first \\u4e2d","role":"sys\\u0074em"},{"content":[{"text":"second","type":"text"},{"type":"input_text","text":"third"},{"type":"image_url","image_url":{"url":"data:original"}}],"role":"system"},{"role":"user","content":"never rewrite"}],"tools":[{"function":{"name":"keep_name","description":"never rewrite"}}],"n":9007199254740993}';
  const tokens = findSystemTextTokens(original);
  assert.deepEqual(tokens.map(token => token.value), ["first 中", "second", "third"]);
  for (const token of tokens) assert.equal(JSON.parse(original.slice(token.start, token.end)), token.value);
});

test("only system string tokens change while large numbers, whitespace, user content and tool definitions retain their original bytes", async t => {
  const env = environment(t);
  const capture = rewriteMock(t);
  const original = '{\n "messages" : [{"content":"first system","role":"system"}, {"role":"user", "content":"user \\u4e2d\\/x"}, {"content":[{"type":"text","text":"second system"},{"type":"image_url","image_url":{"url":"data:unaltered"}}],"role":"system"}],\n "tools" : [{"type":"function","function":{"name":"getUserInfo","description":"exact tool text"}}], "n": 9007199254740993, "exponent":1.200e+04, "stream":true\n}\n';
  await proxy.fetch(request(original, { "content-length": String(new TextEncoder().encode(original).length) }), env);
  assert.equal(capture.ai.length, 2);
  assert.equal(capture.primary.length, 1);
  const expected = original.replace('"first system"', JSON.stringify("已改写的系统说明。"))
    .replace('"second system"', JSON.stringify("已改写的系统说明。"));
  assert.equal(capture.primary[0].body, expected);
  assert.equal(capture.primary[0].options.headers.has("content-length"), false);
  assert.equal(capture.primary[0].options.headers.get("authorization"), "Bearer primary-only-test-key");
  assert.equal(capture.primary[0].url, "https://upstream.example/v1/chat/completions?trace=exact%20query");
  assert.equal(new Headers(capture.ai[0].options.headers).get("authorization"), "Bearer rewrite-only-test-key");
});

test("one system message protects memory and JSON literals spanning several text parts before rewriting", async t => {
  const env = environment(t);
  const capture = rewriteMock(t);
  const parts = [
    "Follow the requirements.\n<memories>secret_cross_part_fact_",
    'alpha</memories>\nReturn exact JSON: {"suggest":false,',
    '"reason":""}\nUse the remaining guidance.',
  ];
  const original = '{ "messages" : [{"content":[{"type":"text","text":' + JSON.stringify(parts[0])
    + ',"note":"first part metadata"},{"type":"text","text":' + JSON.stringify(parts[1])
    + ',"note":"second part metadata"},{"type":"input_text","text":' + JSON.stringify(parts[2])
    + '}],"role":"system"},{"role":"user","content":"unchanged user"}], "n":9007199254740993, "stream":true }';
  const response = await proxy.fetch(request(original), env);
  assert.equal(response.status, 200);
  assert.equal(capture.ai.length, 1);
  const source = capture.ai[0].source;
  for (const fragment of ["secret_cross_part_fact_", "alpha", '"suggest"', '"reason"', "false"]) assert.equal(source.includes(fragment), false, fragment);
  assert.equal(capture.primary.length, 1);
  const forwarded = capture.primary[0].body;
  const content = JSON.parse(forwarded).messages[0].content;
  assert.equal(content.length, 3);
  assert.equal(content[0].type, "text");
  assert.equal(content[1].type, "text");
  assert.equal(content[2].type, "input_text");
  assert.equal(content[0].note, "first part metadata");
  assert.equal(content[1].note, "second part metadata");
  const combined = content.map(part => part.text).join("");
  assert.ok(combined.includes("<memories>secret_cross_part_fact_alpha</memories>"));
  assert.ok(combined.includes('{"suggest":false,"reason":""}'));
  let expected = original;
  for (let index = 0; index < parts.length; index++) expected = expected.replace(JSON.stringify(parts[index]), JSON.stringify(content[index].text));
  assert.equal(forwarded, expected);
});

test("template protection roundtrips tool names, code, JSON, tags, memories and dynamic metadata", () => {
  const source = [
    "Please use save_memory and getUserInfo when appropriate.",
    "Return the literal \"YES\" and keep 'NO' unchanged.",
    "Run `cat -n /tmp/example.txt` only when instructed.",
    '```json\n{"example":"Original value"}\n```',
    "```python\nfirst_line = 1\n# second fenced comment must remain original\nprint(first_line)\n```",
    'Output sample: {"suggest":false,"reason":""}',
    "Reference https://docs.example/path?q=original and <FILE_PATH>.",
    "Current model: gemini-sample-99",
    "Conversation started: 2031-02-03 04:05 (UTC+08:00)",
    "<memories>private-fact-alpha must remain byte-identical</memories>",
    "<system-reminder>runtime value original</system-reminder>",
  ].join("\n");
  const prepared = prepareSystemTemplate(source, ["save_memory", "getUserInfo"]);
  for (const value of ["private-fact-alpha", "runtime value original", "gemini-sample-99", "2031-02-03", "save_memory", "getUserInfo", "cat -n /tmp/example.txt", "second fenced comment must remain original", '"YES"', "'NO'", '{"suggest":false,"reason":""}', "<FILE_PATH>", "https://docs.example/path?q=original"]) {
    assert.equal(prepared.template.includes(value), false, value);
  }
  assert.equal(restoreSystemTemplate(prepared.template, prepared), source);
  assert.equal(restoreSystemTemplate("改写后的说明。\n" + prepared.template, prepared), "改写后的说明。\n" + source);
  const unclosed = "A normal note.\n```text\nfirst code line\nsecond unfinished code line";
  const unfinished = prepareSystemTemplate(unclosed);
  assert.equal(unfinished.template.includes("second unfinished code line"), false);
  assert.equal(restoreSystemTemplate(unfinished.template, unfinished), unclosed);
  const reservedLiteral = "Keep __PR_SLOT_9999__ as a literal value.";
  const protectedLiteral = prepareSystemTemplate(reservedLiteral);
  assert.equal(restoreSystemTemplate(protectedLiteral.template, protectedLiteral), reservedLiteral);
});

test("missing, duplicated, unknown and reordered placeholders are rejected", () => {
  const prepared = prepareSystemTemplate("Use `first_code` then `second_code`.");
  const [first, second] = prepared.slots.map(slot => slot.token);
  assert.ok(first && second);
  const swapped = prepared.template.replace(first, "TEMP_TOKEN").replace(second, first).replace("TEMP_TOKEN", second);
  for (const damaged of [
    prepared.template.replace(first, ""),
    prepared.template + first,
    prepared.template + "__PR_SLOT_9999__",
    swapped,
  ]) assert.throws(() => restoreSystemTemplate(damaged, prepared));
});

test("ten concurrent requests share one D1-backed rewrite and subsequently use the completed cache", { timeout: 4000 }, async t => {
  const env = environment(t);
  const capture = rewriteMock(t, { delay: 30 });
  const results = await Promise.all(Array.from({ length: 10 }, () => rewriteSystemText("Please explain carefully.", env.SYSTEM_REWRITE, env)));
  assert.equal(capture.ai.length, 1);
  assert.equal(results.length, 10);
  assert.ok(results.every(result => result.text === "已改写的系统说明。"));
  assert.equal(results.filter(result => result.cacheHit === false).length, 1);
  assert.equal(results.filter(result => result.cacheHit === true).length, 9);
  const cached = await rewriteSystemText("Please explain carefully.", env.SYSTEM_REWRITE, env);
  assert.equal(cached.cacheHit, true);
  assert.equal(capture.ai.length, 1);
});

test("cached templates restore the current request's model, time and private memories instead of another request's values", async t => {
  const env = environment(t);
  const capture = rewriteMock(t);
  const source = (model, date, fact) => `Please follow these requirements.\nCurrent model: ${model}\nConversation started: ${date}\n<memories>${fact}</memories>`;
  const first = source("model-alpha", "2031-01-02 03:04", "private-fact-alpha");
  const second = source("model-beta", "2032-02-03 04:05", "private-fact-beta");
  assert.equal((await rewriteSystemText(first, env.SYSTEM_REWRITE, env)).cacheHit, false);
  const result = await rewriteSystemText(second, env.SYSTEM_REWRITE, env);
  assert.equal(result.cacheHit, true);
  assert.equal(result.text, "已改写的系统说明。\nmodel-beta\n2032-02-03 04:05\n<memories>private-fact-beta</memories>");
  assert.equal(result.text.includes("private-fact-alpha"), false);
  assert.equal(capture.ai.length, 1);
  const row = env.database.prepare("SELECT * FROM system_rewrite_cache").get();
  const stored = JSON.stringify(row);
  for (const privateValue of ["private-fact-alpha", "private-fact-beta", "model-alpha", "model-beta", defaults.apiKey]) assert.equal(stored.includes(privateValue), false);
});

test("a system made entirely of a protected JSON contract may gain a Chinese introduction while its literal contract stays intact", async t => {
  const env = environment(t);
  rewriteMock(t);
  const source = '{"suggest":false,"reason":""}';
  const result = await rewriteSystemText(source, env.SYSTEM_REWRITE, env);
  assert.equal(result.text, "已改写的系统说明。\n" + source);
});

test("endpoint, model and key changes do not reuse another rewrite configuration's cached result", async t => {
  const env = environment(t);
  const capture = rewriteMock(t);
  const source = "Please produce a concise answer.";
  for (const changes of [{}, { model: "another-model" }, { baseUrl: "https://other-rewrite.example/v1" }, { apiKey: "rotated-test-key" }]) {
    const result = await rewriteSystemText(source, { ...env.SYSTEM_REWRITE, ...changes }, env);
    assert.equal(result.cacheHit, false);
  }
  assert.equal(capture.ai.length, 4);
});

test("expired entries are rewritten, and cache clearing leaves the configuration alone", async t => {
  const env = environment(t);
  const capture = rewriteMock(t);
  await rewriteSystemText("Please explain this result.", env.SYSTEM_REWRITE, env);
  const beforeConfig = env.database.prepare("SELECT * FROM proxy_config WHERE id = 1").get();
  assert.equal((await getRewriteCacheStats(env)).entries, 1);
  env.database.prepare("UPDATE system_rewrite_cache SET expires_at = 1").run();
  assert.equal((await rewriteSystemText("Please explain this result.", env.SYSTEM_REWRITE, env)).cacheHit, false);
  assert.equal(capture.ai.length, 2);
  assert.equal((await clearRewriteCache(env)).deleted, 1);
  assert.equal((await getRewriteCacheStats(env)).entries, 0);
  assert.deepEqual(env.database.prepare("SELECT * FROM proxy_config WHERE id = 1").get(), beforeConfig);
});

test("a failed rewrite does not poison the cache or leave the next caller waiting for its lease", async t => {
  const env = environment(t);
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (_url, options) => {
    calls++;
    if (calls === 1) return Response.json({ error: { message: "provider failure" } }, { status: 429 });
    return completion(rewrittenFixture(sourceFrom(options), "恢复后的说明。"));
  });
  await assert.rejects(rewriteSystemText("Please answer clearly.", env.SYSTEM_REWRITE, env), RewriteError);
  const result = await rewriteSystemText("Please answer clearly.", env.SYSTEM_REWRITE, env);
  assert.equal(result.cacheHit, false);
  assert.equal(result.text, "恢复后的说明。");
  assert.equal(calls, 2);
});

test("provider errors, invalid outputs and damaged placeholders fail closed without forwarding the original system", async t => {
  const env = environment(t, { cacheEnabled: false });
  let scenario;
  let primaryCalls = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith("https://upstream.example")) { primaryCalls++; return new Response("should not happen"); }
    const source = sourceFrom(options);
    if (scenario === "provider") return Response.json({ error: { message: "provider-private-test-key must not leak" } }, { status: 429 });
    if (scenario === "not-envelope") return new Response("not an API response", { headers: { "content-type": "application/json" } });
    if (scenario === "not-json") return Response.json({ choices: [{ message: { content: "plain rewritten prose" }, finish_reason: "stop" }] });
    if (scenario === "unchanged") return completion(source);
    if (scenario === "prefix-only") return completion("改写如下：\n" + source);
    if (scenario === "empty") return completion("");
    if (scenario === "truncated") return completion(rewrittenFixture(source), { finishReason: "length" });
    if (scenario === "placeholder") return completion(rewrittenFixture(source).replace(/__PR_SLOT_\d+__/g, ""));
    if (scenario === "extra-key") return Response.json({ choices: [{ message: { content: JSON.stringify({ rewritten: rewrittenFixture(source), extra: true }) }, finish_reason: "stop" }] });
    throw new Error("Unknown scenario");
  });
  for (scenario of ["provider", "not-envelope", "not-json", "unchanged", "prefix-only", "empty", "truncated", "placeholder", "extra-key"]) {
    const response = await proxy.fetch(request(JSON.stringify({ messages: [{ role: "system", content: "Use `exact_code` and respond clearly." }] })), env);
    assert.equal(response.status, 502, scenario);
    const text = await response.text();
    const data = JSON.parse(text);
    assert.match(data.error.code, /^system_rewrite_/);
    assert.equal(text.includes("provider-private-test-key"), false);
    assert.equal(text.includes(defaults.apiKey), false);
  }
  assert.equal(primaryCalls, 0);
});

test("rewrite timeout aborts the model call and never reaches the primary upstream", { timeout: 2000 }, async t => {
  const env = environment(t, { cacheEnabled: false, timeoutSeconds: 0.02 });
  let primaryCalls = 0;
  let aborted = false;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).startsWith("https://upstream.example")) { primaryCalls++; return new Response("unexpected"); }
    return new Promise((_resolve, reject) => {
      if (options.signal.aborted) { aborted = true; reject(options.signal.reason); return; }
      options.signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
    });
  });
  const response = await proxy.fetch(request('{"messages":[{"role":"system","content":"Please answer clearly."}]}'), env);
  assert.equal(response.status, 504);
  assert.match((await response.json()).error.code, /^system_rewrite_/);
  assert.equal(aborted, true);
  assert.equal(primaryCalls, 0);
});

test("enabled rewriting rejects compressed JSON and unsupported system content rather than leaking it through", async t => {
  const env = environment(t);
  const capture = rewriteMock(t);
  const compressed = await proxy.fetch(request(new Uint8Array([31, 139, 8, 0]), { "content-encoding": "gzip" }), env);
  assert.equal(compressed.status, 415);
  assert.match((await compressed.json()).error.code, /^system_rewrite_/);
  const unsupported = await proxy.fetch(request('{"messages":[{"role":"system","content":{"unknown_text":"unprocessed original"}}]}'), env);
  assert.equal(unsupported.status, 422);
  assert.match((await unsupported.json()).error.code, /^system_rewrite_/);
  assert.equal(capture.ai.length, 0);
  assert.equal(capture.primary.length, 0);
});

test("ordinary replacement rules run first, and primary upstream errors retain their exact response", async t => {
  const env = environment(t);
  env.REPLACEMENT_RULES = [{ from: "legacy wording", to: "replacement wording" }];
  const originalResponse = new Response("exact primary error body", { status: 429, headers: { "retry-after": "19", "x-request-id": "original-trace" } });
  const capture = rewriteMock(t, { response: originalResponse });
  const response = await proxy.fetch(request('{"messages":[{"role":"system","content":"legacy wording"},{"role":"user","content":"untouched user"}]}'), env);
  assert.equal(capture.ai[0].source, "replacement wording");
  assert.equal(response, originalResponse);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "19");
  assert.equal(await response.text(), "exact primary error body");
  assert.equal(capture.primary[0].body.includes("untouched user"), true);
});

test("rewriting preserves the primary SSE stream and does not wait for it to close", { timeout: 2000 }, async t => {
  const env = environment(t);
  const encoder = new TextEncoder();
  let controller;
  const stream = new ReadableStream({ start(value) { controller = value; value.enqueue(encoder.encode("data: first\n\n")); } });
  const upstream = new Response(stream, { headers: { "content-type": "text/event-stream" } });
  const capture = rewriteMock(t, { response: upstream });
  const response = await proxy.fetch(request('{"messages":[{"role":"system","content":"Please respond clearly."}]}'), env);
  assert.equal(response, upstream);
  assert.equal(capture.ai.length, 1);
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: first\n\n");
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
  controller.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: [DONE]\n\n");
  assert.equal((await reader.read()).done, true);
});
