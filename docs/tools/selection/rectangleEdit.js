"use strict";

(function registerRectangleEditTool(global) {
  function create(context) {
    const draft = () => context.getUiState().rectEdgeEditDraft;
    function updateStatus() {
      if (!draft()) return;
      context.setStatus(draft().numericInputBuffer ? context.getRectEdgeNumericStatus(draft()) : context.getRectEdgeEditActiveStatus(draft()));
      context.renderPropertiesPanel(); context.renderStatusPanel();
    }
    function findAtPoint(worldPoint) {
      const state = context.getState();
      return state.entities.filter((entity) => entity.type === "rect" && context.canSelectEntity(entity)).slice().reverse().map((entity) => {
        if (context.getRectMoveAnchorPoints(entity).some((item) => context.distanceScreenPx(worldPoint, item.point) <= state.settings.snapTolerancePx)) return null;
        const edge = context.getRectEdges(entity).find((item) => context.distancePointToSegmentScreenPx(worldPoint, item.p1, item.p2) <= state.settings.snapTolerancePx);
        return edge ? { entityId: entity.id, edge: edge.edge } : null;
      }).find(Boolean) || null;
    }
    function start(entity, edge, worldPoint) {
      if (!entity || entity.type !== "rect" || !context.canSelectEntity(entity)) return false;
      context.getState().selectedEntityIds = [entity.id]; context.syncAfterStateChange(false);
      context.getUiState().rectEdgeEditDraft = { entityId: entity.id, edge, originalRect: { x: entity.x, y: entity.y, width: entity.width, height: entity.height }, startPoint: worldPoint, currentPoint: worldPoint, numericInputBuffer: "" };
      updateStatus(); context.draw(); return true;
    }
    function apply() {
      const active = draft(); if (!active) return false;
      const entity = context.getEntityById(active.entityId);
      if (!entity || entity.type !== "rect" || !context.canSelectEntity(entity)) { context.getUiState().rectEdgeEditDraft = null; context.draw(); context.renderPropertiesPanel(); context.renderStatusPanel(); return false; }
      const next = context.getResizedRectFromAnchorPoint(active, active.currentPoint);
      if (["x", "y", "width", "height"].every((key) => next[key] === active.originalRect[key])) { cancel("Rectangle edge edit cancelled."); return false; }
      context.pushUndoState(); Object.assign(entity, next); context.clampRectCornerRadius(entity);
      context.getUiState().rectEdgeEditDraft = null; context.getState().selectedEntityIds = [];
      context.syncAfterStateChange(); context.setStatus("Rectangle resized."); return true;
    }
    function previewNumeric() { if (!draft()?.numericInputBuffer) return false; const point = context.getRectEdgeNumericPreviewPoint(); if (!point) return false; draft().currentPoint = point; updateStatus(); context.draw(); return true; }
    function applyNumeric() { if (!draft()?.numericInputBuffer) return false; const point = context.getRectEdgeNumericPreviewPoint(); if (!point) { context.setStatus("Enter a valid rectangle edge distance."); return false; } draft().currentPoint = point; return apply(); }
    function cancel(message = "Rectangle edge edit cancelled.") { context.getUiState().rectEdgeEditDraft = null; context.draw(); context.renderPropertiesPanel(); context.renderStatusPanel(); context.setStatus(message); }
    function handleKeyDown(event) {
      if (!draft()) return false;
      if (/^\d$/.test(event.key) || (event.key === "." && !draft().numericInputBuffer.includes("."))) { event.preventDefault(); draft().numericInputBuffer += event.key; previewNumeric(); updateStatus(); context.draw(); context.renderStatusPanel(); return true; }
      if (event.key === "Backspace" && draft().numericInputBuffer) { event.preventDefault(); draft().numericInputBuffer = draft().numericInputBuffer.slice(0, -1); if (!draft().numericInputBuffer) { draft().currentPoint = context.getUiState().hoverWorld; updateStatus(); } else { previewNumeric(); updateStatus(); } context.draw(); context.renderStatusPanel(); return true; }
      if (event.key === "Enter" && draft().numericInputBuffer) { event.preventDefault(); applyNumeric(); return true; }
      return false;
    }
    return Object.freeze({ findAtPoint, start, apply, applyNumeric, previewNumeric, updateStatus, handleKeyDown, cancel, isInProgress: () => Boolean(draft()) });
  }
  global.DraftLiteTools.register("rectangle-edit", create);
}(window));
