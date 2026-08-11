(function registerRectangleTool(global) {
  "use strict";
  global.DraftLiteTools.register("rectangle", (context) => {
    const { getUiState, getState, getLayerById, formatWorldPoint, addRectangleEntity, draw, renderStatusPanel, setStatus, syncAfterStateChange, drawDraftRectangle } = context;
    return Object.freeze({
      activate() { setStatus("Rectangle tool active."); },
      handleClick(point) {
        const ui = getUiState();
        if (!ui.rectangleDraft) {
          const layer = getLayerById(getState().activeLayerId);
          if (!layer || !layer.visible || layer.locked) { setStatus("Choose a visible, unlocked active layer before drawing."); return; }
          ui.rectangleDraft = { start: point }; draw(); renderStatusPanel();
          setStatus(`Rectangle first corner set at ${formatWorldPoint(point)}. Pick opposite corner.`); return;
        }
        if (!addRectangleEntity(ui.rectangleDraft.start, point)) return;
        ui.rectangleDraft = null; ui.activeTool = "select"; syncAfterStateChange(false); setStatus("Rectangle object created.");
      },
      drawPreview() { const draft = getUiState().rectangleDraft; if (draft) drawDraftRectangle(draft.start, getUiState().hoverWorld); },
      isInProgress() { return Boolean(getUiState().rectangleDraft); },
    });
  });
})(window);
