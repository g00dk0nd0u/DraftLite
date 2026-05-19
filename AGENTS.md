## Project Overview

- DraftLite is a static web app published from `docs/` for GitHub Pages.
- `docs/index.html` must work when opened directly in a browser.
- Do not introduce `npm`, bundlers, frameworks, or build pipelines.
- Use HTML, CSS, and JavaScript only.
- Favor an interaction model that feels natural to AutoCAD-experienced users.

## Git Workflow Rules

- Default workflow is: local edit -> verification -> one local commit -> stop.
- Work from the current local branch unless the user explicitly asks for something else.
- Do not switch branches unnecessarily.
- Do not push unless the user explicitly asks.
- Do not create a Pull Request unless the user explicitly asks.
- Do not merge a Pull Request unless the user explicitly asks.
- Do not delete remote branches unless the user explicitly asks.
- If the user says `local commit only`, `do not push`, or similar, stop before any GitHub operation.
- Final report must include:
- summary of changes
- verification results
- local commit hash
- confirmation that nothing was pushed

## Drafting Interaction Rules

- Favor an AutoCAD-like operation model.
- Ortho is ON by default.
- Holding `Shift` temporarily enables free-angle input.
- `Line` continues until `Esc` or empty `Enter`.
- `Move` uses `base point -> second point` and finishes after one confirmed move.
- In `Move`, holding `Option` on macOS or `Ctrl` on Windows while picking the base point should switch that Move command into copy mode.
- `Copy` keeps the same base point and supports continuous copy placement.
- `Select` uses left-to-right Window selection and right-to-left Crossing selection.
- While using `Select`, clicking an endpoint grip on a selected line starts endpoint grip edit.
- While using `Select`, clicking and dragging a selected entity body starts free drag move for the current selection.
- Holding `Option` on macOS or `Ctrl` on Windows at Select-drag start should switch that drag into one-shot copy mode while keeping the source entities.
- Grip edit should follow an AutoCAD-like endpoint stretch interaction.
- Select drag move must not use OSNAP, grid snap, or ortho during the drag preview; commit back to integer units only.
- Numeric input preview for `Line`, `Move`, `Copy`, and `Grip edit` must use a `250ms` delayed preview.
- Confirming with `Enter` must match the currently displayed preview position.
- `Move` and `Copy` Dynamic Input should be shown at the lower-right of the cursor.
- `Line` and `Grip edit` Dynamic Input should be shown near the edited segment.

## Geometry And Coordinate Rules

- Internal coordinates must remain integer units.
- Keep internal `0.1 mm` integer unit coordinates.
- `1 unit = 0.1 mm`.
- Do not store mm values in state.
- Convert to mm only for display, input parsing, DXF/PDF export, and external integrations.
- Do not turn DraftLite into a floating-point CAD model.
- Legacy `0.5 mm` unit JSON must be migrated on load by multiplying unit coordinates by `5`.
- Do not draw a `0.1 mm` visual grid.
- JSON save/load must remain compatible.

## Entity And Tool Rules

- Keep compatibility with existing `line` entities and legacy line-only JSON documents.
- Rectangle is a first-class `type:"rect"` rectangular region object.
- Annotation baseline includes `type:"text"` entities; keep integer-unit coordinate handling consistent with other entities.
- Dimension entity (`type:"dimension"`) is supported for aligned linear annotation with unit-integer coordinates and mm display conversion only at render/export.
- Use Explode only when rectangle outlines need to be converted into 4 `line` entities.
- Do not introduce arc entities yet.

### Align

- Initial Align implementation is line-to-line parallel alignment only.
- Align must keep the first picked reference line fixed.
- Align must move only the second picked target line.
- Do not rotate target geometry in the first implementation.

### Extend

- Initial Extend implementation is boundary-line then target-line, line-only.
- Extend must keep the boundary line fixed.
- Extend must move only the boundary-side endpoint of the second picked target line to the infinite-line intersection.

### Fillet

- Initial Fillet implementation is radius=0 join only.
- Fillet modifies existing line endpoints to their infinite-line intersection.
- Radius-0 Fillet must keep the clicked side of each picked line. Do not move the endpoint on the clicked side to the intersection.
- Fillet must clearly show its two-step state: first line picked, then second side-to-keep pick.
- `Esc` must cancel Fillet and clear the temporary selection.

## DXF Export Rules

- DXF is the primary export target going forward.
- DXF export must keep internal coordinates as integer units and convert to `mm` only at export time.
- DXF export must flip Y coordinates only at export time so AutoCAD orientation matches the canvas; do not change internal state, canvas rendering, or JSON save/load for this.
- DXF export should remain conservative R12/AC1009-style ASCII.
- Use CRLF line endings.
- Include explicit `HEADER`, `TABLES`, `BLOCKS`, `ENTITIES`, and `EOF` sections.
- DXF `HEADER` should stay minimal with `$ACADVER` only.
- Do not emit `$INSUNITS`, `OBJECTS`, subclass markers, or group code `100`.
- DXF `TABLES` should include at least `LTYPE` and `LAYER`.
- Layer names should be normalized to ASCII letters, numbers, and underscores.
- `rect` entities must export as virtual 4-segment `LINE` outlines at export time without mutating internal state.

## Verification Rules

- Keep changes small, safe, and easy to verify.
- After implementation, run `node --check docs/app.js`.
- Run `git diff --check`.
- Prefer using `scripts/serve.py` and Chrome GUI verification when changing interactive tools.
- For geometry tools such as Align and Fillet, verify both visually and numerically using `window.DraftLiteDebug`.
- Do not rely only on `node --check` for interaction changes.
- Add or update debug fixtures when introducing geometry editing tools.
- `data-testid` attributes should remain stable for Codex, Chrome, and GUI verification.
- Debug helpers must not change normal user behavior unless explicitly called.
- If `window.DraftLiteDebug` is not visible from the Chrome execution context, use the DOM CustomEvent bridge.
- Prefer `draftlite:debug-command` plus `[data-testid="debug-bridge-output"]` for Chrome plugin verification.
- Keep the bridge hidden and do not change normal user UI.
- Update bridge commands when adding new debug helpers.

## UI Simplicity Rule

- DraftLite should remain simple and lightweight.
- Do not add permanent status/debug panels unless explicitly requested.
- Avoid always-visible diagnostic UI.
- Keep the normal UI focused on controls needed for drafting.
