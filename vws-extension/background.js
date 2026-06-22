const DEFAULT_SETTINGS = {
  startupOpen: true,
  restoreMode: 'remove',
  singleTabOpen: 'stay',
  groupRestoreTarget: 'newWindow',
  contextMenuEnabled: true,
  unloadOnRestore: false,
  toolbarClick: 'popup',
  allowDuplicates: true,
  includePinned: false,
};

function getSettings() {
  return new Promise(resolve => chrome.storage.local.get({ vwsSettings: DEFAULT_SETTINGS }, r => resolve({ ...DEFAULT_SETTINGS, ...(r.vwsSettings || {}) })));
}

async function maybeOpenArchive() {
  const s = await getSettings();
  if (s.startupOpen) chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') });
}

function removeAllMenus() {
  return new Promise(resolve => chrome.contextMenus.removeAll(() => resolve()));
}

function createMenuSafe(options) {
  return new Promise(resolve => {
    chrome.contextMenus.create(options, () => {
      // MV3 service worker can run startup/installed/storage events close together.
      // Ignore duplicate-id race errors after removeAll; final menu state is still OK.
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

let menuSyncPromise = Promise.resolve();
function syncContextMenus() {
  menuSyncPromise = menuSyncPromise.then(async () => {
    const s = await getSettings();
    await removeAllMenus();
    if (!s.contextMenuEnabled) return;
    await createMenuSafe({ id: 'vws-open-archive', title: '打开 viva tab', contexts: ['page','selection','link'] });
    await createMenuSafe({ id: 'vws-stash-active', title: '收纳当前工作区', contexts: ['page','selection','link'] });
  }).catch(err => console.warn('[VWS] syncContextMenus failed', err));
  return menuSyncPromise;
}

chrome.runtime.onStartup.addListener(async () => { await maybeOpenArchive(); await syncContextMenus(); });
chrome.runtime.onInstalled.addListener(async details => {
  const got = await getSettings();
  await chrome.storage.local.set({ vwsSettings: got });
  await syncContextMenus();
  if (details.reason === 'install' && got.startupOpen) chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') });
});
chrome.storage.onChanged.addListener((changes, area) => { if (area === 'local' && changes.vwsSettings) syncContextMenus(); });
chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'vws-open-archive') chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') });
  if (info.menuItemId === 'vws-stash-active') chrome.tabs.create({ url: chrome.runtime.getURL('archive.html?action=stash-active') });
});
