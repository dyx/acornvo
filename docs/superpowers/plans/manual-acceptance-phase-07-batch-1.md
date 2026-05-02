# Phase 07 — Acceptance Batch 1 (tasks 8.1–8.6)

Run `npm run dev` and execute each scenario. Each step has an explicit pass criterion.

## 8.1 Library → Editor navigation latency

1. Open a grove with at least one .md file (e.g. `inbox/sample.md`).
2. Open Chromium DevTools → Performance tab → start recording.
3. In Library, click "打开编辑器" on a file row.
4. Wait for the editor's Vditor host to appear; stop recording.

**Pass:**
- URL changes to `/editor/<encoded>`.
- Vditor host (`[data-testid=vditor-host]`) is visible within 300ms of the click (read off the Performance flame chart's "Frames" track).
- No 4xx/5xx in DevTools Network tab.

**Result (run on YYYY-MM-DD):** PENDING

## 8.2 Type "hello" → debounce → disk

1. With a known file `inbox/sample.md` open in editor, note its current content.
2. Type the literal characters `hello` at the end of the body.
3. Stop typing for ≥1.5 seconds.
4. In a terminal:
   ```bash
   tail -c 200 path/to/grove/inbox/sample.md
   ```

**Pass:**
- The file's body ends with `hello\n`.
- The dirty dot disappears in the TitleBar after the save lands.
- `stat -f %m path/to/grove/inbox/sample.md` reports a newer mtime than before the edit.

**Result (run on YYYY-MM-DD):** PENDING

## 8.3 20 keystrokes < 1s coalesce

1. With a file open, place the cursor at the end of the body.
2. Quickly type 20 distinct characters within ~800ms (e.g. `abcdefghijklmnopqrst`).
3. Stop typing.
4. In Chromium DevTools → Network tab, filter by "ipc" or expand the renderer-side log.

**Pass:**
- After ~1s of stillness, exactly **one** `file.writeParsed` IPC call fires (not 20).
- Final disk content contains all 20 characters in order.

**Result (run on YYYY-MM-DD):** PENDING

## 8.4 Cmd+S immediately flushes

1. Type 5 characters but stop just under 1s (do not let debounce fire).
2. Hit `Cmd+S` (mac) / `Ctrl+S` (win/linux).

**Pass:**
- Within ~50ms the saving pulse appears, then the dirty dot disappears.
- File on disk reflects the 5 new characters.
- The browser's default "save page" dialog does NOT appear.

**Result (run on YYYY-MM-DD):** PENDING

## 8.5 Route round-trip preserves content

1. With a file open in editor, type 3 characters.
2. Wait for the save (dirty dot clears).
3. Click "← 返回果仓" to navigate back to Library.
4. Click "打开编辑器" on the SAME file again.

**Pass:**
- Editor reopens with the 3 characters present in the body (verifies round-trip read after write).
- DevTools "Memory" tab → "Detached DOM" count does NOT show the previous Vditor instance leaking (snapshot before/after).

**Result (run on YYYY-MM-DD):** PENDING

## 8.6 Window hide via macOS Cmd+H persists last input

1. Type 2 characters in editor body.
2. Press `Cmd+H` (mac) before debounce fires (within 1s of typing).
3. Inspect file on disk via `tail -c 100 …`.

**Pass:**
- Even though debounce did NOT fire, the file already reflects the 2 characters because `visibilitychange=hidden` triggered `flushSave()`.
- (On linux/win: minimise the window or switch desktop — same expectation.)

**Result (run on YYYY-MM-DD):** PENDING
