"use strict";

const STORAGE_KEY = "draftlite.autosave.v1";
const FILE_VERSION = 1;
const MM_PER_UNIT = 0.5;
const GRID_MAJOR_UNIT = 2000;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 50;
const DOUBLE_CLICK_MS = 320;
const CLICK_SELECT_THRESHOLD_PX = 4;
const THEME_STORAGE_KEY = "draftlite.theme";

const canvas = document.getElementById("draftCanvas");
const viewport = document.getElementById("canvasViewport");
const layerList = document.getElementById("layerList");
const propertiesPanel = document.getElementById("propertiesPanel");
const statusPanel = document.getElementById("statusPanel");
const toolReadout = document.getElementById("toolReadout");
const pointerReadout = document.getElementById("pointerReadout");
const zoomReadout = document.getElementById("zoomReadout");
const statusReadout = document.getElementById("statusReadout");
const loadJsonInput = document.getElementById("loadJsonInput");

const toolButtons = {
  select: document.getElementById("toolSelectButton"),
  line: document.getElementById("toolLineButton"),
  rectangle: document.getElementById("rectangleButton"),
  move: document.getElementById("moveButton"),
  copy: document.getElementById("copyButton"),
  align: document.getElementById("alignButton"),
  fillet: document.getElementById("filletButton"),
};

const deleteButton = document.getElementById("deleteButton");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const fitAllButton = document.getElementById("fitAllButton");
const saveJsonButton = document.getElementById("saveJsonButton");
const loadJsonButton = document.getElementById("loadJsonButton");
const exportDxfButton = document.getElementById("exportDxfButton");
const explodeButton = document.getElementById("explodeButton");
const addLayerButton = document.getElementById("addLayerButton");
const themeToggleButton = document.getElementById("themeToggleButton");

const ctx = canvas.getContext("2d");

let state = createInitialState();
let history = {
  undoStack: [],
  redoStack: [],
};

const uiState = {
  activeTool: "select",
  lineDraft: null,
  rectangleDraft: null,
  transformDraft: null,
  selectDragDraft: null,
  gripEditDraft: null,
  alignDraft: null,
  filletDraft: null,
  selectionWindow: null,
  snapMarker: null,
  isShiftPressed: false,
  linePreviewTimer: null,
  gripPreviewTimer: null,
  transformPreviewTimer: null,
  hoverWorld: { x: 0, y: 0 },
  pointerWorld: { x: 0, y: 0 },
  panning: false,
  panStartScreen: { x: 0, y: 0 },
  panStartView: { panX: 0, panY: 0 },
  lastMiddleClickTime: 0,
  canvasRect: canvas.getBoundingClientRect(),
  dpr: window.devicePixelRatio || 1,
};

function createInitialState() {
  return {
    version: FILE_VERSION,
    entities: [],
    layers: [
      {
        id: "layer-1",
        name: "Layer 1",
        color: "#2e3135",
        visible: true,
        locked: false,
      },
    ],
    activeLayerId: "layer-1",
    selectedEntityIds: [],
    view: {
      zoom: 0.12,
      panX: 0,
      panY: 0,
    },
    settings: {
      unitName: "mm",
      unitsPerMm: 2,
      gridUnit: 1,
      snapTolerancePx: 10,
      showGrid: true,
      ortho: true,
    },
    nextEntityNumber: 1,
    nextLayerNumber: 2,
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshotState() {
  return deepClone(state);
}

function pushUndoState() {
  history.undoStack.push(snapshotState());
  if (history.undoStack.length > 200) {
    history.undoStack.shift();
  }
  history.redoStack = [];
  syncUndoRedoButtons();
}

function undo() {
  if (!history.undoStack.length) {
    setStatus("Nothing to undo.");
    return;
  }
  history.redoStack.push(snapshotState());
  state = normalizeDocument(history.undoStack.pop());
  clearTransientState();
  syncAfterStateChange(false);
  setStatus("Undo applied.");
}

function redo() {
  if (!history.redoStack.length) {
    setStatus("Nothing to redo.");
    return;
  }
  history.undoStack.push(snapshotState());
  state = normalizeDocument(history.redoStack.pop());
  clearTransientState();
  syncAfterStateChange(false);
  setStatus("Redo applied.");
}

function clearTransientState() {
  if (uiState.filletDraft || uiState.alignDraft) {
    state.selectedEntityIds = [];
  }
  uiState.lineDraft = null;
  uiState.rectangleDraft = null;
  uiState.transformDraft = null;
  uiState.selectDragDraft = null;
  uiState.gripEditDraft = null;
  uiState.alignDraft = null;
  uiState.filletDraft = null;
  uiState.selectionWindow = null;
  uiState.snapMarker = null;
  clearLinePreviewTimer();
  clearGripPreviewTimer();
  clearTransformPreviewTimer();
}

function createEntityId() {
  const id = `ent-${state.nextEntityNumber}`;
  state.nextEntityNumber += 1;
  return id;
}

function createLayerId() {
  const id = `layer-${state.nextLayerNumber}`;
  state.nextLayerNumber += 1;
  return id;
}

function unitsToMm(unit) {
  return unit * MM_PER_UNIT;
}

function mmToUnits(mm) {
  return Math.round(mm / MM_PER_UNIT);
}

function roundToGridUnit(value) {
  const gridUnit = Math.max(1, Number(state.settings.gridUnit) || 1);
  return Math.round(value / gridUnit) * gridUnit;
}

function roundWorldPoint(point) {
  return {
    x: roundToGridUnit(point.x),
    y: roundToGridUnit(point.y),
  };
}

function worldToScreen(point) {
  return {
    x: point.x * state.view.zoom + state.view.panX,
    y: point.y * state.view.zoom + state.view.panY,
  };
}

function screenToWorld(point) {
  return {
    x: (point.x - state.view.panX) / state.view.zoom,
    y: (point.y - state.view.panY) / state.view.zoom,
  };
}

function distanceScreenPx(a, b) {
  const screenA = worldToScreen(a);
  const screenB = worldToScreen(b);
  return Math.hypot(screenA.x - screenB.x, screenA.y - screenB.y);
}

function getLineMidpoint(entity) {
  return roundWorldPoint({
    x: (entity.p1.x + entity.p2.x) / 2,
    y: (entity.p1.y + entity.p2.y) / 2,
  });
}

function getRectBoxFromPoints(startPoint, oppositePoint, options = {}) {
  const snap = options.snap !== false;
  const start = snap ? getSnapPoint(startPoint) : roundWorldPoint(startPoint);
  const end = snap ? getSnapPoint(oppositePoint) : roundWorldPoint(oppositePoint);
  const minX = Math.min(start.x, end.x);
  const minY = Math.min(start.y, end.y);
  const width = Math.abs(end.x - start.x);
  const height = Math.abs(end.y - start.y);
  if (width <= 0 || height <= 0) return null;
  return { x: minX, y: minY, width, height };
}

function getRectSnapPoints(entity) {
  const { x, y, width, height } = entity;
  return [
    { kind: "endpoint", point: { x, y } },
    { kind: "endpoint", point: { x: x + width, y } },
    { kind: "endpoint", point: { x: x + width, y: y + height } },
    { kind: "endpoint", point: { x, y: y + height } },
    { kind: "midpoint", point: { x: x + width / 2, y } },
    { kind: "midpoint", point: { x: x + width, y: y + height / 2 } },
    { kind: "midpoint", point: { x: x + width / 2, y: y + height } },
    { kind: "midpoint", point: { x, y: y + height / 2 } },
    { kind: "center", point: { x: x + width / 2, y: y + height / 2 } },
  ].map((c) => ({ ...c, point: roundWorldPoint(c.point) }));
}

function collectSnapCandidates(worldPoint) {
  return state.entities
    .filter((entity) => isLayerVisible(entity.layerId))
    .flatMap((entity) => {
      if (entity.type === "line") {
        const midpoint = getLineMidpoint(entity);
        return [
          { kind: "endpoint", point: entity.p1, distancePx: distanceScreenPx(worldPoint, entity.p1) },
          { kind: "endpoint", point: entity.p2, distancePx: distanceScreenPx(worldPoint, entity.p2) },
          { kind: "midpoint", point: midpoint, distancePx: distanceScreenPx(worldPoint, midpoint) },
        ];
      }
      if (entity.type === "rect") {
        return getRectSnapPoints(entity).map((c) => ({ ...c, distancePx: distanceScreenPx(worldPoint, c.point) }));
      }
      return [];
    });
}

function getSnapPoint(worldPoint) {
  const candidates = collectSnapCandidates(worldPoint);
  const closestCandidate = candidates.reduce((best, candidate) => {
    if (candidate.distancePx > state.settings.snapTolerancePx) {
      return best;
    }
    if (!best || candidate.distancePx < best.distancePx) {
      return candidate;
    }
    return best;
  }, null);

  if (closestCandidate) {
    uiState.snapMarker = {
      kind: closestCandidate.kind,
      point: closestCandidate.point,
    };
    return closestCandidate.point;
  }

  uiState.snapMarker = null;
  return roundWorldPoint(worldPoint);
}

function applyOrthoConstraint(startPoint, worldPoint, orthoEnabled) {
  if (!orthoEnabled || !startPoint) {
    return worldPoint;
  }

  const dx = worldPoint.x - startPoint.x;
  const dy = worldPoint.y - startPoint.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: worldPoint.x,
      y: startPoint.y,
    };
  }

  return {
    x: startPoint.x,
    y: worldPoint.y,
  };
}

function resolveConstrainedSnapPoint(worldPoint, shiftKey) {
  let constrainedWorld = worldPoint;
  const orthoEnabled = !shiftKey;

  if (uiState.lineDraft) {
    constrainedWorld = applyOrthoConstraint(uiState.lineDraft.start, constrainedWorld, orthoEnabled);
  } else if (uiState.transformDraft) {
    constrainedWorld = applyOrthoConstraint(uiState.transformDraft.startPoint, constrainedWorld, orthoEnabled);
  } else if (uiState.gripEditDraft) {
    constrainedWorld = applyOrthoConstraint(uiState.gripEditDraft.fixedPoint, constrainedWorld, orthoEnabled);
  }

  return getSnapPoint(constrainedWorld);
}

function resolveFreeDragPoint(worldPoint) {
  return roundWorldPoint(worldPoint);
}

function refreshPointerConstraint(shiftKey) {
  if (!uiState.lineDraft && !uiState.transformDraft && !uiState.gripEditDraft) {
    return;
  }

  const snappedWorld = resolveConstrainedSnapPoint(uiState.pointerWorld, shiftKey);
  uiState.hoverWorld = snappedWorld;
  if (uiState.transformDraft) {
    uiState.transformDraft.currentPoint = snappedWorld;
  }
  if (uiState.gripEditDraft) {
    uiState.gripEditDraft.currentPoint = snappedWorld;
  }
  pointerReadout.textContent = `X: ${unitsToMm(snappedWorld.x)} mm, Y: ${unitsToMm(snappedWorld.y)} mm`;
  draw();
  renderStatusPanel();
}

function setStatus(message) {
  statusReadout.textContent = message;
}

function updateLineDraftStatus(prefix) {
  if (!uiState.lineDraft) {
    return;
  }

  const inputSuffix = uiState.lineDraft.numericInputBuffer
    ? ` Length: ${uiState.lineDraft.numericInputBuffer} mm`
    : " Length: -";
  setStatus(`${prefix}${inputSuffix}`);
  renderStatusPanel();
}

function updateTransformDraftStatus(prefix) {
  if (!uiState.transformDraft) {
    return;
  }

  const inputSuffix = uiState.transformDraft.numericInputBuffer
    ? ` Distance: ${uiState.transformDraft.numericInputBuffer} mm`
    : " Distance: -";
  setStatus(`${prefix}${inputSuffix}`);
  renderStatusPanel();
}

function updateSelectDragStatus(prefix) {
  if (!uiState.selectDragDraft) {
    return;
  }

  const offset = getTransformOffset(uiState.selectDragDraft);
  setStatus(
    `${prefix} Offset: ${unitsToMm(offset.dx)} mm, ${unitsToMm(offset.dy)} mm`
  );
  renderStatusPanel();
}

function clearTransformPreviewTimer() {
  if (uiState.transformPreviewTimer) {
    window.clearTimeout(uiState.transformPreviewTimer);
    uiState.transformPreviewTimer = null;
  }
}

function clearLinePreviewTimer() {
  if (uiState.linePreviewTimer) {
    window.clearTimeout(uiState.linePreviewTimer);
    uiState.linePreviewTimer = null;
  }
}

function clearGripPreviewTimer() {
  if (uiState.gripPreviewTimer) {
    window.clearTimeout(uiState.gripPreviewTimer);
    uiState.gripPreviewTimer = null;
  }
}

function beginLineDraft(startPoint, prefix = `Line start set at ${formatWorldPoint(startPoint)}.`) {
  clearLinePreviewTimer();
  uiState.lineDraft = {
    start: startPoint,
    numericInputBuffer: "",
    previewPoint: null,
  };
  updateLineDraftStatus(prefix);
  draw();
  renderStatusPanel();
}

function endLineDraft(message = "Line command ended.") {
  clearLinePreviewTimer();
  uiState.lineDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange(false);
  setStatus(message);
}

function beginRectangleDraft(startPoint) {
  uiState.rectangleDraft = {
    start: startPoint,
  };
  draw();
  renderStatusPanel();
  setStatus(`Rectangle first corner set at ${formatWorldPoint(startPoint)}. Pick opposite corner.`);
}

function endRectangleDraft(message = "Rectangle command ended.") {
  uiState.rectangleDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange(false);
  setStatus(message);
}

function endTransformDraft(message = `${capitalize(uiState.activeTool)} command ended.`) {
  clearTransformPreviewTimer();
  uiState.transformDraft = null;
  state.selectedEntityIds = [];
  uiState.activeTool = "select";
  syncAfterStateChange(false);
  setStatus(message);
}

function cancelSelectDrag(message = "Drag move cancelled.") {
  uiState.selectDragDraft = null;
  draw();
  renderStatusPanel();
  setStatus(message);
}

function updateGripEditStatus(prefix) {
  if (!uiState.gripEditDraft) {
    return;
  }

  const inputSuffix = uiState.gripEditDraft.numericInputBuffer
    ? ` Length: ${uiState.gripEditDraft.numericInputBuffer} mm`
    : " Length: -";
  setStatus(`${prefix}${inputSuffix}`);
  renderStatusPanel();
}

function cancelGripEdit(message = "Grip edit cancelled.") {
  clearGripPreviewTimer();
  uiState.gripEditDraft = null;
  draw();
  renderStatusPanel();
  setStatus(message);
}

function cancelFillet(message = "Fillet cancelled.") {
  state.selectedEntityIds = [];
  uiState.filletDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange();
  setStatus(message);
}

function cancelAlign(message = "Align cancelled.") {
  state.selectedEntityIds = [];
  uiState.alignDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange();
  setStatus(message);
}

function cancelRectangle(message = "Rectangle cancelled.") {
  uiState.rectangleDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange(false);
  setStatus(message);
}

function getSelectionRect(selectionWindow) {
  return {
    left: Math.min(selectionWindow.startScreen.x, selectionWindow.currentScreen.x),
    right: Math.max(selectionWindow.startScreen.x, selectionWindow.currentScreen.x),
    top: Math.min(selectionWindow.startScreen.y, selectionWindow.currentScreen.y),
    bottom: Math.max(selectionWindow.startScreen.y, selectionWindow.currentScreen.y),
    width: Math.abs(selectionWindow.currentScreen.x - selectionWindow.startScreen.x),
    height: Math.abs(selectionWindow.currentScreen.y - selectionWindow.startScreen.y),
    isCrossing: selectionWindow.currentScreen.x < selectionWindow.startScreen.x,
  };
}

function getLayerById(layerId) {
  return state.layers.find((layer) => layer.id === layerId) || null;
}

function isLayerDrawable(layerId) {
  const layer = getLayerById(layerId);
  return Boolean(layer && layer.visible && !layer.locked);
}

function isLayerVisible(layerId) {
  const layer = getLayerById(layerId);
  return Boolean(layer && layer.visible);
}

function canSelectEntity(entity) {
  const layer = getLayerById(entity.layerId);
  return Boolean(layer && layer.visible && !layer.locked);
}

function normalizeLayer(layer, index) {
  const fallbackId = `layer-${index + 1}`;
  return {
    id: typeof layer.id === "string" ? layer.id : fallbackId,
    name: typeof layer.name === "string" && layer.name.trim() ? layer.name.trim() : `Layer ${index + 1}`,
    color: typeof layer.color === "string" && layer.color ? layer.color : "#2e3135",
    visible: layer.visible !== false,
    locked: Boolean(layer.locked),
  };
}

function normalizeEntity(entity) {
  if (!entity || !entity.type) {
    return null;
  }
  if (entity.type === "line") {
    const p1 = entity.p1 || {};
    const p2 = entity.p2 || {};
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "line",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      p1: {
        x: roundToGridUnit(Number(p1.x) || 0),
        y: roundToGridUnit(Number(p1.y) || 0),
      },
      p2: {
        x: roundToGridUnit(Number(p2.x) || 0),
        y: roundToGridUnit(Number(p2.y) || 0),
      },
    };
  }
  if (entity.type === "rect") {
    const x = roundToGridUnit(Number(entity.x) || 0);
    const y = roundToGridUnit(Number(entity.y) || 0);
    const width = roundToGridUnit(Number(entity.width) || 0);
    const height = roundToGridUnit(Number(entity.height) || 0);
    if (width <= 0 || height <= 0) {
      return null;
    }
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "rect",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      x,
      y,
      width,
      height,
      rotation: 0,
      name: typeof entity.name === "string" ? entity.name : "Box",
      fill: entity.fill !== false,
      fillColor: normalizeColor(entity.fillColor || ""),
    };
  }
  return null;
}

function normalizeDocument(raw) {
  const source = raw && raw.state ? raw.state : raw;
  const base = createInitialState();
  const normalizedLayers = Array.isArray(source && source.layers)
    ? source.layers.map(normalizeLayer)
    : base.layers;

  const layerIds = new Set(normalizedLayers.map((layer) => layer.id));
  const normalizedEntities = Array.isArray(source && source.entities)
    ? source.entities
        .map(normalizeEntity)
        .filter(Boolean)
        .map((entity, index) => ({
          ...entity,
          id: entity.id || `ent-${index + 1}`,
          layerId: layerIds.has(entity.layerId) ? entity.layerId : normalizedLayers[0].id,
        }))
    : [];

  const selectedEntityIds = Array.isArray(source && source.selectedEntityIds)
    ? source.selectedEntityIds.filter((id) => normalizedEntities.some((entity) => entity.id === id))
    : [];

  const activeLayerId = layerIds.has(source && source.activeLayerId)
    ? source.activeLayerId
    : normalizedLayers[0].id;

  const maxEntityNumber = normalizedEntities.reduce((max, entity) => {
    const match = /ent-(\d+)/.exec(entity.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const maxLayerNumber = normalizedLayers.reduce((max, layer) => {
    const match = /layer-(\d+)/.exec(layer.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  return {
    version: FILE_VERSION,
    entities: normalizedEntities,
    layers: normalizedLayers.length ? normalizedLayers : base.layers,
    activeLayerId,
    selectedEntityIds,
    view: {
      zoom: clampNumber(source && source.view && source.view.zoom, MIN_ZOOM, MAX_ZOOM, base.view.zoom),
      panX: Number(source && source.view && source.view.panX) || base.view.panX,
      panY: Number(source && source.view && source.view.panY) || base.view.panY,
    },
    settings: {
      unitName: "mm",
      unitsPerMm: 2,
      gridUnit: Math.max(1, Math.round(Number(source && source.settings && source.settings.gridUnit) || base.settings.gridUnit)),
      snapTolerancePx: Math.max(1, Number(source && source.settings && source.settings.snapTolerancePx) || base.settings.snapTolerancePx),
      showGrid: source && source.settings ? source.settings.showGrid !== false : base.settings.showGrid,
      ortho: source && source.settings && typeof source.settings.ortho === "boolean" ? source.settings.ortho : base.settings.ortho,
    },
    nextEntityNumber: Math.max(maxEntityNumber + 1, Number(source && source.nextEntityNumber) || 1),
    nextLayerNumber: Math.max(maxLayerNumber + 1, Number(source && source.nextLayerNumber) || 2),
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, number));
}

function saveToLocalStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshotState()));
  } catch (error) {
    console.warn("Autosave failed.", error);
  }
}

function restoreFromLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }
    state = normalizeDocument(JSON.parse(raw));
    return true;
  } catch (error) {
    console.warn("Autosave restore failed.", error);
    return false;
  }
}

function syncUndoRedoButtons() {
  undoButton.disabled = history.undoStack.length === 0;
  redoButton.disabled = history.redoStack.length === 0;
}

function applyTheme(theme) {
  const nextTheme = theme === "dark" ? "dark" : "light";
  document.body.dataset.theme = nextTheme;
  if (themeToggleButton) {
    themeToggleButton.textContent = nextTheme === "dark" ? "Light" : "Dark";
  }
}

function getStoredTheme() {
  try {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "dark" || storedTheme === "light" ? storedTheme : "light";
  } catch (error) {
    console.warn("Theme restore failed.", error);
    return "light";
  }
}

function initializeTheme() {
  applyTheme(getStoredTheme());
}

function toggleTheme() {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch (error) {
    console.warn("Theme save failed.", error);
  }
  draw();
}

function syncToolButtons() {
  document.body.dataset.tool = uiState.activeTool;
  Object.entries(toolButtons).forEach(([tool, button]) => {
    button.classList.toggle("is-active", tool === uiState.activeTool);
  });
  toolReadout.textContent = `Tool: ${capitalize(uiState.activeTool)}`;
}

function syncAfterStateChange(autosave = true) {
  ensureActiveLayer();
  resizeCanvas();
  draw();
  renderLayersPanel();
  renderPropertiesPanel();
  renderStatusPanel();
  syncUndoRedoButtons();
  syncToolButtons();
  if (autosave) {
    saveToLocalStorage();
  }
}

function ensureActiveLayer() {
  if (!getLayerById(state.activeLayerId) && state.layers.length) {
    state.activeLayerId = state.layers[0].id;
  }
}

function renderLayersPanel() {
  layerList.innerHTML = "";
  const header = document.createElement("div");
  header.className = "layer-table-header";
  ["Active", "Name", "Visible", "Lock", "Color"].forEach((t) => { const c = document.createElement("div"); c.textContent = t; header.appendChild(c); });
  layerList.appendChild(header);
  state.layers.forEach((layer) => {
    const row = document.createElement("div");
    row.className = `layer-row${layer.id === state.activeLayerId ? " is-active" : ""}`;
    const activeRadio = document.createElement("input"); activeRadio.type = "radio"; activeRadio.name = "activeLayer"; activeRadio.checked = layer.id === state.activeLayerId;
    activeRadio.addEventListener("change", () => { state.activeLayerId = layer.id; syncAfterStateChange(); setStatus(`${layer.name} is active.`); });
    const nameWrap = document.createElement("div"); nameWrap.className = "layer-name";
    const nameInput = document.createElement("input"); nameInput.type = "text"; nameInput.value = layer.name;
    nameInput.addEventListener("change", () => { const nextName = nameInput.value.trim() || layer.name; if (nextName === layer.name) return; pushUndoState(); layer.name = nextName; syncAfterStateChange(); setStatus(`Renamed ${nextName}.`); });
    nameWrap.appendChild(nameInput);
    const visibleInput = document.createElement("input"); visibleInput.type = "checkbox"; visibleInput.checked = layer.visible;
    visibleInput.addEventListener("change", () => { pushUndoState(); layer.visible = visibleInput.checked; syncAfterStateChange(); setStatus(`${layer.name} ${layer.visible ? "shown" : "hidden"}.`); });
    const lockInput = document.createElement("input"); lockInput.type = "checkbox"; lockInput.checked = layer.locked;
    lockInput.addEventListener("change", () => { pushUndoState(); layer.locked = lockInput.checked; syncAfterStateChange(); setStatus(`${layer.name} ${layer.locked ? "locked" : "unlocked"}.`); });
    const colorWrap = document.createElement("div"); colorWrap.className = "layer-color";
    const colorInput = document.createElement("input"); colorInput.type = "color"; colorInput.value = normalizeColor(layer.color);
    colorInput.addEventListener("change", () => { pushUndoState(); layer.color = colorInput.value; syncAfterStateChange(); setStatus(`${layer.name} color updated.`); });
    colorWrap.appendChild(colorInput);
    row.append(activeRadio, nameWrap, visibleInput, lockInput, colorWrap);
    layerList.appendChild(row);
  });
}

function normalizeColor(color) {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }
  return "#2e3135";
}

function renderPropertiesPanel() {
  propertiesPanel.innerHTML = "";

  const appendSection = (title) => {
    const section = document.createElement("section");
    section.className = "prop-section";
    const heading = document.createElement("h4");
    heading.className = "prop-section-title";
    heading.textContent = title;
    const grid = document.createElement("div");
    grid.className = "prop-grid";
    section.append(heading, grid);
    propertiesPanel.appendChild(section);
    return grid;
  };

  const addPropertyRow = (grid, labelText, valueElement) => {
    const label = document.createElement("label");
    label.className = "prop-label";
    label.textContent = labelText;
    const value = document.createElement("div");
    value.className = "prop-value";
    value.appendChild(valueElement);
    grid.append(label, value);
  };

  const createLayerSelect = (entity, statusLabel) => {
    const layerSelect = document.createElement("select");
    state.layers.forEach((layer) => {
      const option = document.createElement("option");
      option.value = layer.id;
      option.textContent = layer.name;
      option.selected = layer.id === entity.layerId;
      layerSelect.appendChild(option);
    });
    layerSelect.addEventListener("change", () => {
      pushUndoState();
      entity.layerId = layerSelect.value;
      syncAfterStateChange();
      setStatus(statusLabel);
    });
    return layerSelect;
  };

  const createReadOnlyText = (value) => {
    const text = document.createElement("span");
    text.className = "prop-static";
    text.textContent = value;
    return text;
  };

  if (!state.selectedEntityIds.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    empty.textContent = "No entity selected.";
    propertiesPanel.appendChild(empty);
    return;
  }

  const selectedEntities = state.selectedEntityIds
    .map(getEntityById)
    .filter(Boolean);

  if (!selectedEntities.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    empty.textContent = "Selection is empty.";
    propertiesPanel.appendChild(empty);
    return;
  }

  if (selectedEntities.length > 1) {
    const multiple = document.createElement("p");
    multiple.className = "panel-empty";
    multiple.textContent = `Multiple entities selected. (${selectedEntities.length})`;
    propertiesPanel.appendChild(multiple);
    return;
  }

  const entity = selectedEntities[0];
  if (entity.type === "rect") {
    const generalGrid = appendSection("General");
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = String(entity.name || "Box");
    nameInput.addEventListener("change", () => {
      pushUndoState();
      entity.name = nameInput.value || "Box";
      syncAfterStateChange();
    });
    addPropertyRow(generalGrid, "Type", createReadOnlyText("Rectangle"));
    addPropertyRow(generalGrid, "Name", nameInput);
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "Rectangle layer updated."));

    const geometryGrid = appendSection("Geometry");
    const fields = [
            ["Width mm", "width"],
      ["Height mm", "height"],
      ["Rotation", "rotation"],
    ];
    fields.forEach(([label, key]) => {
      const input = document.createElement("input");
      input.type = "number";
      input.value = key === "rotation" ? String(entity.rotation || 0) : String(unitsToMm(entity[key]));
      if (key === "rotation") {
        input.disabled = true;
      }
      input.addEventListener("change", () => {
        if (key === "rotation") return;
        const numericValue = Number(input.value);
        if (!Number.isFinite(numericValue)) {
          input.value = key === "rotation" ? String(entity.rotation || 0) : String(unitsToMm(entity[key]));
          setStatus(`${label} must be a valid number.`);
          return;
        }
        if (key === "width" || key === "height") {
          const nextUnits = mmToUnits(numericValue);
          if (nextUnits <= 0) {
            input.value = String(unitsToMm(entity[key]));
            setStatus(`${label} must be greater than zero.`);
            return;
          }
          pushUndoState();
          entity[key] = nextUnits;
          syncAfterStateChange();
          return;
        }
        pushUndoState();
        entity[key] = mmToUnits(numericValue);
        syncAfterStateChange();
      });
      addPropertyRow(geometryGrid, label, input);
    });

    const appearanceGrid = appendSection("Appearance");
    const fillColor = document.createElement("input");
    fillColor.type = "color";
    fillColor.value = normalizeColor(entity.fillColor || getLayerById(entity.layerId)?.color);
    fillColor.addEventListener("change", () => { pushUndoState(); entity.fillColor = fillColor.value; syncAfterStateChange(); });
    const fill = document.createElement("input");
    fill.type = "checkbox";
    fill.checked = entity.fill !== false;
    fill.addEventListener("change", () => {
      pushUndoState();
      entity.fill = fill.checked;
      syncAfterStateChange();
    });
    addPropertyRow(appearanceGrid, "Fill", fill);
    addPropertyRow(appearanceGrid, "Fill Color", fillColor);
    return;
  }

  if (entity.type === "line") {
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("Line"));
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "Line layer updated."));

    const geometryGrid = appendSection("Geometry");
    const lengthUnits = Math.hypot(entity.p2.x - entity.p1.x, entity.p2.y - entity.p1.y);
    const lengthMm = unitsToMm(lengthUnits);
    const angleDeg = Math.atan2(entity.p2.y - entity.p1.y, entity.p2.x - entity.p1.x) * (180 / Math.PI);
    addPropertyRow(geometryGrid, "Length mm", createReadOnlyText(String(lengthMm)));
    addPropertyRow(geometryGrid, "Angle deg", createReadOnlyText(String(Number(angleDeg.toFixed(3)))));

    return;
  }
}

function renderStatusPanel() {
  const snapLabel = uiState.snapMarker
    ? uiState.snapMarker.kind === "midpoint"
      ? "Midpoint"
      : uiState.snapMarker.kind === "center"
        ? "Center"
        : "Endpoint"
    : "Grid";
  const orthoLabel = uiState.isShiftPressed ? "Free angle" : "Ortho ON";
  const lengthInputLabel =
    uiState.gripEditDraft && uiState.gripEditDraft.numericInputBuffer
      ? `${uiState.gripEditDraft.numericInputBuffer} mm`
      : uiState.lineDraft && uiState.lineDraft.numericInputBuffer
      ? `${uiState.lineDraft.numericInputBuffer} mm`
      : "-";
  const distanceInputLabel =
    uiState.transformDraft && uiState.transformDraft.numericInputBuffer
      ? `${uiState.transformDraft.numericInputBuffer} mm`
      : "-";
  const commandStateLabel = uiState.selectionWindow
    ? getSelectionRect(uiState.selectionWindow).isCrossing
      ? "Select: crossing window"
      : "Select: window"
    : uiState.selectDragDraft
      ? `Select: drag ${uiState.selectDragDraft.mode}`
    : uiState.gripEditDraft
      ? "Select: edit endpoint"
    : uiState.alignDraft
      ? "Align: pick target line"
    : uiState.filletDraft
      ? "Fillet: pick side to keep on second line"
    : uiState.lineDraft
      ? "Line: specify next point"
    : uiState.rectangleDraft
      ? "Rectangle: specify opposite corner"
    : uiState.transformDraft
      ? `${capitalize(uiState.transformDraft.mode)}: specify second point`
      : uiState.activeTool === "line"
        ? "Line: specify first point"
        : uiState.activeTool === "rectangle"
          ? "Rectangle: specify first corner"
        : uiState.activeTool === "move"
          ? "Move: specify base point"
          : uiState.activeTool === "copy"
            ? "Copy: specify base point"
            : uiState.activeTool === "align"
              ? "Align: pick reference line"
            : uiState.activeTool === "fillet"
              ? "Fillet: pick first line"
            : "Select: pick entity";
  const activeLayer = getLayerById(state.activeLayerId);
  const rows = [
    ["Tool", capitalize(uiState.activeTool)],
    ["Command state", commandStateLabel],
    ["Units", `1 unit = ${MM_PER_UNIT} mm`],
    ["Grid", `${state.settings.gridUnit} unit`],
    ["Entities", String(state.entities.length)],
    ["Selected", String(state.selectedEntityIds.length)],
    ["Active layer", activeLayer ? activeLayer.name : "-"],
    ["Visible layers", String(state.layers.filter((layer) => layer.visible).length)],
    ["Snap", snapLabel],
    ["Ortho", orthoLabel],
    ["Length input", lengthInputLabel],
    ["Distance input", distanceInputLabel],
  ];

  statusPanel.innerHTML = rows
    .map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function resizeCanvas() {
  uiState.canvasRect = viewport.getBoundingClientRect();
  uiState.dpr = window.devicePixelRatio || 1;

  const width = Math.max(1, Math.floor(uiState.canvasRect.width));
  const height = Math.max(1, Math.floor(uiState.canvasRect.height));
  const bufferWidth = Math.floor(width * uiState.dpr);
  const bufferHeight = Math.floor(height * uiState.dpr);

  if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
    canvas.width = bufferWidth;
    canvas.height = bufferHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }

  ctx.setTransform(uiState.dpr, 0, 0, uiState.dpr, 0, 0);
}

function draw() {
  const width = uiState.canvasRect.width;
  const height = uiState.canvasRect.height;

  ctx.clearRect(0, 0, width, height);
  drawGrid(width, height);
  drawWorldAxes(width, height);

  state.entities.forEach((entity) => {
    if (!isLayerVisible(entity.layerId)) {
      return;
    }
    if (entity.type === "line") {
      drawLineEntity(entity);
    } else if (entity.type === "rect") {
      drawRectEntity(entity);
    }
  });

  if (uiState.lineDraft) {
    drawDraftLine(uiState.lineDraft.start, uiState.lineDraft.previewPoint || uiState.hoverWorld);
  }

  if (uiState.rectangleDraft) {
    drawDraftRectangle(uiState.rectangleDraft.start, uiState.hoverWorld);
  }

  if (uiState.transformDraft) {
    drawTransformPreview(uiState.transformDraft);
  }

  if (uiState.selectDragDraft) {
    drawTransformPreview(uiState.selectDragDraft);
  }

  if (uiState.gripEditDraft) {
    drawGripEditPreview(uiState.gripEditDraft);
  }

  if (uiState.selectionWindow) {
    drawSelectionWindow(uiState.selectionWindow);
  }

  if (uiState.snapMarker) {
    drawSnapMarker(uiState.snapMarker);
  }

  drawDynamicInput();

  zoomReadout.textContent = `Zoom: ${Math.round(state.view.zoom * 100)}%`;
}

function drawGrid(width, height) {
  if (!state.settings.showGrid) return;
  const worldTopLeft = screenToWorld({ x: 0, y: 0 });
  const worldBottomRight = screenToWorld({ x: width, y: height });
  const startX = Math.floor(worldTopLeft.x / GRID_MAJOR_UNIT) * GRID_MAJOR_UNIT;
  const endX = Math.ceil(worldBottomRight.x / GRID_MAJOR_UNIT) * GRID_MAJOR_UNIT;
  const startY = Math.floor(worldTopLeft.y / GRID_MAJOR_UNIT) * GRID_MAJOR_UNIT;
  const endY = Math.ceil(worldBottomRight.y / GRID_MAJOR_UNIT) * GRID_MAJOR_UNIT;
  const step = state.view.zoom * GRID_MAJOR_UNIT < 14 ? GRID_MAJOR_UNIT * 2 : GRID_MAJOR_UNIT;
  const dotRadius = document.body.dataset.theme === "dark" ? 1.2 : 1.0;
  ctx.save();
  ctx.fillStyle = document.body.dataset.theme === "dark" ? "rgba(186,197,214,0.28)" : "rgba(123, 96, 64, 0.20)";
  for (let x = startX; x <= endX; x += step) {
    for (let y = startY; y <= endY; y += step) {
      const screen = worldToScreen({ x, y });
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawWorldAxes(width, height) {
  const origin = worldToScreen({ x: 0, y: 0 });
  ctx.save();
  ctx.strokeStyle = "rgba(89, 66, 42, 0.2)";
  ctx.lineWidth = 1;

  if (origin.x >= 0 && origin.x <= width) {
    ctx.beginPath();
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, height);
    ctx.stroke();
  }

  if (origin.y >= 0 && origin.y <= height) {
    ctx.beginPath();
    ctx.moveTo(0, origin.y);
    ctx.lineTo(width, origin.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawLineEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer) {
    return;
  }
  const isSelected = state.selectedEntityIds.includes(entity.id);
  const screenP1 = worldToScreen(entity.p1);
  const screenP2 = worldToScreen(entity.p2);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (isSelected) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.22)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(screenP1.x, screenP1.y);
    ctx.lineTo(screenP2.x, screenP2.y);
    ctx.stroke();
  }

  ctx.strokeStyle = layer.color;
  ctx.lineWidth = isSelected ? 2.6 : 1.6;
  ctx.beginPath();
  ctx.moveTo(screenP1.x, screenP1.y);
  ctx.lineTo(screenP2.x, screenP2.y);
  ctx.stroke();

  if (isSelected) {
    ctx.fillStyle = "#fffaf2";
    ctx.strokeStyle = "#c2693e";
    [screenP1, screenP2].forEach((point) => {
      ctx.beginPath();
      ctx.arc(point.x, point.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  ctx.restore();
}

function drawDraftLine(start, end) {
  const screenP1 = worldToScreen(start);
  const screenP2 = worldToScreen(end);
  ctx.save();
  ctx.strokeStyle = "rgba(98, 73, 45, 0.85)";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(screenP1.x, screenP1.y);
  ctx.lineTo(screenP2.x, screenP2.y);
  ctx.stroke();
  ctx.restore();
}

function drawDraftRectangle(start, opposite) {
  const box = getRectBoxFromPoints(start, opposite);
  if (!box) {
    return;
  }

  ctx.save();
  ctx.strokeStyle = "rgba(98, 73, 45, 0.85)";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  const tl = worldToScreen({ x: box.x, y: box.y });
  const br = worldToScreen({ x: box.x + box.width, y: box.y + box.height });
  ctx.strokeRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);
  ctx.stroke();
  ctx.restore();
}

function drawRectEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer) return;
  const isSelected = state.selectedEntityIds.includes(entity.id);
  const p1 = worldToScreen({ x: entity.x, y: entity.y });
  const p2 = worldToScreen({ x: entity.x + entity.width, y: entity.y + entity.height });
  const w = p2.x - p1.x;
  const h = p2.y - p1.y;
  ctx.save();
  if (entity.fill !== false) {
    ctx.fillStyle = normalizeColor(entity.fillColor || layer.color);
    ctx.fillRect(p1.x, p1.y, w, h);
  }
  if (isSelected) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.28)";
    ctx.lineWidth = 10;
    ctx.strokeRect(p1.x, p1.y, w, h);
  }
  ctx.strokeStyle = layer.color;
  ctx.lineWidth = isSelected ? 2.4 : 1.6;
  ctx.strokeRect(p1.x, p1.y, w, h);
  if (isSelected) {
    ctx.fillStyle = "#fffaf2";
    ctx.strokeStyle = "#c2693e";
    getRectSnapPoints(entity).filter((g)=>g.kind!=="center").forEach((g)=>{ const s=worldToScreen(g.point); ctx.beginPath(); ctx.arc(s.x,s.y,4,0,Math.PI*2); ctx.fill(); ctx.stroke();});
  }
  ctx.restore();
}

function drawSnapMarker(snapMarker) {
  const screenPoint = worldToScreen(snapMarker.point);
  ctx.save();
  ctx.strokeStyle = snapMarker.kind === "midpoint" ? "rgba(80, 87, 96, 0.95)" : "rgba(194, 105, 62, 0.95)";
  ctx.fillStyle = "#fffaf2";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(screenPoint.x, screenPoint.y, 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  if (snapMarker.kind === "midpoint") {
    ctx.beginPath();
    ctx.moveTo(screenPoint.x - 6, screenPoint.y);
    ctx.lineTo(screenPoint.x + 6, screenPoint.y);
    ctx.moveTo(screenPoint.x, screenPoint.y - 6);
    ctx.lineTo(screenPoint.x, screenPoint.y + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSelectionWindow(selectionWindow) {
  const rect = getSelectionRect(selectionWindow);
  ctx.save();
  ctx.fillStyle = rect.isCrossing ? "rgba(194, 105, 62, 0.10)" : "rgba(120, 94, 63, 0.08)";
  ctx.strokeStyle = rect.isCrossing ? "rgba(194, 105, 62, 0.82)" : "rgba(120, 94, 63, 0.86)";
  ctx.lineWidth = 1.2;
  if (rect.isCrossing) {
    ctx.setLineDash([8, 6]);
  }
  ctx.fillRect(rect.left, rect.top, rect.width, rect.height);
  ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
  ctx.restore();
}

function drawTransformPreview(transformDraft) {
  const offset = getTransformOffset(transformDraft);
  transformDraft.entities.forEach((entity) => {
    if (entity.type === "line") {
      const previewLine = { ...entity, p1: { x: entity.p1.x + offset.dx, y: entity.p1.y + offset.dy }, p2: { x: entity.p2.x + offset.dx, y: entity.p2.y + offset.dy } };
      drawPreviewLineEntity(previewLine);
    } else if (entity.type === "rect") {
      drawRectEntity({ ...entity, x: entity.x + offset.dx, y: entity.y + offset.dy });
    }
  });
}

function drawGripEditPreview(gripEditDraft) {
  const layer = getLayerById(gripEditDraft.originalEntity.layerId);
  if (!layer || !isLayerVisible(gripEditDraft.originalEntity.layerId)) {
    return;
  }

  const previewLine = {
    ...gripEditDraft.originalEntity,
    p1: gripEditDraft.endpoint === "p1" ? gripEditDraft.currentPoint : gripEditDraft.fixedPoint,
    p2: gripEditDraft.endpoint === "p2" ? gripEditDraft.currentPoint : gripEditDraft.fixedPoint,
  };
  drawPreviewLineEntity(previewLine);
}

function formatDistanceMmFromPoints(p1, p2) {
  return (unitsToMm(Math.hypot(p2.x - p1.x, p2.y - p1.y))).toFixed(1);
}

function drawDynamicInput() {
  if (uiState.gripEditDraft) {
    const text = uiState.gripEditDraft.numericInputBuffer || formatDistanceMmFromPoints(
      uiState.gripEditDraft.startPoint,
      uiState.gripEditDraft.currentPoint
    );
    drawDynamicInputLabel(
      text,
      {
        x: (uiState.gripEditDraft.startPoint.x + uiState.gripEditDraft.currentPoint.x) / 2,
        y: (uiState.gripEditDraft.startPoint.y + uiState.gripEditDraft.currentPoint.y) / 2,
      },
      { emphasized: Boolean(uiState.gripEditDraft.numericInputBuffer) }
    );
    return;
  }

  if (uiState.transformDraft) {
    const text = uiState.transformDraft.numericInputBuffer || formatDistanceMmFromPoints(
      uiState.transformDraft.startPoint,
      uiState.transformDraft.currentPoint
    );
    drawDynamicInputLabel(
      text,
      uiState.pointerWorld,
      {
        emphasized: Boolean(uiState.transformDraft.numericInputBuffer),
        offsetX: 12,
        offsetY: 12,
        anchor: "top-left",
      }
    );
    return;
  }

  if (uiState.lineDraft) {
    const text = uiState.lineDraft.numericInputBuffer || formatDistanceMmFromPoints(
      uiState.lineDraft.start,
      uiState.hoverWorld
    );
    drawDynamicInputLabel(
      text,
      {
        x: (uiState.lineDraft.start.x + uiState.hoverWorld.x) / 2,
        y: (uiState.lineDraft.start.y + uiState.hoverWorld.y) / 2,
      },
      { emphasized: Boolean(uiState.lineDraft.numericInputBuffer) }
    );
  }
}

function drawDynamicInputLabel(text, worldPoint, options = {}) {
  if (!text) {
    return;
  }

  const screenPoint = worldToScreen(worldPoint);
  const offsetX = options.offsetX ?? 0;
  const offsetY = options.offsetY ?? -18;
  const anchor = options.anchor ?? "center";
  const label = String(text);

  ctx.save();
  ctx.font = options.emphasized ? '600 12px ui-sans-serif, system-ui, sans-serif' : '500 12px ui-sans-serif, system-ui, sans-serif';
  const metrics = ctx.measureText(label);
  const paddingX = 8;
  const paddingY = 5;
  const width = Math.ceil(metrics.width + paddingX * 2);
  const height = 24;
  const x = Math.round(
    anchor === "top-left" ? screenPoint.x + offsetX : screenPoint.x - width / 2 + offsetX
  );
  const y = Math.round(
    anchor === "top-left" ? screenPoint.y + offsetY : screenPoint.y + offsetY - height / 2
  );

  ctx.fillStyle = options.emphasized ? "rgba(255, 252, 245, 0.98)" : "rgba(250, 247, 240, 0.94)";
  ctx.strokeStyle = "rgba(112, 104, 93, 0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, 6);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = options.emphasized ? "#17120f" : "rgba(23, 18, 15, 0.72)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x + width / 2, y + height / 2 + 0.5);
  ctx.restore();
}

function drawPreviewLineEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer || !isLayerVisible(entity.layerId)) {
    return;
  }
  const screenP1 = worldToScreen(entity.p1);
  const screenP2 = worldToScreen(entity.p2);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([9, 6]);
  ctx.strokeStyle = "rgba(98, 73, 45, 0.82)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(screenP1.x, screenP1.y);
  ctx.lineTo(screenP2.x, screenP2.y);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.strokeStyle = "rgba(194, 105, 62, 0.22)";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(screenP1.x, screenP1.y);
  ctx.lineTo(screenP2.x, screenP2.y);
  ctx.stroke();
  ctx.restore();
}

function getEntityById(entityId) {
  return state.entities.find((entity) => entity.id === entityId) || null;
}

function addLineEntity(p1, p2) {
  const activeLayer = getLayerById(state.activeLayerId);
  if (!activeLayer) {
    setStatus("No active layer.");
    return;
  }
  if (!activeLayer.visible || activeLayer.locked) {
    setStatus("Active layer must be visible and unlocked to draw.");
    return;
  }

  const snappedP1 = getSnapPoint(p1);
  const snappedP2 = getSnapPoint(p2);
  if (snappedP1.x === snappedP2.x && snappedP1.y === snappedP2.y) {
    setStatus("Line length must be greater than zero.");
    return null;
  }

  pushUndoState();
  const createdEntity = {
    id: createEntityId(),
    type: "line",
    layerId: state.activeLayerId,
    p1: snappedP1,
    p2: snappedP2,
  };
  state.entities.push(createdEntity);
  state.selectedEntityIds = [];
  syncAfterStateChange();
  setStatus(`Line created: ${formatWorldPoint(snappedP1)} -> ${formatWorldPoint(snappedP2)}.`);
  return createdEntity;
}

function getRectangleCorners(startPoint, oppositePoint, options = {}) {
  const snap = options.snap !== false;
  const p1 = snap ? getSnapPoint(startPoint) : roundWorldPoint(startPoint);
  const p3 = snap ? getSnapPoint(oppositePoint) : roundWorldPoint(oppositePoint);
  if (p1.x === p3.x || p1.y === p3.y) {
    return null;
  }

  return [
    p1,
    { x: p3.x, y: p1.y },
    p3,
    { x: p1.x, y: p3.y },
  ];
}

function addRectangleEntity(startPoint, oppositePoint) {
  const activeLayer = getLayerById(state.activeLayerId);
  if (!activeLayer) {
    setStatus("No active layer.");
    return false;
  }
  if (!activeLayer.visible || activeLayer.locked) {
    setStatus("Active layer must be visible and unlocked to draw.");
    return false;
  }

  const box = getRectBoxFromPoints(startPoint, oppositePoint);
  if (!box) {
    setStatus("Rectangle width and height must be greater than zero.");
    return false;
  }

  pushUndoState();
  const rect = { id: createEntityId(), type: "rect", layerId: state.activeLayerId, ...box, rotation: 0, name: "Box", fill: true, fillColor: normalizeColor(getLayerById(state.activeLayerId)?.color) };
  state.entities.push(rect);
  state.selectedEntityIds = [rect.id];
  syncAfterStateChange();
  setStatus("Rectangle object created.");
  return true;
}

function createRectangleMm(x1Mm, y1Mm, x2Mm, y2Mm) {
  const activeLayer = getLayerById(state.activeLayerId);
  if (!activeLayer) {
    setStatus("No active layer.");
    return false;
  }
  if (!activeLayer.visible || activeLayer.locked) {
    setStatus("Active layer must be visible and unlocked to draw.");
    return false;
  }

  const box = getRectBoxFromPoints(
    { x: mmToUnits(x1Mm), y: mmToUnits(y1Mm) },
    { x: mmToUnits(x2Mm), y: mmToUnits(y2Mm) },
    { snap: false }
  );
  if (!box) {
    setStatus("Rectangle width and height must be greater than zero.");
    return false;
  }

  pushUndoState();
  const rect = { id: createEntityId(), type: "rect", layerId: state.activeLayerId, ...box, rotation: 0, name: "Box", fill: true, fillColor: normalizeColor(getLayerById(state.activeLayerId)?.color) };
  state.entities.push(rect);
  state.selectedEntityIds = [rect.id];
  syncAfterStateChange();
  setStatus("Rectangle object created.");
  return true;
}

function createLineFromNumericInput() {
  if (!uiState.lineDraft) {
    return false;
  }

  clearLinePreviewTimer();

  if (uiState.lineDraft.previewPoint) {
    const createdEntity = addLineEntity(uiState.lineDraft.start, uiState.lineDraft.previewPoint);
    if (!createdEntity) {
      return false;
    }

    beginLineDraft(
      createdEntity.p2,
      `Line segment created. Next point starts at ${formatWorldPoint(createdEntity.p2)}.`
    );
    return true;
  }

  const rawLengthMm = uiState.lineDraft.numericInputBuffer;
  const lengthMm = Number.parseInt(rawLengthMm, 10);
  if (!rawLengthMm || !Number.isFinite(lengthMm) || lengthMm <= 0) {
    setStatus("Enter a positive line length in mm.");
    return false;
  }

  const directionX = uiState.hoverWorld.x - uiState.lineDraft.start.x;
  const directionY = uiState.hoverWorld.y - uiState.lineDraft.start.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength === 0) {
    setStatus("Move the pointer to indicate a line direction before pressing Enter.");
    return false;
  }

  const lengthUnits = mmToUnits(lengthMm);
  if (lengthUnits <= 0) {
    setStatus("Line length must be greater than zero.");
    return false;
  }

  const targetPoint = {
    x: roundToGridUnit(uiState.lineDraft.start.x + (directionX / directionLength) * lengthUnits),
    y: roundToGridUnit(uiState.lineDraft.start.y + (directionY / directionLength) * lengthUnits),
  };

  const createdEntity = addLineEntity(uiState.lineDraft.start, targetPoint);
  if (!createdEntity) {
    return false;
  }

  beginLineDraft(
    createdEntity.p2,
    `Line segment created. Next point starts at ${formatWorldPoint(createdEntity.p2)}.`
  );
  return true;
}

function applyLineNumericPreview() {
  if (!uiState.lineDraft || !uiState.lineDraft.numericInputBuffer) {
    return false;
  }

  const rawLengthMm = uiState.lineDraft.numericInputBuffer;
  const lengthMm = Number.parseInt(rawLengthMm, 10);
  if (!rawLengthMm || !Number.isFinite(lengthMm) || lengthMm <= 0) {
    return false;
  }

  const directionX = uiState.hoverWorld.x - uiState.lineDraft.start.x;
  const directionY = uiState.hoverWorld.y - uiState.lineDraft.start.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength === 0) {
    return false;
  }

  const lengthUnits = mmToUnits(lengthMm);
  if (lengthUnits <= 0) {
    return false;
  }

  uiState.lineDraft.previewPoint = {
    x: roundToGridUnit(uiState.lineDraft.start.x + (directionX / directionLength) * lengthUnits),
    y: roundToGridUnit(uiState.lineDraft.start.y + (directionY / directionLength) * lengthUnits),
  };
  draw();
  renderStatusPanel();
  return true;
}

function scheduleLineNumericPreview() {
  if (!uiState.lineDraft) {
    return;
  }
  clearLinePreviewTimer();
  if (!uiState.lineDraft.numericInputBuffer) {
    return;
  }
  uiState.linePreviewTimer = window.setTimeout(() => {
    uiState.linePreviewTimer = null;
    applyLineNumericPreview();
  }, 250);
}

function createTransformFromNumericInput() {
  if (!uiState.transformDraft) {
    return false;
  }

  clearTransformPreviewTimer();

  const rawDistanceMm = uiState.transformDraft.numericInputBuffer;
  const distanceMm = Number.parseInt(rawDistanceMm, 10);
  if (!rawDistanceMm || !Number.isFinite(distanceMm) || distanceMm <= 0) {
    setStatus("Enter a positive move/copy distance in mm.");
    return false;
  }

  const directionX = uiState.hoverWorld.x - uiState.transformDraft.startPoint.x;
  const directionY = uiState.hoverWorld.y - uiState.transformDraft.startPoint.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength === 0) {
    setStatus("Move the pointer to indicate a move/copy direction before pressing Enter.");
    return false;
  }

  const distanceUnits = mmToUnits(distanceMm);
  if (distanceUnits <= 0) {
    setStatus("Move/copy distance must be greater than zero.");
    return false;
  }

  uiState.transformDraft.currentPoint = {
    x: roundToGridUnit(
      uiState.transformDraft.startPoint.x + (directionX / directionLength) * distanceUnits
    ),
    y: roundToGridUnit(
      uiState.transformDraft.startPoint.y + (directionY / directionLength) * distanceUnits
    ),
  };
  applyTransformDraft();
  return true;
}

function applyTransformNumericPreview() {
  if (!uiState.transformDraft || !uiState.transformDraft.numericInputBuffer) {
    return false;
  }

  const rawDistanceMm = uiState.transformDraft.numericInputBuffer;
  const distanceMm = Number.parseInt(rawDistanceMm, 10);
  if (!rawDistanceMm || !Number.isFinite(distanceMm) || distanceMm <= 0) {
    return false;
  }

  const directionX = uiState.hoverWorld.x - uiState.transformDraft.startPoint.x;
  const directionY = uiState.hoverWorld.y - uiState.transformDraft.startPoint.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength === 0) {
    return false;
  }

  const distanceUnits = mmToUnits(distanceMm);
  if (distanceUnits <= 0) {
    return false;
  }

  uiState.transformDraft.currentPoint = {
    x: roundToGridUnit(
      uiState.transformDraft.startPoint.x + (directionX / directionLength) * distanceUnits
    ),
    y: roundToGridUnit(
      uiState.transformDraft.startPoint.y + (directionY / directionLength) * distanceUnits
    ),
  };
  draw();
  renderStatusPanel();
  return true;
}

function scheduleTransformNumericPreview() {
  if (!uiState.transformDraft) {
    return;
  }
  clearTransformPreviewTimer();
  if (!uiState.transformDraft.numericInputBuffer) {
    return;
  }
  uiState.transformPreviewTimer = window.setTimeout(() => {
    uiState.transformPreviewTimer = null;
    applyTransformNumericPreview();
  }, 250);
}

function findEditableGripAtPoint(worldPoint) {
  const candidates = state.selectedEntityIds
    .map(getEntityById)
    .filter((entity) => entity && entity.type === "line" && canSelectEntity(entity))
    .flatMap((entity) => [
      {
        entity,
        endpoint: "p1",
        point: entity.p1,
        distancePx: distanceScreenPx(worldPoint, entity.p1),
      },
      {
        entity,
        endpoint: "p2",
        point: entity.p2,
        distancePx: distanceScreenPx(worldPoint, entity.p2),
      },
    ])
    .filter((candidate) => candidate.distancePx <= state.settings.snapTolerancePx)
    .sort((a, b) => a.distancePx - b.distancePx);

  return candidates[0] || null;
}

function startGripEdit(gripHit, worldPoint) {
  uiState.gripEditDraft = {
    entityId: gripHit.entity.id,
    endpoint: gripHit.endpoint,
    fixedPoint: deepClone(gripHit.endpoint === "p1" ? gripHit.entity.p2 : gripHit.entity.p1),
    startPoint: deepClone(gripHit.point),
    currentPoint: worldPoint,
    originalEntity: deepClone(gripHit.entity),
    numericInputBuffer: "",
  };
  updateGripEditStatus(
    `Grip edit started from ${formatWorldPoint(worldPoint)} with ${gripHit.endpoint.toUpperCase()} active.`
  );
  draw();
}

function updateGripEdit(worldPoint) {
  if (!uiState.gripEditDraft) {
    return;
  }
  if (uiState.gripEditDraft.numericInputBuffer) {
    return;
  }
  uiState.gripEditDraft.currentPoint = worldPoint;
  draw();
}

function applyGripEdit() {
  const gripEditDraft = uiState.gripEditDraft;
  if (!gripEditDraft) {
    return false;
  }

  const nextPoint = getSnapPoint(gripEditDraft.currentPoint);
  if (nextPoint.x === gripEditDraft.startPoint.x && nextPoint.y === gripEditDraft.startPoint.y) {
    cancelGripEdit("Grip edit cancelled.");
    return false;
  }
  if (
    nextPoint.x === gripEditDraft.fixedPoint.x &&
    nextPoint.y === gripEditDraft.fixedPoint.y
  ) {
    setStatus("Line length must be greater than zero.");
    draw();
    renderStatusPanel();
    return false;
  }

  pushUndoState();
  state.entities = state.entities.map((entity) => {
    if (entity.id !== gripEditDraft.entityId) {
      return entity;
    }
    if (!canSelectEntity(entity)) {
      return entity;
    }
    return {
      ...entity,
      p1: gripEditDraft.endpoint === "p1" ? nextPoint : gripEditDraft.fixedPoint,
      p2: gripEditDraft.endpoint === "p2" ? nextPoint : gripEditDraft.fixedPoint,
    };
  });
  uiState.gripEditDraft = null;
  syncAfterStateChange();
  setStatus("Grip edit applied.");
  return true;
}

function createGripEditFromNumericInput() {
  if (!uiState.gripEditDraft) {
    return false;
  }

  clearGripPreviewTimer();

  const rawLengthMm = uiState.gripEditDraft.numericInputBuffer;
  const lengthMm = Number.parseInt(rawLengthMm, 10);
  if (!rawLengthMm || !Number.isFinite(lengthMm) || lengthMm <= 0) {
    setStatus("Enter a positive grip edit distance in mm.");
    return false;
  }

  const directionX = uiState.hoverWorld.x - uiState.gripEditDraft.startPoint.x;
  const directionY = uiState.hoverWorld.y - uiState.gripEditDraft.startPoint.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength === 0) {
    setStatus("Move the pointer to indicate a grip edit direction before pressing Enter.");
    return false;
  }

  const deltaUnits = mmToUnits(lengthMm);
  if (deltaUnits <= 0) {
    setStatus("Line length must be greater than zero.");
    return false;
  }

  uiState.gripEditDraft.currentPoint = {
    x: roundToGridUnit(
      uiState.gripEditDraft.startPoint.x + (directionX / directionLength) * deltaUnits
    ),
    y: roundToGridUnit(
      uiState.gripEditDraft.startPoint.y + (directionY / directionLength) * deltaUnits
    ),
  };
  return applyGripEdit();
}

function applyGripNumericPreview() {
  if (!uiState.gripEditDraft || !uiState.gripEditDraft.numericInputBuffer) {
    return false;
  }

  const rawLengthMm = uiState.gripEditDraft.numericInputBuffer;
  const lengthMm = Number.parseInt(rawLengthMm, 10);
  if (!rawLengthMm || !Number.isFinite(lengthMm) || lengthMm <= 0) {
    return false;
  }

  const directionX = uiState.hoverWorld.x - uiState.gripEditDraft.startPoint.x;
  const directionY = uiState.hoverWorld.y - uiState.gripEditDraft.startPoint.y;
  const directionLength = Math.hypot(directionX, directionY);
  if (directionLength === 0) {
    return false;
  }

  const deltaUnits = mmToUnits(lengthMm);
  if (deltaUnits <= 0) {
    return false;
  }

  uiState.gripEditDraft.currentPoint = {
    x: roundToGridUnit(
      uiState.gripEditDraft.startPoint.x + (directionX / directionLength) * deltaUnits
    ),
    y: roundToGridUnit(
      uiState.gripEditDraft.startPoint.y + (directionY / directionLength) * deltaUnits
    ),
  };
  draw();
  renderStatusPanel();
  return true;
}

function scheduleGripNumericPreview() {
  if (!uiState.gripEditDraft) {
    return;
  }
  clearGripPreviewTimer();
  if (!uiState.gripEditDraft.numericInputBuffer) {
    return;
  }
  uiState.gripPreviewTimer = window.setTimeout(() => {
    uiState.gripPreviewTimer = null;
    applyGripNumericPreview();
  }, 250);
}

function getSelectedTransformableEntities() {
  return state.selectedEntityIds
    .map(getEntityById)
    .filter((entity) => entity && (entity.type === "line" || entity.type === "rect") && canSelectEntity(entity));
}

function canStartTransformTool() {
  return getSelectedTransformableEntities().length > 0;
}

function startTransformDraft(worldPoint, mode = uiState.activeTool) {
  const selectedEntities = getSelectedTransformableEntities();
  if (!selectedEntities.length) {
    setStatus("Select at least one visible, unlocked entity before using Move or Copy.");
    return false;
  }

  uiState.transformDraft = {
    mode,
    startPoint: worldPoint,
    currentPoint: worldPoint,
    numericInputBuffer: "",
    entityIds: selectedEntities.map((entity) => entity.id),
    entities: deepClone(selectedEntities),
  };
  updateTransformDraftStatus(
    `${capitalize(mode)} start set at ${formatWorldPoint(worldPoint)}.`
  );
  draw();
  renderStatusPanel();
  return true;
}

function getTransformOffset(transformDraft) {
  const currentPoint = transformDraft.currentPoint || transformDraft.startPoint;
  return {
    dx: currentPoint.x - transformDraft.startPoint.x,
    dy: currentPoint.y - transformDraft.startPoint.y,
  };
}

function updateTransformDraft(worldPoint) {
  if (!uiState.transformDraft) {
    return;
  }
  if (uiState.transformDraft.numericInputBuffer) {
    return;
  }
  uiState.transformDraft.currentPoint = worldPoint;
  draw();
}

function applyOffsetToEntity(entity, offset) {
  if (entity.type === "rect") {
    return {
      ...entity,
      x: entity.x + offset.dx,
      y: entity.y + offset.dy,
    };
  }
  return {
    ...entity,
    p1: {
      x: entity.p1.x + offset.dx,
      y: entity.p1.y + offset.dy,
    },
    p2: {
      x: entity.p2.x + offset.dx,
      y: entity.p2.y + offset.dy,
    },
  };
}

function commitMoveEntityOffset(entityIds, offset) {
  state.entities = state.entities.map((entity) => {
    if (!entityIds.includes(entity.id)) {
      return entity;
    }
    if (!canSelectEntity(entity)) {
      return entity;
    }
    return applyOffsetToEntity(entity, offset);
  });
}

function createCopiedEntities(sourceEntities, offset) {
  return sourceEntities.map((entity) => ({
    ...applyOffsetToEntity(deepClone(entity), offset),
    id: createEntityId(),
  }));
}

function applyTransformDraft() {
  const transformDraft = uiState.transformDraft;
  if (!transformDraft) {
    return false;
  }

  clearTransformPreviewTimer();

  const offset = getTransformOffset(transformDraft);
  if (offset.dx === 0 && offset.dy === 0) {
    draw();
    renderStatusPanel();
    setStatus(`${capitalize(transformDraft.mode)} distance must be greater than zero.`);
    return false;
  }

  pushUndoState();

  if (transformDraft.mode === "move") {
    commitMoveEntityOffset(transformDraft.entityIds, offset);
  } else if (transformDraft.mode === "copy") {
    const sourceEntities = transformDraft.entities.filter((entity) => canSelectEntity(entity));
    const newEntities = createCopiedEntities(sourceEntities, offset);
    state.entities.push(...newEntities);
  }

  if (transformDraft.mode === "move") {
    uiState.transformDraft = null;
    state.selectedEntityIds = [];
    uiState.activeTool = "select";
    syncAfterStateChange();
    setStatus("Move applied.");
    return true;
  }

  uiState.transformDraft.numericInputBuffer = "";
  uiState.transformDraft.currentPoint = uiState.transformDraft.startPoint;
  syncAfterStateChange();
  updateTransformDraftStatus("Copy created. Specify next point or press Enter/Escape to finish.");
  return true;
}

function startSelectDragWithMode(worldPoint, mode = "move") {
  const selectedEntities = getSelectedTransformableEntities();
  if (!selectedEntities.length) {
    return false;
  }

  uiState.selectDragDraft = {
    mode,
    startPoint: resolveFreeDragPoint(worldPoint),
    currentPoint: resolveFreeDragPoint(worldPoint),
    entityIds: selectedEntities.map((entity) => entity.id),
    entities: deepClone(selectedEntities),
  };
  updateSelectDragStatus(
    `Drag ${mode} started at ${formatWorldPoint(uiState.selectDragDraft.startPoint)}.`
  );
  draw();
  renderStatusPanel();
  return true;
}

function updateSelectDrag(worldPoint) {
  if (!uiState.selectDragDraft) {
    return;
  }
  uiState.selectDragDraft.currentPoint = resolveFreeDragPoint(worldPoint);
  updateSelectDragStatus(`Drag ${uiState.selectDragDraft.mode} active.`);
  draw();
}

function applySelectDrag() {
  const selectDragDraft = uiState.selectDragDraft;
  if (!selectDragDraft) {
    return false;
  }

  const offset = getTransformOffset(selectDragDraft);
  if (offset.dx === 0 && offset.dy === 0) {
    cancelSelectDrag(`Drag ${selectDragDraft.mode} cancelled.`);
    return false;
  }

  pushUndoState();
  if (selectDragDraft.mode === "copy") {
    const sourceEntities = selectDragDraft.entities.filter((entity) => canSelectEntity(entity));
    const newEntities = sourceEntities.map((entity) => entity.type === "rect"
      ? ({
          ...deepClone(entity),
          id: createEntityId(),
          x: entity.x + offset.dx,
          y: entity.y + offset.dy,
        })
      : ({
          ...deepClone(entity),
          id: createEntityId(),
          p1: { x: entity.p1.x + offset.dx, y: entity.p1.y + offset.dy },
          p2: { x: entity.p2.x + offset.dx, y: entity.p2.y + offset.dy },
        }));
    state.entities.push(...newEntities);
  } else {
    commitMoveEntityOffset(selectDragDraft.entityIds, offset);
  }
  uiState.selectDragDraft = null;
  syncAfterStateChange();
  setStatus(selectDragDraft.mode === "copy" ? "Drag copy applied." : "Drag move applied.");
  return true;
}


function rectToOutlineLines(rectEntity) {
  const x1 = rectEntity.x; const y1 = rectEntity.y; const x2 = rectEntity.x + rectEntity.width; const y2 = rectEntity.y + rectEntity.height;
  return [
    { type:"line", layerId: rectEntity.layerId, p1:{x:x1,y:y1}, p2:{x:x2,y:y1} },
    { type:"line", layerId: rectEntity.layerId, p1:{x:x2,y:y1}, p2:{x:x2,y:y2} },
    { type:"line", layerId: rectEntity.layerId, p1:{x:x2,y:y2}, p2:{x:x1,y:y2} },
    { type:"line", layerId: rectEntity.layerId, p1:{x:x1,y:y2}, p2:{x:x1,y:y1} },
  ];
}

function explodeSelectedRects() {
  const rects = state.selectedEntityIds.map(getEntityById).filter((e)=>e&&e.type==="rect"&&canSelectEntity(e));
  if (!rects.length) { setStatus("Select at least one rectangle object to explode."); return false; }
  pushUndoState();
  const rectIds = new Set(rects.map((r)=>r.id));
  const newLines = rects.flatMap((r)=>rectToOutlineLines(r).map((line)=>({ ...line, id:createEntityId() })));
  state.entities = state.entities.filter((e)=>!rectIds.has(e.id));
  state.entities.push(...newLines);
  state.selectedEntityIds = newLines.map((l)=>l.id);
  syncAfterStateChange();
  setStatus("Rectangle objects exploded.");
  return true;
}

function deleteSelectedEntities() {
  if (!state.selectedEntityIds.length) {
    setStatus("Nothing selected.");
    return;
  }

  const deletableIds = state.selectedEntityIds.filter((entityId) => {
    const entity = getEntityById(entityId);
    const layer = entity ? getLayerById(entity.layerId) : null;
    return Boolean(entity && layer && !layer.locked);
  });

  if (!deletableIds.length) {
    setStatus("Selected entities are locked or unavailable.");
    return;
  }

  pushUndoState();
  state.entities = state.entities.filter((entity) => !deletableIds.includes(entity.id));
  state.selectedEntityIds = [];
  syncAfterStateChange();
  setStatus(`${deletableIds.length} entit${deletableIds.length === 1 ? "y" : "ies"} deleted.`);
}

function findFilletTargetAtPoint(worldPoint) {
  const selectable = state.entities
    .filter((entity) => entity.type === "line" && canSelectEntity(entity))
    .slice()
    .reverse();

  return selectable.find((entity) => hitTestEntity(entity, worldPoint)) || null;
}

function findAlignTargetAtPoint(worldPoint) {
  const selectable = state.entities
    .filter((entity) => entity.type === "line" && canSelectEntity(entity))
    .slice()
    .reverse();

  return selectable.find((entity) => hitTestEntity(entity, worldPoint)) || null;
}

function areLinesParallel(lineA, lineB) {
  const dxA = lineA.p2.x - lineA.p1.x;
  const dyA = lineA.p2.y - lineA.p1.y;
  const dxB = lineB.p2.x - lineB.p1.x;
  const dyB = lineB.p2.y - lineB.p1.y;
  const lenA = Math.hypot(dxA, dyA);
  const lenB = Math.hypot(dxB, dyB);

  if (lenA === 0 || lenB === 0) {
    return false;
  }

  const cross = dxA * dyB - dyA * dxB;
  const normalizedCross = Math.abs(cross) / (lenA * lenB);
  return normalizedCross <= 0.00001;
}

function projectPointToInfiniteLineRaw(point, line) {
  const dx = line.p2.x - line.p1.x;
  const dy = line.p2.y - line.p1.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) {
    return null;
  }

  const t = ((point.x - line.p1.x) * dx + (point.y - line.p1.y) * dy) / lengthSq;
  return {
    x: line.p1.x + dx * t,
    y: line.p1.y + dy * t,
  };
}

function projectPointToInfiniteLine(point, line) {
  const projectedPoint = projectPointToInfiniteLineRaw(point, line);
  return projectedPoint ? roundWorldPoint(projectedPoint) : null;
}

function applyAlign(referenceEntityId, targetEntityId, targetClickWorld) {
  const referenceLine = getEntityById(referenceEntityId);
  const targetLine = getEntityById(targetEntityId);

  if (!referenceLine || !targetLine || referenceLine.type !== "line" || targetLine.type !== "line") {
    setStatus("Align requires two available lines.");
    return false;
  }
  if (!canSelectEntity(referenceLine) || !canSelectEntity(targetLine)) {
    setStatus("Align requires visible, unlocked lines.");
    return false;
  }
  if (referenceLine.id === targetLine.id) {
    setStatus("Align: pick a different target line.");
    return false;
  }
  if (!areLinesParallel(referenceLine, targetLine)) {
    setStatus("Align supports exactly parallel lines only for now.");
    return false;
  }

  const targetAnchorPoint = projectPointToInfiniteLineRaw(targetClickWorld, targetLine);
  if (!targetAnchorPoint) {
    setStatus("Align failed: target line is unavailable.");
    return false;
  }

  const referenceAnchorPoint = projectPointToInfiniteLineRaw(targetAnchorPoint, referenceLine);
  if (!referenceAnchorPoint) {
    setStatus("Align failed: reference line is unavailable.");
    return false;
  }

  const offset = {
    x: referenceAnchorPoint.x - targetAnchorPoint.x,
    y: referenceAnchorPoint.y - targetAnchorPoint.y,
  };
  if (offset.x === 0 && offset.y === 0) {
    setStatus("Align: target line is already aligned.");
    return false;
  }

  pushUndoState();
  state.entities = state.entities.map((entity) => {
    if (entity.id !== targetLine.id) {
      return entity;
    }
    return {
      ...entity,
      p1: roundWorldPoint({
        x: entity.p1.x + offset.x,
        y: entity.p1.y + offset.y,
      }),
      p2: roundWorldPoint({
        x: entity.p2.x + offset.x,
        y: entity.p2.y + offset.y,
      }),
    };
  });
  state.selectedEntityIds = [];
  uiState.alignDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange();
  setStatus("Align applied. Target line was moved onto the reference line.");
  return true;
}

function handleAlignToolClick(worldPoint) {
  const targetLine = findAlignTargetAtPoint(worldPoint);
  if (!targetLine) {
    setStatus(
      uiState.alignDraft ? "Pick a visible, unlocked target line." : "Pick a visible, unlocked reference line."
    );
    return;
  }

  if (!uiState.alignDraft) {
    uiState.alignDraft = {
      referenceEntityId: targetLine.id,
      referenceClickWorld: deepClone(worldPoint),
    };
    state.selectedEntityIds = [targetLine.id];
    syncAfterStateChange();
    setStatus("Align: reference line selected. Pick target line.");
    return;
  }

  if (uiState.alignDraft.referenceEntityId === targetLine.id) {
    setStatus("Align: pick a different target line.");
    return;
  }

  applyAlign(uiState.alignDraft.referenceEntityId, targetLine.id, worldPoint);
}

function getInfiniteLineIntersection(lineA, lineB) {
  const x1 = lineA.p1.x;
  const y1 = lineA.p1.y;
  const x2 = lineA.p2.x;
  const y2 = lineA.p2.y;
  const x3 = lineB.p1.x;
  const y3 = lineB.p1.y;
  const x4 = lineB.p2.x;
  const y4 = lineB.p2.y;

  const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denominator) < 0.000001) {
    return null;
  }

  const determinantA = x1 * y2 - y1 * x2;
  const determinantB = x3 * y4 - y3 * x4;
  return roundWorldPoint({
    x: (determinantA * (x3 - x4) - (x1 - x2) * determinantB) / denominator,
    y: (determinantA * (y3 - y4) - (y1 - y2) * determinantB) / denominator,
  });
}

function getEndpointToMoveForFillet(line, clickWorld, intersection) {
  const clickVec = {
    x: clickWorld.x - intersection.x,
    y: clickWorld.y - intersection.y,
  };
  const p1Vec = {
    x: line.p1.x - intersection.x,
    y: line.p1.y - intersection.y,
  };
  const p2Vec = {
    x: line.p2.x - intersection.x,
    y: line.p2.y - intersection.y,
  };
  const p1Dot = clickVec.x * p1Vec.x + clickVec.y * p1Vec.y;
  const p2Dot = clickVec.x * p2Vec.x + clickVec.y * p2Vec.y;

  return p1Dot >= p2Dot ? "p2" : "p1";
}

function applyFillet(firstEntityId, firstClickWorld, secondEntityId, secondClickWorld) {
  const firstLine = getEntityById(firstEntityId);
  const secondLine = getEntityById(secondEntityId);

  if (!firstLine || !secondLine || firstLine.type !== "line" || secondLine.type !== "line") {
    setStatus("Fillet requires two available lines.");
    return false;
  }
  if (!canSelectEntity(firstLine) || !canSelectEntity(secondLine)) {
    setStatus("Fillet requires visible, unlocked lines.");
    return false;
  }
  if (firstLine.id === secondLine.id) {
    setStatus("Fillet: pick a different second line.");
    return false;
  }

  const intersection = getInfiniteLineIntersection(firstLine, secondLine);
  if (!intersection) {
    setStatus("Fillet failed: lines are parallel or nearly parallel.");
    return false;
  }

  const firstEndpoint = getEndpointToMoveForFillet(firstLine, firstClickWorld, intersection);
  const secondEndpoint = getEndpointToMoveForFillet(secondLine, secondClickWorld, intersection);
  const nextFirstLine = {
    ...firstLine,
    p1: firstEndpoint === "p1" ? intersection : firstLine.p1,
    p2: firstEndpoint === "p2" ? intersection : firstLine.p2,
  };
  const nextSecondLine = {
    ...secondLine,
    p1: secondEndpoint === "p1" ? intersection : secondLine.p1,
    p2: secondEndpoint === "p2" ? intersection : secondLine.p2,
  };

  pushUndoState();
  state.entities = state.entities.map((entity) => {
    if (entity.id === nextFirstLine.id) {
      return nextFirstLine;
    }
    if (entity.id === nextSecondLine.id) {
      return nextSecondLine;
    }
    return entity;
  });
  state.selectedEntityIds = [];
  uiState.filletDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange();
  setStatus("Fillet applied. Clicked sides were kept.");
  return true;
}

function handleFilletToolClick(worldPoint) {
  const targetLine = findFilletTargetAtPoint(worldPoint);
  if (!targetLine) {
    setStatus(
      uiState.filletDraft ? "Pick a visible, unlocked second line." : "Pick a visible, unlocked first line."
    );
    return;
  }

  if (!uiState.filletDraft) {
    uiState.filletDraft = {
      firstEntityId: targetLine.id,
      firstClickWorld: deepClone(worldPoint),
    };
    state.selectedEntityIds = [targetLine.id];
    syncAfterStateChange();
    setStatus("Fillet: first line selected. Click the side to keep on the second line.");
    return;
  }

  if (uiState.filletDraft.firstEntityId === targetLine.id) {
    setStatus("Fillet: pick a different second line.");
    return;
  }

  applyFillet(
    uiState.filletDraft.firstEntityId,
    uiState.filletDraft.firstClickWorld,
    targetLine.id,
    worldPoint
  );
}

function selectEntityAtPoint(worldPoint, append = false) {
  const selectable = state.entities
    .filter(canSelectEntity)
    .slice()
    .reverse();

  const hit = selectable.find((entity) => hitTestEntity(entity, worldPoint));
  if (!append) {
    state.selectedEntityIds = hit ? [hit.id] : [];
  } else if (hit) {
    state.selectedEntityIds = state.selectedEntityIds.includes(hit.id)
      ? state.selectedEntityIds.filter((entityId) => entityId !== hit.id)
      : [...state.selectedEntityIds, hit.id];
  }
  syncAfterStateChange();
  setStatus(
    state.selectedEntityIds.length
      ? `${state.selectedEntityIds.length} entit${state.selectedEntityIds.length === 1 ? "y" : "ies"} selected.`
      : hit && append
        ? "Selection cleared."
        : "Selection cleared."
  );
}

function isPointInsideRect(screenPoint, rect) {
  return (
    screenPoint.x >= rect.left &&
    screenPoint.x <= rect.right &&
    screenPoint.y >= rect.top &&
    screenPoint.y <= rect.bottom
  );
}

function isLineFullyInsideRect(entity, rect) {
  const screenP1 = worldToScreen(entity.p1);
  const screenP2 = worldToScreen(entity.p2);
  return isPointInsideRect(screenP1, rect) && isPointInsideRect(screenP2, rect);
}

function orientation(a, b, c) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(value) < 0.000001) {
    return 0;
  }
  return value > 0 ? 1 : 2;
}

function onSegment(a, b, c) {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

function segmentsIntersect(a1, a2, b1, b2) {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);

  if (o1 !== o2 && o3 !== o4) {
    return true;
  }
  if (o1 === 0 && onSegment(a1, b1, a2)) {
    return true;
  }
  if (o2 === 0 && onSegment(a1, b2, a2)) {
    return true;
  }
  if (o3 === 0 && onSegment(b1, a1, b2)) {
    return true;
  }
  if (o4 === 0 && onSegment(b1, a2, b2)) {
    return true;
  }
  return false;
}

function doesLineCrossRect(entity, rect) {
  const screenP1 = worldToScreen(entity.p1);
  const screenP2 = worldToScreen(entity.p2);
  if (isPointInsideRect(screenP1, rect) || isPointInsideRect(screenP2, rect)) {
    return true;
  }

  const corners = [
    { x: rect.left, y: rect.top },
    { x: rect.right, y: rect.top },
    { x: rect.right, y: rect.bottom },
    { x: rect.left, y: rect.bottom },
  ];
  const edges = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];

  return edges.some(([edgeStart, edgeEnd]) => segmentsIntersect(screenP1, screenP2, edgeStart, edgeEnd));
}

function selectEntitiesByWindow(selectionWindow) {
  const rect = getSelectionRect(selectionWindow);
  const selectedIds = state.entities
    .filter(canSelectEntity)
    .filter((entity) => {
      if (entity.type === "line") {
        return rect.isCrossing ? doesLineCrossRect(entity, rect) : isLineFullyInsideRect(entity, rect);
      }
      if (entity.type === "rect") {
        const p1 = worldToScreen({x:entity.x,y:entity.y}); const p2=worldToScreen({x:entity.x+entity.width,y:entity.y+entity.height});
        const rl={left:Math.min(p1.x,p2.x),right:Math.max(p1.x,p2.x),top:Math.min(p1.y,p2.y),bottom:Math.max(p1.y,p2.y)};
        return rect.isCrossing ? !(rl.right < rect.left || rl.left > rect.right || rl.bottom < rect.top || rl.top > rect.bottom) : (rl.left>=rect.left && rl.right<=rect.right && rl.top>=rect.top && rl.bottom<=rect.bottom);
      }
      return false;
    })
    .map((entity) => entity.id);

  state.selectedEntityIds = selectionWindow.append
    ? [...new Set([...state.selectedEntityIds, ...selectedIds])]
    : selectedIds;
  syncAfterStateChange();
  setStatus(
    state.selectedEntityIds.length
      ? `${state.selectedEntityIds.length} entit${state.selectedEntityIds.length === 1 ? "y" : "ies"} selected.`
      : "Selection cleared."
  );
}

function hitTestEntity(entity, worldPoint) {
  if (entity.type === "line") {
    const distancePx = distancePointToSegmentScreenPx(worldPoint, entity.p1, entity.p2);
    return distancePx <= state.settings.snapTolerancePx;
  }
  if (entity.type === "rect") {
    const p=worldToScreen(worldPoint); const a=worldToScreen({x:entity.x,y:entity.y}); const b=worldToScreen({x:entity.x+entity.width,y:entity.y+entity.height});
    const left=Math.min(a.x,b.x),right=Math.max(a.x,b.x),top=Math.min(a.y,b.y),bottom=Math.max(a.y,b.y);
    const inside = p.x>=left && p.x<=right && p.y>=top && p.y<=bottom;
    const edge = Math.min(Math.abs(p.x-left),Math.abs(p.x-right),Math.abs(p.y-top),Math.abs(p.y-bottom)) <= state.settings.snapTolerancePx;
    return inside || edge;
  }
  return false;
}

function distancePointToSegmentScreenPx(point, segmentStart, segmentEnd) {
  const p = worldToScreen(point);
  const a = worldToScreen(segmentStart);
  const b = worldToScreen(segmentEnd);
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lengthSq = abx * abx + aby * aby;
  if (lengthSq === 0) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lengthSq));
  const closestX = a.x + abx * t;
  const closestY = a.y + aby * t;
  return Math.hypot(p.x - closestX, p.y - closestY);
}

function formatWorldPoint(point) {
  return `${unitsToMm(point.x)}mm, ${unitsToMm(point.y)}mm`;
}

function createDebugFixtureLineMm(x1Mm, y1Mm, x2Mm, y2Mm) {
  return {
    id: createEntityId(),
    type: "line",
    layerId: state.activeLayerId,
    p1: {
      x: mmToUnits(x1Mm),
      y: mmToUnits(y1Mm),
    },
    p2: {
      x: mmToUnits(x2Mm),
      y: mmToUnits(y2Mm),
    },
  };
}

function loadDebugFixture(name) {
  const fixtures = {
    "align-horizontal": () => [
      createDebugFixtureLineMm(-2000, 0, 2000, 0),
      createDebugFixtureLineMm(-1000, -800, 1000, -800),
    ],
    "align-vertical": () => [
      createDebugFixtureLineMm(0, -2000, 0, 2000),
      createDebugFixtureLineMm(800, -1000, 800, 1000),
    ],
    "align-diagonal": () => [
      createDebugFixtureLineMm(-1000, -1000, 1000, 1000),
      createDebugFixtureLineMm(-1000, -1500, 1000, 500),
    ],
    "fillet-cross": () => [
      createDebugFixtureLineMm(-1000, 0, 1000, 0),
      createDebugFixtureLineMm(0, -1000, 0, 1000),
    ],
    "fillet-l-shape": () => [
      createDebugFixtureLineMm(-1200, 0, -100, 0),
      createDebugFixtureLineMm(0, 1200, 0, 100),
    ],
    "basic-lines": () => [
      createDebugFixtureLineMm(-1500, -600, 1500, -600),
      createDebugFixtureLineMm(-1200, 600, 1200, 600),
    ],
    "rectangle-basic": () => {
      const corners = getRectangleCorners(
        { x: mmToUnits(-1500), y: mmToUnits(-1000) },
        { x: mmToUnits(1500), y: mmToUnits(1000) },
        { snap: false }
      );
      return [
        {
          id: createEntityId(),
          type: "line",
          layerId: state.activeLayerId,
          p1: corners[0],
          p2: corners[1],
        },
        {
          id: createEntityId(),
          type: "line",
          layerId: state.activeLayerId,
          p1: corners[1],
          p2: corners[2],
        },
        {
          id: createEntityId(),
          type: "line",
          layerId: state.activeLayerId,
          p1: corners[2],
          p2: corners[3],
        },
        {
          id: createEntityId(),
          type: "line",
          layerId: state.activeLayerId,
          p1: corners[3],
          p2: corners[0],
        },
      ];
    },
    "rectangle-entity-basic": () => [
      {
        id: createEntityId(),
        type: "rect",
        layerId: state.activeLayerId,
        x: mmToUnits(-1500),
        y: mmToUnits(-1000),
        width: mmToUnits(3000),
        height: mmToUnits(2000),
        fillColor: "",
        name: "Fixture Rect",
      },
    ],
    "drag-mixed": () => [
      createDebugFixtureLineMm(-1500, 0, 1500, 0),
      {
        id: createEntityId(),
        type: "rect",
        layerId: state.activeLayerId,
        x: mmToUnits(-800),
        y: mmToUnits(-1200),
        width: mmToUnits(1600),
        height: mmToUnits(700),
        fillColor: "",
        name: "Drag Rect",
      },
    ],
  };

  const fixtureFactory = fixtures[name];
  if (!fixtureFactory) {
    setStatus(`Unknown debug fixture: ${name}.`);
    return false;
  }

  pushUndoState();
  state.entities = fixtureFactory();
  state.selectedEntityIds = [];
  clearTransientState();
  syncAfterStateChange();
  fitAll();
  setStatus(`Fixture loaded: ${name}.`);
  return true;
}

function measureLineDistanceToLine(lineId, referenceLineId) {
  const line = getEntityById(lineId);
  const referenceLine = getEntityById(referenceLineId);

  if (!line || !referenceLine || line.type !== "line" || referenceLine.type !== "line") {
    return null;
  }

  const projectedP1 = projectPointToInfiniteLineRaw(line.p1, referenceLine);
  const projectedP2 = projectPointToInfiniteLineRaw(line.p2, referenceLine);
  if (!projectedP1 || !projectedP2) {
    return null;
  }

  const p1DistanceUnits = Math.hypot(line.p1.x - projectedP1.x, line.p1.y - projectedP1.y);
  const p2DistanceUnits = Math.hypot(line.p2.x - projectedP2.x, line.p2.y - projectedP2.y);
  const maxDistanceUnits = Math.max(p1DistanceUnits, p2DistanceUnits);

  return {
    lineId,
    referenceLineId,
    p1DistanceUnits,
    p2DistanceUnits,
    maxDistanceUnits,
    p1DistanceMm: unitsToMm(p1DistanceUnits),
    p2DistanceMm: unitsToMm(p2DistanceUnits),
    maxDistanceMm: unitsToMm(maxDistanceUnits),
  };
}

function getCanvasClickPointForLine(lineId, ratio = 0.5) {
  const line = getEntityById(lineId);
  if (!line || line.type !== "line") {
    return null;
  }

  const clampedRatio = clampNumber(ratio, 0, 1, 0.5);
  const world = {
    x: line.p1.x + (line.p2.x - line.p1.x) * clampedRatio,
    y: line.p1.y + (line.p2.y - line.p1.y) * clampedRatio,
  };
  const screen = worldToScreen(world);
  const canvasRect = canvas.getBoundingClientRect();

  return {
    world,
    screen,
    client: {
      x: canvasRect.left + screen.x,
      y: canvasRect.top + screen.y,
    },
  };
}

function getCanvasClickPointForRect(rectId, anchor = "center") {
  const rect = getEntityById(rectId);
  if (!rect || rect.type !== "rect") {
    return null;
  }

  const anchors = {
    center: { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 },
    topLeft: { x: rect.x, y: rect.y },
    topRight: { x: rect.x + rect.width, y: rect.y },
    bottomRight: { x: rect.x + rect.width, y: rect.y + rect.height },
    bottomLeft: { x: rect.x, y: rect.y + rect.height },
  };
  const world = roundWorldPoint(anchors[anchor] || anchors.center);
  const screen = worldToScreen(world);
  const canvasRect = canvas.getBoundingClientRect();

  return {
    world,
    screen,
    client: {
      x: canvasRect.left + screen.x,
      y: canvasRect.top + screen.y,
    },
  };
}

function runDebugBridgeCommand(command, args = []) {
  const api = window.DraftLiteDebug;
  if (!api || typeof api[command] !== "function") {
    throw new Error(`Unknown debug command: ${command}`);
  }
  return api[command](...(Array.isArray(args) ? args : []));
}

function createDebugBridgePayload(detail) {
  return {
    id: detail.id || String(Date.now()),
    command: detail.command || "",
    ok: false,
    result: null,
    error: "",
  };
}

function writeDebugBridgeOutput(payload) {
  const output = document.getElementById("draftliteDebugBridgeOutput");
  if (!output) {
    return;
  }

  output.dataset.lastCommandId = String(payload.id || "");
  output.dataset.lastCommand = String(payload.command || "");
  output.dataset.lastOk = payload.ok ? "true" : "false";
  output.dataset.lastResult =
    payload.result === undefined ? "" : JSON.stringify(payload.result);
  output.dataset.lastError = payload.error || "";
}

function tryDispatchDebugBridgeResult(payload) {
  if (typeof document.dispatchEvent !== "function" || typeof CustomEvent !== "function") {
    return;
  }

  document.dispatchEvent(
    new CustomEvent("draftlite:debug-result", {
      detail: payload,
    })
  );
}

function executeDebugBridgeCommand(detail) {
  const payload = createDebugBridgePayload(detail || {});

  try {
    payload.result = runDebugBridgeCommand(payload.command, detail.args || []);
    payload.ok = true;
  } catch (error) {
    payload.error = error && error.message ? error.message : String(error);
  }

  writeDebugBridgeOutput(payload);
  tryDispatchDebugBridgeResult(payload);
  return payload;
}

function readDebugBridgeRequest(output) {
  const rawArgs = output.dataset.requestArgs || "";
  let args = [];

  if (rawArgs) {
    try {
      const parsed = JSON.parse(rawArgs);
      args = Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      args = [];
    }
  }

  return {
    id: output.dataset.requestId || String(Date.now()),
    command: output.dataset.requestCommand || "",
    args,
  };
}

function bindDebugBridge() {
  document.addEventListener("draftlite:debug-command", (event) => {
    executeDebugBridgeCommand(event.detail || {});
  });

  const requestInput = document.getElementById("draftliteDebugBridgeRequest");
  const output = document.getElementById("draftliteDebugBridgeOutput");
  if (requestInput) {
    let lastRequestText = "";
    const handleRequestInput = () => {
      const requestText = requestInput.value.trim();
      if (!requestText || requestText === lastRequestText) {
        return;
      }
      lastRequestText = requestText;

      try {
        const detail = JSON.parse(requestText);
        executeDebugBridgeCommand(detail);
      } catch (error) {
        const payload = {
          id: String(Date.now()),
          command: "",
          ok: false,
          result: null,
          error: error && error.message ? error.message : String(error),
        };
        writeDebugBridgeOutput(payload);
        tryDispatchDebugBridgeResult(payload);
      }
    };

    requestInput.addEventListener("input", handleRequestInput);
    requestInput.addEventListener("change", handleRequestInput);
  }

  if (!output || typeof MutationObserver !== "function") {
    return;
  }

  let lastRequestKey = "";
  const observer = new MutationObserver(() => {
    const requestId = output.dataset.requestId || "";
    const requestCommand = output.dataset.requestCommand || "";
    if (!requestId || !requestCommand) {
      return;
    }

    const requestKey = `${requestId}:${requestCommand}:${output.dataset.requestArgs || ""}`;
    if (requestKey === lastRequestKey) {
      return;
    }
    lastRequestKey = requestKey;
    executeDebugBridgeCommand(readDebugBridgeRequest(output));
  });

  observer.observe(output, {
    attributes: true,
    attributeFilter: ["data-request-id", "data-request-command", "data-request-args"],
  });
}

function onPointerMove(event) {
  uiState.isShiftPressed = event.shiftKey;
  const screenPoint = getScreenPointFromEvent(event);
  const worldPoint = screenToWorld(screenPoint);
  const snappedWorld = resolveConstrainedSnapPoint(worldPoint, event.shiftKey);
  uiState.pointerWorld = worldPoint;
  uiState.hoverWorld = snappedWorld;
  pointerReadout.textContent = `X: ${unitsToMm(snappedWorld.x)} mm, Y: ${unitsToMm(snappedWorld.y)} mm`;

  if (uiState.panning) {
    state.view.panX = uiState.panStartView.panX + (screenPoint.x - uiState.panStartScreen.x);
    state.view.panY = uiState.panStartView.panY + (screenPoint.y - uiState.panStartScreen.y);
    draw();
    renderStatusPanel();
    return;
  }

  if (uiState.selectDragDraft) {
    updateSelectDrag(worldPoint);
    renderStatusPanel();
    return;
  }

  if (uiState.transformDraft) {
    updateTransformDraft(snappedWorld);
    renderStatusPanel();
    return;
  }

  if (uiState.gripEditDraft) {
    updateGripEdit(snappedWorld);
    renderStatusPanel();
    return;
  }

  if (uiState.selectionWindow) {
    uiState.selectionWindow.currentScreen = screenPoint;
    uiState.selectionWindow.currentWorld = worldPoint;
    draw();
    renderStatusPanel();
    return;
  }

  draw();
  renderStatusPanel();
}

function getScreenPointFromEvent(event) {
  uiState.canvasRect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - uiState.canvasRect.left,
    y: event.clientY - uiState.canvasRect.top,
  };
}

function onCanvasMouseDown(event) {
  if (event.button === 1) {
    event.preventDefault();
    startPan(event);
    return;
  }

  if (event.button !== 0) {
    return;
  }

  const screenPoint = getScreenPointFromEvent(event);
  const rawWorldPoint = screenToWorld(screenPoint);
  const worldPoint = resolveConstrainedSnapPoint(rawWorldPoint, event.shiftKey);

  if (uiState.activeTool === "line") {
    handleLineToolClick(worldPoint);
    return;
  }

  if (uiState.activeTool === "rectangle") {
    handleRectangleToolClick(worldPoint);
    return;
  }

  if (uiState.activeTool === "move" || uiState.activeTool === "copy") {
    if (!uiState.transformDraft) {
      const mode = uiState.activeTool === "move" && (event.altKey || event.ctrlKey)
        ? "copy"
        : uiState.activeTool;
      startTransformDraft(worldPoint, mode);
      return;
    }
    uiState.transformDraft.currentPoint = worldPoint;
    applyTransformDraft();
    return;
  }

  if (uiState.activeTool === "align") {
    handleAlignToolClick(roundWorldPoint(rawWorldPoint));
    return;
  }

  if (uiState.activeTool === "fillet") {
    handleFilletToolClick(roundWorldPoint(rawWorldPoint));
    return;
  }

  if (uiState.activeTool === "select") {
    if (uiState.gripEditDraft) {
      uiState.gripEditDraft.currentPoint = worldPoint;
      applyGripEdit();
      return;
    }
    const gripHit = findEditableGripAtPoint(worldPoint);
    if (gripHit) {
      startGripEdit(gripHit, worldPoint);
      return;
    }
    const selectedHit = state.selectedEntityIds
      .map(getEntityById)
      .filter((entity) => entity && canSelectEntity(entity))
      .slice()
      .reverse()
      .find((entity) => hitTestEntity(entity, roundWorldPoint(rawWorldPoint)));
    if (selectedHit) {
      startSelectDragWithMode(rawWorldPoint, event.altKey || event.ctrlKey ? "copy" : "move");
      return;
    }
    uiState.selectionWindow = {
      append: event.shiftKey,
      startScreen: screenPoint,
      currentScreen: screenPoint,
      startWorld: screenToWorld(screenPoint),
      currentWorld: screenToWorld(screenPoint),
    };
    draw();
  }
}

function handleLineToolClick(worldPoint) {
  if (!uiState.lineDraft) {
    const activeLayer = getLayerById(state.activeLayerId);
    if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
      setStatus("Choose a visible, unlocked active layer before drawing.");
      return;
    }
    beginLineDraft(worldPoint);
    return;
  }

  const createdEntity = addLineEntity(uiState.lineDraft.start, worldPoint);
  if (!createdEntity) {
    return;
  }
  beginLineDraft(
    createdEntity.p2,
    `Line segment created. Next point starts at ${formatWorldPoint(createdEntity.p2)}.`
  );
}

function handleRectangleToolClick(worldPoint) {
  if (!uiState.rectangleDraft) {
    const activeLayer = getLayerById(state.activeLayerId);
    if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
      setStatus("Choose a visible, unlocked active layer before drawing.");
      return;
    }
    beginRectangleDraft(worldPoint);
    return;
  }

  if (!addRectangleEntity(uiState.rectangleDraft.start, worldPoint)) {
    return;
  }
  endRectangleDraft("Rectangle object created.");
}

function startPan(event) {
  const now = Date.now();
  if (now - uiState.lastMiddleClickTime < DOUBLE_CLICK_MS) {
    uiState.lastMiddleClickTime = 0;
    fitAll();
    return;
  }
  uiState.lastMiddleClickTime = now;
  uiState.panning = true;
  document.body.dataset.panning = "true";
  const screenPoint = getScreenPointFromEvent(event);
  uiState.panStartScreen = screenPoint;
  uiState.panStartView = {
    panX: state.view.panX,
    panY: state.view.panY,
  };
}

function stopPan() {
  if (!uiState.panning) {
    return;
  }
  uiState.panning = false;
  delete document.body.dataset.panning;
  draw();
}

function onWindowMouseUp(event) {
  if (event.button === 1) {
    stopPan();
    return;
  }

  if (event.button !== 0) {
    return;
  }

  if (uiState.selectionWindow) {
    const selectionWindow = {
      ...uiState.selectionWindow,
      currentScreen: getScreenPointFromEvent(event),
      currentWorld: screenToWorld(getScreenPointFromEvent(event)),
    };
    const rect = getSelectionRect(selectionWindow);
    uiState.selectionWindow = null;

    if (Math.hypot(rect.width, rect.height) < CLICK_SELECT_THRESHOLD_PX) {
      selectEntityAtPoint(selectionWindow.currentWorld, selectionWindow.append);
      return;
    }

    selectEntitiesByWindow(selectionWindow);
    return;
  }

  if (uiState.selectDragDraft) {
    applySelectDrag();
    return;
  }

  stopPan();
}

function onCanvasWheel(event) {
  event.preventDefault();
  const screenPoint = getScreenPointFromEvent(event);
  const before = screenToWorld(screenPoint);
  const zoomFactor = event.deltaY < 0 ? 1.1 : 0.9;
  state.view.zoom = clampNumber(state.view.zoom * zoomFactor, MIN_ZOOM, MAX_ZOOM, state.view.zoom);
  state.view.panX = screenPoint.x - before.x * state.view.zoom;
  state.view.panY = screenPoint.y - before.y * state.view.zoom;
  draw();
  renderStatusPanel();
}

function fitAll() {
  const visibleEntities = state.entities.filter((entity) => isLayerVisible(entity.layerId));
  resizeCanvas();

  if (!visibleEntities.length) {
    state.view.zoom = 0.12;
    state.view.panX = uiState.canvasRect.width / 2;
    state.view.panY = uiState.canvasRect.height / 2;
    draw();
    renderStatusPanel();
    setStatus("Fit all reset to origin.");
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  visibleEntities.forEach((entity) => {
    if (entity.type === "line") {
      minX = Math.min(minX, entity.p1.x, entity.p2.x);
      minY = Math.min(minY, entity.p1.y, entity.p2.y);
      maxX = Math.max(maxX, entity.p1.x, entity.p2.x);
      maxY = Math.max(maxY, entity.p1.y, entity.p2.y);
    } else if (entity.type === "rect") {
      minX = Math.min(minX, entity.x);
      minY = Math.min(minY, entity.y);
      maxX = Math.max(maxX, entity.x + entity.width);
      maxY = Math.max(maxY, entity.y + entity.height);
    }
  });

  const marginPx = 48;
  const boxWidth = Math.max(1, maxX - minX);
  const boxHeight = Math.max(1, maxY - minY);
  const scaleX = (uiState.canvasRect.width - marginPx * 2) / boxWidth;
  const scaleY = (uiState.canvasRect.height - marginPx * 2) / boxHeight;
  state.view.zoom = clampNumber(Math.min(scaleX, scaleY), MIN_ZOOM, MAX_ZOOM, 0.12);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  state.view.panX = uiState.canvasRect.width / 2 - centerX * state.view.zoom;
  state.view.panY = uiState.canvasRect.height / 2 - centerY * state.view.zoom;
  draw();
  renderStatusPanel();
  setStatus("Fit all applied.");
}

function setActiveTool(tool) {
  const missingTransformTarget = (tool === "move" || tool === "copy") && !canStartTransformTool();
  if (uiState.activeTool !== tool) {
    clearTransientState();
  }
  uiState.activeTool = tool;
  syncToolButtons();
  draw();
  renderStatusPanel();
  if (missingTransformTarget) {
    setStatus("Select at least one visible, unlocked entity before using Move or Copy.");
    return;
  }
  setStatus(`${capitalize(tool)} tool active.`);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function saveJsonToFile() {
  const documentState = snapshotState();
  const blob = new Blob([JSON.stringify(documentState, null, 2)], { type: "application/json" });
  downloadBlob(blob, `draftlite-${createTimestampLabel()}.json`);
  setStatus("JSON exported.");
}

function loadJsonFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const nextState = normalizeDocument(JSON.parse(String(reader.result)));
      pushUndoState();
      state = nextState;
      clearTransientState();
      syncAfterStateChange();
      setStatus(`Loaded ${file.name}.`);
    } catch (error) {
      console.error(error);
      setStatus("JSON load failed.");
      alert("Could not load the selected JSON file.");
    } finally {
      loadJsonInput.value = "";
    }
  };
  reader.onerror = () => {
    setStatus("File read failed.");
    loadJsonInput.value = "";
  };
  reader.readAsText(file, "utf-8");
}

function exportDxf() {
  const visibleLines = state.entities.filter((entity) => isLayerVisible(entity.layerId)).flatMap((entity)=> entity.type === "line" ? [entity] : entity.type === "rect" ? rectToOutlineLines(entity) : []);

  if (!visibleLines.length) {
    setStatus("No visible lines to export.");
    return;
  }

  const visibleLayers = state.layers.filter((layer) =>
    visibleLines.some((line) => line.layerId === layer.id)
  );

  const dxfLines = [];
  dxfLines.push("0", "SECTION", "2", "HEADER");
  dxfLines.push("9", "$ACADVER", "1", "AC1009");
  dxfLines.push("9", "$INSUNITS", "70", "4");
  dxfLines.push("0", "ENDSEC");

  dxfLines.push("0", "SECTION", "2", "TABLES");
  dxfLines.push("0", "TABLE", "2", "LTYPE", "70", "1");
  dxfLines.push("0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0");
  dxfLines.push("0", "ENDTAB");
  dxfLines.push("0", "TABLE", "2", "LAYER", "70", String(visibleLayers.length));
  visibleLayers.forEach((layer) => {
    dxfLines.push("0", "LAYER");
    dxfLines.push("2", sanitizeDxfText(layer.name));
    dxfLines.push("70", "0");
    dxfLines.push("62", "7");
    dxfLines.push("6", "CONTINUOUS");
  });
  dxfLines.push("0", "ENDTAB");
  dxfLines.push("0", "ENDSEC");

  dxfLines.push("0", "SECTION", "2", "ENTITIES");
  visibleLines.forEach((line) => {
    const layer = getLayerById(line.layerId);
    dxfLines.push("0", "LINE");
    dxfLines.push("8", sanitizeDxfText(layer ? layer.name : "0"));
    dxfLines.push("10", formatDxfNumber(unitsToMm(line.p1.x)));
    dxfLines.push("20", formatDxfNumber(unitsToMm(line.p1.y)));
    dxfLines.push("30", "0.0");
    dxfLines.push("11", formatDxfNumber(unitsToMm(line.p2.x)));
    dxfLines.push("21", formatDxfNumber(unitsToMm(line.p2.y)));
    dxfLines.push("31", "0.0");
  });
  dxfLines.push("0", "ENDSEC", "0", "EOF");

  const dxfText = `${dxfLines.join("\n")}\n`;
  downloadBlob(
    new Blob([dxfText], { type: "application/dxf" }),
    `draftlite-${createTimestampLabel()}.dxf`
  );
  setStatus("DXF exported.");
}

function sanitizeDxfText(value) {
  return String(value || "0").replaceAll("\r", " ").replaceAll("\n", " ");
}

function formatDxfNumber(value) {
  return Number(value).toFixed(1);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function createTimestampLabel() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    "-",
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ];
  return parts.join("");
}

function addLayer() {
  pushUndoState();
  const layerId = createLayerId();
  const layerNumber = state.layers.length + 1;
  state.layers.push({
    id: layerId,
    name: `Layer ${layerNumber}`,
    color: layerNumber % 2 === 0 ? "#5e6b78" : "#2e3135",
    visible: true,
    locked: false,
  });
  state.activeLayerId = layerId;
  syncAfterStateChange();
  setStatus(`Added ${getLayerById(layerId).name}.`);
}

function onKeyDown(event) {
  const isMeta = event.metaKey || event.ctrlKey;
  const activeTag = document.activeElement ? document.activeElement.tagName : "";

  if (event.key === "Shift") {
    uiState.isShiftPressed = true;
    refreshPointerConstraint(true);
  }

  if (event.key === "Escape") {
    if (uiState.selectDragDraft) {
      cancelSelectDrag(`Drag ${uiState.selectDragDraft.mode} cancelled.`);
      return;
    }
    if (uiState.gripEditDraft) {
      if (uiState.gripEditDraft.numericInputBuffer) {
        clearGripPreviewTimer();
        uiState.gripEditDraft.numericInputBuffer = "";
        uiState.gripEditDraft.currentPoint = uiState.hoverWorld;
        updateGripEditStatus("Grip edit active.");
        draw();
        return;
      }
      cancelGripEdit();
      return;
    }
    if (uiState.transformDraft) {
      if (uiState.transformDraft.numericInputBuffer) {
        clearTransformPreviewTimer();
        uiState.transformDraft.numericInputBuffer = "";
        uiState.transformDraft.currentPoint = uiState.hoverWorld;
        updateTransformDraftStatus(
          `${capitalize(uiState.transformDraft.mode)} start set at ${formatWorldPoint(
            uiState.transformDraft.startPoint
          )}.`
        );
        draw();
        return;
      }
      endTransformDraft(`${capitalize(uiState.transformDraft.mode)} cancelled.`);
      return;
    }
    if (uiState.lineDraft) {
      if (uiState.lineDraft.numericInputBuffer) {
        clearLinePreviewTimer();
        uiState.lineDraft.numericInputBuffer = "";
        uiState.lineDraft.previewPoint = null;
        updateLineDraftStatus(`Line start set at ${formatWorldPoint(uiState.lineDraft.start)}.`);
        draw();
        return;
      }
      endLineDraft("Line command cancelled.");
      return;
    }
    if (uiState.rectangleDraft || uiState.activeTool === "rectangle") {
      cancelRectangle();
      return;
    }
    if (uiState.alignDraft || uiState.activeTool === "align") {
      cancelAlign();
      return;
    }
    if (uiState.filletDraft || uiState.activeTool === "fillet") {
      cancelFillet();
      return;
    }
  }

  if (uiState.gripEditDraft && activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      uiState.gripEditDraft.numericInputBuffer += event.key;
      scheduleGripNumericPreview();
      updateGripEditStatus("Grip edit active.");
      draw();
      return;
    }

    if (event.key === "Backspace") {
      if (uiState.gripEditDraft.numericInputBuffer) {
        event.preventDefault();
        uiState.gripEditDraft.numericInputBuffer = uiState.gripEditDraft.numericInputBuffer.slice(
          0,
          -1
        );
        clearGripPreviewTimer();
        if (!uiState.gripEditDraft.numericInputBuffer) {
          uiState.gripEditDraft.currentPoint = uiState.hoverWorld;
        } else {
          scheduleGripNumericPreview();
        }
        updateGripEditStatus("Grip edit active.");
        draw();
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (uiState.gripEditDraft.numericInputBuffer) {
        createGripEditFromNumericInput();
        return;
      }
      applyGripEdit();
      return;
    }
  }

  if (uiState.lineDraft && activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      uiState.lineDraft.numericInputBuffer += event.key;
      scheduleLineNumericPreview();
      updateLineDraftStatus(`Line start set at ${formatWorldPoint(uiState.lineDraft.start)}.`);
      draw();
      return;
    }

    if (event.key === "Backspace") {
      if (uiState.lineDraft.numericInputBuffer) {
        event.preventDefault();
        uiState.lineDraft.numericInputBuffer = uiState.lineDraft.numericInputBuffer.slice(0, -1);
        clearLinePreviewTimer();
        if (!uiState.lineDraft.numericInputBuffer) {
          uiState.lineDraft.previewPoint = null;
        } else {
          scheduleLineNumericPreview();
        }
        updateLineDraftStatus(`Line start set at ${formatWorldPoint(uiState.lineDraft.start)}.`);
        draw();
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (uiState.lineDraft.numericInputBuffer) {
        createLineFromNumericInput();
        return;
      }
      endLineDraft("Line command ended.");
      return;
    }
  }

  if (uiState.transformDraft && activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      uiState.transformDraft.numericInputBuffer += event.key;
      scheduleTransformNumericPreview();
      updateTransformDraftStatus(
        `${capitalize(uiState.transformDraft.mode)} start set at ${formatWorldPoint(
          uiState.transformDraft.startPoint
        )}.`
      );
      draw();
      return;
    }

    if (event.key === "Backspace") {
      if (uiState.transformDraft.numericInputBuffer) {
        event.preventDefault();
        uiState.transformDraft.numericInputBuffer = uiState.transformDraft.numericInputBuffer.slice(
          0,
          -1
        );
        clearTransformPreviewTimer();
        if (!uiState.transformDraft.numericInputBuffer) {
          uiState.transformDraft.currentPoint = uiState.hoverWorld;
        } else {
          scheduleTransformNumericPreview();
        }
        updateTransformDraftStatus(
          `${capitalize(uiState.transformDraft.mode)} start set at ${formatWorldPoint(
            uiState.transformDraft.startPoint
          )}.`
        );
        draw();
        return;
      }
    }

    if (event.key === "Enter") {
      event.preventDefault();
      if (uiState.transformDraft.numericInputBuffer) {
        createTransformFromNumericInput();
        return;
      }
      endTransformDraft(`${capitalize(uiState.transformDraft.mode)} command ended.`);
      return;
    }
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    if (activeTag === "INPUT" || activeTag === "TEXTAREA") {
      return;
    }
    event.preventDefault();
    deleteSelectedEntities();
    return;
  }

  if (isMeta && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    undo();
    return;
  }

  if ((isMeta && event.key.toLowerCase() === "y") || (isMeta && event.shiftKey && event.key.toLowerCase() === "z")) {
    event.preventDefault();
    redo();
  }
}

function onKeyUp(event) {
  if (event.key === "Shift") {
    uiState.isShiftPressed = false;
    refreshPointerConstraint(false);
  }
}

function bindEvents() {
  canvas.addEventListener("mousedown", onCanvasMouseDown);
  canvas.addEventListener("mousemove", onPointerMove);
  canvas.addEventListener("wheel", onCanvasWheel, { passive: false });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  window.addEventListener("mouseup", onWindowMouseUp);
  window.addEventListener("mousemove", onPointerMove);
  window.addEventListener("resize", () => {
    resizeCanvas();
    draw();
  });
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  toolButtons.select.addEventListener("click", () => setActiveTool("select"));
  toolButtons.line.addEventListener("click", () => setActiveTool("line"));
  toolButtons.rectangle.addEventListener("click", () => setActiveTool("rectangle"));
  toolButtons.move.addEventListener("click", () => setActiveTool("move"));
  toolButtons.copy.addEventListener("click", () => setActiveTool("copy"));
  toolButtons.align.addEventListener("click", () => setActiveTool("align"));
  toolButtons.fillet.addEventListener("click", () => setActiveTool("fillet"));
  deleteButton.addEventListener("click", deleteSelectedEntities);
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  fitAllButton.addEventListener("click", fitAll);
  saveJsonButton.addEventListener("click", saveJsonToFile);
  loadJsonButton.addEventListener("click", () => loadJsonInput.click());
  exportDxfButton.addEventListener("click", exportDxf);
  explodeButton.addEventListener("click", explodeSelectedRects);
  addLayerButton.addEventListener("click", addLayer);
  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", toggleTheme);
  }

  loadJsonInput.addEventListener("change", () => {
    const [file] = loadJsonInput.files || [];
    if (file) {
      loadJsonFromFile(file);
    }
  });
}

function initializeView() {
  resizeCanvas();
  const restored = restoreFromLocalStorage();
  if (!restored) {
    state.view.panX = uiState.canvasRect.width / 2;
    state.view.panY = uiState.canvasRect.height / 2;
  }
  syncAfterStateChange(false);
  if (!restored) {
    fitAll();
  }
  setStatus("DraftLite ready.");
}

bindEvents();
initializeTheme();
initializeView();

window.DraftLiteDebug = {
  getState() {
    return snapshotState();
  },

  getUiState() {
    return {
      activeTool: uiState.activeTool,
      selectedEntityIds: [...state.selectedEntityIds],
      lineDraft: Boolean(uiState.lineDraft),
      rectangleDraft: Boolean(uiState.rectangleDraft),
      transformDraft: Boolean(uiState.transformDraft),
      selectDragDraft: Boolean(uiState.selectDragDraft),
      gripEditDraft: Boolean(uiState.gripEditDraft),
      alignDraft: uiState.alignDraft ? deepClone(uiState.alignDraft) : null,
      filletDraft: uiState.filletDraft ? deepClone(uiState.filletDraft) : null,
      hoverWorld: deepClone(uiState.hoverWorld),
      pointerWorld: deepClone(uiState.pointerWorld),
    };
  },

  getEntities() {
    return deepClone(state.entities);
  },

  getLines() {
    return deepClone(state.entities.filter((entity) => entity.type === "line"));
  },

  getRects() {
    return deepClone(state.entities.filter((entity) => entity.type === "rect"));
  },

  getStatus() {
    return statusReadout.textContent;
  },

  undo() {
    undo();
  },

  setTool(tool) {
    setActiveTool(tool);
  },

  clearDocument() {
    pushUndoState();
    state.entities = [];
    state.selectedEntityIds = [];
    clearTransientState();
    syncAfterStateChange();
    setStatus("Document cleared by debug helper.");
  },

  loadFixture(name) {
    return loadDebugFixture(name);
  },

  createRectangleMm(x1Mm, y1Mm, x2Mm, y2Mm) {
    return createRectangleMm(x1Mm, y1Mm, x2Mm, y2Mm);
  },

  createRectMm(xMm, yMm, widthMm, heightMm, name = "Box") {
    const result = createRectangleMm(xMm, yMm, xMm + widthMm, yMm + heightMm);
    if (result) { const rect = state.entities[state.entities.length-1]; if (rect && rect.type === "rect") rect.name = name || "Box"; syncAfterStateChange(); }
    return result;
  },

  explodeSelectedRects() {
    return explodeSelectedRects();
  },

  measureLineDistanceToLine(lineId, referenceLineId) {
    return measureLineDistanceToLine(lineId, referenceLineId);
  },

  getCanvasClickPointForLine(lineId, ratio = 0.5) {
    return getCanvasClickPointForLine(lineId, ratio);
  },

  getCanvasClickPointForRect(rectId, anchor = "center") {
    return getCanvasClickPointForRect(rectId, anchor);
  },

  mmToWorldPoint(xMm, yMm) {
    return { x: mmToUnits(xMm), y: mmToUnits(yMm) };
  },

  worldToScreen(point) {
    return worldToScreen(point);
  },

  mmToScreen(xMm, yMm) {
    return worldToScreen({ x: mmToUnits(xMm), y: mmToUnits(yMm) });
  },
};

bindDebugBridge();
