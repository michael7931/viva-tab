const VWS_INTERNAL_EXTENSION_ID = 'mpognobbkildjkofajifpdfhcoklimli';

function sendVWS(cmd, payload = {}) {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage(
        VWS_INTERNAL_EXTENSION_ID,
        { namespace: 'VWS', cmd, extensionId: chrome.runtime.id, ...payload },
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
