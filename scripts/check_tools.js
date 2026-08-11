"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const context = vm.createContext({ window: {} });
const toolFiles = [
  "docs/tools/registry.js",
  "docs/tools/modify/align.js",
  "docs/tools/modify/extend.js",
  "docs/tools/modify/offset.js",
  "docs/tools/modify/trim.js",
  "docs/tools/modify/fillet.js",
  "docs/tools/selection/gripEdit.js",
  "docs/tools/selection/rectangleEdit.js",
  "docs/tools/selection/selection.js",
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
assert.throws(() => registry.register("not-a-factory", {}), /factory/);
assert.throws(() => registry.register("align", () => ({})), /already registered/);

const expectedIds = ["align", "extend", "fillet", "grip-edit", "offset", "rectangle-edit", "selection", "trim"];
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
