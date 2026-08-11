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
  "docs/tools/modify/stretch.js",
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

const expectedIds = ["align", "arc", "circle", "copy", "dimension", "explode", "extend", "filled-region", "fillet", "grip-edit", "group", "line", "make-block", "match-properties", "mirror", "move", "offset", "rectangle", "rectangle-edit", "rotate", "selection", "stretch", "text", "trim", "ungroup", "wire"];
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
function readAppFunction(name) {
  const start = appSource.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} should exist in app.js`);
  let depth = 0;
  let opened = false;
  for (let index = start; index < appSource.length; index += 1) {
    if (appSource[index] === "{") { depth += 1; opened = true; }
    if (appSource[index] === "}") depth -= 1;
    if (opened && depth === 0) return appSource.slice(start, index + 1);
  }
  assert.fail(`${name} should have a complete function body`);
}

const snapContext = vm.createContext({
  state: {
    entities: [],
    settings: { snapTolerancePx: 10 },
  },
  isLayerVisible: () => true,
  distanceScreenPx: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  roundWorldPoint: ({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }),
  getLineMidpoint: (entity) => ({ x: (entity.p1.x + entity.p2.x) / 2, y: (entity.p1.y + entity.p2.y) / 2 }),
});
vm.runInContext([
  readAppFunction("getRectSnapPoints"),
  readAppFunction("collectSnapCandidates"),
  readAppFunction("resolveSnapCandidate"),
].join("\n"), snapContext);

const snapRect = { id: "snap-rect", type: "rect", layerId: "layer-1", x: 20, y: 30, width: 40, height: 20 };
const snapLine = { id: "snap-line", type: "line", layerId: "layer-1", p1: { x: 100, y: 100 }, p2: { x: 120, y: 100 } };
snapContext.state.entities = [snapRect, snapLine];
const plainSnapValue = (value) => JSON.parse(JSON.stringify(value));
for (const corner of [{ x: 20, y: 30 }, { x: 60, y: 30 }, { x: 60, y: 50 }, { x: 20, y: 50 }]) {
  const candidate = snapContext.resolveSnapCandidate({ x: corner.x + 0.25, y: corner.y + 0.25 });
  assert.equal(candidate.kind, "endpoint", "Rectangle corners should be endpoint-style shared snap candidates");
  assert.deepEqual(plainSnapValue(candidate.point), corner, "Each Rectangle corner should resolve through shared OSNAP");
}
const rectMidpointCandidate = snapContext.resolveSnapCandidate({ x: 40.2, y: 30.1 });
assert.equal(rectMidpointCandidate.kind, "midpoint", "Rectangle edge midpoint snapping should remain available");
assert.deepEqual(plainSnapValue(rectMidpointCandidate.point), { x: 40, y: 30 });
const lineEndpointCandidate = snapContext.resolveSnapCandidate({ x: 100.2, y: 100.1 });
assert.equal(lineEndpointCandidate.kind, "endpoint", "Line endpoint snapping should remain unchanged");
assert.deepEqual(plainSnapValue(lineEndpointCandidate.point), { x: 100, y: 100 });
const closerCornerCandidate = snapContext.resolveSnapCandidate({ x: 23, y: 30 });
assert.deepEqual(plainSnapValue(closerCornerCandidate.point), { x: 20, y: 30 }, "The closer Rectangle corner should naturally win over its edge midpoint");

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

function createStretchHarness(entities, resolveSnapCandidate = () => null) {
  const state = { entities: JSON.parse(JSON.stringify(entities)), selectedEntityIds: [], groups: [{ id: "group-1", entityIds: entities.map((entity) => entity.id) }] };
  const ui = { activeTool: "stretch", stretchDraft: null };
  let undoCount = 0;
  let constrainedCount = 0;
  const controller = registry.get("stretch")({
    getState: () => state, getUiState: () => ui,
    canSelectEntity: (entity) => entity.visible !== false && entity.locked !== true,
    worldToScreen: ({ x, y }) => ({ x, y }), deepClone: (value) => JSON.parse(JSON.stringify(value)),
    roundToUnit: Math.round, roundWorldPoint: ({ x, y }) => ({ x: Math.round(x), y: Math.round(y) }),
    resolveSnapCandidate, getConstrainedWorldPoint: (point) => { constrainedCount += 1; return point; },
    getQuantizedDeltaPoint: (base, point) => ({ x: Math.round(point.x - base.x) + base.x, y: Math.round(point.y - base.y) + base.y }),
    clampRectCornerRadius: (entity) => { entity.cornerRadius = Math.min(entity.cornerRadius || 0, entity.width / 2, entity.height / 2); },
    pushUndoState: () => { undoCount += 1; }, syncAfterStateChange() {}, setStatus() {}, draw() {}, renderStatusPanel() {},
    drawSelectionWindow() {}, drawStretchPreviewEntities() {}, clickSelectThresholdPx: 3,
  });
  return { state, ui, controller, undoCount: () => undoCount, constrainedCount: () => constrainedCount };
}

const stretchGeometry = createStretchHarness([]).controller;
const plain = (value) => JSON.parse(JSON.stringify(value));
const rect = (left, top, right, bottom) => ({ left, top, right, bottom });
const line = { id: "line-1", type: "line", p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, layerId: "layer-1" };
for (const [captureRect, keys] of [
  [rect(-1, -1, 1, 1), ["p1"]], [rect(9, -1, 11, 1), ["p2"]],
  [rect(-1, -1, 11, 1), ["p1", "p2"]], [rect(3, -1, 7, 1), null],
]) {
  const descriptor = stretchGeometry.createStretchDescriptor(line, captureRect);
  assert.deepEqual(descriptor ? Array.from(descriptor.capturedVertices) : null, keys);
  if (descriptor) assert.equal(Object.isFrozen(descriptor) && Object.isFrozen(descriptor.capturedVertices) && Object.isFrozen(descriptor.originalGeometry), true);
}
assert.equal(stretchGeometry.createStretchDescriptor({ id: "locked", ...line, locked: true }, rect(-1, -1, 11, 1)), null);
for (const type of ["circle", "dimension", "text"]) assert.equal(stretchGeometry.createStretchDescriptor({ id: type, type }, rect(-10, -10, 10, 10)), null);

const lineP1 = stretchGeometry.createStretchDescriptor(line, rect(-1, -1, 1, 1));
assert.deepEqual(plain(stretchGeometry.createStretchProposal(lineP1, { dx: 2, dy: 3 }).entity.p1), { x: 2, y: 3 });
assert.deepEqual(plain(stretchGeometry.createStretchProposal(lineP1, { dx: 2, dy: 3 }).entity.p2), line.p2);
const wire = { id: "wire-1", type: "wire", start: { x: 0, y: 0 }, end: { x: 10, y: 0 }, startRef: "a", endRef: "b", tension: 0.45 };
for (const [captureRect, cleared, preserved] of [[rect(-1, -1, 1, 1), "startRef", "endRef"], [rect(9, -1, 11, 1), "endRef", "startRef"]]) {
  const proposal = stretchGeometry.createStretchProposal(stretchGeometry.createStretchDescriptor(wire, captureRect), { dx: 2, dy: 3 }).entity;
  assert.equal(proposal[cleared], null); assert.equal(proposal[preserved], wire[preserved]); assert.equal(proposal.tension, 0.45);
}
const bothWire = stretchGeometry.createStretchProposal(stretchGeometry.createStretchDescriptor(wire, rect(-1, -1, 11, 1)), { dx: 2, dy: 3 }).entity;
assert.equal(bothWire.startRef, null); assert.equal(bothWire.endRef, null);

const rectangle = { id: "rect-1", type: "rect", x: 0, y: 0, width: 10, height: 10, cornerRadius: 4, fill: true };
const oneCorner = stretchGeometry.createStretchProposal(stretchGeometry.createStretchDescriptor(rectangle, rect(-1, -1, 1, 1)), { dx: 2, dy: 3 });
assert.deepEqual({ x: oneCorner.entity.x, y: oneCorner.entity.y, width: oneCorner.entity.width, height: oneCorner.entity.height }, { x: 2, y: 3, width: 8, height: 7 });
const oneSide = stretchGeometry.createStretchProposal(stretchGeometry.createStretchDescriptor(rectangle, rect(-1, -1, 1, 11)), { dx: 2, dy: 3 });
assert.deepEqual({ x: oneSide.entity.x, y: oneSide.entity.y, width: oneSide.entity.width, height: oneSide.entity.height }, { x: 2, y: 0, width: 8, height: 10 });
const allRect = stretchGeometry.createStretchProposal(stretchGeometry.createStretchDescriptor(rectangle, rect(-1, -1, 11, 11)), { dx: 2, dy: 3 });
assert.deepEqual({ x: allRect.entity.x, y: allRect.entity.y, width: allRect.entity.width, height: allRect.entity.height }, { x: 2, y: 3, width: 10, height: 10 });
assert.equal(stretchGeometry.createStretchProposal(stretchGeometry.createStretchDescriptor(rectangle, rect(-1, -1, 1, 11)), { dx: 10, dy: 0 }).valid, false);
assert.equal(stretchGeometry.createStretchProposal(stretchGeometry.createStretchDescriptor(rectangle, rect(-1, -1, 1, 11)), { dx: 12, dy: 0 }).valid, false);

const region = { id: "region-1", type: "filledRegion", points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], fillPattern: "cross" };
for (const captureRect of [rect(-1, -1, 1, 1), rect(-1, -1, 11, 1), rect(-1, -1, 11, 11)]) {
  const descriptor = stretchGeometry.createStretchDescriptor(region, captureRect);
  const proposal = stretchGeometry.createStretchProposal(descriptor, { dx: 2, dy: 3 }).entity;
  descriptor.capturedVertices.forEach((index) => assert.deepEqual(plain(proposal.points[index]), { x: region.points[index].x + 2, y: region.points[index].y + 3 }));
  assert.equal(proposal.fillPattern, "cross"); assert.equal(proposal.points.length, region.points.length);
}

const crossingHarness = createStretchHarness([line]);
crossingHarness.controller.activate();
crossingHarness.controller.handlePrimaryAction({ x: 20, y: 1 }, { x: 20, y: 1 }, {}, { x: 20, y: 1 });
crossingHarness.controller.finishCrossingWindow({ x: -5, y: -1 }, { x: -5, y: -1 });
assert.equal(crossingHarness.ui.stretchDraft.phase, "base");
assert.equal(crossingHarness.ui.stretchDraft.descriptors.length, 1, "a long, thin right-to-left window should capture an endpoint");
const stableDescriptor = crossingHarness.ui.stretchDraft.descriptors[0];
crossingHarness.controller.handlePointerMove({ x: 100, y: 100 }, { shiftKey: false }, { x: 100, y: 100 });
assert.equal(crossingHarness.ui.stretchDraft.descriptors[0], stableDescriptor, "pointer movement must preserve captured descriptors");

const baseSnapInputs = [];
const snappedBaseHarness = createStretchHarness([line], (point) => {
  baseSnapInputs.push(point);
  return point.x === 10 && point.y === 0 ? { point: { x: 10, y: 0 } } : null;
});
snappedBaseHarness.controller.activate();
snappedBaseHarness.controller.handlePrimaryAction({ x: 20, y: 1 }, { x: 20, y: 1 }, {}, { x: 20, y: 1 });
snappedBaseHarness.controller.finishCrossingWindow({ x: -5, y: -1 }, { x: -5, y: -1 });
snappedBaseHarness.controller.handlePrimaryAction({ x: 9.6, y: 0.2 }, { x: 10, y: 0 }, {}, { x: 9.6, y: 0.2 });
assert.deepEqual(baseSnapInputs, [{ x: 10, y: 0 }], "Stretch base phase should use the snap-aware point supplied by the app shell");
assert.deepEqual(plain(snappedBaseHarness.ui.stretchDraft.basePoint), { x: 10, y: 0 }, "Stretch should store the snapped base point");

const rectCornerBaseHarness = createStretchHarness([snapRect], (point) => snapContext.resolveSnapCandidate(point));
rectCornerBaseHarness.controller.activate();
rectCornerBaseHarness.controller.handlePrimaryAction({ x: 65, y: 55 }, { x: 65, y: 55 }, {}, { x: 65, y: 55 });
rectCornerBaseHarness.controller.finishCrossingWindow({ x: 15, y: 25 }, { x: 15, y: 25 });
rectCornerBaseHarness.controller.handlePrimaryAction({ x: 20.25, y: 30.25 }, { x: 20.25, y: 30.25 }, {}, { x: 20.25, y: 30.25 });
assert.deepEqual(plain(rectCornerBaseHarness.ui.stretchDraft.basePoint), { x: 20, y: 30 }, "Stretch base phase should accept a Rectangle corner from shared OSNAP");

const rawBaseHarness = createStretchHarness([line]);
rawBaseHarness.controller.activate();
rawBaseHarness.controller.handlePrimaryAction({ x: 20, y: 1 }, { x: 20, y: 1 }, {}, { x: 20, y: 1 });
rawBaseHarness.controller.finishCrossingWindow({ x: -5, y: -1 }, { x: -5, y: -1 });
rawBaseHarness.controller.handlePrimaryAction({ x: 4.4, y: 6.6 }, { x: 4.4, y: 6.6 }, {}, { x: 4.4, y: 6.6 });
assert.deepEqual(plain(rawBaseHarness.ui.stretchDraft.basePoint), { x: 4, y: 7 }, "Stretch base phase should retain rounded raw fallback when no snap exists");

const rejectedHarness = createStretchHarness([line]);
rejectedHarness.controller.activate();
rejectedHarness.controller.handlePrimaryAction({ x: -5, y: -5 }, { x: -5, y: -5 }, {}, { x: -5, y: -5 });
rejectedHarness.controller.finishCrossingWindow({ x: 20, y: 5 }, { x: 20, y: 5 });
assert.equal(rejectedHarness.ui.stretchDraft.phase, "window"); assert.equal(rejectedHarness.ui.stretchDraft.descriptors.length, 0); assert.equal(rejectedHarness.undoCount(), 0);

const commitHarness = createStretchHarness([line]);
commitHarness.controller.activate(); commitHarness.controller.handlePrimaryAction({ x: 5, y: 5 }, { x: 5, y: 5 }, {}, { x: 5, y: 5 });
commitHarness.controller.finishCrossingWindow({ x: -5, y: -5 }, { x: -5, y: -5 });
commitHarness.controller.handlePrimaryAction({ x: 0, y: 0 }, { x: 0, y: 0 }, {}, { x: 0, y: 0 });
const previewProposal = commitHarness.controller.createStretchProposal(commitHarness.ui.stretchDraft.descriptors[0], { dx: 2, dy: 3 }).entity;
commitHarness.controller.handlePrimaryAction({ x: 2, y: 3 }, { x: 2, y: 3 }, { shiftKey: true }, { x: 2, y: 3 });
assert.deepEqual(commitHarness.state.entities[0], previewProposal); assert.equal(commitHarness.undoCount(), 1); assert.deepEqual(commitHarness.state.groups[0].entityIds, ["line-1"]);
assert.ok(commitHarness.constrainedCount() > 0, "Stretch destination resolution should use injected getConstrainedWorldPoint");

const atomicHarness = createStretchHarness([line, rectangle]);
atomicHarness.controller.activate(); atomicHarness.controller.handlePrimaryAction({ x: 5, y: 11 }, { x: 5, y: 11 }, {}, { x: 5, y: 11 });
atomicHarness.controller.finishCrossingWindow({ x: -1, y: -1 }, { x: -1, y: -1 });
atomicHarness.controller.handlePrimaryAction({ x: 0, y: 0 }, { x: 0, y: 0 }, {}, { x: 0, y: 0 });
atomicHarness.controller.handlePrimaryAction({ x: 10, y: 0 }, { x: 10, y: 0 }, { shiftKey: false }, { x: 10, y: 0 });
assert.deepEqual(atomicHarness.state.entities[0], line); assert.equal(atomicHarness.undoCount(), 0); assert.equal(atomicHarness.ui.stretchDraft.phase, "destination");
atomicHarness.controller.handlePrimaryAction({ x: 0, y: 0 }, { x: 0, y: 0 }, { shiftKey: false }, { x: 0, y: 0 });
assert.equal(atomicHarness.undoCount(), 0, "zero offset must not create undo");
atomicHarness.controller.cancel(); assert.equal(atomicHarness.undoCount(), 0, "Escape/cancel must not create undo");

const indexSource = fs.readFileSync(path.join(rootDir, "docs/index.html"), "utf8");
assert.ok(indexSource.indexOf('tools/modify/stretch.js') < indexSource.indexOf('app.js'), "Stretch module should load before app.js");
assert.ok(appSource.includes('getToolController("stretch").handlePrimaryAction'), "app.js should route Stretch through its controller");
const stretchSource = fs.readFileSync(path.join(rootDir, "docs/tools/modify/stretch.js"), "utf8");
assert.equal(stretchSource.includes("selectEntitiesByWindow"), false); assert.equal(stretchSource.includes("expandSelectionWithGroups"), false);
const constrainedStart = appSource.indexOf("function getConstrainedWorldPoint");
const constrainedEnd = appSource.indexOf("\n}", constrainedStart) + 2;
const constrainedBody = appSource.slice(constrainedStart, constrainedEnd);
assert.match(constrainedBody, /stretchDraft\?\.phase === "destination"[\s\S]*stretchDraft\.basePoint[\s\S]*applyOrthoConstraint/,
  "getConstrainedWorldPoint should apply shared Ortho to the Stretch destination phase");
const progressStart = appSource.indexOf("function isCommandInProgress");
const progressEnd = appSource.indexOf("\n}", progressStart) + 2;
assert.ok(appSource.slice(progressStart, progressEnd).includes("uiState.stretchDraft"), "Stretch should guard Space repeat while in progress");
const repeatSetStart = appSource.indexOf("const MODIFY_REPEAT_TOOL_IDS");
const repeatSetEnd = appSource.indexOf("]);", repeatSetStart) + 3;
assert.equal(appSource.slice(repeatSetStart, repeatSetEnd).includes('"stretch"'), false, "Stretch v1 should not become a repeatable command");

console.log("Tool registry and controller checks passed.");
