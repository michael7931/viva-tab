const VWS_INTERNAL_EXTENSION_ID = 'mpognobbkildjkofajifpdfhcoklimli';

function createRequestId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sendVWS(cmd, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        VWS_INTERNAL_EXTENSION_ID,
        {
          namespace: 'VWS', cmd, extensionId: chrome.runtime.id,
          ...(cmd === 'STASH_ACTIVE' || cmd === 'STASH_WORKSPACE' ? { requestId: createRequestId() } : {}),
          ...payload,
        },
        (response) => {
          const err = chrome.runtime.lastError;
          if (err) return reject(new Error(err.message || String(err)));
          if (!response) return reject(new Error('JSMod 没有响应。确认已安装并重启 Vivaldi。'));
          if (response.ok === false) return reject(new Error(response.error || 'JSMod 操作失败'));
          resolve(response);
        }
      );
    } catch (e) {
      reject(e);
    }
  });
}

window.VWS = { send: sendVWS, internalId: VWS_INTERNAL_EXTENSION_ID };
