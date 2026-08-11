"use strict";

(function registerMoveCopyTools(global) {
  function createController(context, toolId) {
    function draft() { return context.getUiState().transformDraft; }
    function status(message) { context.setStatus(message); context.renderStatusPanel(); }
    function applyNumeric(previewOnly = false) {
      const current = draft();
      if (!current || !current.numericInputBuffer) return false;
      context.clearTransformPreviewTimer();
      const distanceMm = Number.parseInt(current.numericInputBuffer, 10);
      if (!Number.isFinite(distanceMm) || distanceMm <= 0) {
        if (!previewOnly) context.setStatus("Enter a positive move/copy distance in mm.");
        return false;
      }
      const dx = context.getUiState().hoverWorld.x - current.startPoint.x;
      const dy = context.getUiState().hoverWorld.y - current.startPoint.y;
      const length = Math.hypot(dx, dy);
      if (!length) {
        if (!previewOnly) context.setStatus("Move the pointer to indicate a move/copy direction before pressing Enter.");
        return false;
      }
      const units = context.mmToUnits(distanceMm);
      current.currentPoint = {
        x: context.roundToGridUnit(current.startPoint.x + (dx / length) * units),
        y: context.roundToGridUnit(current.startPoint.y + (dy / length) * units),
      };
      if (previewOnly) { context.draw(); context.renderStatusPanel(); return true; }
      return apply();
    }
    function schedulePreview() {
      const current = draft();
      context.clearTransformPreviewTimer();
      if (!current?.numericInputBuffer) return;
      context.getUiState().transformPreviewTimer = global.setTimeout(() => {
        context.getUiState().transformPreviewTimer = null;
        applyNumeric(true);
      }, 250);
    }
    function start(point, mode = toolId) {
      const entities = context.getSelectedTransformableEntities();
      if (!entities.length) { context.setStatus("Select at least one visible, unlocked entity before using Move or Copy."); return false; }
      context.getUiState().transformDraft = { mode, startPoint: point, currentPoint: point, numericInputBuffer: "", entityIds: entities.map((e) => e.id), entities: context.deepClone(entities) };
      status(`${context.capitalize(mode)} start set at ${context.formatWorldPoint(point)}.`);
      context.draw();
      return true;
    }
    function update(worldPoint, snappedPoint = worldPoint, options = {}) {
      const current = draft();
      if (!current || current.numericInputBuffer) return;
      current.currentPoint = options.snapped ? snappedPoint : context.getQuantizedDeltaPoint(current.startPoint, worldPoint);
      context.draw();
    }
    function apply() {
      const current = draft();
      if (!current) return false;
      context.clearTransformPreviewTimer();
      const offset = context.getTransformOffset(current);
      if (!offset.dx && !offset.dy) { context.draw(); context.renderStatusPanel(); context.setStatus(`${context.capitalize(current.mode)} distance must be greater than zero.`); return false; }
      context.pushUndoState();
      const state = context.getState();
      if (current.mode === "move") context.commitMoveEntityOffset(current.entityIds, offset);
      else {
        const sources = current.entities.filter(context.canSelectEntity);
        const result = context.createCopiedEntities(sources, offset);
        state.entities.push(...result.copied);
        context.duplicateGroupsForCopiedEntities(sources, result.idMap);
      }
      if (current.mode === "move") {
        context.getUiState().transformDraft = null; state.selectedEntityIds = []; context.getUiState().activeTool = "select";
        context.syncAfterStateChange(); context.setStatus("Move applied."); return true;
      }
      current.numericInputBuffer = ""; current.currentPoint = current.startPoint;
      context.syncAfterStateChange(); status("Copy created. Specify next point or press Enter/Escape to finish."); return true;
    }
    function handleKeyDown(event) {
      const current = draft();
      if (!current) return false;
      if (/^\d$/.test(event.key)) { event.preventDefault(); current.numericInputBuffer += event.key; schedulePreview(); status(`${context.capitalize(current.mode)} start set at ${context.formatWorldPoint(current.startPoint)}.`); context.draw(); return true; }
      if (event.key === "Backspace" && current.numericInputBuffer) { event.preventDefault(); current.numericInputBuffer = current.numericInputBuffer.slice(0, -1); context.clearTransformPreviewTimer(); current.currentPoint = current.numericInputBuffer ? current.currentPoint : context.getUiState().hoverWorld; if (current.numericInputBuffer) schedulePreview(); status(`${context.capitalize(current.mode)} start set at ${context.formatWorldPoint(current.startPoint)}.`); context.draw(); return true; }
      if (event.key === "Enter" && current.numericInputBuffer) { event.preventDefault(); applyNumeric(); return true; }
      return false;
    }
    return Object.freeze({
      activate() {
        const label = context.capitalize(toolId);
        context.setStatus(
          context.canStartTransformTool()
            ? `${label}: Specify base point.`
            : `${label}: Select objects.`
        );
      }, start, update, apply, applyNumeric, handleKeyDown,
      drawPreview() { if (draft()) context.drawTransformPreview(draft()); },
      isSelectionPhase() { return !draft() && !context.canStartTransformTool(); },
      getGuideText() { const selected = context.getState().selectedEntityIds.length; if (!selected) return `${toolId.toUpperCase()} 1/3 — Select objects`; if (!draft()) return `${toolId.toUpperCase()} 2/3 — Pick base point`; return toolId === "copy" ? "COPY 3/3 — Pick destination · Enter/Esc to finish" : "MOVE 3/3 — Pick destination"; },
      isInProgress() { return Boolean(draft()); },
    });
  }
  global.DraftLiteTools.register("move", (context) => createController(context, "move"));
  global.DraftLiteTools.register("copy", (context) => createController(context, "copy"));
}(window));
