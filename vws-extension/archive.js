const $ = s => document.querySelector(s);
const workspaceList = $('#workspace-list');
const archiveList = $('#archive-list');
const bridgeStatus = $('#bridge-status');
const toastEl = $('#toast');
const DEFAULT_SETTINGS = {
  startupOpen: true,
  restoreMode: 'remove',
  singleTabOpen: 'stay',
  groupRestoreTarget: 'currentWindow',
  contextMenuEnabled: true,
  unloadOnRestore: false,
  toolbarClick: 'popup',
  allowDuplicates: true,
  includePinned: false,
};
let settings = { ...DEFAULT_SETTINGS };
let state = { workspaces: [], archives: [], query: '', selectedWorkspaceId: 'active', selectedWorkspaceName: '当前工作区', hiddenTabs: {} };

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.style.display = 'block';
  clearTimeout(toastEl._t);
  toastEl._t = setTimeout(() => toastEl.style.display = 'none', 2600);
}
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }
function shortUrl(url) { try { const u = new URL(url); return u.protocol.startsWith('chrome') ? url : u.hostname + u.pathname; } catch { return url || ''; } }
function workspaceNameById(id) {
  if (id === 'active') return '当前工作区';
  return (state.workspaces.find(w => String(w.id) === String(id)) || {}).name || '工作区';
}
function parseArchiveWorkspaceName(ar) { return String(ar.name || '').replace(/^已恢复 · /, '').split(' · ')[0].trim(); }
function storageGet(keys) { return new Promise(r => chrome.storage.local.get(keys, r)); }
function storageSet(obj) { return new Promise(r => chrome.storage.local.set(obj, r)); }
async function loadSettings() {
  const got = await storageGet({ vwsSettings: DEFAULT_SETTINGS, vwsHiddenTabs: {} });
  settings = { ...DEFAULT_SETTINGS, ...(got.vwsSettings || {}) };
  state.hiddenTabs = got.vwsHiddenTabs || {};
  renderSettings();
}
async function saveSettingsFromUI() {
  settings = {
    startupOpen: valueOfRadio('startupOpen') === 'true',
    restoreMode: valueOfRadio('restoreMode'),
    singleTabOpen: valueOfRadio('singleTabOpen'),
    groupRestoreTarget: valueOfRadio('groupRestoreTarget'),
    contextMenuEnabled: valueOfRadio('contextMenuEnabled') === 'true',
    unloadOnRestore: valueOfRadio('unloadOnRestore') === 'true',
    toolbarClick: valueOfRadio('toolbarClick'),
    allowDuplicates: valueOfRadio('allowDuplicates') === 'true',
    includePinned: valueOfRadio('includePinned') === 'true',
  };
  await storageSet({ vwsSettings: settings });
  $('#settings-status').textContent = '已保存';
  toast('设置已保存');
  setTimeout(() => $('#settings-status').textContent = '', 1600);
}
function valueOfRadio(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value; }
function setRadio(name, value) {
  const el = document.querySelector(`input[name="${name}"][value="${String(value)}"]`);
  if (el) el.checked = true;
}
function renderSettings() {
  setRadio('startupOpen', settings.startupOpen);
  setRadio('restoreMode', settings.restoreMode);
  setRadio('singleTabOpen', settings.singleTabOpen);
  setRadio('groupRestoreTarget', settings.groupRestoreTarget);
  setRadio('contextMenuEnabled', settings.contextMenuEnabled);
  setRadio('unloadOnRestore', settings.unloadOnRestore);
  setRadio('toolbarClick', settings.toolbarClick);
  setRadio('allowDuplicates', settings.allowDuplicates);
  setRadio('includePinned', settings.includePinned);
}
function stashPayload() {
  return {
    includePinned: settings.includePinned,
    allowDuplicates: settings.allowDuplicates,
    closeTabs: true,
  };
}

async function loadAll(keepSelection = true) {
  bridgeStatus.textContent = '连接中…';
  try {
    const ping = await VWS.send('PING');
    bridgeStatus.textContent = '已连接：' + ping.version;
    const [ws, ar] = await Promise.all([VWS.send('GET_WORKSPACES'), VWS.send('GET_ARCHIVES')]);
    state.workspaces = ws.workspaces || [];
    state.archives = ar.archives || [];
    if (!keepSelection || !state.selectedWorkspaceId) {
      state.selectedWorkspaceId = 'active';
      state.selectedWorkspaceName = '当前工作区';
    }
    renderWorkspaces();
    renderArchives();
  } catch (e) {
    bridgeStatus.textContent = '连接失败：' + e.message;
    archiveList.innerHTML = `<div class="empty">连接 JSMod 失败：${escapeHtml(e.message)}<br>确认已安装 JSMod 并完全重启 Vivaldi。</div>`;
  }
}

function selectWorkspace(id) {
  state.selectedWorkspaceId = String(id);
  state.selectedWorkspaceName = workspaceNameById(String(id));
  renderWorkspaces();
  renderArchives();
}

function renderWorkspaces() {
  workspaceList.innerHTML = '';
  if (!state.workspaces.length) {
    const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = '没有检测到工作区'; workspaceList.appendChild(empty); return;
  }
  for (const ws of state.workspaces) {
    const div = document.createElement('div');
    div.className = 'workspace-item clickable ' + (String(ws.id) === String(state.selectedWorkspaceId) ? 'selected' : '');
    div.dataset.act = 'select-workspace';
    div.dataset.id = String(ws.id);
    div.innerHTML = `
      <div class="workspace-title"><span>${escapeHtml(ws.emoji || '')} ${escapeHtml(ws.name)}</span><span>${ws.tabCount}</span></div>
      <div class="workspace-tabs">${ws.tabCount} 个标签页；点击方框查看</div>
      <div class="ws-buttons"><button class="primary full" data-act="stash-workspace" data-id="${escapeHtml(ws.id)}">收纳这个工作区</button></div>
    `;
    workspaceList.appendChild(div);
  }
}
function archiveMatches(ar) {
  const q = state.query.trim().toLowerCase(); if (!q) return true;
  const hay = [ar.name, ar.rawName, ar.workspaceName, ...(ar.tabsDetail || []).map(t => `${t.title} ${t.url}`)].join(' ').toLowerCase();
  return hay.includes(q);
}
function archiveBelongsToSelected(ar) {
  if (state.selectedWorkspaceId === 'active') return true;
  const selectedName = workspaceNameById(state.selectedWorkspaceId);
  return (ar.workspaceName || parseArchiveWorkspaceName(ar)) === selectedName;
}
function archiveSortValue(ar) {
  const n = Number(ar.createDateJS || ar.createDate || ar.modifyDateJS || ar.modifyDate || ar.id || 0);
  return Number.isFinite(n) ? n : 0;
}
function compareArchiveByStashTimeDesc(a, b) {
  const diff = archiveSortValue(b) - archiveSortValue(a);
  if (diff) return diff;
  return Number(b.id || 0) - Number(a.id || 0);
}

function hiddenKey(archiveId, tab) { return `${archiveId}:${tab.url || tab.id || tab.title}`; }
function isTabHidden(archiveId, tab) { return !!state.hiddenTabs[hiddenKey(archiveId, tab)]; }
async function hideRestoredTab(archiveId, tab) {
  state.hiddenTabs[hiddenKey(archiveId, tab)] = true;
  await storageSet({ vwsHiddenTabs: state.hiddenTabs });
}
async function clearHiddenForArchive(archiveId) {
  const prefix = archiveId + ':';
  let changed = false;
  for (const k of Object.keys(state.hiddenTabs)) {
    if (k.startsWith(prefix)) { delete state.hiddenTabs[k]; changed = true; }
  }
  if (changed) await storageSet({ vwsHiddenTabs: state.hiddenTabs });
}
async function openSingleTabFromArchive(archiveId, tab, event) {
  const url = tab.url;
  if (!url) return;
  const openInNewWindow = !!event.shiftKey;
  const active = settings.singleTabOpen === 'switch';
  let created;
  if (openInNewWindow) {
    const w = await new Promise(resolve => chrome.windows.create({ url, focused: true }, resolve));
    created = w?.tabs?.[0];
  } else {
    created = await new Promise(resolve => chrome.tabs.create({ url, active }, resolve));
  }
  if (settings.unloadOnRestore && created?.id && !active && !openInNewWindow) {
    try { chrome.tabs.discard(created.id); } catch (_) {}
  }
  if (settings.restoreMode === 'remove') {
    await hideRestoredTab(archiveId, tab);
    const ar = state.archives.find(x => Number(x.id) === Number(archiveId));
    const left = (ar?.tabsDetail || []).filter(t => !isTabHidden(archiveId, t));
    if (!left.length) {
      try { await VWS.send('DELETE_ARCHIVE', { id: Number(archiveId) }); await clearHiddenForArchive(archiveId); } catch (_) {}
      await loadAll(true);
    } else {
      renderArchives();
    }
  }
}

function renderArchives() {
  const selectedName = state.selectedWorkspaceId === 'active' ? '全部归档' : workspaceNameById(state.selectedWorkspaceId);
  $('#archive-heading').textContent = selectedName;
  const items = state.archives.filter(archiveBelongsToSelected).filter(archiveMatches).sort(compareArchiveByStashTimeDesc);
  archiveList.innerHTML = '';
  if (!items.length) { archiveList.innerHTML = '<div class="empty">当前选择下暂无归档</div>'; return; }
  for (const ar of items) {
    const div = document.createElement('div'); div.className = 'onetab-group' + (ar.restored ? ' restored' : '');
    const tabs = (ar.tabsDetail || []).filter(t => !isTabHidden(ar.id, t));
    const visibleCount = tabs.length || ar.tabs;
    const list = tabs.map((t, idx) => `
      <div class="onetab-row"><span class="favicon">${t.url?.startsWith('chrome') || t.url?.startsWith('vivaldi') ? '▣' : '🌐'}</span><a href="${escapeHtml(t.url)}" title="${escapeHtml(t.url)}" data-act="open-tab" data-archive-id="${ar.id}" data-tab-index="${idx}">${escapeHtml(t.title || t.url)}</a><span class="url">${escapeHtml(shortUrl(t.url))}</span></div>
    `).join('');
    div.innerHTML = `
      <div class="group-head">
        <div>
          <div class="archive-title">${ar.restored ? '✅ 已恢复 · ' : ''}${escapeHtml(ar.workspaceName || parseArchiveWorkspaceName(ar))} · ${visibleCount} 个标签页</div>
          <div class="archive-meta">${escapeHtml(ar.timeText || '')} · 1 个窗口 · ID ${ar.id}</div>
        </div>
        <div class="group-actions"><button class="primary" data-act="restore" data-id="${ar.id}">全部还原</button><button class="primary" data-act="restore-delete" data-id="${ar.id}">还原并删除</button><button class="danger" data-act="delete" data-id="${ar.id}">删除</button></div>
      </div>
      <div class="onetab-list">${list || '<div class="status">此归档没有可显示的标签明细</div>'}</div>
    `;
    archiveList.appendChild(div);
  }
}
async function runAction(act, id, el) {
  const elArchiveId = el?.dataset?.archiveId || id;
  const elTabIndex = el?.dataset?.tabIndex;
  try {
    if (act === 'open-tab') {
      const ar = state.archives.find(x => Number(x.id) === Number(elArchiveId));
      const visible = (ar?.tabsDetail || []).filter(t => !isTabHidden(Number(elArchiveId), t));
      const tab = visible[Number(elTabIndex)];
      if (tab) await openSingleTabFromArchive(Number(elArchiveId), tab, window.__vwsLastClickEvent || {});
      return;
    }
    if (act === 'select-workspace') { selectWorkspace(id); return; }
    if (act === 'stash-active') {
      toast('收纳当前工作区…'); const r = await VWS.send('STASH_ACTIVE', stashPayload()); toast(`已收纳：${r.workspaceName}，${r.tabs} 个标签页`); await loadAll(true); return;
    }
    if (act === 'stash-workspace') {
      toast('收纳中…'); const r = await VWS.send('STASH_WORKSPACE', { workspaceId: id, ...stashPayload() }); toast(`已收纳：${r.workspaceName}，${r.tabs} 个标签页`); state.selectedWorkspaceId = String(id); state.selectedWorkspaceName = r.workspaceName; await loadAll(true); return;
    }
    if (act === 'restore') {
      toast('恢复中…');
      if (settings.restoreMode === 'remove') {
        await VWS.send('RESTORE_DELETE_ARCHIVE', { id: Number(id), newWindow: false });
        await clearHiddenForArchive(Number(id));
      } else if (settings.restoreMode === 'mark') {
        await VWS.send('RESTORE_ARCHIVE', { id: Number(id), newWindow: false });
        await VWS.send('MARK_RESTORED', { id: Number(id) });
      } else {
        await VWS.send('RESTORE_ARCHIVE', { id: Number(id), newWindow: false });
      }
      toast('已恢复'); await loadAll(true); return;
    }
    if (act === 'restore-delete') { toast('恢复并删除中…'); await VWS.send('RESTORE_DELETE_ARCHIVE', { id: Number(id), newWindow: false }); await clearHiddenForArchive(Number(id)); toast('已恢复并删除'); await loadAll(true); return; }
    if (act === 'delete') { if (!confirm('确定删除这个归档？')) return; await VWS.send('DELETE_ARCHIVE', { id: Number(id) }); await clearHiddenForArchive(Number(id)); toast('已删除'); await loadAll(true); }
  } catch (e) { console.error(e); toast('失败：' + e.message); }
}

document.addEventListener('click', e => { const el = e.target.closest('[data-act]'); if (!el) return; e.preventDefault(); window.__vwsLastClickEvent = e; runAction(el.dataset.act, el.dataset.id, el); });
$('#stash-active').onclick = () => runAction('stash-active');
$('#refresh').onclick = () => loadAll(true);
$('#cleanup').onclick = async () => { try { const r = await VWS.send('CLEANUP_TEMPS'); toast(`已清理 ${r.deleted} 个临时项`); await loadAll(true); } catch (e) { toast('失败：' + e.message); } };
$('#debug').onclick = async () => { try { const r = await VWS.send('DEBUG'); await navigator.clipboard.writeText(JSON.stringify(r, null, 2)); toast('调试信息已复制'); } catch (e) { toast('失败：' + e.message); } };
$('#settings-toggle').onclick = () => { const p = $('#settings-panel'); p.style.display = p.style.display === 'none' ? 'block' : 'none'; };
$('#settings-close').onclick = () => $('#settings-panel').style.display = 'none';
$('#settings-save').onclick = saveSettingsFromUI;
$('#search').oninput = e => { state.query = e.target.value; renderArchives(); };
(async () => { await loadSettings(); await loadAll(false); if (new URLSearchParams(location.search).get('action') === 'stash-active') await runAction('stash-active'); })();
