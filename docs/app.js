"use strict";

const STORAGE_KEY = "draftlite.autosave.v1";
const CURRENT_FILE_VERSION = 2;
const UNIT_MM = 0.1;
const LEGACY_UNIT_MM = 0.5;
const GRID_MAJOR_MM = 1000;
const GRID_MAJOR_UNIT = mmToUnits(GRID_MAJOR_MM);
const DEFAULT_ZOOM = 0.024;
const MIN_ZOOM = 0.00008;
const MAX_ZOOM = 50;
const DOUBLE_CLICK_MS = 320;
const CLICK_SELECT_THRESHOLD_PX = 4;
const THEME_STORAGE_KEY = "draftlite.theme";

const canvas = document.getElementById("draftCanvas");
const viewport = document.getElementById("canvasViewport");
const layerList = document.getElementById("layerList");
const propertiesPanel = document.getElementById("propertiesPanel");
const toolReadout = document.getElementById("toolReadout");
const pointerReadout = document.getElementById("pointerReadout");
const zoomReadout = document.getElementById("zoomReadout");
const statusReadout = document.getElementById("statusReadout");
const loadJsonInput = document.getElementById("loadJsonInput");

const toolButtons = {
  select: document.getElementById("toolSelectButton"),
  line: document.getElementById("toolLineButton"),
  rectangle: document.getElementById("rectangleButton"),
  circle: document.getElementById("circleButton"),
  arc: document.getElementById("arcButton"),
  filledRegion: document.getElementById("filledRegionButton"),
  text: document.getElementById("textButton"),
  dimension: document.getElementById("dimensionButton"),
  matchProperties: document.getElementById("matchPropertiesButton"),
  move: document.getElementById("moveButton"),
  copy: document.getElementById("copyButton"),
  align: document.getElementById("alignButton"),
  extend: document.getElementById("extendButton"),
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
const deleteLayerButton = document.getElementById("deleteLayerButton");
const themeToggleButton = document.getElementById("themeToggleButton");
const deleteLayerDialog = document.getElementById("deleteLayerDialog");
const moveLayerObjectsButton = document.getElementById("moveLayerObjectsButton");
const deleteLayerAndObjectsButton = document.getElementById("deleteLayerAndObjectsButton");
const cancelDeleteLayerButton = document.getElementById("cancelDeleteLayerButton");
const ribbonTabs = Array.from(document.querySelectorAll(".ribbon-tab"));
const ribbonPages = Array.from(document.querySelectorAll(".ribbon-page"));

const ctx = canvas.getContext("2d");

function setStatus(message) {
  statusReadout.textContent = message;
}

let state = createInitialState();
let history = {
  undoStack: [],
  redoStack: [],
};

const uiState = {
  activeTool: "select",
  lineDraft: null,
  rectangleDraft: null,
  circleDraft: null,
  arcDraft: null,
  filledRegionDraft: null,
  transformDraft: null,
  selectDragDraft: null,
  gripEditDraft: null,
  rectEdgeEditDraft: null,
  alignDraft: null,
  extendDraft: null,
  filletDraft: null,
  dimensionDraft: null,
  matchPropertiesSourceId: null,
  selectionWindow: null,
  snapMarker: null,
  isShiftPressed: false,
  linePreviewTimer: null,
  gripPreviewTimer: null,
  transformPreviewTimer: null,
  hoverWorld: { x: 0, y: 0 },
  pointerWorld: { x: 0, y: 0 },
  hoverRectEdge: null,
  deleteLayerDialogLayerId: null,
  panning: false,
  panStartScreen: { x: 0, y: 0 },
  panStartView: { panX: 0, panY: 0 },
  lastMiddleClickTime: 0,
  canvasRect: canvas.getBoundingClientRect(),
  dpr: window.devicePixelRatio || 1,
};

function createInitialState() {
  return {
    version: CURRENT_FILE_VERSION,
    fileVersion: CURRENT_FILE_VERSION,
    unitMm: UNIT_MM,
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
      zoom: DEFAULT_ZOOM,
      panX: 0,
      panY: 0,
    },
    settings: {
      unitName: "mm",
      unitsPerMm: 1 / UNIT_MM,
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
  if (uiState.filletDraft || uiState.alignDraft || uiState.extendDraft) {
    state.selectedEntityIds = [];
  }
  uiState.lineDraft = null;
  uiState.rectangleDraft = null;
  uiState.circleDraft = null;
  uiState.arcDraft = null;
  uiState.filledRegionDraft = null;
  uiState.transformDraft = null;
  uiState.selectDragDraft = null;
  uiState.gripEditDraft = null;
  uiState.rectEdgeEditDraft = null;
  uiState.alignDraft = null;
  uiState.extendDraft = null;
  uiState.filletDraft = null;
  uiState.dimensionDraft = null;
  uiState.matchPropertiesSourceId = null;
  uiState.selectionWindow = null;
  uiState.snapMarker = null;
  uiState.hoverRectEdge = null;
  document.body.style.cursor = "";
  clearLinePreviewTimer();
  clearGripPreviewTimer();
  clearTransformPreviewTimer();
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

function clearTransformPreviewTimer() {
  if (uiState.transformPreviewTimer) {
    window.clearTimeout(uiState.transformPreviewTimer);
    uiState.transformPreviewTimer = null;
  }
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

function unitsToMm(units) {
  return units * UNIT_MM;
}

function mmToUnits(mm) {
  return Math.round(mm / UNIT_MM);
}

function legacyUnitsToCurrentUnits(value) {
  return Math.round(value * LEGACY_UNIT_MM / UNIT_MM);
}

function roundToUnit(value) {
  return Math.round(value);
}

function roundToGridUnit(value) {
  const gridUnit = Math.max(1, Number(state.settings.gridUnit) || 1);
  return roundToUnit(Math.round(value / gridUnit) * gridUnit);
}

function roundWorldPoint(point) {
  return {
    x: roundToGridUnit(point.x),
    y: roundToGridUnit(point.y),
  };
}

function roundRectBox(rect) {
  return {
    x: roundToGridUnit(rect.x),
    y: roundToGridUnit(rect.y),
    width: Math.max(1, roundToGridUnit(rect.width)),
    height: Math.max(1, roundToGridUnit(rect.height)),
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
  const candidates = state.entities
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
      if (entity.type === "circle") {
        const { center, radius } = entity;
        const points = [
          { kind: "center", point: center },
          { kind: "quadrant", point: { x: center.x + radius, y: center.y } },
          { kind: "quadrant", point: { x: center.x, y: center.y + radius } },
          { kind: "quadrant", point: { x: center.x - radius, y: center.y } },
          { kind: "quadrant", point: { x: center.x, y: center.y - radius } },
        ];
        return points.map((c) => ({ ...c, point: roundWorldPoint(c.point), distancePx: distanceScreenPx(worldPoint, c.point) }));
      }
      if (entity.type === "arc") {
        const startPoint = {
          x: roundToUnit(entity.center.x + Math.cos((entity.startAngleDeg || 0) * Math.PI / 180) * entity.radius),
          y: roundToUnit(entity.center.y + Math.sin((entity.startAngleDeg || 0) * Math.PI / 180) * entity.radius),
        };
        const endPoint = {
          x: roundToUnit(entity.center.x + Math.cos((entity.endAngleDeg || 0) * Math.PI / 180) * entity.radius),
          y: roundToUnit(entity.center.y + Math.sin((entity.endAngleDeg || 0) * Math.PI / 180) * entity.radius),
        };
        const start = ((entity.startAngleDeg % 360) + 360) % 360;
        const end = ((entity.endAngleDeg % 360) + 360) % 360;
        const sweep = ((end - start) + 360) % 360 || 360;
        const midDeg = (start + sweep / 2) % 360;
        const midPoint = {
          x: roundToUnit(entity.center.x + Math.cos(midDeg * Math.PI / 180) * entity.radius),
          y: roundToUnit(entity.center.y + Math.sin(midDeg * Math.PI / 180) * entity.radius),
        };
        return [
          { kind: "center", point: roundWorldPoint(entity.center) },
          { kind: "endpoint", point: startPoint },
          { kind: "endpoint", point: endPoint },
          { kind: "midpoint", point: midPoint },
        ].map((c) => ({ ...c, distancePx: distanceScreenPx(worldPoint, c.point) }));
      }
      if (entity.type === "filledRegion") {
        const candidates = [];
        entity.points.forEach((point, index) => {
          candidates.push({ kind: "endpoint", point: roundWorldPoint(point) });
          const next = entity.points[(index + 1) % entity.points.length];
          candidates.push({ kind: "midpoint", point: roundWorldPoint({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }) });
        });
        return candidates.map((c) => ({ ...c, distancePx: distanceScreenPx(worldPoint, c.point) }));
      }
      if (entity.type === "text") {
        const point = { x: entity.x, y: entity.y };
        return [{ kind: "endpoint", point, distancePx: distanceScreenPx(worldPoint, point) }];
      }
      if (entity.type === "dimension") {
        return [entity.p1, entity.p2, entity.offsetPoint].map((point) => ({
          kind: "endpoint",
          point,
          distancePx: distanceScreenPx(worldPoint, point),
        }));
      }
      return [];
    });
  candidates.push({
    kind: "origin",
    point: { x: 0, y: 0 },
    distancePx: distanceScreenPx(worldPoint, { x: 0, y: 0 }),
  });
  return candidates;
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
    if (
      best &&
      candidate.distancePx === best.distancePx &&
      candidate.kind === "origin" &&
      best.kind !== "origin"
    ) {
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
    constrainedWorld = applyOrthoConstraint(uiState.gripEditDraft.startPoint, constrainedWorld, orthoEnabled);
  }

  return getSnapPoint(constrainedWorld);
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
  uiState.dimensionDraft = null;
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

function cancelExtend(message = "Extend cancelled.") {
  state.selectedEntityIds = [];
  uiState.extendDraft = null;
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

function beginCircleDraft(centerPoint) {
  uiState.circleDraft = { center: roundWorldPoint(centerPoint) };
  setStatus(`Circle center set at ${formatWorldPoint(uiState.circleDraft.center)}. Pick radius point.`);
  draw();
}

function beginArcDraft(centerPoint) {
  uiState.arcDraft = { step: 1, center: roundWorldPoint(centerPoint) };
  setStatus(`Arc center set at ${formatWorldPoint(uiState.arcDraft.center)}. Pick start direction/radius.`);
  draw();
}

function beginFilledRegionDraft(firstPoint) {
  uiState.filledRegionDraft = { points: [roundWorldPoint(firstPoint)] };
  setStatus("Filled Region: pick next point. Enter or double-click to close.");
  draw();
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

function canDrawOnActiveLayer() {
  const activeLayer = getLayerById(state.activeLayerId);
  if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
    setStatus("Choose a visible, unlocked active layer before drawing.");
    return false;
  }
  return true;
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

function normalizeUnitValue(value, legacyUnits) {
  const number = Number(value) || 0;
  return legacyUnits ? legacyUnitsToCurrentUnits(number) : roundToUnit(number);
}

function normalizePoint(point, legacyUnits) {
  const sourcePoint = point || {};
  return {
    x: normalizeUnitValue(sourcePoint.x, legacyUnits),
    y: normalizeUnitValue(sourcePoint.y, legacyUnits),
  };
}

function getDocumentUnitMm(raw, source) {
  const candidates = [
    source && source.unitMm,
    raw && raw.unitMm,
    source && source.settings && source.settings.unitMm,
    raw && raw.settings && raw.settings.unitMm,
  ];
  const unitMm = candidates.map(Number).find((value) => Number.isFinite(value) && value > 0);
  return unitMm || LEGACY_UNIT_MM;
}

function shouldMigrateLegacyUnits(raw, source) {
  const unitMm = getDocumentUnitMm(raw, source);
  const hasExplicitCurrentUnit = unitMm === UNIT_MM;
  const hasFileVersion = Number(source && source.fileVersion) || Number(raw && raw.fileVersion);
  return !hasExplicitCurrentUnit || !hasFileVersion || unitMm === LEGACY_UNIT_MM;
}

function normalizeEntity(entity, options = {}) {
  if (!entity || !entity.type) {
    return null;
  }
  const legacyUnits = Boolean(options.legacyUnits);
  if (entity.type === "line") {
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "line",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      p1: normalizePoint(entity.p1, legacyUnits),
      p2: normalizePoint(entity.p2, legacyUnits),
      ...getNormalizedEntityStyleProps(entity, { supportsStroke: true }),
    };
  }
  if (entity.type === "rect") {
    const x = normalizeUnitValue(entity.x, legacyUnits);
    const y = normalizeUnitValue(entity.y, legacyUnits);
    const width = normalizeUnitValue(entity.width, legacyUnits);
    const height = normalizeUnitValue(entity.height, legacyUnits);
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
      ...getNormalizedEntityStyleProps(entity, { supportsStroke: true, supportsFill: true }),
    };
  }
  if (entity.type === "circle") {
    const radius = normalizeUnitValue(entity.radius, legacyUnits);
    if (radius <= 0) {
      return null;
    }
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "circle",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      center: normalizePoint(entity.center, legacyUnits),
      radius,
      ...getNormalizedEntityStyleProps(entity, { supportsStroke: true }),
    };
  }
  if (entity.type === "arc") {
    const radius = normalizeUnitValue(entity.radius, legacyUnits);
    if (radius <= 0) {
      return null;
    }
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "arc",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      center: normalizePoint(entity.center, legacyUnits),
      radius,
      startAngleDeg: Number(entity.startAngleDeg) || 0,
      endAngleDeg: Number(entity.endAngleDeg) || 90,
      ...getNormalizedEntityStyleProps(entity, { supportsStroke: true }),
    };
  }
  if (entity.type === "filledRegion") {
    const points = Array.isArray(entity.points)
      ? entity.points.map((point) => normalizePoint(point, legacyUnits))
      : [];
    if (points.length < 3) {
      return null;
    }
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "filledRegion",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      points,
      ...getNormalizedEntityStyleProps(entity, { supportsStroke: true, supportsFill: true }),
    };
  }
  if (entity.type === "text") {
    const textValue = typeof entity.text === "string" ? entity.text : "";
    if (!textValue.trim()) {
      return null;
    }
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "text",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      x: normalizeUnitValue(entity.x, legacyUnits),
      y: normalizeUnitValue(entity.y, legacyUnits),
      text: textValue,
      height: Math.max(1, normalizeUnitValue(entity.height ?? 250, legacyUnits)),
      rotation: Number(entity.rotation) || 0,
      align: ["left", "center", "right"].includes(entity.align) ? entity.align : "left",
      ...getNormalizedEntityStyleProps(entity, { supportsStroke: true }),
    };
  }

  if (entity.type === "dimension") {
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "dimension",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      p1: normalizePoint(entity.p1, legacyUnits),
      p2: normalizePoint(entity.p2, legacyUnits),
      offsetPoint: normalizePoint(entity.offsetPoint, legacyUnits),
      textOverride: typeof entity.textOverride === "string" ? entity.textOverride : "",
      textHeight: Math.max(1, normalizeUnitValue(entity.textHeight ?? 250, legacyUnits)),
      tickSize: Math.max(1, normalizeUnitValue(entity.tickSize ?? 250, legacyUnits)),
      precision: Math.max(0, Math.min(3, Math.round(Number(entity.precision) || 0))),
      ...getNormalizedEntityStyleProps(entity, { supportsStroke: true }),
    };
  }
  return null;
}

function normalizeDocument(raw) {
  const source = raw && raw.state ? raw.state : raw;
  const base = createInitialState();
  const legacyUnits = shouldMigrateLegacyUnits(raw, source);
  const normalizedLayers = Array.isArray(source && source.layers)
    ? source.layers.map(normalizeLayer)
    : base.layers;

  const layerIds = new Set(normalizedLayers.map((layer) => layer.id));
  const normalizedEntities = Array.isArray(source && source.entities)
    ? source.entities
        .map((entity) => normalizeEntity(entity, { legacyUnits }))
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
    version: CURRENT_FILE_VERSION,
    fileVersion: CURRENT_FILE_VERSION,
    unitMm: UNIT_MM,
    entities: normalizedEntities,
    layers: normalizedLayers.length ? normalizedLayers : base.layers,
    activeLayerId,
    selectedEntityIds,
    view: {
      zoom: clampNumber(
        legacyUnits && source && source.view && Number.isFinite(Number(source.view.zoom))
          ? Number(source.view.zoom) * UNIT_MM / LEGACY_UNIT_MM
          : source && source.view && source.view.zoom,
        MIN_ZOOM,
        MAX_ZOOM,
        base.view.zoom
      ),
      panX: Number(source && source.view && source.view.panX) || base.view.panX,
      panY: Number(source && source.view && source.view.panY) || base.view.panY,
    },
    settings: {
      unitName: "mm",
      unitsPerMm: 1 / UNIT_MM,
      gridUnit: Math.max(1, roundToUnit(Number(source && source.settings && source.settings.gridUnit) || base.settings.gridUnit)),
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

function isDeleteLayerDialogOpen() {
  return Boolean(uiState.deleteLayerDialogLayerId && deleteLayerDialog && !deleteLayerDialog.hidden);
}

function closeDeleteLayerDialog() {
  uiState.deleteLayerDialogLayerId = null;
  if (deleteLayerDialog) {
    deleteLayerDialog.hidden = true;
  }
}

function showDeleteLayerDialog(layerId) {
  const layer = getLayerById(layerId);
  if (!layer || !deleteLayerDialog) {
    return;
  }
  uiState.deleteLayerDialogLayerId = layerId;
  deleteLayerDialog.hidden = false;
}

function getTopLayerIdExcluding(layerId) {
  const targetLayer = state.layers.find((layer) => layer.id !== layerId);
  return targetLayer ? targetLayer.id : null;
}

function pruneSelectedEntityIds() {
  const entityIds = new Set(state.entities.map((entity) => entity.id));
  state.selectedEntityIds = state.selectedEntityIds.filter((entityId) => entityIds.has(entityId));
}

function moveEntitiesToLayer(fromLayerId, toLayerId) {
  state.entities.forEach((entity) => {
    if (entity.layerId === fromLayerId) {
      entity.layerId = toLayerId;
    }
  });
}

function removeLayerAndOptionallyEntities(layerId, mode) {
  const layer = getLayerById(layerId);
  if (!layer) {
    closeDeleteLayerDialog();
    return false;
  }

  if (state.layers.length <= 1) {
    closeDeleteLayerDialog();
    window.alert("At least one layer is required.");
    return false;
  }

  const moveTargetLayerId = mode === "move" ? getTopLayerIdExcluding(layerId) : null;
  if (mode === "move" && !moveTargetLayerId) {
    closeDeleteLayerDialog();
    window.alert("At least one layer is required.");
    return false;
  }

  pushUndoState();

  if (mode === "move") {
    moveEntitiesToLayer(layerId, moveTargetLayerId);
    state.activeLayerId = moveTargetLayerId;
  } else if (mode === "delete") {
    state.entities = state.entities.filter((entity) => entity.layerId !== layerId);
  } else {
    closeDeleteLayerDialog();
    return false;
  }

  state.layers = state.layers.filter((entry) => entry.id !== layerId);
  if (mode === "delete") {
    state.activeLayerId = state.layers[0] ? state.layers[0].id : null;
  }
  pruneSelectedEntityIds();
  closeDeleteLayerDialog();
  syncAfterStateChange();
  setStatus(
    mode === "move"
      ? `Deleted ${layer.name} and moved its objects to ${getLayerById(state.activeLayerId)?.name || "the top layer"}.`
      : `Deleted ${layer.name} and its objects.`
  );
  return true;
}

function deleteActiveLayer() {
  const layer = getLayerById(state.activeLayerId);
  if (!layer) {
    setStatus("No active layer.");
    return false;
  }
  if (state.layers.length <= 1) {
    window.alert("At least one layer is required.");
    setStatus("At least one layer is required.");
    return false;
  }
  showDeleteLayerDialog(layer.id);
  setStatus(`Choose how to delete ${layer.name}.`);
  return true;
}

function normalizeColor(color) {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }
  return "#2e3135";
}

function normalizeOptionalColor(color) {
  if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) {
    return color;
  }
  return "";
}

function normalizeOptionalOpacity(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }
  return clampNumber(numeric, 0, 1, 1);
}

function normalizeOptionalStrokeWidth(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return undefined;
  }
  return numeric;
}

function normalizeOptionalDash(value) {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const dash = value
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part) && part >= 0);
  return dash.length ? dash : undefined;
}

function getNormalizedEntityStyleProps(entity, options = {}) {
  const style = {};
  if (options.supportsStroke) {
    style.color = normalizeOptionalColor(entity.color || entity.strokeColor || entity.lineColor || "");
    const opacity = normalizeOptionalOpacity(entity.opacity);
    if (opacity !== undefined) {
      style.opacity = opacity;
    }
    const lineWidth = normalizeOptionalStrokeWidth(entity.lineWidth ?? entity.strokeWidth);
    if (lineWidth !== undefined) {
      style.lineWidth = lineWidth;
    }
    if (typeof entity.lineStyle === "string" && entity.lineStyle.trim()) {
      style.lineStyle = entity.lineStyle.trim();
    }
    if (typeof entity.dashed === "boolean") {
      style.dashed = entity.dashed;
    }
    const dash = normalizeOptionalDash(entity.dash);
    if (dash) {
      style.dash = dash;
    }
  }
  if (options.supportsFill) {
    style.fill = entity.fill !== false;
    style.fillColor = normalizeOptionalColor(entity.fillColor || "");
    const fillAlpha = normalizeOptionalOpacity(entity.fillAlpha);
    if (fillAlpha !== undefined) {
      style.fillAlpha = fillAlpha;
    }
  }
  return style;
}

function getEntityStrokeColor(entity) {
  const layer = getLayerById(entity.layerId);
  return normalizeColor(entity.color || layer?.color || "#2e3135");
}

function getEntityOpacity(entity) {
  const opacity = normalizeOptionalOpacity(entity.opacity);
  return opacity === undefined ? 1 : opacity;
}

function getEntityStrokeWidth(entity, normalWidth, selectedWidth, isSelected) {
  const explicitWidth = normalizeOptionalStrokeWidth(entity.lineWidth ?? entity.strokeWidth);
  if (explicitWidth === undefined) {
    return isSelected ? selectedWidth : normalWidth;
  }
  return isSelected
    ? Math.max(selectedWidth, explicitWidth + 0.8)
    : explicitWidth;
}

function getEntityStrokeDash(entity) {
  const explicitDash = normalizeOptionalDash(entity.dash);
  if (explicitDash) {
    return explicitDash;
  }
  if (entity.dashed === true || entity.lineStyle === "dashed") {
    return [8, 6];
  }
  return [];
}

function getEntityFillOpacity(entity, baseAlpha) {
  const fillAlpha = normalizeOptionalOpacity(entity.fillAlpha);
  if (fillAlpha !== undefined) {
    return clampNumber(baseAlpha * fillAlpha, 0, 1, baseAlpha);
  }
  return clampNumber(baseAlpha * getEntityOpacity(entity), 0, 1, baseAlpha);
}

function supportsStrokeMatchedProperties(entity) {
  return Boolean(entity) && ["line", "rect", "circle", "arc", "filledRegion", "text", "dimension"].includes(entity.type);
}

function supportsFillMatchedProperties(entity) {
  return Boolean(entity) && (entity.type === "rect" || entity.type === "filledRegion");
}

function supportsMatchedProperties(entity) {
  return supportsStrokeMatchedProperties(entity) || supportsFillMatchedProperties(entity);
}

function getTopmostSelectableEntityAtPoint(worldPoint) {
  return state.entities
    .filter(canSelectEntity)
    .slice()
    .reverse()
    .find((entity) => hitTestEntity(entity, worldPoint)) || null;
}

function createMatchedStylePatch(sourceEntity, targetEntity) {
  if (!supportsMatchedProperties(sourceEntity) || !supportsMatchedProperties(targetEntity)) {
    return null;
  }

  const patch = {};
  if (supportsStrokeMatchedProperties(targetEntity) && supportsStrokeMatchedProperties(sourceEntity)) {
    patch.color = getEntityStrokeColor(sourceEntity);
    const opacity = normalizeOptionalOpacity(sourceEntity.opacity);
    if (opacity !== undefined) {
      patch.opacity = opacity;
    }
    const lineWidth = normalizeOptionalStrokeWidth(sourceEntity.lineWidth ?? sourceEntity.strokeWidth);
    if (lineWidth !== undefined) {
      patch.lineWidth = lineWidth;
    }
    if (typeof sourceEntity.lineStyle === "string" && sourceEntity.lineStyle.trim()) {
      patch.lineStyle = sourceEntity.lineStyle.trim();
    }
    if (typeof sourceEntity.dashed === "boolean") {
      patch.dashed = sourceEntity.dashed;
    }
    const dash = normalizeOptionalDash(sourceEntity.dash);
    if (dash) {
      patch.dash = [...dash];
    }
  }

  if (supportsFillMatchedProperties(targetEntity) && supportsFillMatchedProperties(sourceEntity)) {
    patch.fill = sourceEntity.fill !== false;
    patch.fillColor = normalizeColor(sourceEntity.fillColor || getEntityStrokeColor(sourceEntity));
    const fillAlpha = normalizeOptionalOpacity(sourceEntity.fillAlpha);
    if (fillAlpha !== undefined) {
      patch.fillAlpha = fillAlpha;
    }
  }

  return Object.keys(patch).length ? patch : null;
}

function applyMatchedStylePatch(targetEntity, patch) {
  if (!targetEntity || !patch) {
    return false;
  }
  Object.entries(patch).forEach(([key, value]) => {
    targetEntity[key] = Array.isArray(value) ? [...value] : value;
  });
  return true;
}

function cancelMatchProperties(message = "Match Properties cancelled.") {
  uiState.matchPropertiesSourceId = null;
  uiState.activeTool = "select";
  syncAfterStateChange(false);
  setStatus(message);
}

function handleMatchPropertiesToolClick(worldPoint) {
  const hit = getTopmostSelectableEntityAtPoint(worldPoint);
  if (!hit) {
    setStatus("No object selected.");
    return;
  }
  if (!supportsMatchedProperties(hit)) {
    setStatus("Target does not support matched properties.");
    return;
  }

  if (!uiState.matchPropertiesSourceId) {
    uiState.matchPropertiesSourceId = hit.id;
    state.selectedEntityIds = [hit.id];
    syncAfterStateChange();
    setStatus("Select target object.");
    return;
  }

  const sourceEntity = getEntityById(uiState.matchPropertiesSourceId);
  if (!sourceEntity || !supportsMatchedProperties(sourceEntity)) {
    uiState.matchPropertiesSourceId = null;
    state.selectedEntityIds = [];
    syncAfterStateChange();
    setStatus("Select source object.");
    return;
  }

  const patch = createMatchedStylePatch(sourceEntity, hit);
  if (!patch) {
    setStatus("Target does not support matched properties.");
    return;
  }

  pushUndoState();
  applyMatchedStylePatch(hit, patch);
  state.selectedEntityIds = [hit.id];
  syncAfterStateChange();
  setStatus("Properties matched.");
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
  if (entity.type === "text") {
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("Text"));
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "Text layer updated."));
    const textInput = document.createElement("input");
    textInput.type = "text";
    textInput.value = entity.text || "";
    textInput.addEventListener("change", () => {
      const nextText = textInput.value.trim();
      if (!nextText) {
        textInput.value = entity.text || "";
        setStatus("Text cannot be empty.");
        return;
      }
      pushUndoState();
      entity.text = nextText;
      syncAfterStateChange();
    });
    addPropertyRow(generalGrid, "Text", textInput);

    const geometryGrid = appendSection("Geometry");
    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.value = String(unitsToMm(entity.height));
    heightInput.addEventListener("change", () => {
      const heightMm = Number(heightInput.value);
      if (!Number.isFinite(heightMm) || heightMm <= 0) {
        heightInput.value = String(unitsToMm(entity.height));
        setStatus("Height mm must be greater than zero.");
        return;
      }
      pushUndoState();
      entity.height = mmToUnits(heightMm);
      syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Height mm", heightInput);

    const appearanceGrid = appendSection("Appearance");
    const alignSelect = document.createElement("select");
    ["left", "center", "right"].forEach((align) => {
      const option = document.createElement("option");
      option.value = align;
      option.textContent = align;
      option.selected = entity.align === align;
      alignSelect.appendChild(option);
    });
    alignSelect.addEventListener("change", () => {
      pushUndoState();
      entity.align = alignSelect.value;
      syncAfterStateChange();
    });
    addPropertyRow(appearanceGrid, "Align", alignSelect);
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = normalizeColor(entity.color || getLayerById(entity.layerId)?.color);
    colorInput.addEventListener("change", () => {
      pushUndoState();
      entity.color = colorInput.value;
      syncAfterStateChange();
    });
    addPropertyRow(appearanceGrid, "Color", colorInput);
    return;
  }
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
  if (entity.type === "circle") {
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("Circle"));
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "Circle layer updated."));

    const geometryGrid = appendSection("Geometry");
    const radiusInput = document.createElement("input");
    radiusInput.type = "number";
    radiusInput.value = String(unitsToMm(entity.radius || 0));
    radiusInput.addEventListener("change", () => {
      const radiusMm = Number(radiusInput.value);
      if (!Number.isFinite(radiusMm) || radiusMm <= 0) {
        radiusInput.value = String(unitsToMm(entity.radius || 0));
        setStatus("Radius mm must be greater than zero.");
        return;
      }
      pushUndoState();
      entity.radius = Math.max(1, mmToUnits(radiusMm));
      syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Radius mm", radiusInput);
    return;
  }
  if (entity.type === "arc") {
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("Arc"));
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "Arc layer updated."));

    const geometryGrid = appendSection("Geometry");
    const normalizeAngle = (value) => ((value % 360) + 360) % 360;

    const radiusInput = document.createElement("input");
    radiusInput.type = "number";
    radiusInput.value = String(unitsToMm(entity.radius || 0));
    radiusInput.addEventListener("change", () => {
      const radiusMm = Number(radiusInput.value);
      if (!Number.isFinite(radiusMm) || radiusMm <= 0) {
        radiusInput.value = String(unitsToMm(entity.radius || 0));
        setStatus("Radius mm must be greater than zero.");
        return;
      }
      pushUndoState();
      entity.radius = Math.max(1, mmToUnits(radiusMm));
      syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Radius mm", radiusInput);

    const startAngleInput = document.createElement("input");
    startAngleInput.type = "number";
    startAngleInput.value = String(normalizeAngle(entity.startAngleDeg || 0));
    startAngleInput.addEventListener("change", () => {
      const angle = Number(startAngleInput.value);
      if (!Number.isFinite(angle)) {
        startAngleInput.value = String(normalizeAngle(entity.startAngleDeg || 0));
        setStatus("Start Angle deg must be a valid number.");
        return;
      }
      pushUndoState();
      entity.startAngleDeg = normalizeAngle(angle);
      syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Start Angle deg", startAngleInput);

    const endAngleInput = document.createElement("input");
    endAngleInput.type = "number";
    endAngleInput.value = String(normalizeAngle(entity.endAngleDeg || 0));
    endAngleInput.addEventListener("change", () => {
      const angle = Number(endAngleInput.value);
      if (!Number.isFinite(angle)) {
        endAngleInput.value = String(normalizeAngle(entity.endAngleDeg || 0));
        setStatus("End Angle deg must be a valid number.");
        return;
      }
      pushUndoState();
      entity.endAngleDeg = normalizeAngle(angle);
      syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "End Angle deg", endAngleInput);
    return;
  }
  if (entity.type === "filledRegion") {
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("Filled Region"));
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "Filled Region layer updated."));
    addPropertyRow(generalGrid, "Vertex Count", createReadOnlyText(String((entity.points || []).length)));

    const appearanceGrid = appendSection("Appearance");
    const fill = document.createElement("input");
    fill.type = "checkbox";
    fill.checked = entity.fill !== false;
    fill.addEventListener("change", () => {
      pushUndoState();
      entity.fill = fill.checked;
      syncAfterStateChange();
    });
    addPropertyRow(appearanceGrid, "Fill", fill);

    const fillColorInput = document.createElement("input");
    fillColorInput.type = "color";
    fillColorInput.value = normalizeColor(entity.fillColor || getLayerById(entity.layerId)?.color);
    fillColorInput.addEventListener("change", () => {
      pushUndoState();
      entity.fillColor = normalizeColor(fillColorInput.value);
      syncAfterStateChange();
    });
    addPropertyRow(appearanceGrid, "Fill Color", fillColorInput);
    return;
  }

  if (entity.type === "dimension") {
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("Dimension"));
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "Dimension layer updated."));

    const textOverrideInput = document.createElement("input");
    textOverrideInput.type = "text";
    textOverrideInput.value = entity.textOverride || "";
    textOverrideInput.addEventListener("change", () => {
      pushUndoState();
      entity.textOverride = textOverrideInput.value;
      syncAfterStateChange();
    });
    addPropertyRow(generalGrid, "Text Override", textOverrideInput);

    const geometryGrid = appendSection("Geometry");
    const precisionInput = document.createElement("input");
    precisionInput.type = "number";
    precisionInput.min = "0";
    precisionInput.max = "3";
    precisionInput.step = "1";
    precisionInput.value = String(entity.precision ?? 0);
    precisionInput.addEventListener("change", () => {
      const next = Math.round(Number(precisionInput.value));
      if (!Number.isFinite(next) || next < 0 || next > 3) {
        precisionInput.value = String(entity.precision ?? 0);
        setStatus("Precision must be an integer from 0 to 3.");
        return;
      }
      pushUndoState();
      entity.precision = next;
      syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Precision", precisionInput);

    const textHeightInput = document.createElement("input");
    textHeightInput.type = "number";
    textHeightInput.value = String(unitsToMm(entity.textHeight || 250));
    textHeightInput.addEventListener("change", () => {
      const nextMm = Number(textHeightInput.value);
      if (!Number.isFinite(nextMm) || nextMm <= 0) {
        textHeightInput.value = String(unitsToMm(entity.textHeight || 250));
        setStatus("Text Height mm must be greater than zero.");
        return;
      }
      pushUndoState();
      entity.textHeight = Math.max(1, mmToUnits(nextMm));
      syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Text Height mm", textHeightInput);

    const tickSizeInput = document.createElement("input");
    tickSizeInput.type = "number";
    tickSizeInput.value = String(unitsToMm(entity.tickSize || 250));
    tickSizeInput.addEventListener("change", () => {
      const nextMm = Number(tickSizeInput.value);
      if (!Number.isFinite(nextMm) || nextMm <= 0) {
        tickSizeInput.value = String(unitsToMm(entity.tickSize || 250));
        setStatus("Tick Size mm must be greater than zero.");
        return;
      }
      pushUndoState();
      entity.tickSize = Math.max(1, mmToUnits(nextMm));
      syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Tick Size mm", tickSizeInput);

    const appearanceGrid = appendSection("Appearance");
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = normalizeColor(entity.color || getLayerById(entity.layerId)?.color);
    colorInput.addEventListener("change", () => {
      pushUndoState();
      entity.color = colorInput.value;
      syncAfterStateChange();
    });
    addPropertyRow(appearanceGrid, "Color", colorInput);
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
  return undefined;
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
    } else if (entity.type === "circle") {
      drawCircleEntity(entity);
    } else if (entity.type === "arc") {
      drawArcEntity(entity);
    } else if (entity.type === "filledRegion") {
      drawFilledRegionEntity(entity);
    } else if (entity.type === "text") {
      drawTextEntity(entity);
    } else if (entity.type === "dimension") {
      drawDimensionEntity(entity);
    }
  });

  if (uiState.lineDraft) {
    drawDraftLine(uiState.lineDraft.start, uiState.lineDraft.previewPoint || uiState.hoverWorld);
  }

  if (uiState.rectangleDraft) {
    drawDraftRectangle(uiState.rectangleDraft.start, uiState.hoverWorld);
  }
  if (uiState.circleDraft) {
    drawDraftCircle(uiState.circleDraft.center, uiState.hoverWorld);
  }
  if (uiState.arcDraft) {
    drawDraftArc(uiState.arcDraft);
  }
  if (uiState.filledRegionDraft) {
    drawDraftFilledRegion(uiState.filledRegionDraft);
  }

  if (uiState.dimensionDraft) {
    drawDimensionDraftPreview(uiState.dimensionDraft);
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
  if (uiState.rectEdgeEditDraft) {
    const previewRect = getResizedRectFromDraft(uiState.rectEdgeEditDraft, uiState.rectEdgeEditDraft.currentPoint);
    const previewEntity = {
      ...getEntityById(uiState.rectEdgeEditDraft.entityId),
      ...previewRect,
    };
    drawRectEntity(previewEntity);
    const previewEdge = getRectEdges(previewEntity).find((edgeDef) => edgeDef.edge === uiState.rectEdgeEditDraft.edge);
    if (previewEdge) {
      const s = worldToScreen(previewEdge.p1);
      const e = worldToScreen(previewEdge.p2);
      ctx.save();
      ctx.strokeStyle = "rgba(194, 105, 62, 0.9)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.stroke();
      ctx.restore();
    }
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
  const zoom = state.view.zoom;
  const showFineGrid = zoom >= 0.004;
  const showMajorGrid = zoom >= 0.001;
  if (!showMajorGrid) {
    return;
  }
  const worldTopLeft = screenToWorld({ x: 0, y: 0 });
  const worldBottomRight = screenToWorld({ x: width, y: height });
  const gridStep = showFineGrid ? GRID_MAJOR_UNIT : GRID_MAJOR_UNIT * 4;
  const startX = Math.floor(worldTopLeft.x / gridStep) * gridStep;
  const endX = Math.ceil(worldBottomRight.x / gridStep) * gridStep;
  const startY = Math.floor(worldTopLeft.y / gridStep) * gridStep;
  const endY = Math.ceil(worldBottomRight.y / gridStep) * gridStep;
  const step = showFineGrid && zoom * GRID_MAJOR_UNIT < 14 ? GRID_MAJOR_UNIT * 2 : gridStep;
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
  ctx.globalAlpha = getEntityOpacity(entity);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(getEntityStrokeDash(entity));

  if (isSelected) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.22)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(screenP1.x, screenP1.y);
    ctx.lineTo(screenP2.x, screenP2.y);
    ctx.stroke();
  }

  ctx.strokeStyle = getEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
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

function drawDraftCircle(centerPoint, radiusPoint) {
  const center = worldToScreen(roundWorldPoint(centerPoint));
  const radiusUnits = Math.max(1, roundToUnit(Math.hypot(radiusPoint.x - centerPoint.x, radiusPoint.y - centerPoint.y)));
  const radiusPx = Math.max(1, radiusUnits * state.view.zoom);
  ctx.save();
  ctx.strokeStyle = "rgba(194, 105, 62, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawDraftArc(draft) {
  if (!draft || !draft.center) return;
  const center = worldToScreen(draft.center);
  const current = uiState.hoverWorld;
  const radiusUnits = draft.radius || Math.max(1, roundToUnit(Math.hypot(current.x - draft.center.x, current.y - draft.center.y)));
  const radiusPx = Math.max(1, radiusUnits * state.view.zoom);
  const startAngle = draft.startAngleDeg ?? snapAngleTo90(angleDegFromCenter(draft.center, current));
  const endAngle = draft.step === 2 ? snapAngleTo90(angleDegFromCenter(draft.center, current)) : startAngle;
  const end = endAngle === startAngle ? (startAngle + 270) % 360 : endAngle;
  ctx.save();
  ctx.strokeStyle = "rgba(194, 105, 62, 0.85)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, startAngle * Math.PI / 180, end * Math.PI / 180);
  ctx.stroke();
  ctx.restore();
}

function drawDraftFilledRegion(draft) {
  if (!draft || !Array.isArray(draft.points) || !draft.points.length) return;
  const points = [...draft.points, roundWorldPoint(uiState.hoverWorld)].map(worldToScreen);
  ctx.save();
  ctx.strokeStyle = "rgba(194, 105, 62, 0.9)";
  ctx.lineWidth = 1.4;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
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
  ctx.globalAlpha = getEntityOpacity(entity);
  ctx.setLineDash(getEntityStrokeDash(entity));
  if (entity.fill !== false) {
    ctx.fillStyle = getEntityFillStyle(entity, layer.color, getEntityFillOpacity(entity, isSelected ? 0.26 : 0.18));
    ctx.fillRect(p1.x, p1.y, w, h);
  }
  if (isSelected) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.28)";
    ctx.lineWidth = 10;
    ctx.strokeRect(p1.x, p1.y, w, h);
  }
  ctx.strokeStyle = getEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  ctx.strokeRect(p1.x, p1.y, w, h);
  if (uiState.hoverRectEdge && uiState.hoverRectEdge.entityId === entity.id) {
    const hoveredEdge = getRectEdges(entity).find((edge) => edge.edge === uiState.hoverRectEdge.edge);
    if (hoveredEdge) {
      const start = worldToScreen(hoveredEdge.p1);
      const end = worldToScreen(hoveredEdge.p2);
      ctx.strokeStyle = "rgba(194, 105, 62, 0.82)";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.lineTo(end.x, end.y);
      ctx.stroke();
    }
  }
  if (isSelected) {
    ctx.fillStyle = "#fffaf2";
    ctx.strokeStyle = "#c2693e";
    getRectSnapPoints(entity).filter((g)=>g.kind!=="center").forEach((g)=>{ const s=worldToScreen(g.point); ctx.beginPath(); ctx.arc(s.x,s.y,4,0,Math.PI*2); ctx.fill(); ctx.stroke();});
  }
  ctx.restore();
}

function drawCircleEntity(entity) {
  const center = worldToScreen(entity.center);
  const radiusPx = Math.max(1, Math.abs(entity.radius * state.view.zoom));
  const isSelected = state.selectedEntityIds.includes(entity.id);
  ctx.save();
  ctx.globalAlpha = getEntityOpacity(entity);
  ctx.setLineDash(getEntityStrokeDash(entity));
  if (isSelected) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.34)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = getEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawArcEntity(entity) {
  const center = worldToScreen(entity.center);
  const radiusPx = Math.max(1, Math.abs(entity.radius * state.view.zoom));
  const isSelected = state.selectedEntityIds.includes(entity.id);
  const startRad = (entity.startAngleDeg || 0) * Math.PI / 180;
  const endRad = (entity.endAngleDeg || 0) * Math.PI / 180;
  ctx.save();
  ctx.globalAlpha = getEntityOpacity(entity);
  ctx.setLineDash(getEntityStrokeDash(entity));
  if (isSelected) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.34)";
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusPx, startRad, endRad);
    ctx.stroke();
  }
  ctx.strokeStyle = getEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, startRad, endRad);
  ctx.stroke();
  ctx.restore();
}

function drawFilledRegionEntity(entity) {
  if (!Array.isArray(entity.points) || entity.points.length < 3) return;
  const points = entity.points.map(worldToScreen);
  const isSelected = state.selectedEntityIds.includes(entity.id);
  ctx.save();
  ctx.globalAlpha = getEntityOpacity(entity);
  ctx.setLineDash(getEntityStrokeDash(entity));
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i += 1) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  if (entity.fill !== false) {
    ctx.fillStyle = getEntityFillStyle(entity, getEntityStrokeColor(entity), getEntityFillOpacity(entity, isSelected ? 0.26 : 0.18));
    ctx.fill();
  }
  if (isSelected) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.34)";
    ctx.lineWidth = 8;
    ctx.stroke();
  }
  ctx.strokeStyle = getEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  ctx.stroke();
  ctx.restore();
}

function withAlpha(colorHex, alpha) {
  const clean = String(colorHex || "").trim();
  const match = /^#([0-9a-f]{6})$/i.exec(clean);
  if (!match) return `rgba(123, 160, 219, ${alpha})`;
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function getEntityFillStyle(entity, fallbackColor, alpha) {
  return withAlpha(entity.fillColor || fallbackColor, alpha);
}

function drawTextEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer) return;
  const isSelected = state.selectedEntityIds.includes(entity.id);
  const base = worldToScreen({ x: entity.x, y: entity.y });
  const color = normalizeColor(entity.color || layer.color);
  const fontPx = Math.max(10, Math.abs(entity.height * state.view.zoom));
  ctx.save();
  ctx.globalAlpha = getEntityOpacity(entity);
  ctx.font = `${fontPx}px sans-serif`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = entity.align || "left";
  ctx.fillStyle = color;
  ctx.fillText(entity.text, base.x, base.y);
  if (isSelected) {
    const w = ctx.measureText(entity.text).width;
    const h = fontPx;
    const left = entity.align === "center" ? base.x - w / 2 : (entity.align === "right" ? base.x - w : base.x);
    const top = base.y - h;
    ctx.strokeStyle = "#c2693e";
    ctx.lineWidth = 1.3;
    ctx.strokeRect(left - 4, top - 4, w + 8, h + 8);
  }
  ctx.restore();
}

function getDimensionDisplayText(entity) {
  if ((entity.textOverride || "").trim()) return entity.textOverride.trim();
  const dist = unitsToMm(Math.hypot(entity.p2.x - entity.p1.x, entity.p2.y - entity.p1.y));
  return dist.toFixed(entity.precision ?? 0);
}

function getDimensionGeometry(entity) {
  const dx = entity.p2.x - entity.p1.x;
  const dy = entity.p2.y - entity.p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const d1 = (entity.offsetPoint.x - entity.p1.x) * nx + (entity.offsetPoint.y - entity.p1.y) * ny;
  const d2 = (entity.offsetPoint.x - entity.p2.x) * nx + (entity.offsetPoint.y - entity.p2.y) * ny;
  const o1 = { x: roundToUnit(entity.p1.x + nx * d1), y: roundToUnit(entity.p1.y + ny * d1) };
  const o2 = { x: roundToUnit(entity.p2.x + nx * d2), y: roundToUnit(entity.p2.y + ny * d2) };
  return { o1, o2 };
}

function getDimensionScreenGeometry(entity) {
  const { o1: o1World, o2: o2World } = getDimensionGeometry(entity);
  const p1 = worldToScreen(entity.p1);
  const p2 = worldToScreen(entity.p2);
  const o1 = worldToScreen(o1World);
  const o2 = worldToScreen(o2World);
  const dx = o2.x - o1.x;
  const dy = o2.y - o1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const tick = Math.max(4, (entity.tickSize || 250) * state.view.zoom * 0.25);
  const text = getDimensionDisplayText(entity);
  const textPosition = { x: (o1.x + o2.x) / 2, y: (o1.y + o2.y) / 2 - 6 };
  const fontPx = Math.max(10, (entity.textHeight || 250) * state.view.zoom);

  ctx.save();
  ctx.font = `${fontPx}px sans-serif`;
  const textWidth = ctx.measureText(text).width;
  ctx.restore();

  const textBox = {
    left: textPosition.x - textWidth / 2 - 8,
    right: textPosition.x + textWidth / 2 + 8,
    top: textPosition.y - fontPx - 6,
    bottom: textPosition.y + 6,
  };

  return {
    p1,
    p2,
    o1,
    o2,
    extensionLines: [[p1, o1], [p2, o2]],
    dimensionLine: [o1, o2],
    tickLines: [
      [{ x: o1.x - nx * tick, y: o1.y - ny * tick }, { x: o1.x + nx * tick, y: o1.y + ny * tick }],
      [{ x: o2.x - nx * tick, y: o2.y - ny * tick }, { x: o2.x + nx * tick, y: o2.y + ny * tick }],
    ],
    text,
    textPosition,
    textBox,
    fontPx,
  };
}

function drawDimensionEntity(entity) {
  const layer = getLayerById(entity.layerId); if (!layer) return;
  const color = normalizeColor(entity.color || layer.color);
  const isSelected = state.selectedEntityIds.includes(entity.id);
  const geometry = getDimensionScreenGeometry(entity);
  ctx.save(); ctx.globalAlpha = getEntityOpacity(entity); ctx.setLineDash(getEntityStrokeDash(entity)); ctx.strokeStyle=color; ctx.fillStyle=color; ctx.lineWidth=getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  [...geometry.extensionLines, geometry.dimensionLine, ...geometry.tickLines].forEach(([a,b])=>{ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();});
  ctx.font=`${geometry.fontPx}px sans-serif`; ctx.textAlign='center'; ctx.fillText(geometry.text, geometry.textPosition.x, geometry.textPosition.y);
  if (isSelected) { ctx.strokeStyle='#c2693e'; ctx.strokeRect(geometry.textBox.left, geometry.textBox.top, geometry.textBox.right - geometry.textBox.left, geometry.textBox.bottom - geometry.textBox.top);}
  ctx.restore();
}

function drawDimensionDraftPreview(dimensionDraft) {
  const p1 = roundWorldPoint(dimensionDraft.p1);
  const p2 = dimensionDraft.step === 1
    ? roundWorldPoint(uiState.hoverWorld)
    : roundWorldPoint(dimensionDraft.p2);
  const offsetPoint = dimensionDraft.step === 1
    ? p2
    : roundWorldPoint(uiState.hoverWorld);
  if (p1.x === p2.x && p1.y === p2.y) {
    return;
  }
  drawDimensionEntity({
    id: "draft-dimension",
    type: "dimension",
    layerId: state.activeLayerId,
    p1,
    p2,
    offsetPoint,
    textOverride: "",
    textHeight: 250,
    tickSize: 250,
    color: "",
    precision: 0,
  });
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
    } else if (entity.type === "circle" || entity.type === "arc" || entity.type === "filledRegion" || entity.type === "text" || entity.type === "dimension") {
      drawEntityPreview(applyOffsetToEntity(entity, offset));
    }
  });
}

function drawEntityPreview(entity) {
  if (entity.type === "circle") {
    drawCircleEntity(entity);
  } else if (entity.type === "arc") {
    drawArcEntity(entity);
  } else if (entity.type === "filledRegion") {
    drawFilledRegionEntity(entity);
  } else if (entity.type === "text") {
    drawTextEntity(entity);
  } else if (entity.type === "dimension") {
    drawDimensionEntity(entity);
  }
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

function addCircleEntity(centerPoint, radiusPoint) {
  const center = roundWorldPoint(centerPoint);
  const radius = roundToUnit(Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y));
  if (radius <= 0) {
    setStatus("Circle radius must be greater than zero.");
    return null;
  }
  pushUndoState();
  const circle = { id: createEntityId(), type: "circle", layerId: state.activeLayerId, center, radius };
  state.entities.push(circle);
  state.selectedEntityIds = [circle.id];
  syncAfterStateChange();
  setStatus("Circle created.");
  return circle;
}

function angleDegFromCenter(center, point) {
  return (Math.atan2(point.y - center.y, point.x - center.x) * 180 / Math.PI + 360) % 360;
}

function snapAngleTo90(angleDeg) {
  const snapped = Math.round(angleDeg / 90) * 90;
  return ((snapped % 360) + 360) % 360;
}

function addArcEntity(centerPoint, radiusPoint, endPoint) {
  const center = roundWorldPoint(centerPoint);
  const radius = roundToUnit(Math.hypot(radiusPoint.x - center.x, radiusPoint.y - center.y));
  if (radius <= 0) {
    setStatus("Arc radius must be greater than zero.");
    return null;
  }
  const startAngleDeg = snapAngleTo90(angleDegFromCenter(center, radiusPoint));
  let endAngleDeg = snapAngleTo90(angleDegFromCenter(center, endPoint));
  if (endAngleDeg === startAngleDeg) {
    endAngleDeg = (startAngleDeg + 270) % 360;
  }
  pushUndoState();
  const arc = { id: createEntityId(), type: "arc", layerId: state.activeLayerId, center, radius, startAngleDeg, endAngleDeg };
  state.entities.push(arc);
  state.selectedEntityIds = [arc.id];
  syncAfterStateChange();
  setStatus("Arc created.");
  return arc;
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
    .filter((entity) => entity && (entity.type === "line" || entity.type === "rect" || entity.type === "circle" || entity.type === "arc" || entity.type === "filledRegion" || entity.type === "text" || entity.type === "dimension") && canSelectEntity(entity));
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
    dx: roundToUnit(currentPoint.x - transformDraft.startPoint.x),
    dy: roundToUnit(currentPoint.y - transformDraft.startPoint.y),
  };
}

function updateTransformDraftStatus(message) {
  setStatus(message);
  renderStatusPanel();
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
      x: roundToUnit(entity.x + offset.dx),
      y: roundToUnit(entity.y + offset.dy),
    };
  }
  if (entity.type === "text") {
    return {
      ...entity,
      x: roundToUnit(entity.x + offset.dx),
      y: roundToUnit(entity.y + offset.dy),
    };
  }
  if (entity.type === "circle") {
    return { ...entity, center: { x: roundToUnit(entity.center.x + offset.dx), y: roundToUnit(entity.center.y + offset.dy) } };
  }
  if (entity.type === "arc") {
    return { ...entity, center: { x: roundToUnit(entity.center.x + offset.dx), y: roundToUnit(entity.center.y + offset.dy) } };
  }
  if (entity.type === "filledRegion") {
    return { ...entity, points: entity.points.map((point) => ({ x: roundToUnit(point.x + offset.dx), y: roundToUnit(point.y + offset.dy) })) };
  }
  if (entity.type === "dimension") {
    return { ...entity, p1:{x:roundToUnit(entity.p1.x+offset.dx),y:roundToUnit(entity.p1.y+offset.dy)}, p2:{x:roundToUnit(entity.p2.x+offset.dx),y:roundToUnit(entity.p2.y+offset.dy)}, offsetPoint:{x:roundToUnit(entity.offsetPoint.x+offset.dx),y:roundToUnit(entity.offsetPoint.y+offset.dy)} };
  }
  return {
    ...entity,
    p1: {
      x: roundToUnit(entity.p1.x + offset.dx),
      y: roundToUnit(entity.p1.y + offset.dy),
    },
    p2: {
      x: roundToUnit(entity.p2.x + offset.dx),
      y: roundToUnit(entity.p2.y + offset.dy),
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

function resolveFreeDragPoint(worldPoint) {
  return worldPoint;
}

function updateSelectDragStatus(message) {
  setStatus(message);
  renderStatusPanel();
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
    const newEntities = sourceEntities.map((entity) => ({
      ...applyOffsetToEntity(deepClone(entity), offset),
      id: createEntityId(),
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

function findSelectableEntityAtPoint(worldPoint) {
  return state.entities
    .filter(canSelectEntity)
    .slice()
    .reverse()
    .find((entity) => hitTestEntity(entity, worldPoint)) || null;
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

function getEndpointToMoveForExtend(line, boundaryLine, intersection) {
  const p1Projection = projectPointToInfiniteLineRaw(line.p1, boundaryLine);
  const p2Projection = projectPointToInfiniteLineRaw(line.p2, boundaryLine);
  const p1DistanceToBoundary = p1Projection
    ? Math.hypot(line.p1.x - p1Projection.x, line.p1.y - p1Projection.y)
    : Infinity;
  const p2DistanceToBoundary = p2Projection
    ? Math.hypot(line.p2.x - p2Projection.x, line.p2.y - p2Projection.y)
    : Infinity;
  if (p1DistanceToBoundary !== p2DistanceToBoundary) {
    return p1DistanceToBoundary <= p2DistanceToBoundary ? "p1" : "p2";
  }

  const p1DistanceToIntersection = Math.hypot(line.p1.x - intersection.x, line.p1.y - intersection.y);
  const p2DistanceToIntersection = Math.hypot(line.p2.x - intersection.x, line.p2.y - intersection.y);
  return p1DistanceToIntersection <= p2DistanceToIntersection ? "p1" : "p2";
}

function applyExtend(boundaryEntityId, targetEntityId) {
  const boundaryLine = getEntityById(boundaryEntityId);
  const targetLine = getEntityById(targetEntityId);

  if (!boundaryLine || !targetLine || boundaryLine.type !== "line" || targetLine.type !== "line") {
    setStatus("Extend requires two available lines.");
    return false;
  }
  if (!canSelectEntity(boundaryLine) || !canSelectEntity(targetLine)) {
    setStatus("Extend requires visible, unlocked lines.");
    return false;
  }
  if (boundaryLine.id === targetLine.id) {
    setStatus("Extend: pick a different target line.");
    return false;
  }

  const intersection = getInfiniteLineIntersection(boundaryLine, targetLine);
  if (!intersection) {
    setStatus("Extend failed: lines are parallel or nearly parallel. Pick target line.");
    return false;
  }

  const endpointToMove = getEndpointToMoveForExtend(targetLine, boundaryLine, intersection);
  const nextTargetLine = {
    ...targetLine,
    p1: endpointToMove === "p1" ? intersection : targetLine.p1,
    p2: endpointToMove === "p2" ? intersection : targetLine.p2,
  };

  pushUndoState();
  state.entities = state.entities.map((entity) => {
    if (entity.id !== nextTargetLine.id) {
      return entity;
    }
    return nextTargetLine;
  });
  state.selectedEntityIds = [];
  uiState.extendDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange();
  setStatus("Extend applied.");
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

function handleExtendToolClick(worldPoint) {
  const targetEntity = findSelectableEntityAtPoint(worldPoint);
  if (!targetEntity) {
    setStatus(
      uiState.extendDraft ? "Extend: pick target line" : "Extend: pick boundary line"
    );
    return;
  }

  if (targetEntity.type !== "line") {
    setStatus("Extend: line only. Pick a line.");
    return;
  }

  if (!uiState.extendDraft) {
    uiState.extendDraft = {
      boundaryEntityId: targetEntity.id,
    };
    state.selectedEntityIds = [targetEntity.id];
    syncAfterStateChange();
    setStatus("Extend: pick target line");
    return;
  }

  if (uiState.extendDraft.boundaryEntityId === targetEntity.id) {
    setStatus("Extend: pick a different target line.");
    return;
  }

  applyExtend(uiState.extendDraft.boundaryEntityId, targetEntity.id);
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
  uiState.dimensionDraft = null;
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
      if (entity.type === "circle" || entity.type === "arc") {
        const centerScreen = worldToScreen(entity.center);
        const radiusScreen = Math.abs(entity.radius * state.view.zoom);
        const box = {
          left: centerScreen.x - radiusScreen,
          right: centerScreen.x + radiusScreen,
          top: centerScreen.y - radiusScreen,
          bottom: centerScreen.y + radiusScreen,
        };
        return rect.isCrossing
          ? !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom)
          : (box.left >= rect.left && box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom);
      }
      if (entity.type === "filledRegion") {
        const points = entity.points.map(worldToScreen);
        const xs = points.map((point) => point.x);
        const ys = points.map((point) => point.y);
        const box = { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) };
        return rect.isCrossing
          ? !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom)
          : (box.left >= rect.left && box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom);
      }
      if (entity.type === "text") {
        const box = getTextBoundsScreen(entity);
        return rect.isCrossing
          ? !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom)
          : (box.left >= rect.left && box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom);
      }
      if (entity.type === "dimension") {
        const geometry = getDimensionScreenGeometry(entity);
        const boxes = [
          ...geometry.extensionLines,
          geometry.dimensionLine,
          ...geometry.tickLines,
        ].map(([a, b]) => ({
          left: Math.min(a.x, b.x),
          right: Math.max(a.x, b.x),
          top: Math.min(a.y, b.y),
          bottom: Math.max(a.y, b.y),
        }));
        boxes.push(geometry.textBox);
        return rect.isCrossing
          ? boxes.some((box) => !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom))
          : boxes.every((box) => box.left >= rect.left && box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom);
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

function isPointInPolygon(point, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects = ((yi > point.y) !== (yj > point.y))
      && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
}

function hitTestFilledRegionEntity(entity, worldPoint) {
  if (!Array.isArray(entity.points) || entity.points.length < 3) return false;
  if (isPointInPolygon(worldPoint, entity.points)) return true;
  return entity.points.some((point, index) => {
    const next = entity.points[(index + 1) % entity.points.length];
    const distancePx = distancePointToSegmentScreenPx(worldPoint, point, next);
    return distancePx <= state.settings.snapTolerancePx;
  });
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
  if (entity.type === "circle") {
    const d = Math.hypot(worldPoint.x - entity.center.x, worldPoint.y - entity.center.y);
    const tolUnits = state.settings.snapTolerancePx / state.view.zoom;
    return d <= entity.radius + tolUnits && d >= entity.radius - tolUnits || d < entity.radius;
  }
  if (entity.type === "arc") {
    const d = Math.hypot(worldPoint.x - entity.center.x, worldPoint.y - entity.center.y);
    const tolUnits = state.settings.snapTolerancePx / state.view.zoom;
    if (Math.abs(d - entity.radius) > tolUnits) return false;
    const a = angleDegFromCenter(entity.center, worldPoint);
    const start = ((entity.startAngleDeg % 360) + 360) % 360;
    const end = ((entity.endAngleDeg % 360) + 360) % 360;
    return start <= end ? (a >= start && a <= end) : (a >= start || a <= end);
  }
  if (entity.type === "filledRegion") {
    return hitTestFilledRegionEntity(entity, worldPoint);
  }
  if (entity.type === "text") {
    const p = worldToScreen(worldPoint);
    const box = getTextBoundsScreen(entity);
    return p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;
  }
  if (entity.type === "dimension") {
    const point = worldToScreen(worldPoint);
    const geometry = getDimensionScreenGeometry(entity);
    const tol = state.settings.snapTolerancePx + 4;
    return (
      [...geometry.extensionLines, geometry.dimensionLine, ...geometry.tickLines]
        .some(([start, end]) => distanceScreenPointToSegmentPx(point, start, end) <= tol) ||
      (point.x >= geometry.textBox.left && point.x <= geometry.textBox.right && point.y >= geometry.textBox.top && point.y <= geometry.textBox.bottom)
    );
  }
  return false;
}

function getRectEdges(entity) {
  if (!entity || entity.type !== "rect") {
    return [];
  }
  const x1 = entity.x;
  const y1 = entity.y;
  const x2 = entity.x + entity.width;
  const y2 = entity.y + entity.height;
  return [
    { edge: "top", p1: { x: x1, y: y1 }, p2: { x: x2, y: y1 } },
    { edge: "right", p1: { x: x2, y: y1 }, p2: { x: x2, y: y2 } },
    { edge: "bottom", p1: { x: x2, y: y2 }, p2: { x: x1, y: y2 } },
    { edge: "left", p1: { x: x1, y: y2 }, p2: { x: x1, y: y1 } },
  ];
}

function findRectEdgeAtPoint(worldPoint) {
  return state.entities
    .filter((entity) => entity.type === "rect" && canSelectEntity(entity))
    .slice()
    .reverse()
    .map((entity) => {
      const edgeHit = getRectEdges(entity)
        .find((edgeDef) => distancePointToSegmentScreenPx(worldPoint, edgeDef.p1, edgeDef.p2) <= state.settings.snapTolerancePx);
      return edgeHit ? { entityId: entity.id, edge: edgeHit.edge } : null;
    })
    .find(Boolean) || null;
}

function getResizedRectFromDraft(draft, worldPoint) {
  const anchorPoint = getSnapPoint(worldPoint);
  const original = draft.originalRect;
  const right = original.x + original.width;
  const bottom = original.y + original.height;
  const minSize = 1;
  const nextRect = { ...original };
  if (draft.edge === "top") {
    const nextY = clampNumber(anchorPoint.y, Number.NEGATIVE_INFINITY, bottom - minSize, original.y);
    nextRect.y = nextY;
    nextRect.height = Math.max(minSize, bottom - nextY);
  } else if (draft.edge === "bottom") {
    const nextBottom = Math.max(original.y + minSize, anchorPoint.y);
    nextRect.height = Math.max(minSize, nextBottom - original.y);
  } else if (draft.edge === "left") {
    const nextX = clampNumber(anchorPoint.x, Number.NEGATIVE_INFINITY, right - minSize, original.x);
    nextRect.x = nextX;
    nextRect.width = Math.max(minSize, right - nextX);
  } else if (draft.edge === "right") {
    const nextRight = Math.max(original.x + minSize, anchorPoint.x);
    nextRect.width = Math.max(minSize, nextRight - original.x);
  }
  return roundRectBox(nextRect);
}

function getTextBoundsScreen(entity) {
  const base = worldToScreen({ x: entity.x, y: entity.y });
  const fontPx = Math.max(10, Math.abs(entity.height * state.view.zoom));
  ctx.save();
  ctx.font = `${fontPx}px sans-serif`;
  const w = ctx.measureText(entity.text || "").width;
  ctx.restore();
  const left = entity.align === "center" ? base.x - w / 2 : (entity.align === "right" ? base.x - w : base.x);
  return { left, right: left + w, top: base.y - fontPx, bottom: base.y };
}

function distancePointToSegmentScreenPx(point, segmentStart, segmentEnd) {
  const p = worldToScreen(point);
  const a = worldToScreen(segmentStart);
  const b = worldToScreen(segmentEnd);
  return distanceScreenPointToSegmentPx(p, a, b);
}

function distanceScreenPointToSegmentPx(p, a, b) {
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

function createDebugFixtureTextMm(xMm, yMm, text = "Text", heightMm = 25) {
  return {
    id: createEntityId(),
    type: "text",
    layerId: state.activeLayerId,
    x: mmToUnits(xMm),
    y: mmToUnits(yMm),
    text: String(text).trim() || "Text",
    height: Math.max(1, mmToUnits(heightMm)),
    rotation: 0,
    align: "left",
    color: "",
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
    "extend-basic": () => [
      createDebugFixtureLineMm(0, -1200, 0, 1200),
      createDebugFixtureLineMm(-1400, 200, -400, 200),
    ],
    "extend-parallel": () => [
      createDebugFixtureLineMm(-1500, 0, 1500, 0),
      createDebugFixtureLineMm(-1000, 600, 1000, 600),
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

function getUnitConfig() {
  return {
    fileVersion: CURRENT_FILE_VERSION,
    unitMm: UNIT_MM,
    legacyUnitMm: LEGACY_UNIT_MM,
  };
}

function getDocumentBoundsUnits(entities = state.entities) {
  const xs = [];
  const ys = [];
  entities.forEach((entity) => {
    if (!entity) return;
    if (entity.type === "line") {
      xs.push(entity.p1.x, entity.p2.x);
      ys.push(entity.p1.y, entity.p2.y);
    } else if (entity.type === "rect") {
      xs.push(entity.x, entity.x + entity.width);
      ys.push(entity.y, entity.y + entity.height);
    } else if (entity.type === "circle" || entity.type === "arc") {
      xs.push(entity.center.x - entity.radius, entity.center.x + entity.radius);
      ys.push(entity.center.y - entity.radius, entity.center.y + entity.radius);
    } else if (entity.type === "filledRegion") {
      entity.points.forEach((point) => {
        xs.push(point.x);
        ys.push(point.y);
      });
    }
  });
  if (!xs.length || !ys.length) {
    return null;
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function boundsUnitsToMm(bounds) {
  if (!bounds) {
    return null;
  }
  return {
    minX: unitsToMm(bounds.minX),
    minY: unitsToMm(bounds.minY),
    maxX: unitsToMm(bounds.maxX),
    maxY: unitsToMm(bounds.maxY),
  };
}

function getCurrentDocumentSummary() {
  const boundsUnits = getDocumentBoundsUnits();
  return {
    fileVersion: state.fileVersion || CURRENT_FILE_VERSION,
    unitMm: state.unitMm || UNIT_MM,
    entityCount: state.entities.length,
    lineCount: state.entities.filter((entity) => entity.type === "line").length,
    rectCount: state.entities.filter((entity) => entity.type === "rect").length,
    boundsUnits,
    boundsMm: boundsUnitsToMm(boundsUnits),
  };
}

function getLayerByName(name) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) {
    return null;
  }
  return state.layers.find((layer) => layer.name === normalizedName) || null;
}

function createAgentLayer(name, color = "#2e3135") {
  const layerName = typeof name === "string" && name.trim() ? name.trim() : `Layer ${state.nextLayerNumber}`;
  const layer = {
    id: createLayerId(),
    name: layerName,
    color: normalizeColor(color),
    visible: true,
    locked: false,
  };
  state.layers.push(layer);
  return layer;
}

function ensureAgentLayer(name, options = {}) {
  const normalizedName = typeof name === "string" ? name.trim() : "";
  if (!normalizedName) {
    return getLayerById(state.activeLayerId) || state.layers[0] || null;
  }
  const existing = getLayerByName(normalizedName);
  if (existing) {
    return existing;
  }
  if (options.createIfMissing === false) {
    return null;
  }
  return createAgentLayer(normalizedName, options.color);
}

function getAgentBoundsUnits(entities = state.entities) {
  const xs = [];
  const ys = [];
  entities.forEach((entity) => {
    if (!entity) {
      return;
    }
    if (entity.type === "line") {
      xs.push(entity.p1.x, entity.p2.x);
      ys.push(entity.p1.y, entity.p2.y);
      return;
    }
    if (entity.type === "rect") {
      xs.push(entity.x, entity.x + entity.width);
      ys.push(entity.y, entity.y + entity.height);
      return;
    }
    if (entity.type === "circle" || entity.type === "arc") {
      xs.push(entity.center.x - entity.radius, entity.center.x + entity.radius);
      ys.push(entity.center.y - entity.radius, entity.center.y + entity.radius);
      return;
    }
    if (entity.type === "filledRegion") {
      (entity.points || []).forEach((point) => {
        xs.push(point.x);
        ys.push(point.y);
      });
      return;
    }
    if (entity.type === "text") {
      xs.push(entity.x);
      ys.push(entity.y - Math.max(1, entity.height || 250), entity.y);
      return;
    }
    if (entity.type === "dimension") {
      const geometry = getDimensionGeometry(entity);
      xs.push(entity.p1.x, entity.p2.x, entity.offsetPoint.x, geometry.o1.x, geometry.o2.x);
      ys.push(entity.p1.y, entity.p2.y, entity.offsetPoint.y, geometry.o1.y, geometry.o2.y);
    }
  });
  if (!xs.length || !ys.length) {
    return null;
  }
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function getAgentSummary() {
  const baseSummary = getCurrentDocumentSummary();
  const boundsUnits = getAgentBoundsUnits();
  const activeLayer = getLayerById(state.activeLayerId);
  return {
    ...baseSummary,
    entityCount: state.entities.length,
    lineCount: state.entities.filter((entity) => entity.type === "line").length,
    rectCount: state.entities.filter((entity) => entity.type === "rect").length,
    textCount: state.entities.filter((entity) => entity.type === "text").length,
    circleCount: state.entities.filter((entity) => entity.type === "circle").length,
    arcCount: state.entities.filter((entity) => entity.type === "arc").length,
    filledRegionCount: state.entities.filter((entity) => entity.type === "filledRegion").length,
    dimensionCount: state.entities.filter((entity) => entity.type === "dimension").length,
    layerCount: state.layers.length,
    activeLayerId: state.activeLayerId,
    activeLayerName: activeLayer ? activeLayer.name : null,
    boundsUnits,
    boundsMm: boundsUnitsToMm(boundsUnits),
  };
}

function summarizeInvalidEntity(entity, index) {
  return {
    index,
    id: entity && entity.id ? entity.id : null,
    type: entity && entity.type ? entity.type : null,
  };
}

function validateDrawingState(options = {}) {
  const invalidEntities = [];
  const missingLayerReferences = [];
  const zeroSizeRects = [];
  const zeroLengthLines = [];
  const layerIds = new Set(state.layers.map((layer) => layer.id));

  state.entities.forEach((entity, index) => {
    const normalized = normalizeEntity(entity, { legacyUnits: false });
    if (!normalized) {
      invalidEntities.push(summarizeInvalidEntity(entity, index));
    }
    if (!entity || !layerIds.has(entity.layerId)) {
      missingLayerReferences.push(summarizeInvalidEntity(entity, index));
    }
    if (entity && entity.type === "rect" && (!(entity.width > 0) || !(entity.height > 0))) {
      zeroSizeRects.push(summarizeInvalidEntity(entity, index));
    }
    if (
      entity
      && entity.type === "line"
      && entity.p1
      && entity.p2
      && entity.p1.x === entity.p2.x
      && entity.p1.y === entity.p2.y
    ) {
      zeroLengthLines.push(summarizeInvalidEntity(entity, index));
    }
  });

  const summary = {
    entityCount: state.entities.length,
    rectCount: state.entities.filter((entity) => entity.type === "rect").length,
    lineCount: state.entities.filter((entity) => entity.type === "line").length,
    textCount: state.entities.filter((entity) => entity.type === "text").length,
    layerCount: state.layers.length,
    boundsMm: boundsUnitsToMm(getAgentBoundsUnits()),
    invalidEntities,
    missingLayerReferences,
    zeroSizeRects,
    zeroLengthLines,
  };

  const issues = [];
  if (invalidEntities.length) {
    issues.push(`${invalidEntities.length} invalid entities found.`);
  }
  if (missingLayerReferences.length) {
    issues.push(`${missingLayerReferences.length} entities reference missing layers.`);
  }
  if (zeroSizeRects.length) {
    issues.push(`${zeroSizeRects.length} rectangles have zero size.`);
  }
  if (zeroLengthLines.length) {
    issues.push(`${zeroLengthLines.length} lines have zero length.`);
  }
  if (options.requireNonEmpty && summary.entityCount === 0) {
    issues.push("Drawing is empty.");
  }

  return {
    ok: issues.length === 0,
    summary,
    issues,
  };
}

function readAgentNumeric(command, key) {
  const value = Number(command && command[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`${key} must be a finite number.`);
  }
  return value;
}

function readAgentPositiveNumeric(command, key) {
  const value = readAgentNumeric(command, key);
  if (value <= 0) {
    throw new Error(`${key} must be greater than zero.`);
  }
  return value;
}

function readAgentTextValue(command, key) {
  const value = typeof (command && command[key]) === "string" ? command[key].trim() : "";
  if (!value) {
    throw new Error(`${key} must be a non-empty string.`);
  }
  return value;
}

function createAgentSuccess(action, extras = {}) {
  return {
    ok: true,
    action,
    entityIds: [],
    ...extras,
  };
}

function createAgentError(action, error) {
  return {
    ok: false,
    action,
    error: error && error.message ? error.message : String(error),
  };
}

function toPublicAgentResult(result) {
  if (!result || typeof result !== "object") {
    return result;
  }
  const publicResult = { ...result };
  delete publicResult.changed;
  delete publicResult.fitView;
  return publicResult;
}

function resolveAgentEntityLayer(command) {
  const layerName = typeof command.layer === "string" ? command.layer.trim() : "";
  const colorHint = command.color || command.fillColor;
  const layer = ensureAgentLayer(layerName, { color: colorHint });
  if (!layer) {
    throw new Error("A valid layer is required.");
  }
  if (!layer.visible || layer.locked) {
    throw new Error(`Layer "${layer.name}" must be visible and unlocked.`);
  }
  return layer;
}

function createAgentRectEntity(command) {
  const xMm = readAgentNumeric(command, "x");
  const yMm = readAgentNumeric(command, "y");
  const widthMm = readAgentPositiveNumeric(command, "width");
  const heightMm = readAgentPositiveNumeric(command, "height");
  const layer = resolveAgentEntityLayer(command);
  const width = mmToUnits(widthMm);
  const height = mmToUnits(heightMm);
  if (width <= 0) {
    throw new Error("width must be greater than zero.");
  }
  if (height <= 0) {
    throw new Error("height must be greater than zero.");
  }
  return {
    id: createEntityId(),
    type: "rect",
    layerId: layer.id,
    x: mmToUnits(xMm),
    y: mmToUnits(yMm),
    width,
    height,
    rotation: 0,
    name: typeof command.name === "string" && command.name.trim() ? command.name.trim() : "Box",
    fill: command.fill !== false,
    fillColor: normalizeColor(command.fillColor || command.color || layer.color),
    color: normalizeOptionalColor(command.color || ""),
  };
}

function createAgentLineEntity(command) {
  const x1Mm = readAgentNumeric(command, "x1");
  const y1Mm = readAgentNumeric(command, "y1");
  const x2Mm = readAgentNumeric(command, "x2");
  const y2Mm = readAgentNumeric(command, "y2");
  const layer = resolveAgentEntityLayer(command);
  const entity = {
    id: createEntityId(),
    type: "line",
    layerId: layer.id,
    p1: { x: mmToUnits(x1Mm), y: mmToUnits(y1Mm) },
    p2: { x: mmToUnits(x2Mm), y: mmToUnits(y2Mm) },
    color: normalizeOptionalColor(command.color || ""),
  };
  if (entity.p1.x === entity.p2.x && entity.p1.y === entity.p2.y) {
    throw new Error("line length must be greater than zero.");
  }
  return entity;
}

function createAgentTextEntity(command) {
  const xMm = readAgentNumeric(command, "x");
  const yMm = readAgentNumeric(command, "y");
  const text = readAgentTextValue(command, "text");
  const heightMm = readAgentPositiveNumeric(command, "height");
  const layer = resolveAgentEntityLayer(command);
  const height = mmToUnits(heightMm);
  if (height <= 0) {
    throw new Error("height must be greater than zero.");
  }
  return {
    id: createEntityId(),
    type: "text",
    layerId: layer.id,
    x: mmToUnits(xMm),
    y: mmToUnits(yMm),
    text,
    height,
    rotation: 0,
    align: "left",
    color: normalizeOptionalColor(command.color || ""),
  };
}

function applyAgentCommand(command) {
  const action = typeof (command && command.action) === "string" ? command.action.trim() : "";
  if (!action) {
    throw new Error("action is required.");
  }

  if (action === "rect") {
    const entity = createAgentRectEntity(command);
    state.entities.push(entity);
    state.selectedEntityIds = [entity.id];
    return createAgentSuccess(action, {
      entityIds: [entity.id],
      message: "Rectangle created.",
      changed: true,
    });
  }

  if (action === "line") {
    const entity = createAgentLineEntity(command);
    state.entities.push(entity);
    state.selectedEntityIds = [entity.id];
    return createAgentSuccess(action, {
      entityIds: [entity.id],
      message: "Line created.",
      changed: true,
    });
  }

  if (action === "text") {
    const entity = createAgentTextEntity(command);
    state.entities.push(entity);
    state.selectedEntityIds = [entity.id];
    return createAgentSuccess(action, {
      entityIds: [entity.id],
      message: "Text created.",
      changed: true,
    });
  }

  if (action === "clear") {
    state.entities = [];
    state.selectedEntityIds = [];
    return createAgentSuccess(action, {
      message: "Document cleared.",
      changed: true,
    });
  }

  if (action === "fitAll") {
    return createAgentSuccess(action, {
      message: "Fit all applied.",
      fitView: true,
    });
  }

  if (action === "setLayer") {
    const layerName = typeof command.layer === "string" && command.layer.trim()
      ? command.layer.trim()
      : readAgentTextValue(command, "name");
    const existing = getLayerByName(layerName);
    const layer = existing || createAgentLayer(layerName, command.color);
    state.activeLayerId = layer.id;
    return createAgentSuccess(action, {
      message: existing ? `Active layer set to ${layer.name}.` : `Layer ${layer.name} created and activated.`,
      changed: true,
      layerId: layer.id,
    });
  }

  throw new Error(`Unsupported action: ${action}`);
}

function isAgentMutationAction(action) {
  return action === "rect"
    || action === "line"
    || action === "text"
    || action === "clear"
    || action === "setLayer";
}

function finalizeAgentStateChange(options = {}) {
  const shouldSync = options.shouldSync !== false;
  const shouldFit = Boolean(options.shouldFit);
  clearTransientState();
  if (shouldSync) {
    syncAfterStateChange();
  }
  if (shouldFit) {
    fitAll();
  }
}

function executeAgentCommand(command) {
  const action = typeof (command && command.action) === "string" ? command.action.trim() : "";
  try {
    if (isAgentMutationAction(action)) {
      pushUndoState();
    }
    const result = applyAgentCommand(command || {});
    finalizeAgentStateChange({
      shouldSync: result.changed || result.fitView,
      shouldFit: result.fitView,
    });
    if (result.message) {
      setStatus(result.message);
    }
    return toPublicAgentResult(result);
  } catch (error) {
    setStatus(error && error.message ? error.message : String(error));
    return createAgentError(action || "", error);
  }
}

function executeManyAgentCommands(commands) {
  const items = Array.isArray(commands) ? commands : [];
  const mutating = items.some((command) => isAgentMutationAction(typeof (command && command.action) === "string" ? command.action.trim() : ""));
  const results = [];
  let shouldSync = false;
  let shouldFit = false;

  if (mutating) {
    pushUndoState();
  }

  items.forEach((command) => {
    const action = typeof (command && command.action) === "string" ? command.action.trim() : "";
    try {
      const result = applyAgentCommand(command || {});
      results.push(toPublicAgentResult(result));
      shouldSync = shouldSync || Boolean(result.changed || result.fitView);
      shouldFit = shouldFit || Boolean(result.fitView);
    } catch (error) {
      results.push(createAgentError(action || "", error));
    }
  });

  if (shouldSync || shouldFit) {
    finalizeAgentStateChange({ shouldSync: shouldSync || shouldFit, shouldFit });
  }

  const failed = results.find((result) => !result.ok);
  if (failed && failed.error) {
    setStatus(failed.error);
  } else if (results.length) {
    setStatus("Agent batch complete.");
  }

  return {
    ok: !failed,
    count: items.length,
    results,
  };
}

function createLegacyUnitFixture() {
  const base = createInitialState();
  return {
    version: 1,
    entities: [
      {
        id: "legacy-line-1000mm",
        type: "line",
        layerId: "layer-1",
        p1: { x: 0, y: 0 },
        p2: { x: 2000, y: 0 },
      },
      {
        id: "legacy-rect-1000x500mm",
        type: "rect",
        layerId: "layer-1",
        x: 0,
        y: 1000,
        width: 2000,
        height: 1000,
        rotation: 0,
        name: "Legacy Rect",
        fill: true,
        fillColor: "#2e3135",
      },
    ],
    layers: base.layers,
    activeLayerId: base.activeLayerId,
    selectedEntityIds: [],
    view: base.view,
    settings: {
      ...base.settings,
      unitsPerMm: 2,
    },
    nextEntityNumber: 3,
    nextLayerNumber: 2,
  };
}

function loadLegacyUnitFixture() {
  pushUndoState();
  state = normalizeDocument(createLegacyUnitFixture());
  state.selectedEntityIds = [];
  clearTransientState();
  syncAfterStateChange();
  fitAll();
  setStatus("Legacy 0.5 mm unit fixture loaded and migrated.");
  return getCurrentDocumentSummary();
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

function writeAgentBridgeOutput(payload) {
  const output = document.getElementById("draftliteDebugBridgeOutput");
  if (!output) {
    return;
  }

  output.dataset.lastAgentCommandId = String(payload.id || "");
  output.dataset.lastAgentAction = String(payload.action || payload.command || "");
  output.dataset.lastAgentOk = payload.ok ? "true" : "false";
  output.dataset.lastAgentResult =
    payload.result === undefined ? "" : JSON.stringify(payload.result);
  output.dataset.lastAgentError = payload.error || "";
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

function tryDispatchAgentBridgeResult(payload) {
  if (typeof document.dispatchEvent !== "function" || typeof CustomEvent !== "function") {
    return;
  }

  document.dispatchEvent(
    new CustomEvent("draftlite:agent-result", {
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

function executeAgentBridgeCommand(detail) {
  const command = detail && detail.command ? detail.command : {};
  const action = typeof command.action === "string" ? command.action.trim() : "";
  const result = executeAgentCommand(command);
  const payload = {
    id: detail && detail.id ? detail.id : String(Date.now()),
    action,
    ok: result.ok,
    result,
    error: result.ok ? "" : (result.error || "Unknown agent error."),
  };
  writeAgentBridgeOutput(payload);
  tryDispatchAgentBridgeResult(payload);
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

  document.addEventListener("draftlite:agent-command", (event) => {
    executeAgentBridgeCommand(event.detail || {});
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
  if (uiState.rectEdgeEditDraft) {
    uiState.rectEdgeEditDraft.currentPoint = snappedWorld;
    draw();
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

  if (
    uiState.activeTool === "select" &&
    !uiState.panning &&
    !uiState.selectionWindow &&
    !uiState.selectDragDraft &&
    !uiState.transformDraft &&
    !uiState.lineDraft &&
    !uiState.rectangleDraft &&
    !uiState.gripEditDraft &&
    !uiState.rectEdgeEditDraft
  ) {
    uiState.hoverRectEdge = findRectEdgeAtPoint(roundWorldPoint(worldPoint));
    if (uiState.hoverRectEdge) {
      document.body.style.cursor = (uiState.hoverRectEdge.edge === "left" || uiState.hoverRectEdge.edge === "right")
        ? "ew-resize"
        : "ns-resize";
    } else {
      document.body.style.cursor = "";
    }
  } else {
    uiState.hoverRectEdge = null;
    document.body.style.cursor = "";
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
  if (uiState.activeTool === "circle") {
    handleCircleToolClick(worldPoint);
    return;
  }
  if (uiState.activeTool === "arc") {
    handleArcToolClick(worldPoint);
    return;
  }
  if (uiState.activeTool === "filledRegion") {
    handleFilledRegionToolClick(worldPoint, event);
    return;
  }
  if (uiState.activeTool === "text") {
    handleTextToolClick(worldPoint);
    return;
  }
  if (uiState.activeTool === "dimension") {
    handleDimensionToolClick(worldPoint);
    return;
  }
  if (uiState.activeTool === "matchProperties") {
    handleMatchPropertiesToolClick(roundWorldPoint(rawWorldPoint));
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

  if (uiState.activeTool === "extend") {
    handleExtendToolClick(roundWorldPoint(rawWorldPoint));
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
    const rectEdgeHit = findRectEdgeAtPoint(roundWorldPoint(rawWorldPoint));
    if (rectEdgeHit) {
      const rectEntity = getEntityById(rectEdgeHit.entityId);
      if (rectEntity && rectEntity.type === "rect" && canSelectEntity(rectEntity)) {
        state.selectedEntityIds = [rectEntity.id];
        uiState.rectEdgeEditDraft = {
          entityId: rectEntity.id,
          edge: rectEdgeHit.edge,
          originalRect: { x: rectEntity.x, y: rectEntity.y, width: rectEntity.width, height: rectEntity.height },
          startPoint: worldPoint,
          currentPoint: worldPoint,
        };
        setStatus(`Rectangle ${rectEdgeHit.edge} edge resize started.`);
        syncAfterStateChange();
        return;
      }
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

function handleCircleToolClick(worldPoint) {
  if (!uiState.circleDraft) {
    if (!canDrawOnActiveLayer()) {
      return;
    }
    beginCircleDraft(worldPoint);
    return;
  }
  if (!canDrawOnActiveLayer()) {
    return;
  }
  addCircleEntity(uiState.circleDraft.center, worldPoint);
  uiState.circleDraft = null;
}

function handleArcToolClick(worldPoint) {
  if (!uiState.arcDraft) {
    if (!canDrawOnActiveLayer()) {
      return;
    }
    beginArcDraft(worldPoint);
    return;
  }
  if (!canDrawOnActiveLayer()) {
    return;
  }
  if (uiState.arcDraft.step === 1) {
    uiState.arcDraft.radiusPoint = roundWorldPoint(worldPoint);
    uiState.arcDraft.radius = roundToUnit(Math.hypot(worldPoint.x - uiState.arcDraft.center.x, worldPoint.y - uiState.arcDraft.center.y));
    if (uiState.arcDraft.radius <= 0) {
      setStatus("Arc radius must be greater than zero.");
      return;
    }
    uiState.arcDraft.startAngleDeg = snapAngleTo90(angleDegFromCenter(uiState.arcDraft.center, worldPoint));
    uiState.arcDraft.step = 2;
    setStatus("Arc: pick end direction.");
    draw();
    return;
  }
  addArcEntity(uiState.arcDraft.center, uiState.arcDraft.radiusPoint, worldPoint);
  uiState.arcDraft = null;
}

function handleFilledRegionToolClick(worldPoint, event) {
  if (!canDrawOnActiveLayer()) {
    return;
  }
  const point = roundWorldPoint(worldPoint);
  if (!uiState.filledRegionDraft) {
    beginFilledRegionDraft(point);
    return;
  }
  const last = uiState.filledRegionDraft.points[uiState.filledRegionDraft.points.length - 1];
  if (!last || last.x !== point.x || last.y !== point.y) {
    uiState.filledRegionDraft.points.push(point);
  }
  if (event.detail >= 2 && uiState.filledRegionDraft.points.length >= 3) {
    finishFilledRegionDraft();
    return;
  }
  draw();
}

function finishFilledRegionDraft() {
  if (!uiState.filledRegionDraft || uiState.filledRegionDraft.points.length < 3) {
    setStatus("Filled Region requires at least 3 points.");
    return false;
  }
  if (!canDrawOnActiveLayer()) {
    return false;
  }
  const layer = getLayerById(state.activeLayerId);
  pushUndoState();
  const entity = {
    id: createEntityId(),
    type: "filledRegion",
    layerId: state.activeLayerId,
    points: uiState.filledRegionDraft.points.map(roundWorldPoint),
    fill: true,
    fillColor: normalizeColor(layer?.color || "#5e6b78"),
  };
  state.entities.push(entity);
  state.selectedEntityIds = [entity.id];
  uiState.filledRegionDraft = null;
  syncAfterStateChange();
  setStatus("Filled Region created.");
  return true;
}

function handleTextToolClick(worldPoint) {
  const activeLayer = getLayerById(state.activeLayerId);
  if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
    setStatus("Choose a visible, unlocked active layer before drawing.");
    return;
  }
  const value = window.prompt("Text content");
  if (value === null) {
    setStatus("Text placement cancelled.");
    return;
  }
  const text = value.trim();
  if (!text) {
    setStatus("Empty text was not created.");
    return;
  }
  pushUndoState();
  const entity = { id: createEntityId(), type: "text", layerId: state.activeLayerId, x: roundToUnit(worldPoint.x), y: roundToUnit(worldPoint.y), text, height: 250, rotation: 0, align: "left", color: "" };
  state.entities.push(entity);
  state.selectedEntityIds = [entity.id];
  syncAfterStateChange();
  setStatus("Text created.");
}

function handleDimensionToolClick(worldPoint) {
  const activeLayer = getLayerById(state.activeLayerId);
  if (!activeLayer || !activeLayer.visible || activeLayer.locked) { setStatus("Choose a visible, unlocked active layer before drawing."); return; }
  if (!uiState.dimensionDraft) {
    uiState.dimensionDraft = { step: 1, p1: roundWorldPoint(worldPoint) };
    setStatus("Aligned Dimension: pick second point");
    draw();
    return;
  }
  if (uiState.dimensionDraft.step === 1) {
    uiState.dimensionDraft.p2 = roundWorldPoint(worldPoint);
    uiState.dimensionDraft.step = 2;
    setStatus("Aligned Dimension: place dimension line");
    draw();
    return;
  }
  pushUndoState();
  const entity = { id:createEntityId(), type:"dimension", layerId:state.activeLayerId, p1:roundWorldPoint(uiState.dimensionDraft.p1), p2:roundWorldPoint(uiState.dimensionDraft.p2), offsetPoint:roundWorldPoint(worldPoint), textOverride:"", textHeight:250, tickSize:250, color:"", precision:0 };
  state.entities.push(entity); state.selectedEntityIds=[entity.id]; uiState.dimensionDraft=null; syncAfterStateChange(); setStatus("Aligned Dimension created.");
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
  if (uiState.rectEdgeEditDraft) {
    const draft = uiState.rectEdgeEditDraft;
    const entity = getEntityById(draft.entityId);
    if (entity && entity.type === "rect" && canSelectEntity(entity)) {
      const nextRect = getResizedRectFromDraft(draft, draft.currentPoint);
      if (
        nextRect.x !== draft.originalRect.x ||
        nextRect.y !== draft.originalRect.y ||
        nextRect.width !== draft.originalRect.width ||
        nextRect.height !== draft.originalRect.height
      ) {
        pushUndoState();
        entity.x = nextRect.x;
        entity.y = nextRect.y;
        entity.width = nextRect.width;
        entity.height = nextRect.height;
        setStatus("Rectangle resized.");
        syncAfterStateChange();
      }
    }
    uiState.rectEdgeEditDraft = null;
    draw();
    renderStatusPanel();
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
    state.view.zoom = DEFAULT_ZOOM;
    state.view.panX = uiState.canvasRect.width / 2;
    state.view.panY = uiState.canvasRect.height / 2;
    draw();
    renderStatusPanel();
    setStatus("Fit all reset to origin.");
    return;
  }

  const boundsUnits = getDocumentBoundsUnits(visibleEntities);
  if (!boundsUnits) {
    setStatus("Fit all reset to origin.");
    draw();
    renderStatusPanel();
    return;
  }
  const minX = boundsUnits.minX;
  const minY = boundsUnits.minY;
  const maxX = boundsUnits.maxX;
  const maxY = boundsUnits.maxY;

  const marginPx = 48;
  const boxWidth = Math.max(1, maxX - minX);
  const boxHeight = Math.max(1, maxY - minY);
  const scaleX = (uiState.canvasRect.width - marginPx * 2) / boxWidth;
  const scaleY = (uiState.canvasRect.height - marginPx * 2) / boxHeight;
  state.view.zoom = clampNumber(Math.min(scaleX, scaleY), MIN_ZOOM, MAX_ZOOM, DEFAULT_ZOOM);
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
  if (tool === "dimension") {
    setStatus("Aligned Dimension: pick first point");
    return;
  }
  if (tool === "matchProperties") {
    setStatus("Select source object.");
    return;
  }
  if (tool === "circle") {
    setStatus("Circle: pick center point.");
    return;
  }
  if (tool === "arc") {
    setStatus("Arc: pick center point.");
    return;
  }
  if (tool === "filledRegion") {
    setStatus("Filled Region: pick first point.");
    return;
  }
  if (tool === "extend") {
    setStatus("Extend: pick boundary line");
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
  const summary = getDxfExportSummary();

  if (summary.exportedLineCount + summary.exportedTextCount + summary.exportedCircleCount + summary.exportedArcCount === 0) {
    setStatus("No visible entities to export.");
    return;
  }

  const dxfText = buildDxfText();
  downloadBlob(
    new Blob([dxfText], { type: "text/plain;charset=us-ascii" }),
    `draftlite-${createTimestampLabel()}.dxf`
  );
  setStatus(`DXF exported: ${summary.exportedLineCount} lines, ${summary.exportedCircleCount} circles, ${summary.exportedArcCount} arcs, ${summary.exportedTextCount} text.`);
}

function buildDxfText() {
  const exportEntities = collectDxfExportEntities();
  const exportLines = collectDxfExportLines();
  const exportCircles = collectDxfExportCircleEntities();
  const exportArcs = collectDxfExportArcEntities();
  const exportTexts = collectDxfExportTextEntities();
  const layerNames = collectDxfLayerNames(exportEntities);

  const dxfLines = [];
  dxfLines.push("0", "SECTION", "2", "HEADER");
  dxfLines.push("9", "$ACADVER", "1", "AC1009");
  dxfLines.push("0", "ENDSEC");

  dxfLines.push("0", "SECTION", "2", "TABLES");
  dxfLines.push("0", "TABLE", "2", "LTYPE", "70", "1");
  dxfLines.push("0", "LTYPE", "2", "CONTINUOUS", "70", "0", "3", "Solid line", "72", "65", "73", "0", "40", "0.0");
  dxfLines.push("0", "ENDTAB");
  dxfLines.push("0", "TABLE", "2", "LAYER", "70", String(layerNames.length));
  layerNames.forEach((layerName) => {
    dxfLines.push("0", "LAYER");
    dxfLines.push("2", layerName);
    dxfLines.push("70", "0");
    dxfLines.push("62", "7");
    dxfLines.push("6", "CONTINUOUS");
  });
  dxfLines.push("0", "ENDTAB");
  dxfLines.push("0", "ENDSEC");

  dxfLines.push("0", "SECTION", "2", "BLOCKS");
  dxfLines.push("0", "ENDSEC");

  dxfLines.push("0", "SECTION", "2", "ENTITIES");
  exportLines.forEach((line) => {
    dxfLines.push("0", "LINE");
    dxfLines.push("8", getDxfLayerNameForLine(line));
    dxfLines.push("10", formatDxfNumber(dxfXUnitsToMm(line.p1.x)));
    dxfLines.push("20", formatDxfNumber(dxfYUnitsToMm(line.p1.y)));
    dxfLines.push("30", formatDxfNumber(0));
    dxfLines.push("11", formatDxfNumber(dxfXUnitsToMm(line.p2.x)));
    dxfLines.push("21", formatDxfNumber(dxfYUnitsToMm(line.p2.y)));
    dxfLines.push("31", formatDxfNumber(0));
  });
  exportCircles.forEach((entity) => {
    dxfLines.push("0", "CIRCLE");
    dxfLines.push("8", getDxfLayerNameForEntity(entity));
    dxfLines.push("10", formatDxfNumber(dxfXUnitsToMm(entity.center.x)));
    dxfLines.push("20", formatDxfNumber(dxfYUnitsToMm(entity.center.y)));
    dxfLines.push("30", formatDxfNumber(0));
    dxfLines.push("40", formatDxfNumber(unitsToMm(entity.radius)));
  });
  exportArcs.forEach((entity) => {
    const dxfAngles = getDxfArcAngles(entity.startAngleDeg || 0, entity.endAngleDeg || 0);
    dxfLines.push("0", "ARC");
    dxfLines.push("8", getDxfLayerNameForEntity(entity));
    dxfLines.push("10", formatDxfNumber(dxfXUnitsToMm(entity.center.x)));
    dxfLines.push("20", formatDxfNumber(dxfYUnitsToMm(entity.center.y)));
    dxfLines.push("30", formatDxfNumber(0));
    dxfLines.push("40", formatDxfNumber(unitsToMm(entity.radius)));
    dxfLines.push("50", formatDxfNumber(dxfAngles.start));
    dxfLines.push("51", formatDxfNumber(dxfAngles.end));
  });
  exportTexts.forEach((entity) => {
    dxfLines.push("0", "TEXT");
    dxfLines.push("8", getDxfLayerNameForEntity(entity));
    dxfLines.push("10", formatDxfNumber(dxfXUnitsToMm(entity.x)));
    dxfLines.push("20", formatDxfNumber(dxfYUnitsToMm(entity.y)));
    dxfLines.push("30", formatDxfNumber(0));
    dxfLines.push("40", formatDxfNumber(unitsToMm(entity.height)));
    dxfLines.push("1", sanitizeDxfText(entity.text || ""));
  });
  dxfLines.push("0", "ENDSEC", "0", "EOF");

  return `${dxfLines.join("\r\n")}\r\n`;
}

function getDxfExportSummary() {
  const exportEntities = collectDxfExportEntities();
  const exportLines = collectDxfExportLines();
  const exportCircles = collectDxfExportCircleEntities();
  const exportArcs = collectDxfExportArcEntities();
  const exportTexts = collectDxfExportTextEntities();
  const bounds = getDxfBoundsMm(exportLines, exportTexts, exportCircles, exportArcs);

  return {
    fileVersion: CURRENT_FILE_VERSION,
    unitMm: UNIT_MM,
    exportedLineCount: exportLines.length,
    exportedCircleCount: exportCircles.length,
    exportedArcCount: exportArcs.length,
    exportedTextCount: exportTexts.length,
    visibleEntityCount: exportEntities.length,
    layerCount: collectDxfLayerNames(exportEntities).length,
    boundsMm: bounds,
    minX: bounds ? bounds.minX : null,
    minY: bounds ? bounds.minY : null,
    maxX: bounds ? bounds.maxX : null,
    maxY: bounds ? bounds.maxY : null,
  };
}

function validateDxfText(dxfText = buildDxfText()) {
  const text = String(dxfText);
  const rawLines = text.endsWith("\r\n")
    ? text.slice(0, -2).split("\r\n")
    : text.split("\r\n");
  const lineCount = countDxfEntityRecords(text, "LINE");
  const textCount = countDxfEntityRecords(text, "TEXT");
  const sectionCount = countDxfEntityRecords(text, "SECTION");
  const endsecCount = countDxfEntityRecords(text, "ENDSEC");
  const groupCode100Count = countDxfGroupCode(text, "100");
  const hasOnlyAscii = /^[\x00-\x7F]*$/.test(text);
  const hasCrlf = text.includes("\r\n");
  const hasBareLf = /(^|[^\r])\n/.test(text);
  const hasBareCr = /\r(?!\n)/.test(text);
  const hasEof = hasDxfEntityRecord(text, "EOF");
  const hasEvenGroupCodeValueLines = rawLines.length % 2 === 0;
  const hasValidGroupCodes = rawLines.every((line, index) =>
    index % 2 !== 0 || /^-?\d+$/.test(line)
  );
  const hasInsunits = text.includes("$INSUNITS");

  return {
    ok:
      sectionCount === endsecCount &&
      hasEof &&
      hasEvenGroupCodeValueLines &&
      hasValidGroupCodes &&
      hasOnlyAscii &&
      hasCrlf &&
      !hasBareLf &&
      !hasBareCr &&
      !hasInsunits &&
      groupCode100Count === 0,
    sectionCount,
    endsecCount,
    hasEof,
    lineCount,
    textCount,
    hasEvenGroupCodeValueLines,
    hasValidGroupCodes,
    hasOnlyAscii,
    hasCrlf,
    hasBareLf,
    hasBareCr,
    hasInsunits,
    groupCode100Count,
  };
}

function explodeDimensionToDxfPrimitives(entity) {
  const p1=entity.p1,p2=entity.p2,o=entity.offsetPoint;
  const dx=p2.x-p1.x,dy=p2.y-p1.y; const len=Math.hypot(dx,dy)||1; const nx=-dy/len, ny=dx/len;
  const d1=(o.x-p1.x)*nx+(o.y-p1.y)*ny; const d2=(o.x-p2.x)*nx+(o.y-p2.y)*ny;
  const o1={x:roundToUnit(p1.x+nx*d1),y:roundToUnit(p1.y+ny*d1)}; const o2={x:roundToUnit(p2.x+nx*d2),y:roundToUnit(p2.y+ny*d2)};
  const tick=Math.max(1,Math.round((entity.tickSize||250)*0.25));
  const tx=roundToUnit(nx*tick), ty=roundToUnit(ny*tick);
  return {
    lines:[
      {layerId:entity.layerId,p1,p2:o1},{layerId:entity.layerId,p1:p2,p2:o2},{layerId:entity.layerId,p1:o1,p2:o2},
      {layerId:entity.layerId,p1:{x:o1.x-tx,y:o1.y-ty},p2:{x:o1.x+tx,y:o1.y+ty}},
      {layerId:entity.layerId,p1:{x:o2.x-tx,y:o2.y-ty},p2:{x:o2.x+tx,y:o2.y+ty}},
    ],
    text:{type:"text",layerId:entity.layerId,x:roundToUnit((o1.x+o2.x)/2),y:roundToUnit((o1.y+o2.y)/2),height:entity.textHeight||250,text:getDimensionDisplayText(entity)}
  };
}

function collectDxfExportEntities() {
  return state.entities.filter((entity) =>
    entity &&
    isLayerVisible(entity.layerId) &&
    (entity.type === "line" || entity.type === "rect" || entity.type === "circle" || entity.type === "arc" || entity.type === "filledRegion" || entity.type === "text" || entity.type === "dimension")
  );
}

function collectDxfExportLines() {
  return collectDxfExportEntities().flatMap((entity) =>
    entity.type === "line"
      ? [entity]
      : (entity.type === "rect"
        ? rectToOutlineLines(entity)
        : (entity.type === "filledRegion"
          ? filledRegionToOutlineLines(entity)
          : (entity.type === "dimension" ? explodeDimensionToDxfPrimitives(entity).lines : [])))
  );
}

function collectDxfExportTextEntities() {
  return collectDxfExportEntities().flatMap((entity) => entity.type === "text" ? [entity] : (entity.type === "dimension" ? [explodeDimensionToDxfPrimitives(entity).text] : []));
}

function collectDxfExportCircleEntities() {
  return collectDxfExportEntities().filter((entity) => entity.type === "circle");
}

function collectDxfExportArcEntities() {
  return collectDxfExportEntities().filter((entity) => entity.type === "arc");
}

function filledRegionToOutlineLines(entity) {
  if (!entity || !Array.isArray(entity.points) || entity.points.length < 3) {
    return [];
  }
  const lines = [];
  for (let i = 0; i < entity.points.length; i += 1) {
    const p1 = entity.points[i];
    const p2 = entity.points[(i + 1) % entity.points.length];
    lines.push({ type: "line", layerId: entity.layerId, p1, p2 });
  }
  return lines;
}

function collectDxfLayerNames(entities) {
  const names = new Set(["0"]);
  entities.forEach((entity) => {
    names.add(getDxfLayerNameForEntity(entity));
  });
  return [...names];
}

function getDxfLayerNameForLine(line) {
  const layer = getLayerById(line.layerId);
  return sanitizeDxfLayerName(layer ? layer.name : "0");
}

function getDxfLayerNameForEntity(entity) {
  const layer = getLayerById(entity.layerId);
  return sanitizeDxfLayerName(layer ? layer.name : "0");
}

function createMinimalDxfFixture() {
  const layerId = "debug-dxf-fixture-layer";
  const line = { ...createDebugFixtureLineMm(0, 0, 1000, 0), layerId };
  const layer = { id: layerId, name: "Layer 1", color: "#2e3135", visible: true, locked: false };
  const previousEntities = state.entities;
  const previousLayers = state.layers;

  try {
    state.layers = [layer];
    state.entities = [line];
    const dxfText = buildDxfText();
    const validation = validateDxfText(dxfText);
    const summary = getDxfExportSummary();

    return {
      dxfText,
      validation,
      summary,
    };
  } finally {
    state.entities = previousEntities;
    state.layers = previousLayers;
  }
}

function getDxfBoundsMm(lines, textEntities = [], circles = [], arcs = []) {
  if (!lines.length && !textEntities.length && !circles.length && !arcs.length) {
    return null;
  }

  const xs = [];
  const ys = [];
  lines.forEach((line) => {
    xs.push(dxfXUnitsToMm(line.p1.x), dxfXUnitsToMm(line.p2.x));
    ys.push(dxfYUnitsToMm(line.p1.y), dxfYUnitsToMm(line.p2.y));
  });
  textEntities.forEach((entity) => {
    xs.push(dxfXUnitsToMm(entity.x));
    ys.push(dxfYUnitsToMm(entity.y));
  });
  circles.forEach((entity) => {
    xs.push(dxfXUnitsToMm(entity.center.x - entity.radius), dxfXUnitsToMm(entity.center.x + entity.radius));
    ys.push(dxfYUnitsToMm(entity.center.y - entity.radius), dxfYUnitsToMm(entity.center.y + entity.radius));
  });
  arcs.forEach((entity) => {
    xs.push(dxfXUnitsToMm(entity.center.x - entity.radius), dxfXUnitsToMm(entity.center.x + entity.radius));
    ys.push(dxfYUnitsToMm(entity.center.y - entity.radius), dxfYUnitsToMm(entity.center.y + entity.radius));
  });

  return {
    minX: Number(formatDxfNumber(Math.min(...xs))),
    minY: Number(formatDxfNumber(Math.min(...ys))),
    maxX: Number(formatDxfNumber(Math.max(...xs))),
    maxY: Number(formatDxfNumber(Math.max(...ys))),
  };
}

function dxfXUnitsToMm(x) {
  return unitsToMm(x);
}

function dxfYUnitsToMm(y) {
  return -unitsToMm(y);
}

function dxfAngleDegFromCanvasAngle(angleDeg) {
  return ((360 - (Number(angleDeg) || 0)) % 360 + 360) % 360;
}

function getDxfArcAngles(startCanvasDeg, endCanvasDeg) {
  return {
    start: dxfAngleDegFromCanvasAngle(endCanvasDeg),
    end: dxfAngleDegFromCanvasAngle(startCanvasDeg),
  };
}

function sanitizeDxfLayerName(value) {
  const sanitized = String(value || "")
    .replace(/[^A-Za-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "0";
}

function sanitizeDxfText(value) {
  return String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[\x00-\x1F\x7F]/g, "")
    .replace(/[^\x20-\x7E]/g, "?")
    .trim();
}

function formatDxfNumber(value) {
  return Number(value).toFixed(3);
}

function hasDxfEntityRecord(dxfText, recordType) {
  const lines = String(dxfText).split("\r\n");
  return lines.some((line, index) => line === "0" && lines[index + 1] === recordType);
}

function countDxfEntityRecords(dxfText, recordType) {
  const lines = String(dxfText).split("\r\n");
  return lines.filter((line, index) => line === "0" && lines[index + 1] === recordType).length;
}

function countDxfGroupCode(dxfText, groupCode) {
  return String(dxfText).split("\r\n").filter((line, index) => index % 2 === 0 && line === groupCode).length;
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

  if (isDeleteLayerDialogOpen()) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDeleteLayerDialog();
      setStatus("Layer deletion cancelled.");
    }
    return;
  }

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
    if (uiState.rectEdgeEditDraft) {
      uiState.rectEdgeEditDraft = null;
      setStatus("Rectangle edge resize cancelled.");
      draw();
      renderStatusPanel();
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
    if (uiState.circleDraft || uiState.activeTool === "circle") {
      uiState.circleDraft = null;
      uiState.activeTool = "select";
      syncAfterStateChange(false);
      setStatus("Circle cancelled.");
      return;
    }
    if (uiState.arcDraft || uiState.activeTool === "arc") {
      uiState.arcDraft = null;
      uiState.activeTool = "select";
      syncAfterStateChange(false);
      setStatus("Arc cancelled.");
      return;
    }
    if (uiState.filledRegionDraft || uiState.activeTool === "filledRegion") {
      uiState.filledRegionDraft = null;
      uiState.activeTool = "select";
      syncAfterStateChange(false);
      setStatus("Filled Region cancelled.");
      return;
    }
    if (uiState.alignDraft || uiState.activeTool === "align") {
      cancelAlign();
      return;
    }
    if (uiState.extendDraft || uiState.activeTool === "extend") {
      cancelExtend();
      return;
    }
    if (uiState.filletDraft || uiState.activeTool === "fillet") {
      cancelFillet();
      return;
    }
    if (uiState.matchPropertiesSourceId || uiState.activeTool === "matchProperties") {
      cancelMatchProperties();
      return;
    }
    if (uiState.dimensionDraft || uiState.activeTool === "dimension") {
      uiState.dimensionDraft = null;
      uiState.activeTool = "select";
      syncAfterStateChange(false);
      setStatus("Aligned Dimension cancelled.");
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

  if (uiState.filledRegionDraft && activeTag !== "INPUT" && activeTag !== "TEXTAREA" && event.key === "Enter") {
    event.preventDefault();
    finishFilledRegionDraft();
    return;
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

function setActiveRibbonTab(tabName) {
  ribbonTabs.forEach((tab) => {
    const isActive = tab.dataset.ribbonTab === tabName;
    tab.classList.toggle("is-active", isActive);
  });
  ribbonPages.forEach((page) => {
    const isActive = page.dataset.ribbonPage === tabName;
    page.classList.toggle("is-active", isActive);
    page.hidden = !isActive;
  });
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
  toolButtons.circle.addEventListener("click", () => setActiveTool("circle"));
  toolButtons.arc.addEventListener("click", () => setActiveTool("arc"));
  toolButtons.filledRegion.addEventListener("click", () => setActiveTool("filledRegion"));
  toolButtons.text.addEventListener("click", () => setActiveTool("text"));
  toolButtons.dimension.addEventListener("click", () => setActiveTool("dimension"));
  toolButtons.matchProperties.addEventListener("click", () => setActiveTool("matchProperties"));
  toolButtons.move.addEventListener("click", () => setActiveTool("move"));
  toolButtons.copy.addEventListener("click", () => setActiveTool("copy"));
  toolButtons.align.addEventListener("click", () => setActiveTool("align"));
  toolButtons.extend.addEventListener("click", () => setActiveTool("extend"));
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
  deleteLayerButton.addEventListener("click", deleteActiveLayer);
  moveLayerObjectsButton.addEventListener("click", () => {
    removeLayerAndOptionallyEntities(uiState.deleteLayerDialogLayerId, "move");
  });
  deleteLayerAndObjectsButton.addEventListener("click", () => {
    removeLayerAndOptionallyEntities(uiState.deleteLayerDialogLayerId, "delete");
  });
  cancelDeleteLayerButton.addEventListener("click", () => {
    closeDeleteLayerDialog();
    setStatus("Layer deletion cancelled.");
  });
  if (themeToggleButton) {
    themeToggleButton.addEventListener("click", toggleTheme);
  }
  ribbonTabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveRibbonTab(tab.dataset.ribbonTab));
  });

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
setActiveRibbonTab("architecture");
initializeTheme();
initializeView();

window.DraftLiteDebug = {
  getState() {
    return snapshotState();
  },

  getUnitConfig() {
    return getUnitConfig();
  },

  getCurrentDocumentSummary() {
    return getCurrentDocumentSummary();
  },

  createLegacyUnitFixture() {
    return createLegacyUnitFixture();
  },

  loadLegacyUnitFixture() {
    return loadLegacyUnitFixture();
  },

  getUiState() {
    return {
      activeTool: uiState.activeTool,
      matchPropertiesSourceId: uiState.matchPropertiesSourceId,
      hasMatchPropertiesSource: Boolean(uiState.matchPropertiesSourceId),
      selectedEntityIds: [...state.selectedEntityIds],
      lineDraft: Boolean(uiState.lineDraft),
      rectangleDraft: Boolean(uiState.rectangleDraft),
      transformDraft: Boolean(uiState.transformDraft),
      selectDragDraft: Boolean(uiState.selectDragDraft),
      gripEditDraft: Boolean(uiState.gripEditDraft),
      rectEdgeEditDraft: Boolean(uiState.rectEdgeEditDraft),
      alignDraft: uiState.alignDraft ? deepClone(uiState.alignDraft) : null,
      extendDraft: uiState.extendDraft ? deepClone(uiState.extendDraft) : null,
      filletDraft: uiState.filletDraft ? deepClone(uiState.filletDraft) : null,
      hoverRectEdge: uiState.hoverRectEdge ? deepClone(uiState.hoverRectEdge) : null,
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

  getLayers() {
    return deepClone(state.layers);
  },

  addLayer() {
    addLayer();
    return deepClone(state.layers);
  },

  deleteActiveLayer(mode = "delete") {
    const layerId = state.activeLayerId;
    if (!layerId) {
      return false;
    }
    return removeLayerAndOptionallyEntities(layerId, mode === "move" ? "move" : "delete");
  },

  createTextFixture() {
    pushUndoState();
    const english = createDebugFixtureTextMm(100, 100, "NOTE", 25);
    const japanese = createDebugFixtureTextMm(180, 120, "注記", 25);
    state.entities.push(english, japanese);
    state.selectedEntityIds = [english.id, japanese.id];
    clearTransientState();
    syncAfterStateChange();
    return deepClone({ english, japanese });
  },

  createCircleFixture() {
    pushUndoState();
    const entity = { id: createEntityId(), type: "circle", layerId: state.activeLayerId, center: { x: mmToUnits(500), y: mmToUnits(500) }, radius: mmToUnits(250) };
    state.entities.push(entity);
    state.selectedEntityIds = [entity.id];
    syncAfterStateChange();
    return deepClone(entity);
  },

  createArcFixture() {
    pushUndoState();
    const entity = { id: createEntityId(), type: "arc", layerId: state.activeLayerId, center: { x: mmToUnits(1200), y: mmToUnits(500) }, radius: mmToUnits(300), startAngleDeg: 0, endAngleDeg: 90 };
    state.entities.push(entity);
    state.selectedEntityIds = [entity.id];
    syncAfterStateChange();
    return deepClone(entity);
  },

  createFilledRegionFixture() {
    pushUndoState();
    const entity = {
      id: createEntityId(),
      type: "filledRegion",
      layerId: state.activeLayerId,
      points: [
        { x: mmToUnits(300), y: mmToUnits(1300) },
        { x: mmToUnits(700), y: mmToUnits(1300) },
        { x: mmToUnits(600), y: mmToUnits(1600) },
      ],
      fill: true,
      fillColor: normalizeColor(getLayerById(state.activeLayerId)?.color || "#5e6b78"),
    };
    state.entities.push(entity);
    state.selectedEntityIds = [entity.id];
    syncAfterStateChange();
    return deepClone(entity);
  },

  getShapeSummary() {
    return {
      circleCount: state.entities.filter((entity) => entity.type === "circle").length,
      arcCount: state.entities.filter((entity) => entity.type === "arc").length,
      filledRegionCount: state.entities.filter((entity) => entity.type === "filledRegion").length,
    };
  },

  getAnnotationSummary() {
    const texts = state.entities.filter((entity) => entity.type === "text");
    const dimensions = state.entities.filter((entity) => entity.type === "dimension");
    return {
      textCount: texts.length,
      dimensionCount: dimensions.length,
      byLayer: texts.reduce((acc, entity) => {
        acc[entity.layerId] = (acc[entity.layerId] || 0) + 1;
        return acc;
      }, {}),
    };
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

  createDimensionFixture() {
    pushUndoState();
    const d = { id:createEntityId(), type:"dimension", layerId:state.activeLayerId, p1:{x:mmToUnits(0),y:mmToUnits(0)}, p2:{x:mmToUnits(1000),y:mmToUnits(0)}, offsetPoint:{x:mmToUnits(0),y:mmToUnits(200)}, textOverride:"", textHeight:250, tickSize:250, color:"", precision:0 };
    state.entities.push(d); state.selectedEntityIds=[d.id]; syncAfterStateChange(); return deepClone(d);
  },

  getDimensionSummary() {
    const dimensions = state.entities.filter((entity)=>entity.type==="dimension");
    const first=dimensions[0];
    return { dimensionCount: dimensions.length, firstDimensionMeasuredMm: first ? unitsToMm(Math.hypot(first.p2.x-first.p1.x, first.p2.y-first.p1.y)) : null, precision: first ? first.precision : null, hasTextOverride: first ? Boolean((first.textOverride||"").trim()) : false };
  },

  createLineMm(x1Mm, y1Mm, x2Mm, y2Mm) {
    pushUndoState();
    state.entities.push(createDebugFixtureLineMm(x1Mm, y1Mm, x2Mm, y2Mm));
    state.selectedEntityIds = [];
    clearTransientState();
    syncAfterStateChange();
    setStatus("Line created by debug helper.");
    return true;
  },

  createRectMm(xMm, yMm, widthMm, heightMm, name = "Box") {
    const result = createRectangleMm(xMm, yMm, xMm + widthMm, yMm + heightMm);
    if (result) { const rect = state.entities[state.entities.length-1]; if (rect && rect.type === "rect") rect.name = name || "Box"; syncAfterStateChange(); }
    return result;
  },

  getRectEdgeHitForRect(rectId, edge) {
    const rect = getEntityById(rectId);
    if (!rect || rect.type !== "rect") return null;
    const edgeDef = getRectEdges(rect).find((entry) => entry.edge === edge);
    if (!edgeDef) return null;
    const worldPoint = roundWorldPoint({
      x: (edgeDef.p1.x + edgeDef.p2.x) / 2,
      y: (edgeDef.p1.y + edgeDef.p2.y) / 2,
    });
    return findRectEdgeAtPoint(worldPoint);
  },

  resizeRectEdgeForTest(rectId, edge, deltaMm) {
    const rect = getEntityById(rectId);
    if (!rect || rect.type !== "rect") return false;
    const deltaUnits = mmToUnits(deltaMm);
    const edgeDef = getRectEdges(rect).find((entry) => entry.edge === edge);
    if (!edgeDef) return false;
    const startPoint = roundWorldPoint({
      x: (edgeDef.p1.x + edgeDef.p2.x) / 2,
      y: (edgeDef.p1.y + edgeDef.p2.y) / 2,
    });
    const movedPoint = roundWorldPoint({
      x: startPoint.x + (edge === "left" || edge === "right" ? deltaUnits : 0),
      y: startPoint.y + (edge === "top" || edge === "bottom" ? deltaUnits : 0),
    });
    const nextRect = getResizedRectFromDraft(
      { entityId: rect.id, edge, originalRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, startPoint, currentPoint: movedPoint },
      movedPoint
    );
    pushUndoState();
    rect.x = nextRect.x;
    rect.y = nextRect.y;
    rect.width = nextRect.width;
    rect.height = nextRect.height;
    syncAfterStateChange();
    return deepClone(rect);
  },

  explodeSelectedRects() {
    return explodeSelectedRects();
  },

  buildDxfText() {
    return buildDxfText();
  },

  validateDxfText(dxfText) {
    return validateDxfText(dxfText);
  },

  getDxfExportSummary() {
    return getDxfExportSummary();
  },

  createMinimalDxfFixture() {
    return createMinimalDxfFixture();
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

window.DraftLiteAgent = {
  version: "0.1",

  execute(command) {
    return executeAgentCommand(command || {});
  },

  executeMany(commands) {
    return executeManyAgentCommands(commands);
  },

  clear() {
    return executeAgentCommand({ action: "clear" });
  },

  fitAll() {
    return executeAgentCommand({ action: "fitAll" });
  },

  getState() {
    return snapshotState();
  },

  getEntities() {
    return deepClone(state.entities);
  },

  getSummary() {
    return getAgentSummary();
  },

  getBounds() {
    return boundsUnitsToMm(getAgentBoundsUnits());
  },

  validateDrawing(options = {}) {
    return validateDrawingState(options);
  },

  createRect(command) {
    return executeAgentCommand({ ...(command || {}), action: "rect" });
  },

  createLine(command) {
    return executeAgentCommand({ ...(command || {}), action: "line" });
  },

  createText(command) {
    return executeAgentCommand({ ...(command || {}), action: "text" });
  },

  setLayer(command) {
    return executeAgentCommand({ ...(command || {}), action: "setLayer" });
  },
};

bindDebugBridge();
