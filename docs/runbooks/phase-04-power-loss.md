# Phase 04 — Power-loss / kill-9 acceptance check

This runbook verifies that `writeFileAtomic` leaves the on-disk state intact when
the writing process is killed mid-write.

## Setup

1. Build the dev app: `npm run dev` (Electron will boot).
2. Open a fresh test grove (`/tmp/grove-pwrloss` is fine).
3. Open the DevTools console for the renderer.

## Run

In the DevTools console:

```js
// Big payload so the write is observably non-instant.
const payload = '# big\n' + 'lorem ipsum '.repeat(500_000)
window.api.file.write('big.md', payload).then(() => console.log('done'))
```

While the write is running (you can verify by `ls -la /tmp/grove-pwrloss/` from a
terminal — you should see a `big.md.<uuid>.tmp` file briefly), kill the Electron
main process:

```bash
pkill -9 -f electron
```

## Expected outcome

After re-launching the app and the same grove:

- [ ] `/tmp/grove-pwrloss/big.md` is **either** the previous version **or** the
      fully-written new version. Never half-written.
- [ ] No `.tmp` straggler remains in the grove root: `ls /tmp/grove-pwrloss/*.tmp 2>/dev/null` exits non-zero (no match).

If a `.tmp` straggler is present, that's an **acceptable** outcome (the rename
hadn't happened yet), so long as the target file is still the old/untouched
version. The phase-04 contract guarantees: **the target is never half-written**.
A separate cleanup pass at next boot (out of scope here) would remove any orphan
tmp files.

## Pass criteria

Both bullets above check out across at least one successful kill mid-write run.
Document the run in the change PR description.
