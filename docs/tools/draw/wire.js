(function registerWireTool(global) {
  "use strict";
  global.DraftLiteTools.register("wire", (context) => {
    const { getUiState, canDrawOnActiveLayer, roundWorldPoint, formatWorldPoint, addWireEntity, draw, renderStatusPanel, setStatus, syncAfterStateChange, drawDraftWire } = context;
    function end(message) { const ui = getUiState(); ui.wireDraft = null; ui.activeTool = "select"; syncAfterStateChange(false); setStatus(message); }
    return Object.freeze({
      activate() { setStatus("Wire: pick start point."); },
      handleClick(point) {
        const ui = getUiState();
        if (!ui.wireDraft) {
          if (!canDrawOnActiveLayer()) return;
          ui.wireDraft = { start: roundWorldPoint(point), tension: 0.45 };
          draw(); renderStatusPanel(); setStatus(`Wire start set at ${formatWorldPoint(ui.wireDraft.start)}. Pick end point.`); return;
        }
        if (!addWireEntity(ui.wireDraft.start, point)) { draw(); renderStatusPanel(); return; }
        end("Wire created.");
      },
      drawPreview() { drawDraftWire(getUiState().wireDraft); },
      isInProgress() { return Boolean(getUiState().wireDraft); },
    });
  });
})(window);
