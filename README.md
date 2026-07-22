# Nova Play for LG webOS

Nova Play is a private Xtream Codes IPTV player for LG webOS TVs. It provides a remote-first experience for Live TV, movies, and series using LG’s HTML5 media pipeline, native HLS when available, and HLS.js/MSE as a fallback.

> Use only IPTV accounts and content you are authorized to access.

## Features

### TV remote experience

- Explicit geometric **D-pad navigation** for grids, menus, player controls, and settings
- Focus and scroll restoration after app renders, page changes, paging, sorting, and searches
- LG remote support for **arrows**, **OK/Enter**, **Back**, color keys, numeric channel input, channel up/down, and previous-channel behavior
- A webOS 6-compatible `:focus` fallback ring rather than relying only on `:focus-visible`

### Live TV

- Category browsing, search, paging, sort modes, favorites, and provider channel numbers
- Current and next programme metadata on live cards using Xtream `get_short_epg`
- Multi-channel TV guide with now/next rows; select a row to open that channel
- Per-channel schedule using Xtream `get_simple_data_table`
- Catch-up actions when the provider advertises `tv_archive`; availability and URL format remain provider-dependent
- In-player previous/next channel, compact channel overlay, numeric direct channel selection, and last-channel switching
- Native HLS → HLS.js/MSE → direct provider-stream playback fallback
- HLS.js audio-track, subtitle-track, and quality-selection controls when the manifest exposes them

### Movies and series

- Rich movie detail lookup using Xtream `get_vod_info`: plot, cast, director, country, genre, release date, rating, duration, artwork/backdrops, and trailer links when supplied by the provider
- Series season/episode browsing with watched indicators and next-episode autoplay
- Resume positions with a **collision-safe composite identity** (`section:streamType:id`)
- Continue Watching rail on Home, resume markers, and mark watched/unwatched controls
- VOD and episode skip ±10 seconds, scrub control, playback speed, mute, and fit/fill aspect controls
- Character-by-character global search across Live TV, movies, and series, with debouncing, stale-request cancellation, streamed partial results when supported, and category fallback

### Library, profiles, and privacy

- Multiple saved playlists/accounts; each has isolated favorites and watch history
- Favorites stored with item snapshots and grouped by Live TV, Movies, and Series
- Legacy ID-only favorites and resume records migrate lazily after their stream is visited
- Settings for HLS preference, live-buffer size, clock format, adult-category visibility, and a device-local parental PIN
- Adult hiding honors the saved boolean consistently across categories, global search, guide, Favorites, and Continue Watching; it uses both provider category IDs and common adult-title/category signals
- Credentials are stored only in device-local storage and are never embedded in source or the IPK
- Defensive persistence: slim favorite/resume snapshots, bounded history, quota-error handling, and oldest-entry eviction retries
- During playback, the app attempts standard Screen Wake Lock and guarded webOS keep-alive calls to reduce screensaver interruptions

## Security and parental-control notes

Xtream Codes puts the username and password in API and stream URLs. Credentials may therefore be visible to the IPTV provider and in proxy, router, or intermediary logs. Prefer an HTTPS-capable provider; an HTTP provider sends credentials and media traffic without transport encryption.

The parental PIN is an app-level, device-local convenience lock. It is **not encryption** and is not a security boundary against someone with physical device access, Developer Mode access, browser inspection, or local-storage access.

## Requirements

- LG webOS TV with **Developer Mode** enabled
- TV and development PC on the same local network
- Node.js and the LG webOS CLI
- VS Code with **webOS Studio**
- Optional but recommended: **webOS TV 6.0 Simulator** for the OLED55G1RLA generation

The current CLI is installed globally as `@webos-tools/cli`; verify it with:

```cmd
ares -V
```

## Local browser development

```cmd
npm install
npm run dev
```

Open the Vite address, normally `http://localhost:5173`.

Enter provider details only in Nova Play’s login form. Do not put account credentials in project files, `appinfo.json`, or source code.

## Remote controls

| Key | Action |
| --- | --- |
| Arrow keys | Explicit spatial navigation |
| OK / Enter | Select focused control |
| Back | Return / exit player |
| Red | Open Favorites |
| Green | Open TV Guide, or refresh a live-channel schedule |
| Yellow | Cycle catalog sort when browsing streams |
| Blue | Open Settings |
| Number keys | Enter a loaded live channel number; selection applies after a short pause |
| Channel Up / Down | Switch channels during Live TV playback |
| Previous Track / player ↶ | Toggle to the previous live channel |

The exact key names emitted by an LG physical remote can differ from the webOS emulator. The app handles both standard browser key names and common webOS color-key codes.

## Production build and package

```cmd
npm run build
npm run package:webos
```

The resulting package is:

```text
packages\com.arash.novaplay_1.0.0_all.ipk
```

Validate it with:

```cmd
ares-package --check webos-app
ares-package --info packages\com.arash.novaplay_1.0.0_all.ipk
```

## Install the webOS TV 6.0 Simulator

For the LG OLED55G1RLA, use the **webOS TV 6.0 Simulator**.

1. In VS Code, open the webOS Studio view from the Activity Bar.
2. Open **Package Manager** and install the **webOS TV 6.0 Simulator** for Windows.
3. Open **Simulator Manager** and start the installed simulator.
4. Confirm the emulator is reachable:

   ```cmd
   ares-device -i -d emulator
   ```

5. Install and run the built IPK:

   ```cmd
   ares-install -d emulator packages\com.arash.novaplay_1.0.0_all.ipk
   ares-launch -d emulator com.arash.novaplay
   ```

The CLI’s default `emulator` target expects a running emulator at `127.0.0.1:6622`. A connection-refused message means the simulator/emulator has not been started.

## Deploy to the physical LG TV

1. On the TV, open the **Developer Mode** app.
2. Enable Developer Mode and the key server. Note the IP address shown by the app.
3. In Windows Command Prompt, register the TV. Replace `TV_IP_ADDRESS`:

   ```cmd
   ares-setup-device -a lg-oled-g1 -i "username=prisoner" -i "host=TV_IP_ADDRESS" -i "port=9922"
   ```

4. Verify the connection:

   ```cmd
   ares-device -i -d lg-oled-g1
   ```

5. Install and launch:

   ```cmd
   ares-install -d lg-oled-g1 packages\com.arash.novaplay_1.0.0_all.ipk
   ares-launch -d lg-oled-g1 com.arash.novaplay
   ```

6. Inspect web-app console and network activity:

   ```cmd
   ares-inspect -a com.arash.novaplay -d lg-oled-g1
   ```

Developer Mode sessions expire periodically. Reopen the Developer Mode app on the TV and extend its session before expiry.

## Scale and catalog-loading behavior

Nova Play is designed to keep webOS TV hardware responsive with large provider libraries:

- Opening a library loads **categories first**. Opening a category fetches only that category; the app no longer requests a provider-wide stream list as its normal browsing path.
- Provider JSON responses are size-limited before parsing, category normalization yields periodically to the browser, and list metadata is deferred until a detail page needs it.
- Catalog filtering and sorting are memoized between page changes. Stream names are normalized once for search rather than lowercased repeatedly on every render.
- Recently visited categories use a short-lived, bounded LRU cache; known streams, EPG now/next data, and cached catalog item totals are all capped.
- Global Search starts after the first typed character (debounced), cancels the previous query whenever text changes, searches cached items immediately, scans provider responses incrementally where streaming is supported, and stops after a bounded result count. If response streaming is unavailable or fails, it falls back to category-scoped searches.
- In-flight catalog, details, EPG, guide, search, and now/next requests are cancelled when navigation changes so stale responses cannot replace the current view.

Some Xtream providers ignore `category_id`, omit response size headers, or return unusually large payloads. Normal catalog browsing stops an oversized response and asks the viewer to use a smaller provider category. Global Search uses its bounded incremental scanner and does not retain the full provider response in application state.

## Stream compatibility and platform limits

Live streams prefer the provider’s HLS endpoint. Nova Play uses native HLS on capable LG TVs, otherwise bundled HLS.js/MSE, then retries the original direct provider stream when HLS networking fails.

Channel labels such as `LQ`, `HD`, or `4K` do not guarantee a codec or resolution. During verification, one provider channel labelled `LQ` was actually 1920×1080 HEVC/H.265. The webOS 6 emulator cannot decode HEVC through Media Source Extensions, while H.264/AAC channels were verified with advancing playback time and buffered media. The physical OLED55G1RLA has a different hardware media pipeline and remains the final compatibility target.

Feature availability varies by provider and stream:

- **Audio, subtitles, and manual quality** only appear when the native media pipeline or HLS manifest exposes alternatives.
- **Catch-up** requires provider archive flags and a compatible `timeshift` URL implementation; verify it with the provider’s own service.
- **Trailers** require a provider-supplied YouTube or HTTP trailer reference.
- **Guide data** depends on the provider returning valid short EPG/simple EPG records.
- **Recording/PVR is intentionally not implemented.** A packaged webOS application does not have a reliable, user-approved background download/recording pipeline, durable large-media storage model, or a consistent provider-authorisation model for recordings. Implementing it would require a separate supported backend/service and explicit storage, rights, and legal design.
- Screen wake/keep-alive calls are best-effort; TV firmware may still apply its own energy-saving policies.

Test one H.264 live channel, one HEVC channel, one movie, one series episode, one archived programme, and any multi-audio/subtitle stream on the physical TV.

## Project structure

```text
src/
  main.ts           Views, spatial remote navigation, player, guide, settings
  xtream-client.ts  Xtream API adapter, EPG, metadata, and stream URLs
  storage.ts        Profile-scoped device-local persistence and migrations
  types.ts          Shared application, metadata, and playback types
public/
  appinfo.json      webOS packaged application manifest
  icon.svg          App icon
vite.config.ts       IIFE/ES2015 production output for webOS 6