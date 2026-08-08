"use strict";

(() => {
  const UNIT_MM = 0.1;
  const LEGACY_UNIT_MM = 0.5;

  function unitsToMm(units) {
    return units * UNIT_MM;
  }
  
  function mmToUnits(mm) {
    return Math.round(mm / UNIT_MM);
  }
  
  function legacyUnitsToCurrentUnits(value) {
    return Math.round(value * LEGACY_UNIT_MM / UNIT_MM);
  }
  
  function roundToUnit(value) {
    return Math.round(value);
  }

  window.DraftLiteUnits = Object.freeze({
    unitsToMm,
    mmToUnits,
    legacyUnitsToCurrentUnits,
    roundToUnit,
  });
})();
