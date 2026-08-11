"use strict";

(function createDraftLiteToolRegistry(global) {
  const factories = new Map();
  const validId = /^[a-z][A-Za-z0-9-]*$/;

  const api = Object.freeze({
    register(id, factory) {
      if (typeof id !== "string" || !validId.test(id)) {
        throw new TypeError("Tool ID must start with a lowercase letter and contain only letters, numbers, or hyphens.");
      }
      if (typeof factory !== "function") {
        throw new TypeError(`Tool factory for ${id} must be a function.`);
      }
      if (factories.has(id)) {
        throw new Error(`Tool already registered: ${id}`);
      }
      factories.set(id, factory);
    },
    get(id) {
      return factories.get(id);
    },
    has(id) {
      return factories.has(id);
    },
    list() {
      return Array.from(factories.keys()).sort();
    },
  });

  global.DraftLiteTools = api;
}(window));
