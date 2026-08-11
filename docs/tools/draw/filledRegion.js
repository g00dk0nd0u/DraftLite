(function registerFilledRegionTool(global) {
  "use strict";
  global.DraftLiteTools.register("filled-region", (context) => {
    const { getUiState, canDrawOnActiveLayer, roundWorldPoint, createFilledRegionEntity, setStatus, draw, drawDraftFilledRegion } = context;
    function finish() { const ui = getUiState(); if (!ui.filledRegionDraft || ui.filledRegionDraft.points.length < 3) { setStatus("Filled Region requires at least 3 points."); return false; } if (!canDrawOnActiveLayer()) return false; const points = ui.filledRegionDraft.points; ui.filledRegionDraft = null; return Boolean(createFilledRegionEntity(points)); }
    return Object.freeze({
      activate() { setStatus("Filled Region: pick first point."); },
      handleClick(point, event) { if (!canDrawOnActiveLayer()) return; const ui = getUiState(); const rounded = roundWorldPoint(point); if (!ui.filledRegionDraft) { ui.filledRegionDraft = { points: [rounded] }; setStatus("Filled Region: pick next point. Enter or double-click to close."); draw(); return; } const last = ui.filledRegionDraft.points[ui.filledRegionDraft.points.length - 1]; if (!last || last.x !== rounded.x || last.y !== rounded.y) ui.filledRegionDraft.points.push(rounded); if (event.detail >= 2 && ui.filledRegionDraft.points.length >= 3) { finish(); return; } draw(); },
      handleKeyDown(event) { if (!getUiState().filledRegionDraft || event.key !== "Enter") return false; event.preventDefault(); finish(); return true; },
      finish,
      drawPreview() { drawDraftFilledRegion(getUiState().filledRegionDraft); },
      isInProgress() { return Boolean(getUiState().filledRegionDraft); },
    });
  });
})(window);
