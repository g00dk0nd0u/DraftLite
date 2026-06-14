"use strict";

(function () {
  const DXF_MAX_FILE_BYTES = 8 * 1024 * 1024;
  const DXF_MAX_GROUP_PAIRS = 400000;
  const DXF_MAX_PRIMITIVES = 50000;
  const DXF_MAX_POLYLINE_POINTS = 20000;
  const DEFAULT_UNIT_MM = 1;
  const UNITS_PER_MM = 10;
  const SKIPPED_ENTITY_TYPES = new Set(["HATCH", "SOLID", "TRACE", "3DFACE", "WIPEOUT", "IMAGE", "MTEXT", "DIMENSION", "LEADER", "MULTILEADER", "SPLINE", "ELLIPSE", "INSERT", "BLOCK", "ATTRIB", "ATTDEF"]);

  function dxfMmToUnits(value, unitMm) {
    return Math.round(Number(value) * unitMm * UNITS_PER_MM);
  }

  function isFiniteNumber(value) {
    return Number.isFinite(Number(value));
  }

  function parseNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function addWarning(stats, message) {
    if (!stats.warnings.includes(message)) {
      stats.warnings.push(message);
    }
  }

  function isLikelyBinaryDxf(text) {
    if (typeof text !== "string") return true;
    if (text.slice(0, 64).includes("AutoCAD Binary DXF")) return true;
    const sample = text.slice(0, Math.min(text.length, 4096));
    const nulCount = (sample.match(/\u0000/g) || []).length;
    return nulCount > 2;
  }

  function parseGroupPairs(text, stats) {
    const normalized = String(text || "").replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const lines = normalized.split("\n");
    if (lines.length < 4) {
      throw new Error("DXF group structure was not found.");
    }
    const pairCount = Math.floor(lines.length / 2);
    if (pairCount > DXF_MAX_GROUP_PAIRS) {
      stats.truncated = true;
      addWarning(stats, `DXF group pair limit exceeded (${DXF_MAX_GROUP_PAIRS}).`);
    }
    const maxPairs = Math.min(pairCount, DXF_MAX_GROUP_PAIRS);
    const pairs = [];
    for (let i = 0; i < maxPairs * 2; i += 2) {
      const code = Number(String(lines[i]).trim());
      if (!Number.isInteger(code)) {
        stats.skippedCount += 1;
        continue;
      }
      pairs.push({ code, value: String(lines[i + 1] || "").trim() });
    }
    return pairs;
  }

  function readInsunits(pairs, stats) {
    for (let i = 0; i < pairs.length - 1; i += 1) {
      if (pairs[i].code === 9 && pairs[i].value.toUpperCase() === "$INSUNITS") {
        const unitCode = Number(pairs[i + 1].value);
        if (unitCode === 1) return 25.4;
        if (unitCode === 2) return 304.8;
        if (unitCode === 4) return 1;
        if (unitCode === 5) return 10;
        if (unitCode === 6) return 1000;
        addWarning(stats, "$INSUNITS is unknown; assuming 1 DXF unit = 1mm.");
        return DEFAULT_UNIT_MM;
      }
    }
    addWarning(stats, "$INSUNITS not found; assuming 1 DXF unit = 1mm.");
    return DEFAULT_UNIT_MM;
  }

  function pointFromCodes(values, xCode, yCode, unitMm) {
    const x = parseNumber(values.get(xCode));
    const y = parseNumber(values.get(yCode));
    if (x === null || y === null) return null;
    return { x: dxfMmToUnits(x, unitMm), y: -dxfMmToUnits(y, unitMm) };
  }

  function collectEntityValues(pairs, startIndex) {
    const values = new Map();
    let i = startIndex + 1;
    for (; i < pairs.length; i += 1) {
      if (pairs[i].code === 0) break;
      if (!values.has(pairs[i].code)) values.set(pairs[i].code, pairs[i].value);
    }
    return { values, nextIndex: i };
  }

  function pushPrimitive(primitives, primitive, stats) {
    if (primitives.length >= DXF_MAX_PRIMITIVES) {
      stats.truncated = true;
      addWarning(stats, `Primitive limit exceeded (${DXF_MAX_PRIMITIVES}).`);
      return false;
    }
    primitives.push(primitive);
    return true;
  }

  function parseDxfText(text) {
    const stats = { primitiveCount: 0, skippedCount: 0, warnings: [], truncated: false };
    try {
      if (!text || !String(text).trim()) throw new Error("DXF file is empty.");
      if (String(text).length > DXF_MAX_FILE_BYTES) throw new Error("DXF file exceeds the 8MB safety limit.");
      if (isLikelyBinaryDxf(String(text))) throw new Error("Binary DXF is not supported.");
      const pairs = parseGroupPairs(text, stats);
      const unitMm = readInsunits(pairs, stats);
      let inEntities = false;
      let foundEntities = false;
      const primitives = [];
      for (let i = 0; i < pairs.length; i += 1) {
        const pair = pairs[i];
        if (pair.code === 0 && pair.value.toUpperCase() === "SECTION") {
          const sectionName = pairs[i + 2] && pairs[i + 1] && pairs[i + 1].code === 2 ? pairs[i + 1].value.toUpperCase() : "";
          inEntities = sectionName === "ENTITIES";
          foundEntities = foundEntities || inEntities;
          continue;
        }
        if (pair.code === 0 && pair.value.toUpperCase() === "ENDSEC") {
          inEntities = false;
          continue;
        }
        if (!inEntities || pair.code !== 0) continue;
        const type = pair.value.toUpperCase();
        if (type === "LINE" || type === "CIRCLE" || type === "ARC" || type === "LWPOLYLINE") {
          const { values, nextIndex } = collectEntityValues(pairs, i);
          const layer = values.get(8) || "0";
          if (type === "LINE") {
            const p1 = pointFromCodes(values, 10, 20, unitMm);
            const p2 = pointFromCodes(values, 11, 21, unitMm);
            if (p1 && p2) pushPrimitive(primitives, { kind: "line", x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, layer }); else stats.skippedCount += 1;
          } else if (type === "CIRCLE" || type === "ARC") {
            const center = pointFromCodes(values, 10, 20, unitMm);
            const radius = parseNumber(values.get(40));
            if (center && radius !== null && radius > 0) {
              const common = { cx: center.x, cy: center.y, r: dxfMmToUnits(radius, unitMm), layer };
              if (type === "CIRCLE") pushPrimitive(primitives, { kind: "circle", ...common });
              else pushPrimitive(primitives, { kind: "arc", ...common, startDeg: Number(values.get(50)) || 0, endDeg: Number(values.get(51)) || 0 });
            } else stats.skippedCount += 1;
          } else if (type === "LWPOLYLINE") {
            const points = [];
            for (let j = i + 1; j < nextIndex; j += 1) {
              if (pairs[j].code === 10 && isFiniteNumber(pairs[j].value)) {
                let y = null;
                for (let k = j + 1; k < nextIndex; k += 1) {
                  if (pairs[k].code === 20) { y = parseNumber(pairs[k].value); break; }
                  if (pairs[k].code === 10 || pairs[k].code === 0) break;
                }
                if (y !== null && points.length < DXF_MAX_POLYLINE_POINTS) points.push({ x: dxfMmToUnits(pairs[j].value, unitMm), y: -dxfMmToUnits(y, unitMm) });
              }
            }
            if (points.length >= 2) pushPrimitive(primitives, { kind: "polyline", points, closed: (Number(values.get(70)) & 1) === 1, layer }); else stats.skippedCount += 1;
          }
          i = nextIndex - 1;
        } else if (type === "POLYLINE") {
          const { values, nextIndex } = collectEntityValues(pairs, i);
          const layer = values.get(8) || "0";
          const closed = (Number(values.get(70)) & 1) === 1;
          const points = [];
          let j = nextIndex;
          for (; j < pairs.length; j += 1) {
            if (pairs[j].code === 0 && pairs[j].value.toUpperCase() === "SEQEND") break;
            if (pairs[j].code === 0 && pairs[j].value.toUpperCase() === "VERTEX") {
              const vertex = collectEntityValues(pairs, j);
              const p = pointFromCodes(vertex.values, 10, 20, unitMm);
              if (p && points.length < DXF_MAX_POLYLINE_POINTS) points.push(p);
              j = vertex.nextIndex - 1;
            }
          }
          if (points.length >= 2) pushPrimitive(primitives, { kind: "polyline", points, closed, layer }); else stats.skippedCount += 1;
          i = j;
        } else if (SKIPPED_ENTITY_TYPES.has(type)) {
          stats.skippedCount += 1;
        } else if (type && type !== "ENDSEC" && type !== "EOF") {
          stats.skippedCount += 1;
        }
        if (stats.truncated) break;
      }
      if (!foundEntities) throw new Error("DXF ENTITIES section was not found.");
      stats.primitiveCount = primitives.length;
      if (!primitives.length) throw new Error("DXF contains no supported underlay primitives.");
      return { ok: true, primitives, bounds: getDxfUnderlayBounds({ x: 0, y: 0, scale: 1, rotation: 0, primitives }), stats, unitMm };
    } catch (error) {
      return { ok: false, primitives: [], bounds: null, stats, error: error && error.message ? error.message : "Failed to parse DXF." };
    }
  }

  function transformPoint(entity, point) {
    const scale = Number(entity.scale) || 1;
    const rotation = ((Number(entity.rotation) || 0) * Math.PI) / 180;
    const cos = Math.cos(rotation);
    const sin = Math.sin(rotation);
    const sx = point.x * scale;
    const sy = point.y * scale;
    return { x: Math.round((Number(entity.x) || 0) + sx * cos - sy * sin), y: Math.round((Number(entity.y) || 0) + sx * sin + sy * cos) };
  }

  function getPrimitivePoints(primitive) {
    if (!primitive || typeof primitive !== "object") return [];
    if (primitive.kind === "line") return [{ x: primitive.x1, y: primitive.y1 }, { x: primitive.x2, y: primitive.y2 }];
    if (primitive.kind === "polyline" && Array.isArray(primitive.points)) return primitive.points;
    if (primitive.kind === "circle" || primitive.kind === "arc") return [{ x: primitive.cx - primitive.r, y: primitive.cy - primitive.r }, { x: primitive.cx + primitive.r, y: primitive.cy + primitive.r }];
    return [];
  }

  function getDxfUnderlayBounds(entity) {
    const points = [];
    (Array.isArray(entity && entity.primitives) ? entity.primitives : []).forEach((primitive) => {
      getPrimitivePoints(primitive).forEach((point) => points.push(transformPoint(entity, point)));
    });
    if (!points.length) return null;
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
  }

  function drawDxfUnderlay(ctx, entity, worldToScreen) {
    if (!ctx || !entity || entity.visible === false || Number(entity.opacity) <= 0 || !Array.isArray(entity.primitives)) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, Number(entity.opacity) || 0.45));
    ctx.strokeStyle = "#9aa3ad";
    ctx.lineWidth = 1;
    ctx.beginPath();
    entity.primitives.forEach((primitive) => {
      if (primitive.kind === "line") {
        const a = worldToScreen(transformPoint(entity, { x: primitive.x1, y: primitive.y1 }));
        const b = worldToScreen(transformPoint(entity, { x: primitive.x2, y: primitive.y2 }));
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      } else if (primitive.kind === "polyline" && Array.isArray(primitive.points)) {
        primitive.points.forEach((point, index) => {
          const screen = worldToScreen(transformPoint(entity, point));
          if (index === 0) ctx.moveTo(screen.x, screen.y); else ctx.lineTo(screen.x, screen.y);
        });
        if (primitive.closed && primitive.points.length) {
          const first = worldToScreen(transformPoint(entity, primitive.points[0]));
          ctx.lineTo(first.x, first.y);
        }
      } else if (primitive.kind === "circle" || primitive.kind === "arc") {
        const start = primitive.kind === "circle" ? 0 : Number(primitive.startDeg) || 0;
        const end = primitive.kind === "circle" ? 360 : Number(primitive.endDeg) || 0;
        const span = primitive.kind === "circle" ? 360 : ((end - start + 360) % 360 || 360);
        const steps = Math.max(12, Math.min(96, Math.ceil(span / 10)));
        for (let i = 0; i <= steps; i += 1) {
          const deg = start + (span * i) / steps;
          const rad = (deg * Math.PI) / 180;
          const p = transformPoint(entity, { x: primitive.cx + Math.cos(rad) * primitive.r, y: primitive.cy - Math.sin(rad) * primitive.r });
          const s = worldToScreen(p);
          if (i === 0) ctx.moveTo(s.x, s.y); else ctx.lineTo(s.x, s.y);
        }
      }
    });
    ctx.stroke();
    ctx.restore();
  }

  function getDxfUnderlayStats(entity) {
    const stats = entity && entity.stats && typeof entity.stats === "object" ? entity.stats : {};
    return { primitiveCount: Number(stats.primitiveCount) || (Array.isArray(entity && entity.primitives) ? entity.primitives.length : 0), skippedCount: Number(stats.skippedCount) || 0, warnings: Array.isArray(stats.warnings) ? stats.warnings : [], truncated: Boolean(stats.truncated) };
  }

  window.DraftLiteDxfUnderlay = { parseDxfText, drawDxfUnderlay, getDxfUnderlayBounds, getDxfUnderlayStats };
}());
