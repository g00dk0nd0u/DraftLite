(function registerDimensionTool(global) {
  "use strict";

  global.DraftLiteTools.register("dimension", (context) => {
    const ui = () => context.getUiState();
    const state = () => context.getState();

    function handleClick(worldPoint) {
      const documentState = state();
      const activeLayer = context.getLayerById(documentState.activeLayerId);
      if (!activeLayer || !activeLayer.visible || activeLayer.locked) {
        context.setStatus("Choose a visible, unlocked active layer before drawing.");
        return;
      }
      const draft = ui().dimensionDraft;
      if (!draft) {
        ui().dimensionDraft = { step: 1, p1: context.roundWorldPoint(worldPoint) };
        context.setStatus("Aligned Dimension: pick second point");
        context.draw();
        return;
      }
      if (draft.step === 1) {
        draft.p2 = context.roundWorldPoint(worldPoint);
        draft.step = 2;
        context.setStatus("Aligned Dimension: place dimension line");
        context.draw();
        return;
      }
      if (draft.mode === "chain") {
        const p1 = context.roundWorldPoint(draft.chainStartPoint);
        const p2 = context.roundWorldPoint(worldPoint);
        const entity = context.createDimensionWithPreservedOffset(
          context.createDefaultDimensionEntity({ id: context.createEntityId(), layerId: documentState.activeLayerId, p1, p2, offsetPoint: p2 }),
          "p2", p2, draft.signedOffset
        );
        if (!entity) {
          context.setStatus("Dimension length must be greater than zero.");
          return;
        }
        context.pushUndoState();
        documentState.entities.push(entity);
        documentState.selectedEntityIds = [entity.id];
        draft.chainStartPoint = context.roundWorldPoint(entity.p2);
        context.syncAfterStateChange();
        context.setStatus("Chain dimension created. Pick next point or press Esc to finish.");
        return;
      }
      context.pushUndoState();
      const entity = context.createDefaultDimensionEntity({
        id: context.createEntityId(), layerId: documentState.activeLayerId,
        p1: draft.p1, p2: draft.p2, offsetPoint: worldPoint,
      });
      documentState.entities.push(entity);
      documentState.selectedEntityIds = [entity.id];
      ui().dimensionDraft = {
        mode: "chain",
        chainStartPoint: context.roundWorldPoint(entity.p2),
        signedOffset: context.getDimensionGeometry(entity).signedOffset,
      };
      context.syncAfterStateChange();
      context.setStatus("Aligned Dimension created. Pick next chain point or press Esc to finish.");
    }

    function startEndpointEdit(handleHit, worldPoint) {
      const entity = context.getEntityById(handleHit.entityId);
      if (!entity || entity.type !== "dimension" || !context.canSelectEntity(entity)) return false;
      state().selectedEntityIds = [entity.id];
      context.syncAfterStateChange(false);
      ui().dimensionEndpointEditDraft = {
        entityId: entity.id, endpoint: handleHit.endpoint,
        startPoint: context.deepClone(handleHit.point), currentPoint: context.roundWorldPoint(worldPoint),
        originalEntity: context.deepClone(entity), signedOffset: context.getDimensionGeometry(entity).signedOffset,
      };
      context.setStatus(`Dimension ${handleHit.endpoint.toUpperCase()} edit active. Drag handle or press Esc to cancel.`);
      context.draw(); context.renderStatusPanel();
      return true;
    }

    function updateEndpointEdit(worldPoint) {
      const draft = ui().dimensionEndpointEditDraft;
      if (!draft) return;
      draft.currentPoint = context.roundWorldPoint(worldPoint);
      context.draw(); context.renderStatusPanel();
    }

    function cancelEndpointEdit(message = "Dimension endpoint edit cancelled.") {
      if (!ui().dimensionEndpointEditDraft) return false;
      ui().dimensionEndpointEditDraft = null;
      context.draw(); context.renderStatusPanel(); context.setStatus(message);
      return true;
    }

    function applyEndpointEdit() {
      const draft = ui().dimensionEndpointEditDraft;
      if (!draft) return false;
      const entity = context.getEntityById(draft.entityId);
      if (!entity || entity.type !== "dimension" || !context.canSelectEntity(entity)) {
        ui().dimensionEndpointEditDraft = null; context.draw(); context.renderStatusPanel(); return false;
      }
      const nextPoint = context.getSnapPoint(draft.currentPoint);
      const preview = context.createDimensionWithPreservedOffset(entity, draft.endpoint, nextPoint, draft.signedOffset);
      if (!preview) {
        context.setStatus("Dimension endpoints must not be identical.");
        ui().dimensionEndpointEditDraft = null; context.draw(); context.renderStatusPanel(); return false;
      }
      if (preview.p1.x === entity.p1.x && preview.p1.y === entity.p1.y && preview.p2.x === entity.p2.x && preview.p2.y === entity.p2.y && preview.offsetPoint.x === entity.offsetPoint.x && preview.offsetPoint.y === entity.offsetPoint.y) return cancelEndpointEdit();
      context.pushUndoState();
      entity.p1 = preview.p1; entity.p2 = preview.p2; entity.offsetPoint = preview.offsetPoint;
      ui().dimensionEndpointEditDraft = null;
      context.syncAfterStateChange(); context.setStatus("Dimension endpoint updated.");
      return true;
    }

    function startOffsetEdit(handleHit) {
      const entity = context.getEntityById(handleHit.entityId);
      if (!entity || entity.type !== "dimension" || !context.canSelectEntity(entity)) return false;
      const geometry = context.getDimensionGeometry(entity);
      state().selectedEntityIds = [entity.id]; context.syncAfterStateChange(false);
      ui().dimensionOffsetEditDraft = {
        entityId: entity.id, startPoint: context.deepClone(handleHit.point), currentPoint: context.roundWorldPoint(handleHit.point),
        originalOffsetPoint: context.deepClone(entity.offsetPoint), midpoint: context.deepClone(geometry.midpoint), normal: context.deepClone(geometry.normal),
      };
      context.setStatus("Dimension offset edit active. Drag handle or press Esc to cancel.");
      context.draw(); context.renderStatusPanel();
      return true;
    }

    function updateOffsetEdit(worldPoint) {
      const draft = ui().dimensionOffsetEditDraft;
      if (!draft) return;
      const delta = { x: worldPoint.x - draft.midpoint.x, y: worldPoint.y - draft.midpoint.y };
      const signedOffset = delta.x * draft.normal.x + delta.y * draft.normal.y;
      draft.currentPoint = { x: context.roundToUnit(draft.midpoint.x + draft.normal.x * signedOffset), y: context.roundToUnit(draft.midpoint.y + draft.normal.y * signedOffset) };
      context.draw(); context.renderStatusPanel();
    }

    function cancelOffsetEdit(message = "Dimension offset edit cancelled.") {
      if (!ui().dimensionOffsetEditDraft) return false;
      ui().dimensionOffsetEditDraft = null;
      context.draw(); context.renderStatusPanel(); context.setStatus(message);
      return true;
    }

    function applyOffsetEdit() {
      const draft = ui().dimensionOffsetEditDraft;
      if (!draft) return false;
      const entity = context.getEntityById(draft.entityId);
      if (!entity || entity.type !== "dimension" || !context.canSelectEntity(entity)) {
        ui().dimensionOffsetEditDraft = null; context.draw(); context.renderStatusPanel(); return false;
      }
      const next = context.roundWorldPoint(draft.currentPoint);
      if (next.x === draft.originalOffsetPoint.x && next.y === draft.originalOffsetPoint.y) return cancelOffsetEdit();
      context.pushUndoState(); entity.offsetPoint = next; ui().dimensionOffsetEditDraft = null;
      context.syncAfterStateChange(); context.setStatus("Dimension offset updated.");
      return true;
    }

    function drawPreview() {
      const draft = ui().dimensionDraft;
      if (!draft) return;
      let p1; let p2; let offsetPoint;
      if (draft.mode === "chain") {
        p1 = context.roundWorldPoint(draft.chainStartPoint); p2 = context.roundWorldPoint(ui().hoverWorld);
        const preview = context.createDimensionWithPreservedOffset(context.createDefaultDimensionEntity({ id: "draft-dimension-chain", layerId: state().activeLayerId, p1, p2, offsetPoint: p2 }), "p2", p2, draft.signedOffset);
        if (!preview) return;
        offsetPoint = preview.offsetPoint;
      } else {
        p1 = context.roundWorldPoint(draft.p1);
        p2 = draft.step === 1 ? context.roundWorldPoint(ui().hoverWorld) : context.roundWorldPoint(draft.p2);
        offsetPoint = draft.step === 1 ? p2 : context.roundWorldPoint(ui().hoverWorld);
      }
      if (p1.x === p2.x && p1.y === p2.y) return;
      context.drawDimensionEntity(context.createDefaultDimensionEntity({ id: "draft-dimension", layerId: state().activeLayerId, p1, p2, offsetPoint }));
    }

    function drawEditPreview() {
      const endpointDraft = ui().dimensionEndpointEditDraft;
      if (endpointDraft) {
        const entity = context.getEntityById(endpointDraft.entityId);
        if (entity && entity.type === "dimension" && context.isLayerVisible(entity.layerId)) {
          const preview = context.createDimensionWithPreservedOffset(entity, endpointDraft.endpoint, endpointDraft.currentPoint, endpointDraft.signedOffset);
          if (preview) context.drawDimensionEntity({ ...preview, __isDimensionOffsetPreview: true });
        }
      }
      const offsetDraft = ui().dimensionOffsetEditDraft;
      if (offsetDraft) {
        const entity = context.getEntityById(offsetDraft.entityId);
        if (entity && entity.type === "dimension" && context.isLayerVisible(entity.layerId)) context.drawDimensionEntity({ ...entity, offsetPoint: context.roundWorldPoint(offsetDraft.currentPoint), __isDimensionOffsetPreview: true });
      }
    }

    return Object.freeze({ handleClick, drawPreview, drawEditPreview, startEndpointEdit, updateEndpointEdit, applyEndpointEdit, cancelEndpointEdit, startOffsetEdit, updateOffsetEdit, applyOffsetEdit, cancelOffsetEdit });
  });
})(window);
