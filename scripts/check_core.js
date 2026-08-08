"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const context = vm.createContext({ window: {} });

for (const relativePath of ["docs/core/units.js", "docs/core/geometry.js"]) {
  const filePath = path.join(rootDir, relativePath);
  const source = fs.readFileSync(filePath, "utf8");
  vm.runInContext(source, context, { filename: filePath });
}

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) <= 1e-9, message);
}

const units = context.window.DraftLiteUnits;
assert.ok(units, "DraftLiteUnits namespace should exist");
assert.equal(Object.isFrozen(units), true);
assert.equal(units.UNIT_MM, 0.1);
assert.equal(units.LEGACY_UNIT_MM, 0.5);
assert.equal(units.unitsToMm(10), 1);
assert.equal(units.mmToUnits(1), 10);
assert.equal(units.legacyUnitsToCurrentUnits(2), 10);
assert.equal(units.roundToUnit(10.6), 11);
assert.equal(units.roundToUnit(-10.6), -11);

const geometry = context.window.DraftLiteGeometry;
assert.ok(geometry, "DraftLiteGeometry namespace should exist");
assert.equal(Object.isFrozen(geometry), true);

const rotated = geometry.rotatePoint({ x: 10, y: 0 }, { x: 0, y: 0 }, 90);
assertClose(rotated.x, 0, "rotated x coordinate");
assertClose(rotated.y, 10, "rotated y coordinate");

assert.equal(geometry.normalizeAngleDeg(-90), 270);
assert.equal(geometry.normalizeAngleDeg(450), 90);

const radiusPoint = geometry.pointFromCenterRadiusAngle({ x: 0, y: 0 }, 10, 180);
assertClose(radiusPoint.x, -10, "radius point x coordinate");
assertClose(radiusPoint.y, 0, "radius point y coordinate");

const horizontal = { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 } };
const parallelHorizontal = { p1: { x: 3, y: 5 }, p2: { x: 13, y: 5 } };
const vertical = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 10 } };
const zeroLength = { p1: { x: 2, y: 2 }, p2: { x: 2, y: 2 } };
assert.equal(geometry.areLinesParallel(horizontal, parallelHorizontal), true);
assert.equal(geometry.areLinesParallel(horizontal, vertical), false);
assert.equal(geometry.areLinesParallel(horizontal, zeroLength), false);

const projected = geometry.projectPointToInfiniteLineRaw({ x: 5, y: 7 }, horizontal);
assertClose(projected.x, 5, "projected x coordinate");
assertClose(projected.y, 0, "projected y coordinate");
assert.equal(geometry.projectPointToInfiniteLineRaw({ x: 5, y: 7 }, zeroLength), null);

const rect = { left: 0, right: 10, top: 0, bottom: 10 };
assert.equal(geometry.isPointInsideRect({ x: 0, y: 5 }, rect), true);
assert.equal(geometry.isPointInsideRect({ x: 5, y: 5 }, rect), true);
assert.equal(geometry.isPointInsideRect({ x: 11, y: 5 }, rect), false);

assert.equal(geometry.orientation({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }), 0);
assert.equal(geometry.orientation({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: -5 }), 1);
assert.equal(geometry.orientation({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }), 2);

assert.equal(geometry.onSegment({ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }), true);
assert.equal(geometry.onSegment({ x: 0, y: 0 }, { x: 11, y: 0 }, { x: 10, y: 0 }), false);

assert.equal(geometry.segmentsIntersect(
  { x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }
), true);
assert.equal(geometry.segmentsIntersect(
  { x: 0, y: 0 }, { x: 4, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 0 }
), false);
assert.equal(geometry.segmentsIntersect(
  { x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 0 }, { x: 10, y: 5 }
), true);

const square = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];
assert.equal(geometry.isPointInPolygon({ x: 5, y: 5 }, square), true);
assert.equal(geometry.isPointInPolygon({ x: 15, y: 5 }, square), false);

assert.equal(geometry.isScreenPointInsideRect({ x: 10, y: 5 }, rect), true);
assert.equal(geometry.isScreenPointInsideRect({ x: 5, y: 5 }, rect), true);
assert.equal(geometry.isScreenPointInsideRect({ x: 5, y: 11 }, rect), false);

console.log("DraftLite core checks passed.");
