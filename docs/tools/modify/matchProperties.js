"use strict";
(function registerMatchPropertiesTool(global) {
  global.DraftLiteTools.register("match-properties", function create(context) {
    return Object.freeze({ activate() { context.setStatus("Select source object."); }, handleClick(point) {
      const state = context.getState(); const ui = context.getUiState(); const hit = context.getTopmostSelectableEntityAtPoint(point);
      if (!hit) { context.setStatus("No object selected."); return; }
      if (!context.supportsMatchedProperties(hit)) { context.setStatus("Target does not support matched properties."); return; }
      if (!ui.matchPropertiesSourceId) { ui.matchPropertiesSourceId = hit.id; state.selectedEntityIds = [hit.id]; context.syncAfterStateChange(); context.setStatus("Select target object."); return; }
      const source = context.getEntityById(ui.matchPropertiesSourceId);
      if (!source || !context.supportsMatchedProperties(source)) { ui.matchPropertiesSourceId = null; state.selectedEntityIds = []; context.syncAfterStateChange(); context.setStatus("Select source object."); return; }
      const patch = context.createMatchedStylePatch(source, hit); if (!patch) { context.setStatus("Target does not support matched properties."); return; }
      context.pushUndoState(); context.applyMatchedStylePatch(hit, patch); state.selectedEntityIds = [hit.id]; context.syncAfterStateChange(); context.setStatus("Properties matched.");
    }, cancel(message = "Match Properties cancelled.") { const ui = context.getUiState(); ui.matchPropertiesSourceId = null; ui.activeTool = "select"; context.syncAfterStateChange(false); context.setStatus(message); }, getGuideText() { return context.getUiState().matchPropertiesSourceId ? "MATCH PROPERTIES — Select target object" : "MATCH PROPERTIES — Select source object"; }, isInProgress() { return Boolean(context.getUiState().matchPropertiesSourceId); } });
  });
}(window));
