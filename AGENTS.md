## Project Overview

- DraftLite is a static web app published from `docs/` for GitHub Pages.
- `docs/index.html` must work when opened directly in a browser.
- Do not introduce `npm`, bundlers, frameworks, or build pipelines.
- Use HTML, CSS, and JavaScript only.
- Favor an interaction model that feels natural to AutoCAD-experienced users.
- Keep the app lightweight, simple, and easy to maintain.

## Git Workflow Rules

- Default workflow is: local edit -> static verification -> one local commit -> stop.
- Work from the current local branch unless the user explicitly asks for something else.
- Do not switch branches unnecessarily.
- Do not push unless the user explicitly asks.
- Do not create a Pull Request unless the user explicitly asks.
- Do not merge a Pull Request unless the user explicitly asks.
- Do not delete remote branches unless the user explicitly asks.
- If the user says `local commit only`, `do not push`, or similar, stop before any GitHub operation.
- Final report must include:
  - summary of changes
  - changed files
  - changed functions
  - verification results
  - local commit hash
  - confirmation that nothing was pushed
  - confirmation that no PR was created or merged

## Verification Rules

- Keep changes small, safe, and easy to verify.
- Default verification scope is:
  - `node --check docs/app.js`
  - `git diff --check`
- Do not perform GUI/manual browser verification unless the user explicitly asks.
- Do not use Playwright, Chrome automation, temporary browser scripts, or GUI automation unless explicitly instructed.
- The user will manually verify GUI behavior in the browser.
- If `python3 scripts/serve.py --no-open --port 8123` fails because the port is already in use, do not inspect processes or kill anything.
- Report the port conflict and stop.
- For interaction changes, make the behavior easy for the user to verify manually.
- Do not rely on hidden or temporary debug UI unless explicitly requested.
- `data-testid` attributes should remain stable for future Codex, Chrome, and GUI verification.
- Debug helpers must not change normal user behavior unless explicitly called.
- Keep any debug bridge hidden and do not change normal user UI.

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

### Draft/Edit Priority

- Draft/edit operations must follow this priority:
  - Numeric input > Snap point > Raw pointer / click position
- If `numericInputBuffer` exists, numeric input always wins.
- A canvas click during numeric input must confirm the numeric value.
- It must not overwrite the active draft point with the clicked pointer position.
- If no numeric input exists, pointer/click confirmation should use snap-aware coordinates where the operation expects snapping.
- Raw pointer coordinates should be used only for intentional free-drag behavior.
- This rule applies consistently to `Line`, `Move`, `Copy`, `Grip edit`, `Rectangle edge edit`, and future handle-based edits.

### Hover-to-Edit / Borrowed Base Point

- A clearly highlighted hover handle may start editing without a prior selection click.
- Selected handles always have priority over unselected handles.
- An unselected handle must never override a selected handle within snap/hover tolerance.
- If nothing is selected, clicking an unselected handle may select that entity and start the relevant edit.
- If objects are already selected, clicking an unselected point handle uses that point as a borrowed base point for moving/copying the current selection.
- The borrowed object must remain unselected and unmoved.
- Rectangle side edges remain resize zones, not borrowed base points.
- Borrowed base handles may include:
  - line endpoints
  - rectangle corners
  - rectangle edge midpoints
  - circle centers
  - filledRegion / polygon vertices

- `Move` and `Copy` Dynamic Input should be shown at the lower-right of the cursor.
- `Line` and `Grip edit` Dynamic Input should be shown near the edited segment.
- `Group` / `Ungroup` are immediate Modify actions.
- Clicking one entity in a group should select the whole group.
- Group selection should work with window/crossing selection.
- Select drag copy and Copy tool should preserve complete groups when copied.
- Mobile touch behavior:
  - one-finger tap = drafting/select action
  - one-finger drag = pan
  - two-finger pinch = zoom

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
- Circle is a first-class `type:"circle"` entity.
- Arc is a first-class `type:"arc"` entity.
- Filled Region is a first-class `type:"filledRegion"` entity.
- Annotation baseline includes `type:"text"` entities; keep integer-unit coordinate handling consistent with other entities.
- Dimension entity `type:"dimension"` is supported for aligned linear annotation with unit-integer coordinates and mm display conversion only at render/export.

### Title Block Rules

- Title Block entity `type:"titleBlock"` is a paper/layout annotation entity, not a normal drawing object.
- Title Block text primitives must not be unified with normal `type:"text"` entity rendering.
- `getTitleBlockPrimitives()` is the source of truth for Title Block lines and text primitives.
- Title Block primitive text has two different size meanings:
  - `height`: world/canvas/raster/DXF size, already converted from paper mm through the Title Block scale.
  - `fontSizeMm`: paper/PDF size in millimeters.
- Canvas rendering must use `textPrimitive.height` so Title Block text follows zoom and Title Block scale.
- PNG/raster export must use `textPrimitive.height` or the equivalent raster-scaled world height.
- PDF export must use `textPrimitive.fontSizeMm` and convert it directly to PDF points.
- DXF export must use the world/DXF text height derived from `textPrimitive.height`.
- Do not pass Title Block primitive text through normal Text entity helpers such as center-anchored text geometry.
- Normal Text entities and Title Block primitive text must remain separate rendering/export paths.
- A fix for normal Text entities must not change Title Block text size, anchor, alignment, or export behavior.
- A fix for Title Block primitive text must not change normal Text entity behavior.
- When changing text rendering/export, verify all four paths:
  - Canvas
  - PDF
  - PNG
  - DXF

### Dimension Rules

- Dimension entities use:
  - `p1` and `p2` as measured points.
  - `offsetPoint` as the displayed dimension line location.
  - `extensionGap` as the visual gap from measured points to the start of extension lines.
- `p1` / `p2` editing changes the measured points and updates the displayed dimension value.
- Editing `p1` / `p2` must preserve the existing signed offset distance as much as possible.
- The offset handle edits only the displayed dimension line offset.
- The offset handle must not change `p1` or `p2`.
- `Extension Gap mm` changes only the visible start gap of extension lines.
- `Extension Gap mm` must not move `p1`, `p2`, or `offsetPoint`.
- Dimension text must remain parallel to the dimension direction.
- Horizontal dimension text appears above the dimension line.
- Vertical dimension text appears to the left of the dimension line.
- Dimension geometry uses the layer color:
  - dimension line
  - extension lines
  - dot ticks
- `Text Color` applies only to the dimension text.
- Tick markers are small filled dots, not diagonal tick marks.
- Continuous chain dimension drawing continues after the first dimension:
  - first dimension uses `p1 -> p2 -> offset`
  - following dimensions use `previous p2 -> next clicked point`
  - the same signed offset is reused
  - `Esc` ends the dimension command.
- Match Properties between dimensions copies dimension style only:
  - layer
  - Text Color
  - text height
  - tick size
  - precision
  - extension gap
- Match Properties must not copy dimension geometry:
  - `p1`
  - `p2`
  - `offsetPoint`
  - measured value
  - `textOverride`
- Rotate is a Modify tool for selected entities.
- Mirror is a two-point axis Modify tool.
- Group is not a new entity type.
- Groups are stored in `state.groups`.
- `groups[].entityIds` is the source of truth.
- `selectedEntityIds` remains normal entity IDs.
- Group is intended as the minimum reusable semantic unit for AI-assisted drafting.
- Use Group for stairs, room clusters, furniture layouts, core layouts, detail components, and other meaningful drawing parts.
- Save/load must preserve groups and remain compatible with older JSON without groups.
- Copying a complete group should create a new group for copied entities.
- Delete and cleanup must remove missing entity IDs from groups.
- Use Explode only when rectangle outlines need to be converted into 4 `line` entities.
- Do not convert rectangles into line entities during normal editing.
- Filled Region should not duplicate the first point as the last point in stored state.

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
- Radius-0 Fillet must keep the clicked side of each picked line.
- Do not move the endpoint on the clicked side to the intersection.
- Fillet must clearly show its two-step state: first line picked, then second side-to-keep pick.
- `Esc` must cancel Fillet and clear the temporary selection.

## Layer Rules

- Layers are part of normal document state.
- Every entity must reference an existing layer.
- Do not leave entities pointing to deleted or missing layer IDs.
- At least one layer must always exist.
- Layer add/remove must preserve JSON save/load compatibility.
- If deleting a layer, provide a user choice when requested:
  - move objects to another layer
  - delete objects on that layer
  - cancel
- After deleting a layer, activeLayer must always be a remaining valid layer.

## DXF Export Rules

- DXF is the primary export target going forward.
- DXF export must keep internal coordinates as integer units and convert to `mm` only at export time.
- DXF export must flip Y coordinates only at export time so AutoCAD orientation matches the canvas.
- Do not change internal state, canvas rendering, or JSON save/load for DXF Y flipping.
- DXF export should remain conservative R12/AC1009-style ASCII.
- Use CRLF line endings.
- Include explicit `HEADER`, `TABLES`, `BLOCKS`, `ENTITIES`, and `EOF` sections.
- DXF `HEADER` should stay minimal with `$ACADVER` only.
- Do not emit `$INSUNITS`, `OBJECTS`, subclass markers, or group code `100`.
- DXF `TABLES` should include at least `LTYPE` and `LAYER`.
- Layer names should be normalized to ASCII letters, numbers, and underscores.
- `rect` entities must export as virtual 4-segment `LINE` outlines at export time without mutating internal state.
- `filledRegion` entities may export as closed virtual `LINE` outlines unless a conservative compatible hatch implementation is explicitly requested.
- Do not let DXF export reference missing layer IDs.

## UI Simplicity Rule

- DraftLite should remain simple and lightweight.
- Do not add permanent status/debug panels unless explicitly requested.
- Avoid always-visible diagnostic UI.
- Keep the normal UI focused on controls needed for drafting.
- Keep the top ribbon compact.
- Keep Layers and Properties in the right sidebar unless explicitly requested.
- Avoid adding large modal workflows unless the user explicitly requests them.
- Match the existing visual tone when adding buttons, controls, dialogs, or panels.

## Reporting Rules

After completing a task, report only the essential information:

- Summary
- Changed files
- Changed functions
- Verification commands and results
- Unverified manual GUI items, if any
- Local commit hash
- Confirmation that no push / PR / merge was performed

Do not include long explanations unless the user asks.

## Agent IO / DraftLiteAgent Notes

- Agent IO is an AI-agent I/O port, not a human chat UI.
- Agent IO users should start with `tools` to discover available commands.
- For ChatGPT Agent Mode or browser agents, open DraftLite with `?agent=1`.
- `?agent=1` opens Agent IO, preloads `tools`, and makes the agent discovery path visible.
- `DraftLiteAgent` provides an MCP-style tool/resource interface.
- This is MCP-shaped browser API for GitHub Pages, not a real MCP server.
- Keep both legacy action format and MCP-style `tool`/`arguments` format.
- No destructive API changes; preserve compatibility for debug helpers, hidden bridge, JSON, and DXF.
- Agent IO exposes group data for AI reuse.
- Supported group tools:
  - `get_groups`
  - `get_selected_groups`
  - `export_selected_groups`
  - `copy_selected_groups`
- Supported group resources:
  - `draftlite://groups`
  - `draftlite://selected-groups`
- Group export should include bounds, entity count, entity types, metadata, and grouped entities.
- Group data is the bridge from raw drafting entities to reusable semantic parts for AI-assisted drafting.
