"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const context = vm.createContext({ window: {} });
const toolFiles = [
  "docs/tools/registry.js",
  "docs/tools/modify/moveCopy.js",
  "docs/tools/modify/rotate.js",
  "docs/tools/modify/mirror.js",
  "docs/tools/modify/group.js",
  "docs/tools/modify/matchProperties.js",
  "docs/tools/modify/explode.js",
  "docs/tools/modify/align.js",
  "docs/tools/modify/extend.js",
  "docs/tools/modify/offset.js",
  "docs/tools/modify/trim.js",
  "docs/tools/modify/fillet.js",
  "docs/tools/selection/gripEdit.js",
  "docs/tools/selection/rectangleEdit.js",
  "docs/tools/selection/selection.js",
  "docs/tools/draw/line.js",
  "docs/tools/draw/wire.js",
  "docs/tools/draw/rectangle.js",
  "docs/tools/draw/circle.js",
  "docs/tools/draw/arc.js",
  "docs/tools/draw/filledRegion.js",
];

for (const relativePath of toolFiles) {
  const filePath = path.join(rootDir, relativePath);
  vm.runInContext(fs.readFileSync(filePath, "utf8"), context, { filename: filePath });
}

const registry = context.window.DraftLiteTools;
assert.ok(registry, "DraftLiteTools namespace should exist");
assert.equal(Object.isFrozen(registry), true, "registry API should be frozen");
for (const method of ["register", "get", "has", "list"]) {
  assert.equal(typeof registry[method], "function", `${method} should exist`);
}
assert.throws(() => registry.register("invalid factory", () => {}), /Tool ID/);
assert.throws(() => registry.register("camelCaseTool", () => ({})), /lowercase, kebab-case/);
assert.throws(() => registry.register("not-a-factory", {}), /factory/);
assert.throws(() => registry.register("align", () => ({})), /already registered/);

const expectedIds = ["align", "arc", "circle", "copy", "explode", "extend", "filled-region", "fillet", "grip-edit", "group", "line", "match-properties", "mirror", "move", "offset", "rectangle", "rectangle-edit", "rotate", "selection", "trim", "ungroup", "wire"];
assert.deepEqual(Array.from(registry.list()), expectedIds, "tools should each be registered exactly once in deterministic order");
for (const id of expectedIds) {
  assert.equal(registry.has(id), true, `${id} should be registered`);
  const factory = registry.get(id);
  assert.equal(typeof factory, "function", `${id} factory should be returned`);
  const controller = factory({});
  assert.ok(controller && typeof controller === "object", `${id} should create a controller`);
  assert.equal(Object.isFrozen(controller), true, `${id} controller should be frozen`);
  for (const hook of ["activate", "handleClick", "handlePointerMove", "handleKeyDown", "cancel", "drawPreview", "getGuideText", "isInProgress"]) {
    if (hook in controller) assert.equal(typeof controller[hook], "function", `${id}.${hook} should be a function`);
  }
}

for (const id of ["move", "copy"]) {
  const controller = registry.get(id)({ getUiState: () => ({ transformDraft: null }), getState: () => ({ selectedEntityIds: [] }), canStartTransformTool: () => false });
  assert.equal(typeof controller.start, "function", `${id} should share the transform start contract`);
  assert.equal(typeof controller.update, "function", `${id} should share the transform update contract`);
  assert.equal(typeof controller.apply, "function", `${id} should share the transform apply contract`);
  assert.equal(typeof controller.applyNumeric, "function", `${id} should share numeric confirmation`);
}

for (const [id, label] of [["move", "Move"], ["copy", "Copy"]]) {
  for (const [hasSelection, expectedStatus] of [
    [false, `${label}: Select objects.`],
    [true, `${label}: Specify base point.`],
  ]) {
    let status = "";
    const controller = registry.get(id)({
      capitalize: (value) => value[0].toUpperCase() + value.slice(1),
      canStartTransformTool: () => hasSelection,
      setStatus: (message) => { status = message; },
    });
    controller.activate();
    assert.equal(status, expectedStatus, `${id}.activate should preserve selection status`);
  }
}

const copyDraft = { mode: "copy", numericInputBuffer: "" };
const copyUiState = { activeTool: "copy", transformDraft: copyDraft };
const copyController = registry.get("copy")({ getUiState: () => copyUiState });
assert.equal(copyController.handleKeyDown({ key: "Enter" }), false, "empty Enter should remain unhandled during Copy");
assert.equal(copyUiState.transformDraft, copyDraft, "empty Enter should preserve the Copy draft");
assert.equal(copyUiState.activeTool, "copy", "empty Enter should preserve the active Copy tool");

for (const id of ["rotate", "group", "ungroup", "explode"]) {
  assert.equal(typeof registry.get(id)({}).execute, "function", `${id} should expose the immediate execute contract`);
}
assert.equal(typeof registry.get("match-properties")({}).handleClick, "function", "match-properties should instantiate without DOM access");

function eventFor(key, detail = 1) {
  return { key, detail, preventDefault() {} };
}

const lineUi = { activeTool: "line", lineDraft: null, linePreviewTimer: null, hoverWorld: { x: 100, y: 0 } };
let lineStatus = "";
let lineCreated = 0;
const lineController = registry.get("line")({
  getUiState: () => lineUi,
  getState: () => ({ activeLayerId: "layer-1" }),
  getLayerById: () => ({ visible: true, locked: false }),
  setStatus: (message) => { lineStatus = message; },
  draw() {}, renderStatusPanel() {}, formatWorldPoint: ({ x, y }) => `${x}, ${y}`,
  addLineEntity: (p1, p2) => { lineCreated += 1; return { p1, p2 }; },
  mmToUnits: (value) => value * 10, roundToGridUnit: Math.round,
  clearLinePreviewTimer() {}, setLinePreviewTimer() {}, drawDraftLine() {}, syncAfterStateChange() {},
});
lineController.activate();
assert.equal(lineStatus, "Line tool active.");
lineController.handleClick({ x: 0, y: 0 });
assert.deepEqual(JSON.parse(JSON.stringify(lineUi.lineDraft)), { start: { x: 0, y: 0 }, numericInputBuffer: "", previewPoint: null });
lineController.handleKeyDown(eventFor("1"));
lineController.handleKeyDown(eventFor("2"));
assert.equal(lineUi.lineDraft.numericInputBuffer, "12");
lineController.handleKeyDown(eventFor("Backspace"));
assert.equal(lineUi.lineDraft.numericInputBuffer, "1");
lineUi.lineDraft.numericInputBuffer = "";
lineController.handleKeyDown(eventFor("Enter"));
assert.equal(lineUi.lineDraft, null, "empty Enter should end Line");
assert.equal(lineCreated, 0, "Line draft checks should not create an entity");

for (const [id, draftKey, points] of [
  ["wire", "wireDraft", [{ x: 0, y: 0 }, { x: 10, y: 10 }]],
  ["rectangle", "rectangleDraft", [{ x: 0, y: 0 }, { x: 10, y: 10 }]],
  ["circle", "circleDraft", [{ x: 0, y: 0 }, { x: 10, y: 0 }]],
]) {
  const ui = { activeTool: id, [draftKey]: null, hoverWorld: { x: 0, y: 0 } };
  let creates = 0;
  const controller = registry.get(id)({
    getUiState: () => ui, getState: () => ({ activeLayerId: "layer-1" }),
    getLayerById: () => ({ visible: true, locked: false }), canDrawOnActiveLayer: () => true,
    roundWorldPoint: ({ x, y }) => ({ x, y }), formatWorldPoint: () => "0, 0",
    addWireEntity: () => { creates += 1; return {}; }, addRectangleEntity: () => { creates += 1; return true; },
    addCircleEntity: () => { creates += 1; return {}; }, draw() {}, renderStatusPanel() {}, setStatus() {}, syncAfterStateChange() {},
    drawDraftWire() {}, drawDraftRectangle() {}, drawDraftCircle() {},
  });
  controller.handleClick(points[0], eventFor("", 1));
  assert.ok(ui[draftKey], `${id} first click should start its draft`);
  if (id === "wire") assert.equal(ui.wireDraft.tension, 0.45);
  controller.handleClick(points[1], eventFor("", 1));
  assert.equal(creates, 1, `${id} second click should use its creation helper`);
  assert.equal(ui[draftKey], null, `${id} should finish after creation`);
}

const arcUi = { arcDraft: null };
let arcs = 0;
const arcController = registry.get("arc")({ getUiState: () => arcUi, canDrawOnActiveLayer: () => true, roundWorldPoint: (p) => ({ ...p }), roundToUnit: Math.round, angleDegFromCenter: () => 0, snapAngleTo90: (a) => a, formatWorldPoint: () => "0, 0", addArcEntity: () => { arcs += 1; return {}; }, setStatus() {}, draw() {}, drawDraftArc() {} });
arcController.handleClick({ x: 0, y: 0 });
assert.equal(arcUi.arcDraft.step, 1);
arcController.handleClick({ x: 10, y: 0 });
assert.equal(arcUi.arcDraft.step, 2);
arcController.handleClick({ x: 0, y: 10 });
assert.equal(arcs, 1);
assert.equal(arcUi.arcDraft, null);

const regionUi = { filledRegionDraft: null };
let regions = 0;
const regionController = registry.get("filled-region")({ getUiState: () => regionUi, canDrawOnActiveLayer: () => true, roundWorldPoint: (p) => ({ ...p }), createFilledRegionEntity: () => { assert.equal(regionUi.filledRegionDraft, null, "Filled Region draft must be cleared before sync/create"); regions += 1; return {}; }, setStatus() {}, draw() {}, drawDraftFilledRegion() {} });
regionController.handleClick({ x: 0, y: 0 }, eventFor(""));
regionController.handleClick({ x: 10, y: 0 }, eventFor(""));
assert.equal(regionController.finish(), false);
assert.equal(regions, 0);
assert.equal(regionUi.filledRegionDraft.points.length, 2, "invalid Filled Region finish should preserve the draft");
regionController.handleClick({ x: 10, y: 10 }, eventFor(""));
assert.equal(regionController.finish(), true);
assert.equal(regions, 1);

const selectionUiState = { selectionWindow: null };
const selectionController = registry.get("selection")({
  getUiState: () => selectionUiState,
  worldToScreen: ({ x, y }) => ({ x: x * 2, y: y * 2 }),
  draw() {},
});
assert.equal(typeof selectionController.beginWindow, "function");
assert.equal(typeof selectionController.handleClick, "function");
selectionController.beginWindow({ x: 3, y: 4 }, true);
assert.deepEqual(
  JSON.parse(JSON.stringify(selectionUiState.selectionWindow)),
  { append: true, startScreen: { x: 6, y: 8 }, currentScreen: { x: 6, y: 8 }, startWorld: { x: 3, y: 4 }, currentWorld: { x: 3, y: 4 } },
  "selection window initialization should be deterministic"
);

selectionUiState.selectionWindow = null;
const blankSelectionController = registry.get("selection")({
  getState: () => ({ selectedEntityIds: [] }),
  getUiState: () => selectionUiState,
  getGripController: () => ({ isInProgress: () => false, findAtPoint: () => null }),
  getRectangleController: () => ({ isInProgress: () => false, findAtPoint: () => null }),
  findSelectedMoveAnchorAtPoint: () => null,
  findBorrowedMoveBaseHandleAtPoint: () => null,
  getEntityById: () => null,
  roundWorldPoint: ({ x, y }) => ({ x, y }),
  worldToScreen: ({ x, y }) => ({ x, y }),
  draw() {},
});
blankSelectionController.handleClick(
  { x: 10, y: 20 },
  { x: 10, y: 20 },
  { shiftKey: true, altKey: false, ctrlKey: false }
);
assert.equal(selectionUiState.selectionWindow.append, true, "Shift + blank selection should start an appended selection window");

console.log("Tool registry and controller checks passed.");
