"use strict";
(function registerGroupTools(global) {
  function create(context, ungroup) { return Object.freeze({ execute() {
    const state = context.getState();
    if (ungroup) {
      if (!state.selectedEntityIds.length) { context.setStatus("Nothing selected."); return false; }
      const selected = new Set(context.expandSelectionWithGroups(state.selectedEntityIds));
      const ids = state.groups.filter((group) => group.entityIds.some((id) => selected.has(id))).map((group) => group.id);
      if (!ids.length) { context.setStatus("No groups found in selection."); return false; }
      context.pushUndoState(); state.groups = state.groups.filter((group) => !ids.includes(group.id)); context.syncAfterStateChange(); context.setStatus(`${ids.length} group${ids.length === 1 ? "" : "s"} removed.`); return true;
    }
    const entityIds = context.expandSelectionWithGroups(state.selectedEntityIds);
    if (entityIds.length < 2) { context.setStatus("Select at least two entities to create a group."); return false; }
    context.pushUndoState(); const now = new Date().toISOString();
    const group = { id: context.createGroupId(), name: `Group ${state.nextGroupNumber - 1}`, category: "", description: "", entityIds: [...new Set(entityIds)], tags: [], metadata: {}, createdAt: now, updatedAt: now };
    state.groups.push(group); state.selectedEntityIds = [...group.entityIds]; context.syncAfterStateChange(); context.setStatus(`${group.name} created.`); return true;
  } }); }
  global.DraftLiteTools.register("group", (context) => create(context, false));
  global.DraftLiteTools.register("ungroup", (context) => create(context, true));
}(window));
