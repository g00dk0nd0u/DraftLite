"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const rootDir = path.resolve(__dirname, "..");
const context = vm.createContext({ window: {} });

for (const relativePath of ["docs/core/units.js", "docs/core/geometry.js", "docs/core/dxf.js"]) {
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

function assertLine(actual, expected, message) {
  assert.ok(actual, `${message} should produce a line`);
  assert.equal(actual.p1.x, expected.p1.x, `${message} p1.x`);
  assert.equal(actual.p1.y, expected.p1.y, `${message} p1.y`);
  assert.equal(actual.p2.x, expected.p2.x, `${message} p2.x`);
  assert.equal(actual.p2.y, expected.p2.y, `${message} p2.y`);
}

const offsetSourceHorizontal = { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } };
assertLine(
  geometry.offsetLineTowardPoint(offsetSourceHorizontal, 10, { x: 50, y: 50 }),
  { p1: { x: 0, y: 10 }, p2: { x: 100, y: 10 } },
  "horizontal positive offset"
);
assertLine(
  geometry.offsetLineTowardPoint(offsetSourceHorizontal, 10, { x: 50, y: -50 }),
  { p1: { x: 0, y: -10 }, p2: { x: 100, y: -10 } },
  "horizontal negative offset"
);
const offsetSourceVertical = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 100 } };
assertLine(
  geometry.offsetLineTowardPoint(offsetSourceVertical, 10, { x: -50, y: 50 }),
  { p1: { x: -10, y: 0 }, p2: { x: -10, y: 100 } },
  "vertical left offset"
);
assertLine(
  geometry.offsetLineTowardPoint(offsetSourceVertical, 10, { x: 50, y: 50 }),
  { p1: { x: 10, y: 0 }, p2: { x: 10, y: 100 } },
  "vertical right offset"
);
assertLine(
  geometry.offsetLineTowardPoint({ p1: { x: 100, y: 0 }, p2: { x: 0, y: 0 } }, 10, { x: 50, y: 50 }),
  { p1: { x: 100, y: 10 }, p2: { x: 0, y: 10 } },
  "reversed horizontal offset"
);
assertLine(
  geometry.offsetLineTowardPoint({ p1: { x: 0, y: 0 }, p2: { x: 100, y: 100 } }, 10, { x: 0, y: 100 }),
  { p1: { x: -7, y: 7 }, p2: { x: 93, y: 107 } },
  "diagonal offset"
);
assert.equal(geometry.offsetLineTowardPoint(zeroLength, 10, { x: 5, y: 7 }), null);
assert.equal(geometry.offsetLineTowardPoint(horizontal, 0, { x: 5, y: 7 }), null);
assert.equal(geometry.offsetLineTowardPoint(horizontal, -10, { x: 5, y: 7 }), null);
assert.equal(geometry.offsetLineTowardPoint(horizontal, 10, { x: 5, y: 0 }), null);

const trimTarget = { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 } };
const trimBoundary = { p1: { x: 50, y: -50 }, p2: { x: 50, y: 50 } };
assertLine(
  geometry.trimLineAtBoundary(trimTarget, trimBoundary, { x: 25, y: 0 }),
  { p1: { x: 50, y: 0 }, p2: { x: 100, y: 0 } },
  "trim clicked p1 side"
);
assertLine(
  geometry.trimLineAtBoundary(trimTarget, trimBoundary, { x: 75, y: 0 }),
  { p1: { x: 0, y: 0 }, p2: { x: 50, y: 0 } },
  "trim clicked p2 side"
);
assertLine(
  geometry.trimLineAtBoundary({ p1: { x: 100, y: 0 }, p2: { x: 0, y: 0 } }, trimBoundary, { x: 25, y: 0 }),
  { p1: { x: 100, y: 0 }, p2: { x: 50, y: 0 } },
  "trim reversed target physical left side"
);
const diagonalTrim = geometry.trimLineAtBoundary(
  { p1: { x: 0, y: 0 }, p2: { x: 101, y: 101 } },
  trimBoundary,
  { x: 20, y: 20 }
);
assertLine(
  diagonalTrim,
  { p1: { x: 50, y: 50 }, p2: { x: 101, y: 101 } },
  "diagonal trim"
);
assert.equal(Number.isInteger(diagonalTrim.p1.x), true);
assert.equal(Number.isInteger(diagonalTrim.p1.y), true);
assert.equal(geometry.trimLineAtBoundary(trimTarget, parallelHorizontal, { x: 25, y: 0 }), null);
assert.equal(geometry.trimLineAtBoundary(zeroLength, trimBoundary, { x: 2, y: 2 }), null);
assert.equal(geometry.trimLineAtBoundary(trimTarget, zeroLength, { x: 25, y: 0 }), null);
assert.equal(geometry.trimLineAtBoundary(
  { p1: { x: 0, y: 0 }, p2: { x: 40, y: 0 } }, trimBoundary, { x: 20, y: 0 }
), null);
assert.equal(geometry.trimLineAtBoundary(
  trimTarget, { p1: { x: 50, y: 10 }, p2: { x: 50, y: 20 } }, { x: 25, y: 0 }
), null);
assert.equal(geometry.trimLineAtBoundary(
  trimTarget, { p1: { x: 0, y: -50 }, p2: { x: 0, y: 50 } }, { x: 25, y: 0 }
), null);
assert.equal(geometry.trimLineAtBoundary(trimTarget, trimBoundary, { x: 50, y: 0 }), null);

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

const filletHorizontal = { p1: { x: -100, y: 0 }, p2: { x: 100, y: 0 } };
const filletVertical = { p1: { x: 0, y: -100 }, p2: { x: 0, y: 100 } };
function assertFilletPoint(actual, expected, message) {
  assert.equal(actual.x, expected.x, `${message} x`);
  assert.equal(actual.y, expected.y, `${message} y`);
}
function assertMinorFilletArc(arc, message) {
  const sweep = (arc.endAngleDeg - arc.startAngleDeg + 360) % 360;
  assert.ok(sweep > 0 && sweep <= 180, `${message} should be a minor arc`);
}

const lowerRightFillet = geometry.filletLinesWithRadius(
  filletHorizontal, { x: 75, y: 0 }, filletVertical, { x: 0, y: 75 }, 10
);
assert.ok(lowerRightFillet, "lower-right fillet should succeed");
assertLine(lowerRightFillet.firstLine, { p1: { x: 10, y: 0 }, p2: { x: 100, y: 0 } }, "lower-right first line");
assertLine(lowerRightFillet.secondLine, { p1: { x: 0, y: 10 }, p2: { x: 0, y: 100 } }, "lower-right second line");
assertFilletPoint(lowerRightFillet.arc.center, { x: 10, y: 10 }, "lower-right center");
assert.equal(lowerRightFillet.arc.radius, 10);
assertMinorFilletArc(lowerRightFillet.arc, "lower-right arc");

const oppositeFillet = geometry.filletLinesWithRadius(
  filletHorizontal, { x: -75, y: 0 }, filletVertical, { x: 0, y: -75 }, 10
);
assertFilletPoint(oppositeFillet.firstLine.p2, { x: -10, y: 0 }, "opposite first tangent");
assertFilletPoint(oppositeFillet.secondLine.p2, { x: 0, y: -10 }, "opposite second tangent");
assertFilletPoint(oppositeFillet.arc.center, { x: -10, y: -10 }, "opposite center");

const reversedFillet = geometry.filletLinesWithRadius(
  { p1: filletHorizontal.p2, p2: filletHorizontal.p1 }, { x: 75, y: 0 },
  { p1: filletVertical.p2, p2: filletVertical.p1 }, { x: 0, y: 75 }, 10
);
assertFilletPoint(reversedFillet.firstLine.p2, { x: 10, y: 0 }, "reversed first tangent");
assertFilletPoint(reversedFillet.secondLine.p2, { x: 0, y: 10 }, "reversed second tangent");
assertFilletPoint(reversedFillet.arc.center, lowerRightFillet.arc.center, "reversed center");

const diagonalFillet = geometry.filletLinesWithRadius(
  { p1: { x: -100, y: 0 }, p2: { x: 100, y: 0 } }, { x: 75, y: 0 },
  { p1: { x: -100, y: -100 }, p2: { x: 100, y: 100 } }, { x: 75, y: 75 }, 10
);
assert.ok(diagonalFillet, "diagonal fillet should succeed");
[
  diagonalFillet.firstLine.p1, diagonalFillet.firstLine.p2,
  diagonalFillet.secondLine.p1, diagonalFillet.secondLine.p2,
  diagonalFillet.arc.center,
].forEach((point) => {
  assert.equal(Number.isInteger(point.x), true);
  assert.equal(Number.isInteger(point.y), true);
});
assert.equal(Number.isInteger(diagonalFillet.arc.radius), true);
assert.ok(diagonalFillet.firstLine.p1.x !== diagonalFillet.firstLine.p2.x
  || diagonalFillet.firstLine.p1.y !== diagonalFillet.firstLine.p2.y);
assert.ok(diagonalFillet.secondLine.p1.x !== diagonalFillet.secondLine.p2.x
  || diagonalFillet.secondLine.p1.y !== diagonalFillet.secondLine.p2.y);

assert.equal(geometry.filletLinesWithRadius(filletHorizontal, { x: 75, y: 0 }, parallelHorizontal, { x: 75, y: 5 }, 10), null);
assert.equal(geometry.filletLinesWithRadius(zeroLength, { x: 2, y: 2 }, filletVertical, { x: 0, y: 75 }, 10), null);
assert.equal(geometry.filletLinesWithRadius(filletHorizontal, { x: 75, y: 0 }, zeroLength, { x: 2, y: 2 }, 10), null);
assert.equal(geometry.filletLinesWithRadius(filletHorizontal, { x: 75, y: 0 }, filletVertical, { x: 0, y: 75 }, 0), null);
assert.equal(geometry.filletLinesWithRadius(filletHorizontal, { x: 75, y: 0 }, filletVertical, { x: 0, y: 75 }, -10), null);
assert.equal(geometry.filletLinesWithRadius(filletHorizontal, { x: 0, y: 0 }, filletVertical, { x: 0, y: 75 }, 10), null);
assert.equal(geometry.filletLinesWithRadius(filletHorizontal, { x: 75, y: 0 }, filletVertical, { x: 0, y: 75 }, 100), null);

const dxf = context.window.DraftLiteDxfCore;
assert.ok(dxf, "DraftLiteDxfCore namespace should exist");
assert.equal(Object.isFrozen(dxf), true);
assert.equal(dxf.dxfXUnitsToMm(10), 1);
assert.equal(dxf.dxfYUnitsToMm(10), -1);
assert.equal(dxf.dxfAngleDegFromCanvasAngle(0), 0);
assert.equal(dxf.dxfAngleDegFromCanvasAngle(90), 270);
assert.equal(dxf.dxfAngleDegFromCanvasAngle(-90), 90);
assert.equal(dxf.dxfAngleDegFromCanvasAngle(450), 270);

const dxfArcAngles = dxf.getDxfArcAngles(0, 90);
assert.equal(dxfArcAngles.start, 270);
assert.equal(dxfArcAngles.end, 0);

assert.equal(dxf.sanitizeDxfLayerName("A B/C"), "A_B_C");
assert.equal(dxf.sanitizeDxfLayerName(""), "0");
assert.equal(dxf.sanitizeDxfText("  A\nB\tC\u0001日本語  "), "A B C???");
assert.equal(dxf.formatDxfNumber(1.23456), "1.235");

console.log("DraftLite core checks passed.");
