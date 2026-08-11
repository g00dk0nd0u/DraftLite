"use strict";

(function createDraftLiteToolRegistry(global) {
  const factories = new Map();
  const validId = /^[a-z][a-z0-9-]*$/;

  const api = Object.freeze({
    register(id, factory) {
      if (typeof id !== "string" || !validId.test(id)) {
        throw new TypeError("Tool ID must be a lowercase, kebab-case identifier.");
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
