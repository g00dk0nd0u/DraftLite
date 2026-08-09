"use strict";

(() => {
  const { roundToUnit } = window.DraftLiteUnits;

  function rotatePoint(point, center, angleDeg) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const dx = point.x - center.x;
    const dy = point.y - center.y;
    return {
      x: roundToUnit(center.x + dx * cos - dy * sin),
      y: roundToUnit(center.y + dx * sin + dy * cos),
    };
  }
  
  function normalizeAngleDeg(angleDeg) {
    const normalized = ((angleDeg % 360) + 360) % 360;
    return roundToUnit(normalized);
  }
  
  function pointFromCenterRadiusAngle(center, radius, angleDeg) {
    const angleRad = (angleDeg * Math.PI) / 180;
    return {
      x: roundToUnit(center.x + Math.cos(angleRad) * radius),
      y: roundToUnit(center.y + Math.sin(angleRad) * radius),
    };
  }
  
    
  function areLinesParallel(lineA, lineB) {
    const dxA = lineA.p2.x - lineA.p1.x;
    const dyA = lineA.p2.y - lineA.p1.y;
    const dxB = lineB.p2.x - lineB.p1.x;
    const dyB = lineB.p2.y - lineB.p1.y;
    const lenA = Math.hypot(dxA, dyA);
    const lenB = Math.hypot(dxB, dyB);
  
    if (lenA === 0 || lenB === 0) {
      return false;
    }
  
    const cross = dxA * dyB - dyA * dxB;
    const normalizedCross = Math.abs(cross) / (lenA * lenB);
    return normalizedCross <= 0.00001;
  }
  
  function projectPointToInfiniteLineRaw(point, line) {
    const dx = line.p2.x - line.p1.x;
    const dy = line.p2.y - line.p1.y;
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) {
      return null;
    }
  
    const t = ((point.x - line.p1.x) * dx + (point.y - line.p1.y) * dy) / lengthSq;
    return {
      x: line.p1.x + dx * t,
      y: line.p1.y + dy * t,
    };
  }

  function offsetLineTowardPoint(line, distanceUnits, sidePoint) {
    const dx = line.p2.x - line.p1.x;
    const dy = line.p2.y - line.p1.y;
    const length = Math.hypot(dx, dy);
    if (length === 0 || !Number.isFinite(distanceUnits) || distanceUnits <= 0) {
      return null;
    }

    const cross = dx * (sidePoint.y - line.p1.y) - dy * (sidePoint.x - line.p1.x);
    if (cross === 0) {
      return null;
    }

    const sign = cross > 0 ? 1 : -1;
    const offsetX = (-dy / length) * distanceUnits * sign;
    const offsetY = (dx / length) * distanceUnits * sign;
    return {
      p1: {
        x: roundToUnit(line.p1.x + offsetX),
        y: roundToUnit(line.p1.y + offsetY),
      },
      p2: {
        x: roundToUnit(line.p2.x + offsetX),
        y: roundToUnit(line.p2.y + offsetY),
      },
    };
  }

  function trimLineAtBoundary(targetLine, boundaryLine, targetPickPoint) {
    const targetDx = targetLine.p2.x - targetLine.p1.x;
    const targetDy = targetLine.p2.y - targetLine.p1.y;
    const boundaryDx = boundaryLine.p2.x - boundaryLine.p1.x;
    const boundaryDy = boundaryLine.p2.y - boundaryLine.p1.y;
    const targetLengthSq = targetDx * targetDx + targetDy * targetDy;
    const boundaryLengthSq = boundaryDx * boundaryDx + boundaryDy * boundaryDy;
    const epsilon = 0.000001;
    if (targetLengthSq === 0 || boundaryLengthSq === 0) {
      return null;
    }

    const denominator = targetDx * boundaryDy - targetDy * boundaryDx;
    if (Math.abs(denominator) <= epsilon) {
      return null;
    }
    const originDx = boundaryLine.p1.x - targetLine.p1.x;
    const originDy = boundaryLine.p1.y - targetLine.p1.y;
    const t = (originDx * boundaryDy - originDy * boundaryDx) / denominator;
    const u = (originDx * targetDy - originDy * targetDx) / denominator;
    if (t <= epsilon || t >= 1 - epsilon || u < -epsilon || u > 1 + epsilon) {
      return null;
    }

    const pickT = ((targetPickPoint.x - targetLine.p1.x) * targetDx
      + (targetPickPoint.y - targetLine.p1.y) * targetDy) / targetLengthSq;
    if (Math.abs(pickT - t) <= epsilon) {
      return null;
    }
    const intersection = {
      x: roundToUnit(targetLine.p1.x + targetDx * t),
      y: roundToUnit(targetLine.p1.y + targetDy * t),
    };
    const matchesP1 = intersection.x === targetLine.p1.x && intersection.y === targetLine.p1.y;
    const matchesP2 = intersection.x === targetLine.p2.x && intersection.y === targetLine.p2.y;
    if (matchesP1 || matchesP2) {
      return null;
    }
    return pickT < t
      ? { p1: intersection, p2: { ...targetLine.p2 } }
      : { p1: { ...targetLine.p1 }, p2: intersection };
  }

  function filletLinesWithRadius(firstLine, firstPickPoint, secondLine, secondPickPoint, radiusUnits) {
    const epsilon = 0.000001;
    if (!Number.isFinite(radiusUnits) || radiusUnits <= 0 || !Number.isInteger(radiusUnits)) {
      return null;
    }

    const firstVector = {
      x: firstLine.p2.x - firstLine.p1.x,
      y: firstLine.p2.y - firstLine.p1.y,
    };
    const secondVector = {
      x: secondLine.p2.x - secondLine.p1.x,
      y: secondLine.p2.y - secondLine.p1.y,
    };
    const firstLength = Math.hypot(firstVector.x, firstVector.y);
    const secondLength = Math.hypot(secondVector.x, secondVector.y);
    if (firstLength <= epsilon || secondLength <= epsilon) {
      return null;
    }

    const denominator = firstVector.x * secondVector.y - firstVector.y * secondVector.x;
    if (Math.abs(denominator) / (firstLength * secondLength) <= epsilon) {
      return null;
    }
    const originDelta = {
      x: secondLine.p1.x - firstLine.p1.x,
      y: secondLine.p1.y - firstLine.p1.y,
    };
    const firstT = (originDelta.x * secondVector.y - originDelta.y * secondVector.x) / denominator;
    const intersection = {
      x: firstLine.p1.x + firstVector.x * firstT,
      y: firstLine.p1.y + firstVector.y * firstT,
    };

    function getKeepRay(line, pickPoint) {
      const projected = projectPointToInfiniteLineRaw(pickPoint, line);
      if (!projected) return null;
      const fromIntersection = {
        x: projected.x - intersection.x,
        y: projected.y - intersection.y,
      };
      const length = Math.hypot(fromIntersection.x, fromIntersection.y);
      if (length <= epsilon) return null;
      return { x: fromIntersection.x / length, y: fromIntersection.y / length };
    }

    const u1 = getKeepRay(firstLine, firstPickPoint);
    const u2 = getKeepRay(secondLine, secondPickPoint);
    if (!u1 || !u2) return null;
    const dot = Math.max(-1, Math.min(1, u1.x * u2.x + u1.y * u2.y));
    const theta = Math.acos(dot);
    if (theta <= epsilon || Math.PI - theta <= epsilon) return null;
    const tangentDistance = radiusUnits / Math.tan(theta / 2);
    const centerDistance = radiusUnits / Math.sin(theta / 2);
    if (!Number.isFinite(tangentDistance) || !Number.isFinite(centerDistance)) return null;

    const bisector = { x: u1.x + u2.x, y: u1.y + u2.y };
    const bisectorLength = Math.hypot(bisector.x, bisector.y);
    if (bisectorLength <= epsilon) return null;
    const tangent1 = {
      x: roundToUnit(intersection.x + u1.x * tangentDistance),
      y: roundToUnit(intersection.y + u1.y * tangentDistance),
    };
    const tangent2 = {
      x: roundToUnit(intersection.x + u2.x * tangentDistance),
      y: roundToUnit(intersection.y + u2.y * tangentDistance),
    };
    const center = {
      x: roundToUnit(intersection.x + (bisector.x / bisectorLength) * centerDistance),
      y: roundToUnit(intersection.y + (bisector.y / bisectorLength) * centerDistance),
    };

    function getRetainedLine(line, ray, tangent) {
      const p1Distance = (line.p1.x - intersection.x) * ray.x + (line.p1.y - intersection.y) * ray.y;
      const p2Distance = (line.p2.x - intersection.x) * ray.x + (line.p2.y - intersection.y) * ray.y;
      const keepP1 = p1Distance > p2Distance;
      const farDistance = keepP1 ? p1Distance : p2Distance;
      if (farDistance <= tangentDistance + epsilon) return null;
      const retained = keepP1
        ? { p1: { ...line.p1 }, p2: tangent }
        : { p1: tangent, p2: { ...line.p2 } };
      if (retained.p1.x === retained.p2.x && retained.p1.y === retained.p2.y) return null;
      return retained;
    }

    const retainedFirst = getRetainedLine(firstLine, u1, tangent1);
    const retainedSecond = getRetainedLine(secondLine, u2, tangent2);
    if (!retainedFirst || !retainedSecond) return null;

    const firstAngle = normalizeAngleDeg(Math.atan2(tangent1.y - center.y, tangent1.x - center.x) * 180 / Math.PI);
    const secondAngle = normalizeAngleDeg(Math.atan2(tangent2.y - center.y, tangent2.x - center.x) * 180 / Math.PI);
    const forwardSweep = (secondAngle - firstAngle + 360) % 360;
    return {
      firstLine: retainedFirst,
      secondLine: retainedSecond,
      arc: {
        center,
        radius: roundToUnit(radiusUnits),
        startAngleDeg: forwardSweep <= 180 ? firstAngle : secondAngle,
        endAngleDeg: forwardSweep <= 180 ? secondAngle : firstAngle,
      },
    };
  }
  
    
    
  function isPointInsideRect(screenPoint, rect) {
    return (
      screenPoint.x >= rect.left &&
      screenPoint.x <= rect.right &&
      screenPoint.y >= rect.top &&
      screenPoint.y <= rect.bottom
    );
  }
  
  function orientation(a, b, c) {
    const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
    if (Math.abs(value) < 0.000001) {
      return 0;
    }
    return value > 0 ? 1 : 2;
  }
  
  function onSegment(a, b, c) {
    return (
      b.x <= Math.max(a.x, c.x) &&
      b.x >= Math.min(a.x, c.x) &&
      b.y <= Math.max(a.y, c.y) &&
      b.y >= Math.min(a.y, c.y)
    );
  }
  
  function segmentsIntersect(a1, a2, b1, b2) {
    const o1 = orientation(a1, a2, b1);
    const o2 = orientation(a1, a2, b2);
    const o3 = orientation(b1, b2, a1);
    const o4 = orientation(b1, b2, a2);
  
    if (o1 !== o2 && o3 !== o4) {
      return true;
    }
    if (o1 === 0 && onSegment(a1, b1, a2)) {
      return true;
    }
    if (o2 === 0 && onSegment(a1, b2, a2)) {
      return true;
    }
    if (o3 === 0 && onSegment(b1, a1, b2)) {
      return true;
    }
    if (o4 === 0 && onSegment(b1, a2, b2)) {
      return true;
    }
    return false;
  }
  
  function isPointInPolygon(point, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x;
      const yi = polygon[i].y;
      const xj = polygon[j].x;
      const yj = polygon[j].y;
      const intersects = ((yi > point.y) !== (yj > point.y))
        && (point.x < ((xj - xi) * (point.y - yi)) / ((yj - yi) || 1e-9) + xi);
      if (intersects) inside = !inside;
    }
    return inside;
  }
  
  function isScreenPointInsideRect(point, rect) {
    return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
  }

  window.DraftLiteGeometry = Object.freeze({
    rotatePoint,
    normalizeAngleDeg,
    pointFromCenterRadiusAngle,
    areLinesParallel,
    projectPointToInfiniteLineRaw,
    offsetLineTowardPoint,
    trimLineAtBoundary,
    filletLinesWithRadius,
    isPointInsideRect,
    orientation,
    onSegment,
    segmentsIntersect,
    isPointInPolygon,
    isScreenPointInsideRect,
  });
})();
