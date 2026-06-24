const assert = require('node:assert/strict');
const test = require('node:test');

const { archiveOperationFilename, archiveOperationKey, archiveOperationKeyFromSessionName, archiveSessionLabel, archiveSessionName, canonicalSessionId, canonicalSessionIdByOperationKey, createSingleFlight, externalRequestKey, normalizeTabId, resolveTargetWindowId, tabSummary } = require('../vws-jsmod/workspace-tab-utils.js');

test('gives every window context the same key for one external request', () => {
  const message = { cmd: 'STASH_WORKSPACE', workspaceId: '1777528461398' };
  const sender = { id: 'acgpcgjgfdngmkmjhhmbpeolklodipph', tab: { id: 320311296, windowId: 320311295 } };
  assert.equal(externalRequestKey(message, sender), externalRequestKey(message, sender));
});

test('keeps external requests from different tabs separate', () => {
  const message = { cmd: 'STASH_WORKSPACE', workspaceId: '1777528461398' };
  const a = { id: 'acgpcgjgfdngmkmjhhmbpeolklodipph', tab: { id: 1, windowId: 2 } };
  const b = { id: 'acgpcgjgfdngmkmjhhmbpeolklodipph', tab: { id: 3, windowId: 2 } };
  assert.notEqual(externalRequestKey(message, a), externalRequestKey(message, b));
});

test('uses the external sender window over a caller-provided window', () => {
  assert.equal(resolveTargetWindowId(320298894, 320298870), 320298894);
});

test('uses the requested window when a local console call has no sender', () => {
  assert.equal(resolveTargetWindowId(undefined, 320298894), 320298894);
});

test('gives concurrent stashes of the same workspace and tabs one session filename', () => {
  assert.equal(
    archiveOperationFilename('1777528461398', [42, 7], 12_345),
    archiveOperationFilename('1777528461398', [7, 42], 19_999),
  );
});

test('chooses the oldest session ID for duplicate archive filenames', () => {
  assert.equal(canonicalSessionId([
    { id: 594, filename: 'vws-op-1-7-42-1' },
    { id: 593, filename: 'vws-op-1-7-42-1' },
    { id: 592, filename: 'vws-op-other' },
  ], 'vws-op-1-7-42-1'), 593);
});

test('当 Session 缺失 filename 时仍按操作键找到最早归档', () => {
  const key = archiveOperationKey('stash-request-42');
  const name = archiveSessionName('VWS:公务 · 2个标签页 · now', key);
  assert.equal(canonicalSessionIdByOperationKey([
    { id: 826, name, filename: undefined },
    { id: 825, name, filename: undefined },
  ], key), 825);
});

test('同一次收纳请求不因标签快照差异改变操作键', () => {
  assert.equal(
    archiveOperationKey('stash-request-42', [7, 42]),
    archiveOperationKey('stash-request-42', [7]),
  );
});

test('从归档展示名称中移除内部操作键', () => {
  const name = archiveSessionName('VWS:公务 · 1个标签页 · now', '42:7');
  assert.equal(archiveSessionLabel(name), 'VWS:公务 · 1个标签页 · now');
});

test('同一次收纳的不同写入者保留同一操作键但使用不同 Session 名称', () => {
  const first = archiveSessionName('VWS:公务 · 1个标签页 · now', 'stash-request-42', 'writer-a');
  const second = archiveSessionName('VWS:公务 · 1个标签页 · now', 'stash-request-42', 'writer-b');
  assert.notEqual(first, second);
  assert.equal(archiveOperationKeyFromSessionName(first), 'stash-request-42');
  assert.equal(archiveOperationKeyFromSessionName(second), 'stash-request-42');
});

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
