# Phase 07 — Acceptance Batch 2 (tasks 8.7–8.14)

Run `npm run dev` for the interactive scenarios. Each step has an explicit pass criterion.

## 8.7 Image paste is intercepted

1. Copy any small PNG to clipboard (e.g. screenshot).
2. With a `.md` open in editor, place the cursor at the end of body and `Cmd/Ctrl+V`.

**Pass:**

- A toast appears with the text "尚未支持图片粘贴，将在拾果阶段接入".
- The body does NOT receive a `data:image/...` URL or any image markup.
- Vditor doesn't fire an upload request (DevTools Network tab → no POST).

**Result (run on YYYY-MM-DD):** PENDING

## 8.8 ir-mode round-trip is byte-equal except trailing LF

1. Choose a representative file (with `*` italics, `_` italics, code fences, lists). Compute its hash:
   ```bash
   shasum -a 256 path/to/grove/notes/sample.md > /tmp/before.sha
   ```
2. Open it in editor.
3. Wait for `ready` state. Do NOT type anything.
4. Hit `Cmd+S` to flush.
5. Compute hash again:
   ```bash
   shasum -a 256 path/to/grove/notes/sample.md > /tmp/after.sha
   diff /tmp/before.sha /tmp/after.sha
   ```

**Pass:**

- `diff` shows the hashes are identical, OR if they differ, `git diff path/to/grove/notes/sample.md` shows ONLY trailing-LF changes.
- Mixed `*` and `_` italics survive.
- Code fences, lists, headings preserved exactly.

**Result (run on YYYY-MM-DD):** PENDING

## 8.9 External mtime change → toast

1. Open `path/to/grove/notes/sample.md` in editor (do not type).
2. In a terminal:
   ```bash
   touch path/to/grove/notes/sample.md
   ```
3. In the editor, type a single character.
4. Wait 1s for debounce + save attempt.

**Pass:**

- A toast appears: "文件在外部被修改，请先刷新".
- The dirty dot stays visible (the body was NOT overwritten on disk).
- Subsequent `cat path/to/grove/notes/sample.md` shows it does NOT contain the new character.

**Result (run on YYYY-MM-DD):** PENDING

## 8.10 5000-row Library does not flicker during edit

1. Use a grove with ≥5000 indexed `.md` files.
2. Open Library, then click "打开编辑器" on any file.
3. Type continuously in editor for 30 seconds.
4. Switch back to Library briefly.

**Pass:**

- Library list does NOT re-render or flicker during the typing.
- DevTools React Profiler shows zero re-renders of `<VirtualFileList>` rows triggered by the editor's writes.

**Result (run on YYYY-MM-DD):** PENDING

## 8.11 Offline Vditor assets load

1. Disconnect from the network (turn off Wi-Fi).
2. Quit Acornvo.
3. Relaunch.
4. Open any file in editor.

**Pass:**

- Vditor renders icons.
- DevTools Network tab shows zero failed requests for `vditor` assets — every asset comes from `/vditor/...`.
- `npm run build && ls out/renderer/vditor` confirms assets in build output.

**Result (run on YYYY-MM-DD):** PENDING

## 8.12 Full frontmatter rail + open-external

1. Open a file with rich frontmatter (category, site, title, rating, summary, highlights, tags, dates).
2. Inspect the right rail.
3. Click the "在系统文本编辑器中打开" button.

**Pass:**

- Rail shows all fields correctly.
- Click → OS opens the file in the user's default text editor.

**Result (run on YYYY-MM-DD):** PENDING

## 8.13 Watcher delete during edit → editor reflects "file removed"

1. Open `notes/sample.md` in editor.
2. In a terminal: `rm path/to/grove/notes/sample.md`.
3. Wait up to 2s for the watcher to fire `index:fileChanged`.
4. Type a single character in the editor.

**Pass:**

- The store transitions to `{ kind: 'error', error: 'E_NOT_FOUND' }` on the next save attempt.
- The error view appears with "文件已被移除或重命名".

**Result (run on YYYY-MM-DD):** PENDING

## 8.14 `openspec validate phase-07-vditor-editor-autosave --strict`

Run:

```bash
openspec validate phase-07-vditor-editor-autosave --strict
```

**Pass:**

- Exit code 0, "OK" or equivalent.

**Result (run on YYYY-MM-DD):** PENDING
