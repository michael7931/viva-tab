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

  const ARCHIVE_OPERATION_MARKER = '\u2063vws-op:';

  function archiveOperationKey(requestId) {
    const value = String(requestId || '');
    if (!value) throw new Error('缺少收纳请求 ID');
    return value;
  }

  function archiveSessionName(label, operationKey, writerId = '') {
    return `${label}${ARCHIVE_OPERATION_MARKER}${encodeURIComponent(operationKey)}|${encodeURIComponent(writerId)}`;
  }

  function archiveSessionLabel(name) {
    const value = String(name || '');
    const markerIndex = value.lastIndexOf(ARCHIVE_OPERATION_MARKER);
    return markerIndex < 0 ? value : value.slice(0, markerIndex);
  }

  function archiveOperationKeyFromSessionName(name) {
    const value = String(name || '');
    const markerIndex = value.lastIndexOf(ARCHIVE_OPERATION_MARKER);
    if (markerIndex < 0) return null;
    const payload = value.slice(markerIndex + ARCHIVE_OPERATION_MARKER.length);
    const separatorIndex = payload.indexOf('|');
    try { return decodeURIComponent(separatorIndex < 0 ? payload : payload.slice(0, separatorIndex)); }
    catch (_) { return null; }
  }

  function canonicalSessionIdByOperationKey(items, operationKey) {
    const ids = (items || [])
      .filter(item => archiveOperationKeyFromSessionName(item.name) === operationKey)
      .map(item => Number(item.id))
      .filter(id => Number.isSafeInteger(id) && id >= 0)
      .sort((a, b) => a - b);
    return ids[0] ?? null;
  }

  function canonicalSessionId(items, filename) {
    const ids = (items || [])
      .filter(item => item.filename === filename)
      .map(item => Number(item.id))
      .filter(id => Number.isSafeInteger(id) && id >= 0)
      .sort((a, b) => a - b);
    return ids[0] ?? null;
  }

  function resolveTargetWindowId(senderWindowId, requestedWindowId) {
    const senderId = Number(senderWindowId);
    if (Number.isSafeInteger(senderId) && senderId >= 0) return senderId;
    const requestedId = Number(requestedWindowId);
    return Number.isSafeInteger(requestedId) && requestedId >= 0 ? requestedId : null;
  }

  function externalRequestKey(message, sender) {
    return JSON.stringify([
      sender?.id || '',
      sender?.tab?.id ?? '',
      sender?.tab?.windowId ?? '',
      message?.cmd || '',
      message?.workspaceId || '',
      message?.requestId || '',
    ]);
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

  const api = { archiveOperationFilename, archiveOperationKey, archiveOperationKeyFromSessionName, archiveSessionLabel, archiveSessionName, canonicalSessionId, canonicalSessionIdByOperationKey, createSingleFlight, externalRequestKey, normalizeTabId, resolveTargetWindowId, tabSummary };
  if (typeof module === 'object' && module.exports) module.exports = api;
  globalThis.VWSWorkspaceTabUtils = api;
})();
