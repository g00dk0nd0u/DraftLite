# DraftLite

A lightweight browser-based 2D drafting tool for architectural details and residential plan studies.

## Concept

- Static browser app published from `docs/` and compatible with GitHub Pages
- Opens directly from `docs/index.html`
- Vanilla HTML, CSS, and JavaScript only: no npm, frameworks, build system, or build step
- Integer geometry at `1 unit = 0.1 mm`; no floating-point geometry model

## Current features

- **Drafting:** continuous Line, Rectangle, Circle, Arc, and Filled Region tools; Ortho, endpoint/midpoint snapping, numeric and Dynamic Input, pan/zoom, and mobile touch controls.
- **Selection and modification:** Window/Crossing and additive selection, grip and rectangle-edge editing, Move, Copy, drag move/copy, Rotate, Mirror, chained multi-target rotational line-to-line Align, Extend, line Offset, line Trim, radius-0 Fillet/Join and true-radius Arc Fillet for lines, Delete, and rectangle Explode.
- **Organization and reuse:** layers and properties; Group/Ungroup; reusable Block definitions and instances; and a persistent Library with built-in, repository, and local items plus JSON import/export.
- **Annotation and layout:** Text annotation, Aligned Dimension, and configurable Title Blocks with canvas, PNG, PDF, and DXF output paths.
- **References:** PDF Underlay import and replacement, plus linked DXF Underlays.
- **Documents and interchange:** local autosave, compatible JSON save/load (including legacy document migration), conservative R12/AC1009 ASCII DXF export, and drawing-level PDF export from Manage / File using a visible Title Block.
- **Agent integration:** Agent IO exposes drawing and group data for AI-assisted inspection, export, copying, and reuse.
- **Interface:** compact toolbar, layer and properties sidebars, a persistent concise command guide for multi-step Modify tools, coarse 1 m dot grid, and persisted light/dark theme.

## Current MVP scope

DraftLite is a static browser application served from `docs/`. It supports GitHub Pages and direct opening of `docs/index.html`, without npm or a build step. The implementation remains vanilla HTML, CSS, and JavaScript, with a `0.1 mm` integer coordinate model and browser storage for autosave and persistent Library items.

## Coordinate model

- DraftLite uses integer coordinates for internal geometry: `1 unit = 0.1 mm` (for example, `3000 mm = 30000 units`).
- JavaScript `Number` values are kept as integer units; state does not store coordinates in `mm`.
- Display, input parsing, DXF/PDF export, and external integrations convert units to `mm` only at their boundaries.
- Saved geometry uses `fileVersion: 2` and `unitMm: 0.1`; legacy `0.5 mm` documents are migrated on load by multiplying unit coordinates by `5`.
- Visual grid density is independent of precision. The canvas uses a coarse 1 m dot grid rather than a `0.1 mm` grid.

## Interaction principles

- Interaction is intentionally familiar to AutoCAD-experienced users.
- `Line` continues until `Esc` or empty `Enter`; `Move` uses base point then second point; `Copy` keeps its base point for continuous placement.
- Ortho is on by default, with `Shift` temporarily enabling free-angle input.
- `Select` uses left-to-right Window selection and right-to-left Crossing selection. Selected geometry supports grips and free drag move; `Option` on macOS or `Ctrl` on Windows enables the applicable copy behavior.
- Group selection and copying preserve complete groups.
- Numeric input takes priority over snap and pointer input, is entered in `mm`, and is committed as integer units.
- On touch devices, tap drafts/selects, one-finger drag pans, and two-finger pinch zooms.

Detailed interaction, entity, export, and verification constraints are maintained in `AGENTS.md`.

## Group and Agent IO reuse

Groups add reusable semantic metadata while their members remain normal drawing entities. Agent IO can inspect, export, and copy groups through `get_groups`, `get_selected_groups`, `export_selected_groups`, and `copy_selected_groups`, and through the `draftlite://groups` and `draftlite://selected-groups` resources.

For browser agents, open DraftLite with `?agent=1` and begin with `tools` to discover the available MCP-shaped browser API. Legacy action requests and MCP-style `tool` / `arguments` requests are both supported.

## File layout

```text
README.md                       Project overview and developer entry point
AGENTS.md                       Detailed implementation and workflow rules
docs/
  index.html                    Direct-open application entry point
  style.css                     Application styles
  app.js                        Main application behavior
  core/
    units.js                    Pure coordinate/unit helpers
    geometry.js                 Pure geometry helpers
  pdfUnderlay.js                PDF Underlay support
  dxfUnderlay/                  DXF Link / Underlay support
  library/                      Built-in and repository Library data
  titleBlock/                   Title Block templates and helpers
  manual-block-v1-smoke-checks.md
scripts/
  serve.py                      Optional local static server
user_tools/                     Repository support utilities
```

The `docs/core/units.js` and `docs/core/geometry.js` classic scripts begin the incremental extraction of pure unit and geometry helpers from `app.js`. They preserve direct-open compatibility and introduce no build system.

## Run

Open `docs/index.html` directly in a browser. No npm or build step is required. PDF Underlay uses PDF.js loaded from cdnjs.

For optional local HTTP serving:

```bash
python3 scripts/serve.py --no-open --port 8123
```

Then open [http://127.0.0.1:8123/](http://127.0.0.1:8123/).

## Development verification

- Follow `AGENTS.md` for the detailed development constraints and verification rules.
- Use `git diff --check` for documentation-only changes.
- `window.DraftLiteDebug` and its hidden DOM CustomEvent bridge provide development helpers without changing normal behavior unless explicitly invoked.
- DXF output intentionally remains conservative ASCII `AC1009`: CRLF line endings, explicit `HEADER`, `TABLES`, `BLOCKS`, `ENTITIES`, and `EOF` sections, a minimal header without `$INSUNITS`, and no subclass group code `100`. Rectangle and Filled Region outlines are emitted virtually without mutating document state, layer names are normalized for compatibility, and Y coordinates are flipped only at export time.

## Roadmap

- Stabilization sequence Issues #69–#72 completed.
- Completed: chained Multi-target Align — Issue #83.
- Completed: drawing-level PDF export — Issue #85.
- Current: concise multi-step command guide — Issue #87.
