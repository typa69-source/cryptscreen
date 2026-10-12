const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function harness(fetchImpl) {
  let handler;
  let deadline;
  let cleared = false;
  const router = { get(_path, fn) { handler = fn; } };
  const context = vm.createContext({
    require(name) {
      assert.equal(name, 'express');
      return { Router: () => router };
    },
    module: { exports: {} }, URL, AbortController,
    console: { error() {} },
    fetch: fetchImpl,
    setTimeout(fn) { deadline = fn; return 1; },
    clearTimeout() { cleared = true; },
  });
  vm.runInContext(fs.readFileSync(new URL('../routes/proxy.js', 'file://' + __filename.replaceAll('\\', '/')), 'utf8'), context);
  const response = {
    statusCode: 200, body: undefined,
    set() { return this; }, type() { return this; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; return this; },
    json(body) { this.body = body; return this; },
  };
  return { run: () => handler({ query: {} }, response), response,
    fireDeadline: () => deadline(), isCleared: () => cleared };
}

test('proxy retains its abort deadline while reading the response body', async () => {
  let bodyStarted;
  const started = new Promise(resolve => { bodyStarted = resolve; });
  let releaseBody;
  const h = harness(async (_url, { signal }) => ({
    ok: true,
    text() {
      bodyStarted();
      return new Promise((resolve, reject) => {
        releaseBody = () => resolve('[]');
        signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true });
      });
    },
  }));
  const pending = h.run();
  await started;
  try {
    assert.equal(h.isCleared(), false, 'headers arriving must not cancel the body-read timeout');
    h.fireDeadline();
    await pending;
    assert.equal(h.response.statusCode, 502);
    assert.equal(h.isCleared(), true, 'deadline must be cleaned up after failure');
  } finally {
    releaseBody();
    await pending;
  }
});

test('proxy cleans up its deadline when fetch rejects', async () => {
  const h = harness(async () => { throw new Error('Network failure'); });
  await h.run();
  assert.equal(h.response.statusCode, 502);
  assert.equal(h.isCleared(), true, 'failed fetch must not leave a timer behind');
});
