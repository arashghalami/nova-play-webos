# Nova Play TV UX Regression Checklist

Run this checklist with an LG webOS simulator and again on a physical TV before releasing a new IPK. Test the real remote where possible; browser keyboard equivalents do not always emit identical key names.

## Remote and focus contract

- Every visible screen has exactly one visible, enabled focus target after it renders.
- Pressing **OK** activates only the visibly focused control.
- A view transition never silently focuses the Nova Play Home button unless that button was explicitly selected.
- Disabled, hidden, decorative, favorite-overlay, and background controls behind the channel overlay never receive focus.
- Pressing **Back** is handled once per remote press.

## Back / Return behavior

| Starting state | Expected result |
| --- | --- |
| Search input editing | Keyboard closes; search screen remains open |
| Catalog search input editing | Keyboard closes; catalog remains open |
| Channel overlay | Overlay closes or Back exits player according to the product decision; background must not receive focus |
| Player entered from details | Returns to details and restores the previous focused control |
| Player entered from a catalog or guide item | Returns to the original view and item |
| Details entered from catalog | Returns to the exact originating stream card and scroll position |
| Details entered from global search | Returns to the same search results and item |
| Details entered from TV Guide | Returns to the same guide row |
| Stream catalog | Returns to its category list |
| Category list, Favorites, Guide, Settings | Returns to Home |
| Home | Only this root state may allow webOS to show its exit confirmation |

Verify each Back spelling emitted by the target: `Back`, `GoBack`, `BrowserBack`, key codes `461` and `10009`.

## Search and text entry

### Catalog search

1. Navigate to the search field with arrows; the keyboard must **not** open.
2. Press **OK**; the field becomes editable and the keyboard opens.
3. Enter text slowly, pause for more than 180 ms between characters, and edit in the middle of the string.
4. Confirm the caret and selection stay at the expected position after results refresh.
5. Press **Back**; the keyboard closes without leaving the catalog.
6. Press **OK**, type a query, and press **Enter/Done**; filtering completes and the keyboard closes.
7. Press **Backspace** while editing; it deletes text and never leaves the page.

### Global search

1. Repeat the catalog-search checks.
2. Confirm streamed/partial results never steal focus from the active input.
3. Press **Enter/Done** and confirm the keyboard closes before result navigation.
4. Verify Clear, Cancel, result expansion, and Back preserve a valid visible focus target.

## Grid navigation

Run with at least two complete rows and one incomplete final row.

- **Right** moves across the current visual row; on the final item it wraps to the first item of that **same row**.
- **Left** moves across the current visual row; on the first item it wraps to the final item of that **same row**.
- **Down** and **Up** choose the nearest matching column in the adjacent row; at a grid boundary they enter the closest intended navigation zone rather than an unrelated control.
- Incomplete rows use the nearest available column without skipping to the top bar.
- On Home, verify the explicit rail order: Hero actions → Continue Watching (when present) → Watch TV/Movies/Series/Favorites. In particular, **Up** from the Home cards must enter Continue Watching and must not skip directly to TV Guide.
- The behavior remains correct at 1920×1080 and at narrower simulator/browser widths that change column counts.
- Categories, content cards, Continue Watching, Favorites groups, search groups, settings sections, player controls, and the channel overlay all follow the same predictable zone behavior.
- The open channel overlay confines arrow navigation to its own controls.
- At every zone boundary, no arrow key may jump to an unrelated toolbar, top-bar control, or hidden background element.

## Async and state-change checks

- Start loading a library, category, guide, details page, or search, then press Back immediately. A stale response must not replace the newer view.
- Change sort, change page, remove a Favorite, save settings, expand/collapse global search results, and refresh the guide. Focus must remain visible and logical.
- Check empty categories, empty search results, one-item grids, and error/retry states.
- Verify the player’s auto-hidden controls are revealed before they receive focus.
- Test live TV, VOD, series, episode, catch-up, and channel switching paths.

## Release evidence

Record the following with the release:

- App version / IPK name
- TV model, webOS version, and simulator version
- Provider test account category used (without credentials)
- Tested Back key variants
- Pass/fail result for each section above
- Any provider-specific playback or EPG limitations