# Plan: Remove items from "Continue watching" (long-press OK options menu)

## Goal
Let users remove a title from the home "Continue watching / Pick up where you left off"
rail on the LG webOS TV, using a modern long-press-OK options menu. Removal deletes the
underlying resume entry entirely and is undoable via a toast.

## Decisions (resolved with user)
- **Interaction:** Long-press OK on a focused Continue Watching card opens a small overlay
  options menu. A quick OK tap still resumes playback (unchanged).
- **Menu contents:** `Resume playing` and `Remove from Continue watching`.
- **Removal semantics:** Delete the `ResumeEntry` from `resumeEntries` entirely and persist.
  The item disappears from the rail and shows no progress bar anywhere; next play starts fresh.
- **Undo:** After removal, show a toast offering undo for a few seconds (restore the deleted
  entry). Undo confirmed via a remote key (see Task 6 note).

## Scope / constraints
- Files to change: `src/main.ts` (logic + menu render + keydown), `src/style.css` (menu styling).
  Optionally `src/storage.ts` only if a helper is cleaner (not required).
- Keep code ES2015-compatible for the webOS bundle (no `String.prototype.normalize`, etc.).
- Only the **Continue watching** rail cards get this behavior. Regular catalog/search cards
  keep normal OK = open details. Live cards are never in Continue Watching (VOD/series only).
- Build with `npm run build`, package with `npm run package:webos` before installing on the TV.

## Key code references
- Rail render: `renderHome()` `src/main.ts:1227` (uses `continueWatching(resumeEntries)`).
- `continueWatching()` source of truth: `src/storage.ts:329` (non-completed entries, newest first).
- Card render: `streamCard(stream, resume)` `src/main.ts:1541`. Resume cards get
  `data-resume-card="true"` and `data-focus-id="stream-<key>"` on the `.media-select` button.
- Resume state: `resumeEntries: Map<string, ResumeEntry>` `src/main.ts:369`; persist via
  `saveResume(profile.id, resumeEntries)` `src/storage.ts:308`; failure toast constant
  `STORAGE_FAILURE_MESSAGE`.
- Action dispatch: `handleAction()` `src/main.ts:3676`; click delegation `src/main.ts:3590`.
- Global keydown (capture): `src/main.ts:5916`; keyup: `src/main.ts:6109`.
  Non-player OK/Enter is NOT explicitly handled — it falls through to the native button click,
  which is how cards activate today.
- Toast: `showToast(message)` `src/main.ts:5858` (2.2s auto-hide; single `#remote-toast`).
- Focus model: `snapshotFocus()`/`restoreFocus()` `src/main.ts:902`/`980`; re-render restores
  focus by `data-focus-id`. Overlay pattern to mirror: `.channel-overlay` (`main.ts:5254`,
  css `style.css:1622`).
- Streams lookup: `streamFromKey()` / `streamLookupKey()` used throughout (e.g. `main.ts:3722`).

## Implementation tasks (ordered)

### 1. Add module-level state for long-press + undo
In `src/main.ts` near other player/UI state (e.g. around `pendingFocus` `main.ts:352`):
- `let continueMenuHoldTimer: number | null = null`
- `let suppressNextCardActivation = false` (suppresses the click that follows a long-press OK)
- `let lastRemovedResume: { key: string; entry: ResumeEntry } | null = null`
- `let undoResumeTimer: number | null = null`

### 2. Detect long-press OK on a Continue Watching card (keydown)
In the global `keydown` capture listener (`src/main.ts:5916`), add a branch that runs when
`view === 'home'` and NOT in an editing input:
- Compute `card = activeElement.closest('[data-resume-card="true"]')` (the `.media-select`
  button carries `data-resume-card`).
- If `card` exists and key is OK/Enter (`event.key === 'Enter' || event.key === ' '`):
  - On the **first** press only (`!event.repeat` and `continueMenuHoldTimer === null`), start
    `continueMenuHoldTimer = window.setTimeout(() => { openContinueMenu(card); suppressNextCardActivation = true; continueMenuHoldTimer = null }, 550)`.
  - Do NOT `preventDefault` here (a quick tap must still fire the native click → resume).
  - Note: webOS fires repeated `keydown` while held; guard with `event.repeat`/timer-null so we
    only schedule once.
- Place this branch BEFORE `handleSpatialNavigation` and after the existing Back handling.

### 3. Cancel/settle the hold on keyup
In the global `keyup` listener (`src/main.ts:6109`):
- If `continueMenuHoldTimer !== null`: it was a short tap → `clearTimeout`, set timer null.
  Let the native click proceed (resume). Do nothing else.
- (If the timer already fired, `continueMenuHoldTimer` is null and `suppressNextCardActivation`
  is true; the click handler will consume it — see Task 4.)

### 4. Suppress the trailing click after a long-press
In the click delegation handler (`src/main.ts:3590`), at the very top of the callback:
- If `suppressNextCardActivation` is true: set it false, `event.stopPropagation()` /
  `event.preventDefault()`, and `return` (so the long-press does not also resume playback).

### 5. Build the options overlay menu
Add `openContinueMenu(cardEl: HTMLElement)`:
- Read the stream key from `cardEl.dataset.streamKey`; resolve `stream` via `streamFromKey`.
  Bail if missing.
- Remove any existing menu first (id `#continue-menu`).
- Create an `<aside id="continue-menu" class="continue-menu" role="menu">` appended to
  `document.body`, containing two focusable buttons:
  - `Resume playing` → `data-action="resume-continue" data-stream-key="<key>"`,
    `data-focus-id="continue-menu-resume"`.
  - `Remove from Continue watching` → `data-action="remove-continue" data-stream-key="<key>"`,
    `data-focus-id="continue-menu-remove"` (add class `danger-button`).
- Optionally show the title as a heading (`streamDisplayTitle(stream)`).
- Move focus to the first menu button (`focus({ preventScroll: true })`).
- Back/Escape closes the menu: extend the Back handling in keydown (`main.ts:5921`) so that,
  when `#continue-menu` is open, Back removes the menu and restores focus to the card
  (`[data-focus-id="stream-<key>"]`) instead of navigating away. Guard this before the normal
  home Back logic.
- Ensure the menu buttons participate in navigation OR are trapped: simplest is a standalone
  overlay not in a `data-nav-zone`; handle Up/Down between the two buttons inside a small local
  keydown while the menu is open, or place them in a container with `data-nav-zone` so existing
  spatial nav works. Prefer giving the `<aside>` a `data-nav-zone="continue-menu"` so
  `handleSpatialNavigation` moves between the two buttons with no extra code.

### 6. Wire menu actions in `handleAction()` (`src/main.ts:3676`)
- `resume-continue`: resolve stream, close menu (`#continue-menu`), then
  `await beginResumePlayback(stream)` (same path as `select-stream` resume, `main.ts:3730`).
- `remove-continue`: 
  - Resolve `key = element.dataset.streamKey`; capture `entry = resumeEntries.get(key)`.
  - If found: store `lastRemovedResume = { key, entry }`, `resumeEntries.delete(key)`,
    `saveResume(profile.id, resumeEntries)` (toast `STORAGE_FAILURE_MESSAGE` on failure).
  - Close the menu, then re-render home (`view` is already `home`; call `renderHome()`), which
    rebuilds the rail without the item. Focus: after removal focus the next Continue Watching
    card if any, else the first hub card — set `requestFocus({...})` / rely on `restoreFocus`
    default. Simplest: request focus to `home-live` hub card, or to the card that took the
    removed one's grid position.
  - Show undo toast: `showToast('Removed from Continue watching — press green to undo')`
    (reuse existing toast; extend its lifetime is optional). Arm undo:
    `undoResumeTimer = window.setTimeout(() => { lastRemovedResume = null }, ~6000)`.
- **Undo key:** reuse the color-shortcut handler `handleColorShortcut()` (`main.ts:5712`).
  Add: if `lastRemovedResume` is set and Green is pressed while `view === 'home'`, restore the
  entry (`resumeEntries.set(key, entry)`, `saveResume`, clear `lastRemovedResume`/timer,
  `renderHome()`, toast `Restored`). Green currently opens the guide on home — gate the undo
  branch so it only wins when `lastRemovedResume` is active, otherwise fall through to the
  existing guide behavior.
  (If Green-collision is undesirable, alternative: keep a persistent "Undo" button in the
  toast area; but color-key undo matches the TV convention and needs no new focus target.)

### 7. Styling (`src/style.css`)
- Add `.continue-menu` mirroring `.channel-overlay` (`style.css:1622`): `position: fixed`,
  centered or anchored, high `z-index` (above cards/toast base but below nothing critical;
  toast is `z-index:10` — put menu at `9`), dark translucent panel, rounded, drop shadow.
- Style the two menu buttons with clear `:focus` highlight (reuse existing button/`:focus`
  visual language). Reuse `.danger-button` for the Remove item.
- Ensure it renders correctly at TV overscan margins (match `.channel-overlay` insets).

### 8. On-card affordance hint (discoverability)
Long-press gestures are invisible. Add a subtle hint so users discover it:
- Option A (recommended, low-risk): when a Continue Watching card is focused, show a small
  caption/badge like "Hold OK for options" via CSS on `.continue-grid .media-select:focus`
  (a `::after` tooltip) — no JS. Keep it unobtrusive.
- Keep the rail heading caption as-is or update `Your next episode is waiting`
  (`main.ts:1230`) — optional copy tweak only.

## Failure modes / edge cases to handle
- **Quick tap vs hold race:** guarantee tap (<550ms) always resumes and never opens the menu;
  hold always opens the menu and never resumes (suppress trailing click). Verify on the TV,
  since webOS OK timing differs from desktop.
- **Key repeat:** webOS emits repeated keydown while OK is held — only schedule the timer once
  (`event.repeat` / timer-null guard).
- **Menu open during re-render:** always remove `#continue-menu` before re-rendering home so it
  can't leak across renders; clear `continueMenuHoldTimer` when leaving home.
- **Undo after navigation:** if the user leaves home, drop `lastRemovedResume` (clear on view
  change) so Green doesn't unexpectedly restore later. Also clear the undo timer.
- **Persistence failure:** if `saveResume` returns false, still update the in-memory map and
  show `STORAGE_FAILURE_MESSAGE` (matches existing favorite/watched behavior).
- **Empty rail:** if the last Continue Watching item is removed, the whole
  `home-rail` section disappears (already conditional at `main.ts:1227`); move focus to a hub
  card so focus is never lost.
- **Green undo vs guide collision:** undo branch must only intercept Green when
  `lastRemovedResume` is active on home; otherwise existing guide behavior must still work.

## Validation
- Unit: add a `src/storage.test.ts` case (Vitest, `npx vitest run src/storage.test.ts`) asserting
  that deleting a key from the entries map and calling `continueWatching()` excludes it, and that
  a restored entry reappears. (Core delete/restore is map ops; test the observable helper.)
- Manual on emulator (`ares` emulator): verify menu opens on long-press OK, quick tap resumes,
  Remove deletes the card and the progress bar is gone in the catalog, Green undo restores it,
  Back closes the menu without leaving home, focus never lost when rail empties.
- Manual on `lg-oled-g1` TV (real remote timing): confirm tap-vs-hold thresholds feel right and
  the trailing click is suppressed. Install WITHOUT `-r` (preserve localStorage/auth):
  `ares-install -d lg-oled-g1 packages\com.arash.novaplay_1.0.0_all.ipk` then `ares-launch`.
  Remember `npm run build` + `npm run package:webos` first, or the IPK is stale.

## Out of scope
- Removing/clearing watched history globally, or a bulk "clear all" control.
- Changing favorites behavior or the on-card star.
- Any provider/EPG work.

## Open items (none blocking)
- Exact long-press threshold (proposed 550ms) may need tuning on the real remote.
- Whether to also expose the same menu from VOD/series detail pages (not requested; can reuse
  `remove-continue` action later if desired).
