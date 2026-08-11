(function registerCircleTool(global) {
  "use strict";
  global.DraftLiteTools.register("circle", (context) => {
    const { getUiState, canDrawOnActiveLayer, roundWorldPoint, formatWorldPoint, addCircleEntity, setStatus, draw, drawDraftCircle } = context;
    return Object.freeze({
      activate() { setStatus("Circle: pick center point."); },
      handleClick(point) { const ui = getUiState(); if (!ui.circleDraft) { if (!canDrawOnActiveLayer()) return; ui.circleDraft = { center: roundWorldPoint(point) }; setStatus(`Circle center set at ${formatWorldPoint(ui.circleDraft.center)}. Pick radius point.`); draw(); return; } if (!canDrawOnActiveLayer()) return; addCircleEntity(ui.circleDraft.center, point); ui.circleDraft = null; },
      drawPreview() { const draft = getUiState().circleDraft; if (draft) drawDraftCircle(draft.center, getUiState().hoverWorld); },
      isInProgress() { return Boolean(getUiState().circleDraft); },
    });
  });
})(window);
