import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/proxy.js";

function environment(overrides = {}) {
  return {
    UPSTREAM_BASE_URL: "https://upstream.example/v1",
    REPLACEMENT_RULES: [{ from: "find me", to: "替换文字" }],
    ...overrides,
  };
}

function jsonRequest(body, headers = {}) {
  return new Request("https://proxy.example/v1/chat/completions?trace=one%20two", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

function captureUpstream(t, response = new Response("upstream")) {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    calls.push({ url: String(url), options });
    return response;
  });
  return { calls, response };
}

async function bodyText(call) {
  return new Response(call.options.body).text();
}

test("changes matching JSON values while preserving keys, numeric literals and formatting", async t => {
  const upstream = captureUpstream(t);
  const original = '{\n  "find me" : "find me", "large": 90071992547409931234, "number": 1.200e+04, "untouched":"\\u4e2d\\/x", "messages":[{"role":"user","content":"find me twice find me"}], "tools":[{"type":"function","function":{"name":"example"}}]\n}';
  const response = await worker.fetch(jsonRequest(original), environment());

  assert.equal(response, upstream.response);
  assert.equal(upstream.calls.length, 1);
  assert.equal(await bodyText(upstream.calls[0]), original
    .replace('"find me",', '"替换文字",')
    .replace('"find me twice find me"', '"替换文字 twice 替换文字"'));
});

test("matches decoded Unicode escapes and safely encodes quotes and newlines in replacements", async t => {
  const upstream = captureUpstream(t);
  const replacement = '中文 "quoted"\nnext\\line';
  await worker.fetch(jsonRequest('{"content":"\\u0066ind me","another":"unchanged"}'),
    environment({ REPLACEMENT_RULES: [{ from: "find me", to: replacement }] }));

  const body = await bodyText(upstream.calls[0]);
  assert.equal(JSON.parse(body).content, replacement);
  assert.equal(body, '{"content":' + JSON.stringify(replacement) + ',"another":"unchanged"}');
});

test("forwards the exact original bytes and length when there is no match", async t => {
  const upstream = captureUpstream(t);
  const original = '{  "content" : "\\u4e2d\\/文", "n": 90071992547409931234 }\n';
  await worker.fetch(jsonRequest(original, { "content-length": String(new TextEncoder().encode(original).length) }), environment());

  assert.equal(await bodyText(upstream.calls[0]), original);
  assert.equal(upstream.calls[0].options.headers.get("content-length"), String(new TextEncoder().encode(original).length));
});

test("preserves method, path and encoded query with a single v1 prefix", async t => {
  const upstream = captureUpstream(t);
  await worker.fetch(jsonRequest('{"content":"find me"}'), environment());

  const call = upstream.calls[0];
  assert.equal(call.url, "https://upstream.example/v1/chat/completions?trace=one%20two");
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.redirect, "manual");
});

test("appends paths to an upstream prefix and forwards GET without a body", async t => {
  const upstream = captureUpstream(t);
  const incoming = new Request("https://proxy.example/models?limit=2");
  await worker.fetch(incoming, environment({ UPSTREAM_BASE_URL: "https://upstream.example/api/v1/" }));

  assert.equal(upstream.calls[0].url, "https://upstream.example/api/v1/models?limit=2");
  assert.equal(upstream.calls[0].options.body, null);
  assert.equal(upstream.calls[0].options.signal, incoming.signal);
});

test("uses the configured upstream key and drops stale body and hop-by-hop headers", async t => {
  const upstream = captureUpstream(t);
  await worker.fetch(jsonRequest('{"content":"find me"}', {
    authorization: "Bearer client-key",
    host: "proxy.example",
    connection: "keep-alive, x-hop",
    "x-hop": "temporary",
    "content-length": "21",
    "content-md5": "stale",
    digest: "stale",
    "x-custom": "preserved",
  }), environment({ UPSTREAM_API_KEY: "upstream-key" }));

  const headers = upstream.calls[0].options.headers;
  assert.equal(headers.get("authorization"), "Bearer upstream-key");
  assert.equal(headers.get("x-custom"), "preserved");
  for (const name of ["host", "connection", "x-hop", "content-length", "content-md5", "digest"]) {
    assert.equal(headers.has(name), false, name);
  }
});

test("keeps client authorization when an upstream key is not configured", async t => {
  const upstream = captureUpstream(t);
  await worker.fetch(jsonRequest('{}', { authorization: "Bearer client-key" }), environment());
  assert.equal(upstream.calls[0].options.headers.get("authorization"), "Bearer client-key");
});

test("accepts JSON-encoded rules, applies literal replacements in order, and supports text bodies", async t => {
  const upstream = captureUpstream(t);
  const incoming = new Request("https://proxy.example/input", {
    method: "PUT",
    headers: { "content-type": "text/plain; charset=utf-8" },
    body: "a.* a.*",
  });
  await worker.fetch(incoming, environment({ REPLACEMENT_RULES: JSON.stringify([
    { from: "a.*", to: "$&" }, { from: "$&", to: "done" },
  ]) }));
  assert.equal(await bodyText(upstream.calls[0]), "done done");
});

test("passes binary, compressed, invalid UTF-8 and malformed JSON bodies through unchanged", async t => {
  const upstream = captureUpstream(t);
  const examples = [
    { headers: { "content-type": "application/octet-stream" }, body: new Uint8Array([0, 255, 10, 34]) },
    { headers: { "content-type": "application/json", "content-encoding": "gzip" }, body: new Uint8Array([31, 139, 8, 0]) },
    { headers: { "content-type": "application/json" }, body: new Uint8Array([255, 254, 0]) },
    { headers: { "content-type": "application/json" }, body: new TextEncoder().encode('{"find me": find me}') },
  ];
  for (const example of examples) {
    await worker.fetch(new Request("https://proxy.example/v1/chat/completions", {
      method: "POST", headers: example.headers, body: example.body,
    }), environment());
    const actual = new Uint8Array(await new Response(upstream.calls.at(-1).options.body).arrayBuffer());
    assert.deepEqual(actual, example.body);
  }
});

test("empty rules forward the original request stream", async t => {
  const upstream = captureUpstream(t);
  const incoming = jsonRequest('{"content":"find me"}');
  await worker.fetch(incoming, environment({ REPLACEMENT_RULES: [] }));
  assert.equal(upstream.calls[0].options.body, incoming.body);
  assert.equal(await bodyText(upstream.calls[0]), '{"content":"find me"}');
});

test("returns upstream errors and redirects with their original headers and bodies", async t => {
  for (const status of [429, 503, 307]) {
    const original = new Response('original upstream body', {
      status,
      headers: { "retry-after": "31", "x-request-id": "trace-one", location: "https://other.example/" },
    });
    const upstream = captureUpstream(t, original);
    const response = await worker.fetch(jsonRequest('{}'), environment());
    assert.equal(response, original);
    assert.equal(response.status, status);
    assert.equal(response.headers.get("retry-after"), "31");
    assert.equal(response.headers.get("x-request-id"), "trace-one");
    assert.equal(await response.text(), "original upstream body");
    assert.equal(upstream.calls.length, 1);
    t.mock.restoreAll();
  }
});

test("returns an SSE chunk before the upstream stream closes", { timeout: 2000 }, async t => {
  const encoder = new TextEncoder();
  let controller;
  const stream = new ReadableStream({
    start(value) {
      controller = value;
      value.enqueue(encoder.encode('data: {"delta":"first"}\n\n'));
    },
  });
  const original = new Response(stream, { headers: { "content-type": "text/event-stream" } });
  captureUpstream(t, original);
  const response = await worker.fetch(jsonRequest('{}'), environment());
  assert.equal(response, original);
  const reader = response.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value), 'data: {"delta":"first"}\n\n');
  controller.enqueue(encoder.encode("data: [DONE]\n\n"));
  controller.close();
  assert.equal(new TextDecoder().decode((await reader.read()).value), "data: [DONE]\n\n");
  assert.equal((await reader.read()).done, true);
});

test("reports invalid configuration without sending an upstream request", async t => {
  const upstream = captureUpstream(t);
  for (const rules of [null, {}, "invalid json", [{ from: "", to: "x" }], [{ from: "x", to: 3 }]]) {
    const response = await worker.fetch(jsonRequest('{}'), environment({ REPLACEMENT_RULES: rules }));
    assert.equal(response.status, 500);
    assert.equal((await response.json()).error.code, "proxy_configuration_error");
  }
  for (const url of ["not a url", "ftp://upstream.example", "https://user:password@upstream.example", "https://upstream.example/?key=value"]) {
    const response = await worker.fetch(jsonRequest('{}'), environment({ UPSTREAM_BASE_URL: url }));
    assert.equal(response.status, 500);
  }
  assert.equal(upstream.calls.length, 0);
});

test("reports an upstream connection failure once without retrying", async t => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    throw new Error("connection closed");
  });
  const response = await worker.fetch(jsonRequest('{}'), environment());
  assert.equal(response.status, 502);
  assert.equal((await response.json()).error.code, "upstream_connection_error");
  assert.equal(calls, 1);
});
