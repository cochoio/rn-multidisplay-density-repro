# Reproducer: RN layout/text breaks on displays with a different density (Samsung DeX / freeform)

Minimal reproducer (based on [reproducer-react-native](https://github.com/react-native-community/reproducer-react-native), `react-native@0.86.0`, New Architecture) for **two related Android bugs** that appear whenever a React Native app runs on a display whose density differs from the device's main display — e.g. **Samsung DeX**, freeform multi-window, ChromeOS, external monitors.

Both share one root cause: **React Native's process-wide `DisplayMetricsHolder` is initialized once (from the main/phone display) and never updated**, while Fabric mounts views using the *per-display* density. Every conversion that uses the global density on a different-density display is off by `phoneDensity / displayDensity`.

## Bug A — react-native-screens: all stack/tab content squeezed into a 1/density box

`FabricEnabledViewGroup.updateState` ([source](https://github.com/software-mansion/react-native-screens/blob/main/android/src/fabric/java/com/swmansion/rnscreens/FabricEnabledViewGroup.kt)) converts the natively measured **px** size back to **dp** with `PixelUtil` (global density) before pushing `frameWidth/frameHeight` into the Shadow Tree. Fabric mounted the view using the per-display density, so on DeX every `Screen` pushes `windowSize ÷ phoneDensity` and the whole navigation content collapses into a small top-left box.

Real-device measurements (Galaxy S25 Ultra, phone density **2.8125**, DeX window resized 6 times — instrumented `updateState`):

| window (dp) | Screen state push (dp) | ratio |
|---|---|---|
| 394 × 702 | 140 × 235 | 2.81 |
| 497 × 730 | 177 × 245 | 2.81 |
| 737 × 794 | 262 × 268 | 2.81 |
| 304 × 452 | 108 × 146 | 2.81 |
| 421 × 788 | 150 × 266 | 2.81 |

Every push is exactly `window ÷ 2.8125`. **Fix verified on device**: convert px→dp with the view's own context density (`context.resources.displayMetrics.density`) — identical on single-display devices, correct on multi-display. After the fix the push equals the window size at every tested window size.

## Bug B — react-native core: text drawn ~density× larger than its box

With bug A fixed, layout fills the window but **text sp→px conversion still uses the stale global density**, so glyphs render ~2.8× larger than their Yoga-measured boxes and clip everywhere.

**Workaround verified on device** (no core patch needed): re-sync the global metrics with the activity's display via the public API, on activity (re)creation and configuration changes:

```kotlin
// MainActivity
override fun onConfigurationChanged(newConfig: Configuration) {
  super.onConfigurationChanged(newConfig)
  com.facebook.react.uimanager.DisplayMetricsHolder.initDisplayMetrics(this)
}
// + same call right after super.onCreate(...)
```

A proper core fix would be RN keeping `DisplayMetricsHolder` in sync with the display the surface is attached to.

## Screenshots (from the production app where this was first hit)

| Bug A — content in a 1/density box | Bug B — text clipping (after fixing A only) | Both fixed |
|---|---|---|
| ![before](https://cdn.avarlabs.com/7a7085a6-5b4c-4e01-b5b4-bec8944d5831.jpg) | ![broken text](https://cdn.avarlabs.com/8e3b452b-27f0-4a81-a108-19f5ad287652.jpg) | ![after](https://cdn.avarlabs.com/4fc044b2-5aa0-40ba-987c-b43c036a4625.jpg) |

(The dark card is the in-app diagnostic overlay used for the measurements above.)

## How to run

```bash
cd ReproducerApp
yarn && yarn android   # install on a device with DeX / freeform windowing
```

Then switch to DeX (or open a freeform window on a different-density display). The app shows live measurements:

- `root onLayout (OUTSIDE stack)` ≈ window size — the RN root tracks the window correctly
- `INSIDE ScreenStack` content (pink border) ≈ `window ÷ phoneDensity` → **bug A**
- `window ÷ content width` ratio readout — equals the phone density when the bug triggers
- fixed-size text boxes clip their glyphs → **bug B**

On the phone display everything matches (single density — no mismatch), which is why these bugs survive most testing.

## Provenance / disclosure

This reproducer and the analysis were authored by **Claude (an AI coding agent)** operating on behalf of and supervised by **[@ziponia](https://github.com/ziponia)**, who hit these bugs in a production React Native app on Samsung DeX. The instrumentation, measurements and fixes above were validated on @ziponia's physical device (Galaxy S25 Ultra, One UI / Android 16) before publishing.
