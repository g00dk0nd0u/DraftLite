# DraftLite

A lightweight browser-based 2D drafting sketch tool for architectural details and residential plan studies.

## Concept

- Revit Drafting View Lite
- 0.5mm integer grid
- no floating point geometry
- no build step
- HTML/CSS/JavaScript only

## Current features

- Continuous Line drawing
- Selection
- Window / Crossing selection
- Shift additive selection
- Move selected lines
- Copy selected lines
- Line-to-Line Align for parallel lines
- Radius-0 Fillet / Join for two lines
- Fillet keeps the clicked side of each line and moves the opposite endpoints to the intersection
- Fillet highlights the first picked line while waiting for the second pick
- AutoCAD-like Move / Copy
- Grip edit for selected line endpoints
- AutoCAD-like endpoint stretch behavior
- Delete
- Pan/Zoom
- Ortho default ON
- Layers
- Endpoint / Midpoint snap
- Dynamic Input-style distance display
- Numeric input for Line / Move / Copy / Grip edit
- 250ms delayed numeric preview for Line / Move / Copy / Grip edit
- Move / Copy / Grip edit numeric input preview
- JSON save/load
- DXF export

## Current MVP scope

The current implementation is a static browser app under `docs/` and runs directly by opening `docs/index.html`.

Included in this first pass:

- Canvas drafting workspace
- Top toolbar and right sidebar
- Integer-unit world coordinate model
- Line tool with preview
- Select and highlight
- Delete
- Undo / Redo
- Mouse wheel zoom
- Middle mouse drag pan
- Middle double click fit all
- Layer visible / lock / color / active controls
- JSON save/load
- localStorage autosave restore
- DXF export for visible lines

## Coordinate model

- Internal geometry uses integers only
- `1 unit = 0.5 mm`
- Example: `3000 mm = 6000 units`
- Display values are shown in `mm`
- Saved document geometry remains integer `unit` data
- Internal precision remains `0.5 mm`, while the display grid uses `100 mm` minor and `1000 mm` major intervals

## Interaction principles

- Interaction feel is intentionally biased toward AutoCAD-experienced users
- `Line` continues segment-by-segment until `Esc` or empty `Enter`
- `Move` uses `base point -> second point` and finishes after one confirmed move
- `Copy` keeps the same base point and supports continuous copy placement until `Esc` or empty `Enter`
- Ortho is ON by default, and holding `Shift` temporarily enables free-angle input
- `Select` uses left-to-right `Window selection` and right-to-left `Crossing selection`
- `Shift + click` and `Shift + selection window` add to the current selection
- Clicking a selected line endpoint grip in `Select` starts endpoint grip edit
- Grip edit follows an AutoCAD-like endpoint stretch interaction
- Numeric input preview for `Line` / `Move` / `Copy` / `Grip edit` uses a `250ms` delayed preview
- Confirming with `Enter` matches the currently displayed preview position
- `Move` / `Copy` dynamic input is shown near the lower-right of the cursor
- `Line` / `Grip edit` dynamic input is shown near the edited segment
- Numeric input is entered in `mm`, while internal geometry remains `0.5 mm` integer units

## File layout

- `docs/index.html`
- `docs/style.css`
- `docs/app.js`
- `reference/blockplan.zip`
- `user_tools/export_review_package.py`

## Roadmap

- Rectangle
- Linear Dimension
- Text
- Trim
- Rotational Align
- Multi-target Align
- Arc Fillet
- Offset
- Print / PDF export

## Run

Open `docs/index.html` directly in a browser. No npm, no build step, and no external library are required.

## Development / GUI verification

- DraftLite can be opened directly from `docs/index.html`.
- For Chrome-based GUI verification, use:

```bash
python scripts/serve.py
```

- Then open [http://127.0.0.1:8123/](http://127.0.0.1:8123/).
- Development helper API is exposed as `window.DraftLiteDebug`.
- Example:

```js
DraftLiteDebug.loadFixture("align-horizontal");
DraftLiteDebug.getLines();
DraftLiteDebug.measureLineDistanceToLine("ent-2", "ent-1");
```

- `DraftLiteDebug` is intended for development support only. It does not change normal behavior unless you explicitly call a helper such as `clearDocument()` or `loadFixture()`.
- If `window.DraftLiteDebug` is not directly visible from the browser execution context, use the DOM CustomEvent bridge instead.
- Bridge example:

```js
document.dispatchEvent(new CustomEvent("draftlite:debug-command", {
  detail: {
    id: "fixture-1",
    command: "loadFixture",
    args: ["align-horizontal"]
  }
}));

const output = document.querySelector('[data-testid="debug-bridge-output"]');
JSON.parse(output.dataset.lastResult);
```

- Click-point example:

```js
document.dispatchEvent(new CustomEvent("draftlite:debug-command", {
  detail: {
    id: "click-1",
    command: "getCanvasClickPointForLine",
    args: ["ent-1", 0.5]
  }
}));

const output = document.querySelector('[data-testid="debug-bridge-output"]');
const result = JSON.parse(output.dataset.lastResult);
result.client.x;
result.client.y;
```
