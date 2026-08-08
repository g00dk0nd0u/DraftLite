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
    isPointInsideRect,
    orientation,
    onSegment,
    segmentsIntersect,
    isPointInPolygon,
    isScreenPointInsideRect,
  });
})();
