"use strict";

(function registerSelectionTool(global) {
  function create(context) {
    function startDrag(worldPoint, mode = "move", options = {}) {
      const selected = context.getSelectedTransformableEntities();
      if (!selected.length) return false;
      const anchored = Boolean(options.snapAnchorPoint);
      const startPoint = context.roundWorldPoint(anchored ? options.snapAnchorPoint : worldPoint);
      context.getUiState().selectDragDraft = {
        mode, startPoint, currentPoint: startPoint,
        snapAnchorPoint: anchored ? context.roundWorldPoint(options.snapAnchorPoint) : null,
        pointerStartPoint: context.roundWorldPoint(anchored ? options.pointerStartPoint || worldPoint : worldPoint),
        entityIds: selected.map((entity) => entity.id), entities: context.deepClone(selected),
      };
      context.setStatus(`Drag ${mode} started at ${context.formatWorldPoint(startPoint)}.`);
      context.draw(); context.renderStatusPanel(); return true;
    }
    function updateDrag(worldPoint, snappedWorldPoint = worldPoint) {
      const active = context.getUiState().selectDragDraft; if (!active) return;
      if (active.snapAnchorPoint) {
        const free = context.roundWorldPoint({ x: active.snapAnchorPoint.x + snappedWorldPoint.x - active.pointerStartPoint.x, y: active.snapAnchorPoint.y + snappedWorldPoint.y - active.pointerStartPoint.y });
        active.currentPoint = context.getAnchorSnapPoint(free, active.entityIds) || free;
      } else active.currentPoint = context.resolveFreeDragPoint(worldPoint, active.startPoint);
      context.setStatus(`Drag ${active.mode} active.`); context.renderStatusPanel(); context.draw();
    }
    function applyDrag() {
      const active = context.getUiState().selectDragDraft; if (!active) return false;
      const offset = context.getTransformOffset(active);
      if (!offset.dx && !offset.dy) { context.cancelSelectDrag(`Drag ${active.mode} cancelled.`); return false; }
      context.pushUndoState(); const state = context.getState();
      if (active.mode === "copy") {
        const source = active.entities.filter(context.canSelectEntity);
        const { copied, idMap } = context.createCopiedEntities(source, offset);
        state.entities.push(...copied); context.duplicateGroupsForCopiedEntities(source, idMap); state.selectedEntityIds = copied.map((entity) => entity.id);
      } else { context.commitMoveEntityOffset(active.entityIds, offset); state.selectedEntityIds = []; }
      context.getUiState().selectDragDraft = null; context.syncAfterStateChange(); context.setStatus(active.mode === "copy" ? "Drag copy applied." : "Drag move applied."); return true;
    }
    function beginWindow(rawWorldPoint, append) {
      const screen = context.worldToScreen(rawWorldPoint);
      context.getUiState().selectionWindow = { append, startScreen: screen, currentScreen: screen, startWorld: rawWorldPoint, currentWorld: rawWorldPoint };
      context.draw();
    }
    function handleClick(rawWorldPoint, worldPoint, event) {
      const state = context.getState();
      const grip = context.getGripController();
      const rectangle = context.getRectangleController();
      if (grip.isInProgress()) { if (context.getUiState().gripEditDraft.numericInputBuffer) grip.applyNumeric(); else { context.getUiState().gripEditDraft.currentPoint = worldPoint; grip.apply(); } return true; }
      if (rectangle.isInProgress()) { if (context.getUiState().rectEdgeEditDraft.numericInputBuffer) rectangle.applyNumeric(); else { context.getUiState().rectEdgeEditDraft.currentPoint = worldPoint; rectangle.apply(); } return true; }
      const gripHit = grip.findAtPoint(worldPoint); if (gripHit) { grip.start(gripHit, worldPoint); return true; }
      const moveAnchor = context.findSelectedMoveAnchorAtPoint(context.roundWorldPoint(rawWorldPoint));
      if (moveAnchor) { startDrag(rawWorldPoint, event.altKey || event.ctrlKey ? "copy" : "move", { snapAnchorPoint: moveAnchor.point, pointerStartPoint: rawWorldPoint }); return true; }
      const borrowed = context.findBorrowedMoveBaseHandleAtPoint(context.roundWorldPoint(rawWorldPoint), { excludeEntityIds: state.selectedEntityIds });
      if (borrowed) {
        if (state.selectedEntityIds.length) { startDrag(rawWorldPoint, event.altKey || event.ctrlKey ? "copy" : "move", { snapAnchorPoint: borrowed.point, pointerStartPoint: rawWorldPoint }); return true; }
        if (context.startHandleDrivenSelectionAction(borrowed, rawWorldPoint, worldPoint, event)) return true;
      }
      const edge = rectangle.findAtPoint(context.roundWorldPoint(rawWorldPoint));
      if (edge && rectangle.start(context.getEntityById(edge.entityId), edge.edge, worldPoint)) return true;
      const selectedHit = state.selectedEntityIds.map(context.getEntityById).filter((entity) => entity && context.canSelectEntity(entity)).slice().reverse().find((entity) => context.hitTestEntity(entity, context.roundWorldPoint(rawWorldPoint)));
      if (selectedHit) { startDrag(rawWorldPoint, event.altKey || event.ctrlKey ? "copy" : "move"); return true; }
      beginWindow(rawWorldPoint, event.shiftKey); return true;
    }
    function updateWindow(screenPoint, worldPoint) {
      const selectionWindow = context.getUiState().selectionWindow;
      if (!selectionWindow) return false;
      selectionWindow.currentScreen = screenPoint;
      selectionWindow.currentWorld = worldPoint;
      return true;
    }
    function finishWindow(screenPoint, worldPoint) {
      const active = context.getUiState().selectionWindow;
      if (!active) return false;
      const selectionWindow = { ...active, currentScreen: screenPoint, currentWorld: worldPoint };
      const rect = context.getSelectionRect(selectionWindow);
      context.getUiState().selectionWindow = null;
      if (Math.hypot(rect.width, rect.height) < context.clickSelectThresholdPx) {
        context.selectEntityAtPoint(selectionWindow.currentWorld, selectionWindow.append);
      } else {
        context.selectEntitiesByWindow(selectionWindow);
      }
      context.finishMoveCopySelectionPhase();
      return true;
    }
    return Object.freeze({ beginWindow, updateWindow, finishWindow, startDrag, updateDrag, applyDrag, handleClick, isInProgress: () => Boolean(context.getUiState().selectionWindow) });
  }
  global.DraftLiteTools.register("selection", create);
}(window));
