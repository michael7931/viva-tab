const assert = require('node:assert/strict');
const test = require('node:test');

const { normalizeTabId, tabSummary } = require('../vws-jsmod/workspace-tab-utils.js');

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
