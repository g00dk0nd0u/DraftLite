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
- AutoCAD-like Move / Copy
- Delete
- Pan/Zoom
- Ortho default ON
- Layers
- Endpoint / Midpoint snap
- Numeric input for Line / Move / Copy
- JSON save/load
- SVG export

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
- SVG export for visible lines

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
- Fillet
- Offset
- DXF export
- Print / PDF export

## Run

Open `docs/index.html` directly in a browser. No npm, no build step, and no external library are required.
