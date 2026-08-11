"use strict";
(function registerExplodeTool(global) {
  global.DraftLiteTools.register("explode", function create(context) { return Object.freeze({ execute() {
    const state = context.getState();
    const blocks = state.selectedEntityIds.map(context.getEntityById).filter((e) => e?.type === "blockInstance");
    if (blocks.length) { context.pushUndoState(); blocks.forEach((e) => context.explodeBlockInstance(e.id)); context.syncAfterStateChange(); context.setStatus(`${blocks.length} block instance${blocks.length === 1 ? "" : "s"} exploded.`); return true; }
    const rects = state.selectedEntityIds.map(context.getEntityById).filter((e) => e?.type === "rect" && context.canSelectEntity(e));
    if (!rects.length) { context.setStatus("Select at least one rectangle object to explode."); return false; }
    context.pushUndoState(); const ids = new Set(rects.map((e) => e.id));
    const lines = rects.flatMap((rect) => context.rectToOutlineLines(rect).map((line) => ({ ...line, id: context.createEntityId() })));
    state.entities = state.entities.filter((e) => !ids.has(e.id)); state.entities.push(...lines); state.selectedEntityIds = lines.map((e) => e.id);
    context.syncAfterStateChange(); context.setStatus("Rectangle objects exploded."); return true;
  } }); });
}(window));
