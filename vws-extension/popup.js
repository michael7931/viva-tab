const $ = s => document.querySelector(s);
const status = $('#status');
function ensureVWS(){ if (!window.VWS || !VWS.send) throw new Error('VWS 未加载：请重新加载插件，确认 bridge-client.js 存在'); }
const DEFAULT_SETTINGS = { startupOpen:true, restoreMode:'remove', singleTabOpen:'stay', groupRestoreTarget:'newWindow', contextMenuEnabled:true, unloadOnRestore:false, toolbarClick:'popup', allowDuplicates:true, includePinned:false };
function setStatus(t){ status.textContent = t; }
function getSettings(){ return new Promise(r => chrome.storage.local.get({ vwsSettings: DEFAULT_SETTINGS }, x => r({ ...DEFAULT_SETTINGS, ...(x.vwsSettings || {}) }))); }
function stashPayload(s){ return { includePinned:s.includePinned, allowDuplicates:s.allowDuplicates, closeTabs:true }; }
async function ping(){ try { ensureVWS(); const r = await VWS.send('PING'); setStatus('已连接 JSMod：' + r.version); } catch(e){ setStatus('未连接：' + e.message); } }
async function stashActive(){ const s = await getSettings(); setStatus('收纳中…'); try { ensureVWS(); const r = await VWS.send('STASH_ACTIVE', stashPayload(s)); setStatus(`已收纳：${r.workspaceName}，${r.tabs} 个标签页`); } catch(e){ setStatus('失败：' + e.message); } }
function openArchive(){ chrome.tabs.create({ url: chrome.runtime.getURL('archive.html') }); }
$('#open-archive').onclick = openArchive;
$('#stash-active').onclick = stashActive;
$('#refresh-workspaces').onclick = async () => { setStatus('刷新中…'); try { ensureVWS(); const r = await VWS.send('GET_WORKSPACES'); setStatus(`工作区：${r.workspaces.map(w => `${w.name}(${w.tabCount})`).join(' / ')}`); } catch(e){ setStatus('失败：' + e.message); } };
(async () => {
  const s = await getSettings();
  if (s.toolbarClick === 'open-archive') { openArchive(); setStatus('已打开归档页'); return; }
  if (s.toolbarClick === 'stash-active') { await stashActive(); return; }
  ping();
})();
