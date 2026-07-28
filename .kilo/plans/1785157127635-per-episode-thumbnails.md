# Plan: Per-Episode Thumbnails with Series-Poster Fallback

## Goal
Give episodes distinct, recognizable thumbnails using the per-episode stills the
provider already sends (`episode_image` / `still_path`), instead of showing the
identical series poster everywhere. This delivers the practical benefit of
YouTube-style thumbnails (distinct per-episode imagery) without any video frame
decoding.

## Why not literal "frame selection"
Capturing a real video frame requires `canvas.drawImage(video)` → `toDataURL()`,
which throws a tainted-canvas `SecurityError` for cross-origin HLS segments (no
CORS) and is fragile on the old webOS Chromium video path. Out of scope.

## Current behavior (verified in code)
- `episodeArtworkSource` (`src/series-presentation.ts:65`) already prefers
  `episode.cover ?? metadata.cover ?? seriesCover`.
- The Xtream client already parses per-episode stills into `episode.cover`
  (`src/xtream-client.ts:330`: `movie_image ?? episode_image ?? still_path ...`).
- Episode guide cards (`episodeArtwork`, `src/main.ts:1643`) render an `<img>` with
  a text `episode-image-fallback`. On load failure the error infra
  (`src/main.ts:3282`, `3306`) adds `image-unavailable`, which reveals the
  **text tile** — it does NOT fall back to the series poster image.
- `posterArtwork` (`src/main.ts:1393`) **intentionally overrides** episode art with
  `stream.seriesCover` first, so episodes shown as catalog posters (continue-watching
  rail, global/catalog search results) all look identical. Comment there notes
  provider episode-art URLs are "often truthy but unusable."

## Core idea
Turn "unusable URL" from a reason-to-never-try into a graceful degrade: attempt the
per-episode still, and on load failure swap to the series poster (a real image),
only falling back to the text tile if the poster also fails. Reuse the existing
`onerror` + 5s `naturalWidth` detection instead of inventing new machinery.

## Implementation tasks (ordered)

1. **Add an image-fallback swap helper in the existing error handling.**
   - File: `src/main.ts`, delegated `error` listener (~`3268`-`3290`) and the
     `setTimeout` sweep (~`3293`-`3312`).
   - Behavior: when an `<img>` with a `data-fallback-src` attribute fails
     (`onerror`, or `naturalWidth === 0` after the 5s check), and its current `src`
     is not already the fallback, set `img.src = img.dataset.fallbackSrc` and
     REMOVE `data-fallback-src` (so a second failure proceeds to the existing
     `image-unavailable` text-tile path). Otherwise keep current behavior.
   - Keep it ES2015-safe (no optional chaining assignment tricks that transpile
     oddly; plain `if`/attribute reads). Guard: only swap if `dataset.fallbackSrc`
     is a non-empty string different from current `src`.

2. **Episode guide cards: still first, series poster as image fallback.**
   - File: `src/main.ts` `episodeArtwork` (`1643`).
   - Compute `primary = episode.cover ?? episode.metadata?.cover` and
     `fallbackPoster = episode.seriesCover` separately (do not pre-collapse via
     `episodeArtworkSource`).
   - If `primary` exists: render `<img class="episode-image" src="{primary}"
     data-fallback-src="{fallbackPoster}" ...>` (omit `data-fallback-src` when
     `fallbackPoster` is falsy or equals `primary`).
   - If no `primary` but `fallbackPoster` exists: render `<img>` with
     `src={fallbackPoster}` and no `data-fallback-src`.
   - If neither: current text `episode-image-fallback` only.
   - Keep the text `episode-image-fallback` span in all cases (final degrade).

3. **Catalog posters for episodes: attempt still, fall back to series poster.**
   - File: `src/main.ts` `posterArtwork` (`1393`).
   - For `stream.streamType === 'episode'`: set
     `primary = stream.cover ?? stream.metadata?.cover` (the episode still) and
     `fallbackPoster = stream.seriesCover ?? stream.icon`.
     - If `primary` exists and differs from `fallbackPoster`, render the `<img>`
       with `src={primary}` and `data-fallback-src={fallbackPoster}`.
     - Else render as today (series poster).
   - Non-episode branch unchanged.
   - Preserve the `poster-fallback` text span and `poster` class so the existing
     error sweep still targets it.

4. **Confirm `escape()` is applied to both `src` and `data-fallback-src`.**
   - Both URLs are provider-supplied; escape identically to existing `src` usage.

## Data flow
Provider JSON → `xtream-client` maps `episode_image/still_path` → `episode.cover`
→ `episodeArtwork` / `posterArtwork` emit `src=still` + `data-fallback-src=poster`
→ on load error the delegated handler swaps to poster → on second error the
existing `image-unavailable` text tile shows.

## Failure modes handled
- Still URL 404 / not an image → swap to series poster.
- Series poster also fails → existing text tile (`episode-image-fallback` /
  `poster-fallback`).
- No still and no poster → text tile (unchanged).
- Slow-loading images → existing 5s `naturalWidth` sweep triggers the same swap.
- No new network requests beyond what the provider already returns; no decoding.

## Out of scope
- Real video frame capture / `<canvas>` thumbnailing.
- Persisting or caching swapped URLs.
- Changing `imageOrPlaceholder` / live-channel logo behavior.

## Validation
- `npx vitest run src/xtream-client.test.ts src/search.test.ts` (regression; these
  cover the cover-mapping fields — see `xtream-client.test.ts:155` episode cover).
- Add/extend a unit test around the render helpers if they are exportable; if
  `episodeArtwork`/`posterArtwork` are not exported, assert the fallback-URL logic
  via a small extracted pure helper (e.g. `episodeThumbnailSources(episode)`
  returning `{ primary, fallback }`) placed in `series-presentation.ts` and unit
  tested there — preferred, keeps main.ts thin and testable.
- Manual on webOS: `npm run package:webos`, reinstall per the standard
  `ares-install -r` → install → `ares-launch` workflow on `lg-oled-g1`.
  - Verify: series with real episode stills shows distinct images per episode.
  - Verify: series whose episode-art URLs are broken degrades to the series
    poster (not a bare text tile).
  - Verify: continue-watching rail / search results show episode stills where
    available and series posters otherwise.

## Suggested refactor note for implementer
Introduce `export function episodeThumbnailSources(episode): { primary?: string;
fallback?: string }` in `src/series-presentation.ts`, unit-test it, and have both
`episodeArtwork` and the episode branch of `posterArtwork` consume it. Keeps the
still-vs-poster precedence in one tested place.

## Open questions
None blocking. If the team later wants true "continue watching" frame thumbnails,
that is a separate spike (CORS proxy for HLS + canvas), tracked independently.
