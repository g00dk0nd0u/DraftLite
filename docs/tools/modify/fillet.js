"use strict";

(function registerFilletTool(global) {
  function create(context) {
    function activate() {
      context.getUiState().filletDraft = { radiusUnits: 0, radiusConfirmed: false, numericInputBuffer: "", firstEntityId: null, firstClickWorld: null };
      context.setStatus("Fillet radius: 0 mm (Join). Type radius and Enter, or pick first line.");
    }
    function cancel(message = "Fillet cancelled.") {
      const state = context.getState(); const ui = context.getUiState();
      state.selectedEntityIds = []; ui.filletDraft = null; ui.dimensionDraft = null; ui.activeTool = "select";
      context.syncAfterStateChange(); context.setStatus(message);
    }
    function handleKeyDown(event) {
      const draft = context.getUiState().filletDraft;
      if (!draft || draft.firstEntityId) return false;
      if (/^\d$/.test(event.key) || (event.key === "." && !draft.numericInputBuffer.includes("."))) {
        event.preventDefault(); draft.numericInputBuffer += event.key;
        context.setStatus(`Fillet radius: ${draft.numericInputBuffer} mm. Press Enter to confirm.`); context.draw(); context.renderStatusPanel(); return true;
      }
      if (event.key === "Backspace") {
        event.preventDefault(); draft.numericInputBuffer = draft.numericInputBuffer.slice(0, -1);
        context.setStatus(draft.numericInputBuffer ? `Fillet radius: ${draft.numericInputBuffer} mm. Press Enter to confirm.`
          : `Fillet radius: ${Number(context.unitsToMm(draft.radiusUnits).toFixed(1))} mm${draft.radiusUnits === 0 ? " (Join)" : ""}. Type radius and Enter, or pick first line.`);
        context.draw(); context.renderStatusPanel(); return true;
      }
      if (event.key !== "Enter") return false;
      event.preventDefault(); const mm = Number(draft.numericInputBuffer); const units = context.mmToUnits(mm);
      if (!draft.numericInputBuffer || !Number.isFinite(mm) || mm < 0 || !Number.isInteger(units) || units < 0 || (mm > 0 && units === 0)) {
        context.setStatus("Fillet: enter a valid radius of 0 mm or greater."); return true;
      }
      draft.radiusUnits = units; draft.numericInputBuffer = ""; draft.radiusConfirmed = true;
      context.setStatus(`Fillet radius: ${Number(context.unitsToMm(units).toFixed(1))} mm${units === 0 ? " (Join)" : ""}. Pick first line.`);
      context.draw(); context.renderStatusPanel(); return true;
    }
    function handleClick(point) {
      const state = context.getState(); const ui = context.getUiState(); const draft = ui.filletDraft;
      if (!draft) return;
      if (!draft.firstEntityId && draft.numericInputBuffer) { context.setStatus("Fillet: press Enter to confirm radius."); return; }
      const second = context.findLineTargetAtPoint(point);
      if (!second) { context.setStatus(draft.firstEntityId ? "Pick a visible, unlocked second line." : "Pick a visible, unlocked first line."); return; }
      if (!draft.firstEntityId) {
        draft.firstEntityId = second.id; draft.firstClickWorld = context.deepClone(point); state.selectedEntityIds = [second.id];
        context.syncAfterStateChange(); context.setStatus("Fillet: first line selected. Click the side to keep on the second line."); return;
      }
      if (draft.firstEntityId === second.id) { context.setStatus("Fillet: pick a different second line."); return; }
      const first = context.getEntityById(draft.firstEntityId);
      if (!first || !context.canSelectEntity(first) || !context.canSelectEntity(second)) { context.setStatus("Fillet requires visible, unlocked lines."); return; }
      let firstNext; let secondNext; let arc = null;
      if (draft.radiusUnits > 0) {
        const result = context.filletLinesWithRadius(first, draft.firstClickWorld, second, point, draft.radiusUnits);
        if (!result) { context.setStatus("Fillet failed: radius is too large or the selected sides cannot form an arc."); return; }
        firstNext = result.firstLine; secondNext = result.secondLine; arc = result.arc;
      } else {
        const intersection = context.getInfiniteLineIntersection(first, second);
        if (!intersection) { context.setStatus("Fillet failed: lines are parallel or nearly parallel."); return; }
        const endpoint = (line, click) => {
          const cv = { x: click.x - intersection.x, y: click.y - intersection.y };
          return cv.x * (line.p1.x - intersection.x) + cv.y * (line.p1.y - intersection.y)
            >= cv.x * (line.p2.x - intersection.x) + cv.y * (line.p2.y - intersection.y) ? "p2" : "p1";
        };
        const a = endpoint(first, draft.firstClickWorld); const b = endpoint(second, point);
        firstNext = { p1: a === "p1" ? intersection : first.p1, p2: a === "p2" ? intersection : first.p2 };
        secondNext = { p1: b === "p1" ? intersection : second.p1, p2: b === "p2" ? intersection : second.p2 };
      }
      context.pushUndoState(); first.p1 = firstNext.p1; first.p2 = firstNext.p2; second.p1 = secondNext.p1; second.p2 = secondNext.p2;
      if (arc) state.entities.push({ id: context.createEntityId(), type: "arc", layerId: first.layerId, ...arc });
      state.selectedEntityIds = []; ui.filletDraft = null; ui.dimensionDraft = null; ui.activeTool = "select";
      context.syncAfterStateChange(); context.setStatus(arc ? `Fillet applied: ${Number(context.unitsToMm(draft.radiusUnits).toFixed(1))} mm.` : "Fillet applied. Clicked sides were kept.");
    }
    function drawPreview() {
      const ui = context.getUiState(); const draft = ui.filletDraft;
      if (!draft?.firstEntityId || draft.radiusUnits <= 0) return;
      const first = context.getEntityById(draft.firstEntityId); const second = context.findLineTargetAtPoint(ui.pointerWorld);
      const result = first && second && first.id !== second.id ? context.filletLinesWithRadius(first, draft.firstClickWorld, second, ui.pointerWorld, draft.radiusUnits) : null;
      if (result) { context.drawPreviewLineEntity({ ...first, ...result.firstLine }); context.drawPreviewLineEntity({ ...second, ...result.secondLine }); context.drawPreviewArcEntity({ ...result.arc, layerId: first.layerId }); }
    }
    return Object.freeze({ activate, handleClick, handleKeyDown, cancel, drawPreview,
      getGuideText() { const d = context.getUiState().filletDraft; if (d?.numericInputBuffer) return "FILLET — Press Enter to confirm radius"; if (d?.firstEntityId) return "FILLET 2/2 — Pick side to keep"; return d?.radiusConfirmed ? "FILLET 1/2 — Pick first line" : "FILLET 1/2 — Pick first line · Type radius + Enter"; },
      isInProgress() { return Boolean(context.getUiState().filletDraft); },
    });
  }
  global.DraftLiteTools.register("fillet", create);
}(window));
