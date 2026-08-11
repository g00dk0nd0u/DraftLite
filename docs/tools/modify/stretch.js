"use strict";

(function registerStretchTool(global) {
  const SUPPORTED_TYPES = new Set(["line", "wire", "rect", "filledRegion"]);

  function freezePoint(point) {
    return Object.freeze({ x: point.x, y: point.y });
  }

  function getStretchVerticesForEntity(entity) {
    if (!entity || !SUPPORTED_TYPES.has(entity.type)) return [];
    if (entity.type === "line") return [{ key: "p1", point: entity.p1 }, { key: "p2", point: entity.p2 }];
    if (entity.type === "wire") return [{ key: "start", point: entity.start }, { key: "end", point: entity.end }];
    if (entity.type === "filledRegion") return (entity.points || []).map((point, index) => ({ key: index, point }));
    const left = Math.min(entity.x, entity.x + entity.width);
    const right = Math.max(entity.x, entity.x + entity.width);
    const top = Math.min(entity.y, entity.y + entity.height);
    const bottom = Math.max(entity.y, entity.y + entity.height);
    return [
      { key: "left-top", point: { x: left, y: top } },
      { key: "right-top", point: { x: right, y: top } },
      { key: "right-bottom", point: { x: right, y: bottom } },
      { key: "left-bottom", point: { x: left, y: bottom } },
    ];
  }

  function create(context) {
    function draft() { return context.getUiState().stretchDraft; }
    function screenRect(windowDraft) {
      return Object.freeze({
        left: Math.min(windowDraft.startScreen.x, windowDraft.currentScreen.x),
        right: Math.max(windowDraft.startScreen.x, windowDraft.currentScreen.x),
        top: Math.min(windowDraft.startScreen.y, windowDraft.currentScreen.y),
        bottom: Math.max(windowDraft.startScreen.y, windowDraft.currentScreen.y),
      });
    }
    function inside(point, rect) {
      return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    }
    function deepFreeze(value) {
      if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
      Object.values(value).forEach(deepFreeze);
      return Object.freeze(value);
    }
    function createStretchDescriptor(entity, rect) {
      if (!SUPPORTED_TYPES.has(entity?.type) || !context.canSelectEntity(entity)) return null;
      const captured = getStretchVerticesForEntity(entity)
        .filter((vertex) => inside(context.worldToScreen(vertex.point), rect))
        .map((vertex) => vertex.key);
      if (!captured.length) return null;
      return Object.freeze({
        entityId: entity.id,
        type: entity.type,
        originalGeometry: deepFreeze(context.deepClone(entity)),
        capturedVertices: Object.freeze(captured.slice()),
      });
    }
    function createStretchProposal(descriptor, offset) {
      const entity = context.deepClone(descriptor.originalGeometry);
      const captured = new Set(descriptor.capturedVertices);
      const move = (point) => ({ x: context.roundToUnit(point.x + offset.dx), y: context.roundToUnit(point.y + offset.dy) });
      if (entity.type === "line") {
        if (captured.has("p1")) entity.p1 = move(entity.p1);
        if (captured.has("p2")) entity.p2 = move(entity.p2);
      } else if (entity.type === "wire") {
        if (captured.has("start")) { entity.start = move(entity.start); entity.startRef = null; }
        if (captured.has("end")) { entity.end = move(entity.end); entity.endRef = null; }
      } else if (entity.type === "filledRegion") {
        if (!Array.isArray(entity.points) || entity.points.length < 3) return { valid: false, entity };
        entity.points = entity.points.map((point, index) => captured.has(index) ? move(point) : point);
      } else if (entity.type === "rect") {
        let left = Math.min(entity.x, entity.x + entity.width);
        let right = Math.max(entity.x, entity.x + entity.width);
        let top = Math.min(entity.y, entity.y + entity.height);
        let bottom = Math.max(entity.y, entity.y + entity.height);
        const touchesBoundary = (keys) => keys.every((key) => captured.has(key))
          || (captured.size === 1 && keys.some((key) => captured.has(key)));
        if (touchesBoundary(["left-top", "left-bottom"])) left = context.roundToUnit(left + offset.dx);
        if (touchesBoundary(["right-top", "right-bottom"])) right = context.roundToUnit(right + offset.dx);
        if (touchesBoundary(["left-top", "right-top"])) top = context.roundToUnit(top + offset.dy);
        if (touchesBoundary(["left-bottom", "right-bottom"])) bottom = context.roundToUnit(bottom + offset.dy);
        if (right <= left || bottom <= top) return { valid: false, entity };
        entity.x = left; entity.y = top; entity.width = right - left; entity.height = bottom - top;
        context.clampRectCornerRadius(entity);
      }
      return { valid: true, entity };
    }
    function resolveBase(rawPoint) {
      const candidate = context.resolveSnapCandidate(rawPoint);
      return candidate ? freezePoint(candidate.point) : freezePoint(context.roundWorldPoint(rawPoint));
    }
    function resolveDestination(rawPoint, shiftKey) {
      const current = draft();
      const constrained = context.getConstrainedWorldPoint(rawPoint, shiftKey);
      const candidate = context.resolveSnapCandidate(constrained);
      return freezePoint(candidate ? candidate.point : context.getQuantizedDeltaPoint(current.basePoint, constrained));
    }
    function activate() {
      const state = context.getState();
      state.selectedEntityIds = [];
      context.getUiState().stretchDraft = { phase: "window", window: null, descriptors: Object.freeze([]), basePoint: null, currentPoint: null };
      context.setStatus("Stretch: drag a right-to-left crossing window."); context.draw(); context.renderStatusPanel();
    }
    function cancel() {
      const state = context.getState(); const ui = context.getUiState();
      ui.stretchDraft = null; state.selectedEntityIds = []; ui.activeTool = "select";
      context.syncAfterStateChange(); context.setStatus("Stretch cancelled.");
    }
    function handlePrimaryAction(rawWorldPoint, rawSnapWorldPoint, event, screenPoint) {
      const current = draft(); if (!current) return false;
      if (current.phase === "window") {
        const screen = screenPoint || context.worldToScreen(rawWorldPoint);
        current.window = { startScreen: freezePoint(screen), currentScreen: freezePoint(screen), startWorld: freezePoint(rawWorldPoint), currentWorld: freezePoint(rawWorldPoint) };
        context.draw(); return true;
      }
      if (current.phase === "base") {
        current.basePoint = resolveBase(rawWorldPoint); current.currentPoint = current.basePoint; current.phase = "destination";
        context.setStatus("Stretch: pick destination point."); context.draw(); context.renderStatusPanel(); return true;
      }
      current.currentPoint = resolveDestination(rawSnapWorldPoint, event.shiftKey);
      return apply();
    }
    function handlePointerMove(rawWorldPoint, event, screenPoint) {
      const current = draft(); if (!current) return false;
      if (current.phase === "window" && current.window) {
        current.window.currentScreen = freezePoint(screenPoint || context.worldToScreen(rawWorldPoint));
        current.window.currentWorld = freezePoint(rawWorldPoint); context.draw(); return true;
      }
      if (current.phase === "destination") {
        current.currentPoint = resolveDestination(rawWorldPoint, event.shiftKey); context.draw(); return true;
      }
      return false;
    }
    function finishCrossingWindow(screenPoint, worldPoint) {
      const current = draft(); if (!current?.window) return false;
      current.window.currentScreen = freezePoint(screenPoint); current.window.currentWorld = freezePoint(worldPoint);
      const windowDraft = current.window;
      const width = Math.abs(windowDraft.currentScreen.x - windowDraft.startScreen.x);
      const height = Math.abs(windowDraft.currentScreen.y - windowDraft.startScreen.y);
      current.window = null;
      if (Math.hypot(width, height) < context.clickSelectThresholdPx) {
        context.setStatus("Stretch: drag a right-to-left crossing window."); context.draw(); return false;
      }
      if (windowDraft.currentScreen.x > windowDraft.startScreen.x) {
        context.setStatus("Stretch: use a right-to-left crossing window."); context.draw(); return false;
      }
      const rect = screenRect(windowDraft);
      const descriptors = context.getState().entities.map((entity) => createStretchDescriptor(entity, rect)).filter(Boolean);
      if (!descriptors.length) {
        current.descriptors = Object.freeze([]); context.getState().selectedEntityIds = [];
        context.setStatus("Stretch: no supported vertices captured."); context.draw(); return false;
      }
      current.descriptors = Object.freeze(descriptors); current.phase = "base";
      context.getState().selectedEntityIds = descriptors.map((descriptor) => descriptor.entityId);
      context.setStatus("Stretch: pick base point."); context.draw(); context.renderStatusPanel(); return true;
    }
    function proposalsForCurrent() {
      const current = draft();
      if (!current?.basePoint || !current.currentPoint) return [];
      const offset = { dx: context.roundToUnit(current.currentPoint.x - current.basePoint.x), dy: context.roundToUnit(current.currentPoint.y - current.basePoint.y) };
      return current.descriptors.map((descriptor) => createStretchProposal(descriptor, offset));
    }
    function apply() {
      const current = draft(); if (!current || current.phase !== "destination") return false;
      const offset = { dx: context.roundToUnit(current.currentPoint.x - current.basePoint.x), dy: context.roundToUnit(current.currentPoint.y - current.basePoint.y) };
      if (!offset.dx && !offset.dy) { context.setStatus("Stretch distance must be greater than zero."); return false; }
      const proposals = current.descriptors.map((descriptor) => createStretchProposal(descriptor, offset));
      if (proposals.some((proposal) => !proposal.valid)) { context.setStatus("Stretch: rectangle width and height must remain positive."); context.draw(); return false; }
      context.pushUndoState();
      const state = context.getState();
      const byId = new Map(proposals.map((proposal) => [proposal.entity.id, proposal.entity]));
      state.entities = state.entities.map((entity) => byId.get(entity.id) || entity);
      state.selectedEntityIds = []; context.getUiState().stretchDraft = null; context.getUiState().activeTool = "select";
      context.syncAfterStateChange(); context.setStatus("Stretch applied."); return true;
    }
    function drawPreview() {
      const current = draft(); if (!current) return;
      if (current.window) context.drawSelectionWindow(current.window);
      if (current.phase === "destination") context.drawStretchPreviewEntities(proposalsForCurrent().filter((proposal) => proposal.valid).map((proposal) => proposal.entity));
    }
    return Object.freeze({ activate, cancel, handlePrimaryAction, handlePointerMove, finishCrossingWindow, apply, drawPreview,
      createStretchDescriptor, createStretchProposal, getStretchVerticesForEntity,
      getGuideText() { const phase = draft()?.phase; if (phase === "base") return "STRETCH 2/3 — Pick base point"; if (phase === "destination") return "STRETCH 3/3 — Pick destination"; return "STRETCH 1/3 — Drag right-to-left crossing window"; },
      isInProgress() { return Boolean(draft()); },
    });
  }

  global.DraftLiteTools.register("stretch", create);
}(window));
