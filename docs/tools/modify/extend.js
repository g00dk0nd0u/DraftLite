"use strict";

(function registerExtendTool(global) {
  function create(context) {
    function cancel(message = "Extend cancelled.") {
      const state = context.getState(); const ui = context.getUiState();
      state.selectedEntityIds = []; ui.extendDraft = null; ui.activeTool = "select";
      context.syncAfterStateChange(); context.setStatus(message);
    }
    function handleClick(point) {
      const state = context.getState(); const ui = context.getUiState();
      const target = context.findSelectableEntityAtPoint(point);
      if (!target) { context.setStatus(ui.extendDraft ? "Extend: pick target line" : "Extend: pick boundary line"); return; }
      if (target.type !== "line") { context.setStatus("Extend: line only. Pick a line."); return; }
      if (!ui.extendDraft) {
        ui.extendDraft = { boundaryEntityId: target.id }; state.selectedEntityIds = [target.id];
        context.syncAfterStateChange(); context.setStatus("Extend: pick target line"); return;
      }
      const boundary = context.getEntityById(ui.extendDraft.boundaryEntityId);
      if (boundary?.id === target.id) { context.setStatus("Extend: pick a different target line."); return; }
      if (!boundary || boundary.type !== "line" || !context.canSelectEntity(boundary) || !context.canSelectEntity(target)) {
        context.setStatus("Extend requires visible, unlocked lines."); return;
      }
      const intersection = context.getInfiniteLineIntersection(boundary, target);
      if (!intersection) { context.setStatus("Extend failed: lines are parallel or nearly parallel. Pick target line."); return; }
      const p1Projection = context.projectPointToInfiniteLineRaw(target.p1, boundary);
      const p2Projection = context.projectPointToInfiniteLineRaw(target.p2, boundary);
      const p1BoundaryDistance = p1Projection ? Math.hypot(target.p1.x - p1Projection.x, target.p1.y - p1Projection.y) : Infinity;
      const p2BoundaryDistance = p2Projection ? Math.hypot(target.p2.x - p2Projection.x, target.p2.y - p2Projection.y) : Infinity;
      const endpoint = p1BoundaryDistance !== p2BoundaryDistance
        ? (p1BoundaryDistance <= p2BoundaryDistance ? "p1" : "p2")
        : (Math.hypot(target.p1.x - intersection.x, target.p1.y - intersection.y)
          <= Math.hypot(target.p2.x - intersection.x, target.p2.y - intersection.y) ? "p1" : "p2");
      const next = { ...target, p1: endpoint === "p1" ? intersection : target.p1, p2: endpoint === "p2" ? intersection : target.p2 };
      context.pushUndoState();
      state.entities = state.entities.map((entity) => entity.id === next.id ? next : entity);
      state.selectedEntityIds = []; ui.extendDraft = null; ui.activeTool = "select";
      context.syncAfterStateChange(); context.setStatus("Extend applied.");
    }
    return Object.freeze({
      activate() { context.setStatus("Extend: pick boundary line"); }, handleClick, cancel,
      getGuideText() { return context.getUiState().extendDraft?.boundaryEntityId ? "EXTEND 2/2 — Pick line to extend" : "EXTEND 1/2 — Pick boundary line"; },
      isInProgress() { return Boolean(context.getUiState().extendDraft); },
    });
  }
  global.DraftLiteTools.register("extend", create);
}(window));
