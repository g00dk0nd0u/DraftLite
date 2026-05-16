"use strict";

const STORAGE_KEY = "draftlite.autosave.v1";
const FILE_VERSION = 1;
const MM_PER_UNIT = 0.5;
const GRID_MINOR_UNIT = 200;
const GRID_MAJOR_UNIT = 2000;
const MIN_ZOOM = 0.02;
const MAX_ZOOM = 50;
const DOUBLE_CLICK_MS = 320;

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
};

const deleteButton = document.getElementById("deleteButton");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const fitAllButton = document.getElementById("fitAllButton");
const saveJsonButton = document.getElementById("saveJsonButton");
const loadJsonButton = document.getElementById("loadJsonButton");
const exportSvgButton = document.getElementById("exportSvgButton");
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
  snapMarker: null,
  isShiftPressed: false,
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
  uiState.lineDraft = null;
  uiState.transformDraft = null;
  uiState.snapMarker = null;
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
  }

  return getSnapPoint(constrainedWorld);
}

function refreshPointerConstraint(shiftKey) {
  if (!uiState.lineDraft && !uiState.transformDraft) {
    return;
  }

  const snappedWorld = resolveConstrainedSnapPoint(uiState.pointerWorld, shiftKey);
  uiState.hoverWorld = snappedWorld;
  if (uiState.transformDraft) {
    uiState.transformDraft.currentPoint = snappedWorld;
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

function beginLineDraft(startPoint, prefix = `Line start set at ${formatWorldPoint(startPoint)}.`) {
  uiState.lineDraft = {
    start: startPoint,
    numericInputBuffer: "",
  };
  updateLineDraftStatus(prefix);
  draw();
  renderStatusPanel();
}

function endLineDraft(message = "Line command ended.") {
  uiState.lineDraft = null;
  draw();
  renderStatusPanel();
  setStatus(message);
}

function endTransformDraft(message = `${capitalize(uiState.activeTool)} command ended.`) {
  uiState.transformDraft = null;
  state.selectedEntityIds = [];
  draw();
  renderPropertiesPanel();
  renderStatusPanel();
  setStatus(message);
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
    uiState.lineDraft && uiState.lineDraft.numericInputBuffer
      ? `${uiState.lineDraft.numericInputBuffer} mm`
      : "-";
  const distanceInputLabel =
    uiState.transformDraft && uiState.transformDraft.numericInputBuffer
      ? `${uiState.transformDraft.numericInputBuffer} mm`
      : "-";
  const commandStateLabel = uiState.lineDraft
    ? "Line: specify next point"
    : uiState.transformDraft
      ? `${capitalize(uiState.transformDraft.mode)}: specify second point`
      : uiState.activeTool === "line"
        ? "Line: specify first point"
        : uiState.activeTool === "move"
          ? "Move: specify base point"
          : uiState.activeTool === "copy"
            ? "Copy: specify base point"
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
    drawDraftLine(uiState.lineDraft.start, uiState.hoverWorld);
  }

  if (uiState.transformDraft) {
    drawTransformPreview(uiState.transformDraft);
  }

  if (uiState.snapMarker) {
    drawSnapMarker(uiState.snapMarker);
  }

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

function createTransformFromNumericInput() {
  if (!uiState.transformDraft) {
    return false;
  }

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
  uiState.transformDraft.currentPoint = worldPoint;
  draw();
}

function applyTransformDraft() {
  const transformDraft = uiState.transformDraft;
  if (!transformDraft) {
    return false;
  }

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

function selectEntityAtPoint(worldPoint) {
  const selectable = state.entities
    .filter(canSelectEntity)
    .slice()
    .reverse();

  const hit = selectable.find((entity) => hitTestEntity(entity, worldPoint));
  state.selectedEntityIds = hit ? [hit.id] : [];
  syncAfterStateChange();
  setStatus(hit ? `Selected ${hit.id}.` : "Selection cleared.");
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
  const worldPoint = resolveConstrainedSnapPoint(screenToWorld(screenPoint), event.shiftKey);

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

  if (uiState.activeTool === "select") {
    selectEntityAtPoint(worldPoint);
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

function exportSvg() {
  const visibleLines = state.entities.filter(
    (entity) => entity.type === "line" && isLayerVisible(entity.layerId)
  );

  if (!visibleLines.length) {
    setStatus("No visible lines to export.");
    return;
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  visibleLines.forEach((line) => {
    minX = Math.min(minX, line.p1.x, line.p2.x);
    minY = Math.min(minY, line.p1.y, line.p2.y);
    maxX = Math.max(maxX, line.p1.x, line.p2.x);
    maxY = Math.max(maxY, line.p1.y, line.p2.y);
  });

  const widthMm = Math.max(1, unitsToMm(maxX - minX));
  const heightMm = Math.max(1, unitsToMm(maxY - minY));

  const svgLines = visibleLines
    .map((line) => {
      const layer = getLayerById(line.layerId);
      return `<line x1="${unitsToMm(line.p1.x - minX)}" y1="${unitsToMm(line.p1.y - minY)}" x2="${unitsToMm(
        line.p2.x - minX
      )}" y2="${unitsToMm(line.p2.y - minY)}" stroke="${escapeAttribute(layer ? layer.color : "#2e3135")}" stroke-width="1" vector-effect="non-scaling-stroke" />`;
    })
    .join("\n");

  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${widthMm} ${heightMm}" width="${widthMm}mm" height="${heightMm}mm">`,
    svgLines,
    "</svg>",
  ].join("\n");

  downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `draftlite-${createTimestampLabel()}.svg`);
  setStatus("SVG exported.");
}

function escapeAttribute(value) {
  return String(value).replaceAll('"', "&quot;");
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
    if (uiState.transformDraft) {
      if (uiState.transformDraft.numericInputBuffer) {
        uiState.transformDraft.numericInputBuffer = "";
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
        uiState.lineDraft.numericInputBuffer = "";
        updateLineDraftStatus(`Line start set at ${formatWorldPoint(uiState.lineDraft.start)}.`);
        draw();
        return;
      }
      endLineDraft("Line command cancelled.");
      return;
    }
  }

  if (uiState.lineDraft && activeTag !== "INPUT" && activeTag !== "TEXTAREA") {
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      uiState.lineDraft.numericInputBuffer += event.key;
      updateLineDraftStatus(`Line start set at ${formatWorldPoint(uiState.lineDraft.start)}.`);
      draw();
      return;
    }

    if (event.key === "Backspace") {
      if (uiState.lineDraft.numericInputBuffer) {
        event.preventDefault();
        uiState.lineDraft.numericInputBuffer = uiState.lineDraft.numericInputBuffer.slice(0, -1);
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
  deleteButton.addEventListener("click", deleteSelectedEntities);
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  fitAllButton.addEventListener("click", fitAll);
  saveJsonButton.addEventListener("click", saveJsonToFile);
  loadJsonButton.addEventListener("click", () => loadJsonInput.click());
  exportSvgButton.addEventListener("click", exportSvg);
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
