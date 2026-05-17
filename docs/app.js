"use strict";

const STORAGE_KEY = "draftlite.autosave.v1";
const FILE_VERSION = 1;
const MM_PER_UNIT = 0.5;
const GRID_MINOR_UNIT = 200;
const GRID_MAJOR_UNIT = 2000;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 50;
const DOUBLE_CLICK_MS = 320;
const CLICK_SELECT_THRESHOLD_PX = 4;

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
  move: document.getElementById("moveButton"),
  copy: document.getElementById("copyButton"),
  fillet: document.getElementById("filletButton"),
};

const deleteButton = document.getElementById("deleteButton");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const fitAllButton = document.getElementById("fitAllButton");
const saveJsonButton = document.getElementById("saveJsonButton");
const loadJsonButton = document.getElementById("loadJsonButton");
const exportDxfButton = document.getElementById("exportDxfButton");
const addLayerButton = document.getElementById("addLayerButton");

const ctx = canvas.getContext("2d");

let state = createInitialState();
let history = {
  undoStack: [],
  redoStack: [],
};

const uiState = {
  activeTool: "select",
  lineDraft: null,
  transformDraft: null,
  gripEditDraft: null,
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
  if (uiState.filletDraft) {
    state.selectedEntityIds = [];
  }
  uiState.lineDraft = null;
  uiState.transformDraft = null;
  uiState.gripEditDraft = null;
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

function collectSnapCandidates(worldPoint) {
  return state.entities
    .filter((entity) => entity.type === "line" && isLayerVisible(entity.layerId))
    .flatMap((entity) => {
      const midpoint = getLineMidpoint(entity);
      return [
        {
          kind: "endpoint",
          point: entity.p1,
          distancePx: distanceScreenPx(worldPoint, entity.p1),
        },
        {
          kind: "endpoint",
          point: entity.p2,
          distancePx: distanceScreenPx(worldPoint, entity.p2),
        },
        {
          kind: "midpoint",
          point: midpoint,
          distancePx: distanceScreenPx(worldPoint, midpoint),
        },
      ];
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

function endTransformDraft(message = `${capitalize(uiState.activeTool)} command ended.`) {
  clearTransformPreviewTimer();
  uiState.transformDraft = null;
  state.selectedEntityIds = [];
  uiState.activeTool = "select";
  syncAfterStateChange(false);
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
  if (!entity || entity.type !== "line") {
    return null;
  }
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

  state.layers.forEach((layer) => {
    const row = document.createElement("div");
    row.className = `layer-row${layer.id === state.activeLayerId ? " is-active" : ""}`;

    const top = document.createElement("div");
    top.className = "layer-row-top";

    const nameWrap = document.createElement("div");
    nameWrap.className = "layer-name";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = layer.name;
    nameInput.setAttribute("aria-label", `${layer.name} name`);
    nameInput.addEventListener("change", () => {
      const nextName = nameInput.value.trim() || layer.name;
      if (nextName === layer.name) {
        renderLayersPanel();
        return;
      }
      pushUndoState();
      layer.name = nextName;
      syncAfterStateChange();
      setStatus(`Renamed ${nextName}.`);
    });
    nameWrap.appendChild(nameInput);

    const activeLabel = document.createElement("label");
    activeLabel.className = "layer-active";
    const activeRadio = document.createElement("input");
    activeRadio.type = "radio";
    activeRadio.name = "activeLayer";
    activeRadio.checked = layer.id === state.activeLayerId;
    activeRadio.addEventListener("change", () => {
      state.activeLayerId = layer.id;
      syncAfterStateChange();
      setStatus(`${layer.name} is active.`);
    });
    activeLabel.appendChild(activeRadio);
    activeLabel.append("Active");

    top.append(nameWrap, activeLabel);

    const controls = document.createElement("div");
    controls.className = "layer-controls";

    const visibleLabel = document.createElement("label");
    visibleLabel.className = "layer-toggle";
    const visibleInput = document.createElement("input");
    visibleInput.type = "checkbox";
    visibleInput.checked = layer.visible;
    visibleInput.addEventListener("change", () => {
      pushUndoState();
      layer.visible = visibleInput.checked;
      if (!layer.visible) {
        state.selectedEntityIds = state.selectedEntityIds.filter((entityId) => {
          const entity = getEntityById(entityId);
          return entity && isLayerVisible(entity.layerId);
        });
      }
      syncAfterStateChange();
      setStatus(`${layer.name} ${layer.visible ? "shown" : "hidden"}.`);
    });
    visibleLabel.append(visibleInput, "Visible");

    const lockLabel = document.createElement("label");
    lockLabel.className = "layer-toggle";
    const lockInput = document.createElement("input");
    lockInput.type = "checkbox";
    lockInput.checked = layer.locked;
    lockInput.addEventListener("change", () => {
      pushUndoState();
      layer.locked = lockInput.checked;
      if (layer.locked) {
        state.selectedEntityIds = state.selectedEntityIds.filter((entityId) => {
          const entity = getEntityById(entityId);
          return entity && canSelectEntity(entity);
        });
      }
      syncAfterStateChange();
      setStatus(`${layer.name} ${layer.locked ? "locked" : "unlocked"}.`);
    });
    lockLabel.append(lockInput, "Lock");

    const colorLabel = document.createElement("label");
    colorLabel.className = "layer-color";
    colorLabel.textContent = "Color";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.value = normalizeColor(layer.color);
    colorInput.addEventListener("change", () => {
      if (layer.color === colorInput.value) {
        return;
      }
      pushUndoState();
      layer.color = colorInput.value;
      syncAfterStateChange();
      setStatus(`${layer.name} color updated.`);
    });
    colorLabel.appendChild(colorInput);

    controls.append(visibleLabel, lockLabel, colorLabel);
    row.append(top, controls);
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

  if (!state.selectedEntityIds.length) {
    const empty = document.createElement("p");
    empty.className = "panel-empty";
    empty.textContent = "No entity selected. Use Select to inspect line geometry.";
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

  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(
    selectedEntities.map((entity) => ({
      ...entity,
      lengthMm:
        entity.type === "line"
          ? unitsToMm(Math.round(Math.hypot(entity.p2.x - entity.p1.x, entity.p2.y - entity.p1.y)))
          : null,
    })),
    null,
    2
  );
  propertiesPanel.appendChild(pre);
}

function renderStatusPanel() {
  const snapLabel = uiState.snapMarker
    ? uiState.snapMarker.kind === "midpoint"
      ? "Midpoint"
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
    : uiState.gripEditDraft
      ? "Select: edit endpoint"
    : uiState.filletDraft
      ? "Fillet: pick side to keep on second line"
    : uiState.lineDraft
    ? "Line: specify next point"
    : uiState.transformDraft
      ? `${capitalize(uiState.transformDraft.mode)}: specify second point`
      : uiState.activeTool === "line"
        ? "Line: specify first point"
        : uiState.activeTool === "move"
          ? "Move: specify base point"
          : uiState.activeTool === "copy"
            ? "Copy: specify base point"
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
    }
  });

  if (uiState.lineDraft) {
    drawDraftLine(uiState.lineDraft.start, uiState.lineDraft.previewPoint || uiState.hoverWorld);
  }

  if (uiState.transformDraft) {
    drawTransformPreview(uiState.transformDraft);
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
  if (!state.settings.showGrid) {
    return;
  }

  const worldTopLeft = screenToWorld({ x: 0, y: 0 });
  const worldBottomRight = screenToWorld({ x: width, y: height });
  const startXMinor = Math.floor(worldTopLeft.x / GRID_MINOR_UNIT) * GRID_MINOR_UNIT;
  const endXMinor = Math.ceil(worldBottomRight.x / GRID_MINOR_UNIT) * GRID_MINOR_UNIT;
  const startYMinor = Math.floor(worldTopLeft.y / GRID_MINOR_UNIT) * GRID_MINOR_UNIT;
  const endYMinor = Math.ceil(worldBottomRight.y / GRID_MINOR_UNIT) * GRID_MINOR_UNIT;

  ctx.save();
  for (let x = startXMinor; x <= endXMinor; x += GRID_MINOR_UNIT) {
    const screen = worldToScreen({ x, y: 0 });
    const isMajor = x % GRID_MAJOR_UNIT === 0;
    ctx.strokeStyle = isMajor ? "rgba(123, 96, 64, 0.12)" : "rgba(123, 96, 64, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(screen.x, 0);
    ctx.lineTo(screen.x, height);
    ctx.stroke();
  }
  for (let y = startYMinor; y <= endYMinor; y += GRID_MINOR_UNIT) {
    const screen = worldToScreen({ x: 0, y });
    const isMajor = y % GRID_MAJOR_UNIT === 0;
    ctx.strokeStyle = isMajor ? "rgba(123, 96, 64, 0.12)" : "rgba(123, 96, 64, 0.05)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, screen.y);
    ctx.lineTo(width, screen.y);
    ctx.stroke();
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
    if (entity.type !== "line") {
      return;
    }
    const previewLine = {
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
    drawPreviewLineEntity(previewLine);
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
    .filter((entity) => entity && entity.type === "line" && canSelectEntity(entity));
}

function canStartTransformTool() {
  return getSelectedTransformableEntities().length > 0;
}

function startTransformDraft(worldPoint) {
  const selectedEntities = getSelectedTransformableEntities();
  if (!selectedEntities.length) {
    setStatus("Select at least one visible, unlocked line before using Move or Copy.");
    return false;
  }

  uiState.transformDraft = {
    mode: uiState.activeTool,
    startPoint: worldPoint,
    currentPoint: worldPoint,
    numericInputBuffer: "",
    entityIds: selectedEntities.map((entity) => entity.id),
    entities: deepClone(selectedEntities),
  };
  updateTransformDraftStatus(
    `${capitalize(uiState.activeTool)} start set at ${formatWorldPoint(worldPoint)}.`
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
    state.entities = state.entities.map((entity) => {
      if (!transformDraft.entityIds.includes(entity.id)) {
        return entity;
      }
      if (!canSelectEntity(entity)) {
        return entity;
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
    });
  } else if (transformDraft.mode === "copy") {
    const sourceEntities = transformDraft.entities.filter((entity) => canSelectEntity(entity));
    const newEntities = sourceEntities.map((entity) => ({
      ...deepClone(entity),
      id: createEntityId(),
      p1: {
        x: entity.p1.x + offset.dx,
        y: entity.p1.y + offset.dy,
      },
      p2: {
        x: entity.p2.x + offset.dx,
        y: entity.p2.y + offset.dy,
      },
    }));
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
      if (entity.type !== "line") {
        return false;
      }
      return rect.isCrossing ? doesLineCrossRect(entity, rect) : isLineFullyInsideRect(entity, rect);
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
  if (entity.type !== "line") {
    return false;
  }
  const distancePx = distancePointToSegmentScreenPx(worldPoint, entity.p1, entity.p2);
  return distancePx <= state.settings.snapTolerancePx;
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

  if (uiState.activeTool === "move" || uiState.activeTool === "copy") {
    if (!uiState.transformDraft) {
      startTransformDraft(worldPoint);
      return;
    }
    uiState.transformDraft.currentPoint = worldPoint;
    applyTransformDraft();
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
    setStatus("Select at least one visible, unlocked line before using Move or Copy.");
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
  const visibleLines = state.entities.filter(
    (entity) => entity.type === "line" && isLayerVisible(entity.layerId)
  );

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
      endTransformDraft(`${capitalize(uiState.activeTool)} cancelled.`);
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
  toolButtons.move.addEventListener("click", () => setActiveTool("move"));
  toolButtons.copy.addEventListener("click", () => setActiveTool("copy"));
  toolButtons.fillet.addEventListener("click", () => setActiveTool("fillet"));
  deleteButton.addEventListener("click", deleteSelectedEntities);
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  fitAllButton.addEventListener("click", fitAll);
  saveJsonButton.addEventListener("click", saveJsonToFile);
  loadJsonButton.addEventListener("click", () => loadJsonInput.click());
  exportDxfButton.addEventListener("click", exportDxf);
  addLayerButton.addEventListener("click", addLayer);

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
initializeView();
