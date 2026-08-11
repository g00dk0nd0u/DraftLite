"use strict";
(function registerMirrorTool(global) {
  global.DraftLiteTools.register("mirror", function create(context) {
    function start(point) { const entities = context.getSelectedTransformableEntities(); if (!entities.length) { context.setStatus("Mirror: Select objects first."); return false; } const ui = context.getUiState(); ui.mirrorDraft = { firstPoint: context.roundWorldPoint(point) }; context.setStatus(`Mirror axis first point set at ${context.formatWorldPoint(ui.mirrorDraft.firstPoint)}. Pick second point.`); context.draw(); return true; }
    function apply(point) {
      const state = context.getState(); const ui = context.getUiState(); if (!ui.mirrorDraft?.firstPoint) return false;
      const sources = context.getSelectedTransformableEntities(); const first = ui.mirrorDraft.firstPoint; const second = context.getMirrorAxisSecondPoint(point);
      if (first.x === second.x && first.y === second.y) { context.setStatus("Mirror axis needs two distinct points."); return false; }
      const idMap = new Map(); const copies = []; let skipped = 0;
      sources.forEach((source) => { const mirrored = context.canSelectEntity(source) && context.mirrorEntity(context.deepClone(source), first, second); if (!mirrored) { skipped += 1; return; } const id = context.createEntityId(); idMap.set(source.id, id); copies.push({ ...mirrored, id }); });
      if (!copies.length) { ui.mirrorDraft = null; ui.activeTool = "select"; context.syncAfterStateChange(false); context.setStatus("Mirror: no supported entities to copy."); return false; }
      context.pushUndoState(); state.entities.push(...copies); context.duplicateGroupsForCopiedEntities(sources, idMap); state.selectedEntityIds = copies.map((e) => e.id); ui.mirrorDraft = null; ui.activeTool = "select"; context.syncAfterStateChange(); context.setStatus(skipped ? `Mirror copied ${copies.length} object(s). ${skipped} skipped.` : `Mirror copied ${copies.length} object(s).`); return true;
    }
    return Object.freeze({ activate() { context.setStatus(context.getSelectedTransformableEntities().length ? "Mirror: pick axis first point." : "Mirror: Select objects first."); }, handleClick(point) { return context.getUiState().mirrorDraft?.firstPoint ? apply(point) : start(point); }, cancel(message = "Mirror cancelled.") { const ui = context.getUiState(); ui.mirrorDraft = null; ui.activeTool = "select"; context.syncAfterStateChange(false); context.setStatus(message); }, drawPreview() { const ui = context.getUiState(); if (ui.mirrorDraft?.firstPoint) context.drawMirrorAxisDraft(ui.mirrorDraft.firstPoint, context.getMirrorAxisSecondPoint(ui.pointerWorld)); }, getGuideText() { if (!context.getState().selectedEntityIds.length) return "MIRROR — Select objects first"; return context.getUiState().mirrorDraft?.firstPoint ? "MIRROR 2/2 — Pick axis end" : "MIRROR 1/2 — Pick axis start"; }, isInProgress() { return Boolean(context.getUiState().mirrorDraft); } });
  });
}(window));
