(function registerMakeBlockTool(global) {
  "use strict";

  global.DraftLiteTools.register("make-block", (context) => Object.freeze({
    execute() {
      return context.makeBlockFromSelection();
    },
  }));
})(window);
