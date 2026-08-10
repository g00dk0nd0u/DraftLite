"use strict";

(function registerOffsetTool(global) {
  function create(context) {
    function cancel(message = "Offset cancelled.") {
      const state = context.getState(); const ui = context.getUiState();
      state.selectedEntityIds = []; ui.offsetDraft = null; ui.activeTool = "select";
      context.syncAfterStateChange(false); context.setStatus(message);
    }
    function activate() {
      context.getUiState().offsetDraft = { numericInputBuffer: "", distanceUnits: null, sourceEntityId: null };
      context.setStatus("Offset: enter distance in mm");
    }
    function handleKeyDown(event) {
      const draft = context.getUiState().offsetDraft;
      if (!draft || draft.distanceUnits !== null) return false;
      if (/^\d$/.test(event.key) || (event.key === "." && !draft.numericInputBuffer.includes("."))) {
        event.preventDefault(); draft.numericInputBuffer += event.key;
        context.setStatus(`Offset: enter distance in mm (${draft.numericInputBuffer})`); context.draw(); context.renderStatusPanel(); return true;
      }
      if (event.key === "Backspace") {
        event.preventDefault(); draft.numericInputBuffer = draft.numericInputBuffer.slice(0, -1);
        context.setStatus(`Offset: enter distance in mm${draft.numericInputBuffer ? ` (${draft.numericInputBuffer})` : ""}`);
        context.draw(); context.renderStatusPanel(); return true;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const mm = Number.parseFloat(draft.numericInputBuffer); const units = context.mmToUnits(mm);
        if (!draft.numericInputBuffer || !Number.isFinite(mm) || mm <= 0 || units <= 0) context.setStatus("Offset: enter a positive distance in mm.");
        else { draft.distanceUnits = units; context.setStatus("Offset: pick source line"); context.draw(); context.renderStatusPanel(); }
        return true;
      }
      return false;
    }
    function handleClick(point) {
      const state = context.getState(); const ui = context.getUiState(); const draft = ui.offsetDraft;
      if (!draft || draft.distanceUnits === null) { context.setStatus("Offset: enter distance in mm"); return; }
      if (!draft.sourceEntityId) {
        const target = context.findLineTargetAtPoint(point);
        if (!target) { context.setStatus("Offset: line only. Pick a visible, unlocked line."); return; }
        draft.sourceEntityId = target.id; state.selectedEntityIds = [target.id];
        context.syncAfterStateChange(false); context.setStatus("Offset: pick side"); return;
      }
      const source = context.getEntityById(draft.sourceEntityId);
      const geometry = source && context.canSelectEntity(source) ? context.offsetLineTowardPoint(source, draft.distanceUnits, point) : null;
      if (!geometry) { context.setStatus("Offset: pick a side away from the source line."); return; }
      context.pushUndoState(); state.entities.push({ ...source, id: context.createEntityId(), p1: geometry.p1, p2: geometry.p2 });
      const mm = Number(context.unitsToMm(draft.distanceUnits).toFixed(1));
      state.selectedEntityIds = []; ui.offsetDraft = null; ui.activeTool = "select";
      context.syncAfterStateChange(); context.setStatus(`Offset applied: ${mm} mm.`);
    }
    function drawPreview() {
      const ui = context.getUiState(); const draft = ui.offsetDraft;
      const source = context.getEntityById(draft?.sourceEntityId);
      const geometry = source && context.canSelectEntity(source) ? context.offsetLineTowardPoint(source, draft.distanceUnits, ui.pointerWorld) : null;
      if (geometry) context.drawPreviewLineEntity({ ...source, ...geometry });
    }
    return Object.freeze({ activate, handleClick, handleKeyDown, cancel, drawPreview,
      getGuideText() { const d = context.getUiState().offsetDraft; return d?.sourceEntityId ? "OFFSET 3/3 — Pick offset side" : d && d.distanceUnits !== null ? "OFFSET 2/3 — Pick source line" : "OFFSET 1/3 — Enter distance · Enter"; },
      isInProgress() { return Boolean(context.getUiState().offsetDraft); },
    });
  }
  global.DraftLiteTools.register("offset", create);
}(window));
