"use strict";

(function registerAlignTool(global) {
  function create(context) {
    function cancel(message = "Align cancelled.") {
      const state = context.getState();
      const uiState = context.getUiState();
      state.selectedEntityIds = [];
      uiState.alignDraft = null;
      uiState.activeTool = "select";
      context.syncAfterStateChange();
      context.setStatus(message);
    }

    function apply(referenceEntityId, targetEntityId, targetClickWorld) {
      const state = context.getState();
      const uiState = context.getUiState();
      const referenceLine = context.getEntityById(referenceEntityId);
      const targetLine = context.getEntityById(targetEntityId);
      if (!referenceLine || referenceLine.type !== "line" || !context.canSelectEntity(referenceLine)) {
        state.selectedEntityIds = [];
        uiState.alignDraft = null;
        uiState.activeTool = "select";
        context.syncAfterStateChange(false);
        context.setStatus("Align ended: reference line is unavailable.");
        return false;
      }
      if (!targetLine || targetLine.type !== "line" || !context.canSelectEntity(targetLine)
        || referenceLine.id === targetLine.id) {
        context.setStatus("Pick another visible, unlocked target line. Esc to finish.");
        return false;
      }
      const geometry = context.alignLineToReference(targetLine, referenceLine, targetClickWorld);
      if (!geometry) {
        context.setStatus("Pick another visible, unlocked target line. Esc to finish.");
        return false;
      }
      if (geometry.p1.x === targetLine.p1.x && geometry.p1.y === targetLine.p1.y
        && geometry.p2.x === targetLine.p2.x && geometry.p2.y === targetLine.p2.y) {
        context.setStatus("Align: target is already aligned. Pick another target line or Esc to finish.");
        return false;
      }
      context.pushUndoState();
      state.entities = state.entities.map((entity) => entity.id === targetLine.id
        ? { ...entity, p1: geometry.p1, p2: geometry.p2 }
        : entity);
      state.selectedEntityIds = [referenceEntityId];
      context.syncAfterStateChange();
      context.setStatus("Align applied. Pick another target line or Esc to finish.");
      return true;
    }

    function handleClick(worldPoint) {
      const state = context.getState();
      const uiState = context.getUiState();
      const referenceId = uiState.alignDraft?.referenceEntityId || null;
      if (referenceId) {
        const reference = context.getEntityById(referenceId);
        if (!reference || reference.type !== "line" || !context.canSelectEntity(reference)) {
          cancel("Align ended: reference line is unavailable.");
          return;
        }
      }
      const target = context.findAlignTargetAtPoint(worldPoint, referenceId);
      if (!target) {
        context.setStatus(uiState.alignDraft
          ? "Pick another visible, unlocked target line. Esc to finish."
          : "Align: pick reference line.");
        return;
      }
      if (!uiState.alignDraft) {
        uiState.alignDraft = { referenceEntityId: target.id, referenceClickWorld: context.deepClone(worldPoint) };
        state.selectedEntityIds = [target.id];
        context.syncAfterStateChange();
        context.setStatus("Align: reference selected. Pick target line. Esc to finish.");
        return;
      }
      apply(referenceId, target.id, worldPoint);
    }

    function drawPreview() {
      const state = context.getState();
      const uiState = context.getUiState();
      const draft = uiState.alignDraft;
      if (!draft?.referenceEntityId) return;
      const reference = context.getEntityById(draft.referenceEntityId);
      if (!reference || reference.type !== "line" || !context.canSelectEntity(reference)) {
        state.selectedEntityIds = [];
        uiState.alignDraft = null;
        uiState.activeTool = "select";
        context.setStatus("Align ended: reference line is unavailable.");
        return;
      }
      const target = context.findAlignTargetAtPoint(uiState.pointerWorld, reference.id);
      const geometry = target ? context.alignLineToReference(target, reference, uiState.pointerWorld) : null;
      if (geometry) context.drawPreviewLineEntity({ ...target, p1: geometry.p1, p2: geometry.p2 });
    }

    return Object.freeze({
      activate() { context.setStatus("Align: pick reference line."); },
      handleClick,
      cancel,
      drawPreview,
      getGuideText() {
        return context.getUiState().alignDraft?.referenceEntityId
          ? "ALIGN 2/2 — Pick target line · Esc to finish"
          : "ALIGN 1/2 — Pick reference line";
      },
      isInProgress() { return Boolean(context.getUiState().alignDraft); },
    });
  }
  global.DraftLiteTools.register("align", create);
}(window));
