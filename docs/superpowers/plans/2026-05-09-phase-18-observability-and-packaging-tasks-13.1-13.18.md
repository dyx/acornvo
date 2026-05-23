# Phase 18 — Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to walk this plan task-by-task. This plan exercises **already-built** features against acceptance criteria — most tasks are manual verification, with a few small repro scripts to make them reproducible. Steps use checkbox (`- [ ]`) syntax for tracking.

**Plan Index:** 5 of 5 for `phase-18-observability-and-packaging`
**OpenSpec tasks covered:** 13.1, 13.2, 13.3, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 13.12, 13.13, 13.14, 13.15, 13.16, 13.17, 13.18

**Status:** Ready
**Last Updated:** 2026-05-09
**Plan branch:** `phase-19-ui-remediation`

**Sources:**

- `openspec/changes/phase-18-observability-and-packaging/tasks.md` (§13)
- All Plan 1–4 deliverables

**Out of scope:**

- Any new code that isn't already shipped by Plans 1–4. If a verification task uncovers a missing implementation detail, file a follow-up commit on the relevant feature plan rather than expanding scope here.

**Open issues:**

- macOS notarization (13.12) is gated on having Apple Developer credentials available. If running unsigned, document the Gatekeeper warning behavior instead.
- Tag-push verification (13.15) requires GitHub Actions secrets to be configured. If running locally, verify the workflow file syntax with `actionlint` and skip the live tag push.

**Verification methodology**

Each task is one **Manual Verification Step**. The pattern:

1. **Setup** — exact commands to put the system into the precondition state.
2. **Action** — the user-visible step.
3. **Assertion** — what to observe; explicit pass criteria.
4. **Mark** — when the assertion passes, check the box and (optionally) sync to OpenSpec via the executing-plans skill.

If a step fails, **stop** and open an issue / fix on the originating plan. Don't paper over.

---

<!-- openspec-task: 13.1 -->

### Task 1: Boot writes a dated log + opening info line

- [ ] **Setup**

```bash
rm -rf "$HOME/Library/Application Support/acornvo/logs"
npm run dev
```

(Adjust path on Linux: `~/.config/acornvo/logs`; Windows: `%APPDATA%\acornvo\logs`.)

- [ ] **Action**

Wait for the app window to appear.

- [ ] **Assertion**

```bash
ls "$HOME/Library/Application Support/acornvo/logs"
# expect: app-YYYY-MM-DD.log
head -1 "$HOME/Library/Application Support/acornvo/logs/app-$(date -u +%Y-%m-%d).log"
# expect a JSON Line with { "level": "info", "area": "app", "op": "boot" }
```

PASS criteria: file exists with today's UTC date; first line is valid JSON; `area === "app"` and `op === "boot"`.

---

<!-- openspec-task: 13.2 -->

### Task 2: Clipper / search / agent operations write JSON Lines per area

- [ ] **Setup**

App still running from Task 1.

- [ ] **Action**

1. Trigger a clip (use existing browser → save flow).
2. Run a search query in the search bar.
3. Send a single chat message that requires a tool call (any agent step).

- [ ] **Assertion**

```bash
LOG="$HOME/Library/Application Support/acornvo/logs/app-$(date -u +%Y-%m-%d).log"
grep -c '"area":"clipper"'  "$LOG"   # ≥ 1
grep -c '"area":"search.query"' "$LOG"  # ≥ 1   (perf instrumentation; logger may also emit)
grep -c '"area":"agent"' "$LOG"  # ≥ 1
```

Verify each line parses as JSON and has the required fields (`ts`, `level`, `area`, optional `op`, `ok`, `ms`, `meta`):

```bash
tail -n 100 "$LOG" | python3 -c "import json,sys
ok=True
for line in sys.stdin:
    line=line.strip()
    if not line: continue
    o=json.loads(line)
    for k in ('ts','level','area'):
        if k not in o: ok=False; print('missing',k,'in',o); break
print('OK' if ok else 'FAIL')"
```

PASS: prints `OK` and at least one entry per area.

---

<!-- openspec-task: 13.3 -->

### Task 3: Boot rotate trims to ≤ 40MB and deletes >7-day files

- [ ] **Setup**

Stop the app. Then:

```bash
LOG_DIR="$HOME/Library/Application Support/acornvo/logs"
rm -rf "$LOG_DIR" && mkdir -p "$LOG_DIR"
# Create 6 fresh files of 10MB each = 60MB
for i in 0 1 2 3 4 5; do
  dd if=/dev/zero of="$LOG_DIR/app-fresh-$i.log" bs=1m count=10 2>/dev/null
done
# Create one 8-day-old file
touch -t $(date -u -v-8d +%Y%m%d0000) "$LOG_DIR/app-old.log"
echo old > "$LOG_DIR/app-old.log"
ls -lh "$LOG_DIR" && du -sh "$LOG_DIR"
```

- [ ] **Action**

Run: `npm run dev`. Wait for the app to fully boot.

- [ ] **Assertion**

```bash
ls "$LOG_DIR"
du -sh "$LOG_DIR"
```

PASS:

- `app-old.log` is gone (older than 7 days).
- Total size ≤ 40MB.
- A new `app-YYYY-MM-DD.log` for today exists.

---

<!-- openspec-task: 13.4 -->

### Task 4: Search query writes `perf_samples` row + observability shows P50/P95

- [ ] **Setup**

App running. Open `Settings → Observability → Performance`.

- [ ] **Action**

In the search bar, run 10–20 queries with varied terms.

- [ ] **Assertion**

In `Settings → Observability → Performance`, the row `search.query` shows:

- `count` ≥ 10
- `p50` and `p95` are non-zero numbers
- `successRate` is `100%` (assuming no errors)

Cross-check at the DB level (via the existing Phase-13 settings db handle or a SQLite cli):

```bash
# Find your db path (printed at boot or in app.getPath('userData')/db.sqlite)
sqlite3 "<db-path>" "SELECT COUNT(*), area FROM perf_samples WHERE area='search.query' GROUP BY area;"
# expect: COUNT >= 10, area = search.query
```

PASS: UI numbers match DB row count, both > 0.

---

<!-- openspec-task: 13.5 -->

### Task 5: Renderer crash → next-boot banner → Ignore moves to acked/

- [ ] **Setup**

App running.

- [ ] **Action — induce a renderer crash**

In renderer DevTools (dev build) console:

```js
process.crash()
```

The renderer dies. Reopen the window via the app menu.

Alternative: write a synthetic crash file and restart:

```bash
mkdir -p "$HOME/Library/Application Support/acornvo/logs/crashes"
cat > "$HOME/Library/Application Support/acornvo/logs/crashes/renderer-$(date -u +%Y-%m-%d-%H%M%S).log" <<EOF
{"ts":"2026-05-09T00:00:00Z","kind":"renderer","reason":"test","details":{}}
EOF
# stop and restart the app
```

- [ ] **Assertion**

After app restart:

- The crash banner (`data-testid="crash-banner"`) appears at the top of the window.
- It says "Acornvo recovered from a crash on the previous run (1 report)." (or similar i18n text).

Click **Ignore**.

```bash
ls "$HOME/Library/Application Support/acornvo/logs/crashes/"
ls "$HOME/Library/Application Support/acornvo/logs/crashes/acked/"
```

PASS:

- The original `renderer-*.log` is no longer in `crashes/` (only `crashes/acked/` and `crashes/minidumps/`).
- It is now in `crashes/acked/`.
- The banner disappears.

---

<!-- openspec-task: 13.6 -->

### Task 6: Diagnostic bundle export — Downloads zip, opens Finder/Explorer, secrets redacted

- [ ] **Setup**

App running. Ensure at least one log line contains a synthetic secret:

```bash
LOG="$HOME/Library/Application Support/acornvo/logs/app-$(date -u +%Y-%m-%d).log"
echo '{"ts":"2026-05-09T00:00:00Z","level":"info","area":"ai","msg":"sk-proj-deadbeef0123456789"}' >> "$LOG"
```

- [ ] **Action**

In the app, navigate to `Settings → Observability` and click **Export Diagnostic Bundle**.

- [ ] **Assertion**

- A Finder (or Explorer) window opens showing the new file.
- The file is `~/Downloads/Acornvo-Diagnostics-YYYYMMDD-HHMMSS.zip`.

```bash
LATEST=$(ls -t ~/Downloads/Acornvo-Diagnostics-*.zip | head -1)
unzip -p "$LATEST" "logs/app-$(date -u +%Y-%m-%d).log" | grep "sk-proj-"
# expect no match (secrets redacted)
unzip -p "$LATEST" "logs/app-$(date -u +%Y-%m-%d).log" | grep "REDACTED:api-key"
# expect at least one match
unzip -l "$LATEST" | grep -E '(about\.json|env\.json)'
# expect both about.json and env.json present
```

PASS:

- `sk-proj-...` does not appear in the zipped log.
- `[REDACTED:api-key]` does appear.
- `about.json` and `env.json` are present.
- The original log on disk **still has the original secret** (only the zip copy is scrubbed).

---

<!-- openspec-task: 13.7 -->

### Task 7: Observability AI tab — totals, profile bar, tool counts

- [ ] **Setup**

App running. Run a few clip-AI-review or chat operations to populate `ai_usage` and `tool_calls`.

- [ ] **Action**

`Settings → Observability → AI`. Toggle through 24h / 7d / 30d.

- [ ] **Assertion**

- `obs-ai-total-requests`, `obs-ai-total-tokens`, `obs-ai-cost` all show numbers ≥ what you triggered.
- `obs-ai-profile-bars` shows a bar per profile that produced traffic.
- `obs-ai-tools` lists each tool name with its call count (look up in the DB if necessary):

```bash
sqlite3 "<db-path>" "SELECT tool_name, COUNT(*) FROM tool_calls GROUP BY tool_name;"
```

PASS: UI counts equal (or exceed when within window) DB counts.

---

<!-- openspec-task: 13.8 -->

### Task 8: Observability Queue tab — failed retry → pending → consumed

- [ ] **Setup**

Force-fail a job. Easiest path: temporarily break `electron/queue/handlers/ai-review-clip.ts` (e.g., throw at the top), trigger an AI review on a clip, then revert the change and re-build.

Alternative: insert a fake failed job with `kind='ai-review-clip'` directly:

```bash
sqlite3 "<db-path>" \
  "INSERT INTO jobs (id, kind, payload, status, last_error, updated_at, created_at)
   VALUES ('test-fail-1', 'ai-review-clip', '{\"clipId\":\"x\"}', 'failed', 'simulated', datetime('now'), datetime('now'));"
```

- [ ] **Action**

`Settings → Observability → Queue`. Locate `test-fail-1`. Click **Retry**.

- [ ] **Assertion**

Within 5s (the polling interval):

- The failed row disappears (or moves to running) once the runner picks it up.
- `pending` or `running` count increments by 1.
- After the runner consumes it, the row's `status` flips to `succeeded` (or back to `failed` if the underlying handler still fails — that's correct behavior).

```bash
sqlite3 "<db-path>" "SELECT id, status FROM jobs WHERE id='test-fail-1';"
```

PASS: status changed from `failed` to `pending` → eventually `running`/`succeeded` (or back to `failed` after a real attempt).

---

<!-- openspec-task: 13.9 -->

### Task 9: About page — version / hash / runtime / licenses top 20 + expand

- [ ] **Setup**

Production build first (so `__GIT_HASH__` is the real short hash, and `licenses.json` is bundled):

```bash
npm run generate:licenses
npm run build
npm run start  # electron-vite preview launches the production-built app
```

- [ ] **Action**

`Settings → About`.

- [ ] **Assertion**

- `about-version` matches `package.json.version`.
- `about-hash` matches `git rev-parse --short HEAD` output.
- `about-runtime` shows non-empty Electron / Chrome / Node values.
- License list shows ~20 entries; `Show all (N more)` expands to the full list.

```bash
git rev-parse --short HEAD
node -e "console.log(require('./package.json').version)"
```

PASS: all four assertions match.

---

<!-- openspec-task: 13.10 -->

### Task 10: Manual update check — offline shows red error; online up-to-date shows green

- [ ] **Setup A — offline**

Disable network (turn off Wi-Fi or block the publish URL with `pf`/`hosts`).

- [ ] **Action**

`Settings → About → Check for Updates`.

- [ ] **Assertion (offline)**

`obs-update-status` (red) shows `update.checkFailed` text. The app does not crash; the log file shows an `area: 'update'` warn/error entry with the network error.

- [ ] **Setup B — online, no new version**

Re-enable network. The publish URL is the placeholder from Plan 4 (`https://releases.acornvo.local/`); without a real release feed there it returns a 404 or DNS error. To simulate "up-to-date" cleanly, point `electron-builder.yml` `publish.url` temporarily at any `latest-mac.yml`/`latest.yml` you produced locally for the **current** version, or run a local `python3 -m http.server` from a directory with such a file.

- [ ] **Action**

Click **Check for Updates** again.

- [ ] **Assertion (online, up-to-date)**

`obs-update-status` (green) shows `update.upToDate`.

PASS: both branches behave as documented; logs reflect the activity.

---

<!-- openspec-task: 13.11 -->

### Task 11: `npm run dist:mac` produces both x64 and arm64 dmg

- [ ] **Setup**

Run on macOS host. Ensure `build/licenses.json` is generated.

```bash
npm run generate:licenses
```

- [ ] **Action**

```bash
npm run dist:mac
```

- [ ] **Assertion**

```bash
ls dist/*.dmg
# expect:
#   dist/acornvo-<version>-x64.dmg
#   dist/acornvo-<version>-arm64.dmg
```

PASS: exactly two dmg files, one per arch, file sizes > 50MB each.

---

<!-- openspec-task: 13.12 -->

### Task 12: Mac dmg installs and launches without unknown-developer warning (signed + notarized)

- [ ] **Setup**

This requires the signed + notarized build. If certificates are not yet provisioned, downgrade the assertion: confirm Gatekeeper warns "from an unidentified developer" but allows launch via right-click → Open. Document this as a known limitation; do NOT mark the task fully complete until signing is real.

If notarization is configured:

```bash
APPLE_ID=...  APPLE_APP_SPECIFIC_PASSWORD=... APPLE_TEAM_ID=...  CSC_LINK=... CSC_KEY_PASSWORD=...  npm run notarize:mac
```

- [ ] **Action**

Double-click `dist/acornvo-<version>-arm64.dmg` (on Apple Silicon) and drag Acornvo to Applications. Open Acornvo from Applications.

- [ ] **Assertion**

PASS (signed):

- Gatekeeper does NOT warn about an unknown developer.
- App launches; the dock icon and product name read **Acornvo**.

PASS (unsigned local):

- Gatekeeper warns "unknown developer". After right-click → Open, app launches.
- Mark this sub-step as a documented limitation in the verification log.

---

<!-- openspec-task: 13.13 -->

### Task 13: `npm run dist:win` produces nsis exe; install creates shortcuts

- [ ] **Setup**

Run on Windows host (or via CI matrix).

- [ ] **Action**

```bash
npm run generate:licenses
npm run dist:win
```

- [ ] **Assertion**

```bash
dir dist\*.exe
# expect: dist\acornvo-<version>-setup.exe
```

Run the installer:

- It installs per-user without requiring admin (per `nsis.perMachine: false` default).
- Desktop shortcut **Acornvo** appears.
- Start Menu entry **Acornvo** appears.
- Launching from either shortcut starts the app.

PASS: setup file exists; both shortcuts present; app launches.

---

<!-- openspec-task: 13.14 -->

### Task 14: `npm run dist:linux` produces AppImage; runs after chmod +x

- [ ] **Setup**

Run on Linux host (or CI ubuntu-latest).

- [ ] **Action**

```bash
npm run generate:licenses
npm run dist:linux
chmod +x dist/acornvo-*.AppImage
./dist/acornvo-*.AppImage
```

- [ ] **Assertion**

- `dist/` contains exactly one `.AppImage` (no snap, no deb — per Plan 4 config).
- `chmod +x` succeeds; the AppImage launches the Acornvo window.

PASS: one AppImage; runs.

---

<!-- openspec-task: 13.15 -->

### Task 15: `git push` tag `v0.1.0` triggers release workflow successfully

- [ ] **Setup**

GitHub Actions secrets must be configured (Apple credentials, Windows cert, etc.) for the build steps to fully succeed. If you only want to validate the **workflow** itself, run `actionlint .github/workflows/release.yml` locally.

- [ ] **Action**

```bash
git tag v0.1.0
git push origin v0.1.0
```

- [ ] **Assertion**

- Visit the GitHub Actions tab. The `release` workflow runs against macos-latest / windows-latest / ubuntu-latest.
- All three jobs end with status ✅.
- The tag's Release page lists artifacts:
  - `acornvo-0.1.0-x64.dmg`, `acornvo-0.1.0-arm64.dmg`
  - `acornvo-0.1.0-setup.exe`
  - `acornvo-0.1.0.AppImage`
  - `latest-mac.yml`, `latest.yml`, `latest-linux.yml`

PASS: workflow green; expected artifacts attached.

If signing secrets are absent the workflow may still ship unsigned artifacts; document that and do NOT count notarized assertions for 13.12 as satisfied.

---

<!-- openspec-task: 13.16 -->

### Task 16: Telemetry default off; enable → next-day row appears with matching numbers

- [ ] **Setup**

Fresh database. Confirm `settings.telemetry.enabled = false` after first run:

```bash
sqlite3 "<db-path>" "SELECT v FROM settings WHERE ns='telemetry' AND k='enabled';"
# expect: 0 or 'false'
```

- [ ] **Action — enable**

`Settings → Observability → Local telemetry` checkbox → on.

Optionally trigger the aggregate immediately (rather than waiting for 00:10 UTC) by manually running:

```bash
sqlite3 "<db-path>" \
  "INSERT INTO jobs (id, kind, payload, status, created_at, updated_at)
   VALUES ('manual-tele', 'telemetry-aggregate', json_object('day','$(date -u -v-1d +%Y-%m-%d)'), 'pending', datetime('now'), datetime('now'));"
```

(Adjust `-v-1d` for Linux: `-d "yesterday"`.)

- [ ] **Assertion**

Within a few seconds (queue runner picks the job up):

```bash
sqlite3 "<db-path>" "SELECT day, metric, value FROM telemetry_local;"
```

Expected rows for yesterday's date:

- `ai.requests`, `ai.tokens.total`, `clips.created`, `perf.samples`

Cross-check the magnitudes against direct aggregates:

```bash
sqlite3 "<db-path>" "
  SELECT COUNT(*) AS req,
         COALESCE(SUM(prompt_tokens),0)+COALESCE(SUM(completion_tokens),0) AS toks
  FROM ai_usage
  WHERE created_at >= '$(date -u -v-1d +%Y-%m-%d)T00:00:00Z'
    AND created_at <= '$(date -u -v-1d +%Y-%m-%d)T23:59:59Z';"
```

PASS: telemetry numbers match the direct query.

- [ ] **Action — disable**

Toggle telemetry off.

- [ ] **Assertion (post-disable)**

```bash
sqlite3 "<db-path>" "SELECT COUNT(*) FROM telemetry_local;"
```

PASS: count is unchanged (history preserved). Future days will not get new rows.

---

<!-- openspec-task: 13.17 -->

### Task 17: Production build blocks devtools; dev build allows them

- [ ] **Setup A — production**

```bash
npm run build && npm run start
```

- [ ] **Action**

Press the devtools shortcut (Cmd+Opt+I / Ctrl+Shift+I) inside the app window.

- [ ] **Assertion (production)**

DevTools immediately closes (you may see them flash). The log file gains a new line:

```bash
grep '"op":"devtools-blocked"' "$HOME/Library/Application Support/acornvo/logs/app-$(date -u +%Y-%m-%d).log"
# expect at least one match
```

PASS: devtools cannot be opened; log entry recorded.

- [ ] **Setup B — development**

```bash
npm run dev
```

- [ ] **Action**

Press the devtools shortcut.

- [ ] **Assertion (development)**

DevTools opens and stays open. No `devtools-blocked` log line for this session.

PASS: dev build does not enforce the lock.

---

<!-- openspec-task: 13.18 -->

### Task 18: `openspec validate` passes strict for the change

- [ ] **Action**

```bash
openspec validate phase-18-observability-and-packaging --strict
```

- [ ] **Assertion**

Output ends with a "valid" / "OK" message and exit code `0`. Any errors must be fixed in the change directory before this task is marked complete (typically a missing required field in spec frontmatter or a broken cross-reference).

PASS: command exits 0, no errors printed.

---

## Self-Review Checklist

- [ ] All 18 OpenSpec labels (13.1–13.18) appear as `<!-- openspec-task: 13.M -->` annotations directly above their `### Task N:` headings (one annotation per task — no duplication).
- [ ] Each task has explicit Setup, Action, and Assertion sections, including the exact commands or UI clicks.
- [ ] Bash one-liners and SQLite queries are self-contained — they don't reference variables defined only in earlier tasks.
- [ ] Notarization and tag-push tasks (13.12, 13.15) document their secret-availability fallbacks.
- [ ] Final task (13.18) gates archiving the change.
