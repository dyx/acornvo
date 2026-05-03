# Phase 09 Conflict Handling — Manual Smoke Checklist

Run after a fresh `npm run dev`. All scenarios assume:
- A grove is opened at `~/scratch/conflict-test/`
- A file `notes/a.md` exists with body "BASE"

## 9.5 Dialog 保留本地 → disk overwritten + force-write audit

1. Open `notes/a.md` in the editor; type a few characters → dirty.
2. In a separate terminal, overwrite the file:
   ```bash
   echo 'EXTERNAL' > ~/scratch/conflict-test/notes/a.md
   ```
3. Continue typing in the editor (debounce will fire `save()` within ~1s).
4. **Expect:** ConflictDialog opens.
5. Click "保留本地".
6. **Verify:** `cat ~/scratch/conflict-test/notes/a.md` shows the editor's body (not "EXTERNAL").
7. **Verify:** `ls ~/scratch/conflict-test/.acornvo/conflicts/` lists a fresh `<id>` directory containing `local.md`, `remote.md`, `base.md`, `meta.json`. `meta.json` has `"resolved_by": "keep_local"`.
8. **Verify the force-write audit log:**
   ```bash
   tail -n 50 ~/Library/Logs/acornvo/main.log | grep force-write
   ```
   Expected: a line like `force-write { path: ".../notes/a.md", old_mtime: <number>, expected_mtime: <number> }`.

## 9.6 Dialog 重载磁盘 → editor shows remote + snapshot

1. Repeat steps 1–4 from 9.5.
2. Click "重载磁盘".
3. **Verify:** editor body now reads "EXTERNAL".
4. **Verify:** snapshot directory exists with `meta.resolved_by = "load_remote"`.
5. **Verify:** dirty indicator (TitleBar dot) is cleared.

## 9.7 Dialog 另存副本 → new sibling file + navigation

1. Repeat steps 1–4 from 9.5.
2. Click "另存副本".
3. **Verify:** the URL changes to `/editor/notes%2Fa.conflict.<TS>.md`.
4. **Verify:** `ls ~/scratch/conflict-test/notes/` lists both `a.md` (with "EXTERNAL" content) and `a.conflict.<TS>.md` (with the editor's local body).
5. **Verify:** snapshot directory exists with `meta.resolved_by = "save_as"` and `meta.winner_path = "notes/a.conflict.<TS>.md"`.

## Sign-off

Tester: __________________  Date: __________________

All boxes checked? ☐
