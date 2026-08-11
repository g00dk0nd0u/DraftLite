"use strict";

(function registerGripEditTool(global) {
  function create(context) {
    const draft = () => context.getUiState().gripEditDraft;

    function updateStatus(prefix) {
      if (!draft()) return;
      const suffix = draft().numericInputBuffer ? ` Length: ${draft().numericInputBuffer} mm` : " Length: -";
      context.setStatus(`${prefix}${suffix}`);
      context.renderStatusPanel();
    }

    function cancel(message = "Grip edit cancelled.") {
      context.clearGripPreviewTimer();
      context.getUiState().gripEditDraft = null;
      context.draw();
      context.renderStatusPanel();
      context.setStatus(message);
    }

    function findAtPoint(worldPoint) {
      const state = context.getState();
      return state.selectedEntityIds.map(context.getEntityById)
        .filter((entity) => entity && entity.type === "line" && context.canSelectEntity(entity))
        .flatMap((entity) => ["p1", "p2"].map((endpoint) => ({
          entity, endpoint, point: entity[endpoint], distancePx: context.distanceScreenPx(worldPoint, entity[endpoint]),
        })))
        .filter((candidate) => candidate.distancePx <= state.settings.snapTolerancePx)
        .sort((a, b) => a.distancePx - b.distancePx)[0] || null;
    }

    function start(gripHit, worldPoint) {
      context.getUiState().gripEditDraft = {
        entityId: gripHit.entity.id, endpoint: gripHit.endpoint,
        fixedPoint: context.deepClone(gripHit.endpoint === "p1" ? gripHit.entity.p2 : gripHit.entity.p1),
        startPoint: context.deepClone(gripHit.point), currentPoint: worldPoint,
        originalEntity: context.deepClone(gripHit.entity), numericInputBuffer: "",
      };
      updateStatus(`Grip edit started from ${context.formatWorldPoint(worldPoint)} with ${gripHit.endpoint.toUpperCase()} active.`);
      context.draw();
    }

    function update(worldPoint) {
      if (!draft() || draft().numericInputBuffer) return;
      draft().currentPoint = worldPoint;
      context.draw();
    }

    function apply() {
      const active = draft();
      if (!active) return false;
      const nextPoint = context.getSnapPoint(active.currentPoint);
      if (nextPoint.x === active.startPoint.x && nextPoint.y === active.startPoint.y) { cancel(); return false; }
      if (nextPoint.x === active.fixedPoint.x && nextPoint.y === active.fixedPoint.y) {
        context.setStatus("Line length must be greater than zero."); context.draw(); context.renderStatusPanel(); return false;
      }
      context.pushUndoState();
      const state = context.getState();
      state.entities = state.entities.map((entity) => entity.id !== active.entityId || !context.canSelectEntity(entity) ? entity : ({
        ...entity, p1: active.endpoint === "p1" ? nextPoint : active.fixedPoint,
        p2: active.endpoint === "p2" ? nextPoint : active.fixedPoint,
      }));
      context.getUiState().gripEditDraft = null;
      state.selectedEntityIds = [];
      context.syncAfterStateChange(); context.setStatus("Grip edit applied."); return true;
    }

    function numericPoint(showErrors) {
      const active = draft();
      const lengthMm = Number.parseInt(active?.numericInputBuffer, 10);
      if (!active?.numericInputBuffer || !Number.isFinite(lengthMm) || lengthMm <= 0) {
        if (showErrors) context.setStatus("Enter a positive grip edit distance in mm."); return null;
      }
      const dx = context.getUiState().hoverWorld.x - active.startPoint.x;
      const dy = context.getUiState().hoverWorld.y - active.startPoint.y;
      const length = Math.hypot(dx, dy);
      if (!length) { if (showErrors) context.setStatus("Move the pointer to indicate a grip edit direction before pressing Enter."); return null; }
      const units = context.mmToUnits(lengthMm);
      if (units <= 0) { if (showErrors) context.setStatus("Line length must be greater than zero."); return null; }
      return { x: context.roundToGridUnit(active.startPoint.x + dx / length * units), y: context.roundToGridUnit(active.startPoint.y + dy / length * units) };
    }

    function applyNumeric() {
      context.clearGripPreviewTimer();
      const point = numericPoint(true); if (!point) return false;
      draft().currentPoint = point; return apply();
    }
    function previewNumeric() {
      const point = numericPoint(false); if (!point) return false;
      draft().currentPoint = point; context.draw(); context.renderStatusPanel(); return true;
    }
    function schedulePreview() {
      if (!draft()) return;
      context.clearGripPreviewTimer();
      if (!draft().numericInputBuffer) return;
      context.getUiState().gripPreviewTimer = global.setTimeout(() => {
        context.getUiState().gripPreviewTimer = null; previewNumeric();
      }, 250);
    }
    function handleKeyDown(event) {
      if (!draft()) return false;
      if (/^\d$/.test(event.key)) { event.preventDefault(); draft().numericInputBuffer += event.key; schedulePreview(); updateStatus("Grip edit active."); context.draw(); return true; }
      if (event.key === "Backspace" && draft().numericInputBuffer) {
        event.preventDefault(); draft().numericInputBuffer = draft().numericInputBuffer.slice(0, -1); context.clearGripPreviewTimer();
        if (!draft().numericInputBuffer) draft().currentPoint = context.getUiState().hoverWorld; else schedulePreview();
        updateStatus("Grip edit active."); context.draw(); return true;
      }
      if (event.key === "Enter") { event.preventDefault(); return draft().numericInputBuffer ? applyNumeric() : apply(); }
      return false;
    }
    return Object.freeze({ findAtPoint, start, update, apply, applyNumeric, previewNumeric, schedulePreview, handleKeyDown, cancel, isInProgress: () => Boolean(draft()) });
  }
  global.DraftLiteTools.register("grip-edit", create);
}(window));
