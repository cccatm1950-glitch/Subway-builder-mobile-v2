# MapLibre 3D renderer experiment

This is an isolated renderer spike. It does not replace Leaflet in the game and does not change the default launch path.

## Preview
Open `maplibre-3d-spike.html` from the app's Android assets in the WebView. The page starts over central San Francisco and includes a sample two-rail alignment with two platform footprints. The sample overlays are illustrative, not loaded from a saved game.

## Stack
- MapLibre GL JS 6.9.0 for WebGL vector rendering, camera pitch and bearing.
- Maptoolkit Community `street.json` style and Scene3D control for 3D buildings/trees.
- No API key or sign-up is required for the community basemap/3D building source.
- Required Maptoolkit and OpenStreetMap attribution is retained by the style and logo control.

## Why this is separate
The game currently relies on Leaflet's map object, panes, layers, bounds, projection helpers and input events throughout the 614 KB game page. A renderer migration must port those interactions deliberately. The spike is intentionally isolated so it cannot destabilize station placement, track editing, simulation, saves or undo/redo.

## Constraints to validate
- Community tile service is shared/best-effort; not suitable as a guaranteed offline source.
- Community service does not allow bulk extraction, offline tile generation or mirroring.
- WebView must support WebGL2/ES modules/import maps and external CDN requests.
- Detailed roof-shape buildings and trees load at close zoom; coverage/detail depends on OSM tagging and city-model availability.

## Next migration gate
Only proceed beyond the spike after verifying Android WebView rendering/performance, SF building coverage, map touch/gesture behavior, track/platform overlays, camera coordinate conversions, and attribution. Keep Leaflet as fallback until those checks pass.
