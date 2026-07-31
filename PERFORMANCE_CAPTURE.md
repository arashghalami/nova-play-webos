# Nova Play Performance Capture

Nova Play includes a dormant-by-default, bounded trace for investigating real webOS latency. It records timing and causality without recording IPTV credentials, stream URLs, title names, person names, search text, or provider payloads.

## Enable tracing

Preferred method on an emulator or TV with CDP:

```js
window.__NOVA_PERF__.enable(true) // true enables verbose resource/heap detail
window.__NOVA_PERF__.clear()
window.__NOVA_PERF__.event('scenario', 'baseline-start')
```

For a browser/dev-server session, add `?novaPerf=1` to enable normal tracing or `?novaPerf=verbose` for verbose tracing.

Tracing is disabled by default. When disabled it creates no trace events, observers, frame sampler, event-loop sampler, or image listeners.

## Run one reproducible scenario per trace

Do not leave the debug overlay, DevTools recording, network throttling, or unrelated downloads active while measuring a baseline. Use the same profile, target content, network path, device mode, and cache state for every comparison.

For each scenario:

1. Enable and clear tracing.
2. Mark the scenario:
   ```js
   window.__NOVA_PERF__.event('scenario', 'catalog-cold-start')
   ```
3. Perform exactly one scripted flow.
4. Wait for the terminal condition: stable view, image terminal events, search completion, playback ready/failure, or player close.
5. Inspect the compact summary:
   ```js
   window.__NOVA_PERF__.summary()
   ```
6. Export the full trace:
   ```js
   window.__NOVA_PERF__.exportConsole()
   ```
7. Disable tracing before starting a disabled-overhead comparison:
   ```js
   window.__NOVA_PERF__.disable()
   ```

`exportConsole()` emits a header followed by numbered `[NOVA_PERF_EXPORT:<n>/<total>]` JSON chunks. Concatenate chunk payloads in numeric order before parsing as JSON.

## Required scenario matrix

Run each scenario at least five times in cold and warm states on desktop Chromium (control), the webOS emulator, and the physical TV.

| Area | Scenario | Terminal evidence |
| --- | --- | --- |
| Bootstrap | launch to Login/Home | `stable-frame-after-render` |
| Home | 20 D-pad movements across hero, rail, and hubs | `spatial-painted` |
| Categories | Live, Movies, Series category index | category request plus catalog render |
| Catalog | open small and large categories, page, sort, local search | request/parse/normalization/render |
| Global search | cold query, repeated query, catalog-warmed novel query, cancellation | `global-search-complete` / catalog state / cancellation |
| Details | Live, Movie, Series, episode, person | detail render and enrichment terminal event |
| Images | title with cast portraits and title with missing artwork | image `load`/`error`/fallback/timeout |
| Guide | initial guide, Now/Next, schedule, catch-up | EPG request/render |
| Settings | open, save, profile switch | storage measures and stable render |
| Player | HLS, MPEG-TS, DASH/native candidates | `playback-ready` or `playback-failed` |
| Player UI | controls, seek, pause/resume, channel switch, Back | input/action and playback lifecycle |
| Lifecycle | player close, page hide/return | cleanup/lifecycle events |

## How to attribute latency

Start with the interaction ID and follow its events in timestamp order.

### D-pad responsiveness

A normal move is:

`spatial-navigation begin` → `spatial-move` → `focus-move` → `spatial-painted`

Interpretation:

- Large delay before `spatial-move`: event loop or frame starvation.
- `layout-cache-miss` with a large duration: geometry collection/layout is expensive.
- Repeated `layout-invalidated`: inspect `reason`; scroll, focus-scroll, shell replacement, overlays, and event binding are distinguished.
- Large `focus-move`: focus visibility geometry or scroll is expensive.
- `spatial-coalesced`: repeated arrows were intentionally replaced; it is not a stale replay.

The trace measures browser keydown-to-next-frame work. It cannot measure physical remote-button-to-browser-dispatch delay; use a high-frame-rate camera test if that distinction is needed.

### Rendering and layout

Compare:

- `render-shell` begin/end,
- `first-frame-after-render`,
- `stable-frame-after-render`,
- generated HTML size, focusable count, and image count,
- `long-task`, `frame-gap`, and `event-loop-gap`.

A large `render-shell` duration identifies JavaScript/DOM replacement work. A short shell duration with long post-render frames points toward style, layout, painting, image decode, or browser scheduling.

### Provider data and caching

For every Xtream request the trace provides:

- request begin/end;
- fetch start and response headers;
- response read/decode;
- JSON parse;
- normalization record count, result count, and duration;
- in-memory stream cache hit, miss, expiration, write, and oversized-skip events;
- global-search result-cache hits, misses, and writes;
- complete-catalog queue states (`queued`, `loading`, `complete`, `oversized`, `failed`);
- catalog warm starts, writes, expiry, paused work, and oversized outcomes;
- local complete-catalog search duration and record count.

For catalog warming, verify that only one section enters `loading` at a time. Confirm that a `global-search-catalog-hit` for a novel follow-up query has no accompanying provider-wide request for that section. An `oversized` state is intentional: it means the app has protected the TV heap by declining to retain that section for the current profile session.

Do not design IndexedDB indexes or further background parsing until traces show whether network, read/decode, `JSON.parse`, normalization, local filtering, render, or GC/frame gaps dominate.

### PG/content guidance and cast images

Use the metadata/image events to distinguish the regression:

- `metadata-request` with `configured: false` or `enrichment-start configured: false` means the package was built without `VITE_METADATA_PROXY_URL`.
- metadata request/response failure proves proxy/network/CORS/service failure.
- `title-result` shows whether ratings/cast were returned.
- `enrichment-complete current: false` means an async result became stale because the user navigated away.
- `image assigned` shows image source class only (`https`, `http`, `relative`, `inline`, `empty`).
- `image load`, `image error`, `fallback-swapped`, `fallback-unavailable`, and `timeout-without-load` distinguish request/decode/fallback failures.
- `attached: false` on an image terminal event indicates the DOM was replaced before it completed.

The generated `webos-app/build-info.json` is the package truth for `metadataProxyConfigured`. It must be `true` in the artifact that is installed on the TV. The current local build without `VITE_METADATA_PROXY_URL` deliberately reports `false`; therefore it cannot fetch Worker-backed ratings or TMDB cast portraits.

## Build and package verification

Before packaging the metadata-enabled build:

```cmd
set VITE_METADATA_PROXY_URL=https://your-worker.workers.dev
npm run package:webos
```

Then inspect the generated package input:

```cmd
type webos-app\build-info.json
```

Expected values:

```json
{
  "metadataProxyConfigured": true,
  "performanceTracingAvailable": true
}
```

If `metadataProxyConfigured` is false, stop: the package will not call the metadata Worker. Confirm Worker CORS separately from the actual packaged app origin, including `Origin: null` when that is required by webOS.

## Trace comparison checklist

For every change, compare the same scenario in:

1. tracing disabled;
2. tracing enabled normal;
3. tracing enabled verbose only when resource/heap detail is required.

Reject a tracing implementation if it changes behavior or materially changes the baseline. Initial acceptance targets:

- no trace work while disabled;
- no unexplained event loss (`droppedEvents: 0`) in normal scenarios;
- no new long tasks over 50 ms caused by tracing;
- no missing terminal event for a request, render, image, or player attempt unless it is explicitly cancelled;
- no more than approximately 3% median interaction overhead in normal tracing mode.

Keep the JSON trace alongside device model, webOS version, app build info, scenario, cold/warm state, and repetition number. Do not commit exported traces because timing and derived usage patterns are device-specific.