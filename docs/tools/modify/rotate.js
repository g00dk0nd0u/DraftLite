"use strict";
(function registerRotateTool(global) {
  global.DraftLiteTools.register("rotate", function create(context) {
    return Object.freeze({ execute(angleDeg = 90) {
      const state = context.getState(); const ui = context.getUiState();
      const entities = context.getSelectedTransformableEntities();
      if (!entities.length) { context.setStatus("Select at least one entity before using Rotate."); return false; }
      if (entities.some((entity) => entity.type === "blockInstance")) { context.setStatus("Block rotation is not supported in Block v1."); return false; }
      const bounds = entities.map(context.getRotateBoundsForEntity).filter(Boolean);
      if (!bounds.length) { context.setStatus("Rotate failed: selection bounds could not be calculated."); return false; }
      const center = { x: context.roundToUnit((Math.min(...bounds.map((b) => b.minX)) + Math.max(...bounds.map((b) => b.maxX))) / 2), y: context.roundToUnit((Math.min(...bounds.map((b) => b.minY)) + Math.max(...bounds.map((b) => b.maxY))) / 2) };
      const ids = new Set(entities.map((entity) => entity.id)); context.pushUndoState();
      state.entities = state.entities.map((entity) => ids.has(entity.id) && context.canSelectEntity(entity) ? context.rotateEntity(entity, center, angleDeg) : entity);
      ui.activeTool = "select"; context.syncAfterStateChange(); context.setStatus("Rotated selection 90° clockwise."); return true;
    } });
  });
}(window));
