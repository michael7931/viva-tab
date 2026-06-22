(() => {
  function normalizeTabId(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const id = Number(value);
      return Number.isSafeInteger(id) ? id : null;
    }
    return null;
  }

  function createSingleFlight() {
    const pending = new Map();
    return (key, work) => {
      if (pending.has(key)) return pending.get(key);
      const operation = Promise.resolve().then(work);
      pending.set(key, operation);
      operation.then(
        () => pending.delete(key),
        () => pending.delete(key),
      );
      return operation;
    };
  }

  function archiveOperationFilename(workspaceId, ids, timestamp = Date.now()) {
    const normalizedIds = [...new Set(ids.map(Number))].sort((a, b) => a - b).join('-');
    const bucket = Math.floor(timestamp / 10_000);
    return `vws-op-${encodeURIComponent(String(workspaceId))}-${normalizedIds}-${bucket}`;
  }

  function canonicalSessionId(items, filename) {
    const ids = (items || [])
      .filter(item => item.filename === filename)
      .map(item => Number(item.id))
      .filter(id => Number.isSafeInteger(id) && id >= 0)
      .sort((a, b) => a - b);
    return ids[0] ?? null;
  }

  function tabSummary(t) {
    return {
      id: normalizeTabId(t.id),
      title: t.name || t.fixedName || t.url || 'Untitled',
      url: t.url || '',
      pinned: !!t.pinned,
      index: t.index,
    };
  }

  const api = { archiveOperationFilename, canonicalSessionId, createSingleFlight, normalizeTabId, tabSummary };
  if (typeof module === 'object' && module.exports) module.exports = api;
  globalThis.VWSWorkspaceTabUtils = api;
})();
