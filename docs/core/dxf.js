"use strict";

(() => {
  const { unitsToMm } = window.DraftLiteUnits;

  function dxfXUnitsToMm(x) {
    return unitsToMm(x);
  }

  function dxfYUnitsToMm(y) {
    return -unitsToMm(y);
  }

  function dxfAngleDegFromCanvasAngle(angleDeg) {
    return ((360 - (Number(angleDeg) || 0)) % 360 + 360) % 360;
  }

  function getDxfArcAngles(startCanvasDeg, endCanvasDeg) {
    return {
      start: dxfAngleDegFromCanvasAngle(endCanvasDeg),
      end: dxfAngleDegFromCanvasAngle(startCanvasDeg),
    };
  }

  function sanitizeDxfLayerName(value) {
    const sanitized = String(value || "")
      .replace(/[^A-Za-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "");
    return sanitized || "0";
  }

  function sanitizeDxfText(value) {
    return String(value || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[\x00-\x1F\x7F]/g, "")
      .replace(/[^\x20-\x7E]/g, "?")
      .trim();
  }

  function formatDxfNumber(value) {
    return Number(value).toFixed(3);
  }

  window.DraftLiteDxfCore = Object.freeze({
    dxfXUnitsToMm,
    dxfYUnitsToMm,
    dxfAngleDegFromCanvasAngle,
    getDxfArcAngles,
    sanitizeDxfLayerName,
    sanitizeDxfText,
    formatDxfNumber,
  });
})();
