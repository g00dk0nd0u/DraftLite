"use strict";

(function registerTrimTool(global) {
  function create(context) {
    function cancel(message = "Trim cancelled.") {
      const state = context.getState(); const ui = context.getUiState();
      state.selectedEntityIds = []; ui.trimDraft = null; ui.activeTool = "select";
      context.syncAfterStateChange(false); context.setStatus(message);
    }
    function handleClick(point) {
      const state = context.getState(); const ui = context.getUiState();
      const target = context.findLineTargetAtPoint(point);
      if (!target) { context.setStatus(ui.trimDraft ? "Trim: line only. Pick a visible, unlocked target line." : "Trim: line only. Pick a visible, unlocked boundary line."); return; }
      if (!ui.trimDraft) {
        ui.trimDraft = { boundaryEntityId: target.id }; state.selectedEntityIds = [target.id];
        context.syncAfterStateChange(false); context.setStatus("Trim: pick side of target line to remove"); return;
      }
      const boundary = context.getEntityById(ui.trimDraft.boundaryEntityId);
      if (boundary?.id === target.id) { context.setStatus("Trim: pick a different target line."); return; }
      if (!boundary || boundary.type !== "line" || !context.canSelectEntity(boundary) || !context.canSelectEntity(target)) {
        context.setStatus("Trim requires visible, unlocked lines."); return;
      }
      const geometry = context.trimLineAtBoundary(target, boundary, point);
      if (!geometry) { context.setStatus("Trim failed: finite segments must intersect away from the target endpoint. Pick side of target line to remove."); return; }
      context.pushUndoState(); target.p1 = geometry.p1; target.p2 = geometry.p2;
      state.selectedEntityIds = []; ui.trimDraft = null; ui.activeTool = "select";
      context.syncAfterStateChange(); context.setStatus("Trim applied.");
    }
    function drawPreview() {
      const ui = context.getUiState(); const boundary = context.getEntityById(ui.trimDraft?.boundaryEntityId);
      const target = context.findLineTargetAtPoint(ui.pointerWorld);
      const geometry = boundary && target && boundary.id !== target.id && context.canSelectEntity(boundary)
        ? context.trimLineAtBoundary(target, boundary, ui.pointerWorld) : null;
      if (geometry) context.drawPreviewLineEntity({ ...target, ...geometry });
    }
    return Object.freeze({
      activate() { context.setStatus("Trim: pick boundary line"); }, handleClick, cancel, drawPreview,
      getGuideText() { return context.getUiState().trimDraft?.boundaryEntityId ? "TRIM 2/2 — Pick side to remove" : "TRIM 1/2 — Pick cutting boundary"; },
      isInProgress() { return Boolean(context.getUiState().trimDraft); },
    });
  }
  global.DraftLiteTools.register("trim", create);
}(window));
