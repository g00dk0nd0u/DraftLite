(function registerArcTool(global) {
  "use strict";
  global.DraftLiteTools.register("arc", (context) => {
    const { getUiState, canDrawOnActiveLayer, roundWorldPoint, roundToUnit, angleDegFromCenter, snapAngleTo90, formatWorldPoint, addArcEntity, setStatus, draw, drawDraftArc } = context;
    return Object.freeze({
      activate() { setStatus("Arc: pick center point."); },
      handleClick(point) { const ui = getUiState(); if (!ui.arcDraft) { if (!canDrawOnActiveLayer()) return; ui.arcDraft = { step: 1, center: roundWorldPoint(point) }; setStatus(`Arc center set at ${formatWorldPoint(ui.arcDraft.center)}. Pick start direction/radius.`); draw(); return; } if (!canDrawOnActiveLayer()) return; if (ui.arcDraft.step === 1) { ui.arcDraft.radiusPoint = roundWorldPoint(point); ui.arcDraft.radius = roundToUnit(Math.hypot(point.x - ui.arcDraft.center.x, point.y - ui.arcDraft.center.y)); if (ui.arcDraft.radius <= 0) { setStatus("Arc radius must be greater than zero."); return; } ui.arcDraft.startAngleDeg = snapAngleTo90(angleDegFromCenter(ui.arcDraft.center, point)); ui.arcDraft.step = 2; setStatus("Arc: pick end direction."); draw(); return; } addArcEntity(ui.arcDraft.center, ui.arcDraft.radiusPoint, point); ui.arcDraft = null; },
      drawPreview() { drawDraftArc(getUiState().arcDraft); },
      isInProgress() { return Boolean(getUiState().arcDraft); },
    });
  });
})(window);
