# Workspace Tab ID Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow workspace tabs whose Vivaldi session IDs are decimal strings to be archived and closed safely.

**Architecture:** Keep the session snapshot as the source of workspace membership. Normalize only non-negative integer IDs at the bridge boundary, so all later selection and close operations use `chrome.tabs` numeric IDs. Invalid or absent IDs remain excluded and are logged for diagnosis rather than being guessed from URL or title.

**Tech Stack:** Plain JavaScript JSMod, Node.js built-in `node:test`, Bash documentation/install workflow.

---

### Task 1: Add a tested session-tab ID normalizer

**Files:**
- Create: `vws-jsmod/workspace-tab-utils.js`
- Create: `tests/workspace-tab-utils.test.js`

- [x] **Step 1: Write the failing test**

```js
test('normalizes a decimal session tab ID string', () => {
  assert.equal(normalizeTabId('1307'), 1307);
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/workspace-tab-utils.test.js`

Expected: FAIL because `workspace-tab-utils.js` does not exist.

- [x] **Step 3: Write the minimal implementation**

```js
function normalizeTabId(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    const id = Number(value);
    return Number.isSafeInteger(id) ? id : null;
  }
  return null;
}
```

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/workspace-tab-utils.test.js`

Expected: PASS for numeric IDs, decimal-string IDs, and invalid IDs.

### Task 2: Use normalized IDs in the bridge and expose invalid data in diagnostics

**Files:**
- Modify: `vws-jsmod/vivaldi-workspace-bridge.js:1-10,273-281,333`
- Modify: `vws-jsmod/install.sh:10-37`

- [x] **Step 1: Write the failing integration assertion**

```js
test('produces a closable tab summary from a string session ID', () => {
  assert.deepEqual(tabSummary({ id: '42', url: 'https://example.test' }), {
    id: 42,
    title: 'https://example.test',
    url: 'https://example.test',
    pinned: false,
    index: undefined,
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run: `node --test tests/workspace-tab-utils.test.js`

Expected: FAIL because the production summary does not normalize string IDs.

- [x] **Step 3: Implement the minimal integration**

```js
id: VWSWorkspaceTabUtils.normalizeTabId(t.id),
```

Copy `workspace-tab-utils.js` into Vivaldi resources and inject it before `vivaldi-workspace-bridge.js`. Extend the `selected workspace` debug record with raw session ID values when the selected workspace has tabs but none are closable.

- [x] **Step 4: Run test to verify it passes**

Run: `node --test tests/workspace-tab-utils.test.js`

Expected: PASS.

### Task 3: Document release actions

**Files:**
- Modify: `README.md:62-71`

- [x] **Step 1: Write the release matrix**

```markdown
| Changed files | Required action |
| --- | --- |
| `vws-extension/**` | Reload the extension in `vivaldi://extensions`. |
| `vws-jsmod/**` | Run `bash vws-jsmod/install.sh`, then fully restart Vivaldi. |
```

- [x] **Step 2: Verify documentation references both release actions**

Run: `rg -n '重新加载扩展|重新运行.*install\.sh|完全退出' README.md`

Expected: The release section explicitly states both conditions and actions.
