(function registerLineTool(global) {
  "use strict";

  global.DraftLiteTools.register("line", (context) => {
    const {
      getUiState, getState, getLayerById, setStatus, draw, renderStatusPanel,
      formatWorldPoint, addLineEntity, mmToUnits, roundToGridUnit,
      clearLinePreviewTimer, setLinePreviewTimer, drawDraftLine,
      syncAfterStateChange,
    } = context;

    function updateStatus(prefix) {
      const draft = getUiState().lineDraft;
      if (!draft) return;
      const suffix = draft.numericInputBuffer ? ` Length: ${draft.numericInputBuffer} mm` : " Length: -";
      setStatus(`${prefix}${suffix}`);
      renderStatusPanel();
    }

    function begin(start, prefix = `Line start set at ${formatWorldPoint(start)}.`) {
      clearLinePreviewTimer();
      getUiState().lineDraft = { start, numericInputBuffer: "", previewPoint: null };
      updateStatus(prefix);
      draw();
      renderStatusPanel();
    }

    function end(message = "Line command ended.") {
      clearLinePreviewTimer();
      const uiState = getUiState();
      uiState.lineDraft = null;
      uiState.activeTool = "select";
      syncAfterStateChange(false);
      setStatus(message);
    }

    function applyPreview() {
      const uiState = getUiState();
      const draft = uiState.lineDraft;
      if (!draft || !draft.numericInputBuffer) return false;
      const lengthMm = Number.parseInt(draft.numericInputBuffer, 10);
      const dx = uiState.hoverWorld.x - draft.start.x;
      const dy = uiState.hoverWorld.y - draft.start.y;
      const directionLength = Math.hypot(dx, dy);
      if (!Number.isFinite(lengthMm) || lengthMm <= 0 || directionLength === 0) return false;
      const lengthUnits = mmToUnits(lengthMm);
      if (lengthUnits <= 0) return false;
      draft.previewPoint = {
        x: roundToGridUnit(draft.start.x + (dx / directionLength) * lengthUnits),
        y: roundToGridUnit(draft.start.y + (dy / directionLength) * lengthUnits),
      };
      draw();
      renderStatusPanel();
      return true;
    }

    function schedulePreview() {
      const draft = getUiState().lineDraft;
      if (!draft) return;
      clearLinePreviewTimer();
      if (draft.numericInputBuffer) setLinePreviewTimer(applyPreview, 250);
    }

    function applyNumeric() {
      const uiState = getUiState();
      const draft = uiState.lineDraft;
      if (!draft) return false;
      clearLinePreviewTimer();
      let target = draft.previewPoint;
      if (!target) {
        const lengthMm = Number.parseInt(draft.numericInputBuffer, 10);
        if (!draft.numericInputBuffer || !Number.isFinite(lengthMm) || lengthMm <= 0) {
          setStatus("Enter a positive line length in mm.");
          return false;
        }
        const dx = uiState.hoverWorld.x - draft.start.x;
        const dy = uiState.hoverWorld.y - draft.start.y;
        const directionLength = Math.hypot(dx, dy);
        if (directionLength === 0) {
          setStatus("Move the pointer to indicate a line direction before pressing Enter.");
          return false;
        }
        const lengthUnits = mmToUnits(lengthMm);
        if (lengthUnits <= 0) {
          setStatus("Line length must be greater than zero.");
          return false;
        }
        target = {
          x: roundToGridUnit(draft.start.x + (dx / directionLength) * lengthUnits),
          y: roundToGridUnit(draft.start.y + (dy / directionLength) * lengthUnits),
        };
      }
      const entity = addLineEntity(draft.start, target);
      if (!entity) return false;
      begin(entity.p2, `Line segment created. Next point starts at ${formatWorldPoint(entity.p2)}.`);
      return true;
    }

    return Object.freeze({
      activate() { setStatus("Line tool active."); },
      handleClick(point) {
        const uiState = getUiState();
        if (!uiState.lineDraft) {
          const layer = getLayerById(getState().activeLayerId);
          if (!layer || !layer.visible || layer.locked) {
            setStatus("Choose a visible, unlocked active layer before drawing.");
            return;
          }
          begin(point);
          return;
        }
        if (uiState.lineDraft.numericInputBuffer) {
          applyNumeric();
          return;
        }
        const entity = addLineEntity(uiState.lineDraft.start, point);
        if (entity) begin(entity.p2, `Line segment created. Next point starts at ${formatWorldPoint(entity.p2)}.`);
      },
      handleKeyDown(event) {
        const draft = getUiState().lineDraft;
        if (!draft) return false;
        if (/^\d$/.test(event.key)) {
          event.preventDefault();
          draft.numericInputBuffer += event.key;
          schedulePreview();
          updateStatus(`Line start set at ${formatWorldPoint(draft.start)}.`);
          draw();
          return true;
        }
        if (event.key === "Backspace" && draft.numericInputBuffer) {
          event.preventDefault();
          draft.numericInputBuffer = draft.numericInputBuffer.slice(0, -1);
          clearLinePreviewTimer();
          if (!draft.numericInputBuffer) draft.previewPoint = null;
          else schedulePreview();
          updateStatus(`Line start set at ${formatWorldPoint(draft.start)}.`);
          draw();
          return true;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          if (draft.numericInputBuffer) applyNumeric();
          else end();
          return true;
        }
        return false;
      },
      drawPreview() {
        const draft = getUiState().lineDraft;
        if (draft) drawDraftLine(draft.start, draft.previewPoint || getUiState().hoverWorld);
      },
      isInProgress() { return Boolean(getUiState().lineDraft); },
    });
  });
})(window);
