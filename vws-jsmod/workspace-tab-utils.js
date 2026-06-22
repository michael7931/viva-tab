(() => {
  function normalizeTabId(value) {
    if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      const id = Number(value);
      return Number.isSafeInteger(id) ? id : null;
    }
    return null;
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

  const api = { normalizeTabId, tabSummary };
  if (typeof module === 'object' && module.exports) module.exports = api;
  globalThis.VWSWorkspaceTabUtils = api;
})();
