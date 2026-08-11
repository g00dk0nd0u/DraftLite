(function registerTextTool(global) {
  "use strict";

  global.DraftLiteTools.register("text", (context) => Object.freeze({
    handleClick(worldPoint) {
      const state = context.getState();
      const activeLayer = context.getLayerById(state.activeLayerId);
      if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
        context.setStatus("Choose a visible, unlocked active layer before drawing.");
        return;
      }
      const value = context.promptTextContent();
      if (value === null) {
        context.setStatus("Text placement cancelled.");
        return;
      }
      const text = value.trim();
      if (!text) {
        context.setStatus("Empty text was not created.");
        return;
      }
      context.pushUndoState();
      const entity = {
        id: context.createEntityId(),
        type: "text",
        layerId: state.activeLayerId,
        x: context.roundToUnit(worldPoint.x),
        y: context.roundToUnit(worldPoint.y),
        text,
        height: context.mmToUnits(100),
        rotation: 0,
        align: "left",
        textAnchor: "center",
        color: "",
      };
      state.entities.push(entity);
      state.selectedEntityIds = [entity.id];
      context.syncAfterStateChange();
      context.setStatus("Text created.");
    },
  }));
})(window);
