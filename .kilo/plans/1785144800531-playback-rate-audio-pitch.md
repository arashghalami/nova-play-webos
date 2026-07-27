# Plan: Audible audio above 1× playback speed (pitch-preserve + fallback)

## Goal
When playback speed goes above 1× (1.25/1.5/2×), audio currently goes silent on the
webOS TV. Make the voice audible like YouTube by explicitly enabling
pitch-preserving time-stretch (`preservesPitch`, with vendor prefixes), and add a
Settings toggle so that if the TV's audio pipeline cannot time-stretch (outputs
silence), the user can switch to audible-but-higher-pitched playback.

## Root cause
`HTMLMediaElement.playbackRate` is set in three places but `preservesPitch` is
never set, so behavior is left to the webOS Chromium default. On the target TV the
time-stretch path yields **silence** above 1×.

Current playbackRate assignment sites in `src/main.ts`:
- L231 `let playerPlaybackRate = 1` (module state)
- L2702 `player.playbackRate = playerPlaybackRate` (applied once when player mounts)
- L4643-4660 `cyclePlaybackSpeed()` cycles `[1, 1.25, 1.5, 2]` and sets `video.playbackRate`

## Decisions (resolved)
- **Strategy:** Set `preservesPitch = true` (YouTube-like) by default, AND add a
  persisted Settings toggle "Preserve pitch when speeding up". When the toggle is
  OFF, set `preservesPitch = false` (audible, higher pitch — never silent).
- **New setting:** `preservePitch: boolean`, default `true`.
- **Persistence:** per-profile settings in `nova-play.settings` (same pattern as
  `preferHls`), backward-compatible via default merge.
- **ES2015 constraint:** pure property assignment + a typed cast; no modern APIs.
  Complies with the project's webOS bundle compatibility rule.

## Implementation tasks (implementation-capable agent)

### 1. Type + defaults + persistence — `src/types.ts`, `src/storage.ts`
- `src/types.ts` `AppSettings` (after L15 `preferHls`): add `preservePitch: boolean`.
- `src/storage.ts`:
  - `DEFAULT_SETTINGS` (L19-24): add `preservePitch: true`.
  - `loadSettings` (L107-115): add `preservePitch: saved?.preservePitch ?? DEFAULT_SETTINGS.preservePitch`.
  - `saveSettings` already spreads `...settings`, so no change needed there beyond
    the type; confirm the new field is written.

### 2. Shared helper — `src/player-transport.ts`
Add a small, unit-testable pure helper that centralizes the pitch decision and the
prefixed property writes. Keep it framework-free so it can be tested under Vitest
with a plain object.

```ts
// Element shape covering standard + legacy vendor-prefixed pitch flags.
export interface PitchControllableMedia {
  playbackRate: number
  preservesPitch?: boolean
  mozPreservesPitch?: boolean
  webkitPreservesPitch?: boolean
}

/**
 * Apply playback rate and pitch handling in one place. When preservePitch is
 * true, request YouTube-style pitch-preserving time-stretch (natural voice);
 * when false, disable it so audio stays audible (higher pitch) instead of the
 * silence some webOS builds emit while time-stretching. Writes all vendor
 * variants because older webOS Chromium only honors the prefixed forms.
 */
export function applyPlaybackRate(
  media: PitchControllableMedia,
  rate: number,
  preservePitch: boolean,
): void {
  media.preservesPitch = preservePitch
  media.mozPreservesPitch = preservePitch
  media.webkitPreservesPitch = preservePitch
  media.playbackRate = rate
}
```

### 3. Wire the helper — `src/main.ts`
- Import `applyPlaybackRate` (and the type if needed) from `./player-transport`.
- L2702: replace `player.playbackRate = playerPlaybackRate` with
  `applyPlaybackRate(player, playerPlaybackRate, settings.preservePitch)`.
- `cyclePlaybackSpeed()` L4649-4651: replace `video.playbackRate = playerPlaybackRate`
  with `applyPlaybackRate(video, playerPlaybackRate, settings.preservePitch)`.
- Re-assert after source (re)attach so engine swaps don't reset it. Add
  `applyPlaybackRate(player, playerPlaybackRate, settings.preservePitch)` inside the
  existing `player.addEventListener('loadedmetadata', ...)` handler (~L2815).
  Rationale: HLS.js / mpegts.js / dash.js and native `src` reloads can reset the
  media element's rate/pitch flags on new metadata.

### 4. Settings UI — `src/main.ts`
- `renderSettings()` (~L2139, near the Prefer-HLS row): add a checkbox row
  ```
  <label class="setting-row"><span>Preserve pitch when speeding up<small>Keep voices natural above 1×. Turn off if audio is silent when fast.</small></span><input id="setting-preserve-pitch" data-focus-id="setting-preserve-pitch" type="checkbox" ${settings.preservePitch ? 'checked' : ''} /></label>
  ```
- Settings save handler (~L4878-4904): read
  `const preservePitch = document.querySelector<HTMLInputElement>('#setting-preserve-pitch')`
  and add `preservePitch: preservePitch?.checked ?? settings.preservePitch,` to the
  `settings = { ... }` object.
- Confirm the new `data-focus-id` participates in spatial navigation (it will, since
  it follows the same `.setting-row` + `data-focus-id` pattern as existing rows).

## Unit tests — `src/player-transport.test.ts`
Add tests for `applyPlaybackRate`:
1. `preservePitch = true` sets `preservesPitch`, `mozPreservesPitch`,
   `webkitPreservesPitch` all `true` and sets `playbackRate` to the given rate.
2. `preservePitch = false` sets all three flags `false` and still sets `playbackRate`.
3. Rate is applied for a representative speed (e.g. `2`).
Use a plain object literal typed as `PitchControllableMedia` as the fake media.

## Build + local verification
- `npm run test` — all Vitest suites pass (new player-transport tests included).
- `npm run build` (`tsc && vite build`) — no type/bundle errors.

## Emulator test (ares `emulator (default)`, developer@127.0.0.1:6622)
IMPORTANT CAVEAT: the webOS emulator runs desktop-class Chromium and will NOT
reproduce the real TV's audio-silence-on-time-stretch bug. The emulator validates
wiring, persistence, UI, and navigation — NOT the actual fix. Final audio
confirmation must happen on the physical `lg-oled-g1` TV.

Emulator steps:
1. `npm run package:webos` (builds and produces `packages/com.arash.novaplay_*.ipk`).
   Note: bump `public/appinfo.json` version only if an icon/version refresh is
   desired; not required for this change.
2. Install: `ares-install -d emulator packages\com.arash.novaplay_1.0.1_all.ipk`
3. Launch: `ares-launch -d emulator com.arash.novaplay`
4. Inspect (if needed): `ares-inspect -d emulator com.arash.novaplay` to open
   devtools and confirm `document.querySelector('#video-player').preservesPitch`
   reflects the setting after cycling speed.
5. Verify in-app:
   - Settings shows the new "Preserve pitch when speeding up" toggle, default ON.
   - Toggling it persists across app relaunch (per-profile `nova-play.settings`).
   - Play a VOD/series item, cycle speed to 1.25/1.5/2× — playback continues and
     the speed button label updates; devtools shows `preservesPitch` matches the
     toggle.
   - Spatial navigation reaches the new toggle with the D-pad.

## Physical TV test (lg-oled-g1) — REQUIRED for the actual bug
1. `ares-install -d lg-oled-g1 packages\com.arash.novaplay_1.0.1_all.ipk`
   (update-install preserves localStorage/login; use `-r` only if a clean state is
   needed).
2. `ares-launch -d lg-oled-g1 com.arash.novaplay`
3. Play VOD, raise speed to 2×:
   - Expected with toggle ON (preserve pitch): voice audible at natural pitch. If
     audio is SILENT, the TV cannot time-stretch — turn the toggle OFF.
   - With toggle OFF: voice audible at higher pitch, never silent.
4. Record which mode produces audible audio on this firmware; that determines
   whether the default (`true`) is right for this device or whether documentation
   should advise turning it off.

## Risks / notes
- If BOTH modes are silent on the TV, the problem is deeper than pitch handling
  (e.g. the decoder mutes on rate change); that would need a separate investigation
  and is out of scope here. The toggle at least gives a user-facing recovery path.
- `loadedmetadata` re-assert must use the current `playerPlaybackRate` (which may be
  >1 if the user changed speed on a previous item within the session) so speed and
  pitch stay consistent across source swaps.
- Keep all three vendor property writes; dropping the prefixed forms risks the flag
  being ignored on older webOS builds.

## Out of scope
- Changing the speed steps `[1, 1.25, 1.5, 2]`.
- Any audio-track/codec-level remuxing.
- appinfo version bump (optional, unrelated to this fix).
