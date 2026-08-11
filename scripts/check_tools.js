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
  "docs/tools/modify/makeBlock.js",
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
  "docs/tools/annotate/text.js",
  "docs/tools/annotate/dimension.js",
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

const expectedIds = ["align", "arc", "circle", "copy", "dimension", "explode", "extend", "filled-region", "fillet", "grip-edit", "group", "line", "make-block", "match-properties", "mirror", "move", "offset", "rectangle", "rectangle-edit", "rotate", "selection", "text", "trim", "ungroup", "wire"];
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

for (const id of ["rotate", "group", "ungroup", "explode", "make-block"]) {
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

function createTextCheck(promptValue, layer) {
  const textState = { activeLayerId: "layer-1", entities: [], selectedEntityIds: [] };
  let undoCount = 0;
  let promptCount = 0;
  let syncCount = 0;
  let status = "";
  const controller = registry.get("text")({
    getState: () => textState,
    getLayerById: () => layer,
    promptTextContent: () => { promptCount += 1; return promptValue; },
    setStatus: (value) => { status = value; },
    pushUndoState: () => { undoCount += 1; },
    createEntityId: () => "ent-1",
    roundToUnit: Math.round,
    mmToUnits: (value) => value * 10,
    syncAfterStateChange: () => { syncCount += 1; },
  });
  controller.handleClick({ x: 12.4, y: 25.6 });
  return { textState, undoCount, promptCount, syncCount, status };
}

const createdText = createTextCheck(" Hello ", { visible: true, locked: false });
assert.equal(createdText.undoCount, 1);
assert.equal(createdText.syncCount, 1);
assert.deepEqual(JSON.parse(JSON.stringify(createdText.textState.entities[0])), {
  id: "ent-1", type: "text", layerId: "layer-1", x: 12, y: 26, text: "Hello",
  height: 1000, rotation: 0, align: "left", textAnchor: "center", color: "",
});
assert.deepEqual(JSON.parse(JSON.stringify(createdText.textState.selectedEntityIds)), ["ent-1"]);
for (const [value, expectedStatus] of [[null, "Text placement cancelled."], ["   ", "Empty text was not created."]]) {
  const result = createTextCheck(value, { visible: true, locked: false });
  assert.equal(result.undoCount, 0);
  assert.equal(result.textState.entities.length, 0);
  assert.equal(result.status, expectedStatus);
}
for (const layer of [null, { visible: false, locked: false }, { visible: true, locked: true }]) {
  const result = createTextCheck("Hello", layer);
  assert.equal(result.promptCount, 0);
  assert.equal(result.undoCount, 0);
  assert.equal(result.textState.entities.length, 0);
}

const dimensionState = { activeLayerId: "layer-1", entities: [], selectedEntityIds: [] };
const dimensionUi = { dimensionDraft: null, dimensionEndpointEditDraft: null, dimensionOffsetEditDraft: null, hoverWorld: { x: 10, y: 20 } };
let dimensionUndoCount = 0;
let dimensionId = 0;
const dimensionContext = {
  getState: () => dimensionState, getUiState: () => dimensionUi,
  getLayerById: () => ({ visible: true, locked: false }),
  roundWorldPoint: ({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }), roundToUnit: Math.round,
  createEntityId: () => `dim-${++dimensionId}`,
  createDefaultDimensionEntity: (fields) => ({ type: "dimension", ...fields, p1: { ...fields.p1 }, p2: { ...fields.p2 }, offsetPoint: { ...fields.offsetPoint } }),
  createDimensionWithPreservedOffset: (entity, endpoint, point, signedOffset) => {
    const next = { ...entity, p1: { ...entity.p1 }, p2: { ...entity.p2 }, offsetPoint: { x: point.x, y: signedOffset } };
    next[endpoint] = { ...point };
    if (next.p1.x === next.p2.x && next.p1.y === next.p2.y) return null;
    return next;
  },
  getDimensionGeometry: (entity) => ({ signedOffset: entity.offsetPoint.y, midpoint: { x: 5, y: 0 }, normal: { x: 0, y: 1 } }),
  pushUndoState: () => { dimensionUndoCount += 1; }, syncAfterStateChange() {}, setStatus() {}, draw() {}, renderStatusPanel() {},
  getEntityById: (id) => dimensionState.entities.find((entity) => entity.id === id), canSelectEntity: () => true,
  deepClone: (value) => JSON.parse(JSON.stringify(value)), getSnapPoint: (point) => ({ ...point }), isLayerVisible: () => true, drawDimensionEntity() {},
};
const dimensionController = registry.get("dimension")(dimensionContext);
dimensionController.handleClick({ x: 0, y: 0 });
assert.equal(dimensionUi.dimensionDraft.step, 1);
dimensionController.handleClick({ x: 10, y: 0 });
assert.equal(dimensionUi.dimensionDraft.step, 2);
dimensionController.handleClick({ x: 10, y: 5 });
assert.equal(dimensionUi.dimensionDraft.mode, "chain");
assert.deepEqual(dimensionUi.dimensionDraft.chainStartPoint, { x: 10, y: 0 });
assert.equal(dimensionUi.dimensionDraft.signedOffset, 5);
dimensionController.handleClick({ x: 20, y: 0 });
assert.equal(dimensionState.entities.length, 2);
assert.equal(dimensionState.entities[1].offsetPoint.y, 5, "chain should preserve the first signed offset");
assert.deepEqual(dimensionUi.dimensionDraft.chainStartPoint, { x: 20, y: 0 });
assert.equal(dimensionUndoCount, 2, "each dimension should have one undo step");

const edited = dimensionState.entities[1];
const originalP2 = { ...edited.p2 };
dimensionController.startEndpointEdit({ entityId: edited.id, endpoint: "p1", point: edited.p1 }, edited.p1);
dimensionController.updateEndpointEdit({ x: 12, y: 0 });
dimensionController.applyEndpointEdit();
assert.deepEqual(edited.p1, { x: 12, y: 0 });
assert.deepEqual(edited.p2, originalP2);
assert.equal(dimensionUi.dimensionEndpointEditDraft, null);
assert.equal(dimensionUndoCount, 3);
const endpointSnapshot = JSON.stringify(edited);
dimensionController.startEndpointEdit({ entityId: edited.id, endpoint: "p1", point: edited.p1 }, edited.p1);
dimensionController.cancelEndpointEdit();
assert.equal(JSON.stringify(edited), endpointSnapshot);
assert.equal(dimensionUndoCount, 3);

const originalP1 = { ...edited.p1 };
const offsetHit = { entityId: edited.id, point: { ...edited.offsetPoint } };
dimensionController.startOffsetEdit(offsetHit);
assert.deepEqual(dimensionUi.dimensionOffsetEditDraft.midpoint, { x: 5, y: 0 });
assert.deepEqual(dimensionUi.dimensionOffsetEditDraft.normal, { x: 0, y: 1 });
dimensionController.updateOffsetEdit({ x: 99, y: 8 });
assert.deepEqual(JSON.parse(JSON.stringify(dimensionUi.dimensionOffsetEditDraft.currentPoint)), { x: 5, y: 8 });
dimensionController.applyOffsetEdit();
assert.deepEqual(edited.offsetPoint, { x: 5, y: 8 });
assert.deepEqual(edited.p1, originalP1);
assert.deepEqual(edited.p2, originalP2);
assert.equal(dimensionUndoCount, 4);
const offsetSnapshot = JSON.stringify(edited);
dimensionController.startOffsetEdit({ entityId: edited.id, point: edited.offsetPoint });
dimensionController.cancelOffsetEdit();
assert.equal(JSON.stringify(edited), offsetSnapshot);
assert.equal(dimensionUndoCount, 4);

const appSource = fs.readFileSync(path.join(rootDir, "docs/app.js"), "utf8");
const endpointRoute = appSource.indexOf("findDimensionEndpointHandleAtPoint(roundWorldPoint(rawWorldPoint))");
const offsetRoute = appSource.indexOf("findDimensionOffsetHandleAtPoint(roundWorldPoint(rawWorldPoint))", endpointRoute);
const selectionRoute = appSource.indexOf('getToolController("selection").handleClick', offsetRoute);
assert.ok(endpointRoute >= 0 && endpointRoute < offsetRoute && offsetRoute < selectionRoute, "Select routing should preserve Dimension endpoint -> offset -> Selection priority");

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
