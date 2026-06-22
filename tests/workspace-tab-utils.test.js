const assert = require('node:assert/strict');
const test = require('node:test');

const { createSingleFlight, normalizeTabId, tabSummary } = require('../vws-jsmod/workspace-tab-utils.js');

test('coalesces concurrent operations for the same workspace', async () => {
  const run = createSingleFlight();
  let calls = 0;
  let release;
  const pending = new Promise(resolve => { release = resolve; });
  const work = async () => { calls += 1; await pending; return 'archive-551'; };

  const first = run('workspace:1777528461398', work);
  const second = run('workspace:1777528461398', work);
  assert.strictEqual(second, first);

  release();
  assert.equal(await first, 'archive-551');
  assert.equal(calls, 1);
});

test('normalizes a decimal session tab ID string', () => {
  assert.equal(normalizeTabId('1307'), 1307);
});

test('rejects IDs that are not non-negative safe integers', () => {
  assert.equal(normalizeTabId('-1'), null);
  assert.equal(normalizeTabId('1307x'), null);
  assert.equal(normalizeTabId(undefined), null);
});

test('produces a closable tab summary from a string session ID', () => {
  assert.deepEqual(tabSummary({ id: '42', url: 'https://example.test' }), {
    id: 42,
    title: 'https://example.test',
    url: 'https://example.test',
    pinned: false,
    index: undefined,
  });
});
