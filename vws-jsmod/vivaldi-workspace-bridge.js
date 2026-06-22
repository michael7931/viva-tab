(() => {
  if (window.__VWS_BRIDGE_LOADED__) return;
  window.__VWS_BRIDGE_LOADED__ = true;

  const MOD = 'v2.4.4-bridge';
  const NAME_PREFIX = 'VWS:';
  const runStashOnce = VWSWorkspaceTabUtils.createSingleFlight();
  const log = (...a) => console.log('[VWS]', MOD, ...a);
  const state = { lastDebug: [] };
  const dbg = (...a) => { state.lastDebug.push(a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')); log(...a); };

  const p = fn => new Promise((resolve, reject) => {
    try {
      fn((result) => {
        const err = chrome.runtime && chrome.runtime.lastError;
        err ? reject(err) : resolve(result);
      });
    } catch (e) { reject(e); }
  });

  const hasApi = () => !!(window.vivaldi && vivaldi.sessionsPrivate && chrome && chrome.windows && chrome.tabs);
  const getAllSessions = () => p(cb => vivaldi.sessionsPrivate.getAll(cb));
  const getContent = id => p(cb => vivaldi.sessionsPrivate.getContent(id, cb));
  const getWins = () => p(cb => chrome.windows.getAll({ populate: true }, cb));
  const queryActive = windowId => p(cb => chrome.tabs.query(
    windowId ? { active: true, windowId } : { active: true, currentWindow: true },
    cb,
  ));

  async function deleteSession(id) {
    const tries = [
      cb => vivaldi.sessionsPrivate.delete(id, 0, cb),
      cb => vivaldi.sessionsPrivate.delete(id, cb),
      cb => vivaldi.sessionsPrivate.delete({ id }, cb),
    ];
    let last;
    for (const t of tries) { try { return await p(t); } catch (e) { last = e; } }
    throw last;
  }

  async function renameSession(id, name) {
    return p(cb => vivaldi.sessionsPrivate.rename(Number(id), String(name), cb));
  }

  async function addSession(opts) {
    return p(cb => vivaldi.sessionsPrivate.add(opts, cb));
  }

  async function addSessionAndFind(opts) {
    const before = await getAllSessions().catch(() => ({ items: [] }));
    const beforeIds = new Set((before.items || []).map(x => x.id));
    const ret = await addSession(opts);
    const all = await getAllSessions();
    const items = all.items || [];
    let item = items.find(x => !beforeIds.has(x.id) && x.name === opts.name);
    if (!item) item = items.find(x => x.name === opts.name);
    if (!item && opts.filename) item = items.find(x => x.filename === opts.filename);
    if (!item) item = items[0];
    dbg('addSessionAndFind', { ret, found: item && { id: item.id, name: item.name, tabs: item.tabs, windows: item.windows } });
    if (!item || typeof item.id !== 'number') throw new Error('创建 Session 成功但找不到新 Session ID');
    return item;
  }

  async function reconcileDuplicateArchive(filename, currentId) {
    await sleep(120);
    const all = await getAllSessions();
    const canonicalId = VWSWorkspaceTabUtils.canonicalSessionId(all.items, filename);
    if (canonicalId === null) return Number(currentId);
    const duplicateIds = (all.items || [])
      .filter(item => item.filename === filename)
      .map(item => Number(item.id))
      .filter(id => Number.isSafeInteger(id) && id >= 0 && id !== canonicalId);
    for (const id of duplicateIds) {
      try { await deleteSession(id); }
      catch (e) { dbg('duplicate archive delete failed', { id, filename, error: e.message || String(e) }); }
    }
    if (Number(currentId) !== canonicalId) dbg('duplicate archive coalesced', { currentId, canonicalId, filename });
    return canonicalId;
  }

  function normalWindows(wins) {
    return (wins || []).filter(w => w.type === 'normal');
  }



  const sleep = ms => new Promise(r => setTimeout(r, ms));

  function callApiMaybe(fn, args = []) {
    return new Promise((resolve, reject) => {
      let done = false;
      const cb = (result) => {
        if (done) return;
        done = true;
        const err = chrome.runtime && chrome.runtime.lastError;
        err ? reject(err) : resolve(result);
      };
      try {
        const ret = fn(...args, cb);
        // Some Vivaldi internal APIs are sync or promise-like and do not use a callback.
        if (ret && typeof ret.then === 'function') ret.then(x => { if (!done) { done = true; resolve(x); } }, reject);
        else if (ret !== undefined && fn.length <= args.length) { done = true; resolve(ret); }
        setTimeout(() => { if (!done) { done = true; resolve(ret); } }, 450);
      } catch (e) { reject(e); }
    });
  }

  async function tryActivateWorkspace(windowId, workspace) {
    if (!workspace || workspace.id === '__default__') return false;
    const id = Number(workspace.id);
    const tries = [];
    if (vivaldi.windowPrivate) {
      for (const name of ['setActiveWorkspace', 'activateWorkspace', 'selectWorkspace', 'switchWorkspace']) {
        if (typeof vivaldi.windowPrivate[name] === 'function') tries.push(() => callApiMaybe(vivaldi.windowPrivate[name].bind(vivaldi.windowPrivate), [windowId, id]));
      }
      if (typeof vivaldi.windowPrivate.update === 'function') {
        tries.push(() => callApiMaybe(vivaldi.windowPrivate.update.bind(vivaldi.windowPrivate), [windowId, { activeWorkspace: id }]));
        tries.push(() => callApiMaybe(vivaldi.windowPrivate.update.bind(vivaldi.windowPrivate), [windowId, { workspaceId: id }]));
      }
    }
    if (vivaldi.workspacesPrivate) {
      for (const name of ['setActive', 'activate', 'select', 'switchTo']) {
        if (typeof vivaldi.workspacesPrivate[name] === 'function') tries.push(() => callApiMaybe(vivaldi.workspacesPrivate[name].bind(vivaldi.workspacesPrivate), [id, windowId]));
      }
    }
    let last;
    for (const t of tries) {
      try { await t(); dbg('activate workspace ok', { windowId, id, name: workspace.name }); return true; }
      catch (e) { last = e; }
    }
    if (last) dbg('activate workspace failed', last.message || last);
    return false;
  }

  async function tryRenameWorkspace(windowId, workspace, newName) {
    if (!workspace || workspace.id === '__default__' || !newName) return false;
    const id = Number(workspace.id);
    const tries = [];
    if (vivaldi.windowPrivate) {
      for (const name of ['updateWorkspace', 'renameWorkspace']) {
        if (typeof vivaldi.windowPrivate[name] === 'function') {
          tries.push(() => callApiMaybe(vivaldi.windowPrivate[name].bind(vivaldi.windowPrivate), [windowId, id, { name: newName }]));
          tries.push(() => callApiMaybe(vivaldi.windowPrivate[name].bind(vivaldi.windowPrivate), [windowId, id, newName]));
        }
      }
    }
    if (vivaldi.workspacesPrivate) {
      for (const name of ['update', 'rename', 'updateWorkspace', 'renameWorkspace']) {
        if (typeof vivaldi.workspacesPrivate[name] === 'function') {
          tries.push(() => callApiMaybe(vivaldi.workspacesPrivate[name].bind(vivaldi.workspacesPrivate), [id, { name: newName }]));
          tries.push(() => callApiMaybe(vivaldi.workspacesPrivate[name].bind(vivaldi.workspacesPrivate), [id, newName]));
          tries.push(() => callApiMaybe(vivaldi.workspacesPrivate[name].bind(vivaldi.workspacesPrivate), [windowId, id, { name: newName }]));
        }
      }
    }
    let last;
    for (const t of tries) {
      try { await t(); dbg('rename workspace ok', { id, old: workspace.name, name: newName }); return true; }
      catch (e) { last = e; }
    }
    if (last) dbg('rename workspace failed', last.message || last);
    return false;
  }


  async function tryDeleteWorkspace(windowId, workspace) {
    if (!workspace || workspace.id === '__default__') return false;
    const id = Number(workspace.id);
    const tries = [];
    if (vivaldi.windowPrivate) {
      for (const name of ['deleteWorkspace', 'removeWorkspace', 'closeWorkspace']) {
        if (typeof vivaldi.windowPrivate[name] === 'function') {
          tries.push(() => callApiMaybe(vivaldi.windowPrivate[name].bind(vivaldi.windowPrivate), [windowId, id]));
          tries.push(() => callApiMaybe(vivaldi.windowPrivate[name].bind(vivaldi.windowPrivate), [id, windowId]));
        }
      }
    }
    if (vivaldi.workspacesPrivate) {
      for (const name of ['delete', 'remove', 'deleteWorkspace', 'removeWorkspace']) {
        if (typeof vivaldi.workspacesPrivate[name] === 'function') {
          tries.push(() => callApiMaybe(vivaldi.workspacesPrivate[name].bind(vivaldi.workspacesPrivate), [id]));
          tries.push(() => callApiMaybe(vivaldi.workspacesPrivate[name].bind(vivaldi.workspacesPrivate), [id, windowId]));
        }
      }
    }
    let last;
    for (const t of tries) {
      try { await t(); dbg('delete workspace ok', { id, name: workspace.name }); return true; }
      catch (e) { last = e; }
    }
    if (last) dbg('delete workspace failed', last.message || last);
    return false;
  }

  async function findWorkspaceByName(name) {
    const snap = await collectWorkspaceSnapshot().catch(() => null);
    if (!snap) return null;
    try { await deleteSession(snap.temp.id); } catch (_) {}
    return (snap.workspaces || []).find(w => w.name === name) || null;
  }

  async function getTargetNormalWindow(preferredId) {
    const wins = await getWins();
    const normals = normalWindows(wins);
    if (!normals.length) throw new Error('找不到普通 Vivaldi 窗口');
    return normals.find(w => w.id === preferredId) || normals.find(w => w.focused) || normals[0];
  }


  async function createNativeNewTabBeforeClose(ids, windowId) {
    const activeTabs = await queryActive(windowId).catch(() => []);
    const activeTab = activeTabs[0];
    const activeTabId = activeTab && activeTab.id;
    if (!activeTabId || !ids.includes(activeTabId)) return;

    // v2.3.5：不要用 chrome://newtab/ 去“改写”当前标签。
    // 在 Vivaldi 里这样容易留下一个看得见但渲染不出来的空标签。
    // 正确做法是让浏览器自己创建原生新标签页（不传 url），再关闭被收纳的旧标签。
    dbg('active tab will be closed; creating native blank tab first', { activeTabId, windowId: activeTab.windowId, index: activeTab.index });
    try {
      await p(cb => chrome.tabs.create({ windowId: activeTab.windowId, index: activeTab.index + 1, active: true }, cb));
      await new Promise(resolve => setTimeout(resolve, 260));
    } catch (e1) {
      dbg('native blank tab failed; fallback to about:blank', e1.message || e1);
      try {
        await p(cb => chrome.tabs.create({ windowId: activeTab.windowId, index: activeTab.index + 1, url: 'about:blank', active: true }, cb));
        await new Promise(resolve => setTimeout(resolve, 260));
      } catch (e2) {
        dbg('safety tab fallback failed', e2.message || e2);
      }
    }
  }

  function isOwnArchiveUiTab(t, extensionId) {
    if (!extensionId || !t || !t.url) return false;
    const prefix = 'chrome-extension://' + extensionId + '/';
    if (!String(t.url).startsWith(prefix)) return false;
    return /(?:archive|popup|options)\.html(?:[?#].*)?$/.test(String(t.url).slice(prefix.length));
  }

  async function removeTabs(ids) {
    for (const id of ids) {
      try { await p(cb => chrome.tabs.remove(id, cb)); }
      catch (e) { dbg('close failed', id, e.message || e); }
    }
  }

  async function makeTempSession(windowId) {
    const activeWin = await getTargetNormalWindow(windowId);
    const all = await getAllSessions();
    const uniq = Date.now();
    const tempItem = await addSessionAndFind({
      filename: 'vws-temp-' + uniq,
      name: 'VWS_TEMP_' + uniq,
      parentId: all.rootId || 2,
      index: 0,
      owner: 'user',
      windowId: activeWin.id,
    });
    return { id: tempItem.id, activeWinId: activeWin.id, rootId: all.rootId || 2 };
  }

  async function collectWorkspaceSnapshot(windowId) {
    const temp = await makeTempSession(windowId);
    try {
      const content = await getContent(temp.id);
      const workspaces = content.workspaces || [];
      const windows = content.windows || [];
      const win = windows.find(w => w.id === temp.activeWinId) || windows[0];
      const used = new Set(workspaces.flatMap(w => (w.tabs || []).map(t => t.id)));
      const defaultTabs = (win?.tabs || []).filter(t => !used.has(t.id));
      const list = workspaces.map(w => ({
        id: String(w.id),
        name: w.name || '工作区',
        emoji: w.emoji || '',
        tabCount: (w.tabs || []).length,
        tabs: (w.tabs || []).map(tabSummary),
        kind: 'workspace',
      }));
      if (defaultTabs.length) {
        list.unshift({
          id: '__default__',
          name: '默认 / 未分配',
          emoji: '',
          tabCount: defaultTabs.length,
          tabs: defaultTabs.map(tabSummary),
          kind: 'default',
        });
      }
      return { temp, content, workspaces: list };
    } catch (e) {
      try { await deleteSession(temp.id); } catch (_) {}
      throw e;
    }
  }

  const tabSummary = t => VWSWorkspaceTabUtils.tabSummary(t);

  async function getWorkspaces(targetWindowId) {
    state.lastDebug = [];
    dbg('getWorkspaces start', { targetWindowId });
    const snap = await collectWorkspaceSnapshot(targetWindowId);
    try { await deleteSession(snap.temp.id); } catch (e) { dbg('temp delete failed', e.message || e); }
    dbg('getWorkspaces done', snap.workspaces.map(w => ({ id: w.id, name: w.name, tabs: w.tabCount })));
    return { ok: true, workspaces: snap.workspaces };
  }

  async function chooseActiveWorkspaceFromSnapshot(snap, windowId) {
    const activeTabs = await queryActive(windowId).catch(() => []);
    const activeTabId = activeTabs[0] && activeTabs[0].id;
    let found = snap.workspaces.find(w => (w.tabs || []).some(t => t.id === activeTabId));
    if (!found) found = snap.workspaces[0];
    if (!found) throw new Error('当前窗口没有可收纳工作区');
    return found;
  }

  async function existingArchivedUrls() {
    const archives = await getArchives().catch(() => ({ archives: [] }));
    const urls = new Set();
    for (const ar of archives.archives || []) {
      for (const t of ar.tabsDetail || []) if (t.url) urls.add(t.url);
    }
    return urls;
  }

  async function stashWorkspaceNow({ workspaceId, targetWindowId = null, closeTabs = true, includePinned = false, allowDuplicates = true, extensionId = '' } = {}) {
    state.lastDebug = [];
    dbg('stashWorkspace start', { workspaceId, targetWindowId, closeTabs, includePinned, allowDuplicates, extensionId });
    const snap = await collectWorkspaceSnapshot(targetWindowId);
    let selected;
    try {
      if (workspaceId && workspaceId !== 'active') {
        selected = snap.workspaces.find(w => String(w.id) === String(workspaceId));
      } else {
        selected = await chooseActiveWorkspaceFromSnapshot(snap, snap.temp.activeWinId);
      }
      if (!selected) throw new Error('找不到指定工作区：' + workspaceId);
      let selectedTabs = (selected.tabs || []).filter(t => typeof t.id === 'number' && t.id >= 0);
      selectedTabs = selectedTabs.filter(t => !isOwnArchiveUiTab(t, extensionId));
      if (!includePinned) selectedTabs = selectedTabs.filter(t => !t.pinned);
      if (!allowDuplicates) {
        const existing = await existingArchivedUrls();
        selectedTabs = selectedTabs.filter(t => !t.url || !existing.has(t.url));
      }
      const ids = selectedTabs.map(t => t.id);
      dbg('selected workspace', { id: selected.id, name: selected.name, ids, filteredTabs: selectedTabs.length });
      if ((selected.tabs || []).length && !ids.length) {
        dbg('selected workspace tab IDs are not closable', (selected.tabs || []).map(t => t.id));
      }
      if (!ids.length) throw new Error('该工作区没有可收纳标签，可能全部是固定标签或重复项');
      const all = await getAllSessions();
      const now = new Date();
      const label = `${NAME_PREFIX}${selected.name} · ${ids.length}个标签页 · ${now.toLocaleString()}`;
      const archiveFilename = VWSWorkspaceTabUtils.archiveOperationFilename(selected.id, ids, now.getTime());
      const archiveItem = await addSessionAndFind({
        filename: archiveFilename,
        name: label,
        parentId: all.rootId || snap.temp.rootId || 2,
        index: 0,
        owner: 'user',
        ids,
      });
      const canonicalArchiveId = await reconcileDuplicateArchive(archiveFilename, archiveItem.id);
      try { await deleteSession(snap.temp.id); } catch (e) { dbg('temp delete failed', e.message || e); }
      if (closeTabs && canonicalArchiveId === archiveItem.id) {
        await createNativeNewTabBeforeClose(ids, snap.temp.activeWinId);
        await removeTabs(ids);
      }
      dbg('archive created', { id: canonicalArchiveId, tabs: archiveItem.tabs });
      return { ok: true, archiveId: canonicalArchiveId, workspaceId: selected.id, workspaceName: selected.name, tabs: ids.length };
    } catch (e) {
      try { await deleteSession(snap.temp.id); } catch (_) {}
      throw e;
    }
  }

  function stashWorkspace(options = {}) {
    const key = `${options.targetWindowId || 'focused'}:${options.workspaceId || 'active'}`;
    return runStashOnce(key, () => stashWorkspaceNow(options));
  }

  function parseArchiveName(name) {
    const restored = String(name || '').startsWith('已恢复 · ');
    const n = String(name || '').replace(/^已恢复 · /, '').replace(NAME_PREFIX, '');
    const parts = n.split(' · ');
    return {
      displayName: n,
      workspaceName: (parts[0] || n).trim(),
      timeText: parts.slice(2).join(' · '),
      restored,
    };
  }

  async function archiveTabsDetail(id) {
    try {
      const c = await getContent(id);
      const wsTabs = (c.workspaces || []).flatMap(w => (w.tabs || []).map(tabSummary));
      const winTabs = (c.windows || []).flatMap(w => (w.tabs || []).map(tabSummary));
      const seen = new Set();
      return [...wsTabs, ...winTabs].filter(t => {
        const k = t.id + ':' + t.url;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } catch (e) {
      dbg('archive content failed', id, e.message || e);
      return [];
    }
  }

  async function getArchives() {
    const all = await getAllSessions();
    const base = (all.items || [])
      .filter(x => x.id !== all.trashId)
      .filter(x => x.name && (x.name.startsWith(NAME_PREFIX) || x.name.startsWith('已恢复 · ' + NAME_PREFIX)))
      .filter(x => x.tabs > 0);
    const items = [];
    for (const x of base) {
      const parsed = parseArchiveName(x.name);
      items.push({
        id: x.id,
        name: parsed.displayName,
        workspaceName: parsed.workspaceName,
        timeText: parsed.timeText,
        restored: parsed.restored,
        rawName: x.name,
        tabs: x.tabs,
        windows: x.windows,
        createDateJS: x.createDateJS,
        modifyDateJS: x.modifyDateJS,
        workspaces: (x.workspaces || []).map(w => ({ id: w.id, name: w.name, tabCount: (w.tabs || []).length })),
        tabsDetail: await archiveTabsDetail(x.id),
      });
    }
    items.sort((a, b) => Number(b.createDateJS || b.modifyDateJS || b.id || 0) - Number(a.createDateJS || a.modifyDateJS || a.id || 0));
    return { ok: true, archives: items };
  }

  async function openArchive({ id, removeAfter = false, targetWindowId = null, newWindow = false } = {}) {
    if (!id) throw new Error('缺少归档 ID');
    state.lastDebug = [];
    const all = await getAllSessions();
    const item = (all.items || []).find(x => Number(x.id) === Number(id));
    const parsed = parseArchiveName(item && item.name);
    const workspaceName = parsed.workspaceName || '已恢复工作区';
    const win = newWindow ? { id: 0 } : await getTargetNormalWindow(targetWindowId);

    // v2.3.9：优先切到原工作区，然后把 Session 作为普通标签页打开。
    // 这样“全部还原 / 还原并删除”会落回原来的工作区，而不是当前工作区。
    let openedByWorkspaceTabs = false;
    if (!newWindow) {
      const targetWs = await findWorkspaceByName(workspaceName);
      if (targetWs) {
        const activated = await tryActivateWorkspace(win.id, targetWs);
        if (activated) {
          await sleep(180);
          await p(cb => vivaldi.sessionsPrivate.open(
            Number(id),
            win.id,
            { newWindow: false, oneWindow: true, tabIds: [], withWorkspace: false, workspaceAsTabs: true },
            cb,
          ));
          openedByWorkspaceTabs = true;
        }
      } else {
        dbg('target workspace not found', workspaceName);
      }
    }

    // 兜底：Vivaldi 原生按工作区恢复。某些版本会创建“已恢复工作区”，恢复后尝试改名。
    if (!openedByWorkspaceTabs) {
      const beforeSnap = await collectWorkspaceSnapshot().catch(() => null);
      const beforeIds = new Set((beforeSnap?.workspaces || []).map(w => String(w.id)));
      if (beforeSnap) { try { await deleteSession(beforeSnap.temp.id); } catch (_) {} }
      await p(cb => vivaldi.sessionsPrivate.open(
        Number(id),
        win.id,
        { newWindow: !!newWindow, oneWindow: true, tabIds: [], withWorkspace: true, workspaceAsTabs: false },
        cb,
      ));
      await sleep(350);
      const afterSnap = await collectWorkspaceSnapshot().catch(() => null);
      const afterWorkspaces = afterSnap?.workspaces || [];
      const candidates = afterWorkspaces.filter(w => !beforeIds.has(String(w.id)) || /已恢复工作区|Restored Workspace/i.test(w.name || ''));
      const candidate = candidates.sort((a, b) => (b.tabCount || 0) - (a.tabCount || 0))[0];
      if (candidate && workspaceName && candidate.name !== workspaceName) {
        // Vivaldi 恢复带工作区的 Session 时，经常会新建“已恢复工作区”。
        // 如果原工作区还存在且为空，先删除原空工作区，再把新恢复出来的工作区改回原名。
        // 如果删除失败，就把原工作区临时改名，释放原名，再改恢复工作区。
        const original = afterWorkspaces.find(w => String(w.name) === String(workspaceName) && String(w.id) !== String(candidate.id));
        if (original && (original.tabCount || 0) === 0) {
          const deleted = await tryDeleteWorkspace(win.id, original);
          if (!deleted) await tryRenameWorkspace(win.id, original, workspaceName + '（旧）');
          await sleep(180);
        }
        const renamed = await tryRenameWorkspace(win.id, candidate, workspaceName);
        if (!renamed) dbg('rename restored workspace to original name failed', { from: candidate.name, to: workspaceName });
      }
      if (afterSnap) { try { await deleteSession(afterSnap.temp.id); } catch (_) {} }
    }

    if (removeAfter) await deleteSession(Number(id));
    return { ok: true, id: Number(id), removed: !!removeAfter, targetWindowId: win.id, workspaceName, workspaceAware: true };
  }

  async function deleteArchive({ id } = {}) {
    if (!id) throw new Error('缺少归档 ID');
    await deleteSession(Number(id));
    return { ok: true, id: Number(id) };
  }

  async function cleanupTemps() {
    const all = await getAllSessions();
    const temps = (all.items || []).filter(x => x.name && /VWS_TEMP_|__VWS_TEMP__/.test(x.name));
    for (const t of temps) {
      try { await deleteSession(t.id); } catch (e) { dbg('cleanup temp failed', t.id, e.message || e); }
    }
    return { ok: true, deleted: temps.length };
  }

  async function markRestored({ id } = {}) {
    if (!id) throw new Error('缺少归档 ID');
    const all = await getAllSessions();
    const item = (all.items || []).find(x => Number(x.id) === Number(id));
    if (!item) throw new Error('找不到归档：' + id);
    if (String(item.name || '').startsWith('已恢复 · ')) return { ok: true, id: Number(id), name: item.name };
    const name = '已恢复 · ' + item.name;
    await renameSession(Number(id), name);
    return { ok: true, id: Number(id), name };
  }

  async function handleCommand(message, senderWindowId = null) {
    if (!message || message.namespace !== 'VWS') return null;
    const cmd = message.cmd;
    const targetWindowId = VWSWorkspaceTabUtils.resolveTargetWindowId(senderWindowId, message.targetWindowId);
    if (cmd === 'PING') return { ok: true, version: MOD };
    if (cmd === 'GET_WORKSPACES') return getWorkspaces(targetWindowId);
    if (cmd === 'STASH_ACTIVE') return stashWorkspace({ workspaceId: 'active', targetWindowId, closeTabs: message.closeTabs !== false, includePinned: !!message.includePinned, allowDuplicates: message.allowDuplicates !== false, extensionId: message.extensionId || '' });
    if (cmd === 'STASH_WORKSPACE') return stashWorkspace({ workspaceId: message.workspaceId, targetWindowId, closeTabs: message.closeTabs !== false, includePinned: !!message.includePinned, allowDuplicates: message.allowDuplicates !== false, extensionId: message.extensionId || '' });
    if (cmd === 'GET_ARCHIVES') return getArchives();
    if (cmd === 'RESTORE_ARCHIVE') return openArchive({ id: message.id, removeAfter: false, targetWindowId: message.targetWindowId, newWindow: !!message.newWindow });
    if (cmd === 'RESTORE_DELETE_ARCHIVE') return openArchive({ id: message.id, removeAfter: true, targetWindowId: message.targetWindowId, newWindow: !!message.newWindow });
    if (cmd === 'DELETE_ARCHIVE') return deleteArchive({ id: message.id });
    if (cmd === 'MARK_RESTORED') return markRestored({ id: message.id });
    if (cmd === 'CLEANUP_TEMPS') return cleanupTemps();
    if (cmd === 'DEBUG') return { ok: true, version: MOD, href: location.href, lastDebug: state.lastDebug, hasVivaldi: hasApi(), vivaldiKeys: Object.keys(vivaldi || {}), windowPrivateKeys: Object.keys(vivaldi.windowPrivate || {}), workspacesPrivateKeys: Object.keys(vivaldi.workspacesPrivate || {}), sessionsKeys: Object.keys(vivaldi.sessionsPrivate || {}) };
    throw new Error('未知命令：' + cmd);
  }

  async function dispatch(message, senderWindowId = null) {
    try { return await handleCommand(message, senderWindowId); }
    catch (e) { console.error('[VWS] command error', message, e); return { ok: false, error: e.message || String(e), lastDebug: state.lastDebug }; }
  }

  // Extension to JSMod bridge.
  if (chrome.runtime && chrome.runtime.onMessageExternal) {
    chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
      if (!message || message.namespace !== 'VWS') return;
      dispatch(message, sender?.tab?.windowId).then(sendResponse);
      return true;
    });
  }

  // Also expose local console API.
  window.vwsBridge = {
    version: MOD,
    send: dispatch,
    getWorkspaces,
    stashActive: (opts = {}) => stashWorkspace({ workspaceId: 'active', closeTabs: true, ...opts }),
    stashWorkspace: (workspaceId, opts = {}) => stashWorkspace({ workspaceId, closeTabs: true, ...opts }),
    getArchives,
    restore: id => openArchive({ id, removeAfter: false }),
    restoreDelete: id => openArchive({ id, removeAfter: true }),
    delete: id => deleteArchive({ id }),
    markRestored: id => markRestored({ id }),
    cleanupTemps,
    debug: () => ({ version: MOD, href: location.href, lastDebug: state.lastDebug, hasVivaldi: hasApi() }),
  };

  log('bridge loaded');
})();
