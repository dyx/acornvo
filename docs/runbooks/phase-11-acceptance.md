# Phase 11 — Acceptance Runbook

Manual smoke procedures for Electron-runtime-dependent behaviours.

## How to run

1. `npm run dev`
2. Use dev console (Cmd+Opt+I) to confirm logs.

## 10.1 — AppRail → /browser renders

- [ ] 拾果 entry present and not disabled
- [ ] Clicking highlights it and navigates to /browser
- [ ] TabBar + AddressBar + sidebar + welcome page visible
- [ ] Console shows `browser.createTab`

## 10.2 — Bare-domain → https

- [ ] Focus AddressBar; type `example.com` → Enter
- [ ] WebContentsView loads `https://example.com`

## 10.3 — Search query

- [ ] Type `注意力机制` → Enter
- [ ] Browser loads Google search results

## 10.4 — Cmd+T / Cmd+W

- [ ] Cmd+T creates new tab
- [ ] Cmd+W closes active tab
- [ ] Closing last tab → fresh blank appears
- [ ] Cmd+1..9 jump to tab N (9 always last)

## 10.5 — target=\_blank in Electron

- [ ] Open a page with target=\_blank link, click it
- [ ] New tab appears, becomes active, loads URL
- [ ] Old tab intact

## 10.6 — mailto: in Electron

- [ ] Click a `mailto:` link → no new tab; system mail opens
- [ ] Console shows shell.openExternal

## 10.7 — Ad-block in Electron

- [ ] Open a site using GTM (e.g., cnn.com)
- [ ] DevTools Network: GTM/GA requests show (canceled)
- [ ] After 1h, console logs `browser.adblock.hourly`
- [ ] Page renders correctly

## 10.8 — Reader mode in Electron

- [ ] Open a long article page
- [ ] Click ¶ (reader toggle); page reformats
- [ ] Navigate to different URL; reader mode off

## 10.9 — Cmd+D (real)

- [ ] Open any URL, Cmd+D → BookmarkDialog
- [ ] Save → dialog closes; star icon ★ filled
- [ ] BookmarkSidebar shows new entry

## 10.10 — Duplicate URL

- [ ] Bookmark a URL; navigate away and back
- [ ] Cmd+D again → dialog opens in edit mode
- [ ] No duplicate row in DB

## 10.11 — Search bookmarks

- [ ] Add bookmarks; type "news" in sidebar search
- [ ] After ~200ms, filtered to matching rows

## 10.12 — Tag filter

- [ ] Add bookmarks with tags; click tag chip
- [ ] List filtered to matching tag
- [ ] Click again to deselect

## 10.13 — LRU in Electron

- [ ] Open 22 tabs to different URLs
- [ ] Oldest non-active tab suspended
- [ ] Click suspended tab → reloads correctly

## 10.14 — Window resize

- [ ] Resize window; WebContentsView follows smoothly
- [ ] No flicker or lag

## 10.15 — Main renderer external link unchanged

- [ ] In Library, click external link → system browser opens
- [ ] Main window stays put

## 10.16 — WebContentsView cross-site nav

- [ ] In browser tab, click cross-site link
- [ ] Navigation completes in tab; no external browser

## 10.17 — Strict validate

- [ ] `npm run test` exits 0
- [ ] `npm run typecheck && npm run lint` exits 0
- [ ] `openspec validate phase-11-browser-tabs-bookmarks --strict` exits 0
