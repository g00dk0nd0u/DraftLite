"use strict";

const STORAGE_KEY = "draftlite.autosave.v1";
const CUSTOM_LIBRARY_STORAGE_KEY = "draftlite.customLibrary.v1";
const CURRENT_FILE_VERSION = 2;
const UNIT_MM = 0.1;
const LEGACY_UNIT_MM = 0.5;
const GRID_MAJOR_MM = 1000;
const GRID_MAJOR_UNIT = mmToUnits(GRID_MAJOR_MM);
const DEFAULT_ZOOM = 0.024;
const MIN_ZOOM = 0.00008;
const MAX_ZOOM = 50;
const DEFAULT_DIMENSION_EXTENSION_GAP_UNITS = 90;
const DOUBLE_CLICK_MS = 320;
const CLICK_SELECT_THRESHOLD_PX = 4;
const THEME_STORAGE_KEY = "draftlite.theme";
const FREE_OPERATION_GRID_MM = 10;

const canvas = document.getElementById("draftCanvas");
const viewport = document.getElementById("canvasViewport");
const sidebar = document.querySelector(".sidebar");
const layerList = document.getElementById("layerList");
const layersPanelToggle = document.getElementById("layersPanelToggle");
const propertiesPanel = document.getElementById("propertiesPanel");
const propertiesPanelToggle = document.getElementById("propertiesPanelToggle");
const libraryPanel = document.getElementById("libraryPanel");
const addToLibraryButton = document.getElementById("addToLibraryButton");
const exportLibraryButton = document.getElementById("exportLibraryButton");
const importLibraryButton = document.getElementById("importLibraryButton");
const importLibraryInput = document.getElementById("importLibraryInput");
const toolReadout = document.getElementById("toolReadout");
const pointerReadout = document.getElementById("pointerReadout");
const zoomReadout = document.getElementById("zoomReadout");
const statusReadout = document.getElementById("statusReadout");
const loadJsonInput = document.getElementById("loadJsonInput");
const importPdfInput = document.getElementById("importPdfInput");
const linkDxfInput = document.getElementById("linkDxfInput");
const scaleBar = document.getElementById("scaleBar");
const scaleBarTrack = document.getElementById("scaleBarTrack");
const scaleBarLabels = document.getElementById("scaleBarLabels");
const scaleBarLines = Array.from(document.querySelectorAll(".scale-bar-line"));
const titleBlockApi = window.DraftLiteTitleBlock || null;
const pdfUnderlayApi = window.DraftLitePdfUnderlay || null;
const dxfUnderlayApi = window.DraftLiteDxfUnderlay || null;

const toolButtons = {
  select: document.getElementById("toolSelectButton"),
  line: document.getElementById("toolLineButton"),
  wire: document.getElementById("wireButton"),
  rectangle: document.getElementById("rectangleButton"),
  circle: document.getElementById("circleButton"),
  arc: document.getElementById("arcButton"),
  filledRegion: document.getElementById("filledRegionButton"),
  text: document.getElementById("textButton"),
  dimension: document.getElementById("dimensionButton"),
  matchProperties: document.getElementById("matchPropertiesButton"),
  move: document.getElementById("moveButton"),
  copy: document.getElementById("copyButton"),
  group: document.getElementById("groupButton"),
  ungroup: document.getElementById("ungroupButton"),
  makeBlock: document.getElementById("makeBlockButton"),
  rotate: document.getElementById("rotateButton"),
  mirror: document.getElementById("mirrorButton"),
  align: document.getElementById("alignButton"),
  extend: document.getElementById("extendButton"),
  fillet: document.getElementById("filletButton"),
};

const deleteButton = document.getElementById("deleteButton");
const undoButton = document.getElementById("undoButton");
const redoButton = document.getElementById("redoButton");
const titleBlockButton = document.getElementById("titleBlockButton");
const fitAllButton = document.getElementById("fitAllButton");
const saveJsonButton = document.getElementById("saveJsonButton");
const loadJsonButton = document.getElementById("loadJsonButton");
const exportDxfButton = document.getElementById("exportDxfButton");
const importPdfButton = document.getElementById("importPdfButton");
const linkDxfButton = document.getElementById("linkDxfButton");
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
const agentCommandInput = document.getElementById("agentCommandInput");
const agentRunButton = document.getElementById("agentRunButton");
const agentValidateButton = document.getElementById("agentValidateButton");
const agentClearButton = document.getElementById("agentClearButton");
const agentFitButton = document.getElementById("agentFitButton");
const agentCopyInputButton = document.getElementById("agentCopyInputButton");
const agentCopyResultButton = document.getElementById("agentCopyResultButton");
const agentResultOutput = document.getElementById("agentResultOutput");
const agentIoDetails = document.getElementById("agentIoDetails");
const agentModeHint = document.getElementById("agentModeHint");
const agentModeBanner = document.getElementById("agentModeBanner");
let agentLastResultText = "";
let agentLastResultValue = null;

const SHORTCUT_TO_ACTION = {
  s: () => setActiveTool("select"),
  l: () => setActiveTool("line"),
  w: () => setActiveTool("wire"),
  q: () => setActiveTool("rectangle"),
  o: () => setActiveTool("circle"),
  p: () => setActiveTool("arc"),
  h: () => setActiveTool("filledRegion"),
  v: () => setActiveTool("move"),
  c: () => setActiveTool("copy"),
  r: () => rotateSelectedEntities(90),
  m: () => setActiveTool("mirror"),
  a: () => setActiveTool("align"),
  e: () => setActiveTool("extend"),
  f: () => setActiveTool("fillet"),
  b: () => setActiveTool("matchProperties"),
  g: () => createGroupFromSelection(),
  u: () => ungroupSelection(),
  x: () => explodeSelectedRects(),
  t: () => setActiveTool("text"),
  d: () => setActiveTool("dimension"),
};
const PASTE_OFFSET_PX = 18;
const DRAWING_REPEAT_TOOL_IDS = new Set([
  "line",
  "wire",
  "rectangle",
  "circle",
  "arc",
  "filledRegion",
  "text",
  "dimension",
]);
const MODIFY_REPEAT_TOOL_IDS = new Set([
  "move",
  "copy",
  "matchProperties",
  "mirror",
  "align",
  "extend",
  "fillet",
]);

const ctx = canvas.getContext("2d");

function isAgentModeEnabled() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get("agent");
  return value === "1" || value === "true";
}

function updateAgentModeHint(isAgentMode) {
  if (!agentModeHint) {
    return;
  }
  if (isAgentMode) {
    agentModeHint.innerHTML = "Agent Mode active. Start with: <code>tools</code>";
    return;
  }
  agentModeHint.innerHTML = "Start with: <code>tools</code> / <code>resources</code> / <code>summary</code> / <code>validate</code>";
}

function applyAgentModeIfNeeded() {
  const isAgentMode = isAgentModeEnabled();
  if (!document.body) {
    return isAgentMode;
  }
  if (isAgentMode) {
    document.body.dataset.agentMode = "true";
  } else {
    delete document.body.dataset.agentMode;
  }
  if (agentModeBanner) {
    agentModeBanner.hidden = !isAgentMode;
  }
  updateAgentModeHint(isAgentMode);
  if (!isAgentMode) {
    if (agentRunButton) {
      agentRunButton.classList.remove("agent-mode-primary");
    }
    return isAgentMode;
  }
  if (agentIoDetails) {
    agentIoDetails.open = true;
  }
  if (agentCommandInput && !agentCommandInput.value.trim()) {
    agentCommandInput.value = "tools";
  }
  if (agentRunButton) {
    agentRunButton.classList.add("agent-mode-primary");
  }
  window.requestAnimationFrame(() => {
    window.setTimeout(() => {
      if (agentIoDetails && typeof agentIoDetails.scrollIntoView === "function") {
        agentIoDetails.scrollIntoView({ block: "center", behavior: "auto" });
      }
    }, 0);
  });
  return isAgentMode;
}

function setStatus(message) {
  statusReadout.textContent = message;
}

let state = createInitialState();
let history = {
  undoStack: [],
  redoStack: [],
};
let entityClipboard = null;
let pasteSequence = 0;
let blockLibrary = { default: [], repo: [], local: [] };

const uiState = {
  activeTool: "select",
  lastRepeatableToolId: null,
  lineDraft: null,
  wireDraft: null,
  rectangleDraft: null,
  circleDraft: null,
  arcDraft: null,
  filledRegionDraft: null,
  transformDraft: null,
  selectDragDraft: null,
  gripEditDraft: null,
  dimensionEndpointEditDraft: null,
  rectEdgeEditDraft: null,
  dimensionOffsetEditDraft: null,
  alignDraft: null,
  extendDraft: null,
  filletDraft: null,
  mirrorDraft: null,
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
  hoverGrip: null,
  hoverDimensionEndpointHandle: null,
  hoverDimensionOffsetHandle: null,
  hoverMoveAnchor: null,
  hoverBorrowedHandle: null,
  hoverRectEdge: null,
  deleteLayerDialogLayerId: null,
  pdfReplaceTargetId: null,
  panning: false,
  panStartScreen: { x: 0, y: 0 },
  panStartView: { panX: 0, panY: 0 },
  touchPanDraft: null,
  touchTapDraft: null,
  pinchDraft: null,
  touchGestureActive: false,
  lastMiddleClickTime: 0,
  libraryPlacementItemId: null,
  libraryPlacementPreviewPoint: null,
  libraryPlacementPointerInsideCanvas: false,
  sidebarPanelsOpen: { layers: true, properties: true },
  libraryCategoryOpen: new Set(),
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
    groups: [],
    pdfUnderlay: pdfUnderlayApi ? pdfUnderlayApi.createInitialPdfUnderlayState() : null,
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
    nextGroupNumber: 1,
    blockDefinitions: [],
    nextBlockNumber: 1,
  };
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function snapshotState() {
  return deepClone(state);
}

function getSerializableState() {
  const documentState = snapshotState();
  if (documentState.pdfUnderlay && pdfUnderlayApi && typeof pdfUnderlayApi.serializePdfUnderlayState === "function") {
    documentState.pdfUnderlay = pdfUnderlayApi.serializePdfUnderlayState(documentState.pdfUnderlay);
  }
  documentState.entities = documentState.entities.map((entity) => {
    if (!entity || entity.type !== "pdfUnderlay") {
      return entity;
    }
    const { imageBitmap, _imageElement, ...serializableEntity } = entity;
    return serializableEntity;
  });
  return documentState;
}

function snapshotHistoryStacks() {
  return {
    undoStack: deepClone(history.undoStack),
    redoStack: deepClone(history.redoStack),
  };
}

function restoreHistoryStacks(snapshot) {
  const nextSnapshot = snapshot || {};
  history.undoStack = deepClone(Array.isArray(nextSnapshot.undoStack) ? nextSnapshot.undoStack : []);
  history.redoStack = deepClone(Array.isArray(nextSnapshot.redoStack) ? nextSnapshot.redoStack : []);
  syncUndoRedoButtons();
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
  if (uiState.filletDraft || uiState.alignDraft || uiState.extendDraft || uiState.mirrorDraft) {
    state.selectedEntityIds = [];
  }
  uiState.lineDraft = null;
  uiState.wireDraft = null;
  uiState.rectangleDraft = null;
  uiState.circleDraft = null;
  uiState.arcDraft = null;
  uiState.filledRegionDraft = null;
  uiState.transformDraft = null;
  uiState.selectDragDraft = null;
  uiState.gripEditDraft = null;
  uiState.dimensionEndpointEditDraft = null;
  uiState.rectEdgeEditDraft = null;
  uiState.dimensionOffsetEditDraft = null;
  uiState.alignDraft = null;
  uiState.mirrorDraft = null;
  uiState.extendDraft = null;
  uiState.filletDraft = null;
  uiState.dimensionDraft = null;
  uiState.matchPropertiesSourceId = null;
  uiState.selectionWindow = null;
  uiState.snapMarker = null;
  uiState.hoverGrip = null;
  uiState.hoverDimensionEndpointHandle = null;
  uiState.hoverDimensionOffsetHandle = null;
  uiState.hoverMoveAnchor = null;
  uiState.hoverBorrowedHandle = null;
  uiState.hoverRectEdge = null;
  uiState.libraryPlacementItemId = null;
  uiState.libraryPlacementPreviewPoint = null;
  uiState.libraryPlacementPointerInsideCanvas = false;
  document.body.style.cursor = "";
  clearLinePreviewTimer();
  clearGripPreviewTimer();
  clearTransformPreviewTimer();
}

function hasCancelableCommandOrDraft() {
  return uiState.activeTool !== "select"
    || Boolean(uiState.lineDraft)
    || Boolean(uiState.wireDraft)
    || Boolean(uiState.rectangleDraft)
    || Boolean(uiState.circleDraft)
    || Boolean(uiState.arcDraft)
    || Boolean(uiState.filledRegionDraft)
    || Boolean(uiState.transformDraft)
    || Boolean(uiState.selectDragDraft)
    || Boolean(uiState.gripEditDraft)
    || Boolean(uiState.dimensionEndpointEditDraft)
    || Boolean(uiState.rectEdgeEditDraft)
    || Boolean(uiState.dimensionOffsetEditDraft)
    || Boolean(uiState.alignDraft)
    || Boolean(uiState.mirrorDraft)
    || Boolean(uiState.extendDraft)
    || Boolean(uiState.filletDraft)
    || Boolean(uiState.dimensionDraft)
    || Boolean(uiState.matchPropertiesSourceId)
    || Boolean(uiState.selectionWindow);
}

function isTextInputActive() {
  const activeElement = document.activeElement;
  if (!activeElement) {
    return false;
  }
  const activeTag = activeElement.tagName;
  return activeTag === "INPUT"
    || activeTag === "TEXTAREA"
    || activeTag === "SELECT"
    || activeElement.isContentEditable;
}

function isEditableTarget(target) {
  if (!target) {
    return false;
  }
  return target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement
    || target.isContentEditable === true;
}

function isDrawingRepeatTool(toolId) {
  return DRAWING_REPEAT_TOOL_IDS.has(toolId);
}

function isModifyRepeatTool(toolId) {
  return MODIFY_REPEAT_TOOL_IDS.has(toolId);
}

function isRepeatableTool(toolId) {
  return isDrawingRepeatTool(toolId) || isModifyRepeatTool(toolId);
}

function rememberRepeatableTool(toolId) {
  if (!isRepeatableTool(toolId)) {
    return;
  }
  uiState.lastRepeatableToolId = toolId;
}

function isCommandInProgress() {
  return Boolean(
    uiState.lineDraft
    || uiState.wireDraft
    || uiState.rectangleDraft
    || uiState.circleDraft
    || uiState.arcDraft
    || uiState.filledRegionDraft
    || uiState.transformDraft
    || uiState.selectDragDraft
    || uiState.gripEditDraft
    || uiState.dimensionEndpointEditDraft
    || uiState.rectEdgeEditDraft
    || uiState.dimensionOffsetEditDraft
    || uiState.alignDraft
    || uiState.mirrorDraft
    || uiState.extendDraft
    || uiState.filletDraft
    || uiState.dimensionDraft
    || uiState.matchPropertiesSourceId
    || uiState.selectionWindow
  );
}

function shouldIgnoreSpaceRepeat(event) {
  return event.code !== "Space"
    || event.repeat
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || isDeleteLayerDialogOpen()
    || uiState.panning
    || uiState.touchGestureActive
    || isCommandInProgress();
}

function repeatLastToolFromSpace(event) {
  if (shouldIgnoreSpaceRepeat(event)) {
    return false;
  }

  const toolId = uiState.lastRepeatableToolId;
  if (!isRepeatableTool(toolId)) {
    return false;
  }

  event.preventDefault();
  setActiveTool(toolId, {
    clearSelection: isDrawingRepeatTool(toolId),
  });
  return true;
}

function isMoveCopyTool(toolId = uiState.activeTool) {
  return toolId === "move" || toolId === "copy";
}

function updateMoveCopyStatus(toolId = uiState.activeTool) {
  if (!isMoveCopyTool(toolId)) {
    return;
  }
  setStatus(
    canStartTransformTool()
      ? `${capitalize(toolId)}: Specify base point.`
      : `${capitalize(toolId)}: Select objects.`
  );
}

function isTransformSelectionPhase(toolId = uiState.activeTool) {
  return isMoveCopyTool(toolId)
    && !uiState.transformDraft
    && !canStartTransformTool();
}

function cancelCurrentOperationAndClearSelection() {
  const hadCommandOrDraft = hasCancelableCommandOrDraft();
  const hadSelection = state.selectedEntityIds.length > 0;

  clearTransientState();
  uiState.activeTool = "select";
  state.selectedEntityIds = [];
  syncAfterStateChange(false);

  if (hadCommandOrDraft) {
    setStatus("Cancelled and selection cleared.");
    return;
  }
  if (hadSelection) {
    setStatus("Selection cleared.");
    return;
  }
  setStatus("Ready.");
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


function createGroupId() {
  const id = `group-${state.nextGroupNumber}`;
  state.nextGroupNumber += 1;
  return id;
}

function getGroupById(groupId) {
  return state.groups.find((group) => group.id === groupId) || null;
}

function getGroupsForEntity(entityId) {
  return state.groups.filter((group) => group.entityIds.includes(entityId));
}

function getGroupedEntityIds(entityId) {
  const ids = new Set([entityId]);
  getGroupsForEntity(entityId).forEach((group) => group.entityIds.forEach((id) => ids.add(id)));
  return [...ids];
}

function expandSelectionWithGroups(entityIds) {
  const expanded = new Set(entityIds);
  entityIds.forEach((id) => getGroupedEntityIds(id).forEach((memberId) => expanded.add(memberId)));
  return [...expanded].filter((id) => state.entities.some((entity) => entity.id === id));
}

function cleanupGroups() {
  const entityIdSet = new Set(state.entities.map((entity) => entity.id));
  state.groups = state.groups
    .map((group) => ({ ...group, entityIds: group.entityIds.filter((id) => entityIdSet.has(id)), updatedAt: new Date().toISOString() }))
    .filter((group) => group.entityIds.length > 1);
}

function createGroupFromSelection() {
  const entityIds = expandSelectionWithGroups(state.selectedEntityIds);
  if (entityIds.length < 2) { setStatus("Select at least two entities to create a group."); return false; }
  pushUndoState();
  const now = new Date().toISOString();
  const group = { id: createGroupId(), name: `Group ${state.nextGroupNumber - 1}`, category: "", description: "", entityIds: [...new Set(entityIds)], tags: [], metadata: {}, createdAt: now, updatedAt: now };
  state.groups.push(group);
  state.selectedEntityIds = [...group.entityIds];
  syncAfterStateChange();
  setStatus(`${group.name} created.`);
  return true;
}

function ungroupSelection() {
  if (!state.selectedEntityIds.length) { setStatus("Nothing selected."); return false; }
  const selectedSet = new Set(expandSelectionWithGroups(state.selectedEntityIds));
  const targetGroupIds = state.groups.filter((group) => group.entityIds.some((id) => selectedSet.has(id))).map((group) => group.id);
  if (!targetGroupIds.length) { setStatus("No groups found in selection."); return false; }
  pushUndoState();
  state.groups = state.groups.filter((group) => !targetGroupIds.includes(group.id));
  syncAfterStateChange();
  setStatus(`${targetGroupIds.length} group${targetGroupIds.length===1?"":"s"} removed.`);
  return true;
}

function getGroupSummary(groupId) {
  const group = getGroupById(groupId);
  if (!group) return null;
  const entities = group.entityIds.map(getEntityById).filter(Boolean);
  const xs=[]; const ys=[];
  entities.forEach((entity)=>{ const b=getRotateBoundsForEntity(entity); if (b){ xs.push(b.minX,b.maxX); ys.push(b.minY,b.maxY);} });
  return { id: group.id, name: group.name, category: group.category || "", description: group.description || "", boundsMm: xs.length?{ minX: unitsToMm(Math.min(...xs)), minY: unitsToMm(Math.min(...ys)), maxX: unitsToMm(Math.max(...xs)), maxY: unitsToMm(Math.max(...ys)) }: {}, entityCount: entities.length, entityTypes: [...new Set(entities.map((e)=>e.type))], entities: deepClone(entities) };
}

function exportSelectedGroupsForAgent() {
  const selected = new Set(expandSelectionWithGroups(state.selectedEntityIds));
  const groups = state.groups.filter((group) => group.entityIds.some((id) => selected.has(id))).map((group) => getGroupSummary(group.id)).filter(Boolean);
  return { groups };
}

function getSelectedGroupSummaries() {
  return exportSelectedGroupsForAgent().groups;
}

function duplicateGroupsForCopiedEntities(sourceEntities, idMap) {
  const sourceIds = sourceEntities.map((entity) => entity.id);
  const sourceIdSet = new Set(sourceIds);
  const copiedGroups = state.groups
    .filter((group) => group.entityIds.every((id) => sourceIdSet.has(id)))
    .map((group) => {
      const entityIds = group.entityIds.map((id) => idMap.get(id)).filter(Boolean);
      if (entityIds.length < 2) {
        return null;
      }
      const now = new Date().toISOString();
      return {
        ...group,
        id: createGroupId(),
        name: `Group ${state.nextGroupNumber - 1}`,
        entityIds,
        createdAt: now,
        updatedAt: now,
      };
    })
    .filter(Boolean);
  if (copiedGroups.length) {
    state.groups.push(...copiedGroups);
  }
}

function getEntityClipboardBounds(entities) {
  return getBoundsForEntities(entities);
}

function getClipboardBlockDefinitions(entities) {
  const blockIds = [...new Set(
    entities
      .filter((entity) => entity && entity.type === "blockInstance" && typeof entity.blockId === "string" && entity.blockId)
      .map((entity) => entity.blockId)
  )];
  return blockIds
    .map((blockId) => getBlockDefinitionById(blockId))
    .filter(Boolean)
    .map((definition) => deepClone(definition));
}

function copySelectedEntitiesToClipboard() {
  const selectedEntities = getSelectedTransformableEntities();
  if (!selectedEntities.length) {
    return false;
  }
  entityClipboard = {
    entities: deepClone(selectedEntities),
    blockDefinitions: getClipboardBlockDefinitions(selectedEntities),
    bounds: getEntityClipboardBounds(selectedEntities),
    sourceEntityIds: selectedEntities.map((entity) => entity.id),
    sourceTimestamp: Date.now(),
  };
  pasteSequence = 0;
  setStatus("Copied.");
  renderStatusPanel();
  return true;
}

function cutSelectedEntitiesToClipboard() {
  const copied = copySelectedEntitiesToClipboard();
  if (!copied) {
    return false;
  }
  deleteSelectedEntities();
  setStatus("Cut.");
  renderStatusPanel();
  return true;
}

function resolvePasteLayerId(layerId) {
  const layer = getLayerById(layerId);
  if (layer && layer.visible && !layer.locked) {
    return layerId;
  }
  const activeLayer = getLayerById(state.activeLayerId);
  if (activeLayer && activeLayer.visible && !activeLayer.locked) {
    return activeLayer.id;
  }
  const fallbackLayer = state.layers.find((candidate) => candidate.visible && !candidate.locked);
  return fallbackLayer ? fallbackLayer.id : null;
}

function restoreClipboardBlockDefinitions() {
  const clipboardDefinitions = Array.isArray(entityClipboard && entityClipboard.blockDefinitions)
    ? entityClipboard.blockDefinitions
    : [];
  if (!clipboardDefinitions.length) {
    return new Map();
  }

  const remappedBlockIds = new Map();
  clipboardDefinitions.forEach((definition, index) => {
    if (!definition || typeof definition.id !== "string" || !definition.id) {
      return;
    }
    if (getBlockDefinitionById(definition.id)) {
      remappedBlockIds.set(definition.id, definition.id);
      return;
    }
    const blockNumber = state.nextBlockNumber;
    const blockId = `block-${blockNumber}`;
    const name = typeof definition.name === "string" && definition.name.trim()
      ? definition.name.trim()
      : `Block ${blockNumber}`;
    state.nextBlockNumber += 1;
    const now = new Date().toISOString();
    state.blockDefinitions.push({
      id: blockId,
      name,
      entities: Array.isArray(definition.entities) ? deepClone(definition.entities) : [],
      createdAt: typeof definition.createdAt === "string" ? definition.createdAt : now,
      updatedAt: now,
    });
    remappedBlockIds.set(definition.id, blockId);
  });
  return remappedBlockIds;
}

function pasteEntitiesFromClipboard() {
  if (!entityClipboard || !Array.isArray(entityClipboard.entities) || !entityClipboard.entities.length) {
    setStatus("Clipboard is empty.");
    return false;
  }
  const zoom = Math.max(0.000001, Number(state.view.zoom) || DEFAULT_ZOOM);
  pasteSequence += 1;
  const offsetUnits = (PASTE_OFFSET_PX * pasteSequence) / zoom;
  const offset = { dx: roundToUnit(offsetUnits), dy: roundToUnit(-offsetUnits) };
  const sourceEntities = entityClipboard.entities.map((entity) => deepClone(entity));
  const { copied: newEntities, idMap } = createCopiedEntities(sourceEntities, offset);
  const resolvedLayerIds = newEntities.map((entity) => resolvePasteLayerId(entity.layerId));
  if (resolvedLayerIds.some((layerId) => !layerId)) {
    setStatus("Paste failed: no visible, unlocked layer is available.");
    return false;
  }
  pushUndoState();
  const blockIdMap = restoreClipboardBlockDefinitions();
  newEntities.forEach((entity) => {
    entity.layerId = resolvedLayerIds.shift();
    if (entity.type === "blockInstance") {
      entity.blockId = blockIdMap.get(entity.blockId) || entity.blockId;
      const definition = getBlockDefinitionById(entity.blockId);
      if (definition) {
        entity.name = entity.name || definition.name || "";
      }
    }
  });
  state.entities.push(...newEntities);
  duplicateGroupsForCopiedEntities(sourceEntities, idMap);
  state.selectedEntityIds = newEntities.map((entity) => entity.id);
  syncAfterStateChange();
  setStatus("Pasted.");
  return true;
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

function quantizeFreePointToGrid(point, gridMm = FREE_OPERATION_GRID_MM) {
  if (!point) return point;
  const gridUnits = Math.max(1, mmToUnits(gridMm));
  return {
    x: roundToUnit(Math.round(point.x / gridUnits) * gridUnits),
    y: roundToUnit(Math.round(point.y / gridUnits) * gridUnits),
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

function getCssVar(name, fallback = "") {
  const bodyValue = window.getComputedStyle(document.body).getPropertyValue(name).trim();
  if (bodyValue) {
    return bodyValue;
  }
  const rootValue = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (rootValue) {
    return rootValue;
  }
  return String(fallback || "").trim();
}

function trimTrailingZeros(value) {
  return value.replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function formatScaleLabel(mm) {
  if (mm >= 1000000) {
    return `${trimTrailingZeros((mm / 1000000).toFixed(2))}km`;
  }
  if (mm >= 1000) {
    return `${trimTrailingZeros((mm / 1000).toFixed(2))}m`;
  }
  if (mm < 1) {
    return `${trimTrailingZeros(mm.toFixed(2))}mm`;
  }
  return `${Math.round(mm)}mm`;
}

function getScaleSegmentUnitCandidates() {
  const candidates = [0.05, 0.1, 0.2, 0.5, 1, 2, 5];
  const niceBases = [1, 2, 5];
  for (let exponent = 1; exponent <= 9; exponent += 1) {
    const factor = 10 ** exponent;
    niceBases.forEach((base) => candidates.push(base * factor));
  }
  return [...new Set(candidates)].sort((a, b) => a - b);
}

function getNiceScaleSegmentUnit(maxTotalPx = Number.POSITIVE_INFINITY) {
  const pxPerMm = state.view.zoom * (1 / UNIT_MM);
  const minTotalPx = 140;
  const maxPreferredTotalPx = Math.min(220, maxTotalPx);
  const targetTotalPx = Math.min(180, maxPreferredTotalPx);
  const segmentCount = 5;
  let bestUnit = getScaleSegmentUnitCandidates()[0];
  let bestScore = Number.POSITIVE_INFINITY;

  getScaleSegmentUnitCandidates().forEach((unitMm) => {
    const totalPx = unitMm * pxPerMm * segmentCount;
    if (totalPx > maxTotalPx) return;
    const inRange = totalPx >= minTotalPx && totalPx <= maxPreferredTotalPx;
    const score = inRange ? Math.abs(totalPx - targetTotalPx) : Math.abs(totalPx - targetTotalPx) + 1000;
    if (score < bestScore) {
      bestScore = score;
      bestUnit = unitMm;
    }
  });

  return bestUnit;
}

function renderScaleBarLabels(segmentMm, totalWidthPx) {
  if (!scaleBarLabels) {
    return;
  }
  scaleBarLabels.innerHTML = "";

  const showAllLabels = totalWidthPx >= 175;
  const labelSteps = showAllLabels ? [0, 1, 2, 3, 4, 5] : [0, 2, 5];
  labelSteps.forEach((step) => {
    const label = document.createElement("span");
    label.className = "scale-bar-label";
    if (step === 0) {
      label.classList.add("is-start");
    } else if (step === 5) {
      label.classList.add("is-end");
    } else {
      label.style.left = `${(step / 5) * 100}%`;
    }
    label.textContent = step === 0 ? "0" : formatScaleLabel(segmentMm * step);
    scaleBarLabels.appendChild(label);
  });
}

function updateScaleBar() {
  if (!scaleBar || !scaleBarTrack || !scaleBarLabels || !scaleBarLines.length) {
    return;
  }

  const segmentCount = 5;
  const viewportWidth = canvasViewport ? canvasViewport.getBoundingClientRect().width : window.innerWidth;
  const maxTotalPx = Math.max(90, viewportWidth - 36);
  const segmentMm = getNiceScaleSegmentUnit(maxTotalPx);
  const segmentPx = Math.max(18, mmToUnits(segmentMm) * state.view.zoom);
  const totalWidthPx = segmentPx * segmentCount;

  scaleBarTrack.style.width = `${totalWidthPx}px`;
  scaleBarLabels.style.width = `${totalWidthPx}px`;
  scaleBarLines.forEach((line) => {
    line.style.width = `${segmentPx}px`;
  });
  renderScaleBarLabels(segmentMm, totalWidthPx);

  let rightPx = window.innerWidth <= 640 ? 12 : 18;
  const bottomPx = window.innerWidth <= 640 ? 12 : 18;
  if (sidebar && viewport) {
    const viewportRect = viewport.getBoundingClientRect();
    const sidebarRect = sidebar.getBoundingClientRect();
    const scaleTop = viewportRect.bottom - bottomPx - 28;
    const scaleBottom = viewportRect.bottom - bottomPx;
    const overlapsVertically = sidebarRect.top < scaleBottom && sidebarRect.bottom > scaleTop;
    if (overlapsVertically) {
      const neededRight = Math.max(18, viewportRect.right - sidebarRect.left + 14);
      rightPx = Math.min(Math.max(rightPx, neededRight), Math.max(18, viewportRect.width - totalWidthPx - 18));
    }
  }

  scaleBar.style.right = `${rightPx}px`;
  scaleBar.style.bottom = `${bottomPx}px`;
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

function createDefaultWireEntity(fields = {}) {
  return {
    id: fields.id || createEntityId(),
    type: "wire",
    layerId: fields.layerId || state.activeLayerId,
    start: roundWorldPoint(fields.start || { x: 0, y: 0 }),
    end: roundWorldPoint(fields.end || { x: 0, y: 0 }),
    startRef: null,
    endRef: null,
    tension: Number.isFinite(fields.tension) ? fields.tension : 0.45,
    color: typeof fields.color === "string" ? fields.color : "",
  };
}

function getWireControlPoints(start, end, tension = 0.45) {
  const safeTension = clampNumber(Number.isFinite(tension) ? tension : 0.45, 0.1, 0.9, 0.45);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const primaryDelta = horizontal ? dx : dy;
  const maxOffset = Math.max(1, Math.abs(primaryDelta));
  const rawOffset = Math.max(mmToUnits(40), Math.abs(primaryDelta * safeTension));
  const controlOffset = Math.min(maxOffset, roundToUnit(rawOffset));
  if (horizontal) {
    const signed = dx >= 0 ? controlOffset : -controlOffset;
    return {
      c1: { x: roundToUnit(start.x + signed), y: start.y },
      c2: { x: roundToUnit(end.x - signed), y: end.y },
    };
  }
  const signed = dy >= 0 ? controlOffset : -controlOffset;
  return {
    c1: { x: start.x, y: roundToUnit(start.y + signed) },
    c2: { x: end.x, y: roundToUnit(end.y - signed) },
  };
}

function drawWirePath(start, end, tension, options = {}) {
  const screenStart = worldToScreen(start);
  const screenEnd = worldToScreen(end);
  const { c1, c2 } = getWireControlPoints(start, end, tension);
  const screenC1 = worldToScreen(c1);
  const screenC2 = worldToScreen(c2);
  ctx.beginPath();
  ctx.moveTo(screenStart.x, screenStart.y);
  ctx.bezierCurveTo(screenC1.x, screenC1.y, screenC2.x, screenC2.y, screenEnd.x, screenEnd.y);
  if (options.stroke !== false) {
    ctx.stroke();
  }
}

function sampleWireCurvePoints(start, end, tension, segments = 24) {
  const safeSegments = Math.max(4, Math.round(segments));
  const { c1, c2 } = getWireControlPoints(start, end, tension);
  const points = [];
  for (let index = 0; index <= safeSegments; index += 1) {
    const t = index / safeSegments;
    const mt = 1 - t;
    points.push({
      x: roundToUnit(
        (mt ** 3) * start.x
        + 3 * (mt ** 2) * t * c1.x
        + 3 * mt * (t ** 2) * c2.x
        + (t ** 3) * end.x
      ),
      y: roundToUnit(
        (mt ** 3) * start.y
        + 3 * (mt ** 2) * t * c1.y
        + 3 * mt * (t ** 2) * c2.y
        + (t ** 3) * end.y
      ),
    });
  }
  return points;
}

function getWireBoundsUnits(entity) {
  const points = sampleWireCurvePoints(entity.start, entity.end, entity.tension);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function hitTestWireEntity(entity, worldPoint) {
  const points = sampleWireCurvePoints(entity.start, entity.end, entity.tension);
  for (let index = 0; index < points.length - 1; index += 1) {
    if (distancePointToSegmentScreenPx(worldPoint, points[index], points[index + 1]) <= state.settings.snapTolerancePx) {
      return true;
    }
  }
  return false;
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

function getRectMoveAnchorPoints(entity) {
  return getRectSnapPoints(entity).filter((candidate) => candidate.kind !== "center");
}

function getPdfUnderlayScaledSize(entity) {
  const scale = Math.max(0.01, Number(entity.scale) || 1);
  return {
    width: Math.max(0, Math.round((Number(entity.widthUnits) || 0) * scale)),
    height: Math.max(0, Math.round((Number(entity.heightUnits) || 0) * scale)),
  };
}

function getPdfUnderlaySnapPoints(entity) {
  const size = getPdfUnderlayScaledSize(entity);
  return getRectSnapPoints({ x: entity.x, y: entity.y, width: size.width, height: size.height });
}

function getUnderlaySnapPoints(entity) {
  if (entity.type === "pdfUnderlay") {
    return getPdfUnderlaySnapPoints(entity);
  }
  const bounds = getEntityBoundsUnits(entity);
  if (!bounds) {
    return [];
  }
  return getRectSnapPoints({ x: bounds.minX, y: bounds.minY, width: bounds.maxX - bounds.minX, height: bounds.maxY - bounds.minY });
}

function getSelectedEntityHandles(entity) {
  if (!entity) {
    return [];
  }
  if (entity.type === "rect" || entity.type === "pdfUnderlay" || entity.type === "dxfUnderlay") {
    const candidates = entity.type === "pdfUnderlay" || entity.type === "dxfUnderlay"
      ? getUnderlaySnapPoints(entity).filter((candidate) => candidate.kind !== "center")
      : getRectMoveAnchorPoints(entity);
    return candidates.map((candidate) => ({
      entityId: entity.id,
      type: candidate.kind === "midpoint" ? `${entity.type}Midpoint` : `${entity.type}Corner`,
      point: candidate.point,
    }));
  }
  if (entity.type === "circle") {
    return [{ entityId: entity.id, type: "circleCenter", point: roundWorldPoint(entity.center) }];
  }
  if (entity.type === "text") {
    return [{ entityId: entity.id, type: "textCenter", point: roundWorldPoint({ x: entity.x, y: entity.y }) }];
  }
  if (entity.type === "filledRegion") {
    return entity.points.map((point) => ({
      entityId: entity.id,
      type: "filledRegionVertex",
      point: roundWorldPoint(point),
    }));
  }
  return [];
}

function getBorrowableHandlePoints(entity) {
  if (!entity) {
    return [];
  }
  if (entity.type === "line") {
    return [
      { entityId: entity.id, type: "lineEndpoint", endpoint: "p1", point: roundWorldPoint(entity.p1) },
      { entityId: entity.id, type: "lineEndpoint", endpoint: "p2", point: roundWorldPoint(entity.p2) },
    ];
  }
  if (entity.type === "rect" || entity.type === "pdfUnderlay") {
    const candidates = entity.type === "pdfUnderlay"
      ? getUnderlaySnapPoints(entity).filter((candidate) => candidate.kind !== "center")
      : getRectMoveAnchorPoints(entity);
    return candidates.map((candidate) => ({
      entityId: entity.id,
      type: candidate.kind === "midpoint" ? `${entity.type}Midpoint` : `${entity.type}Corner`,
      point: candidate.point,
    }));
  }
  if (entity.type === "circle") {
    return [{ entityId: entity.id, type: "circleCenter", point: roundWorldPoint(entity.center) }];
  }
  if (entity.type === "filledRegion") {
    return entity.points.map((point) => ({
      entityId: entity.id,
      type: "filledRegionVertex",
      point: roundWorldPoint(point),
    }));
  }
  return [];
}

function collectSnapCandidates(worldPoint) {
  const candidates = state.entities
    .filter((entity) => isLayerVisible(entity.layerId))
    .flatMap((entity) => {
      if (entity.visible === false) {
        return [];
      }
      if (entity.type === "pdfUnderlay") {
        return getPdfUnderlaySnapPoints(entity).map((c) => ({ ...c, distancePx: distanceScreenPx(worldPoint, c.point) }));
      }
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
      if (entity.type === "blockInstance") {
        const bounds = getBlockInstanceBoundsUnits(entity);
        if (!bounds) {
          return [];
        }
        const points = [
          { kind: "endpoint", point: { x: bounds.minX, y: bounds.minY } },
          { kind: "endpoint", point: { x: bounds.maxX, y: bounds.minY } },
          { kind: "endpoint", point: { x: bounds.maxX, y: bounds.maxY } },
          { kind: "endpoint", point: { x: bounds.minX, y: bounds.maxY } },
          { kind: "center", point: { x: roundToUnit((bounds.minX + bounds.maxX) / 2), y: roundToUnit((bounds.minY + bounds.maxY) / 2) } },
        ];
        return points.map((candidate) => ({
          ...candidate,
          point: roundWorldPoint(candidate.point),
          distancePx: distanceScreenPx(worldPoint, candidate.point),
        }));
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

function resolveSnapCandidate(worldPoint) {
  const candidates = collectSnapCandidates(worldPoint);
  return candidates.reduce((best, candidate) => {
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
}

function getSnapPoint(worldPoint, options = {}) {
  const closestCandidate = resolveSnapCandidate(worldPoint);

  if (closestCandidate) {
    uiState.snapMarker = {
      kind: closestCandidate.kind,
      point: closestCandidate.point,
    };
    return closestCandidate.point;
  }

  uiState.snapMarker = null;
  return options.quantizeFree === true
    ? quantizeFreePointToGrid(worldPoint)
    : roundWorldPoint(worldPoint);
}

function collectAnchorSnapCandidates(worldPoint, excludeEntityIds = []) {
  const excludedIds = new Set(excludeEntityIds);
  return state.entities
    .filter((entity) => isLayerVisible(entity.layerId) && !excludedIds.has(entity.id))
    .flatMap((entity) => {
      if (entity.type === "line") {
        return [entity.p1, entity.p2].map((point) => ({
          kind: "endpoint",
          entityId: entity.id,
          point: roundWorldPoint(point),
          distancePx: distanceScreenPx(worldPoint, point),
        }));
      }
      if (entity.type === "rect") {
        return getRectMoveAnchorPoints(entity).map((candidate) => ({
          kind: candidate.kind,
          entityId: entity.id,
          point: candidate.point,
          distancePx: distanceScreenPx(worldPoint, candidate.point),
        }));
      }
      if (entity.type === "circle") {
        return [{
          kind: "center",
          entityId: entity.id,
          point: roundWorldPoint(entity.center),
          distancePx: distanceScreenPx(worldPoint, entity.center),
        }];
      }
      if (entity.type === "filledRegion") {
        return entity.points.map((point) => ({
          kind: "endpoint",
          entityId: entity.id,
          point: roundWorldPoint(point),
          distancePx: distanceScreenPx(worldPoint, point),
        }));
      }
      if (entity.type === "blockInstance") {
        const bounds = getBlockInstanceBoundsUnits(entity);
        if (!bounds) {
          return [];
        }
        const points = [
          { x: bounds.minX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.minY },
          { x: bounds.maxX, y: bounds.maxY },
          { x: bounds.minX, y: bounds.maxY },
          { x: roundToUnit((bounds.minX + bounds.maxX) / 2), y: roundToUnit((bounds.minY + bounds.maxY) / 2) },
        ];
        return points.map((point) => ({
          kind: "endpoint",
          entityId: entity.id,
          point: roundWorldPoint(point),
          distancePx: distanceScreenPx(worldPoint, point),
        }));
      }
      if (entity.type === "dimension") {
        return [entity.p1, entity.p2, entity.offsetPoint].map((point) => ({
          kind: "endpoint",
          entityId: entity.id,
          point: roundWorldPoint(point),
          distancePx: distanceScreenPx(worldPoint, point),
        }));
      }
      return [];
    });
}

function getAnchorSnapPoint(worldPoint, excludeEntityIds = []) {
  const candidates = collectAnchorSnapCandidates(worldPoint, excludeEntityIds)
    .filter((candidate) => candidate.distancePx <= state.settings.snapTolerancePx)
    .sort((a, b) => a.distancePx - b.distancePx);
  if (candidates.length) {
    uiState.snapMarker = {
      kind: "endpoint",
      point: roundWorldPoint(candidates[0].point),
    };
    return roundWorldPoint(candidates[0].point);
  }
  uiState.snapMarker = null;
  return null;
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

function getConstrainedWorldPoint(worldPoint, shiftKey) {
  let constrainedWorld = worldPoint;
  const orthoEnabled = !shiftKey;

  if (uiState.lineDraft) {
    constrainedWorld = applyOrthoConstraint(uiState.lineDraft.start, constrainedWorld, orthoEnabled);
  } else if (uiState.transformDraft) {
    constrainedWorld = applyOrthoConstraint(uiState.transformDraft.startPoint, constrainedWorld, orthoEnabled);
  } else if (uiState.gripEditDraft) {
    constrainedWorld = applyOrthoConstraint(uiState.gripEditDraft.startPoint, constrainedWorld, orthoEnabled);
  } else if (uiState.mirrorDraft && uiState.mirrorDraft.firstPoint) {
    constrainedWorld = applyOrthoConstraint(uiState.mirrorDraft.firstPoint, constrainedWorld, orthoEnabled);
  }

  return constrainedWorld;
}

function resolveConstrainedSnapPoint(worldPoint, shiftKey) {
  return getSnapPoint(getConstrainedWorldPoint(worldPoint, shiftKey), { quantizeFree: true });
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

function beginWireDraft(startPoint) {
  uiState.wireDraft = {
    start: roundWorldPoint(startPoint),
    tension: 0.45,
  };
  draw();
  renderStatusPanel();
  setStatus(`Wire start set at ${formatWorldPoint(uiState.wireDraft.start)}. Pick end point.`);
}

function endWireDraft(message = "Wire command ended.") {
  uiState.wireDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange(false);
  setStatus(message);
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

function cancelMirror(message = "Mirror cancelled.") {
  uiState.mirrorDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange(false);
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

function isEntityVisible(entity) {
  return Boolean(entity && entity.visible !== false && isLayerVisible(entity.layerId));
}

function canSelectEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer || !layer.visible || layer.locked) return false;
  if (entity.visible === false || entity.locked) return false;
  if (entity.type === "blockInstance") return Boolean(getBlockDefinitionById(entity.blockId));
  return true;
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

function getBoundsForEntities(entities) {
  const boundsList = entities.map(getEntityBoundsUnits).filter(Boolean);
  if (!boundsList.length) return null;
  return {
    minX: Math.min(...boundsList.map((bounds) => bounds.minX)),
    minY: Math.min(...boundsList.map((bounds) => bounds.minY)),
    maxX: Math.max(...boundsList.map((bounds) => bounds.maxX)),
    maxY: Math.max(...boundsList.map((bounds) => bounds.maxY)),
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

function normalizeDxfUnderlayPrimitive(primitive) {
  if (!primitive || typeof primitive !== "object") {
    return null;
  }
  const layer = typeof primitive.layer === "string" ? primitive.layer : "0";
  if (primitive.kind === "line") {
    const x1 = roundToUnit(primitive.x1);
    const y1 = roundToUnit(primitive.y1);
    const x2 = roundToUnit(primitive.x2);
    const y2 = roundToUnit(primitive.y2);
    return [x1, y1, x2, y2].every(Number.isFinite) ? { kind: "line", x1, y1, x2, y2, layer } : null;
  }
  if (primitive.kind === "polyline") {
    const points = Array.isArray(primitive.points)
      ? primitive.points.map((point) => normalizePoint(point, false)).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y)).slice(0, 20000)
      : [];
    return points.length >= 2 ? { kind: "polyline", points, closed: Boolean(primitive.closed), layer } : null;
  }
  if (primitive.kind === "circle" || primitive.kind === "arc") {
    const cx = roundToUnit(primitive.cx);
    const cy = roundToUnit(primitive.cy);
    const r = Math.max(0, roundToUnit(primitive.r));
    if (![cx, cy, r].every(Number.isFinite) || r <= 0) {
      return null;
    }
    if (primitive.kind === "circle") {
      return { kind: "circle", cx, cy, r, layer };
    }
    return { kind: "arc", cx, cy, r, startDeg: Number(primitive.startDeg) || 0, endDeg: Number(primitive.endDeg) || 0, layer };
  }
  return null;
}

function normalizeEntity(entity, options = {}) {
  if (!entity || !entity.type) {
    return null;
  }
  const legacyUnits = Boolean(options.legacyUnits);
  if (entity.type === "titleBlock" && titleBlockApi && typeof titleBlockApi.normalizeTitleBlockEntity === "function") {
    return titleBlockApi.normalizeTitleBlockEntity(entity, {
      roundToUnit,
      mmToUnits,
      unitsToMm,
    });
  }
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
  if (entity.type === "wire") {
    const start = normalizePoint(entity.start, legacyUnits);
    const end = normalizePoint(entity.end, legacyUnits);
    if (start.x === end.x && start.y === end.y) {
      return null;
    }
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "wire",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      start,
      end,
      startRef: null,
      endRef: null,
      tension: clampNumber(Number(entity.tension), 0.1, 0.9, 0.45),
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
    const labelSize = normalizeUnitValue(entity.labelSize, legacyUnits);
    const rawCornerRadius = normalizeUnitValue(entity.cornerRadius, legacyUnits);
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
      label: typeof entity.label === "string" ? entity.label : "",
      labelSize: labelSize > 0 ? labelSize : mmToUnits(100),
      cornerRadius: clampNumber(roundToUnit(rawCornerRadius), 0, Math.min(width, height) / 2, 0),
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
    const normalizedTextEntity = {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "text",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      x: normalizeUnitValue(entity.x, legacyUnits),
      y: normalizeUnitValue(entity.y, legacyUnits),
      text: textValue,
      height: Math.max(1, normalizeUnitValue(entity.height ?? 250, legacyUnits)),
      rotation: Number(entity.rotation) || 0,
      align: ["left", "center", "right"].includes(entity.align) ? entity.align : "left",
      textAnchor: "center",
      ...getNormalizedEntityStyleProps(entity, { supportsStroke: true }),
    };
    if (entity.textAnchor === "center") {
      return normalizedTextEntity;
    }
    return migrateLegacyTextEntityToCenter(normalizedTextEntity);
  }

  if (entity.type === "dxfUnderlay") {
    const rawPrimitives = Array.isArray(entity.primitives) ? entity.primitives : [];
    const primitives = rawPrimitives.map(normalizeDxfUnderlayPrimitive).filter(Boolean).slice(0, 50000);
    const stats = entity.stats && typeof entity.stats === "object" ? entity.stats : {};
    const normalized = {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "dxfUnderlay",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      name: typeof entity.name === "string" && entity.name ? entity.name : "DXF Underlay",
      sourceName: typeof entity.sourceName === "string" ? entity.sourceName : "Linked DXF",
      x: normalizeUnitValue(entity.x, legacyUnits),
      y: normalizeUnitValue(entity.y, legacyUnits),
      scale: clampNumber(Number(entity.scale), 0.01, 100, 1),
      rotation: 0,
      opacity: clampNumber(Number(entity.opacity), 0, 1, 0.45),
      visible: entity.visible !== false,
      locked: Boolean(entity.locked),
      unitMm: Number.isFinite(Number(entity.unitMm)) ? Number(entity.unitMm) : 1,
      primitives,
      bounds: entity.bounds && typeof entity.bounds === "object" ? entity.bounds : null,
      stats: {
        primitiveCount: Number(stats.primitiveCount) || primitives.length,
        skippedCount: Number(stats.skippedCount) || 0,
        warnings: Array.isArray(stats.warnings) ? stats.warnings.slice(0, 20) : [],
        truncated: Boolean(stats.truncated),
      },
    };
    if (!normalized.bounds && dxfUnderlayApi && typeof dxfUnderlayApi.getDxfUnderlayBounds === "function") {
      normalized.bounds = dxfUnderlayApi.getDxfUnderlayBounds(normalized);
    }
    return normalized;
  }

  if (entity.type === "pdfUnderlay") {
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "pdfUnderlay",
      enabled: entity.enabled !== false,
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      name: typeof entity.name === "string" && entity.name ? entity.name : "Imported PDF",
      x: normalizeUnitValue(entity.x, legacyUnits),
      y: normalizeUnitValue(entity.y, legacyUnits),
      scale: clampNumber(Number(entity.scale), 0.01, 100, 1),
      widthUnits: Math.max(1, normalizeUnitValue(entity.widthUnits, legacyUnits)),
      heightUnits: Math.max(1, normalizeUnitValue(entity.heightUnits, legacyUnits)),
      opacity: clampNumber(Number(entity.opacity), 0, 1, 0.45),
      visible: entity.visible !== false,
      locked: Boolean(entity.locked),
      imageBitmap: entity.imageBitmap || null,
      imageDataUrl: typeof entity.imageDataUrl === "string" ? entity.imageDataUrl : null,
    };
  }

  if (entity.type === "blockInstance") {
    return {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "blockInstance",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      blockId: typeof entity.blockId === "string" ? entity.blockId : "",
      x: normalizeUnitValue(entity.x, legacyUnits),
      y: normalizeUnitValue(entity.y, legacyUnits),
      name: typeof entity.name === "string" ? entity.name : "",
    };
  }
  if (entity.type === "dimension") {
    const rawExtensionGap = Number(entity.extensionGap);
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
      extensionGap: Number.isFinite(rawExtensionGap) ? Math.max(0, rawExtensionGap) : undefined,
      precision: Math.max(0, Math.min(3, Math.round(Number(entity.precision) || 0))),
      ...getNormalizedEntityStyleProps(entity, { supportsStroke: true }),
    };
  }
  return null;
}

function slugifyLibraryId(value) {
  return String(value || "library-item").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "library-item";
}

function validateLibraryItem(item, source) {
  if (!item || typeof item.id !== "string" || typeof item.name !== "string" || typeof item.category !== "string" || !Array.isArray(item.entities)) {
    console.warn("Skipping invalid library item.", item);
    return null;
  }
  return {
    id: item.id,
    name: item.name,
    category: item.category,
    description: typeof item.description === "string" ? item.description : "",
    source,
    basePoint: normalizePoint(item.basePoint || { x: 0, y: 0 }, false),
    entities: item.entities.map((entity) => normalizeEntity({ ...entity, layerId: entity.layerId || state.activeLayerId }, false)).filter(Boolean),
  };
}

function validateLibraryItems(items, source) {
  if (!Array.isArray(items)) {
    console.warn("Library JSON must be an array.", items);
    return [];
  }
  return items.map((item) => validateLibraryItem(item, source)).filter((item) => item && item.entities.length);
}

async function fetchLibraryJson(path, source, optional = false) {
  try {
    const response = await fetch(path, { cache: "no-cache" });
    if (!response.ok) {
      if (optional && response.status === 404) return [];
      console.warn(`Library fetch failed: ${path}`, response.status);
      return [];
    }
    return validateLibraryItems(await response.json(), source);
  } catch (error) {
    console.warn(`Library fetch failed: ${path}`, error);
    return [];
  }
}

function loadLocalLibrary() {
  try {
    return validateLibraryItems(JSON.parse(localStorage.getItem(CUSTOM_LIBRARY_STORAGE_KEY) || "[]"), "local");
  } catch (error) {
    console.warn("Local library restore failed.", error);
    return [];
  }
}

function saveLocalLibrary() {
  localStorage.setItem(CUSTOM_LIBRARY_STORAGE_KEY, JSON.stringify(blockLibrary.local, null, 2));
}

function getAllLibraryItems() {
  return [...blockLibrary.default, ...blockLibrary.repo, ...blockLibrary.local];
}

function getLibraryItemById(id) {
  return getAllLibraryItems().find((item) => item.id === id) || null;
}

function syncSidebarPanelVisibility() {
  if (layerList && layersPanelToggle) {
    const isOpen = uiState.sidebarPanelsOpen.layers;
    layerList.hidden = !isOpen;
    layersPanelToggle.setAttribute("aria-expanded", String(isOpen));
    layersPanelToggle.textContent = isOpen ? "▾" : "▸";
  }
  if (propertiesPanel && propertiesPanelToggle) {
    const isOpen = uiState.sidebarPanelsOpen.properties;
    propertiesPanel.hidden = !isOpen;
    propertiesPanelToggle.setAttribute("aria-expanded", String(isOpen));
    propertiesPanelToggle.textContent = isOpen ? "▾" : "▸";
  }
}

function toggleSidebarPanel(panelName) {
  uiState.sidebarPanelsOpen[panelName] = !uiState.sidebarPanelsOpen[panelName];
  syncSidebarPanelVisibility();
}

function renderLibraryPanel() {
  if (!libraryPanel) return;
  libraryPanel.innerHTML = "";
  const items = getAllLibraryItems();
  if (!items.length) {
    libraryPanel.textContent = "No library items loaded.";
    return;
  }
  const grouped = new Map();
  items.forEach((item) => {
    if (!grouped.has(item.category)) grouped.set(item.category, []);
    grouped.get(item.category).push(item);
  });
  [...grouped.keys()].sort().forEach((category) => {
    const details = document.createElement("details");
    details.className = "library-category";
    details.open = uiState.libraryCategoryOpen.has(category);
    details.addEventListener("toggle", () => {
      if (details.open) {
        uiState.libraryCategoryOpen.add(category);
      } else {
        uiState.libraryCategoryOpen.delete(category);
      }
    });
    const summary = document.createElement("summary");
    summary.textContent = category;
    details.appendChild(summary);
    grouped.get(category).forEach((item) => {
      const row = document.createElement("div");
      row.className = "library-item";
      const main = document.createElement("button");
      main.type = "button";
      main.className = "library-item-main";
      main.dataset.testid = `library-item-${item.id}`;
      const name = document.createElement("span");
      name.className = "library-item-name";
      name.textContent = item.name;
      main.appendChild(name);
      main.addEventListener("click", () => startLibraryPlacement(item.id));
      row.appendChild(main);
      if (item.source === "local") {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "panel-button library-delete-button library-delete-icon-button";
        del.textContent = "×";
        del.setAttribute("aria-label", `Delete ${item.name} from library`);
        del.title = "Delete";
        del.addEventListener("click", (event) => {
          event.stopPropagation();
          deleteLocalLibraryItem(item.id);
        });
        row.appendChild(del);
      }
      details.appendChild(row);
    });
    libraryPanel.appendChild(details);
  });
}

async function initializeBlockLibrary() {
  blockLibrary.local = loadLocalLibrary();
  renderLibraryPanel();
  const [defaults, repo] = await Promise.all([
    fetchLibraryJson("library/defaultLibrary.json", "default"),
    fetchLibraryJson("library/repoLibrary.json", "repo", true),
  ]);
  blockLibrary.default = defaults;
  blockLibrary.repo = repo;
  renderLibraryPanel();
}

function startLibraryPlacement(itemId) {
  setActiveTool("libraryPlace");
  uiState.libraryPlacementItemId = itemId;
  uiState.libraryPlacementPreviewPoint = null;
  uiState.libraryPlacementPointerInsideCanvas = false;
  const item = getLibraryItemById(itemId);
  setStatus(`Library placement: ${item ? item.name : itemId}. Move cursor over canvas, then click to place. Esc to cancel.`);
}

function ensureLibraryBlockDefinition(item) {
  const existing = state.blockDefinitions.find((block) => block.libraryItemId === item.id);
  if (existing) return existing;
  const now = new Date().toISOString();
  const definition = { id: createBlockId(), name: item.name, libraryItemId: item.id, entities: deepClone(item.entities), createdAt: now, updatedAt: now };
  state.blockDefinitions.push(definition);
  return definition;
}

function placeLibraryItemAt(item, point) {
  if (!canDrawOnActiveLayer()) return false;
  pushUndoState();
  const definition = ensureLibraryBlockDefinition(item);
  const instance = { id: createEntityId(), type: "blockInstance", layerId: state.activeLayerId, blockId: definition.id, x: roundToGridUnit(point.x), y: roundToGridUnit(point.y), name: definition.name };
  state.entities.push(instance);
  state.selectedEntityIds = [instance.id];
  uiState.libraryPlacementItemId = null;
  uiState.libraryPlacementPreviewPoint = null;
  uiState.libraryPlacementPointerInsideCanvas = false;
  setActiveTool("select");
  syncAfterStateChange();
  setStatus(`${item.name} placed as a block instance.`);
  return true;
}

function getSelectedEntitiesForLibrary() {
  return expandSelectionWithGroups(state.selectedEntityIds)
    .map(getEntityById)
    .filter((entity) => entity && canSelectEntity(entity))
    .flatMap((entity) => entity.type === "blockInstance" ? getBlockInstanceRenderableEntities(entity) : [entity]);
}

function addSelectionToLibrary() {
  const selected = getSelectedEntitiesForLibrary();
  if (!selected.length) { alert("Select entities or a block instance first."); return false; }
  const name = (prompt("Library item name", "Custom Block") || "").trim();
  if (!name) return false;
  const category = (prompt("Category", "Custom") || "").trim() || "Custom";
  const description = (prompt("Description", "") || "").trim();
  const bounds = getBoundsForEntities(selected);
  if (!bounds) return false;
  const basePoint = { x: bounds.minX, y: bounds.minY };
  const id = `${slugifyLibraryId(name)}-${Date.now()}`;
  const item = { id, name, category, description, source: "local", basePoint: { x: 0, y: 0 }, entities: selected.map((entity) => entityToBlockRelative(entity, basePoint)) };
  blockLibrary.local.push(item);
  saveLocalLibrary();
  renderLibraryPanel();
  setStatus(`${name} added to local library.`);
  return true;
}

function deleteLocalLibraryItem(id) {
  blockLibrary.local = blockLibrary.local.filter((item) => item.id !== id);
  saveLocalLibrary();
  renderLibraryPanel();
  setStatus("Local library item deleted.");
}

function exportLocalLibrary() {
  const blob = new Blob([JSON.stringify(blockLibrary.local, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "draftlite-custom-library.json";
  link.click();
  URL.revokeObjectURL(link.href);
}

function uniqueImportedLibraryId(id, used) {
  let candidate = id;
  let suffix = 1;
  while (used.has(candidate)) {
    candidate = `${id}-${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function importLibraryFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = validateLibraryItems(JSON.parse(reader.result), "local");
      const used = new Set(getAllLibraryItems().map((item) => item.id));
      imported.forEach((item) => { item.id = uniqueImportedLibraryId(item.id, used); blockLibrary.local.push(item); });
      saveLocalLibrary();
      renderLibraryPanel();
      setStatus(`${imported.length} library item(s) imported.`);
    } catch (error) {
      alert("Import failed: invalid library JSON.");
      console.warn("Library import failed.", error);
    }
  };
  reader.readAsText(file);
}


function createBlockId() {
  const id = `block-${state.nextBlockNumber}`;
  state.nextBlockNumber += 1;
  return id;
}

function createDefaultBlockName() {
  return `Block ${state.nextBlockNumber}`;
}

function getBlockDefinitionById(blockId) {
  return state.blockDefinitions.find((block) => block.id === blockId) || null;
}

function getBlockInstanceDefinition(entity) {
  if (!entity || entity.type !== "blockInstance") return null;
  return getBlockDefinitionById(entity.blockId);
}

function entityToBlockRelative(entity, basePoint) {
  return applyOffsetToEntity(deepClone(entity), { dx: -basePoint.x, dy: -basePoint.y });
}

function entityFromBlockRelative(entity, instance) {
  return applyOffsetToEntity(deepClone(entity), { dx: instance.x, dy: instance.y });
}

function getBlockInstanceRenderableEntities(instance) {
  const definition = getBlockInstanceDefinition(instance);
  if (!definition) return [];
  return definition.entities.map((child) => entityFromBlockRelative(child, instance));
}

function getLibraryPlacementPoint(worldPoint, shiftKey = false) {
  void shiftKey;
  return getSnapPoint(worldPoint);
}

function getLibraryPreviewEntities(item, point) {
  if (!item || !Array.isArray(item.entities) || !point) return [];
  const offset = { dx: point.x, dy: point.y };
  return item.entities
    .map((entity) => applyOffsetToEntity({ ...deepClone(entity), layerId: state.activeLayerId }, offset))
    .filter(Boolean);
}

function getBlockInstanceBoundsUnits(instance) {
  const entities = getBlockInstanceRenderableEntities(instance);
  if (!entities.length) return null;
  return getBoundsForEntities(entities);
}

function makeBlockFromGroup(group) {
  if (!group) return false;
  state.selectedEntityIds = [...group.entityIds];
  return makeBlockFromSelection();
}

function makeBlockFromSelection() {
  const selected = state.selectedEntityIds
    .map(getEntityById)
    .filter((entity) => entity && canSelectEntity(entity) && entity.type !== "blockInstance");
  if (!selected.length) {
    setStatus("Select entities to make a block.");
    return false;
  }
  const bounds = getBoundsForEntities(selected);
  if (!bounds) {
    setStatus("Select entities to make a block.");
    return false;
  }
  const basePoint = { x: bounds.minX, y: bounds.minY };
  const now = new Date().toISOString();
  const blockNumber = state.nextBlockNumber;
  const blockId = `block-${blockNumber}`;
  const name = `Block ${blockNumber}`;
  state.nextBlockNumber += 1;
  const definition = {
    id: blockId,
    name,
    entities: selected.map((entity) => entityToBlockRelative(entity, basePoint)),
    createdAt: now,
    updatedAt: now,
  };
  pushUndoState();
  state.blockDefinitions.push(definition);
  const firstLayerId = selected[0].layerId || state.activeLayerId;
  const instance = { id: createEntityId(), type: "blockInstance", layerId: firstLayerId, blockId, x: basePoint.x, y: basePoint.y, name };
  const removeIds = new Set(selected.map((entity) => entity.id));
  state.entities = state.entities.filter((entity) => !removeIds.has(entity.id));
  cleanupGroups();
  state.entities.push(instance);
  state.selectedEntityIds = [instance.id];
  syncAfterStateChange();
  setStatus(`${name} created. ${selected.length} entities converted to one block instance.`);
  return true;
}

function explodeBlockInstance(instanceId) {
  const instance = getEntityById(instanceId);
  if (!instance || instance.type !== "blockInstance") return false;
  const definition = getBlockInstanceDefinition(instance);
  if (!definition) return false;
  const exploded = definition.entities.map((child)=>({ ...entityFromBlockRelative(child, instance), id: createEntityId() }));
  state.entities = state.entities.filter((e)=>e.id !== instanceId);
  state.entities.push(...exploded);
  state.selectedEntityIds = exploded.map((e)=>e.id);
  cleanupBlockDefinitions();
  return true;
}

function makeBlockInstanceUnique(instanceId) {
  const instance = getEntityById(instanceId);
  if (!instance || instance.type !== "blockInstance") return false;
  const definition = getBlockInstanceDefinition(instance);
  if (!definition) return false;
  const now = new Date().toISOString();
  const blockId = createBlockId();
  const name = `${definition.name} Copy`;
  state.blockDefinitions.push({ ...deepClone(definition), id: blockId, name, createdAt: now, updatedAt: now });
  instance.blockId = blockId;
  instance.name = name;
  return true;
}

function renameBlockDefinition(blockId, nextName) {
  const definition = getBlockDefinitionById(blockId);
  if (!definition) return false;
  definition.name = nextName;
  definition.updatedAt = new Date().toISOString();
  state.entities.forEach((entity) => { if (entity.type === "blockInstance" && entity.blockId === blockId) entity.name = nextName; });
  return true;
}

function cleanupBlockDefinitions() {
  const used = new Set(state.entities.filter((entity) => entity.type === "blockInstance").map((entity) => entity.blockId));
  state.blockDefinitions = state.blockDefinitions.filter((block) => used.has(block.id));
}

function normalizeDocument(raw) {
  const source = raw && raw.state ? raw.state : raw;
  const base = createInitialState();
  const legacyUnits = shouldMigrateLegacyUnits(raw, source);
  const now = new Date().toISOString();
  const normalizedLayers = Array.isArray(source && source.layers)
    ? source.layers.map(normalizeLayer)
    : base.layers;

  const layerIds = new Set(normalizedLayers.map((layer) => layer.id));
  const normalizedBlockDefinitions = Array.isArray(source && source.blockDefinitions)
    ? source.blockDefinitions
        .map((block, index) => {
          const normalizedChildren = Array.isArray(block && block.entities)
            ? block.entities
                .map((entity) => normalizeEntity(entity, { legacyUnits }))
                .filter((entity) => entity && entity.type !== "blockInstance")
            : [];
          return {
            id: typeof block.id === "string" && block.id ? block.id : `block-${index + 1}`,
            name: typeof block.name === "string" && block.name ? block.name : `Block ${index + 1}`,
            entities: normalizedChildren,
            createdAt: typeof block.createdAt === "string" ? block.createdAt : now,
            updatedAt: typeof block.updatedAt === "string" ? block.updatedAt : now,
            libraryItemId: typeof block.libraryItemId === "string" ? block.libraryItemId : "",
          };
        })
        .filter((block) => block.entities.length > 0)
    : [];

  const validBlockIds = new Set(normalizedBlockDefinitions.map((block) => block.id));
  const normalizedEntities = Array.isArray(source && source.entities)
    ? source.entities
        .map((entity) => normalizeEntity(entity, { legacyUnits }))
        .filter(Boolean)
        .filter((entity) => entity.type !== "blockInstance" || validBlockIds.has(entity.blockId))
        .map((entity, index) => ({
          ...entity,
          id: entity.id || `ent-${index + 1}`,
          layerId: layerIds.has(entity.layerId) ? entity.layerId : normalizedLayers[0].id,
        }))
    : [];

  if (pdfUnderlayApi && source && source.pdfUnderlay && source.pdfUnderlay.enabled) {
    const migratedPdf = normalizeEntity({
      ...source.pdfUnderlay,
      id: typeof source.pdfUnderlay.id === "string" ? source.pdfUnderlay.id : `ent-${normalizedEntities.length + 1}`,
      type: "pdfUnderlay",
      enabled: true,
      layerId: layerIds.has(source.pdfUnderlay.layerId) ? source.pdfUnderlay.layerId : normalizedLayers[0].id,
    }, { legacyUnits });
    if (migratedPdf && !normalizedEntities.some((entity) => entity.type === "pdfUnderlay" && entity.imageDataUrl === migratedPdf.imageDataUrl)) {
      normalizedEntities.push(migratedPdf);
    }
  }

  const selectedEntityIds = Array.isArray(source && source.selectedEntityIds)
    ? source.selectedEntityIds.filter((id) => normalizedEntities.some((entity) => entity.id === id))
    : [];

  const entityIds = new Set(normalizedEntities.map((entity) => entity.id));
  const normalizedGroups = Array.isArray(source && source.groups)
    ? source.groups
      .map((group, index) => {
        const id = typeof group.id === "string" && group.id ? group.id : `group-${index + 1}`;
        const entityIdsInGroup = Array.isArray(group.entityIds) ? [...new Set(group.entityIds.filter((eid) => entityIds.has(eid)))] : [];
        if (entityIdsInGroup.length < 2) return null;
        const now = new Date().toISOString();
        return { id, name: typeof group.name === "string" && group.name ? group.name : `Group ${index + 1}`, category: typeof group.category === "string" ? group.category : "", description: typeof group.description === "string" ? group.description : "", entityIds: entityIdsInGroup, tags: Array.isArray(group.tags) ? [...group.tags] : [], metadata: group && typeof group.metadata === "object" && !Array.isArray(group.metadata) ? deepClone(group.metadata) : {}, createdAt: typeof group.createdAt === "string" ? group.createdAt : now, updatedAt: typeof group.updatedAt === "string" ? group.updatedAt : now };
      })
      .filter(Boolean)
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
    groups: normalizedGroups,
    blockDefinitions: normalizedBlockDefinitions,
    pdfUnderlay: pdfUnderlayApi ? pdfUnderlayApi.createInitialPdfUnderlayState() : null,
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
    nextGroupNumber: Math.max(normalizedGroups.reduce((max, group) => { const m=/group-(\d+)/.exec(group.id); return m?Math.max(max, Number(m[1])):max; },0) + 1, Number(source && source.nextGroupNumber) || 1),
    nextBlockNumber: Math.max(normalizedBlockDefinitions.reduce((max, block) => { const m=/block-(\d+)/.exec(block.id); return m?Math.max(max, Number(m[1])):max; },0) + 1, Number(source && source.nextBlockNumber) || 1),
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(getSerializableState()));
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
    const themeLabel = themeToggleButton.querySelector(".tool-label") || themeToggleButton;
    themeLabel.textContent = nextTheme === "dark" ? "Light" : "Dark";
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
  cleanupGroups();
  ensureActiveLayer();
  resizeCanvas();
  draw();
  renderLayersPanel();
  renderPropertiesPanel();
  renderStatusPanel();
  syncUndoRedoButtons();
  syncToolButtons();
  renderLibraryPanel();
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
  syncSidebarPanelVisibility();
  const header = document.createElement("div");
  header.className = "layer-table-header";
  const appendHeaderCell = (className, textContent, title) => {
    const cell = document.createElement("div");
    cell.className = className;
    cell.textContent = textContent;
    if (title) {
      cell.title = title;
      cell.setAttribute("aria-label", title);
    }
    header.appendChild(cell);
  };
  appendHeaderCell("layer-header-icon", "●", "Active");
  appendHeaderCell("layer-header-icon", "👁", "Visible");
  appendHeaderCell("layer-header-name", "Name");
  appendHeaderCell("layer-header-icon", "🔒", "Lock");
  const colorHeader = document.createElement("div");
  colorHeader.className = "layer-header-color";
  colorHeader.title = "Color";
  colorHeader.setAttribute("aria-label", "Color");
  const colorChip = document.createElement("span");
  colorChip.className = "layer-color-header-chip";
  colorHeader.appendChild(colorChip);
  header.appendChild(colorHeader);
  appendHeaderCell("layer-header-icon", "⚙", "Settings");
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
    const settingsButton = document.createElement("button");
    settingsButton.type = "button";
    settingsButton.className = "layer-settings-button";
    settingsButton.textContent = "⚙";
    settingsButton.title = "Layer settings";
    settingsButton.setAttribute("aria-label", "Layer settings");
    settingsButton.addEventListener("click", () => { setStatus("Layer settings are not implemented yet."); });
    row.append(activeRadio, visibleInput, nameWrap, lockInput, colorWrap, settingsButton);
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

function isDarkThemeActive() {
  return document.body.dataset.theme === "dark";
}

function getDefaultRectangleFillColor() {
  return normalizeColor(getCssVar("--rect-default-fill", "#f4d58a"));
}

function getRenderableColorForTheme(color, options = {}) {
  const normalized = normalizeColor(color || options.fallback || "#2e3135");
  if (!isDarkThemeActive()) {
    return normalized;
  }
  const match = /^#([0-9a-f]{6})$/i.exec(normalized);
  if (!match) {
    return normalized;
  }
  const value = match[1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const minLuminance = options.minLuminance ?? 0.38;
  if (luminance >= minLuminance) {
    return normalized;
  }
  const mix = Math.min(0.72, Math.max(0.32, minLuminance - luminance + 0.32));
  const nr = Math.round(r + (255 - r) * mix);
  const ng = Math.round(g + (255 - g) * mix);
  const nb = Math.round(b + (255 - b) * mix);
  return `#${[nr, ng, nb].map((component) => component.toString(16).padStart(2, "0")).join("")}`;
}

function getEntityStrokeColor(entity) {
  const layer = getLayerById(entity.layerId);
  return normalizeColor(entity.color || layer?.color || "#2e3135");
}

function getRenderableEntityStrokeColor(entity) {
  return getRenderableColorForTheme(getEntityStrokeColor(entity));
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
  return Boolean(entity) && ["line", "wire", "rect", "circle", "arc", "filledRegion", "text", "dimension"].includes(entity.type);
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

  if (sourceEntity.type === "dimension" && targetEntity.type === "dimension") {
    patch.layerId = sourceEntity.layerId;
    patch.color = typeof sourceEntity.color === "string" ? sourceEntity.color : "";
    patch.textHeight = Math.max(1, Number(sourceEntity.textHeight) || 250);
    patch.tickSize = Math.max(1, Number(sourceEntity.tickSize) || 250);
    patch.precision = Math.max(0, Math.min(3, Math.round(Number(sourceEntity.precision) || 0)));
    patch.extensionGap = getDimensionExtensionGapUnits(sourceEntity);
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
  syncSidebarPanelVisibility();

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
    if (state.pdfUnderlay && state.pdfUnderlay.enabled) {
      const pdfGrid = appendSection("PDF Underlay");
      addPropertyRow(pdfGrid, "Name", createReadOnlyText(state.pdfUnderlay.name || "Imported PDF"));

      const visibleInput = document.createElement("input");
      visibleInput.type = "checkbox";
      visibleInput.checked = state.pdfUnderlay.visible !== false;
      visibleInput.addEventListener("change", () => {
        pushUndoState();
        state.pdfUnderlay = pdfUnderlayApi.setPdfUnderlayVisible(state.pdfUnderlay, visibleInput.checked);
        syncAfterStateChange();
        setStatus(`PDF underlay ${state.pdfUnderlay.visible ? "shown" : "hidden"}.`);
      });
      addPropertyRow(pdfGrid, "Visible", visibleInput);

      const opacityInput = document.createElement("input");
      opacityInput.type = "range";
      opacityInput.min = "0";
      opacityInput.max = "1";
      opacityInput.step = "0.05";
      opacityInput.value = String(state.pdfUnderlay.opacity);
      opacityInput.addEventListener("change", () => {
        pushUndoState();
        state.pdfUnderlay = pdfUnderlayApi.setPdfUnderlayOpacity(state.pdfUnderlay, Number(opacityInput.value));
        syncAfterStateChange();
        setStatus("PDF underlay opacity updated.");
      });
      addPropertyRow(pdfGrid, "Opacity", opacityInput);

      const scaleInput = document.createElement("input");
      scaleInput.type = "number";
      scaleInput.min = "0.01";
      scaleInput.step = "0.01";
      scaleInput.value = String(state.pdfUnderlay.scale);
      scaleInput.addEventListener("change", () => {
        pushUndoState();
        state.pdfUnderlay = pdfUnderlayApi.setPdfUnderlayScale(state.pdfUnderlay, Number(scaleInput.value));
        syncAfterStateChange();
        setStatus("PDF underlay scale updated.");
      });
      addPropertyRow(pdfGrid, "Scale", scaleInput);

      const clearButton = document.createElement("button");
      clearButton.type = "button";
      clearButton.className = "panel-button";
      clearButton.textContent = "Clear PDF";
      clearButton.addEventListener("click", clearPdfUnderlay);
      addPropertyRow(pdfGrid, "Clear", clearButton);
      return;
    }
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
  if (entity.type === "dxfUnderlay") {
    const stats = dxfUnderlayApi && typeof dxfUnderlayApi.getDxfUnderlayStats === "function" ? dxfUnderlayApi.getDxfUnderlayStats(entity) : entity.stats || {};
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("DXF Underlay"));
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = entity.name || "DXF Underlay";
    nameInput.addEventListener("change", () => { pushUndoState(); entity.name = nameInput.value || "DXF Underlay"; syncAfterStateChange(); });
    addPropertyRow(generalGrid, "Name", nameInput);
    addPropertyRow(generalGrid, "Source file", createReadOnlyText(entity.sourceName || "Linked DXF"));
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "DXF underlay layer updated."));
    const geometryGrid = appendSection("Geometry");
    [["X mm", "x"], ["Y mm", "y"]].forEach(([label, key]) => {
      const input = document.createElement("input");
      input.type = "number";
      input.value = String(unitsToMm(entity[key]));
      input.addEventListener("change", () => {
        const value = Number(input.value);
        if (!Number.isFinite(value)) { input.value = String(unitsToMm(entity[key])); return; }
        pushUndoState(); entity[key] = mmToUnits(value); syncAfterStateChange();
      });
      addPropertyRow(geometryGrid, label, input);
    });
    const scaleInput = document.createElement("input");
    scaleInput.type = "number"; scaleInput.min = "0.01"; scaleInput.step = "0.01"; scaleInput.value = String(entity.scale || 1);
    scaleInput.addEventListener("change", () => {
      const value = Number(scaleInput.value);
      if (!Number.isFinite(value) || value <= 0) { scaleInput.value = String(entity.scale || 1); return; }
      pushUndoState(); entity.scale = clampNumber(value, 0.01, 100, 1); syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Scale", scaleInput);
    const appearanceGrid = appendSection("Appearance");
    const opacityInput = document.createElement("input");
    opacityInput.type = "range"; opacityInput.min = "0"; opacityInput.max = "1"; opacityInput.step = "0.05"; opacityInput.value = String(entity.opacity ?? 0.45);
    opacityInput.addEventListener("change", () => { pushUndoState(); entity.opacity = clampNumber(Number(opacityInput.value), 0, 1, 0.45); syncAfterStateChange(); });
    addPropertyRow(appearanceGrid, "Opacity", opacityInput);
    const visibleInput = document.createElement("input");
    visibleInput.type = "checkbox"; visibleInput.checked = entity.visible !== false;
    visibleInput.addEventListener("change", () => { pushUndoState(); entity.visible = visibleInput.checked; syncAfterStateChange(); });
    addPropertyRow(appearanceGrid, "Visible", visibleInput);
    const lockedInput = document.createElement("input");
    lockedInput.type = "checkbox"; lockedInput.checked = Boolean(entity.locked);
    lockedInput.addEventListener("change", () => { pushUndoState(); entity.locked = lockedInput.checked; syncAfterStateChange(); });
    addPropertyRow(appearanceGrid, "Locked", lockedInput);
    const infoGrid = appendSection("DXF Link");
    addPropertyRow(infoGrid, "Primitive count", createReadOnlyText(String(stats.primitiveCount || entity.primitives.length)));
    addPropertyRow(infoGrid, "Skipped count", createReadOnlyText(String(stats.skippedCount || 0)));
    addPropertyRow(infoGrid, "Warnings", createReadOnlyText((stats.warnings || []).join("; ") || "None"));
    const clearButton = document.createElement("button");
    clearButton.type = "button"; clearButton.className = "panel-button"; clearButton.textContent = "Clear DXF";
    clearButton.addEventListener("click", () => { pushUndoState(); state.entities = state.entities.filter((item) => item.id !== entity.id); state.selectedEntityIds = []; syncAfterStateChange(); setStatus("DXF underlay cleared."); });
    addPropertyRow(infoGrid, "Clear DXF", clearButton);
    return;
  }

  if (entity.type === "pdfUnderlay") {
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("PDF Underlay"));
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = entity.name || "Imported PDF";
    nameInput.addEventListener("change", () => { pushUndoState(); entity.name = nameInput.value || "Imported PDF"; syncAfterStateChange(); });
    addPropertyRow(generalGrid, "Name", nameInput);
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "PDF underlay layer updated."));

    const geometryGrid = appendSection("Geometry");
    const scaleInput = document.createElement("input");
    scaleInput.type = "number"; scaleInput.min = "0.01"; scaleInput.step = "0.01"; scaleInput.value = String(entity.scale || 1);
    scaleInput.addEventListener("change", () => {
      const value = Number(scaleInput.value);
      if (!Number.isFinite(value) || value <= 0) { scaleInput.value = String(entity.scale || 1); return; }
      pushUndoState(); entity.scale = clampNumber(value, 0.01, 100, 1); syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Scale", scaleInput);

    const appearanceGrid = appendSection("Appearance");
    const opacityInput = document.createElement("input");
    opacityInput.type = "range"; opacityInput.min = "0"; opacityInput.max = "1"; opacityInput.step = "0.05"; opacityInput.value = String(entity.opacity ?? 0.45);
    opacityInput.addEventListener("change", () => { pushUndoState(); entity.opacity = clampNumber(Number(opacityInput.value), 0, 1, 0.45); syncAfterStateChange(); });
    addPropertyRow(appearanceGrid, "Opacity", opacityInput);
    const linkButton = document.createElement("button");
    linkButton.type = "button"; linkButton.className = "panel-button"; linkButton.textContent = "Select PDF";
    linkButton.addEventListener("click", () => selectReplacementPdfForEntity(entity.id));
    addPropertyRow(appearanceGrid, "Link", linkButton);
    return;
  }
  if (entity.type === "titleBlock" && titleBlockApi) {
    titleBlockApi.buildTitleBlockProperties({
      container: propertiesPanel,
      entity,
      createLayerSelect,
      onChange: (patch, statusMessage) => {
        pushUndoState();
        titleBlockApi.updateTitleBlockFromProperties(entity, patch, {
          roundToUnit,
          mmToUnits,
          unitsToMm,
        });
        syncAfterStateChange();
        setStatus(statusMessage || "Title Block updated.");
      },
      onScreenshot: () => exportSelectedTitleBlockScreenshot(entity),
      onPdf: () => exportSelectedTitleBlockPdf(entity),
      onDxf: () => exportSelectedTitleBlockDxf(entity),
    });
    return;
  }
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
    addPropertyRow(appearanceGrid, "Text Color", colorInput);
    return;
  }
  if (entity.type === "rect") {
    const previewRect = uiState.rectEdgeEditDraft && uiState.rectEdgeEditDraft.entityId === entity.id
      ? getResizedRectFromAnchorPoint(uiState.rectEdgeEditDraft, uiState.rectEdgeEditDraft.currentPoint)
      : null;
    const rectDisplay = previewRect || entity;
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
    if (previewRect) {
      addPropertyRow(
        generalGrid,
        "Edit",
        createReadOnlyText(
          uiState.rectEdgeEditDraft.numericInputBuffer
            ? `Editing ${uiState.rectEdgeEditDraft.edge} edge: ${uiState.rectEdgeEditDraft.numericInputBuffer} mm`
            : `Editing ${uiState.rectEdgeEditDraft.edge} edge`
        )
      );
    }

    const geometryGrid = appendSection("Geometry");
    const fields = [
      ["Width mm", "width"],
      ["Height mm", "height"],
    ];
    fields.forEach(([label, key]) => {
      const input = document.createElement("input");
      input.type = "number";
      input.value = String(unitsToMm(rectDisplay[key]));
      input.addEventListener("change", () => {
        if (key === "rotation") return;
        const numericValue = Number(input.value);
        if (!Number.isFinite(numericValue)) {
          input.value = String(unitsToMm(entity[key]));
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
          clampRectCornerRadius(entity);
          syncAfterStateChange();
          return;
        }
        pushUndoState();
        entity[key] = mmToUnits(numericValue);
        syncAfterStateChange();
      });
      addPropertyRow(geometryGrid, label, input);
    });


    const textGrid = appendSection("Text");
    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = entity.label || "";
    labelInput.addEventListener("change", () => {
      pushUndoState();
      entity.label = labelInput.value;
      syncAfterStateChange();
    });
    addPropertyRow(textGrid, "Text", labelInput);

    const labelSizeInput = document.createElement("input");
    labelSizeInput.type = "number";
    labelSizeInput.min = "0.1";
    labelSizeInput.value = String(unitsToMm(entity.labelSize || mmToUnits(100)));
    labelSizeInput.addEventListener("change", () => {
      const labelSizeMm = Number(labelSizeInput.value);
      if (!Number.isFinite(labelSizeMm) || labelSizeMm <= 0) {
        labelSizeInput.value = String(unitsToMm(entity.labelSize || mmToUnits(100)));
        setStatus("Text size mm must be greater than zero.");
        return;
      }
      pushUndoState();
      entity.labelSize = mmToUnits(labelSizeMm);
      syncAfterStateChange();
    });
    addPropertyRow(textGrid, "Text size mm", labelSizeInput);

    const shapeGrid = appendSection("Shape");
    const cornerRadiusInput = document.createElement("input");
    cornerRadiusInput.type = "number";
    cornerRadiusInput.min = "0";
    cornerRadiusInput.value = String(unitsToMm(entity.cornerRadius || 0));
    cornerRadiusInput.addEventListener("change", () => {
      const radiusMm = Number(cornerRadiusInput.value);
      if (!Number.isFinite(radiusMm)) {
        cornerRadiusInput.value = String(unitsToMm(entity.cornerRadius || 0));
        setStatus("Corner radius mm must be a valid number.");
        return;
      }
      pushUndoState();
      entity.cornerRadius = clampRectCornerRadius({ ...entity, cornerRadius: mmToUnits(radiusMm) });
      cornerRadiusInput.value = String(unitsToMm(entity.cornerRadius || 0));
      syncAfterStateChange();
    });
    addPropertyRow(shapeGrid, "Corner radius mm", cornerRadiusInput);
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

  if (entity.type === "blockInstance") {
    const definition = getBlockInstanceDefinition(entity);
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("Block Instance"));
    addPropertyRow(generalGrid, "Name", createReadOnlyText(entity.name || definition?.name || ""));
    addPropertyRow(generalGrid, "Definition", createReadOnlyText(definition?.name || entity.blockId || ""));
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "Block layer updated."));
    addPropertyRow(generalGrid, "Child Count", createReadOnlyText(String(definition?.entities?.length || 0)));

    const geometryGrid = appendSection("Geometry");
    addPropertyRow(geometryGrid, "X mm", createReadOnlyText(String(unitsToMm(entity.x))));
    addPropertyRow(geometryGrid, "Y mm", createReadOnlyText(String(unitsToMm(entity.y))));

    const actionsGrid = appendSection("Actions");
    const explodeAction = document.createElement("button");
    explodeAction.type = "button";
    explodeAction.textContent = "Explode";
    explodeAction.addEventListener("click", () => {
      pushUndoState();
      if (!explodeBlockInstance(entity.id)) {
        history.undoStack.pop();
        syncUndoRedoButtons();
        setStatus("Explode failed.");
        return;
      }
      syncAfterStateChange();
      setStatus("Block instance exploded.");
    });
    addPropertyRow(actionsGrid, "Explode", explodeAction);
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

    const extensionGapInput = document.createElement("input");
    extensionGapInput.type = "number";
    extensionGapInput.min = "0";
    extensionGapInput.value = String(unitsToMm(getDimensionExtensionGapUnits(entity)));
    extensionGapInput.addEventListener("change", () => {
      const nextMm = Number(extensionGapInput.value);
      if (!Number.isFinite(nextMm) || nextMm < 0) {
        extensionGapInput.value = String(unitsToMm(getDimensionExtensionGapUnits(entity)));
        setStatus("Extension Gap mm must be zero or greater.");
        return;
      }
      pushUndoState();
      entity.extensionGap = Math.max(0, mmToUnits(nextMm));
      syncAfterStateChange();
    });
    addPropertyRow(geometryGrid, "Extension Gap mm", extensionGapInput);

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
    addPropertyRow(appearanceGrid, "Text Color", colorInput);
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
  if (entity.type === "wire") {
    const generalGrid = appendSection("General");
    addPropertyRow(generalGrid, "Type", createReadOnlyText("Wire"));
    addPropertyRow(generalGrid, "Layer", createLayerSelect(entity, "Wire layer updated."));

    const geometryGrid = appendSection("Geometry");
    addPropertyRow(geometryGrid, "Tension", createReadOnlyText(String(entity.tension ?? 0.45)));

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

function isUnderlayEntity(entity) {
  return Boolean(entity && (entity.type === "pdfUnderlay" || entity.type === "dxfUnderlay"));
}

function drawUnderlayEntity(entity) {
  if (entity.type === "pdfUnderlay") {
    drawPdfUnderlayEntity(entity, { drawSelection: false });
  } else if (entity.type === "dxfUnderlay") {
    drawDxfUnderlayEntity(entity, { drawSelection: false });
  }
}

function drawSelectedUnderlayOverlays() {
  state.selectedEntityIds
    .map(getEntityById)
    .filter((entity) => isUnderlayEntity(entity) && isLayerVisible(entity.layerId) && entity.visible !== false)
    .forEach(drawUnderlaySelectionOverlay);
}

function draw() {
  const width = uiState.canvasRect.width;
  const height = uiState.canvasRect.height;

  ctx.clearRect(0, 0, width, height);
  if (pdfUnderlayApi && state.pdfUnderlay && !state.entities.some((entity) => entity.type === "pdfUnderlay")) {
    pdfUnderlayApi.drawPdfUnderlay(ctx, state, worldToScreen);
  }
  drawGrid();
  drawAxes(width, height);

  state.entities.forEach((entity) => {
    if (!isLayerVisible(entity.layerId) || entity.visible === false || !isUnderlayEntity(entity)) {
      return;
    }
    drawUnderlayEntity(entity);
  });

  state.entities.forEach((entity) => {
    if (!isLayerVisible(entity.layerId)) {
      return;
    }
    if (entity.visible === false || isUnderlayEntity(entity)) {
      return;
    }
    if (entity.type === "line") {
      drawLineEntity(entity);
    } else if (entity.type === "wire") {
      drawWireEntity(entity);
    } else if (entity.type === "rect") {
      drawRectEntity(entity);
    } else if (entity.type === "titleBlock") {
      drawTitleBlockEntity(entity);
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
    } else if (entity.type === "blockInstance") {
      drawBlockInstanceEntity(entity);
    }
  });

  drawSelectedUnderlayOverlays();

  if (uiState.lineDraft) {
    drawDraftLine(uiState.lineDraft.start, uiState.lineDraft.previewPoint || uiState.hoverWorld);
  }
  if (uiState.wireDraft) {
    drawDraftWire(uiState.wireDraft);
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

  if (uiState.activeTool === "libraryPlace" && uiState.libraryPlacementItemId && uiState.libraryPlacementPreviewPoint) {
    drawLibraryPlacementPreview();
  }
  if (uiState.mirrorDraft && uiState.mirrorDraft.firstPoint) {
    drawMirrorAxisDraft(uiState.mirrorDraft.firstPoint, getMirrorAxisSecondPoint(uiState.pointerWorld));
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
  if (uiState.dimensionEndpointEditDraft) {
    drawDimensionEndpointEditPreview(uiState.dimensionEndpointEditDraft);
  }
  if (uiState.dimensionOffsetEditDraft) {
    drawDimensionOffsetEditPreview(uiState.dimensionOffsetEditDraft);
  }
  if (uiState.rectEdgeEditDraft) {
    const previewRect = getResizedRectFromAnchorPoint(uiState.rectEdgeEditDraft, uiState.rectEdgeEditDraft.currentPoint);
    const previewEntity = {
      ...getEntityById(uiState.rectEdgeEditDraft.entityId),
      ...previewRect,
      __isRectEdgePreview: true,
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

  state.entities.forEach((entity) => {
    if (entity.type !== "dimension" || !state.selectedEntityIds.includes(entity.id)) {
      return;
    }
    const previewPoints = uiState.dimensionEndpointEditDraft && uiState.dimensionEndpointEditDraft.entityId === entity.id
      ? {
        p1: uiState.dimensionEndpointEditDraft.endpoint === "p1" ? uiState.dimensionEndpointEditDraft.currentPoint : entity.p1,
        p2: uiState.dimensionEndpointEditDraft.endpoint === "p2" ? uiState.dimensionEndpointEditDraft.currentPoint : entity.p2,
      }
      : null;
    drawDimensionEndpointHandles(entity, previewPoints);
    const handlePoint = uiState.dimensionOffsetEditDraft && uiState.dimensionOffsetEditDraft.entityId === entity.id
      ? uiState.dimensionOffsetEditDraft.currentPoint
      : ((uiState.dimensionEndpointEditDraft && uiState.dimensionEndpointEditDraft.entityId === entity.id)
        ? getDimensionGeometry(createDimensionWithPreservedOffset(
          entity,
          uiState.dimensionEndpointEditDraft.endpoint,
          uiState.dimensionEndpointEditDraft.currentPoint,
          uiState.dimensionEndpointEditDraft.signedOffset
        ) || entity).offsetHandlePoint
        : getDimensionGeometry(entity).offsetHandlePoint);
    drawDimensionOffsetHandle(entity, handlePoint);
  });

  drawBorrowedHoverHandle();

  if (uiState.snapMarker) {
    drawSnapMarker(uiState.snapMarker);
  }

  drawDynamicInput();
  updateScaleBar();

  zoomReadout.textContent = `Zoom: ${Math.round(state.view.zoom * 100)}%`;
}

function drawGrid() {
  return undefined;
}

function drawAxes(width, height) {
  const origin = worldToScreen({ x: 0, y: 0 });
  ctx.save();
  ctx.strokeStyle = getCssVar("--canvas-axis", "rgba(70, 52, 30, 0.28)");
  ctx.fillStyle = getCssVar("--canvas-origin", "rgba(70, 52, 30, 0.45)");
  ctx.lineWidth = 0.8;
  ctx.setLineDash([6, 5]);

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

  if (origin.x >= -3 && origin.x <= width + 3 && origin.y >= -3 && origin.y <= height + 3) {
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPdfUnderlayEntity(entity, options = {}) {
  if (!pdfUnderlayApi || entity.visible === false || entity.opacity <= 0) {
    return;
  }
  entity.enabled = entity.enabled !== false;
  pdfUnderlayApi.drawPdfUnderlay(ctx, { pdfUnderlay: entity }, worldToScreen);
  if (options.drawSelection !== false && state.selectedEntityIds.includes(entity.id)) {
    drawUnderlaySelectionOverlay(entity);
  }
}

function drawUnderlaySelectionOverlay(entity) {
  const bounds = getEntityBoundsUnits(entity);
  if (bounds) {
    const p1 = worldToScreen({ x: bounds.minX, y: bounds.minY });
    const p2 = worldToScreen({ x: bounds.maxX, y: bounds.maxY });
    ctx.save();
    ctx.strokeStyle = "#c2693e";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(Math.min(p1.x, p2.x), Math.min(p1.y, p2.y), Math.abs(p2.x - p1.x), Math.abs(p2.y - p1.y));
    ctx.restore();
  }
  drawSelectedEntityHandles(entity);
}

function drawDxfUnderlayEntity(entity, options = {}) {
  if (!dxfUnderlayApi || entity.visible === false || entity.opacity <= 0) {
    return;
  }
  dxfUnderlayApi.drawDxfUnderlay(ctx, entity, worldToScreen);
  if (options.drawSelection !== false && state.selectedEntityIds.includes(entity.id)) {
    drawUnderlaySelectionOverlay(entity);
  }
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

  ctx.strokeStyle = getRenderableEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  ctx.beginPath();
  ctx.moveTo(screenP1.x, screenP1.y);
  ctx.lineTo(screenP2.x, screenP2.y);
  ctx.stroke();

  if (isSelected) {
    ctx.fillStyle = "#fffaf2";
    [screenP1, screenP2].forEach((point, index) => {
      const endpoint = index === 0 ? "p1" : "p2";
      const isActive = uiState.hoverGrip
        && uiState.hoverGrip.entity.id === entity.id
        && uiState.hoverGrip.endpoint === endpoint;
      ctx.strokeStyle = isActive ? "rgba(194, 105, 62, 0.92)" : "#c2693e";
      ctx.lineWidth = isActive ? 3 : 1.5;
      ctx.beginPath();
      ctx.arc(point.x, point.y, isActive ? 6.5 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  ctx.restore();
}

function drawWireEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer) {
    return;
  }
  const isSelected = state.selectedEntityIds.includes(entity.id);
  ctx.save();
  ctx.globalAlpha = getEntityOpacity(entity);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash(getEntityStrokeDash(entity));

  if (isSelected) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.22)";
    ctx.lineWidth = 10;
    drawWirePath(entity.start, entity.end, entity.tension);
  }

  ctx.strokeStyle = getRenderableEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  drawWirePath(entity.start, entity.end, entity.tension);
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

function drawDraftWire(draft) {
  if (!draft || !draft.start) {
    return;
  }
  ctx.save();
  ctx.strokeStyle = "rgba(98, 73, 45, 0.85)";
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 1.5;
  drawWirePath(draft.start, roundWorldPoint(uiState.hoverWorld), draft.tension || 0.45);
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

function drawSelectedEntityHandles(entity) {
  if (!state.selectedEntityIds.includes(entity.id)) {
    return;
  }
  const edgeHovered = uiState.hoverRectEdge && uiState.hoverRectEdge.entityId === entity.id;
  const edgeEditing = uiState.rectEdgeEditDraft && uiState.rectEdgeEditDraft.entityId === entity.id;
  if (edgeHovered || edgeEditing) {
    return;
  }
  const handles = getSelectedEntityHandles(entity);
  if (!handles.length) {
    return;
  }
  const activeHandle = uiState.hoverMoveAnchor && uiState.hoverMoveAnchor.entityId === entity.id
    ? uiState.hoverMoveAnchor
    : null;

  handles.forEach((handle) => {
    const screenPoint = worldToScreen(handle.point);
    const isActive = activeHandle
      && activeHandle.type === handle.type
      && activeHandle.point.x === handle.point.x
      && activeHandle.point.y === handle.point.y;
    const radius = isActive ? 6.5 : 4;
    ctx.fillStyle = "#fffaf2";
    ctx.strokeStyle = isActive ? "rgba(194, 105, 62, 0.92)" : "#c2693e";
    ctx.lineWidth = isActive ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(screenPoint.x, screenPoint.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
}

function drawDimensionEndpointHandles(entity, previewPoints = null) {
  if (!entity || entity.type !== "dimension" || !state.selectedEntityIds.includes(entity.id)) {
    return;
  }
  const points = previewPoints || { p1: entity.p1, p2: entity.p2 };
  const hoveredHandle = uiState.hoverDimensionEndpointHandle;
  const activeDraft = uiState.dimensionEndpointEditDraft && uiState.dimensionEndpointEditDraft.entityId === entity.id
    ? uiState.dimensionEndpointEditDraft.endpoint
    : null;
  ["p1", "p2"].forEach((endpoint) => {
    const point = roundWorldPoint(points[endpoint]);
    const screenPoint = worldToScreen(point);
    const isActive = activeDraft === endpoint
      || (hoveredHandle
        && hoveredHandle.entityId === entity.id
        && hoveredHandle.endpoint === endpoint
        && hoveredHandle.point.x === point.x
        && hoveredHandle.point.y === point.y);
    ctx.save();
    ctx.fillStyle = "#fffaf2";
    ctx.strokeStyle = isActive ? "rgba(194, 105, 62, 0.94)" : "rgba(194, 105, 62, 0.82)";
    ctx.lineWidth = isActive ? 2.8 : 1.6;
    ctx.beginPath();
    ctx.arc(screenPoint.x, screenPoint.y, isActive ? 5.75 : 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  });
}

function drawDimensionOffsetHandle(entity, pointOverride = null) {
  if (!entity || entity.type !== "dimension" || !state.selectedEntityIds.includes(entity.id)) {
    return;
  }
  const handlePoint = roundWorldPoint(pointOverride || getDimensionGeometry(entity).offsetHandlePoint);
  const screenPoint = worldToScreen(handlePoint);
  const hoveredHandle = uiState.hoverDimensionOffsetHandle;
  const activeDraft = uiState.dimensionOffsetEditDraft && uiState.dimensionOffsetEditDraft.entityId === entity.id;
  const isActive = Boolean(
    activeDraft
    || (hoveredHandle
      && hoveredHandle.entityId === entity.id
      && hoveredHandle.point.x === handlePoint.x
      && hoveredHandle.point.y === handlePoint.y)
  );
  ctx.save();
  ctx.fillStyle = "#fffaf2";
  ctx.strokeStyle = isActive ? "rgba(194, 105, 62, 0.94)" : "rgba(194, 105, 62, 0.82)";
  ctx.lineWidth = isActive ? 2.6 : 1.4;
  ctx.beginPath();
  ctx.arc(screenPoint.x, screenPoint.y, isActive ? 5.5 : 4.25, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawBorrowedHoverHandle() {
  if (!uiState.hoverBorrowedHandle) {
    return;
  }
  const screenPoint = worldToScreen(uiState.hoverBorrowedHandle.point);
  ctx.save();
  ctx.fillStyle = "rgba(255, 250, 242, 0.95)";
  ctx.strokeStyle = "rgba(98, 73, 45, 0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(screenPoint.x, screenPoint.y, 4.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function clampRectCornerRadius(entity) {
  if (!entity || entity.type !== "rect") {
    return 0;
  }
  const maxRadius = Math.min(Math.abs(entity.width || 0), Math.abs(entity.height || 0)) / 2;
  entity.cornerRadius = clampNumber(roundToUnit(entity.cornerRadius || 0), 0, maxRadius, 0);
  return entity.cornerRadius;
}

function buildRoundedRectPath(ctx, x, y, width, height, radius) {
  const left = Math.min(x, x + width);
  const top = Math.min(y, y + height);
  const w = Math.abs(width);
  const h = Math.abs(height);
  const r = Math.min(Math.max(0, Math.abs(radius) || 0), w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + w - r, top);
  ctx.quadraticCurveTo(left + w, top, left + w, top + r);
  ctx.lineTo(left + w, top + h - r);
  ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
  ctx.lineTo(left + r, top + h);
  ctx.quadraticCurveTo(left, top + h, left, top + h - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
}

function drawRectEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer) return;
  const isSelected = state.selectedEntityIds.includes(entity.id);
  const edgeHovered = uiState.hoverRectEdge && uiState.hoverRectEdge.entityId === entity.id;
  const edgeEditing = uiState.rectEdgeEditDraft && uiState.rectEdgeEditDraft.entityId === entity.id;
  const isRectEdgePreview = Boolean(entity && entity.__isRectEdgePreview);
  const p1 = worldToScreen({ x: entity.x, y: entity.y });
  const p2 = worldToScreen({ x: entity.x + entity.width, y: entity.y + entity.height });
  const w = p2.x - p1.x;
  const h = p2.y - p1.y;
  const radiusPx = Math.abs((entity.cornerRadius || 0) * state.view.zoom);
  ctx.save();
  if (edgeEditing && !isRectEdgePreview) {
    ctx.setLineDash([9, 6]);
    ctx.strokeStyle = "rgba(98, 73, 45, 0.82)";
    ctx.lineWidth = 1.5;
    buildRoundedRectPath(ctx, p1.x, p1.y, w, h, radiusPx);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.globalAlpha = getEntityOpacity(entity);
  ctx.setLineDash(getEntityStrokeDash(entity));
  if (entity.fill !== false) {
    ctx.fillStyle = getRenderableEntityFillStyle(entity, layer.color, getEntityFillOpacity(entity, isSelected ? 0.26 : 0.18));
    buildRoundedRectPath(ctx, p1.x, p1.y, w, h, radiusPx);
    ctx.fill();
  }
  if (isSelected && !edgeHovered) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.28)";
    ctx.lineWidth = 10;
    buildRoundedRectPath(ctx, p1.x, p1.y, w, h, radiusPx);
    ctx.stroke();
  }
  ctx.strokeStyle = getRenderableEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  buildRoundedRectPath(ctx, p1.x, p1.y, w, h, radiusPx);
  ctx.stroke();
  const label = (entity.label || "").trim();
  const fontPx = Math.abs((entity.labelSize || mmToUnits(100)) * state.view.zoom);
  if (label && fontPx >= 1.5) {
    ctx.save();
    ctx.globalAlpha = getEntityOpacity(entity);
    ctx.setLineDash([]);
    ctx.fillStyle = getRenderableColorForTheme(normalizeOptionalColor(entity.color || "") || getEntityStrokeColor(entity) || layer.color);
    ctx.font = `${fontPx}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, (p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
    ctx.restore();
  }
  if (edgeHovered) {
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
  drawSelectedEntityHandles(entity);
  ctx.restore();
}

function drawTitleBlockEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer || !titleBlockApi) {
    return;
  }
  titleBlockApi.drawTitleBlock(ctx, entity, {
    projectPoint: worldToScreen,
    projectBounds(bounds) {
      const p1 = worldToScreen({ x: bounds.minX, y: bounds.minY });
      const p2 = worldToScreen({ x: bounds.maxX, y: bounds.maxY });
      return {
        x: Math.min(p1.x, p2.x),
        y: Math.min(p1.y, p2.y),
        width: Math.abs(p2.x - p1.x),
        height: Math.abs(p2.y - p1.y),
      };
    },
    unitsToPixels(units) {
      return units * state.view.zoom;
    },
    isSelected: state.selectedEntityIds.includes(entity.id),
    strokeColor: getRenderableEntityStrokeColor(entity),
    mmToUnits,
    roundToUnit,
  });
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
  ctx.strokeStyle = getRenderableEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  ctx.beginPath();
  ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
  ctx.stroke();
  drawSelectedEntityHandles(entity);
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
  ctx.strokeStyle = getRenderableEntityStrokeColor(entity);
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
    ctx.fillStyle = getRenderableEntityFillStyle(entity, getEntityStrokeColor(entity), getEntityFillOpacity(entity, isSelected ? 0.26 : 0.18));
    ctx.fill();
  }
  if (isSelected) {
    ctx.strokeStyle = "rgba(194, 105, 62, 0.34)";
    ctx.lineWidth = 8;
    ctx.stroke();
  }
  ctx.strokeStyle = getRenderableEntityStrokeColor(entity);
  ctx.lineWidth = getEntityStrokeWidth(entity, 1.0, 2.0, isSelected);
  ctx.stroke();
  drawSelectedEntityHandles(entity);
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
  return withAlpha(normalizeColor(entity.fillColor || fallbackColor), alpha);
}

function getRenderableEntityFillStyle(entity, fallbackColor, alpha) {
  return withAlpha(getRenderableColorForTheme(entity.fillColor || fallbackColor, { minLuminance: 0.3 }), alpha);
}

function drawBlockInstanceEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer || !layer.visible) return;
  const renderables = getBlockInstanceRenderableEntities(entity);
  renderables.forEach((child) => {
    if (!isEntityVisible(child)) return;
    if (child.type === "line") drawLineEntity(child);
    else if (child.type === "rect") drawRectEntity(child);
    else if (child.type === "circle") drawCircleEntity(child);
    else if (child.type === "arc") drawArcEntity(child);
    else if (child.type === "filledRegion") drawFilledRegionEntity(child);
    else if (child.type === "text") drawTextEntity(child);
    else if (child.type === "dimension") drawDimensionEntity(child);
  });
  if (state.selectedEntityIds.includes(entity.id)) {
    const bounds = getBlockInstanceBoundsUnits(entity);
    if (bounds) {
      const p1 = worldToScreen({ x: bounds.minX, y: bounds.minY });
      const p2 = worldToScreen({ x: bounds.maxX, y: bounds.maxY });
      ctx.save();
      ctx.strokeStyle = "rgba(194, 105, 62, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(
        Math.min(p1.x, p2.x),
        Math.min(p1.y, p2.y),
        Math.abs(p2.x - p1.x),
        Math.abs(p2.y - p1.y)
      );
      ctx.restore();
    }
  }
}

function drawLibraryPlacementPreview() {
  const item = getLibraryItemById(uiState.libraryPlacementItemId);
  const point = uiState.libraryPlacementPreviewPoint;
  if (!item || !point) return;

  const previewEntities = getLibraryPreviewEntities(item, point);
  previewEntities.forEach(drawLibraryPreviewEntity);

  const bounds = getBoundsForEntities(previewEntities);
  if (bounds) {
    drawLibraryPreviewBounds(bounds);
  }
}

function drawLibraryPreviewEntity(entity) {
  if (!entity || entity.visible === false) return;
  if (entity.type === "blockInstance") {
    getBlockInstanceRenderableEntities(entity).forEach(drawLibraryPreviewEntity);
    return;
  }
  if (entity.type === "dimension") {
    drawDimensionEntity({ ...entity, __isDimensionOffsetPreview: true });
    return;
  }

  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = "rgba(194, 105, 62, 0.9)";
  ctx.fillStyle = "rgba(194, 105, 62, 0.12)";
  ctx.lineWidth = 1.5;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.setLineDash([8, 6]);

  if (entity.type === "line") {
    const p1 = worldToScreen(entity.p1);
    const p2 = worldToScreen(entity.p2);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  } else if (entity.type === "wire") {
    drawWirePath(entity.start, entity.end, entity.tension);
  } else if (entity.type === "rect") {
    const p1 = worldToScreen({ x: entity.x, y: entity.y });
    const p2 = worldToScreen({ x: entity.x + entity.width, y: entity.y + entity.height });
    const radiusPx = Math.abs((entity.cornerRadius || 0) * state.view.zoom);
    buildRoundedRectPath(ctx, p1.x, p1.y, p2.x - p1.x, p2.y - p1.y, radiusPx);
    if (entity.fill !== false) ctx.fill();
    ctx.stroke();
  } else if (entity.type === "circle") {
    const center = worldToScreen(entity.center);
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(1, Math.abs(entity.radius * state.view.zoom)), 0, Math.PI * 2);
    ctx.stroke();
  } else if (entity.type === "arc") {
    const center = worldToScreen(entity.center);
    const startRad = (entity.startAngleDeg || 0) * Math.PI / 180;
    const endRad = (entity.endAngleDeg || 0) * Math.PI / 180;
    ctx.beginPath();
    ctx.arc(center.x, center.y, Math.max(1, Math.abs(entity.radius * state.view.zoom)), startRad, endRad);
    ctx.stroke();
  } else if (entity.type === "filledRegion" && Array.isArray(entity.points) && entity.points.length >= 3) {
    const points = entity.points.map(worldToScreen);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    if (entity.fill !== false) ctx.fill();
    ctx.stroke();
  } else if (entity.type === "text") {
    drawLibraryPreviewTextEntity(entity);
  }
  ctx.restore();
}

function drawLibraryPreviewTextEntity(entity) {
  const base = worldToScreen({ x: entity.x, y: entity.y });
  const metricsUnits = getTextMetricsUnits(entity);
  const drawOffsetUnits = getTextDrawOffsetUnits(entity, metricsUnits);
  const fontPx = Math.abs(metricsUnits.heightUnits * state.view.zoom);
  const rotationDeg = entity.rotation || 0;
  const rotationRad = (rotationDeg * Math.PI) / 180;

  ctx.save();
  ctx.globalAlpha = 0.72;
  ctx.setLineDash([]);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = entity.align || "left";
  ctx.fillStyle = "rgba(194, 105, 62, 0.9)";
  ctx.translate(base.x, base.y);
  if (rotationDeg) {
    ctx.rotate(-rotationRad);
  }
  if (fontPx >= 1.5) {
    ctx.font = `${fontPx}px sans-serif`;
    ctx.fillText(
      entity.text || "",
      drawOffsetUnits.x * state.view.zoom,
      drawOffsetUnits.y * state.view.zoom,
    );
  }
  ctx.restore();
}

function drawLibraryPreviewBounds(bounds) {
  const p1 = worldToScreen({ x: bounds.minX, y: bounds.minY });
  const p2 = worldToScreen({ x: bounds.maxX, y: bounds.maxY });

  ctx.save();
  ctx.strokeStyle = "rgba(194, 105, 62, 0.8)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(
    Math.min(p1.x, p2.x),
    Math.min(p1.y, p2.y),
    Math.abs(p2.x - p1.x),
    Math.abs(p2.y - p1.y)
  );
  ctx.restore();
}

function drawTextEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer) return;
  const isSelected = state.selectedEntityIds.includes(entity.id);
  const base = worldToScreen({ x: entity.x, y: entity.y });
  const color = getRenderableColorForTheme(normalizeColor(entity.color || layer.color));
  const metricsUnits = getTextMetricsUnits(entity);
  const drawOffsetUnits = getTextDrawOffsetUnits(entity, metricsUnits);
  const localBoxUnits = getTextLocalBoxUnits(entity, metricsUnits);
  const fontPx = Math.abs(metricsUnits.heightUnits * state.view.zoom);
  const shouldDrawTextGlyphs = fontPx >= 1.5;
  const rotationDeg = entity.rotation || 0;
  const rotationRad = (rotationDeg * Math.PI) / 180;
  ctx.save();
  ctx.globalAlpha = getEntityOpacity(entity);
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = entity.align || "left";
  ctx.fillStyle = color;
  ctx.translate(base.x, base.y);
  if (rotationDeg) {
    ctx.rotate(-rotationRad);
  }
  if (shouldDrawTextGlyphs) {
    ctx.font = `${fontPx}px sans-serif`;
    ctx.fillText(
      entity.text,
      drawOffsetUnits.x * state.view.zoom,
      drawOffsetUnits.y * state.view.zoom,
    );
  }
  if (isSelected) {
    ctx.strokeStyle = "#c2693e";
    ctx.lineWidth = 1.3;
    const left = localBoxUnits.left * state.view.zoom;
    const top = localBoxUnits.top * state.view.zoom;
    const width = (localBoxUnits.right - localBoxUnits.left) * state.view.zoom;
    const height = (localBoxUnits.bottom - localBoxUnits.top) * state.view.zoom;
    ctx.strokeRect(left - 4, top - 4, width + 8, height + 8);
    ctx.fillStyle = "#fffaf2";
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function getDimensionDisplayText(entity) {
  if ((entity.textOverride || "").trim()) return entity.textOverride.trim();
  const dist = unitsToMm(Math.hypot(entity.p2.x - entity.p1.x, entity.p2.y - entity.p1.y));
  return dist.toFixed(entity.precision ?? 0);
}

function getDimensionGeometryColor(entity) {
  const layer = getLayerById(entity.layerId);
  return normalizeColor(layer?.color || "#2e3135");
}

function getRenderableDimensionGeometryColor(entity) {
  return getRenderableColorForTheme(getDimensionGeometryColor(entity));
}

function getDimensionTextColor(entity) {
  const layer = getLayerById(entity.layerId);
  return normalizeColor(entity.color || layer?.color || "#2e3135");
}

function getRenderableDimensionTextColor(entity) {
  return getRenderableColorForTheme(getDimensionTextColor(entity));
}

function getDimensionTickRadiusPx(entity) {
  const tickRadiusPx = Math.abs((entity.tickSize || 250) * state.view.zoom * 0.06);
  return tickRadiusPx < 0.75 ? 0 : tickRadiusPx;
}

function getDimensionExtensionGapUnits(entity) {
  if (Number.isFinite(entity.extensionGap)) {
    return Math.max(0, entity.extensionGap);
  }
  return DEFAULT_DIMENSION_EXTENSION_GAP_UNITS;
}

function getDimensionGeometry(entity) {
  const dx = entity.p2.x - entity.p1.x;
  const dy = entity.p2.y - entity.p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const midpoint = {
    x: roundToUnit((entity.p1.x + entity.p2.x) / 2),
    y: roundToUnit((entity.p1.y + entity.p2.y) / 2),
  };
  const d1 = (entity.offsetPoint.x - entity.p1.x) * nx + (entity.offsetPoint.y - entity.p1.y) * ny;
  const d2 = (entity.offsetPoint.x - entity.p2.x) * nx + (entity.offsetPoint.y - entity.p2.y) * ny;
  const signedOffset = (d1 + d2) / 2;
  const o1 = { x: roundToUnit(entity.p1.x + nx * d1), y: roundToUnit(entity.p1.y + ny * d1) };
  const o2 = { x: roundToUnit(entity.p2.x + nx * d2), y: roundToUnit(entity.p2.y + ny * d2) };
  const offsetHandlePoint = {
    x: roundToUnit(midpoint.x + nx * signedOffset),
    y: roundToUnit(midpoint.y + ny * signedOffset),
  };
  const gap = getDimensionExtensionGapUnits(entity);
  const extensionStart1 = Math.abs(d1) <= gap
    ? roundWorldPoint(entity.p1)
    : { x: roundToUnit(entity.p1.x + nx * Math.sign(d1) * gap), y: roundToUnit(entity.p1.y + ny * Math.sign(d1) * gap) };
  const extensionStart2 = Math.abs(d2) <= gap
    ? roundWorldPoint(entity.p2)
    : { x: roundToUnit(entity.p2.x + nx * Math.sign(d2) * gap), y: roundToUnit(entity.p2.y + ny * Math.sign(d2) * gap) };
  return { o1, o2, extensionStart1, extensionStart2, midpoint, normal: { x: nx, y: ny }, signedOffset, offsetHandlePoint };
}

function getDimensionTickRadiusUnits(entity) {
  return Math.abs((entity.tickSize || 250) * 0.06);
}

function getDimensionTextNormal(lineDx, lineDy, lineLen) {
  const safeLen = lineLen || 1;
  const baseNormal = { x: -lineDy / safeLen, y: lineDx / safeLen };
  const verticalBiasThreshold = 0.86;
  if (Math.abs(lineDx) >= Math.abs(lineDy)) {
    return baseNormal.y <= 0 ? baseNormal : { x: -baseNormal.x, y: -baseNormal.y };
  }
  if (Math.abs(lineDy / safeLen) >= verticalBiasThreshold) {
    return baseNormal.x <= 0 ? baseNormal : { x: -baseNormal.x, y: -baseNormal.y };
  }
  return baseNormal.y <= 0 ? baseNormal : { x: -baseNormal.x, y: -baseNormal.y };
}

function normalizeAngleRad(angleRad) {
  let angle = Number(angleRad) || 0;
  while (angle <= -Math.PI) angle += Math.PI * 2;
  while (angle > Math.PI) angle -= Math.PI * 2;
  return angle;
}

function isNearlyVerticalAngle(angleRad) {
  const normalized = normalizeAngleRad(angleRad);
  const absCos = Math.abs(Math.cos(normalized));
  return absCos < 0.25;
}

function normalizeDimensionTextRotation(angleRad) {
  let angle = normalizeAngleRad(angleRad);
  if (!isNearlyVerticalAngle(angle)) {
    if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
      angle += Math.PI;
    }
    return normalizeAngleRad(angle);
  }
  angle += Math.PI;
  return normalizeAngleRad(angle);
}

function getDimensionTextLayout(entity, geometry = getDimensionGeometry(entity)) {
  const lineDx = geometry.o2.x - geometry.o1.x;
  const lineDy = geometry.o2.y - geometry.o1.y;
  const lineLen = Math.hypot(lineDx, lineDy) || 1;
  const midpoint = {
    x: (geometry.o1.x + geometry.o2.x) / 2,
    y: (geometry.o1.y + geometry.o2.y) / 2,
  };
  const textNormal = getDimensionTextNormal(lineDx, lineDy, lineLen);
  const textOffsetUnits = (entity.textHeight || 250) * 0.55;
  const textAngleRad = normalizeDimensionTextRotation(Math.atan2(lineDy, lineDx));
  return {
    text: getDimensionDisplayText(entity),
    textAngleRad,
    textNormal,
    textOffsetUnits,
    textPosition: {
      x: midpoint.x + textNormal.x * textOffsetUnits,
      y: midpoint.y + textNormal.y * textOffsetUnits,
    },
  };
}

function createDimensionWithPreservedOffset(entity, endpoint, nextPoint, signedOffset) {
  const nextDimension = {
    ...entity,
    p1: endpoint === "p1" ? roundWorldPoint(nextPoint) : roundWorldPoint(entity.p1),
    p2: endpoint === "p2" ? roundWorldPoint(nextPoint) : roundWorldPoint(entity.p2),
  };
  const dx = nextDimension.p2.x - nextDimension.p1.x;
  const dy = nextDimension.p2.y - nextDimension.p1.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) {
    return null;
  }
  const midpoint = {
    x: roundToUnit((nextDimension.p1.x + nextDimension.p2.x) / 2),
    y: roundToUnit((nextDimension.p1.y + nextDimension.p2.y) / 2),
  };
  const normal = {
    x: -dy / len,
    y: dx / len,
  };
  nextDimension.offsetPoint = {
    x: roundToUnit(midpoint.x + normal.x * signedOffset),
    y: roundToUnit(midpoint.y + normal.y * signedOffset),
  };
  return nextDimension;
}

function getDimensionScreenGeometry(entity) {
  const geometryWorld = getDimensionGeometry(entity);
  const textLayoutWorld = getDimensionTextLayout(entity, geometryWorld);
  const {
    o1: o1World,
    o2: o2World,
    extensionStart1: extensionStart1World,
    extensionStart2: extensionStart2World,
    offsetHandlePoint: offsetHandlePointWorld,
  } = geometryWorld;
  const p1 = worldToScreen(entity.p1);
  const p2 = worldToScreen(entity.p2);
  const extensionStart1 = worldToScreen(extensionStart1World);
  const extensionStart2 = worldToScreen(extensionStart2World);
  const o1 = worldToScreen(o1World);
  const o2 = worldToScreen(o2World);
  const offsetHandlePoint = worldToScreen(offsetHandlePointWorld);
  const text = textLayoutWorld.text;
  const fontPx = Math.abs((entity.textHeight || 250) * state.view.zoom);
  const tickRadiusPx = getDimensionTickRadiusPx(entity);
  const textPosition = worldToScreen(textLayoutWorld.textPosition);
  const textAngleRad = textLayoutWorld.textAngleRad;

  ctx.save();
  ctx.font = `${fontPx}px sans-serif`;
  const textWidth = ctx.measureText(text).width;
  ctx.restore();

  const textBox = {
    left: textPosition.x - textWidth / 2 - 8,
    right: textPosition.x + textWidth / 2 + 8,
    top: textPosition.y - fontPx / 2 - 6,
    bottom: textPosition.y + fontPx / 2 + 6,
  };

  return {
    p1,
    p2,
    extensionStart1,
    extensionStart2,
    o1,
    o2,
    offsetHandlePoint,
    extensionLines: [[extensionStart1, o1], [extensionStart2, o2]],
    dimensionLine: [o1, o2],
    tickDots: [
      { center: o1, radiusPx: tickRadiusPx },
      { center: o2, radiusPx: tickRadiusPx },
    ],
    text,
    textPosition,
    textAngleRad,
    textBox,
    fontPx,
  };
}

function drawDimensionEntity(entity) {
  const layer = getLayerById(entity.layerId); if (!layer) return;
  const isSelected = state.selectedEntityIds.includes(entity.id);
  const geometry = getDimensionScreenGeometry(entity);
  const isPreview = Boolean(entity.__isDimensionOffsetPreview);
  const geometryColor = isPreview ? "rgba(194, 105, 62, 0.9)" : getRenderableDimensionGeometryColor(entity);
  const textColor = isPreview ? "rgba(194, 105, 62, 0.95)" : getRenderableDimensionTextColor(entity);
  const lineWidth = isPreview ? 1.5 : 1;
  ctx.save();
  ctx.globalAlpha = isPreview ? 1 : getEntityOpacity(entity);
  ctx.setLineDash(isPreview ? [8, 6] : []);
  ctx.strokeStyle = geometryColor;
  ctx.fillStyle = geometryColor;
  ctx.lineWidth = lineWidth;
  [...geometry.extensionLines, geometry.dimensionLine].forEach(([a, b]) => {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  });
  geometry.tickDots.forEach(({ center, radiusPx }) => {
    if (radiusPx < 0.75) {
      return;
    }
    ctx.beginPath();
    ctx.arc(center.x, center.y, radiusPx, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.setLineDash([]);
  if (geometry.fontPx >= 1.5) {
    ctx.font = `${geometry.fontPx}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = textColor;
    ctx.translate(geometry.textPosition.x, geometry.textPosition.y);
    ctx.rotate(geometry.textAngleRad);
    ctx.fillText(geometry.text, 0, 0);
    if (isSelected && !isPreview) {
      ctx.strokeStyle = "rgba(194, 105, 62, 0.78)";
      ctx.lineWidth = 1.2;
      ctx.strokeRect(
        geometry.textBox.left - geometry.textPosition.x,
        geometry.textBox.top - geometry.textPosition.y,
        geometry.textBox.right - geometry.textBox.left,
        geometry.textBox.bottom - geometry.textBox.top
      );
    }
  }
  ctx.restore();
}

function drawDimensionDraftPreview(dimensionDraft) {
  let p1 = null;
  let p2 = null;
  let offsetPoint = null;
  if (dimensionDraft.mode === "chain") {
    p1 = roundWorldPoint(dimensionDraft.chainStartPoint);
    p2 = roundWorldPoint(uiState.hoverWorld);
    const previewEntity = createDimensionWithPreservedOffset(
      createDefaultDimensionEntity({
        id: "draft-dimension-chain",
        layerId: state.activeLayerId,
        p1,
        p2,
        offsetPoint: p2,
      }),
      "p2",
      p2,
      dimensionDraft.signedOffset
    );
    if (!previewEntity) {
      return;
    }
    offsetPoint = previewEntity.offsetPoint;
  } else {
    p1 = roundWorldPoint(dimensionDraft.p1);
    p2 = dimensionDraft.step === 1
      ? roundWorldPoint(uiState.hoverWorld)
      : roundWorldPoint(dimensionDraft.p2);
    offsetPoint = dimensionDraft.step === 1
      ? p2
      : roundWorldPoint(uiState.hoverWorld);
  }
  if (p1.x === p2.x && p1.y === p2.y) {
    return;
  }
  drawDimensionEntity(createDefaultDimensionEntity({
    id: "draft-dimension",
    layerId: state.activeLayerId,
    p1,
    p2,
    offsetPoint,
  }));
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
      drawPreviewLineEntity(entity);
    } else if (entity.type === "wire") {
      drawWireEntity(entity);
    } else if (entity.type === "rect") {
      const p1 = worldToScreen({ x: entity.x, y: entity.y });
      const p2 = worldToScreen({ x: entity.x + entity.width, y: entity.y + entity.height });
      ctx.save();
      ctx.setLineDash([9, 6]);
      ctx.strokeStyle = "rgba(98, 73, 45, 0.82)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.restore();
    } else if (entity.type === "blockInstance") {
      const bounds = getBlockInstanceBoundsUnits(entity);
      if (!bounds) {
        return;
      }
      const p1 = worldToScreen({ x: bounds.minX, y: bounds.minY });
      const p2 = worldToScreen({ x: bounds.maxX, y: bounds.maxY });
      ctx.save();
      ctx.setLineDash([9, 6]);
      ctx.strokeStyle = "rgba(98, 73, 45, 0.82)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        Math.min(p1.x, p2.x),
        Math.min(p1.y, p2.y),
        Math.abs(p2.x - p1.x),
        Math.abs(p2.y - p1.y)
      );
      ctx.restore();
    } else if (entity.type === "titleBlock") {
      drawTitleBlockEntity(entity);
    }
  });
  transformDraft.entities.forEach((entity) => {
    if (entity.type === "line") {
      const previewLine = { ...entity, p1: { x: entity.p1.x + offset.dx, y: entity.p1.y + offset.dy }, p2: { x: entity.p2.x + offset.dx, y: entity.p2.y + offset.dy } };
      drawSolidPreviewLineEntity(previewLine);
    } else if (entity.type === "wire") {
      drawEntityPreview(applyOffsetToEntity(entity, offset));
    } else if (entity.type === "rect" || entity.type === "pdfUnderlay" || entity.type === "dxfUnderlay") {
      drawEntityPreview(applyOffsetToEntity(entity, offset));
    } else if (entity.type === "blockInstance") {
      drawBlockInstanceEntity(applyOffsetToEntity(entity, offset));
    } else if (entity.type === "circle" || entity.type === "arc" || entity.type === "filledRegion" || entity.type === "text" || entity.type === "dimension" || entity.type === "titleBlock") {
      drawEntityPreview(applyOffsetToEntity(entity, offset));
    }
  });
}

function drawEntityPreview(entity) {
  if (entity.type === "pdfUnderlay") {
    drawPdfUnderlayEntity(entity);
  } else if (entity.type === "dxfUnderlay") {
    drawDxfUnderlayEntity(entity);
  } else if (entity.type === "circle") {
    drawCircleEntity(entity);
  } else if (entity.type === "arc") {
    drawArcEntity(entity);
  } else if (entity.type === "wire") {
    drawWireEntity(entity);
  } else if (entity.type === "rect") {
    drawRectEntity(entity);
  } else if (entity.type === "filledRegion") {
    drawFilledRegionEntity(entity);
  } else if (entity.type === "text") {
    drawTextEntity(entity);
  } else if (entity.type === "dimension") {
    drawDimensionEntity(entity);
  } else if (entity.type === "titleBlock") {
    drawTitleBlockEntity(entity);
  } else if (entity.type === "blockInstance") {
    drawBlockInstanceEntity(entity);
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

function drawDimensionEndpointEditPreview(draft) {
  const entity = getEntityById(draft.entityId);
  if (!entity || entity.type !== "dimension" || !isLayerVisible(entity.layerId)) {
    return;
  }
  const previewEntity = createDimensionWithPreservedOffset(
    entity,
    draft.endpoint,
    draft.currentPoint,
    draft.signedOffset
  );
  if (!previewEntity) {
    return;
  }
  drawDimensionEntity({
    ...previewEntity,
    __isDimensionOffsetPreview: true,
  });
}

function drawDimensionOffsetEditPreview(draft) {
  const entity = getEntityById(draft.entityId);
  if (!entity || entity.type !== "dimension" || !isLayerVisible(entity.layerId)) {
    return;
  }
  drawDimensionEntity({
    ...entity,
    offsetPoint: roundWorldPoint(draft.currentPoint),
    __isDimensionOffsetPreview: true,
  });
}

function findDimensionEndpointHandleAtPoint(worldPoint) {
  const selectedIds = new Set(state.selectedEntityIds);
  return state.entities
    .filter((entity) => entity.type === "dimension" && selectedIds.has(entity.id) && canSelectEntity(entity))
    .slice()
    .reverse()
    .flatMap((entity) => ([
      {
        entityId: entity.id,
        endpoint: "p1",
        point: roundWorldPoint(entity.p1),
      },
      {
        entityId: entity.id,
        endpoint: "p2",
        point: roundWorldPoint(entity.p2),
      },
    ]))
    .map((candidate) => ({
      ...candidate,
      distancePx: distanceScreenPx(worldPoint, candidate.point),
    }))
    .filter((candidate) => candidate.distancePx <= state.settings.snapTolerancePx)
    .sort((a, b) => a.distancePx - b.distancePx)[0] || null;
}

function startDimensionEndpointEdit(handleHit, worldPoint) {
  const entity = getEntityById(handleHit.entityId);
  if (!entity || entity.type !== "dimension" || !canSelectEntity(entity)) {
    return false;
  }
  const geometry = getDimensionGeometry(entity);
  state.selectedEntityIds = [entity.id];
  syncAfterStateChange(false);
  uiState.dimensionEndpointEditDraft = {
    entityId: entity.id,
    endpoint: handleHit.endpoint,
    startPoint: deepClone(handleHit.point),
    currentPoint: roundWorldPoint(worldPoint),
    originalEntity: deepClone(entity),
    signedOffset: geometry.signedOffset,
  };
  setStatus(`Dimension ${handleHit.endpoint.toUpperCase()} edit active. Drag handle or press Esc to cancel.`);
  draw();
  renderStatusPanel();
  return true;
}

function updateDimensionEndpointEdit(worldPoint) {
  if (!uiState.dimensionEndpointEditDraft) {
    return;
  }
  uiState.dimensionEndpointEditDraft.currentPoint = roundWorldPoint(worldPoint);
  draw();
  renderStatusPanel();
}

function cancelDimensionEndpointEdit(message = "Dimension endpoint edit cancelled.") {
  if (!uiState.dimensionEndpointEditDraft) {
    return false;
  }
  uiState.dimensionEndpointEditDraft = null;
  draw();
  renderStatusPanel();
  setStatus(message);
  return true;
}

function applyDimensionEndpointEdit() {
  const draft = uiState.dimensionEndpointEditDraft;
  if (!draft) {
    return false;
  }
  const entity = getEntityById(draft.entityId);
  if (!entity || entity.type !== "dimension" || !canSelectEntity(entity)) {
    uiState.dimensionEndpointEditDraft = null;
    draw();
    renderStatusPanel();
    return false;
  }
  const nextPoint = getSnapPoint(draft.currentPoint);
  const previewEntity = createDimensionWithPreservedOffset(entity, draft.endpoint, nextPoint, draft.signedOffset);
  if (!previewEntity) {
    setStatus("Dimension endpoints must not be identical.");
    uiState.dimensionEndpointEditDraft = null;
    draw();
    renderStatusPanel();
    return false;
  }
  if (
    previewEntity.p1.x === entity.p1.x &&
    previewEntity.p1.y === entity.p1.y &&
    previewEntity.p2.x === entity.p2.x &&
    previewEntity.p2.y === entity.p2.y &&
    previewEntity.offsetPoint.x === entity.offsetPoint.x &&
    previewEntity.offsetPoint.y === entity.offsetPoint.y
  ) {
    return cancelDimensionEndpointEdit();
  }
  pushUndoState();
  entity.p1 = previewEntity.p1;
  entity.p2 = previewEntity.p2;
  entity.offsetPoint = previewEntity.offsetPoint;
  uiState.dimensionEndpointEditDraft = null;
  syncAfterStateChange();
  setStatus("Dimension endpoint updated.");
  return true;
}

function getRectEdgeNumericPreviewPoint() {
  const draft = uiState.rectEdgeEditDraft;
  if (!draft || !draft.numericInputBuffer) {
    return null;
  }

  const lengthMm = Number.parseFloat(draft.numericInputBuffer);
  if (!draft.numericInputBuffer || !Number.isFinite(lengthMm) || lengthMm <= 0) {
    return null;
  }

  const deltaUnits = mmToUnits(lengthMm);
  if (deltaUnits <= 0) {
    return null;
  }

  const axis = draft.edge === "left" || draft.edge === "right" ? "x" : "y";
  const defaultSign = draft.edge === "right" || draft.edge === "bottom" ? 1 : -1;
  const currentDelta = draft.currentPoint[axis] - draft.startPoint[axis];
  const hoverDelta = uiState.hoverWorld[axis] - draft.startPoint[axis];
  const direction = Math.sign(currentDelta) || Math.sign(hoverDelta) || defaultSign;

  if (draft.edge === "left" || draft.edge === "right") {
    return {
      x: roundToGridUnit(draft.startPoint.x + direction * deltaUnits),
      y: draft.startPoint.y,
    };
  }

  return {
    x: draft.startPoint.x,
    y: roundToGridUnit(draft.startPoint.y + direction * deltaUnits),
  };
}

function getRectEdgeEditActiveStatus(draft) {
  return `Rectangle Edge Edit | ${draft.edge} edge | Pick new edge position, type distance, or Esc: cancel`;
}

function getRectEdgeNumericStatus(draft) {
  return `Rectangle Edge Edit | ${draft.edge} edge | ${draft.numericInputBuffer} mm | Enter: apply | Esc: cancel`;
}

function updateRectEdgeEditStatus() {
  if (!uiState.rectEdgeEditDraft) {
    return;
  }
  setStatus(
    uiState.rectEdgeEditDraft.numericInputBuffer
      ? getRectEdgeNumericStatus(uiState.rectEdgeEditDraft)
      : getRectEdgeEditActiveStatus(uiState.rectEdgeEditDraft)
  );
  renderPropertiesPanel();
  renderStatusPanel();
}

function getResizedRectFromAnchorPoint(draft, anchorPoint) {
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

function applyRectEdgeNumericPreview() {
  if (!uiState.rectEdgeEditDraft || !uiState.rectEdgeEditDraft.numericInputBuffer) {
    return false;
  }
  const previewPoint = getRectEdgeNumericPreviewPoint();
  if (!previewPoint) {
    return false;
  }
  uiState.rectEdgeEditDraft.currentPoint = previewPoint;
  updateRectEdgeEditStatus();
  draw();
  return true;
}

function applyRectEdgeNumericEdit() {
  if (!uiState.rectEdgeEditDraft || !uiState.rectEdgeEditDraft.numericInputBuffer) {
    return false;
  }
  const previewPoint = getRectEdgeNumericPreviewPoint();
  if (!previewPoint) {
    setStatus("Enter a valid rectangle edge distance.");
    return false;
  }
  uiState.rectEdgeEditDraft.currentPoint = previewPoint;
  return applyRectEdgeEdit();
}

function applyRectEdgeEdit() {
  const draft = uiState.rectEdgeEditDraft;
  if (!draft) {
    return false;
  }
  const entity = getEntityById(draft.entityId);
  if (!entity || entity.type !== "rect" || !canSelectEntity(entity)) {
    uiState.rectEdgeEditDraft = null;
    draw();
    renderPropertiesPanel();
    renderStatusPanel();
    return false;
  }

  const nextRect = getResizedRectFromAnchorPoint(draft, draft.currentPoint);
  if (
    nextRect.x === draft.originalRect.x &&
    nextRect.y === draft.originalRect.y &&
    nextRect.width === draft.originalRect.width &&
    nextRect.height === draft.originalRect.height
  ) {
    uiState.rectEdgeEditDraft = null;
    draw();
    renderPropertiesPanel();
    renderStatusPanel();
    setStatus("Rectangle edge edit cancelled.");
    return false;
  }

  pushUndoState();
  entity.x = nextRect.x;
  entity.y = nextRect.y;
  entity.width = nextRect.width;
  entity.height = nextRect.height;
  clampRectCornerRadius(entity);
  uiState.rectEdgeEditDraft = null;
  state.selectedEntityIds = [];
  syncAfterStateChange();
  setStatus("Rectangle resized.");
  return true;
}

function getDimensionOffsetHandle(entity) {
  if (!entity || entity.type !== "dimension") {
    return null;
  }
  const geometry = getDimensionGeometry(entity);
  return {
    entityId: entity.id,
    type: "dimensionOffset",
    point: roundWorldPoint(geometry.offsetHandlePoint),
  };
}

function findDimensionOffsetHandleAtPoint(worldPoint) {
  const selectedIds = new Set(state.selectedEntityIds);
  return state.entities
    .filter((entity) => entity.type === "dimension" && selectedIds.has(entity.id) && canSelectEntity(entity))
    .slice()
    .reverse()
    .map((entity) => {
      const handle = getDimensionOffsetHandle(entity);
      return handle
        ? { ...handle, distancePx: distanceScreenPx(worldPoint, handle.point) }
        : null;
    })
    .filter((candidate) => candidate && candidate.distancePx <= state.settings.snapTolerancePx)
    .sort((a, b) => a.distancePx - b.distancePx)[0] || null;
}

function startDimensionOffsetEdit(handleHit, worldPoint) {
  const entity = getEntityById(handleHit.entityId);
  if (!entity || entity.type !== "dimension" || !canSelectEntity(entity)) {
    return false;
  }
  const geometry = getDimensionGeometry(entity);
  state.selectedEntityIds = [entity.id];
  syncAfterStateChange(false);
  uiState.dimensionOffsetEditDraft = {
    entityId: entity.id,
    startPoint: deepClone(handleHit.point),
    currentPoint: roundWorldPoint(handleHit.point),
    originalOffsetPoint: deepClone(entity.offsetPoint),
    midpoint: deepClone(geometry.midpoint),
    normal: deepClone(geometry.normal),
  };
  setStatus("Dimension offset edit active. Drag handle or press Esc to cancel.");
  draw();
  renderStatusPanel();
  return true;
}

function updateDimensionOffsetEdit(worldPoint) {
  if (!uiState.dimensionOffsetEditDraft) {
    return;
  }
  const { midpoint, normal } = uiState.dimensionOffsetEditDraft;
  const pointerDelta = {
    x: worldPoint.x - midpoint.x,
    y: worldPoint.y - midpoint.y,
  };
  const signedOffset = pointerDelta.x * normal.x + pointerDelta.y * normal.y;
  uiState.dimensionOffsetEditDraft.currentPoint = {
    x: roundToUnit(midpoint.x + normal.x * signedOffset),
    y: roundToUnit(midpoint.y + normal.y * signedOffset),
  };
  draw();
  renderStatusPanel();
}

function cancelDimensionOffsetEdit(message = "Dimension offset edit cancelled.") {
  if (!uiState.dimensionOffsetEditDraft) {
    return false;
  }
  uiState.dimensionOffsetEditDraft = null;
  draw();
  renderStatusPanel();
  setStatus(message);
  return true;
}

function applyDimensionOffsetEdit() {
  const draft = uiState.dimensionOffsetEditDraft;
  if (!draft) {
    return false;
  }
  const entity = getEntityById(draft.entityId);
  if (!entity || entity.type !== "dimension" || !canSelectEntity(entity)) {
    uiState.dimensionOffsetEditDraft = null;
    draw();
    renderStatusPanel();
    return false;
  }
  const nextOffsetPoint = roundWorldPoint(draft.currentPoint);
  if (
    nextOffsetPoint.x === draft.originalOffsetPoint.x &&
    nextOffsetPoint.y === draft.originalOffsetPoint.y
  ) {
    return cancelDimensionOffsetEdit();
  }
  pushUndoState();
  entity.offsetPoint = nextOffsetPoint;
  uiState.dimensionOffsetEditDraft = null;
  syncAfterStateChange();
  setStatus("Dimension offset updated.");
  return true;
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

  if (uiState.rectEdgeEditDraft) {
    const labelPoint = {
      x: (uiState.rectEdgeEditDraft.startPoint.x + uiState.rectEdgeEditDraft.currentPoint.x) / 2,
      y: (uiState.rectEdgeEditDraft.startPoint.y + uiState.rectEdgeEditDraft.currentPoint.y) / 2,
    };
    const text = uiState.rectEdgeEditDraft.numericInputBuffer || formatDistanceMmFromPoints(
      uiState.rectEdgeEditDraft.startPoint,
      uiState.rectEdgeEditDraft.currentPoint
    );
    drawDynamicInputLabel(
      text,
      labelPoint,
      { emphasized: Boolean(uiState.rectEdgeEditDraft.numericInputBuffer) }
    );
    if (uiState.rectEdgeEditDraft.numericInputBuffer) {
      drawDynamicInputLabel(
        "Enter: apply | Esc: cancel",
        labelPoint,
        { emphasized: false, offsetY: 10 }
      );
    }
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

function drawMirrorAxisDraft(firstPoint, secondPoint) {
  if (!firstPoint || !secondPoint) {
    return;
  }
  const screenFirst = worldToScreen(firstPoint);
  const screenSecond = worldToScreen(secondPoint);
  ctx.save();
  ctx.strokeStyle = getCssVar("--canvas-axis-preview", "rgba(80, 90, 110, 0.75)");
  ctx.lineWidth = 1;
  ctx.setLineDash([6, 5]);
  ctx.beginPath();
  ctx.moveTo(screenFirst.x, screenFirst.y);
  ctx.lineTo(screenSecond.x, screenSecond.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawSolidPreviewLineEntity(entity) {
  const layer = getLayerById(entity.layerId);
  if (!layer || !isLayerVisible(entity.layerId)) {
    return;
  }
  const screenP1 = worldToScreen(entity.p1);
  const screenP2 = worldToScreen(entity.p2);

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(194, 105, 62, 0.92)";
  ctx.lineWidth = 2;
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

function addWireEntity(startPoint, endPoint) {
  const activeLayer = getLayerById(state.activeLayerId);
  if (!activeLayer) {
    setStatus("No active layer.");
    return null;
  }
  if (!activeLayer.visible || activeLayer.locked) {
    setStatus("Active layer must be visible and unlocked to draw.");
    return null;
  }

  const start = roundWorldPoint(startPoint);
  const end = roundWorldPoint(endPoint);
  if (start.x === end.x && start.y === end.y) {
    setStatus("Wire length must be greater than zero.");
    return null;
  }

  pushUndoState();
  const entity = createDefaultWireEntity({
    start,
    end,
    layerId: state.activeLayerId,
    startRef: null,
    endRef: null,
    tension: 0.45,
    color: "",
  });
  state.entities.push(entity);
  state.selectedEntityIds = [entity.id];
  syncAfterStateChange();
  return entity;
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
  const rect = { id: createEntityId(), type: "rect", layerId: state.activeLayerId, ...box, rotation: 0, name: "Box", fill: true, fillColor: getDefaultRectangleFillColor(), label: "", labelSize: mmToUnits(100), cornerRadius: 0 };
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
  const rect = { id: createEntityId(), type: "rect", layerId: state.activeLayerId, ...box, rotation: 0, name: "Box", fill: true, fillColor: getDefaultRectangleFillColor(), label: "", labelSize: mmToUnits(100), cornerRadius: 0 };
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

function applyLineNumericEdit() {
  return createLineFromNumericInput();
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

function applyTransformNumericEdit() {
  return createTransformFromNumericInput();
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
  state.selectedEntityIds = [];
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

function applyGripNumericEdit() {
  return createGripEditFromNumericInput();
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
    .filter((entity) => entity && (entity.type === "line" || entity.type === "wire" || entity.type === "rect" || entity.type === "pdfUnderlay" || entity.type === "dxfUnderlay" || entity.type === "titleBlock" || entity.type === "circle" || entity.type === "arc" || entity.type === "filledRegion" || entity.type === "text" || entity.type === "dimension" || entity.type === "blockInstance") && canSelectEntity(entity));
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

function updateTransformDraft(worldPoint, snappedWorldPoint = worldPoint, options = {}) {
  if (!uiState.transformDraft) {
    return;
  }
  if (uiState.transformDraft.numericInputBuffer) {
    return;
  }
  uiState.transformDraft.currentPoint = options.snapped
    ? snappedWorldPoint
    : getQuantizedDeltaPoint(uiState.transformDraft.startPoint, worldPoint);
  draw();
}

function applyOffsetToEntity(entity, offset) {
  if (entity.type === "wire") {
    return {
      ...entity,
      start: {
        x: roundToUnit(entity.start.x + offset.dx),
        y: roundToUnit(entity.start.y + offset.dy),
      },
      end: {
        x: roundToUnit(entity.end.x + offset.dx),
        y: roundToUnit(entity.end.y + offset.dy),
      },
      startRef: null,
      endRef: null,
    };
  }
  if (entity.type === "rect" || entity.type === "titleBlock" || entity.type === "pdfUnderlay" || entity.type === "dxfUnderlay") {
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
  if (entity.type === "blockInstance") {
    return {
      ...entity,
      x: roundToUnit(entity.x + offset.dx),
      y: roundToUnit(entity.y + offset.dy),
    };
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

function rotatePoint(point, center, angleDeg) {
  const angleRad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: roundToUnit(center.x + dx * cos - dy * sin),
    y: roundToUnit(center.y + dx * sin + dy * cos),
  };
}

function normalizeAngleDeg(angleDeg) {
  const normalized = ((angleDeg % 360) + 360) % 360;
  return roundToUnit(normalized);
}

function pointFromCenterRadiusAngle(center, radius, angleDeg) {
  const angleRad = (angleDeg * Math.PI) / 180;
  return {
    x: roundToUnit(center.x + Math.cos(angleRad) * radius),
    y: roundToUnit(center.y + Math.sin(angleRad) * radius),
  };
}

function mirrorPointAcrossAxis(point, axisA, axisB) {
  const dx = axisB.x - axisA.x;
  const dy = axisB.y - axisA.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq <= 0) {
    return roundWorldPoint(point);
  }
  const px = point.x - axisA.x;
  const py = point.y - axisA.y;
  const t = (px * dx + py * dy) / lenSq;
  const proj = {
    x: axisA.x + t * dx,
    y: axisA.y + t * dy,
  };
  return roundWorldPoint({
    x: 2 * proj.x - point.x,
    y: 2 * proj.y - point.y,
  });
}

function getMirrorAxisSecondPoint(worldPoint, shiftKey = uiState.isShiftPressed) {
  if (!uiState.mirrorDraft || !uiState.mirrorDraft.firstPoint) {
    return roundWorldPoint(worldPoint);
  }
  const constrained = applyOrthoConstraint(uiState.mirrorDraft.firstPoint, worldPoint, !shiftKey);
  return roundWorldPoint(constrained);
}

function isVerticalOrHorizontalMirrorAxis(lineP1, lineP2) {
  return lineP1.x === lineP2.x || lineP1.y === lineP2.y;
}

function mirrorEntity(entity, lineP1, lineP2) {
  if (entity.type === "titleBlock") {
    return null;
  }
  if (entity.type === "line") {
    return { ...entity, p1: mirrorPointAcrossAxis(entity.p1, lineP1, lineP2), p2: mirrorPointAcrossAxis(entity.p2, lineP1, lineP2) };
  }
  if (entity.type === "wire") {
    return {
      ...entity,
      start: mirrorPointAcrossAxis(entity.start, lineP1, lineP2),
      end: mirrorPointAcrossAxis(entity.end, lineP1, lineP2),
      startRef: null,
      endRef: null,
    };
  }
  if (entity.type === "rect") {
    if (!isVerticalOrHorizontalMirrorAxis(lineP1, lineP2)) {
      return null;
    }
    const corners = [
      { x: entity.x, y: entity.y },
      { x: entity.x + entity.width, y: entity.y },
      { x: entity.x + entity.width, y: entity.y + entity.height },
      { x: entity.x, y: entity.y + entity.height },
    ].map((point) => mirrorPointAcrossAxis(point, lineP1, lineP2));
    const xs = corners.map((point) => point.x);
    const ys = corners.map((point) => point.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return { ...entity, x: minX, y: minY, width: roundToUnit(maxX - minX), height: roundToUnit(maxY - minY), rotation: 0 };
  }
  if (entity.type === "circle") {
    return { ...entity, center: mirrorPointAcrossAxis(entity.center, lineP1, lineP2) };
  }
  if (entity.type === "arc") {
    const startPoint = pointFromCenterRadiusAngle(entity.center, entity.radius, entity.startAngleDeg || 0);
    const endPoint = pointFromCenterRadiusAngle(entity.center, entity.radius, entity.endAngleDeg || 0);
    const mirroredCenter = mirrorPointAcrossAxis(entity.center, lineP1, lineP2);
    const mirroredStart = mirrorPointAcrossAxis(startPoint, lineP1, lineP2);
    const mirroredEnd = mirrorPointAcrossAxis(endPoint, lineP1, lineP2);
    return {
      ...entity,
      center: mirroredCenter,
      startAngleDeg: normalizeAngleDeg(angleDegFromCenter(mirroredCenter, mirroredStart)),
      endAngleDeg: normalizeAngleDeg(angleDegFromCenter(mirroredCenter, mirroredEnd)),
    };
  }
  if (entity.type === "filledRegion") {
    return { ...entity, points: entity.points.map((point) => mirrorPointAcrossAxis(point, lineP1, lineP2)) };
  }
  if (entity.type === "text") {
    const mirroredPosition = mirrorPointAcrossAxis({ x: entity.x, y: entity.y }, lineP1, lineP2);
    const rotation = Number.isFinite(entity.rotation) ? entity.rotation : 0;
    const directionPoint = {
      x: entity.x + Math.cos((rotation * Math.PI) / 180),
      y: entity.y + Math.sin((rotation * Math.PI) / 180),
    };
    const mirroredDirectionPoint = mirrorPointAcrossAxis(directionPoint, lineP1, lineP2);
    return {
      ...entity,
      x: mirroredPosition.x,
      y: mirroredPosition.y,
      rotation: normalizeAngleDeg(angleDegFromCenter(mirroredPosition, mirroredDirectionPoint)),
    };
  }
  if (entity.type === "blockInstance") {
    const mirroredPosition = mirrorPointAcrossAxis({ x: entity.x, y: entity.y }, lineP1, lineP2);
    const rotation = Number.isFinite(entity.rotation) ? entity.rotation : 0;
    const directionPoint = {
      x: entity.x + Math.cos((rotation * Math.PI) / 180),
      y: entity.y + Math.sin((rotation * Math.PI) / 180),
    };
    const mirroredDirectionPoint = mirrorPointAcrossAxis(directionPoint, lineP1, lineP2);
    return {
      ...entity,
      x: mirroredPosition.x,
      y: mirroredPosition.y,
      rotation: normalizeAngleDeg(angleDegFromCenter(mirroredPosition, mirroredDirectionPoint)),
    };
  }
  if (entity.type === "dimension") {
    return {
      ...entity,
      p1: mirrorPointAcrossAxis(entity.p1, lineP1, lineP2),
      p2: mirrorPointAcrossAxis(entity.p2, lineP1, lineP2),
      offsetPoint: mirrorPointAcrossAxis(entity.offsetPoint, lineP1, lineP2),
    };
  }
  return null;
}

function startMirrorDraft(worldPoint) {
  const selectedEntities = getSelectedTransformableEntities();
  if (!selectedEntities.length) {
    setStatus("Mirror: Select objects first.");
    return false;
  }
  uiState.mirrorDraft = { firstPoint: roundWorldPoint(worldPoint) };
  setStatus(`Mirror axis first point set at ${formatWorldPoint(uiState.mirrorDraft.firstPoint)}. Pick second point.`);
  draw();
  return true;
}

function applyMirrorDraft(worldPoint) {
  if (!uiState.mirrorDraft || !uiState.mirrorDraft.firstPoint) {
    return false;
  }
  const selectedEntities = getSelectedTransformableEntities();
  const firstPoint = uiState.mirrorDraft.firstPoint;
  const secondPoint = getMirrorAxisSecondPoint(worldPoint);
  if (firstPoint.x === secondPoint.x && firstPoint.y === secondPoint.y) {
    setStatus("Mirror axis needs two distinct points.");
    return false;
  }
  const idMap = new Map();
  const mirroredCopies = [];
  let skippedCount = 0;
  selectedEntities.forEach((sourceEntity) => {
    if (!canSelectEntity(sourceEntity)) {
      skippedCount += 1;
      return;
    }
    const mirrored = mirrorEntity(deepClone(sourceEntity), firstPoint, secondPoint);
    if (!mirrored) {
      skippedCount += 1;
      return;
    }
    const newId = createEntityId();
    idMap.set(sourceEntity.id, newId);
    mirroredCopies.push({
      ...mirrored,
      id: newId,
    });
  });
  if (!mirroredCopies.length) {
    uiState.mirrorDraft = null;
    uiState.activeTool = "select";
    syncAfterStateChange(false);
    setStatus("Mirror: no supported entities to copy.");
    return false;
  }
  pushUndoState();
  state.entities = [...state.entities, ...mirroredCopies];
  duplicateGroupsForCopiedEntities(selectedEntities, idMap);
  state.selectedEntityIds = mirroredCopies.map((entity) => entity.id);
  uiState.mirrorDraft = null;
  uiState.activeTool = "select";
  syncAfterStateChange();
  const status = skippedCount
    ? `Mirror copied ${mirroredCopies.length} object(s). ${skippedCount} skipped.`
    : `Mirror copied ${mirroredCopies.length} object(s).`;
  setStatus(status);
  return true;
}

function handleMirrorToolClick(worldPoint) {
  if (!uiState.mirrorDraft || !uiState.mirrorDraft.firstPoint) {
    startMirrorDraft(worldPoint);
    return;
  }
  applyMirrorDraft(worldPoint);
}

function rotateEntity(entity, center, angleDeg) {
  if (entity.type === "line") {
    return { ...entity, p1: rotatePoint(entity.p1, center, angleDeg), p2: rotatePoint(entity.p2, center, angleDeg) };
  }
  if (entity.type === "wire") {
    return {
      ...entity,
      start: rotatePoint(entity.start, center, angleDeg),
      end: rotatePoint(entity.end, center, angleDeg),
      startRef: null,
      endRef: null,
    };
  }
  if (entity.type === "rect") {
    const entityCenter = { x: entity.x + entity.width / 2, y: entity.y + entity.height / 2 };
    const rotatedCenter = rotatePoint(entityCenter, center, angleDeg);
    const nextWidth = roundToUnit(entity.height);
    const nextHeight = roundToUnit(entity.width);
    return {
      ...entity,
      x: roundToUnit(rotatedCenter.x - nextWidth / 2),
      y: roundToUnit(rotatedCenter.y - nextHeight / 2),
      width: nextWidth,
      height: nextHeight,
      rotation: 0,
    };
  }
  if (entity.type === "circle") {
    return { ...entity, center: rotatePoint(entity.center, center, angleDeg) };
  }
  if (entity.type === "arc") {
    return {
      ...entity,
      center: rotatePoint(entity.center, center, angleDeg),
      startAngleDeg: normalizeAngleDeg((entity.startAngleDeg || 0) + angleDeg),
      endAngleDeg: normalizeAngleDeg((entity.endAngleDeg || 0) + angleDeg),
    };
  }
  if (entity.type === "filledRegion") {
    return { ...entity, points: entity.points.map((point) => rotatePoint(point, center, angleDeg)) };
  }
  if (entity.type === "text") {
    const rotatedCenter = rotatePoint({ x: entity.x, y: entity.y }, center, angleDeg);
    return {
      ...entity,
      x: rotatedCenter.x,
      y: rotatedCenter.y,
      rotation: normalizeAngleDeg((entity.rotation || 0) + angleDeg),
    };
  }
  if (entity.type === "blockInstance") {
    return entity;
  }
  if (entity.type === "dimension") {
    return {
      ...entity,
      p1: rotatePoint(entity.p1, center, angleDeg),
      p2: rotatePoint(entity.p2, center, angleDeg),
      offsetPoint: rotatePoint(entity.offsetPoint, center, angleDeg),
    };
  }
  return entity;
}

function getRotateBoundsForEntity(entity) {
  return getEntityBoundsUnits(entity);
}

function rotateSelectedEntities(angleDeg = 90) {
  const selectedEntities = getSelectedTransformableEntities();
  if (!selectedEntities.length) {
    setStatus("Select at least one entity before using Rotate.");
    return false;
  }
  if (selectedEntities.some((entity) => entity.type === "blockInstance")) {
    setStatus("Block rotation is not supported in Block v1.");
    return false;
  }
  const boundsList = selectedEntities.map(getRotateBoundsForEntity).filter(Boolean);
  if (!boundsList.length) {
    setStatus("Rotate failed: selection bounds could not be calculated.");
    return false;
  }
  const center = {
    x: roundToUnit((Math.min(...boundsList.map((bounds) => bounds.minX)) + Math.max(...boundsList.map((bounds) => bounds.maxX))) / 2),
    y: roundToUnit((Math.min(...boundsList.map((bounds) => bounds.minY)) + Math.max(...boundsList.map((bounds) => bounds.maxY))) / 2),
  };

  const selectedIdSet = new Set(selectedEntities.map((entity) => entity.id));
  pushUndoState();
  state.entities = state.entities.map((entity) => {
    if (!selectedIdSet.has(entity.id) || !canSelectEntity(entity)) {
      return entity;
    }
    return rotateEntity(entity, center, angleDeg);
  });
  uiState.activeTool = "select";
  syncAfterStateChange();
  setStatus("Rotated selection 90° clockwise.");
  return true;
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
  const idMap = new Map();
  const copied = sourceEntities.map((entity) => {
    const id = createEntityId();
    idMap.set(entity.id, id);
    const copied = { ...applyOffsetToEntity(deepClone(entity), offset), id };
    return copied;
  });
  return { copied, idMap };
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
    const { copied: newEntities, idMap } = createCopiedEntities(sourceEntities, offset);
    state.entities.push(...newEntities);
    duplicateGroupsForCopiedEntities(sourceEntities, idMap);
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

function getQuantizedDeltaPoint(startPoint, worldPoint, gridMm = FREE_OPERATION_GRID_MM) {
  const delta = quantizeFreePointToGrid({
    x: worldPoint.x - startPoint.x,
    y: worldPoint.y - startPoint.y,
  }, gridMm);
  return {
    x: roundToUnit(startPoint.x + delta.x),
    y: roundToUnit(startPoint.y + delta.y),
  };
}

function resolveFreeDragPoint(worldPoint, startPoint = null) {
  return startPoint
    ? getQuantizedDeltaPoint(startPoint, worldPoint)
    : quantizeFreePointToGrid(worldPoint);
}

function updateSelectDragStatus(message) {
  setStatus(message);
  renderStatusPanel();
}

function startSelectDragWithMode(worldPoint, mode = "move", options = {}) {
  const selectedEntities = getSelectedTransformableEntities();
  if (!selectedEntities.length) {
    return false;
  }

  const hasSnapAnchorPoint = Boolean(options.snapAnchorPoint);
  const startPoint = hasSnapAnchorPoint
    ? roundWorldPoint(options.snapAnchorPoint)
    : roundWorldPoint(worldPoint);

  uiState.selectDragDraft = {
    mode,
    startPoint,
    currentPoint: startPoint,
    snapAnchorPoint: hasSnapAnchorPoint ? roundWorldPoint(options.snapAnchorPoint) : null,
    pointerStartPoint: hasSnapAnchorPoint
      ? roundWorldPoint(options.pointerStartPoint || worldPoint)
      : roundWorldPoint(worldPoint),
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

function updateSelectDrag(worldPoint, snappedWorldPoint = worldPoint) {
  if (!uiState.selectDragDraft) {
    return;
  }
  if (uiState.selectDragDraft.snapAnchorPoint) {
    const freeAnchorPoint = roundWorldPoint({
      x: uiState.selectDragDraft.snapAnchorPoint.x + (snappedWorldPoint.x - uiState.selectDragDraft.pointerStartPoint.x),
      y: uiState.selectDragDraft.snapAnchorPoint.y + (snappedWorldPoint.y - uiState.selectDragDraft.pointerStartPoint.y),
    });
    uiState.selectDragDraft.currentPoint = getAnchorSnapPoint(freeAnchorPoint, uiState.selectDragDraft.entityIds) || freeAnchorPoint;
  } else {
    uiState.selectDragDraft.currentPoint = resolveFreeDragPoint(worldPoint, uiState.selectDragDraft.startPoint);
  }
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
    const { copied: newEntities, idMap } = createCopiedEntities(sourceEntities, offset);
    state.entities.push(...newEntities);
    duplicateGroupsForCopiedEntities(sourceEntities, idMap);
    state.selectedEntityIds = newEntities.map((entity) => entity.id);
  } else {
    commitMoveEntityOffset(selectDragDraft.entityIds, offset);
    state.selectedEntityIds = [];
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
  const selectedBlocks = state.selectedEntityIds.map(getEntityById).filter((e)=>e&&e.type==="blockInstance");
  if (selectedBlocks.length) {
    pushUndoState();
    selectedBlocks.forEach((instance)=>explodeBlockInstance(instance.id));
    syncAfterStateChange();
    setStatus(`${selectedBlocks.length} block instance${selectedBlocks.length===1?"":"s"} exploded.`);
    return;
  }
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
  cleanupGroups();
  cleanupBlockDefinitions();
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
    state.selectedEntityIds = hit ? expandSelectionWithGroups([hit.id]) : [];
  } else if (hit) {
    const hitGroupIds = getGroupsForEntity(hit.id).map((group) => group.id);
    const hitIds = expandSelectionWithGroups([hit.id]);
    const hasAll = hitIds.every((id) => state.selectedEntityIds.includes(id));
    if (hasAll) {
      state.selectedEntityIds = state.selectedEntityIds.filter((entityId) => !hitIds.includes(entityId));
    } else {
      state.selectedEntityIds = [...new Set([...state.selectedEntityIds, ...hitIds])];
    }
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

function finishMoveCopySelectionPhase() {
  if (!isMoveCopyTool()) {
    return;
  }
  updateMoveCopyStatus();
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
      if (entity.type === "wire") {
        const points = sampleWireCurvePoints(entity.start, entity.end, entity.tension).map(worldToScreen);
        if (rect.isCrossing) {
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
          return points.some((point) => isScreenPointInsideRect(point, rect))
            || points.slice(0, -1).some((point, index) => {
              const next = points[index + 1];
              return edges.some(([edgeStart, edgeEnd]) => segmentsIntersect(point, next, edgeStart, edgeEnd));
            });
        }
        return points.every((point) => isScreenPointInsideRect(point, rect));
      }
      if (entity.type === "rect") {
        const p1 = worldToScreen({x:entity.x,y:entity.y}); const p2=worldToScreen({x:entity.x+entity.width,y:entity.y+entity.height});
        const rl={left:Math.min(p1.x,p2.x),right:Math.max(p1.x,p2.x),top:Math.min(p1.y,p2.y),bottom:Math.max(p1.y,p2.y)};
        return rect.isCrossing ? !(rl.right < rect.left || rl.left > rect.right || rl.bottom < rect.top || rl.top > rect.bottom) : (rl.left>=rect.left && rl.right<=rect.right && rl.top>=rect.top && rl.bottom<=rect.bottom);
      }
      if (entity.type === "pdfUnderlay") {
        const bounds = getEntityBoundsUnits(entity);
        if (!bounds) return false;
        const p1 = worldToScreen({ x: bounds.minX, y: bounds.minY });
        const p2 = worldToScreen({ x: bounds.maxX, y: bounds.maxY });
        const box = { left: Math.min(p1.x, p2.x), right: Math.max(p1.x, p2.x), top: Math.min(p1.y, p2.y), bottom: Math.max(p1.y, p2.y) };
        return rect.isCrossing
          ? !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom)
          : (box.left >= rect.left && box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom);
      }
      if (entity.type === "blockInstance") {
        const bounds = getBlockInstanceBoundsUnits(entity);
        if (!bounds) {
          return false;
        }
        const minScreen = worldToScreen({ x: bounds.minX, y: bounds.minY });
        const maxScreen = worldToScreen({ x: bounds.maxX, y: bounds.maxY });
        const box = {
          left: Math.min(minScreen.x, maxScreen.x),
          right: Math.max(minScreen.x, maxScreen.x),
          top: Math.min(minScreen.y, maxScreen.y),
          bottom: Math.max(minScreen.y, maxScreen.y),
        };
        return rect.isCrossing
          ? !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom)
          : (box.left >= rect.left && box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom);
      }
      if (entity.type === "titleBlock") {
        const p1 = worldToScreen({ x: entity.x, y: entity.y });
        const p2 = worldToScreen({ x: entity.x + entity.width, y: entity.y + entity.height });
        const bounds = { left: Math.min(p1.x, p2.x), right: Math.max(p1.x, p2.x), top: Math.min(p1.y, p2.y), bottom: Math.max(p1.y, p2.y) };
        return rect.isCrossing
          ? !(bounds.right < rect.left || bounds.left > rect.right || bounds.bottom < rect.top || bounds.top > rect.bottom)
          : (bounds.left >= rect.left && bounds.right <= rect.right && bounds.top >= rect.top && bounds.bottom <= rect.bottom);
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
        ].map(([a, b]) => ({
          left: Math.min(a.x, b.x),
          right: Math.max(a.x, b.x),
          top: Math.min(a.y, b.y),
          bottom: Math.max(a.y, b.y),
        }));
        geometry.tickDots.forEach(({ center, radiusPx }) => {
          boxes.push({
            left: center.x - radiusPx,
            right: center.x + radiusPx,
            top: center.y - radiusPx,
            bottom: center.y + radiusPx,
          });
        });
        boxes.push(geometry.textBox);
        return rect.isCrossing
          ? boxes.some((box) => !(box.right < rect.left || box.left > rect.right || box.bottom < rect.top || box.top > rect.bottom))
          : boxes.every((box) => box.left >= rect.left && box.right <= rect.right && box.top >= rect.top && box.bottom <= rect.bottom);
      }
      return false;
    })
    .map((entity) => entity.id);

  const expandedSelected = expandSelectionWithGroups(selectedIds);
  state.selectedEntityIds = selectionWindow.append
    ? [...new Set([...state.selectedEntityIds, ...expandedSelected])]
    : expandedSelected;
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

function isScreenPointInsideRect(point, rect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
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
  if (entity.type === "blockInstance") {
    const layer = getLayerById(entity.layerId);
    if (!layer || !layer.visible) return false;
    return getBlockInstanceRenderableEntities(entity).some((child) => isEntityVisible(child) && hitTestEntity(child, worldPoint));
  }
  if (entity.type === "line") {
    const distancePx = distancePointToSegmentScreenPx(worldPoint, entity.p1, entity.p2);
    return distancePx <= state.settings.snapTolerancePx;
  }
  if (entity.type === "wire") {
    return hitTestWireEntity(entity, worldPoint);
  }
  if (entity.type === "pdfUnderlay" || entity.type === "dxfUnderlay") {
    if (entity.locked || entity.visible === false) return false;
    const bounds = getEntityBoundsUnits(entity);
    return Boolean(bounds && entity.visible !== false && worldPoint.x >= bounds.minX && worldPoint.x <= bounds.maxX && worldPoint.y >= bounds.minY && worldPoint.y <= bounds.maxY);
  }
  if (entity.type === "rect") {
    const p = worldToScreen(worldPoint);
    const a = worldToScreen({ x: entity.x, y: entity.y });
    const b = worldToScreen({ x: entity.x + entity.width, y: entity.y + entity.height });
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y, b.y);
    const inside = entity.fill !== false
      && p.x >= left
      && p.x <= right
      && p.y >= top
      && p.y <= bottom;
    const edge = getRectEdges(entity)
      .some((edgeDef) => distancePointToSegmentScreenPx(worldPoint, edgeDef.p1, edgeDef.p2) <= state.settings.snapTolerancePx);
    return inside || edge;
  }
  if (entity.type === "titleBlock") {
    return Boolean(
      titleBlockApi
      && typeof titleBlockApi.hitTestTitleBlock === "function"
      && titleBlockApi.hitTestTitleBlock(entity, worldPoint, {
        toleranceUnits: state.settings.snapTolerancePx / state.view.zoom,
        roundToUnit,
        mmToUnits,
      })
    );
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
    const box = getTextBoundsUnits(entity);
    return worldPoint.x >= box.minX && worldPoint.x <= box.maxX && worldPoint.y >= box.minY && worldPoint.y <= box.maxY;
  }
  if (entity.type === "dimension") {
    const point = worldToScreen(worldPoint);
    const geometry = getDimensionScreenGeometry(entity);
    const tol = state.settings.snapTolerancePx + 4;
    return (
      [...geometry.extensionLines, geometry.dimensionLine]
        .some(([start, end]) => distanceScreenPointToSegmentPx(point, start, end) <= tol) ||
      geometry.tickDots.some(({ center, radiusPx }) => Math.hypot(point.x - center.x, point.y - center.y) <= radiusPx + tol) ||
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

function findSelectedMoveAnchorAtPoint(worldPoint) {
  const selectedIds = new Set(state.selectedEntityIds);
  return state.entities
    .filter((entity) => selectedIds.has(entity.id) && canSelectEntity(entity))
    .slice()
    .reverse()
    .flatMap((entity) => getSelectedEntityHandles(entity))
    .map((candidate) => ({
      ...candidate,
      distancePx: distanceScreenPx(worldPoint, candidate.point),
    }))
    .filter((candidate) => candidate.distancePx <= state.settings.snapTolerancePx)
    .sort((a, b) => a.distancePx - b.distancePx)[0] || null;
}

function findBorrowedMoveBaseHandleAtPoint(worldPoint, options = {}) {
  const excludedIds = new Set(options.excludeEntityIds || []);
  return state.entities
    .filter((entity) => !excludedIds.has(entity.id) && canSelectEntity(entity))
    .slice()
    .reverse()
    .flatMap((entity) => getBorrowableHandlePoints(entity))
    .map((candidate) => ({
      ...candidate,
      distancePx: distanceScreenPx(worldPoint, candidate.point),
    }))
    .filter((candidate) => candidate.distancePx <= state.settings.snapTolerancePx)
    .sort((a, b) => a.distancePx - b.distancePx)[0] || null;
}

function findRectEdgeAtPoint(worldPoint) {
  return state.entities
    .filter((entity) => entity.type === "rect" && canSelectEntity(entity))
    .slice()
    .reverse()
    .map((entity) => {
      const handleHit = getRectMoveAnchorPoints(entity)
        .some((candidate) => distanceScreenPx(worldPoint, candidate.point) <= state.settings.snapTolerancePx);
      if (handleHit) {
        return null;
      }
      const edgeHit = getRectEdges(entity)
        .find((edgeDef) => distancePointToSegmentScreenPx(worldPoint, edgeDef.p1, edgeDef.p2) <= state.settings.snapTolerancePx);
      return edgeHit ? { entityId: entity.id, edge: edgeHit.edge } : null;
    })
    .find(Boolean) || null;
}

function startRectEdgeEdit(rectEntity, edge, worldPoint) {
  if (!rectEntity || rectEntity.type !== "rect" || !canSelectEntity(rectEntity)) {
    return false;
  }
  state.selectedEntityIds = [rectEntity.id];
  syncAfterStateChange(false);
  uiState.rectEdgeEditDraft = {
    entityId: rectEntity.id,
    edge,
    originalRect: { x: rectEntity.x, y: rectEntity.y, width: rectEntity.width, height: rectEntity.height },
    startPoint: worldPoint,
    currentPoint: worldPoint,
    numericInputBuffer: "",
  };
  updateRectEdgeEditStatus();
  draw();
  return true;
}

function startHandleDrivenSelectionAction(handleHit, rawWorldPoint, worldPoint, event) {
  const entity = getEntityById(handleHit.entityId);
  if (!entity || !canSelectEntity(entity)) {
    return false;
  }
  state.selectedEntityIds = [entity.id];
  syncAfterStateChange(false);
  if (handleHit.type === "lineEndpoint") {
    startGripEdit(
      {
        entity,
        endpoint: handleHit.endpoint,
        point: handleHit.point,
      },
      worldPoint
    );
    return true;
  }
  return startSelectDragWithMode(
    rawWorldPoint,
    event.altKey || event.ctrlKey ? "copy" : "move",
    {
      snapAnchorPoint: handleHit.point,
      pointerStartPoint: rawWorldPoint,
    }
  );
}

function getResizedRectFromDraft(draft, worldPoint) {
  return getResizedRectFromAnchorPoint(draft, getSnapPoint(worldPoint));
}

function getTextBoundsScreen(entity) {
  return getTextBoundsScreenFromUnits(getTextBoundsUnits(entity));
}

function getTextMetricsUnits(entity) {
  const heightUnits = Math.max(1, entity.height || 250);
  ctx.save();
  ctx.font = `${heightUnits}px sans-serif`;
  const widthUnits = ctx.measureText(entity.text || "").width;
  ctx.restore();
  return { widthUnits, heightUnits };
}

function getTextLocalBoxUnits(entity, metrics = getTextMetricsUnits(entity)) {
  const { widthUnits, heightUnits } = metrics;
  return {
    left: -widthUnits / 2,
    right: widthUnits / 2,
    top: -heightUnits / 2,
    bottom: heightUnits / 2,
  };
}

function getTextDrawOffsetUnits(entity, metrics = getTextMetricsUnits(entity)) {
  const { widthUnits, heightUnits } = metrics;
  let x = -widthUnits / 2;
  if (entity.align === "center") {
    x = 0;
  } else if (entity.align === "right") {
    x = widthUnits / 2;
  }
  return {
    x,
    y: heightUnits / 2,
  };
}

function getRotatedTextLocalOffsetUnits(offset, rotationDeg = 0) {
  const rotationRad = -((rotationDeg * Math.PI) / 180);
  const cos = Math.cos(rotationRad);
  const sin = Math.sin(rotationRad);
  return {
    x: offset.x * cos - offset.y * sin,
    y: offset.x * sin + offset.y * cos,
  };
}

function getTextBoundsUnits(entity) {
  const corners = getRotatedTextLocalBoxCornersUnits(entity);
  return {
    minX: Math.min(...corners.map((point) => point.x)),
    minY: Math.min(...corners.map((point) => point.y)),
    maxX: Math.max(...corners.map((point) => point.x)),
    maxY: Math.max(...corners.map((point) => point.y)),
  };
}

function getTextBoundsScreenFromUnits(boundsUnits) {
  const a = worldToScreen({ x: boundsUnits.minX, y: boundsUnits.minY });
  const b = worldToScreen({ x: boundsUnits.maxX, y: boundsUnits.maxY });
  return {
    left: Math.min(a.x, b.x),
    right: Math.max(a.x, b.x),
    top: Math.min(a.y, b.y),
    bottom: Math.max(a.y, b.y),
  };
}

function getRotatedTextLocalBoxCornersUnits(entity, metrics = getTextMetricsUnits(entity)) {
  const localBox = getTextLocalBoxUnits(entity, metrics);
  return [
    { x: localBox.left, y: localBox.top },
    { x: localBox.right, y: localBox.top },
    { x: localBox.right, y: localBox.bottom },
    { x: localBox.left, y: localBox.bottom },
  ].map((point) => {
    const rotated = getRotatedTextLocalOffsetUnits(point, entity.rotation || 0);
    return {
      x: roundToUnit(entity.x + rotated.x),
      y: roundToUnit(entity.y + rotated.y),
    };
  });
}

function getLegacyTextVisualCenterOffsetUnits(entity, metrics = getTextMetricsUnits(entity)) {
  const { widthUnits, heightUnits } = metrics;
  let x = widthUnits / 2;
  if (entity.align === "center") {
    x = 0;
  } else if (entity.align === "right") {
    x = -widthUnits / 2;
  }
  return {
    x,
    y: -heightUnits / 2,
  };
}

function getTextInsertionPointUnits(entity, metrics = getTextMetricsUnits(entity)) {
  const legacyCenterOffset = getLegacyTextVisualCenterOffsetUnits(entity, metrics);
  const rotatedOffset = getRotatedTextLocalOffsetUnits(legacyCenterOffset, entity.rotation || 0);
  return {
    x: roundToUnit(entity.x - rotatedOffset.x),
    y: roundToUnit(entity.y - rotatedOffset.y),
  };
}

function migrateLegacyTextEntityToCenter(entity) {
  const metrics = getTextMetricsUnits(entity);
  const legacyCenterOffset = getLegacyTextVisualCenterOffsetUnits(entity, metrics);
  const rotatedOffset = getRotatedTextLocalOffsetUnits(legacyCenterOffset, entity.rotation || 0);
  return {
    ...entity,
    x: roundToUnit(entity.x + rotatedOffset.x),
    y: roundToUnit(entity.y + rotatedOffset.y),
    textAnchor: "center",
  };
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
    textAnchor: "center",
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

function getEntityBoundsUnits(entity) {
  if (!entity) {
    return null;
  }
  if (entity.type === "line") {
    return {
      minX: Math.min(entity.p1.x, entity.p2.x),
      minY: Math.min(entity.p1.y, entity.p2.y),
      maxX: Math.max(entity.p1.x, entity.p2.x),
      maxY: Math.max(entity.p1.y, entity.p2.y),
    };
  }
  if (entity.type === "wire") {
    return getWireBoundsUnits(entity);
  }
  if (entity.type === "rect" || entity.type === "titleBlock") {
    return {
      minX: entity.x,
      minY: entity.y,
      maxX: entity.x + entity.width,
      maxY: entity.y + entity.height,
    };
  }
  if (entity.type === "pdfUnderlay") {
    const size = getPdfUnderlayScaledSize(entity);
    return { minX: entity.x, minY: entity.y, maxX: entity.x + size.width, maxY: entity.y + size.height };
  }
  if (entity.type === "dxfUnderlay") {
    return dxfUnderlayApi && typeof dxfUnderlayApi.getDxfUnderlayBounds === "function" ? dxfUnderlayApi.getDxfUnderlayBounds(entity) : null;
  }
  if (entity.type === "circle" || entity.type === "arc") {
    return {
      minX: entity.center.x - entity.radius,
      minY: entity.center.y - entity.radius,
      maxX: entity.center.x + entity.radius,
      maxY: entity.center.y + entity.radius,
    };
  }
  if (entity.type === "filledRegion") {
    const xs = entity.points.map((point) => point.x);
    const ys = entity.points.map((point) => point.y);
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    };
  }
  if (entity.type === "text") {
    return getTextBoundsUnits(entity);
  }
  if (entity.type === "blockInstance") {
    return getBlockInstanceBoundsUnits(entity);
  }
  if (entity.type === "dimension") {
    const geometry = getDimensionGeometry(entity);
    return {
      minX: Math.min(entity.p1.x, entity.p2.x, entity.offsetPoint.x, geometry.o1.x, geometry.o2.x),
      minY: Math.min(entity.p1.y, entity.p2.y, entity.offsetPoint.y, geometry.o1.y, geometry.o2.y),
      maxX: Math.max(entity.p1.x, entity.p2.x, entity.offsetPoint.x, geometry.o1.x, geometry.o2.x),
      maxY: Math.max(entity.p1.y, entity.p2.y, entity.offsetPoint.y, geometry.o1.y, geometry.o2.y),
    };
  }
  return null;
}

function getDocumentBoundsUnits(entities = state.entities) {
  return getBoundsForEntities(entities);
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
    const bounds = getEntityBoundsUnits(entity);
    if (!bounds) return;
    xs.push(bounds.minX, bounds.maxX);
    ys.push(bounds.minY, bounds.maxY);
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
  const selectedGroupCount = getSelectedGroupSummaries().length;
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
    groupCount: state.groups.length,
    selectedGroupCount,
    selectedEntityCount: state.selectedEntityIds.length,
    activeLayerId: state.activeLayerId,
    activeLayerName: activeLayer ? activeLayer.name : null,
    boundsUnits,
    boundsMm: boundsUnitsToMm(boundsUnits),
  };
}

function getAgentResourceSummary() {
  return {
    uri: "draftlite://summary",
    name: "Draft summary",
    description: "Current drawing summary in mm and internal unit metadata.",
  };
}

function getAgentResourceEntities() {
  return {
    uri: "draftlite://entities",
    name: "Draft entities",
    description: "Normalized entity list for the current document.",
  };
}

function getAgentResourceState() {
  return {
    uri: "draftlite://state",
    name: "Draft state",
    description: "Complete DraftLite document state snapshot.",
  };
}

function getAgentResourceBounds() {
  return {
    uri: "draftlite://bounds",
    name: "Draft bounds",
    description: "Current drawing bounds in mm.",
  };
}

function getAgentResourceGroups() {
  return {
    uri: "draftlite://groups",
    name: "Draft groups",
    description: "Group metadata and grouped entities for AI reuse.",
  };
}

function getAgentResourceSelectedGroups() {
  return {
    uri: "draftlite://selected-groups",
    name: "Selected groups",
    description: "Currently selected groups and their entities for AI reuse.",
  };
}

function listAgentResources() {
  return [
    getAgentResourceSummary(),
    getAgentResourceEntities(),
    getAgentResourceState(),
    getAgentResourceBounds(),
    getAgentResourceGroups(),
    getAgentResourceSelectedGroups(),
  ];
}

function readAgentResource(uri) {
  const normalizedUri = typeof uri === "string" ? uri.trim() : "";
  if (!normalizedUri) {
    throw new Error("readResource requires a non-empty uri.");
  }
  if (normalizedUri === "draftlite://summary") {
    return getAgentSummary();
  }
  if (normalizedUri === "draftlite://entities") {
    return deepClone(state.entities);
  }
  if (normalizedUri === "draftlite://state") {
    return snapshotState();
  }
  if (normalizedUri === "draftlite://bounds") {
    return boundsUnitsToMm(getAgentBoundsUnits());
  }
  if (normalizedUri === "draftlite://groups") {
    return state.groups.map((group) => getGroupSummary(group.id)).filter(Boolean);
  }
  if (normalizedUri === "draftlite://selected-groups") {
    return exportSelectedGroupsForAgent();
  }
  throw new Error(`Unknown resource uri: ${normalizedUri}`);
}

function createAgentSchemaTool(name, description, inputSchema) {
  return {
    name,
    description,
    inputSchema,
  };
}

function describeAgentTools() {
  return [
    createAgentSchemaTool("create_rect", "Create a rectangle entity in mm coordinates.", {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        width: { type: "number" },
        height: { type: "number" },
        name: { type: "string" },
        layer: { type: "string" },
        color: { type: "string" },
        fillColor: { type: "string" },
        fill: { type: "boolean" },
        label: { type: "string" },
        labelSizeMm: { type: "number" },
        cornerRadiusMm: { type: "number" },
      },
      required: ["x", "y", "width", "height"],
      additionalProperties: true,
    }),
    createAgentSchemaTool("create_line", "Create a line entity in mm coordinates.", {
      type: "object",
      properties: {
        x1: { type: "number" },
        y1: { type: "number" },
        x2: { type: "number" },
        y2: { type: "number" },
        layer: { type: "string" },
        color: { type: "string" },
      },
      required: ["x1", "y1", "x2", "y2"],
      additionalProperties: true,
    }),
    createAgentSchemaTool("create_text", "Create a text entity in mm coordinates.", {
      type: "object",
      properties: {
        x: { type: "number" },
        y: { type: "number" },
        text: { type: "string" },
        height: { type: "number" },
        layer: { type: "string" },
        color: { type: "string" },
      },
      required: ["x", "y", "text", "height"],
      additionalProperties: true,
    }),
    createAgentSchemaTool("set_layer", "Activate an existing layer or create it first.", {
      type: "object",
      properties: {
        name: { type: "string" },
        layer: { type: "string" },
        color: { type: "string" },
      },
      additionalProperties: true,
    }),
    createAgentSchemaTool("clear_drawing", "Remove all entities from the current drawing.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("fit_all", "Fit the current drawing in view.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("validate_drawing", "Validate entities, layers, and simple geometry constraints.", {
      type: "object",
      properties: {
        requireNonEmpty: { type: "boolean" },
      },
      additionalProperties: true,
    }),
    createAgentSchemaTool("get_summary", "Return the current drawing summary.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("get_entities", "Return all entities in the current drawing.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("get_state", "Return the complete document state snapshot.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("get_bounds", "Return current drawing bounds in mm.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("get_groups", "Return all groups in the current drawing.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("get_selected_groups", "Return currently selected groups in the current drawing.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("export_selected_groups", "Return selected groups as AI reuse JSON.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("copy_selected_groups", "Copy selected groups as AI reuse JSON to the clipboard and return it.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("read_resource", "Read a DraftLite resource by uri.", {
      type: "object",
      properties: {
        uri: { type: "string" },
      },
      required: ["uri"],
      additionalProperties: false,
    }),
    createAgentSchemaTool("copy_state", "Copy the current state snapshot to the clipboard and return it.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("copy_entities", "Copy the current entities list to the clipboard and return it.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("copy_summary", "Copy the current drawing summary to the clipboard and return it.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
    createAgentSchemaTool("copy_result", "Copy the latest Agent IO result payload to the clipboard and return it.", {
      type: "object",
      properties: {},
      additionalProperties: false,
    }),
  ];
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

function readAgentOptionalPositiveUnits(command, key, fallbackUnits) {
  if (!command || command[key] === undefined || command[key] === null || command[key] === "") {
    return fallbackUnits;
  }
  const value = Number(command[key]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${key} must be greater than zero when provided.`);
  }
  return mmToUnits(value);
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
    label: typeof command.label === "string" ? command.label : "",
    labelSize: readAgentOptionalPositiveUnits(command, "labelSizeMm", mmToUnits(100)),
    cornerRadius: clampNumber(roundToUnit(mmToUnits(Number(command.cornerRadiusMm) || 0)), 0, Math.min(width, height) / 2, 0),
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
    textAnchor: "center",
    color: normalizeOptionalColor(command.color || ""),
  };
}

function normalizeAgentAction(action) {
  const rawAction = typeof action === "string" ? action.trim() : "";
  if (!rawAction) {
    return "";
  }
  const aliasMap = {
    rect: "rect",
    line: "line",
    text: "text",
    clear: "clear",
    reset: "clear",
    fit: "fitAll",
    fitAll: "fitAll",
    zoom: "fitAll",
    zoomExtents: "fitAll",
    setLayer: "setLayer",
    describeTools: "describeTools",
    listResources: "listResources",
    readResource: "readResource",
    validate: "validate",
    validateDrawing: "validate",
    check: "validate",
    inspect: "validate",
    summary: "summary",
    getSummary: "summary",
    entities: "entities",
    getEntities: "entities",
    state: "state",
    getState: "state",
    bounds: "bounds",
    getBounds: "bounds",
    groups: "groups",
    getGroups: "groups",
    selectedGroups: "selectedGroups",
    getSelectedGroups: "selectedGroups",
    exportSelectedGroups: "selectedGroups",
    copySelectedGroups: "copySelectedGroups",
    copyState: "copyState",
    copyEntities: "copyEntities",
    copySummary: "copySummary",
    copyResult: "copyResult",
    create_rect: "rect",
    create_line: "line",
    create_text: "text",
    set_layer: "setLayer",
    clear_drawing: "clear",
    fit_all: "fitAll",
    validate_drawing: "validate",
    get_summary: "summary",
    get_entities: "entities",
    get_state: "state",
    get_bounds: "bounds",
    get_groups: "groups",
    get_selected_groups: "selectedGroups",
    export_selected_groups: "selectedGroups",
    copy_selected_groups: "copySelectedGroups",
    read_resource: "readResource",
    copy_state: "copyState",
    copy_entities: "copyEntities",
    copy_summary: "copySummary",
    copy_result: "copyResult",
    tools: "describeTools",
    resources: "listResources",
    resource: "readResource",
  };
  return aliasMap[rawAction] || rawAction;
}

function normalizeAgentCommand(command) {
  if (!command || typeof command !== "object") {
    throw new Error("Agent command must be an object.");
  }
  if (typeof command.tool === "string" && command.tool.trim()) {
    const args = command.arguments && typeof command.arguments === "object" ? command.arguments : {};
    return {
      ...args,
      ...command,
      action: normalizeAgentAction(command.tool),
      tool: command.tool,
    };
  }
  return {
    ...command,
    action: normalizeAgentAction(command.action),
  };
}

function isPromiseLike(value) {
  return Boolean(value) && typeof value.then === "function";
}

function copyAgentTextToClipboard(text) {
  const value = typeof text === "string" ? text : "";
  if (!value) {
    return Promise.resolve(false);
  }
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    return Promise.resolve(false);
  }
  return navigator.clipboard.writeText(value).then(() => true).catch(() => false);
}

function getAgentResultCopyPayload() {
  if (agentLastResultValue !== null) {
    return deepClone(agentLastResultValue);
  }
  if (agentLastResultText) {
    try {
      return JSON.parse(agentLastResultText);
    } catch (error) {
      return agentLastResultText;
    }
  }
  return null;
}

function createAgentCopyResult(action, value, copied, message) {
  return createAgentSuccess(action, {
    copied,
    value,
    message,
  });
}

function copyAgentPayload(action, value, label) {
  const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  return copyAgentTextToClipboard(text).then((copied) => createAgentCopyResult(
    action,
    value,
    copied,
    copied ? `${label} copied.` : `${label} prepared. Clipboard unavailable.`
  ));
}

function applyAgentCommand(command) {
  const normalizedCommand = normalizeAgentCommand(command || {});
  const action = normalizedCommand.action;
  if (!action) {
    throw new Error("action is required.");
  }

  if (action === "rect") {
    const entity = createAgentRectEntity(normalizedCommand);
    state.entities.push(entity);
    state.selectedEntityIds = [entity.id];
    return createAgentSuccess(action, {
      entityIds: [entity.id],
      message: "Rectangle created.",
      changed: true,
    });
  }

  if (action === "line") {
    const entity = createAgentLineEntity(normalizedCommand);
    state.entities.push(entity);
    state.selectedEntityIds = [entity.id];
    return createAgentSuccess(action, {
      entityIds: [entity.id],
      message: "Line created.",
      changed: true,
    });
  }

  if (action === "text") {
    const entity = createAgentTextEntity(normalizedCommand);
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
    const layerName = typeof normalizedCommand.layer === "string" && normalizedCommand.layer.trim()
      ? normalizedCommand.layer.trim()
      : readAgentTextValue(normalizedCommand, "name");
    const existing = getLayerByName(layerName);
    const layer = existing || createAgentLayer(layerName, normalizedCommand.color);
    state.activeLayerId = layer.id;
    return createAgentSuccess(action, {
      message: existing ? `Active layer set to ${layer.name}.` : `Layer ${layer.name} created and activated.`,
      changed: true,
      layerId: layer.id,
    });
  }

  if (action === "describeTools") {
    return createAgentSuccess(action, {
      tools: describeAgentTools(),
    });
  }

  if (action === "listResources") {
    return createAgentSuccess(action, {
      resources: listAgentResources(),
    });
  }

  if (action === "readResource") {
    const uri = typeof normalizedCommand.uri === "string" && normalizedCommand.uri.trim()
      ? normalizedCommand.uri.trim()
      : (normalizedCommand.payload && typeof normalizedCommand.payload.uri === "string" ? normalizedCommand.payload.uri.trim() : "");
    if (!uri) {
      throw new Error("readResource requires payload.uri.");
    }
    return createAgentSuccess(action, {
      uri,
      resource: readAgentResource(uri),
    });
  }

  if (action === "validateDrawing") {
    return {
      action,
      ...validateDrawingState(normalizedCommand),
    };
  }

  if (action === "getSummary") {
    return createAgentSuccess(action, {
      summary: getAgentSummary(),
    });
  }

  if (action === "getEntities") {
    return createAgentSuccess(action, {
      entities: deepClone(state.entities),
    });
  }

  if (action === "getState") {
    return createAgentSuccess(action, {
      state: snapshotState(),
    });
  }

  if (action === "getBounds") {
    return createAgentSuccess(action, {
      bounds: boundsUnitsToMm(getAgentBoundsUnits()),
    });
  }

  if (action === "groups") {
    return createAgentSuccess(action, {
      groups: state.groups.map((group) => getGroupSummary(group.id)).filter(Boolean),
    });
  }

  if (action === "selectedGroups") {
    return createAgentSuccess(action, exportSelectedGroupsForAgent());
  }

  if (action === "copySelectedGroups") {
    return copyAgentPayload(action, exportSelectedGroupsForAgent(), "Selected groups");
  }

  if (action === "copyState") {
    return copyAgentPayload(action, snapshotState(), "State");
  }

  if (action === "copyEntities") {
    return copyAgentPayload(action, deepClone(state.entities), "Entities");
  }

  if (action === "copySummary") {
    return copyAgentPayload(action, getAgentSummary(), "Summary");
  }

  if (action === "copyResult") {
    return copyAgentPayload(action, getAgentResultCopyPayload(), "Result");
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
  let action = "";
  try {
    const normalizedCommand = normalizeAgentCommand(command || {});
    action = normalizedCommand.action;
    if (isAgentMutationAction(action)) {
      pushUndoState();
    }
    const result = applyAgentCommand(normalizedCommand);
    const finishSuccess = (resolvedResult) => {
      finalizeAgentStateChange({
        shouldSync: resolvedResult.changed || resolvedResult.fitView,
        shouldFit: resolvedResult.fitView,
      });
      if (resolvedResult.message) {
        setStatus(resolvedResult.message);
      }
      return toPublicAgentResult(resolvedResult);
    };
    const finishFailure = (error) => {
      setStatus(error && error.message ? error.message : String(error));
      return createAgentError(action || "", error);
    };
    if (isPromiseLike(result)) {
      return result.then(finishSuccess).catch(finishFailure);
    }
    return finishSuccess(result);
  } catch (error) {
    setStatus(error && error.message ? error.message : String(error));
    return createAgentError(action || "", error);
  }
}

async function executeManyAgentCommands(commands, options = {}) {
  const items = Array.isArray(commands) ? commands : [];
  const normalizedItems = items.map((command) => normalizeAgentCommand(command || {}));
  const mutating = normalizedItems.some((command) => isAgentMutationAction(command.action));
  const transactional = Boolean(options.transaction);
  const results = [];
  let shouldSync = false;
  let shouldFit = false;
  const stateSnapshot = transactional ? snapshotState() : null;
  const historySnapshot = transactional ? snapshotHistoryStacks() : null;

  if (mutating) {
    pushUndoState();
  }

  for (const command of normalizedItems) {
    const action = command.action;
    try {
      const result = await applyAgentCommand(command);
      results.push(toPublicAgentResult(result));
      shouldSync = shouldSync || Boolean(result.changed || result.fitView);
      shouldFit = shouldFit || Boolean(result.fitView);
    } catch (error) {
      results.push(createAgentError(action || "", error));
      if (transactional) {
        state = normalizeDocument(stateSnapshot);
        restoreHistoryStacks(historySnapshot);
        clearTransientState();
        syncAfterStateChange(false);
        break;
      }
    }
  }

  const failed = results.find((result) => !result.ok);

  if (!failed && (shouldSync || shouldFit)) {
    finalizeAgentStateChange({ shouldSync: shouldSync || shouldFit, shouldFit });
  }

  if (failed && failed.error) {
    setStatus(failed.error);
  } else if (results.length) {
    setStatus("Agent batch complete.");
  }

  return {
    ok: !failed,
    count: items.length,
    results,
    transaction: transactional,
    rolledBack: Boolean(transactional && failed),
  };
}

function setAgentResultOutput(payload, options = {}) {
  if (!agentResultOutput) {
    return;
  }
  const content = typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const lastOk = typeof options.ok === "boolean"
    ? String(options.ok)
    : (payload && typeof payload === "object" && typeof payload.ok === "boolean" ? String(payload.ok) : "");
  const lastError = typeof options.error === "string"
    ? options.error
    : (payload && typeof payload === "object" && typeof payload.error === "string" ? payload.error : "");
  const lastTool = typeof options.tool === "string"
    ? options.tool
    : (payload && typeof payload === "object" && typeof payload.tool === "string" ? payload.tool : "");
  const lastAction = typeof options.action === "string"
    ? options.action
    : (payload && typeof payload === "object" && typeof payload.action === "string" ? payload.action : "");
  agentLastResultText = content;
  agentLastResultValue = payload === undefined ? null : deepClone(payload);
  agentResultOutput.textContent = content;
  agentResultOutput.dataset.lastOk = lastOk;
  agentResultOutput.dataset.lastResult = content;
  agentResultOutput.dataset.lastError = lastError;
  agentResultOutput.dataset.lastTool = lastTool;
  agentResultOutput.dataset.lastAction = lastAction;
}

function normalizeAgentToolName(tool) {
  const map = {
    rect: "create_rect",
    createRect: "create_rect",
    line: "create_line",
    createLine: "create_line",
    text: "create_text",
    createText: "create_text",
    clear: "clear_drawing",
    clearDrawing: "clear_drawing",
    fit: "fit_all",
    fitAll: "fit_all",
    validate: "validate_drawing",
    validateDrawing: "validate_drawing",
    summary: "get_summary",
    getSummary: "get_summary",
    entities: "get_entities",
    getEntities: "get_entities",
    state: "get_state",
    getState: "get_state",
    bounds: "get_bounds",
    getBounds: "get_bounds",
    groups: "get_groups",
    getGroups: "get_groups",
    selectedGroups: "get_selected_groups",
    getSelectedGroups: "get_selected_groups",
    exportSelectedGroups: "export_selected_groups",
    readResource: "read_resource",
    resource: "read_resource",
    copyResult: "copy_result",
    copyState: "copy_state",
    copyEntities: "copy_entities",
    copySummary: "copy_summary",
    copySelectedGroups: "copy_selected_groups",
    tools: "describe_tools",
    resources: "list_resources",
  };
  return map[tool] || tool;
}

function createAgentJsonParseError(error) {
  return { ok: false, isError: true, error: { code: "JSON_PARSE_ERROR", message: "JSON parse failed.", detail: error && error.message ? error.message : String(error), hint: "Input must be JSON array, JSON object, MCP-style tool call, or supported text command." } };
}

function parseAgentPanelInput(raw) {
  const trimmed = String(raw || "").trim();
  if (!trimmed) throw new Error("Agent command input is empty.");
  if ((trimmed.startsWith("{") || trimmed.startsWith("[") || trimmed.startsWith("\""))) {
    let parsed;
    try { parsed = JSON.parse(trimmed); } catch (error) { return { type: "error", payload: createAgentJsonParseError(error) }; }
    if (typeof parsed === "string") return { type: "single", payload: { action: parsed } };
    if (Array.isArray(parsed)) return { type: "many", payload: { commands: parsed } };
    if (parsed && typeof parsed === "object") return { type: "envelope", payload: parsed };
  }
  return { type: "single", payload: { action: trimmed } };
}

function copyAgentText(text, meta = {}) {
  const value = String(text || "");
  if (!navigator.clipboard || typeof navigator.clipboard.writeText !== "function") {
    return Promise.resolve({ ok: false, copied: false, isError: true, error: { code: "CLIPBOARD_UNAVAILABLE", message: "Clipboard API is not available." }, ...meta });
  }
  return navigator.clipboard.writeText(value).then(() => ({ ok: true, copied: true, ...meta })).catch((error) => ({
    ok: false, copied: false, isError: true, error: { code: "CLIPBOARD_WRITE_FAILED", message: error && error.message ? error.message : "Clipboard write failed." }, ...meta
  }));
}

async function runAgentPanelCommand() {
  if (!agentCommandInput || !window.DraftLiteAgent) {
    return;
  }
  try {
    const parsed = parseAgentPanelInput(agentCommandInput.value);
    if (parsed.type === "error") {
      setAgentResultOutput(parsed.payload, { ok: false, error: parsed.payload.error.message });
      return;
    }
    const result = window.DraftLiteAgent.execute(parsed.payload);
    setAgentResultOutput(isPromiseLike(result) ? await result : result);
  } catch (error) {
    setAgentResultOutput(
      {
        ok: false,
        error: error && error.message ? error.message : String(error),
      },
      {
        ok: false,
        error: error && error.message ? error.message : String(error),
      }
    );
  }
}

function validateAgentPanelDrawing() {
  if (!window.DraftLiteAgent) {
    return;
  }
  setAgentResultOutput(window.DraftLiteAgent.validateDrawing({ requireNonEmpty: true }));
}

function clearAgentPanelDrawing() {
  if (!window.DraftLiteAgent) {
    return;
  }
  setAgentResultOutput(window.DraftLiteAgent.clear());
}

function fitAgentPanelDrawing() {
  if (!window.DraftLiteAgent) {
    return;
  }
  setAgentResultOutput(window.DraftLiteAgent.fitAll());
}

function copyAgentPanelResult() {
  if (!agentResultOutput) {
    return;
  }
  const text = agentResultOutput.textContent || "";
  if (!text) {
    return;
  }
  copyAgentText(text, { action: "copyResult" }).then((result) => setAgentResultOutput(result));
}

function copyAgentPanelInput() {
  if (!agentCommandInput) {
    return;
  }
  copyAgentText(agentCommandInput.value || "", { action: "copyInput" }).then((result) => setAgentResultOutput(result));
}

function onAgentCommandInputKeyDown(event) {
  event.stopPropagation();
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    runAgentPanelCommand();
  }
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

async function executeAgentBridgeCommand(detail) {
  const command = detail && detail.command ? detail.command : {};
  const action = typeof command.action === "string" ? command.action.trim() : "";
  const result = window.DraftLiteAgent && typeof window.DraftLiteAgent.execute === "function"
    ? window.DraftLiteAgent.execute(command)
    : executeAgentCommand(command);
  const resolvedResult = isPromiseLike(result) ? await result : result;
  const payload = {
    id: detail && detail.id ? detail.id : String(Date.now()),
    action,
    ok: resolvedResult.ok,
    result: resolvedResult,
    error: resolvedResult.ok ? "" : (resolvedResult.error || "Unknown agent error."),
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
  const startedCanvasInteraction =
    uiState.panning ||
    uiState.selectionWindow ||
    uiState.selectDragDraft ||
    uiState.transformDraft ||
    uiState.gripEditDraft ||
    uiState.dimensionEndpointEditDraft ||
    uiState.rectEdgeEditDraft ||
    uiState.dimensionOffsetEditDraft;
  const screenPoint = getScreenPointFromEvent(event);
  if (uiState.activeTool === "libraryPlace" && !startedCanvasInteraction) {
    if (isSidebarEventTarget(event) || !isScreenPointInsideCanvas(screenPoint)) {
      uiState.libraryPlacementPreviewPoint = null;
      uiState.libraryPlacementPointerInsideCanvas = false;
      uiState.snapMarker = null;
    } else {
      const worldPoint = screenToWorld(screenPoint);
      const constrainedWorld = getConstrainedWorldPoint(worldPoint, event.shiftKey);
      const placementPoint = getLibraryPlacementPoint(constrainedWorld, event.shiftKey);
      uiState.pointerWorld = worldPoint;
      uiState.hoverWorld = placementPoint;
      uiState.libraryPlacementPointerInsideCanvas = true;
      uiState.libraryPlacementPreviewPoint = placementPoint;
      pointerReadout.textContent = `X: ${unitsToMm(placementPoint.x)} mm, Y: ${unitsToMm(placementPoint.y)} mm`;
    }
    draw();
    renderStatusPanel();
    return;
  }
  if (isSidebarEventTarget(event) && !startedCanvasInteraction) {
    return;
  }
  const worldPoint = screenToWorld(screenPoint);
  const constrainedWorld = getConstrainedWorldPoint(worldPoint, event.shiftKey);
  const snapCandidate = resolveSnapCandidate(constrainedWorld);
  const snappedWorld = snapCandidate ? snapCandidate.point : quantizeFreePointToGrid(constrainedWorld);
  uiState.snapMarker = snapCandidate ? { kind: snapCandidate.kind, point: snapCandidate.point } : null;
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
    updateSelectDrag(worldPoint, snappedWorld);
    renderStatusPanel();
    return;
  }

  if (uiState.transformDraft) {
    updateTransformDraft(constrainedWorld, snappedWorld, { snapped: Boolean(snapCandidate) });
    renderStatusPanel();
    return;
  }

  if (uiState.gripEditDraft) {
    updateGripEdit(snappedWorld);
    renderStatusPanel();
    return;
  }
  if (uiState.dimensionEndpointEditDraft) {
    updateDimensionEndpointEdit(snappedWorld);
    return;
  }
  if (uiState.dimensionOffsetEditDraft) {
    updateDimensionOffsetEdit(snappedWorld);
    return;
  }
  if (uiState.rectEdgeEditDraft) {
    if (uiState.rectEdgeEditDraft.numericInputBuffer) {
      applyRectEdgeNumericPreview();
      return;
    }
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
    !uiState.dimensionEndpointEditDraft &&
    !uiState.dimensionOffsetEditDraft &&
    !uiState.rectEdgeEditDraft
  ) {
    const roundedWorldPoint = roundWorldPoint(worldPoint);
    const dimensionEndpointHandleHit = findDimensionEndpointHandleAtPoint(roundedWorldPoint);
    if (dimensionEndpointHandleHit) {
      uiState.hoverDimensionEndpointHandle = dimensionEndpointHandleHit;
      uiState.hoverDimensionOffsetHandle = null;
      uiState.hoverGrip = null;
      uiState.hoverMoveAnchor = null;
      uiState.hoverBorrowedHandle = null;
      uiState.hoverRectEdge = null;
    } else {
      uiState.hoverDimensionEndpointHandle = null;
      const dimensionOffsetHandleHit = findDimensionOffsetHandleAtPoint(roundedWorldPoint);
      if (dimensionOffsetHandleHit) {
        uiState.hoverDimensionOffsetHandle = dimensionOffsetHandleHit;
        uiState.hoverGrip = null;
        uiState.hoverMoveAnchor = null;
        uiState.hoverBorrowedHandle = null;
        uiState.hoverRectEdge = null;
      } else {
        uiState.hoverDimensionOffsetHandle = null;
        const gripHit = findEditableGripAtPoint(roundedWorldPoint);
        if (gripHit) {
          uiState.hoverGrip = gripHit;
          uiState.hoverMoveAnchor = null;
          uiState.hoverBorrowedHandle = null;
          uiState.hoverRectEdge = null;
        } else {
          uiState.hoverGrip = null;
          const moveAnchorHit = findSelectedMoveAnchorAtPoint(roundedWorldPoint);
          if (moveAnchorHit) {
            uiState.hoverMoveAnchor = moveAnchorHit;
            uiState.hoverBorrowedHandle = null;
            uiState.hoverRectEdge = null;
          } else {
            uiState.hoverMoveAnchor = null;
            uiState.hoverBorrowedHandle = findBorrowedMoveBaseHandleAtPoint(roundedWorldPoint, {
              excludeEntityIds: state.selectedEntityIds,
            });
            if (uiState.hoverBorrowedHandle) {
              uiState.hoverRectEdge = null;
            } else {
              uiState.hoverRectEdge = findRectEdgeAtPoint(roundedWorldPoint);
            }
          }
        }
      }
    }
    if (uiState.hoverRectEdge) {
      document.body.style.cursor = (uiState.hoverRectEdge.edge === "left" || uiState.hoverRectEdge.edge === "right")
        ? "ew-resize"
        : "ns-resize";
    } else if (!uiState.hoverDimensionEndpointHandle && !uiState.hoverDimensionOffsetHandle && !uiState.hoverGrip && !uiState.hoverMoveAnchor && !uiState.hoverBorrowedHandle) {
      document.body.style.cursor = "";
    }
  } else {
    uiState.hoverDimensionEndpointHandle = null;
    uiState.hoverDimensionOffsetHandle = null;
    uiState.hoverGrip = null;
    uiState.hoverMoveAnchor = null;
    uiState.hoverBorrowedHandle = null;
    uiState.hoverRectEdge = null;
    document.body.style.cursor = "";
  }

  draw();
  renderStatusPanel();
}

function isSidebarEventTarget(event) {
  const target = event && event.target;
  return !!(target && typeof target.closest === "function" && target.closest(".sidebar"));
}

function getScreenPointFromEvent(event) {
  uiState.canvasRect = canvas.getBoundingClientRect();
  return {
    x: event.clientX - uiState.canvasRect.left,
    y: event.clientY - uiState.canvasRect.top,
  };
}

function isScreenPointInsideCanvas(screenPoint) {
  return screenPoint.x >= 0
    && screenPoint.y >= 0
    && screenPoint.x <= uiState.canvasRect.width
    && screenPoint.y <= uiState.canvasRect.height;
}

function getTouchCenterAndDistance(touchA, touchB) {
  const center = {
    x: (touchA.clientX + touchB.clientX) / 2,
    y: (touchA.clientY + touchB.clientY) / 2,
  };
  const distance = Math.hypot(touchA.clientX - touchB.clientX, touchA.clientY - touchB.clientY);
  return { center, distance };
}

function isSidebarInteractiveTouchTarget(target) {
  if (!target || typeof target.closest !== "function") {
    return false;
  }
  return !!target.closest('.sidebar input, .sidebar textarea, .sidebar button, .sidebar select, .sidebar option, .sidebar label, .sidebar details, .sidebar summary');
}

function onCanvasTouchStart(event) {
  if (isSidebarEventTarget(event)) {
    return;
  }
  if (isSidebarInteractiveTouchTarget(event.target)) {
    return;
  }

  if (event.touches.length === 1) {
    const touch = event.touches[0];
    const screenPoint = getScreenPointFromEvent({ clientX: touch.clientX, clientY: touch.clientY });
    uiState.touchTapDraft = {
      startClient: { x: touch.clientX, y: touch.clientY },
      startWorld: screenToWorld(screenPoint),
      startTime: Date.now(),
      moved: false,
    };
    uiState.touchPanDraft = {
      startClient: { x: touch.clientX, y: touch.clientY },
      startView: { panX: state.view.panX, panY: state.view.panY },
      active: false,
    };
    uiState.pinchDraft = null;
    uiState.touchGestureActive = true;
    event.preventDefault();
    return;
  }

  if (event.touches.length === 2) {
    const touchA = event.touches[0];
    const touchB = event.touches[1];
    const { center, distance } = getTouchCenterAndDistance(touchA, touchB);
    const screenPoint = getScreenPointFromEvent({ clientX: center.x, clientY: center.y });
    uiState.pinchDraft = {
      startDistance: Math.max(distance, 1),
      startZoom: state.view.zoom,
      anchorWorld: screenToWorld(screenPoint),
    };
    uiState.touchTapDraft = null;
    uiState.touchPanDraft = null;
    uiState.touchGestureActive = true;
    delete document.body.dataset.panning;
    event.preventDefault();
  }
}

function onCanvasTouchMove(event) {
  if (!uiState.touchGestureActive) {
    return;
  }

  if (event.touches.length === 1 && uiState.touchPanDraft) {
    const touch = event.touches[0];
    const deltaX = touch.clientX - uiState.touchPanDraft.startClient.x;
    const deltaY = touch.clientY - uiState.touchPanDraft.startClient.y;
    const moveDistance = Math.hypot(deltaX, deltaY);
    if (uiState.touchTapDraft && moveDistance > 10) {
      uiState.touchTapDraft.moved = true;
    }
    if (!uiState.touchPanDraft.active && moveDistance > 10) {
      uiState.touchPanDraft.active = true;
      document.body.dataset.panning = "true";
    }
    if (!uiState.touchPanDraft.active) {
      event.preventDefault();
      return;
    }
    state.view.panX = uiState.touchPanDraft.startView.panX + deltaX;
    state.view.panY = uiState.touchPanDraft.startView.panY + deltaY;
    event.preventDefault();
    draw();
    renderStatusPanel();
    return;
  }

  if (event.touches.length === 2) {
    if (!uiState.pinchDraft) {
      const touchA = event.touches[0];
      const touchB = event.touches[1];
      const start = getTouchCenterAndDistance(touchA, touchB);
      const startScreenPoint = getScreenPointFromEvent({ clientX: start.center.x, clientY: start.center.y });
      uiState.pinchDraft = {
        startDistance: Math.max(start.distance, 1),
        startZoom: state.view.zoom,
        anchorWorld: screenToWorld(startScreenPoint),
      };
      uiState.touchTapDraft = null;
      uiState.touchPanDraft = null;
    }
    const touchA = event.touches[0];
    const touchB = event.touches[1];
    const { center, distance } = getTouchCenterAndDistance(touchA, touchB);
    const screenPoint = getScreenPointFromEvent({ clientX: center.x, clientY: center.y });
    const ratio = distance / Math.max(uiState.pinchDraft.startDistance, 1);
    state.view.zoom = clampNumber(uiState.pinchDraft.startZoom * ratio, MIN_ZOOM, MAX_ZOOM, state.view.zoom);
    state.view.panX = screenPoint.x - uiState.pinchDraft.anchorWorld.x * state.view.zoom;
    state.view.panY = screenPoint.y - uiState.pinchDraft.anchorWorld.y * state.view.zoom;
    event.preventDefault();
    draw();
    renderStatusPanel();
    return;
  }

  event.preventDefault();
}

function onCanvasTouchEnd(event) {
  if (!uiState.touchGestureActive) {
    return;
  }

  if (event.touches.length === 1) {
    const touch = event.touches[0];
    uiState.touchPanDraft = {
      startClient: { x: touch.clientX, y: touch.clientY },
      startView: { panX: state.view.panX, panY: state.view.panY },
      active: false,
    };
    uiState.touchTapDraft = null;
    uiState.pinchDraft = null;
    delete document.body.dataset.panning;
    event.preventDefault();
    return;
  }

  const tapDraft = uiState.touchTapDraft;
  const isTap = !!(
    tapDraft &&
    !tapDraft.moved &&
    Date.now() - tapDraft.startTime <= 500
  );
  if (isTap) {
    const syntheticTapEvent = {
      altKey: false,
      ctrlKey: false,
      shiftKey: false,
    };
    handleCanvasPrimaryAction(tapDraft.startWorld, tapDraft.startWorld, syntheticTapEvent);
  }

  uiState.touchTapDraft = null;
  uiState.touchPanDraft = null;
  uiState.pinchDraft = null;
  uiState.touchGestureActive = false;
  delete document.body.dataset.panning;
  event.preventDefault();
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
  handleCanvasPrimaryAction(rawWorldPoint, rawWorldPoint, event);
}

function handleCanvasPrimaryAction(rawWorldPoint, rawSnapWorldPoint, event) {
  const worldPoint = resolveConstrainedSnapPoint(rawSnapWorldPoint, event.shiftKey);
  if (uiState.activeTool === "libraryPlace") {
    const item = getLibraryItemById(uiState.libraryPlacementItemId);
    if (item) {
      const placementPoint = uiState.libraryPlacementPreviewPoint
        || getLibraryPlacementPoint(rawSnapWorldPoint, event.shiftKey);
      placeLibraryItemAt(item, placementPoint);
    }
    return;
  }
  if (uiState.activeTool === "line") {
    handleLineToolClick(worldPoint);
    return;
  }
  if (uiState.activeTool === "wire") {
    handleWireToolClick(roundWorldPoint(rawWorldPoint));
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
    if (isTransformSelectionPhase()) {
      uiState.selectionWindow = {
        append: false,
        startScreen: worldToScreen(rawWorldPoint),
        currentScreen: worldToScreen(rawWorldPoint),
        startWorld: rawWorldPoint,
        currentWorld: rawWorldPoint,
      };
      draw();
      return;
    }
    if (!uiState.transformDraft) {
      const mode = uiState.activeTool === "move" && (event.altKey || event.ctrlKey)
        ? "copy"
        : uiState.activeTool;
      const baseSnapCandidate = resolveSnapCandidate(rawWorldPoint);
      startTransformDraft(baseSnapCandidate ? baseSnapCandidate.point : roundWorldPoint(rawWorldPoint), mode);
      return;
    }
    if (uiState.transformDraft.numericInputBuffer) {
      applyTransformNumericEdit();
      return;
    }
    {
      const constrainedPoint = getConstrainedWorldPoint(rawSnapWorldPoint, event.shiftKey);
      const destinationSnapCandidate = resolveSnapCandidate(constrainedPoint);
      uiState.transformDraft.currentPoint = destinationSnapCandidate
        ? destinationSnapCandidate.point
        : getQuantizedDeltaPoint(uiState.transformDraft.startPoint, constrainedPoint);
    }
    applyTransformDraft();
    return;
  }

  if (uiState.activeTool === "mirror") {
    handleMirrorToolClick(worldPoint);
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
    const dimensionEndpointHandleHit = findDimensionEndpointHandleAtPoint(roundWorldPoint(rawWorldPoint));
    if (dimensionEndpointHandleHit) {
      startDimensionEndpointEdit(dimensionEndpointHandleHit, worldPoint);
      return;
    }
    const dimensionOffsetHandleHit = findDimensionOffsetHandleAtPoint(roundWorldPoint(rawWorldPoint));
    if (dimensionOffsetHandleHit) {
      startDimensionOffsetEdit(dimensionOffsetHandleHit, worldPoint);
      return;
    }
    if (uiState.gripEditDraft) {
      if (uiState.gripEditDraft.numericInputBuffer) {
        applyGripNumericEdit();
        return;
      }
      uiState.gripEditDraft.currentPoint = worldPoint;
      applyGripEdit();
      return;
    }
    if (uiState.rectEdgeEditDraft) {
      if (uiState.rectEdgeEditDraft.numericInputBuffer) {
        applyRectEdgeNumericEdit();
        return;
      }
      uiState.rectEdgeEditDraft.currentPoint = worldPoint;
      applyRectEdgeEdit();
      return;
    }
    const gripHit = findEditableGripAtPoint(worldPoint);
    if (gripHit) {
      startGripEdit(gripHit, worldPoint);
      return;
    }
    const moveAnchorHit = findSelectedMoveAnchorAtPoint(roundWorldPoint(rawWorldPoint));
    if (moveAnchorHit) {
      startSelectDragWithMode(
        rawWorldPoint,
        event.altKey || event.ctrlKey ? "copy" : "move",
        {
          snapAnchorPoint: moveAnchorHit.point,
          pointerStartPoint: rawWorldPoint,
        }
      );
      return;
    }
    const borrowedHandleHit = findBorrowedMoveBaseHandleAtPoint(roundWorldPoint(rawWorldPoint), {
      excludeEntityIds: state.selectedEntityIds,
    });
    if (borrowedHandleHit) {
      if (state.selectedEntityIds.length) {
        startSelectDragWithMode(
          rawWorldPoint,
          event.altKey || event.ctrlKey ? "copy" : "move",
          {
            snapAnchorPoint: borrowedHandleHit.point,
            pointerStartPoint: rawWorldPoint,
          }
        );
        return;
      }
      if (startHandleDrivenSelectionAction(borrowedHandleHit, rawWorldPoint, worldPoint, event)) {
        return;
      }
    }
    const rectEdgeHit = findRectEdgeAtPoint(roundWorldPoint(rawWorldPoint));
    if (rectEdgeHit) {
      const rectEntity = getEntityById(rectEdgeHit.entityId);
      if (startRectEdgeEdit(rectEntity, rectEdgeHit.edge, worldPoint)) {
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
      startScreen: worldToScreen(rawWorldPoint),
      currentScreen: worldToScreen(rawWorldPoint),
      startWorld: rawWorldPoint,
      currentWorld: rawWorldPoint,
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

  if (uiState.lineDraft.numericInputBuffer) {
    applyLineNumericEdit();
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

function handleWireToolClick(worldPoint) {
  if (!uiState.wireDraft) {
    if (!canDrawOnActiveLayer()) {
      return;
    }
    beginWireDraft(worldPoint);
    return;
  }

  const createdEntity = addWireEntity(uiState.wireDraft.start, worldPoint);
  if (!createdEntity) {
    draw();
    renderStatusPanel();
    return;
  }

  endWireDraft("Wire created.");
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
  const entity = { id: createEntityId(), type: "text", layerId: state.activeLayerId, x: roundToUnit(worldPoint.x), y: roundToUnit(worldPoint.y), text, height: mmToUnits(100), rotation: 0, align: "left", textAnchor: "center", color: "" };
  state.entities.push(entity);
  state.selectedEntityIds = [entity.id];
  syncAfterStateChange();
  setStatus("Text created.");
}

function createDefaultDimensionEntity(fields = {}) {
  const activeLayer = getLayerById(fields.layerId || state.activeLayerId);
  return {
    id: fields.id || createEntityId(),
    type: "dimension",
    layerId: fields.layerId || state.activeLayerId,
    p1: roundWorldPoint(fields.p1 || { x: 0, y: 0 }),
    p2: roundWorldPoint(fields.p2 || { x: 0, y: 0 }),
    offsetPoint: roundWorldPoint(fields.offsetPoint || fields.p2 || { x: 0, y: 0 }),
    textOverride: typeof fields.textOverride === "string" ? fields.textOverride : "",
    textHeight: Number.isFinite(fields.textHeight) ? fields.textHeight : mmToUnits(100),
    extensionGap: Number.isFinite(fields.extensionGap) ? fields.extensionGap : mmToUnits(50),
    tickSize: Number.isFinite(fields.tickSize) ? fields.tickSize : mmToUnits(200),
    color: typeof fields.color === "string" && fields.color ? fields.color : normalizeColor(activeLayer?.color || "#000000"),
    precision: Number.isFinite(fields.precision) ? fields.precision : 0,
  };
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
  if (uiState.dimensionDraft.mode === "chain") {
    const p1 = roundWorldPoint(uiState.dimensionDraft.chainStartPoint);
    const p2 = roundWorldPoint(worldPoint);
    const entity = createDimensionWithPreservedOffset(
      createDefaultDimensionEntity({
        id: createEntityId(),
        layerId: state.activeLayerId,
        p1,
        p2,
        offsetPoint: p2,
      }),
      "p2",
      p2,
      uiState.dimensionDraft.signedOffset
    );
    if (!entity) {
      setStatus("Dimension length must be greater than zero.");
      return;
    }
    pushUndoState();
    state.entities.push(entity);
    state.selectedEntityIds = [entity.id];
    uiState.dimensionDraft.chainStartPoint = roundWorldPoint(entity.p2);
    syncAfterStateChange();
    setStatus("Chain dimension created. Pick next point or press Esc to finish.");
    return;
  }
  pushUndoState();
  const entity = createDefaultDimensionEntity({
    id: createEntityId(),
    layerId: state.activeLayerId,
    p1: uiState.dimensionDraft.p1,
    p2: uiState.dimensionDraft.p2,
    offsetPoint: worldPoint,
  });
  state.entities.push(entity);
  state.selectedEntityIds=[entity.id];
  const geometry = getDimensionGeometry(entity);
  uiState.dimensionDraft = {
    mode: "chain",
    chainStartPoint: roundWorldPoint(entity.p2),
    signedOffset: geometry.signedOffset,
  };
  syncAfterStateChange();
  setStatus("Aligned Dimension created. Pick next chain point or press Esc to finish.");
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
  const startedCanvasInteraction =
    uiState.panning ||
    uiState.selectionWindow ||
    uiState.selectDragDraft ||
    uiState.transformDraft ||
    uiState.gripEditDraft ||
    uiState.dimensionEndpointEditDraft ||
    uiState.rectEdgeEditDraft ||
    uiState.dimensionOffsetEditDraft;
  if (isSidebarEventTarget(event) && !startedCanvasInteraction) {
    return;
  }
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
      finishMoveCopySelectionPhase();
      return;
    }

    selectEntitiesByWindow(selectionWindow);
    finishMoveCopySelectionPhase();
    return;
  }

  if (uiState.selectDragDraft) {
    applySelectDrag();
    return;
  }
  if (uiState.dimensionEndpointEditDraft) {
    applyDimensionEndpointEdit();
    return;
  }
  if (uiState.dimensionOffsetEditDraft) {
    applyDimensionOffsetEdit();
    return;
  }
  if (uiState.rectEdgeEditDraft) {
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

function getViewportCenterWorld() {
  return roundWorldPoint(screenToWorld({
    x: uiState.canvasRect.width / 2,
    y: uiState.canvasRect.height / 2,
  }));
}

function addTitleBlockEntity() {
  if (!titleBlockApi) {
    setStatus("Title Block module is unavailable.");
    return false;
  }
  const activeLayer = getLayerById(state.activeLayerId);
  if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
    setStatus("Choose a visible, unlocked active layer before placing a Title Block.");
    return false;
  }
  pushUndoState();
  const entity = titleBlockApi.createTitleBlockEntity({
    id: createEntityId(),
    layerId: state.activeLayerId,
    center: getViewportCenterWorld(),
    roundWorldPoint,
    roundToUnit,
    mmToUnits,
  });
  state.entities.push(entity);
  state.selectedEntityIds = [entity.id];
  uiState.activeTool = "select";
  syncAfterStateChange();
  setStatus("Title Block placed.");
  return true;
}

function getTitleBlockExportDeps() {
  return {
    entities: state.entities,
    isLayerVisible,
    getEntityBoundsUnits,
    getLayerColor(layerId) {
      return normalizeColor(getLayerById(layerId)?.color || "#2e3135");
    },
    getStrokeColorForEntity: getEntityStrokeColor,
    getFillStyleForEntity(entity) {
      const layer = getLayerById(entity.layerId);
      return getEntityFillStyle(entity, layer?.color || getEntityStrokeColor(entity), 0.18);
    },
    getDimensionGeometryForExport(entity) {
      return getDimensionGeometry(entity);
    },
    getDimensionDisplayTextForExport(entity) {
      return getDimensionDisplayText(entity);
    },
    getDimensionTextLayoutForExport(entity) {
      return getDimensionTextLayout(entity);
    },
    getDimensionGeometryColorForExport(entity) {
      return getDimensionGeometryColor(entity);
    },
    getDimensionTextColorForExport(entity) {
      return getDimensionTextColor(entity);
    },
    getDimensionTickRadiusUnitsForExport(entity) {
      return getDimensionTickRadiusUnits(entity);
    },
    getTextInsertionPointUnitsForExport(entity) {
      return getTextInsertionPointUnits(entity);
    },
    buildDxfTextFromEntities,
    getDxfExportSummaryForEntities,
    downloadBlob,
    createTimestampLabel,
    setStatus,
    roundToUnit,
    roundWorldPoint,
    mmToUnits,
    unitsToMm,
  };
}

function exportSelectedTitleBlockScreenshot(entity) {
  if (!titleBlockApi) {
    return Promise.resolve();
  }
  return titleBlockApi.exportTitleBlockScreenshot(entity, getTitleBlockExportDeps()).catch((error) => {
    console.error(error);
    setStatus("Title Block screenshot export failed.");
  });
}

function exportSelectedTitleBlockPdf(entity) {
  if (!titleBlockApi) {
    return Promise.resolve();
  }
  return titleBlockApi.exportTitleBlockPdf(entity, getTitleBlockExportDeps()).catch((error) => {
    console.error(error);
    setStatus("Title Block PDF export failed.");
  });
}

function exportSelectedTitleBlockDxf(entity) {
  if (!titleBlockApi) {
    return Promise.resolve();
  }
  return titleBlockApi.exportTitleBlockDxf(entity, getTitleBlockExportDeps()).catch((error) => {
    console.error(error);
    setStatus("Title Block DXF export failed.");
  });
}

function setActiveTool(tool, options = {}) {
  const remember = options.remember !== false;
  const shouldClearSelection = options.clearSelection === true;
  if (remember) {
    rememberRepeatableTool(tool);
  }
  if (uiState.activeTool !== tool) {
    clearTransientState();
  }
  uiState.activeTool = tool;
  if (shouldClearSelection && state.selectedEntityIds.length) {
    state.selectedEntityIds = [];
    syncAfterStateChange(false);
  } else {
    syncToolButtons();
    draw();
    renderStatusPanel();
  }
  if (isMoveCopyTool(tool)) {
    updateMoveCopyStatus(tool);
    return;
  }
  if (tool === "dimension") {
    setStatus("Aligned Dimension: pick first point");
    return;
  }
  if (tool === "wire") {
    setStatus("Wire: pick start point.");
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
  if (tool === "mirror") {
    if (!getSelectedTransformableEntities().length) {
      setStatus("Mirror: Select objects first.");
    } else {
      setStatus("Mirror: pick axis first point.");
    }
    return;
  }
  setStatus(`${capitalize(tool)} tool active.`);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}



function selectReplacementPdfForEntity(entityId) {
  if (!importPdfInput) {
    setStatus("PDF file input is not available.");
    return;
  }
  const entity = getEntityById(entityId);
  if (!entity || entity.type !== "pdfUnderlay") {
    setStatus("Select a PDF underlay to relink.");
    return;
  }
  uiState.pdfReplaceTargetId = entityId;
  importPdfInput.value = "";
  importPdfInput.click();
}

async function replaceSelectedPdfUnderlayFromInput(file, targetEntityId) {
  const entity = getEntityById(targetEntityId);
  if (!entity || entity.type !== "pdfUnderlay") {
    setStatus("Select a PDF underlay to relink.");
    return;
  }
  try {
    if (!pdfUnderlayApi) {
      setStatus("PDF.js is not loaded.");
      return;
    }
    const fileType = typeof file.type === "string" ? file.type.toLowerCase() : "";
    const fileName = typeof file.name === "string" ? file.name.toLowerCase() : "";
    if (fileType !== "application/pdf" && !fileName.endsWith(".pdf")) {
      setStatus("Please select a PDF file.");
      return;
    }
    setStatus("Relinking PDF underlay...");
    const currentSelection = state.selectedEntityIds.slice();
    const loadedUnderlay = await pdfUnderlayApi.loadPdfFileAsUnderlay(file, entity);
    const replacementEntity = normalizeEntity({
      ...entity,
      name: loadedUnderlay.name || file.name || entity.name || "Imported PDF",
      widthUnits: loadedUnderlay.widthUnits,
      heightUnits: loadedUnderlay.heightUnits,
      imageBitmap: loadedUnderlay.imageBitmap,
      imageDataUrl: loadedUnderlay.imageDataUrl,
      enabled: true,
    }, { legacyUnits: false });
    if (!replacementEntity) {
      setStatus("Failed to load PDF underlay.");
      return;
    }
    pushUndoState();
    state.entities = state.entities.map((item) => (item.id === entity.id ? replacementEntity : item));
    state.selectedEntityIds = currentSelection.filter((id) => state.entities.some((item) => item.id === id));
    if (!state.selectedEntityIds.includes(replacementEntity.id)) {
      state.selectedEntityIds = [replacementEntity.id];
    }
    syncAfterStateChange();
    setStatus(`PDF underlay relinked: ${file.name}`);
  } catch (error) {
    console.error(error);
    const message = error && typeof error.message === "string" ? error.message : "";
    if (message === "PDF.js is not loaded." || message === "Please select a PDF file.") {
      setStatus(message);
    } else if (message.includes("Font or CMap")) {
      setStatus("Failed to load PDF underlay. Font or CMap resources may be unavailable.");
    } else if (message.includes("PDF rendering failed")) {
      setStatus("Failed to render PDF underlay.");
    } else {
      setStatus("Failed to load PDF underlay.");
    }
  }
}

async function importPdfUnderlayFromInput() {
  const [file] = importPdfInput.files || [];
  const replaceTargetId = uiState.pdfReplaceTargetId;
  uiState.pdfReplaceTargetId = null;
  if (!file) {
    return;
  }
  if (replaceTargetId) {
    await replaceSelectedPdfUnderlayFromInput(file, replaceTargetId);
    importPdfInput.value = "";
    return;
  }
  try {
    if (!pdfUnderlayApi) {
      setStatus("PDF.js is not loaded.");
      return;
    }
    const fileType = typeof file.type === "string" ? file.type.toLowerCase() : "";
    const fileName = typeof file.name === "string" ? file.name.toLowerCase() : "";
    if (fileType !== "application/pdf" && !fileName.endsWith(".pdf")) {
      setStatus("Please select a PDF file.");
      return;
    }
    setStatus("Loading PDF underlay...");
    const nextUnderlay = await pdfUnderlayApi.loadPdfFileAsUnderlay(file, state.pdfUnderlay);
    pushUndoState();
    const pdfEntity = normalizeEntity({ ...nextUnderlay, id: createEntityId(), type: "pdfUnderlay", enabled: true, layerId: state.activeLayerId }, { legacyUnits: false });
    state.pdfUnderlay = pdfUnderlayApi.clearPdfUnderlay();
    if (pdfEntity) {
      state.entities.push(pdfEntity);
      state.selectedEntityIds = [pdfEntity.id];
    }
    syncAfterStateChange();
    setStatus(`PDF underlay loaded: ${file.name}`);
  } catch (error) {
    console.error(error);
    const message = error && typeof error.message === "string" ? error.message : "";
    if (message === "PDF.js is not loaded." || message === "Please select a PDF file.") {
      setStatus(message);
    } else if (message.includes("Font or CMap")) {
      setStatus("Failed to load PDF underlay. Font or CMap resources may be unavailable.");
    } else if (message.includes("PDF rendering failed")) {
      setStatus("Failed to render PDF underlay.");
    } else {
      setStatus("Failed to load PDF underlay.");
    }
  } finally {
    importPdfInput.value = "";
  }
}

async function linkDxfUnderlayFromInput() {
  const [file] = linkDxfInput.files || [];
  if (!file) {
    setStatus("No DXF file selected.");
    return;
  }
  try {
    if (!dxfUnderlayApi || typeof dxfUnderlayApi.parseDxfText !== "function") {
      setStatus("DXF underlay parser is not loaded.");
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setStatus("DXF file exceeds the 8MB safety limit.");
      return;
    }
    const fileName = typeof file.name === "string" ? file.name : "Linked DXF";
    if (!fileName.toLowerCase().endsWith(".dxf")) {
      setStatus("Please select a DXF file.");
      return;
    }
    setStatus("Linking DXF underlay...");
    const text = await file.text();
    const result = dxfUnderlayApi.parseDxfText(text);
    if (!result || !result.ok) {
      const message = result && result.error ? result.error : "Failed to link DXF underlay.";
      console.warn("DXF underlay link failed", result);
      setStatus(message);
      return;
    }
    const stats = result.stats || {};
    const dxfEntity = normalizeEntity({
      id: createEntityId(),
      type: "dxfUnderlay",
      layerId: state.activeLayerId,
      name: fileName.replace(/\.dxf$/i, "") || "DXF Underlay",
      sourceName: fileName,
      x: 0,
      y: 0,
      scale: 1,
      rotation: 0,
      opacity: 0.45,
      visible: true,
      locked: false,
      unitMm: result.unitMm || 1,
      primitives: result.primitives || [],
      bounds: result.bounds || null,
      stats,
    }, { legacyUnits: false });
    if (!dxfEntity || !dxfEntity.primitives.length) {
      setStatus("DXF contains no supported underlay primitives.");
      return;
    }
    pushUndoState();
    state.entities.push(dxfEntity);
    state.selectedEntityIds = [dxfEntity.id];
    syncAfterStateChange();
    const warningSuffix = stats.truncated ? " (truncated by safety limits)" : "";
    setStatus(`DXF underlay linked: ${dxfEntity.primitives.length} primitives, ${stats.skippedCount || 0} skipped${warningSuffix}.`);
  } catch (error) {
    console.warn(error);
    setStatus("Failed to link DXF underlay.");
  } finally {
    linkDxfInput.value = "";
  }
}

function clearPdfUnderlay() {
  const hasPdfEntities = state.entities.some((entity) => entity.type === "pdfUnderlay");
  if (!hasPdfEntities && (!pdfUnderlayApi || !state.pdfUnderlay || !state.pdfUnderlay.enabled)) {
    setStatus("No PDF underlay loaded.");
    return;
  }
  pushUndoState();
  state.entities = state.entities.filter((entity) => entity.type !== "pdfUnderlay");
  state.selectedEntityIds = state.selectedEntityIds.filter((id) => getEntityById(id));
  state.pdfUnderlay = pdfUnderlayApi.clearPdfUnderlay();
  syncAfterStateChange();
  setStatus("PDF underlay cleared.");
}

function saveJsonToFile() {
  const documentState = getSerializableState();
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
      if (state.pdfUnderlay && state.pdfUnderlay.enabled && !state.pdfUnderlay.imageBitmap && !state.pdfUnderlay.imageDataUrl) {
        setStatus("PDF underlay needs to be re-linked.");
      } else {
        setStatus(`Loaded ${file.name}.`);
      }
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
  return buildDxfTextFromEntities(collectDxfExportEntities());
}

function buildDxfTextFromEntities(exportEntities) {
  const exportLines = collectDxfExportLines(exportEntities);
  const exportCircles = collectDxfExportCircleEntities(exportEntities);
  const exportArcs = collectDxfExportArcEntities(exportEntities);
  const exportTexts = collectDxfExportTextEntities(exportEntities);
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
    const insertionPoint = getTextInsertionPointUnits(entity);
    const needsAlignedPoint = entity.align === "center" || entity.align === "right";
    dxfLines.push("0", "TEXT");
    dxfLines.push("8", getDxfLayerNameForEntity(entity));
    dxfLines.push("10", formatDxfNumber(dxfXUnitsToMm(insertionPoint.x)));
    dxfLines.push("20", formatDxfNumber(dxfYUnitsToMm(insertionPoint.y)));
    dxfLines.push("30", formatDxfNumber(0));
    if (needsAlignedPoint) {
      dxfLines.push("11", formatDxfNumber(dxfXUnitsToMm(insertionPoint.x)));
      dxfLines.push("21", formatDxfNumber(dxfYUnitsToMm(insertionPoint.y)));
      dxfLines.push("31", formatDxfNumber(0));
    }
    dxfLines.push("40", formatDxfNumber(unitsToMm(entity.height)));
    dxfLines.push("1", sanitizeDxfText(entity.text || ""));
    if (entity.rotation) {
      dxfLines.push("50", formatDxfNumber(normalizeAngleDeg(entity.rotation)));
    }
    if (entity.align === "center") {
      dxfLines.push("72", "1");
    } else if (entity.align === "right") {
      dxfLines.push("72", "2");
    }
  });
  dxfLines.push("0", "ENDSEC", "0", "EOF");

  return `${dxfLines.join("\r\n")}\r\n`;
}

function getDxfExportSummary() {
  return getDxfExportSummaryForEntities(collectDxfExportEntities());
}

function getDxfExportSummaryForEntities(exportEntities) {
  const exportLines = collectDxfExportLines(exportEntities);
  const exportCircles = collectDxfExportCircleEntities(exportEntities);
  const exportArcs = collectDxfExportArcEntities(exportEntities);
  const exportTexts = collectDxfExportTextEntities(exportEntities);
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
  const p1 = entity.p1;
  const p2 = entity.p2;
  const { o1, o2, extensionStart1, extensionStart2 } = getDimensionGeometry(entity);
  const tick=Math.max(1,Math.round((entity.tickSize||250)*0.25));
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const tx=roundToUnit(nx*tick), ty=roundToUnit(ny*tick);
  return {
    lines:[
      {layerId:entity.layerId,p1:extensionStart1,p2:o1},{layerId:entity.layerId,p1:extensionStart2,p2:o2},{layerId:entity.layerId,p1:o1,p2:o2},
      {layerId:entity.layerId,p1:{x:o1.x-tx,y:o1.y-ty},p2:{x:o1.x+tx,y:o1.y+ty}},
      {layerId:entity.layerId,p1:{x:o2.x-tx,y:o2.y-ty},p2:{x:o2.x+tx,y:o2.y+ty}},
    ],
    text:{type:"text",layerId:entity.layerId,x:roundToUnit((o1.x+o2.x)/2),y:roundToUnit((o1.y+o2.y)/2),height:entity.textHeight||250,text:getDimensionDisplayText(entity),align:"center",textAnchor:"center"}
  };
}

function flattenBlockInstancesForExport(entities) {
  return entities.flatMap((entity) => {
    if (!entity || entity.type !== "blockInstance") {
      return entity ? [entity] : [];
    }
    return getBlockInstanceRenderableEntities(entity);
  });
}

function collectDxfExportEntities() {
  return flattenBlockInstancesForExport(
    state.entities.filter((entity) => entity && isLayerVisible(entity.layerId))
  ).filter((entity) =>
    entity
    && isEntityVisible(entity)
    && (entity.type === "line" || entity.type === "rect" || entity.type === "titleBlock" || entity.type === "circle" || entity.type === "arc" || entity.type === "filledRegion" || entity.type === "text" || entity.type === "dimension")
  );
}

function collectDxfExportLines(entities = collectDxfExportEntities()) {
  return entities.flatMap((entity) =>
    entity.type === "line"
      ? [entity]
      : (entity.type === "rect"
        // Rounded rectangle DXF output is intentionally deferred; canvas rendering supports cornerRadius.
      ? rectToOutlineLines(entity)
        : (entity.type === "titleBlock" && titleBlockApi && typeof titleBlockApi.getDxfPrimitives === "function"
          ? titleBlockApi.getDxfPrimitives(entity, { roundToUnit, mmToUnits }).lines
        : (entity.type === "filledRegion"
          ? filledRegionToOutlineLines(entity)
          : (entity.type === "dimension" ? explodeDimensionToDxfPrimitives(entity).lines : []))))
  );
}

function collectDxfExportTextEntities(entities = collectDxfExportEntities()) {
  return entities.flatMap((entity) => {
    if (entity.type === "text") {
      return [entity];
    }
    if (entity.type === "rect") {
      const label = (entity.label || "").trim();
      if (!label) {
        return [];
      }
      return [{
        type: "text",
        layerId: entity.layerId,
        x: entity.x + entity.width / 2,
        y: entity.y + entity.height / 2,
        height: entity.labelSize || mmToUnits(100),
        text: label,
        align: "center",
        color: normalizeOptionalColor(entity.color || ""),
      }];
    }
    if (entity.type === "dimension") {
      return [explodeDimensionToDxfPrimitives(entity).text];
    }
    if (entity.type === "titleBlock" && titleBlockApi && typeof titleBlockApi.getDxfPrimitives === "function") {
      return titleBlockApi.getDxfPrimitives(entity, { roundToUnit, mmToUnits }).texts;
    }
    return [];
  });
}

function collectDxfExportCircleEntities(entities = collectDxfExportEntities()) {
  return entities.filter((entity) => entity.type === "circle");
}

function collectDxfExportArcEntities(entities = collectDxfExportEntities()) {
  return entities.filter((entity) => entity.type === "arc");
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
    const bounds = getTextBoundsUnits(entity);
    xs.push(dxfXUnitsToMm(bounds.minX), dxfXUnitsToMm(bounds.maxX));
    ys.push(dxfYUnitsToMm(bounds.minY), dxfYUnitsToMm(bounds.maxY));
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
  const textInputActive = isTextInputActive();
  if (isEditableTarget(event.target)) {
    return;
  }

  if (isMeta && !event.shiftKey && !event.altKey) {
    const key = event.key.toLowerCase();
    if (key === "c") {
      event.preventDefault();
      copySelectedEntitiesToClipboard();
      return;
    }
    if (key === "x") {
      event.preventDefault();
      cutSelectedEntitiesToClipboard();
      return;
    }
    if (key === "v") {
      event.preventDefault();
      pasteEntitiesFromClipboard();
      return;
    }
  }

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

  if (event.key === "Escape" && uiState.dimensionEndpointEditDraft && !textInputActive) {
    event.preventDefault();
    cancelDimensionEndpointEdit();
    return;
  }

  if (event.key === "Escape" && uiState.dimensionOffsetEditDraft && !textInputActive) {
    event.preventDefault();
    cancelDimensionOffsetEdit();
    return;
  }

  if (event.key === "Escape") {
    if (textInputActive) {
      return;
    }
    event.preventDefault();
    cancelCurrentOperationAndClearSelection();
    return;
  }

  if (event.code === "Space" && !textInputActive) {
    if (repeatLastToolFromSpace(event)) {
      return;
    }
    if (shouldIgnoreSpaceRepeat(event)) {
      event.preventDefault();
      return;
    }
  }

  if (uiState.gripEditDraft && !textInputActive) {
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
        applyGripNumericEdit();
        return;
      }
      applyGripEdit();
      return;
    }
  }

  if (uiState.rectEdgeEditDraft && !textInputActive) {
    if (/^\d$/.test(event.key) || (event.key === "." && !uiState.rectEdgeEditDraft.numericInputBuffer.includes("."))) {
      event.preventDefault();
      uiState.rectEdgeEditDraft.numericInputBuffer += event.key;
      applyRectEdgeNumericPreview();
      updateRectEdgeEditStatus();
      draw();
      renderStatusPanel();
      return;
    }

    if (event.key === "Backspace") {
      if (uiState.rectEdgeEditDraft.numericInputBuffer) {
        event.preventDefault();
        uiState.rectEdgeEditDraft.numericInputBuffer = uiState.rectEdgeEditDraft.numericInputBuffer.slice(0, -1);
        if (!uiState.rectEdgeEditDraft.numericInputBuffer) {
          uiState.rectEdgeEditDraft.currentPoint = uiState.hoverWorld;
          updateRectEdgeEditStatus();
        } else {
          applyRectEdgeNumericPreview();
          updateRectEdgeEditStatus();
        }
        draw();
        renderStatusPanel();
        return;
      }
    }

    if (event.key === "Enter" && uiState.rectEdgeEditDraft.numericInputBuffer) {
      event.preventDefault();
      applyRectEdgeNumericEdit();
      return;
    }
  }

  if (uiState.lineDraft && !textInputActive) {
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
        applyLineNumericEdit();
        return;
      }
      endLineDraft("Line command ended.");
      return;
    }
  }

  if (uiState.filledRegionDraft && !textInputActive && event.key === "Enter") {
    event.preventDefault();
    finishFilledRegionDraft();
    return;
  }

  if (uiState.transformDraft && !textInputActive) {
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
      if (uiState.transformDraft.numericInputBuffer) {
        event.preventDefault();
        applyTransformNumericEdit();
        return;
      }
    }
  }

  if (
    !textInputActive
    && !isCommandInProgress()
    && !event.repeat
    && !event.altKey
    && !isMeta
  ) {
    const shortcutAction = SHORTCUT_TO_ACTION[event.key.toLowerCase()];
    if (shortcutAction) {
      event.preventDefault();
      shortcutAction();
      return;
    }
  }

  if (event.key === "Delete" || event.key === "Backspace") {
    if (textInputActive) {
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
  canvas.addEventListener("touchstart", onCanvasTouchStart, { passive: false });
  canvas.addEventListener("touchmove", onCanvasTouchMove, { passive: false });
  canvas.addEventListener("touchend", onCanvasTouchEnd, { passive: false });
  canvas.addEventListener("touchcancel", onCanvasTouchEnd, { passive: false });

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
  toolButtons.wire.addEventListener("click", () => setActiveTool("wire"));
  toolButtons.rectangle.addEventListener("click", () => setActiveTool("rectangle"));
  toolButtons.circle.addEventListener("click", () => setActiveTool("circle"));
  toolButtons.arc.addEventListener("click", () => setActiveTool("arc"));
  toolButtons.filledRegion.addEventListener("click", () => setActiveTool("filledRegion"));
  toolButtons.text.addEventListener("click", () => setActiveTool("text"));
  toolButtons.dimension.addEventListener("click", () => setActiveTool("dimension"));
  toolButtons.matchProperties.addEventListener("click", () => setActiveTool("matchProperties"));
  toolButtons.move.addEventListener("click", () => setActiveTool("move"));
  toolButtons.copy.addEventListener("click", () => setActiveTool("copy"));
  toolButtons.group.addEventListener("click", createGroupFromSelection);
  toolButtons.ungroup.addEventListener("click", ungroupSelection);
  toolButtons.makeBlock.addEventListener("click", () => {
    makeBlockFromSelection();
  });
  toolButtons.rotate.addEventListener("click", () => rotateSelectedEntities(90));
  toolButtons.mirror.addEventListener("click", () => setActiveTool("mirror"));
  toolButtons.align.addEventListener("click", () => setActiveTool("align"));
  toolButtons.extend.addEventListener("click", () => setActiveTool("extend"));
  toolButtons.fillet.addEventListener("click", () => setActiveTool("fillet"));
  deleteButton.addEventListener("click", deleteSelectedEntities);
  undoButton.addEventListener("click", undo);
  redoButton.addEventListener("click", redo);
  if (titleBlockButton) {
    titleBlockButton.addEventListener("click", addTitleBlockEntity);
  }
  fitAllButton.addEventListener("click", fitAll);
  saveJsonButton.addEventListener("click", saveJsonToFile);
  loadJsonButton.addEventListener("click", () => loadJsonInput.click());
  exportDxfButton.addEventListener("click", exportDxf);
  if (importPdfButton && importPdfInput) {
    importPdfButton.addEventListener("click", () => {
      uiState.pdfReplaceTargetId = null;
      importPdfInput.value = "";
      importPdfInput.click();
    });
  }
  if (linkDxfButton && linkDxfInput) {
    linkDxfButton.addEventListener("click", () => linkDxfInput.click());
    linkDxfInput.addEventListener("change", linkDxfUnderlayFromInput);
  }
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
  if (agentRunButton) {
    agentRunButton.addEventListener("click", runAgentPanelCommand);
  }
  if (agentValidateButton) {
    agentValidateButton.addEventListener("click", validateAgentPanelDrawing);
  }
  if (agentClearButton) {
    agentClearButton.addEventListener("click", clearAgentPanelDrawing);
  }
  if (agentFitButton) {
    agentFitButton.addEventListener("click", fitAgentPanelDrawing);
  }
  if (agentCopyInputButton) {
    agentCopyInputButton.addEventListener("click", copyAgentPanelInput);
  }
  if (agentCopyResultButton) {
    agentCopyResultButton.addEventListener("click", copyAgentPanelResult);
  }
  if (agentCommandInput) {
    agentCommandInput.addEventListener("keydown", onAgentCommandInputKeyDown);
  }
  if (layersPanelToggle) layersPanelToggle.addEventListener("click", () => toggleSidebarPanel("layers"));
  if (propertiesPanelToggle) propertiesPanelToggle.addEventListener("click", () => toggleSidebarPanel("properties"));
  syncSidebarPanelVisibility();
  if (addToLibraryButton) addToLibraryButton.addEventListener("click", addSelectionToLibrary);
  if (exportLibraryButton) exportLibraryButton.addEventListener("click", exportLocalLibrary);
  if (importLibraryButton && importLibraryInput) importLibraryButton.addEventListener("click", () => importLibraryInput.click());
  if (importLibraryInput) importLibraryInput.addEventListener("change", () => { const [file] = importLibraryInput.files || []; if (file) importLibraryFromFile(file); importLibraryInput.value = ""; });
  ribbonTabs.forEach((tab) => {
    tab.addEventListener("click", () => setActiveRibbonTab(tab.dataset.ribbonTab));
  });

  loadJsonInput.addEventListener("change", () => {
    const [file] = loadJsonInput.files || [];
    if (file) {
      loadJsonFromFile(file);
    }
  });
  if (importPdfInput) {
    importPdfInput.addEventListener("change", importPdfUnderlayFromInput);
  }
}

function initializeView() {
  resizeCanvas();
  const restored = restoreFromLocalStorage();
  if (!restored) {
    state.view.panX = uiState.canvasRect.width / 2;
    state.view.panY = uiState.canvasRect.height / 2;
  }
  syncAfterStateChange(false);
  const pdfUnderlayNeedsRelink = restored && state.pdfUnderlay && state.pdfUnderlay.enabled && !state.pdfUnderlay.imageBitmap && !state.pdfUnderlay.imageDataUrl;
  if (pdfUnderlayNeedsRelink) {
    setStatus("PDF underlay needs to be re-linked.");
  }
  if (!restored) {
    fitAll();
  }
  if (!pdfUnderlayNeedsRelink) {
    setStatus("DraftLite ready.");
  }
}

bindEvents();
setActiveRibbonTab("architecture");
applyAgentModeIfNeeded();
initializeTheme();
initializeView();
initializeBlockLibrary();

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
    const d = createDefaultDimensionEntity({
      id: createEntityId(),
      layerId: state.activeLayerId,
      p1: { x: mmToUnits(0), y: mmToUnits(0) },
      p2: { x: mmToUnits(1000), y: mmToUnits(0) },
      offsetPoint: { x: mmToUnits(0), y: mmToUnits(200) },
    });
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
  version: "0.2",
  execute(input) {
    const payload = input || {};
    if (Array.isArray(payload)) return this.executeMany(payload);
    if (payload.tool) return this.callTool(payload.tool, payload.arguments || {});
    if (Array.isArray(payload.toolCalls)) {
      const calls = payload.toolCalls.map((entry) => ({ tool: entry.tool, arguments: entry.arguments || {} }));
      return this.executeMany(calls, payload);
    }
    if (Array.isArray(payload.commands)) return this.executeMany(payload.commands, payload);
    const action = normalizeAgentAction(typeof payload.action === "string" ? payload.action.trim() : "");
    const readOnlyActions = ["validate", "summary", "entities", "state", "bounds", "groups", "selectedGroups", "describeTools", "listResources", "readResource", "copyInput", "copyResult", "copyState", "copyEntities", "copySummary", "copySelectedGroups"];
    if (action === "describeTools") return this.describeTools();
    if (action === "listResources") return this.listResources();
    if (action === "readResource") {
      const uri = typeof payload.uri === "string" && payload.uri.trim()
        ? payload.uri.trim()
        : (payload.payload && typeof payload.payload.uri === "string" ? payload.payload.uri.trim() : "");
      if (!uri) {
        return { ok: false, action, isError: true, error: { code: "MISSING_URI", message: "readResource requires payload.uri." } };
      }
      return this.readResource(uri);
    }
    if (action === "summary") return { ok: true, action, structuredContent: this.getSummary() };
    if (action === "entities") return { ok: true, action, structuredContent: this.getEntities() };
    if (action === "state") return { ok: true, action, structuredContent: this.getState() };
    if (action === "bounds") return { ok: true, action, structuredContent: this.getBounds() };
    if (action === "groups") return { ok: true, action, structuredContent: this.getGroups() };
    if (action === "selectedGroups") return { ok: true, action, structuredContent: this.getSelectedGroups() };
    if (action === "validate") return { ok: true, action, structuredContent: this.validateDrawing({ requireNonEmpty: true }) };
    if (action === "copyState") return this.copyState();
    if (action === "copyEntities") return this.copyEntities();
    if (action === "copySummary") return this.copySummary();
    if (action === "copySelectedGroups") return this.copySelectedGroups();
    if (action === "copyInput") return { ok: false, isError: true, error: { code: "USE_UI_COMMAND", message: "copyInput is UI-only command." } };
    if (action === "copyResult") return this.copyResult();
    const run = executeAgentCommand({ ...payload, action });
    const finalizeRunResult = (resolvedRun) => {
      const result = { ok: resolvedRun.ok, run: resolvedRun, action, validation: this.validateDrawing({ requireNonEmpty: false }), summary: this.getSummary(), boundsMm: this.getBounds() };
      if (!resolvedRun.ok) result.error = { code: "COMMAND_FAILED", message: resolvedRun.error || "Command failed." };
      if (readOnlyActions.includes(action)) return resolvedRun;
      return result;
    };
    return isPromiseLike(run) ? run.then(finalizeRunResult) : finalizeRunResult(run);
  },

  async executeMany(commands, options = {}) {
    const items = Array.isArray(commands) ? commands : [];
    const useTools = items.every((command) => command && typeof command === "object" && typeof command.tool === "string");
    const tx = Boolean(options.transaction);
    const stateSnapshot = tx ? snapshotState() : null;
    const historySnapshot = tx ? snapshotHistoryStacks() : null;
    const results = [];
    for (let index = 0; index < items.length; index += 1) {
      const command = items[index];
      const result = useTools
        ? this.callTool(command.tool, command.arguments || {})
        : this.execute(command);
      const resolvedResult = isPromiseLike(result) ? await result : result;
      results.push(resolvedResult);
      if (!resolvedResult.ok && tx) {
        state = normalizeDocument(stateSnapshot);
        restoreHistoryStacks(historySnapshot);
        clearTransientState();
        syncAfterStateChange(false);
        return {
          ok: false,
          rolledBack: true,
          transaction: true,
          count: items.length,
          results,
          error: {
            code: "TRANSACTION_ROLLED_BACK",
            message: `Command ${index + 1} failed: ${resolvedResult.error && resolvedResult.error.message ? resolvedResult.error.message : (resolvedResult.error || "Unknown error")}.`,
          },
        };
      }
    }
    return {
      ok: results.every((result) => result.ok),
      count: items.length,
      results,
      transaction: tx,
      rolledBack: false,
      validation: options.autoValidate ? this.validateDrawing({ requireNonEmpty: false }) : undefined,
      summary: this.getSummary(),
      boundsMm: this.getBounds(),
    };
  },
  callTool(name, args = {}) {
    const tool = normalizeAgentToolName(String(name || "").trim());
    const map = {
      create_rect: "rect",
      create_line: "line",
      create_text: "text",
      set_layer: "setLayer",
      clear_drawing: "clear",
      fit_all: "fitAll",
      validate_drawing: "validate",
      get_summary: "summary",
      get_entities: "entities",
      get_state: "state",
      get_bounds: "bounds",
      get_groups: "groups",
      get_selected_groups: "selectedGroups",
      export_selected_groups: "selectedGroups",
      read_resource: "readResource",
      copy_result: "copyResult",
      copy_state: "copyState",
      copy_entities: "copyEntities",
      copy_summary: "copySummary",
      copy_selected_groups: "copySelectedGroups",
      describe_tools: "describeTools",
      list_resources: "listResources",
    };
    const action = map[tool];
    if (!action) return { ok: false, tool, isError: true, error: { code: "UNKNOWN_TOOL", message: `Unknown tool: ${tool}` } };
    return this.execute({ ...args, action, tool });
  },
  describeTools() {
    return { ok: true, protocol: "draftlite-agent-tools", version: "0.2", tools: describeAgentTools() };
  },
  listResources() {
    return {
      ok: true,
      resources: [
        ...listAgentResources(),
        { uri: "draftlite://validation", name: "Current validation result", description: "Current drawing validation report." },
        { uri: "draftlite://tools", name: "Available tool definitions", description: "MCP-style DraftLite tool definitions." },
      ],
    };
  },
  readResource(uri) {
    const normalizedUri = typeof uri === "string" ? uri.trim() : "";
    if (!normalizedUri) {
      return { ok: false, uri: normalizedUri, isError: true, error: { code: "MISSING_URI", message: "readResource requires payload.uri." } };
    }
    if (normalizedUri === "draftlite://validation") {
      return { ok: true, uri: normalizedUri, content: this.validateDrawing({ requireNonEmpty: false }) };
    }
    if (normalizedUri === "draftlite://tools") {
      return { ok: true, uri: normalizedUri, content: this.describeTools() };
    }
    try {
      return { ok: true, uri: normalizedUri, content: readAgentResource(normalizedUri) };
    } catch (error) {
      return { ok: false, uri: normalizedUri, isError: true, error: { code: "UNKNOWN_RESOURCE", message: error && error.message ? error.message : `Unknown resource: ${normalizedUri}` } };
    }
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

  getGroups() {
    return state.groups.map((group) => getGroupSummary(group.id)).filter(Boolean);
  },

  getSelectedGroups() {
    return exportSelectedGroupsForAgent();
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
  copyResult() {
    return copyAgentText((agentResultOutput && agentResultOutput.textContent) || "", { action: "copyResult" });
  },
  copyState() {
    return copyAgentText(JSON.stringify(this.getState(), null, 2), { action: "copyState" });
  },
  copyEntities() {
    return copyAgentText(JSON.stringify(this.getEntities(), null, 2), { action: "copyEntities" });
  },
  copySummary() {
    return copyAgentText(JSON.stringify(this.getSummary(), null, 2), { action: "copySummary" });
  },
  copySelectedGroups() {
    return copyAgentText(JSON.stringify(this.getSelectedGroups(), null, 2), { action: "copySelectedGroups" });
  },
};

bindDebugBridge();
