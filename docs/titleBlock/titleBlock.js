"use strict";

(function attachDraftLiteTitleBlock() {
  const DEFAULT_TEMPLATE_ID = "a3-standard-v6";
  const DEFAULT_PAPER_SIZE = "A3";
  const DEFAULT_ORIENTATION = "landscape";
  const DEFAULT_SCALE = 100;
  const DEFAULT_SHOW_MODE = "full";
  const SCALE_OPTIONS = [50, 100, 200, 500];
  const PNG_DPI = 300;
  const PT_TO_MM = 25.4 / 72;
  const PDF_STYLE = {
    strokeRgb: [0.10, 0.16, 0.22],
    titleBlockStrokeRgb: [0.10, 0.16, 0.22],
    textRgb: [0.10, 0.16, 0.22],
    normalStrokeWidthMm: 0.18,
    titleBlockStrokeWidthMm: 0.18,
    innerFrameStrokeWidthMm: 0.18,
    minStrokeWidthPt: 0.25,
  };

  function getTemplateRegistry() {
    return window.DraftLiteTitleBlockTemplates || null;
  }

  function getTemplateDefinition(templateId) {
    const registry = getTemplateRegistry();
    if (registry && typeof registry.getTemplate === "function") {
      return registry.getTemplate(templateId);
    }
    return {
      id: DEFAULT_TEMPLATE_ID,
      name: "A3 Standard v6",
      defaultPaperSize: DEFAULT_PAPER_SIZE,
      defaultOrientation: DEFAULT_ORIENTATION,
      outerInsetMm: 5,
      innerInsetMm: 10,
      titleBlockHeightMm: 12,
      infoRowHeightMm: 6,
      notesRowHeightMm: 6,
      leftWingWidthMm: 200,
      rightWingWidthMm: 200,
      sheetNoWidthMm: 40,
      infoColumns: ["PROJECT NAME", "DRAWN BY", "SCALE", "PAPER", "DATE"],
      textStyles: {
        label: { fontSizePt: 3.0, fontSizeMm: 1.058333, color: "#888888", align: "right", letterSpacingEm: 0.075, fontWeight: 400 },
        value: { fontSizePt: 5.7, fontSizeMm: 2.010833, color: "#111111", align: "right", fontWeight: 600 },
        notesLabel: { fontSizePt: 3.0, fontSizeMm: 1.058333, color: "#888888", align: "right", letterSpacingEm: 0.075, fontWeight: 400 },
        titleLabel: { fontSizePt: 3.0, fontSizeMm: 1.058333, color: "#888888", align: "right", letterSpacingEm: 0.075, fontWeight: 400 },
        titleValue: { fontSizePt: 12.5, fontSizeMm: 4.409722, color: "#111111", align: "right", fontWeight: 700 },
      },
    };
  }

  function getPaperSizeDefinition(paperSize) {
    const registry = getTemplateRegistry();
    if (registry && typeof registry.getPaperSize === "function") {
      return registry.getPaperSize(paperSize);
    }
    if (paperSize === "A4") {
      return { widthMm: 297, heightMm: 210 };
    }
    if (paperSize === "16:9") {
      return { widthMm: 420, heightMm: 236.25 };
    }
    return { widthMm: 420, heightMm: 297 };
  }

  function roundWorldPoint(point, deps = {}) {
    if (typeof deps.roundWorldPoint === "function") {
      return deps.roundWorldPoint(point);
    }
    return {
      x: Math.round(Number(point && point.x) || 0),
      y: Math.round(Number(point && point.y) || 0),
    };
  }

  function roundToUnit(value, deps = {}) {
    if (typeof deps.roundToUnit === "function") {
      return deps.roundToUnit(value);
    }
    return Math.round(Number(value) || 0);
  }

  function mmToUnits(mm, deps = {}) {
    if (typeof deps.mmToUnits === "function") {
      return deps.mmToUnits(mm);
    }
    return Math.round((Number(mm) || 0) * 10);
  }

  function unitsToMm(units, deps = {}) {
    if (typeof deps.unitsToMm === "function") {
      return deps.unitsToMm(units);
    }
    return (Number(units) || 0) / 10;
  }

  function normalizeOrientation(value) {
    return value === "portrait" ? "portrait" : "landscape";
  }

  function normalizePaperSize(value) {
    return value === "A4" || value === "16:9" ? value : "A3";
  }

  function normalizeShowMode(value) {
    return value === "cropOnly" ? "cropOnly" : "full";
  }

  function normalizeScale(value) {
    const numeric = Math.round(Number(value) || DEFAULT_SCALE);
    return Math.max(1, numeric);
  }

  function getOrientedPaperSizeMm(entity) {
    const basePaper = getPaperSizeDefinition(normalizePaperSize(entity && entity.paperSize));
    if (normalizeOrientation(entity && entity.orientation) === "portrait") {
      return {
        widthMm: basePaper.heightMm,
        heightMm: basePaper.widthMm,
      };
    }
    return { ...basePaper };
  }

  function getWorldUnitsFromPaperMm(entity, mm, deps = {}) {
    return mmToUnits(mm * normalizeScale(entity && entity.scale), deps);
  }

  function getTitleBlockWorldSize(entity, deps = {}) {
    const paper = getOrientedPaperSizeMm(entity);
    return {
      width: getWorldUnitsFromPaperMm(entity, paper.widthMm, deps),
      height: getWorldUnitsFromPaperMm(entity, paper.heightMm, deps),
    };
  }

  function getTitleBlockBounds(entity) {
    return {
      minX: entity.x,
      minY: entity.y,
      maxX: entity.x + entity.width,
      maxY: entity.y + entity.height,
      width: entity.width,
      height: entity.height,
    };
  }

  function updateTitleBlockSizeFromScale(entity, deps = {}) {
    const centerX = roundToUnit(entity.x + entity.width / 2, deps);
    const centerY = roundToUnit(entity.y + entity.height / 2, deps);
    const nextSize = getTitleBlockWorldSize(entity, deps);
    entity.width = nextSize.width;
    entity.height = nextSize.height;
    entity.x = roundToUnit(centerX - nextSize.width / 2, deps);
    entity.y = roundToUnit(centerY - nextSize.height / 2, deps);
    return entity;
  }

  function createTitleBlockEntity(options = {}) {
    const entity = {
      id: typeof options.id === "string" && options.id ? options.id : null,
      type: "titleBlock",
      layerId: typeof options.layerId === "string" ? options.layerId : null,
      templateId: typeof options.templateId === "string" && options.templateId ? options.templateId : DEFAULT_TEMPLATE_ID,
      paperSize: normalizePaperSize(options.paperSize),
      orientation: normalizeOrientation(options.orientation || DEFAULT_ORIENTATION),
      scale: normalizeScale(options.scale),
      showMode: normalizeShowMode(options.showMode),
      title: typeof options.title === "string" ? options.title : "1F FLOOR PLAN",
      sheetNo: typeof options.sheetNo === "string" ? options.sheetNo : "A-101",
      projectName: typeof options.projectName === "string" ? options.projectName : "DraftLite Sample",
      drawnBy: typeof options.drawnBy === "string" ? options.drawnBy : "",
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    };

    updateTitleBlockSizeFromScale(entity, options);
    const center = roundWorldPoint(options.center || { x: 0, y: 0 }, options);
    entity.x = roundToUnit(center.x - entity.width / 2, options);
    entity.y = roundToUnit(center.y - entity.height / 2, options);
    return entity;
  }

  function normalizeTitleBlockEntity(entity, deps = {}) {
    if (!entity || entity.type !== "titleBlock") {
      return null;
    }
    const normalized = {
      id: typeof entity.id === "string" ? entity.id : null,
      type: "titleBlock",
      layerId: typeof entity.layerId === "string" ? entity.layerId : null,
      templateId: typeof entity.templateId === "string" && entity.templateId ? entity.templateId : DEFAULT_TEMPLATE_ID,
      paperSize: normalizePaperSize(entity.paperSize),
      orientation: normalizeOrientation(entity.orientation),
      scale: normalizeScale(entity.scale),
      showMode: normalizeShowMode(entity.showMode),
      title: typeof entity.title === "string" ? entity.title : "1F FLOOR PLAN",
      sheetNo: typeof entity.sheetNo === "string" ? entity.sheetNo : "A-101",
      projectName: typeof entity.projectName === "string" ? entity.projectName : "DraftLite Sample",
      drawnBy: typeof entity.drawnBy === "string" ? entity.drawnBy : "",
      x: roundToUnit(Number(entity.x) || 0, deps),
      y: roundToUnit(Number(entity.y) || 0, deps),
      width: roundToUnit(Number(entity.width) || 0, deps),
      height: roundToUnit(Number(entity.height) || 0, deps),
    };

    const center = {
      x: normalized.x + normalized.width / 2,
      y: normalized.y + normalized.height / 2,
    };
    updateTitleBlockSizeFromScale(normalized, deps);
    normalized.x = roundToUnit(center.x - normalized.width / 2, deps);
    normalized.y = roundToUnit(center.y - normalized.height / 2, deps);
    return normalized;
  }

  function getTitleBlockLayout(entity) {
    const template = getTemplateDefinition(entity.templateId);
    const paper = getOrientedPaperSizeMm(entity);
    const innerInsetMm = template.innerInsetMm;
    const outerInsetMm = template.outerInsetMm;
    const innerFrame = {
      xMm: innerInsetMm,
      yMm: innerInsetMm,
      widthMm: Math.max(1, paper.widthMm - innerInsetMm * 2),
      heightMm: Math.max(1, paper.heightMm - innerInsetMm * 2),
    };
    const outerBorder = {
      xMm: outerInsetMm,
      yMm: outerInsetMm,
      widthMm: Math.max(1, paper.widthMm - outerInsetMm * 2),
      heightMm: Math.max(1, paper.heightMm - outerInsetMm * 2),
    };
    const titleBlockHeightMm = template.titleBlockHeightMm;
    const cropArea = {
      xMm: innerFrame.xMm,
      yMm: innerFrame.yMm,
      widthMm: innerFrame.widthMm,
      heightMm: Math.max(1, innerFrame.heightMm - titleBlockHeightMm),
    };
    const titleBand = {
      xMm: innerFrame.xMm,
      yMm: innerFrame.yMm + cropArea.heightMm,
      widthMm: innerFrame.widthMm,
      heightMm: titleBlockHeightMm,
    };
    const halfWidthMm = innerFrame.widthMm / 2;
    const leftWing = {
      xMm: titleBand.xMm,
      yMm: titleBand.yMm,
      widthMm: halfWidthMm,
      heightMm: titleBand.heightMm,
    };
    const rightWing = {
      xMm: titleBand.xMm + halfWidthMm,
      yMm: titleBand.yMm,
      widthMm: halfWidthMm,
      heightMm: titleBand.heightMm,
    };

    return {
      template,
      paper,
      outerBorder,
      innerFrame,
      cropArea,
      titleBand,
      leftWing,
      rightWing,
    };
  }

  function localMmPointToWorld(entity, xMm, yMm, deps = {}) {
    return {
      x: roundToUnit(entity.x + getWorldUnitsFromPaperMm(entity, xMm, deps), deps),
      y: roundToUnit(entity.y + getWorldUnitsFromPaperMm(entity, yMm, deps), deps),
    };
  }

  function localMmRectToWorld(entity, rectMm, deps = {}) {
    const p1 = localMmPointToWorld(entity, rectMm.xMm, rectMm.yMm, deps);
    return {
      x: p1.x,
      y: p1.y,
      width: getWorldUnitsFromPaperMm(entity, rectMm.widthMm, deps),
      height: getWorldUnitsFromPaperMm(entity, rectMm.heightMm, deps),
    };
  }

  function rectToLines(rect, layerId) {
    const x1 = rect.x;
    const y1 = rect.y;
    const x2 = rect.x + rect.width;
    const y2 = rect.y + rect.height;
    return [
      { type: "line", layerId, p1: { x: x1, y: y1 }, p2: { x: x2, y: y1 } },
      { type: "line", layerId, p1: { x: x2, y: y1 }, p2: { x: x2, y: y2 } },
      { type: "line", layerId, p1: { x: x2, y: y2 }, p2: { x: x1, y: y2 } },
      { type: "line", layerId, p1: { x: x1, y: y2 }, p2: { x: x1, y: y1 } },
    ];
  }

  function createTextPrimitive(entity, xMm, yMm, text, heightMm, align, deps = {}, options = {}) {
    const point = localMmPointToWorld(entity, xMm, yMm, deps);
    return {
      type: "text",
      layerId: entity.layerId,
      x: point.x,
      y: point.y,
      text: String(text || ""),
      height: Math.max(1, getWorldUnitsFromPaperMm(entity, heightMm, deps)),
      rotation: 0,
      align: align || "left",
      textAnchor: "center",
      color: typeof options.color === "string" ? options.color : "",
      role: typeof options.role === "string" ? options.role : "",
      fontWeight: Number.isFinite(Number(options.fontWeight)) ? Number(options.fontWeight) : 400,
      letterSpacingEm: Number.isFinite(Number(options.letterSpacingEm)) ? Number(options.letterSpacingEm) : 0,
    };
  }

  function getTemplateTextMetrics(template, role) {
    const style = template && template.textStyles ? template.textStyles[role] : null;
    return {
      role,
      align: style && style.align ? style.align : "left",
      color: style && style.color ? style.color : "",
      fontWeight: style && Number.isFinite(Number(style.fontWeight)) ? Number(style.fontWeight) : 400,
      letterSpacingEm: style && Number.isFinite(Number(style.letterSpacingEm)) ? Number(style.letterSpacingEm) : 0,
      heightMm: style && Number.isFinite(Number(style.fontSizeMm))
        ? Number(style.fontSizeMm)
        : (style && Number.isFinite(Number(style.fontSizePt)) ? Number(style.fontSizePt) * PT_TO_MM : 2),
    };
  }

  function createCellLabelValueTextPrimitives({
    entity,
    cellRectMm,
    label,
    value,
    deps,
    labelStyle,
    valueStyle,
    paddingRightMm = 2.0,
    gapMm = 0.4,
    labelOffsetMm = 0,
  }) {
    const textRightMm = cellRectMm.xMm + cellRectMm.widthMm - paddingRightMm;
    const contentHeightMm = labelStyle.heightMm + gapMm + valueStyle.heightMm;
    const contentTopMm = cellRectMm.yMm + (cellRectMm.heightMm - contentHeightMm) / 2;
    const labelYMm = contentTopMm + labelStyle.heightMm * 0.80 + labelOffsetMm;
    const valueYMm = contentTopMm + labelStyle.heightMm + gapMm + valueStyle.heightMm * 0.80;
    return [
      createTextPrimitive(entity, textRightMm, labelYMm, label, labelStyle.heightMm, labelStyle.align, deps, labelStyle),
      createTextPrimitive(entity, textRightMm, valueYMm, value, valueStyle.heightMm, valueStyle.align, deps, valueStyle),
    ];
  }

  function getPaperShortLabel(entity) {
    const paper = normalizePaperSize(entity.paperSize);
    const orientation = normalizeOrientation(entity.orientation) === "portrait" ? "P" : "L";
    return `${paper} ${orientation}`;
  }

  function getTodayLabel() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  function getTitleBlockPrimitives(entity, deps = {}, options = {}) {
    const layout = getTitleBlockLayout(entity);
    const lines = [];
    const texts = [];
    const outerBorder = localMmRectToWorld(entity, layout.outerBorder, deps);
    const innerFrame = localMmRectToWorld(entity, layout.innerFrame, deps);
    const cropArea = localMmRectToWorld(entity, layout.cropArea, deps);
    const titleBand = localMmRectToWorld(entity, layout.titleBand, deps);
    const leftWing = localMmRectToWorld(entity, layout.leftWing, deps);
    const rightWing = localMmRectToWorld(entity, layout.rightWing, deps);
    const includeOuterBorder = options.includeOuterBorder !== false;
    const includeInnerFrame = options.includeInnerFrame !== false;
    const effectiveShowMode = options.forceFull ? "full" : normalizeShowMode(entity.showMode);

    lines.push(...rectToLines(cropArea, entity.layerId));

    if (effectiveShowMode === "full") {
      if (includeOuterBorder) {
        lines.push(...rectToLines(outerBorder, entity.layerId));
      }
      if (includeInnerFrame) {
        lines.push(...rectToLines(innerFrame, entity.layerId));
      }
      lines.push({ type: "line", layerId: entity.layerId, p1: { x: leftWing.x + leftWing.width, y: titleBand.y }, p2: { x: leftWing.x + leftWing.width, y: titleBand.y + titleBand.height } });
      lines.push({ type: "line", layerId: entity.layerId, p1: { x: rightWing.x + rightWing.width - getWorldUnitsFromPaperMm(entity, layout.template.sheetNoWidthMm, deps), y: rightWing.y }, p2: { x: rightWing.x + rightWing.width - getWorldUnitsFromPaperMm(entity, layout.template.sheetNoWidthMm, deps), y: rightWing.y + rightWing.height } });
      lines.push({ type: "line", layerId: entity.layerId, p1: { x: leftWing.x, y: leftWing.y + getWorldUnitsFromPaperMm(entity, layout.template.infoRowHeightMm, deps) }, p2: { x: leftWing.x + leftWing.width, y: leftWing.y + getWorldUnitsFromPaperMm(entity, layout.template.infoRowHeightMm, deps) } });

      const infoColumnWidthMm = layout.leftWing.widthMm / layout.template.infoColumns.length;
      for (let index = 1; index < layout.template.infoColumns.length; index += 1) {
        const xMm = layout.leftWing.xMm + infoColumnWidthMm * index;
        const start = localMmPointToWorld(entity, xMm, layout.leftWing.yMm, deps);
        const end = localMmPointToWorld(entity, xMm, layout.leftWing.yMm + layout.template.infoRowHeightMm, deps);
        lines.push({ type: "line", layerId: entity.layerId, p1: start, p2: end });
      }

      const infoLabelMetrics = getTemplateTextMetrics(layout.template, "label");
      const infoValueMetrics = getTemplateTextMetrics(layout.template, "value");
      const notesLabelMetrics = getTemplateTextMetrics(layout.template, "notesLabel");
      const titleLabelMetrics = getTemplateTextMetrics(layout.template, "titleLabel");
      const titleValueMetrics = getTemplateTextMetrics(layout.template, "titleValue");
      const infoLabelOffsetMm = -infoLabelMetrics.heightMm * 0.5;
      const infoValues = [
        entity.projectName || "-",
        entity.drawnBy || "-",
        `1:${normalizeScale(entity.scale)}`,
        getPaperShortLabel(entity),
        getTodayLabel(),
      ];
      layout.template.infoColumns.forEach((label, index) => {
        const cellRectMm = {
          xMm: layout.leftWing.xMm + infoColumnWidthMm * index,
          yMm: layout.leftWing.yMm,
          widthMm: infoColumnWidthMm,
          heightMm: layout.template.infoRowHeightMm,
        };
        texts.push(...createCellLabelValueTextPrimitives({
          entity,
          cellRectMm,
          label,
          value: infoValues[index] || "-",
          deps,
          labelStyle: { ...infoLabelMetrics, role: "infoLabel" },
          valueStyle: { ...infoValueMetrics, role: "infoValue" },
          paddingRightMm: 2.0,
          gapMm: 0.4,
          labelOffsetMm: infoLabelOffsetMm,
        }));
      });

      const notesRowRectMm = {
        xMm: layout.leftWing.xMm,
        yMm: layout.leftWing.yMm + layout.template.infoRowHeightMm,
        widthMm: layout.leftWing.widthMm,
        heightMm: layout.template.notesRowHeightMm,
      };
      const notesContentHeightMm = notesLabelMetrics.heightMm + 0.4 + infoValueMetrics.heightMm;
      const notesContentTopMm = notesRowRectMm.yMm + (notesRowRectMm.heightMm - notesContentHeightMm) / 2;
      const notesLabelYMm = notesContentTopMm + notesLabelMetrics.heightMm * 0.80 + infoLabelOffsetMm;

      texts.push(createTextPrimitive(
        entity,
        layout.leftWing.xMm + layout.leftWing.widthMm - 2.0,
        notesLabelYMm,
        "NOTES",
        notesLabelMetrics.heightMm,
        notesLabelMetrics.align,
        deps,
        { ...notesLabelMetrics, role: "notesLabel" }
      ));

      texts.push(...createCellLabelValueTextPrimitives({
        entity,
        cellRectMm: {
          xMm: layout.rightWing.xMm,
          yMm: layout.rightWing.yMm,
          widthMm: layout.rightWing.widthMm - layout.template.sheetNoWidthMm,
          heightMm: layout.rightWing.heightMm,
        },
        label: "DRAWING TITLE",
        value: entity.title || "",
        deps,
        labelStyle: { ...titleLabelMetrics, role: "titleLabel" },
        valueStyle: { ...titleValueMetrics, role: "titleValue" },
        paddingRightMm: 2.4,
        gapMm: 0.8,
        labelOffsetMm: -titleLabelMetrics.heightMm,
      }));
      texts.push(...createCellLabelValueTextPrimitives({
        entity,
        cellRectMm: {
          xMm: layout.rightWing.xMm + layout.rightWing.widthMm - layout.template.sheetNoWidthMm,
          yMm: layout.rightWing.yMm,
          widthMm: layout.template.sheetNoWidthMm,
          heightMm: layout.rightWing.heightMm,
        },
        label: "SHEET NO",
        value: entity.sheetNo || "",
        deps,
        labelStyle: { ...titleLabelMetrics, role: "titleLabel" },
        valueStyle: { ...titleValueMetrics, role: "titleValue" },
        paddingRightMm: 2.4,
        gapMm: 0.8,
        labelOffsetMm: -titleLabelMetrics.heightMm,
      }));
    }

    return {
      paperBounds: getTitleBlockBounds(entity),
      innerFrameBounds: boundsFromRect(innerFrame),
      cropBounds: getTitleBlockCropBounds(entity, deps),
      titleBandBounds: boundsFromRect(titleBand),
      lines,
      texts,
    };
  }

  function getTitleBlockCropBounds(entity, deps = {}) {
    const layout = getTitleBlockLayout(entity);
    const cropArea = localMmRectToWorld(entity, layout.cropArea, deps);
    return {
      minX: cropArea.x,
      minY: cropArea.y,
      maxX: cropArea.x + cropArea.width,
      maxY: cropArea.y + cropArea.height,
      width: cropArea.width,
      height: cropArea.height,
    };
  }

  function getTitleBlockHitGeometry(entity, deps = {}) {
    const layout = getTitleBlockLayout(entity);
    return {
      outerBorder: boundsFromRect(localMmRectToWorld(entity, layout.outerBorder, deps)),
      innerFrame: boundsFromRect(localMmRectToWorld(entity, layout.innerFrame, deps)),
      cropArea: getTitleBlockCropBounds(entity, deps),
      titleBand: boundsFromRect(localMmRectToWorld(entity, layout.titleBand, deps)),
    };
  }

  function boundsFromRect(rect) {
    return {
      minX: rect.x,
      minY: rect.y,
      maxX: rect.x + rect.width,
      maxY: rect.y + rect.height,
      width: rect.width,
      height: rect.height,
    };
  }

  function isPointNearRectBoundary(worldPoint, bounds, toleranceUnits) {
    if (!bounds) {
      return false;
    }
    const dxLeft = Math.abs(worldPoint.x - bounds.minX);
    const dxRight = Math.abs(worldPoint.x - bounds.maxX);
    const dyTop = Math.abs(worldPoint.y - bounds.minY);
    const dyBottom = Math.abs(worldPoint.y - bounds.maxY);
    const withinX = worldPoint.x >= bounds.minX - toleranceUnits && worldPoint.x <= bounds.maxX + toleranceUnits;
    const withinY = worldPoint.y >= bounds.minY - toleranceUnits && worldPoint.y <= bounds.maxY + toleranceUnits;
    return (
      (withinY && (dxLeft <= toleranceUnits || dxRight <= toleranceUnits))
      || (withinX && (dyTop <= toleranceUnits || dyBottom <= toleranceUnits))
    );
  }

  function isPointInsideBounds(worldPoint, bounds) {
    return Boolean(
      bounds
      && worldPoint.x >= bounds.minX
      && worldPoint.x <= bounds.maxX
      && worldPoint.y >= bounds.minY
      && worldPoint.y <= bounds.maxY
    );
  }

  function hitTestTitleBlock(entity, worldPoint, deps = {}) {
    const toleranceUnits = Math.max(1, Number(deps.toleranceUnits) || 1);
    const geometry = getTitleBlockHitGeometry(entity, deps);
    return (
      isPointNearRectBoundary(worldPoint, geometry.outerBorder, toleranceUnits)
      || isPointNearRectBoundary(worldPoint, geometry.innerFrame, toleranceUnits)
      || isPointNearRectBoundary(worldPoint, geometry.cropArea, toleranceUnits)
      || isPointInsideBounds(worldPoint, geometry.titleBand)
    );
  }

  function getDxfPrimitives(entity, deps = {}) {
    const primitives = getTitleBlockPrimitives(entity, deps);
    return {
      lines: primitives.lines,
      texts: primitives.texts,
    };
  }

  function drawWorldLine(ctx, projectPoint, line, options = {}) {
    const start = projectPoint(line.p1);
    const end = projectPoint(line.p2);
    ctx.save();
    ctx.strokeStyle = options.strokeStyle;
    ctx.lineWidth = options.lineWidth;
    if (options.dash) {
      ctx.setLineDash(options.dash);
    }
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawWorldText(ctx, projectPoint, textEntity, options = {}) {
    const point = projectPoint({ x: textEntity.x, y: textEntity.y });
    const fontPx = Math.abs(options.unitsToPixels(textEntity.height));
    if (fontPx < 1.5) {
      return;
    }
    ctx.save();
    ctx.fillStyle = textEntity.color || options.fillStyle;
    ctx.font = `${Math.max(400, Number(textEntity.fontWeight) || 400)} ${fontPx}px sans-serif`;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = textEntity.align || "left";
    if (Number.isFinite(Number(textEntity.rotationRad))) {
      ctx.translate(point.x, point.y);
      ctx.rotate(Number(textEntity.rotationRad));
      ctx.fillText(String(textEntity.text || ""), 0, 0);
    } else {
      ctx.fillText(String(textEntity.text || ""), point.x, point.y);
    }
    ctx.restore();
  }

  function drawDimensionTextToCanvas(ctx, projectPoint, unitsToPixels, textEntity, fallbackColor) {
    const point = projectPoint({ x: textEntity.x, y: textEntity.y });
    const fontPx = Math.abs(unitsToPixels(textEntity.height));
    if (fontPx < 1.5) {
      return;
    }
    ctx.save();
    ctx.fillStyle = textEntity.color || fallbackColor;
    ctx.font = `${Math.max(400, Number(textEntity.fontWeight) || 400)} ${fontPx}px sans-serif`;
    ctx.textAlign = textEntity.align || "center";
    ctx.textBaseline = "middle";
    ctx.translate(point.x, point.y);
    ctx.rotate(Number(textEntity.rotationRad) || 0);
    ctx.fillText(String(textEntity.text || ""), 0, 0);
    ctx.restore();
  }

  function drawDimensionEntityToCanvas(ctx, entity, projector, deps = {}, options = {}) {
    const projectPoint = projector.projectPoint;
    const unitsToPixels = projector.unitsToPixels;
    const dimensionData = getDimensionExportData(entity, deps);
    const geometryColor = dimensionData.geometryColor || options.geometryColor || options.textColor || "#2e3135";
    const textColor = dimensionData.text.color || options.textColor || geometryColor;
    [
      [dimensionData.geometry.extensionStart1, dimensionData.geometry.o1],
      [dimensionData.geometry.extensionStart2, dimensionData.geometry.o2],
      [dimensionData.geometry.o1, dimensionData.geometry.o2],
    ].forEach(([start, end]) => {
      drawWorldLine(ctx, projectPoint, { p1: start, p2: end }, {
        strokeStyle: geometryColor,
        lineWidth: options.lineWidth,
      });
    });
    if (dimensionData.tickRadiusUnits > 0) {
      const tickRadiusPx = Math.abs(unitsToPixels(dimensionData.tickRadiusUnits));
      if (tickRadiusPx >= 0.75) {
        [dimensionData.geometry.o1, dimensionData.geometry.o2].forEach((point) => {
          const projected = projectPoint(point);
          ctx.save();
          ctx.fillStyle = geometryColor;
          ctx.beginPath();
          ctx.arc(projected.x, projected.y, tickRadiusPx, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        });
      }
    }
    drawDimensionTextToCanvas(ctx, projectPoint, unitsToPixels, {
      ...dimensionData.text,
      color: textColor,
    }, textColor);
  }

  function drawTitleBlockTemplateA3StandardV6(ctx, entity, deps = {}) {
    const projectPoint = deps.projectPoint;
    const unitsToPixels = deps.unitsToPixels;
    const primitives = getTitleBlockPrimitives(entity, deps);
    const isSelected = Boolean(deps.isSelected);
    const showMode = normalizeShowMode(entity.showMode);
    const screenBounds = deps.projectBounds(primitives.paperBounds);
    const cropScreenBounds = deps.projectBounds(primitives.cropBounds);

    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = "rgba(194, 105, 62, 0.28)";
      ctx.lineWidth = 10;
      ctx.strokeRect(screenBounds.x, screenBounds.y, screenBounds.width, screenBounds.height);
      ctx.restore();
    }

    if (showMode === "cropOnly") {
      ctx.save();
      ctx.strokeStyle = "rgba(194, 105, 62, 0.88)";
      ctx.lineWidth = Math.max(1.4, Math.abs(unitsToPixels(mmToUnits(0.6, deps))));
      ctx.strokeRect(cropScreenBounds.x, cropScreenBounds.y, cropScreenBounds.width, cropScreenBounds.height);
      ctx.setLineDash([10, 6]);
      ctx.strokeStyle = "rgba(98, 73, 45, 0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(screenBounds.x, screenBounds.y, screenBounds.width, screenBounds.height);
      ctx.restore();
      return;
    }

    const strokeColor = deps.strokeColor || "#2e3135";
    primitives.lines.forEach((line) => {
      drawWorldLine(ctx, projectPoint, line, {
        strokeStyle: strokeColor,
        lineWidth: Math.max(1, Math.abs(unitsToPixels(mmToUnits(0.35, deps)))),
      });
    });
    primitives.texts.forEach((textEntity) => {
      drawWorldText(ctx, projectPoint, textEntity, {
        fillStyle: strokeColor,
        unitsToPixels,
      });
    });
  }

  function drawTitleBlock(ctx, entity, deps = {}) {
    const templateId = typeof entity.templateId === "string" ? entity.templateId : DEFAULT_TEMPLATE_ID;
    if (templateId === "a3-standard-v6") {
      drawTitleBlockTemplateA3StandardV6(ctx, entity, deps);
      return;
    }
    drawTitleBlockTemplateA3StandardV6(ctx, entity, deps);
  }

  function buildTitleBlockProperties(options = {}) {
    const entity = options.entity;
    const container = options.container;
    if (!entity || !container) {
      return;
    }
    container.innerHTML = "";

    const appendSection = (title) => {
      const section = document.createElement("section");
      section.className = "prop-section";
      const heading = document.createElement("h4");
      heading.className = "prop-section-title";
      heading.textContent = title;
      const grid = document.createElement("div");
      grid.className = "prop-grid";
      section.append(heading, grid);
      container.appendChild(section);
      return grid;
    };

    const addRow = (grid, labelText, element) => {
      const label = document.createElement("label");
      label.className = "prop-label";
      label.textContent = labelText;
      const value = document.createElement("div");
      value.className = "prop-value";
      value.appendChild(element);
      grid.append(label, value);
    };

    const createSelect = (value, entries, onChange) => {
      const select = document.createElement("select");
      entries.forEach((entry) => {
        const option = document.createElement("option");
        option.value = entry.value;
        option.textContent = entry.label;
        option.selected = entry.value === value;
        select.appendChild(option);
      });
      select.addEventListener("change", () => onChange(select.value));
      return select;
    };

    const createTextInput = (value, onChange) => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = value || "";
      input.addEventListener("change", () => onChange(input.value));
      return input;
    };

    const createScaleInput = (value, onChange) => {
      const input = document.createElement("input");
      input.type = "number";
      input.min = "1";
      input.step = "1";
      input.value = String(value || DEFAULT_SCALE);
      input.setAttribute("list", "titleBlockScaleOptions");
      const list = document.createElement("datalist");
      list.id = "titleBlockScaleOptions";
      SCALE_OPTIONS.forEach((scale) => {
        const option = document.createElement("option");
        option.value = String(scale);
        list.appendChild(option);
      });
      input.addEventListener("change", () => onChange(input.value));
      const wrap = document.createElement("div");
      wrap.append(input, list);
      return wrap;
    };

    const createToggle = (value, entries, onChange) => {
      const row = document.createElement("div");
      row.className = "title-block-toggle-row";
      entries.forEach((entry) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `panel-button${entry.value === value ? " is-active" : ""}`;
        button.textContent = entry.label;
        button.addEventListener("click", () => onChange(entry.value));
        row.appendChild(button);
      });
      return row;
    };

    const generalGrid = appendSection("General");
    const typeText = document.createElement("span");
    typeText.className = "prop-static";
    typeText.textContent = "Title Block";
    addRow(generalGrid, "Type", typeText);
    addRow(generalGrid, "Template", createSelect(entity.templateId, [
      { value: "a3-standard-v6", label: "A3 Standard v6" },
    ], (value) => options.onChange({ templateId: value }, "Title Block template updated.")));
    addRow(generalGrid, "Paper Type", createSelect(entity.paperSize, [
      { value: "A3", label: "A3" },
      { value: "A4", label: "A4" },
      { value: "16:9", label: "16:9" },
    ], (value) => options.onChange({ paperSize: value }, "Title Block paper updated.")));
    addRow(generalGrid, "Orientation", createToggle(entity.orientation, [
      { value: "landscape", label: "Landscape" },
      { value: "portrait", label: "Portrait" },
    ], (value) => options.onChange({ orientation: value }, "Title Block orientation updated.")));
    addRow(generalGrid, "Scale", createScaleInput(entity.scale, (value) => options.onChange({ scale: value }, "Title Block scale updated.")));
    addRow(generalGrid, "Display", createToggle(entity.showMode, [
      { value: "full", label: "Full Title Block" },
      { value: "cropOnly", label: "Crop Area Only" },
    ], (value) => options.onChange({ showMode: value }, "Title Block display updated.")));

    const textGrid = appendSection("Sheet Data");
    addRow(textGrid, "Drawing Title", createTextInput(entity.title, (value) => options.onChange({ title: value }, "Title updated.")));
    addRow(textGrid, "Sheet No", createTextInput(entity.sheetNo, (value) => options.onChange({ sheetNo: value }, "Sheet No updated.")));
    addRow(textGrid, "Project Name", createTextInput(entity.projectName, (value) => options.onChange({ projectName: value }, "Project Name updated.")));
    addRow(textGrid, "Drawn By", createTextInput(entity.drawnBy, (value) => options.onChange({ drawnBy: value }, "Drawn By updated.")));

    const exportGrid = appendSection("Export");
    const exportRow = document.createElement("div");
    exportRow.className = "title-block-export-row";
    [
      { label: "SCREEN SHOT", handler: options.onScreenshot },
      { label: "PDF", handler: options.onPdf },
      { label: "DXF", handler: options.onDxf },
    ].forEach((entry) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "panel-button";
      button.textContent = entry.label;
      button.addEventListener("click", () => {
        if (typeof entry.handler === "function") {
          entry.handler();
        }
      });
      exportRow.appendChild(button);
    });
    addRow(exportGrid, "Output", exportRow);
  }

  function updateTitleBlockFromProperties(entity, patch = {}, deps = {}) {
    if (!entity || entity.type !== "titleBlock") {
      return entity;
    }
    const nextPatch = { ...patch };
    if (Object.prototype.hasOwnProperty.call(nextPatch, "templateId")) {
      entity.templateId = typeof nextPatch.templateId === "string" && nextPatch.templateId ? nextPatch.templateId : DEFAULT_TEMPLATE_ID;
    }
    if (Object.prototype.hasOwnProperty.call(nextPatch, "paperSize")) {
      entity.paperSize = normalizePaperSize(nextPatch.paperSize);
    }
    if (Object.prototype.hasOwnProperty.call(nextPatch, "orientation")) {
      entity.orientation = normalizeOrientation(nextPatch.orientation);
    }
    if (Object.prototype.hasOwnProperty.call(nextPatch, "scale")) {
      entity.scale = normalizeScale(nextPatch.scale);
    }
    if (Object.prototype.hasOwnProperty.call(nextPatch, "showMode")) {
      entity.showMode = normalizeShowMode(nextPatch.showMode);
    }
    if (Object.prototype.hasOwnProperty.call(nextPatch, "title")) {
      entity.title = String(nextPatch.title || "");
    }
    if (Object.prototype.hasOwnProperty.call(nextPatch, "sheetNo")) {
      entity.sheetNo = String(nextPatch.sheetNo || "");
    }
    if (Object.prototype.hasOwnProperty.call(nextPatch, "projectName")) {
      entity.projectName = String(nextPatch.projectName || "");
    }
    if (Object.prototype.hasOwnProperty.call(nextPatch, "drawnBy")) {
      entity.drawnBy = String(nextPatch.drawnBy || "");
    }
    if (
      Object.prototype.hasOwnProperty.call(nextPatch, "templateId")
      || Object.prototype.hasOwnProperty.call(nextPatch, "paperSize")
      || Object.prototype.hasOwnProperty.call(nextPatch, "orientation")
      || Object.prototype.hasOwnProperty.call(nextPatch, "scale")
    ) {
      updateTitleBlockSizeFromScale(entity, deps);
    }
    return entity;
  }

  function getEntityBoundsUnits(entity, deps = {}) {
    if (!entity) {
      return null;
    }
    if (entity.type === "titleBlock") {
      return getTitleBlockBounds(entity);
    }
    if (typeof deps.getEntityBoundsUnits === "function") {
      return deps.getEntityBoundsUnits(entity);
    }
    return null;
  }

  function isBoundsFullyInside(inner, outer) {
    return Boolean(
      inner
      && outer
      && inner.minX >= outer.minX
      && inner.maxX <= outer.maxX
      && inner.minY >= outer.minY
      && inner.maxY <= outer.maxY
    );
  }

  function collectEntitiesForExport(titleBlockEntity, deps = {}) {
    const cropBounds = getTitleBlockCropBounds(titleBlockEntity, deps);
    const entities = Array.isArray(deps.entities) ? deps.entities : [];
    const isLayerVisible = typeof deps.isLayerVisible === "function"
      ? deps.isLayerVisible
      : () => true;

    const included = entities.filter((entity) => {
      if (!entity || entity.id === titleBlockEntity.id) {
        return false;
      }
      if (entity.type === "titleBlock") {
        return false;
      }
      if (!isLayerVisible(entity.layerId)) {
        return false;
      }
      return isBoundsFullyInside(getEntityBoundsUnits(entity, deps), cropBounds);
    });
    return [...included, titleBlockEntity];
  }

  function createWorldProjector(bounds, canvasWidth, canvasHeight) {
    const widthUnits = Math.max(1, bounds.maxX - bounds.minX);
    const heightUnits = Math.max(1, bounds.maxY - bounds.minY);
    const scaleX = canvasWidth / widthUnits;
    const scaleY = canvasHeight / heightUnits;
    return {
      projectPoint(point) {
        return {
          x: (point.x - bounds.minX) * scaleX,
          y: (point.y - bounds.minY) * scaleY,
        };
      },
      projectBounds(nextBounds) {
        return {
          x: (nextBounds.minX - bounds.minX) * scaleX,
          y: (nextBounds.minY - bounds.minY) * scaleY,
          width: (nextBounds.maxX - nextBounds.minX) * scaleX,
          height: (nextBounds.maxY - nextBounds.minY) * scaleY,
        };
      },
      unitsToPixels(units) {
        return units * scaleY;
      },
    };
  }

  function createRasterExportProjector(bounds, scale, canvasWidth, canvasHeight, deps = {}) {
    const effectiveScale = Math.max(1, Number(scale) || 1);
    const widthMm = unitsToMm(bounds.maxX - bounds.minX, deps) / effectiveScale;
    const heightMm = unitsToMm(bounds.maxY - bounds.minY, deps) / effectiveScale;
    const scaleX = canvasWidth / Math.max(1e-6, widthMm);
    const scaleY = canvasHeight / Math.max(1e-6, heightMm);
    return {
      projectPoint(point) {
        return {
          x: (unitsToMm(point.x - bounds.minX, deps) / effectiveScale) * scaleX,
          y: (unitsToMm(point.y - bounds.minY, deps) / effectiveScale) * scaleY,
        };
      },
      projectBounds(nextBounds) {
        return {
          x: (unitsToMm(nextBounds.minX - bounds.minX, deps) / effectiveScale) * scaleX,
          y: (unitsToMm(nextBounds.minY - bounds.minY, deps) / effectiveScale) * scaleY,
          width: (unitsToMm(nextBounds.maxX - nextBounds.minX, deps) / effectiveScale) * scaleX,
          height: (unitsToMm(nextBounds.maxY - nextBounds.minY, deps) / effectiveScale) * scaleY,
        };
      },
      unitsToPixels(units) {
        return (unitsToMm(units, deps) / effectiveScale) * scaleY;
      },
    };
  }

  function createExportCanvas(titleBlockEntity, deps = {}) {
    const paper = getOrientedPaperSizeMm(titleBlockEntity);
    const pixelsPerMm = Number(deps.pixelsPerMm) || (PNG_DPI / 25.4);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(paper.widthMm * pixelsPerMm));
    canvas.height = Math.max(1, Math.round(paper.heightMm * pixelsPerMm));
    const context = canvas.getContext("2d");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    return { canvas, context };
  }

  function getFallbackDimensionGeometry(entity) {
    const dx = entity.p2.x - entity.p1.x;
    const dy = entity.p2.y - entity.p1.y;
    const length = Math.hypot(dx, dy) || 1;
    const normal = { x: -dy / length, y: dx / length };
    const midpoint = {
      x: entity.p1.x + dx / 2,
      y: entity.p1.y + dy / 2,
    };
    const d1 = (entity.offsetPoint.x - entity.p1.x) * normal.x + (entity.offsetPoint.y - entity.p1.y) * normal.y;
    const d2 = (entity.offsetPoint.x - entity.p2.x) * normal.x + (entity.offsetPoint.y - entity.p2.y) * normal.y;
    const signedOffset = (d1 + d2) / 2;
    const o1 = { x: entity.p1.x + normal.x * d1, y: entity.p1.y + normal.y * d1 };
    const o2 = { x: entity.p2.x + normal.x * d2, y: entity.p2.y + normal.y * d2 };
    const gap = Number.isFinite(entity.extensionGap) ? Math.max(0, entity.extensionGap) : 90;
    const extensionStart1 = Math.abs(d1) <= gap ? entity.p1 : { x: entity.p1.x + normal.x * Math.sign(d1) * gap, y: entity.p1.y + normal.y * Math.sign(d1) * gap };
    const extensionStart2 = Math.abs(d2) <= gap ? entity.p2 : { x: entity.p2.x + normal.x * Math.sign(d2) * gap, y: entity.p2.y + normal.y * Math.sign(d2) * gap };
    return {
      o1,
      o2,
      extensionStart1,
      extensionStart2,
      midpoint,
      normal,
      signedOffset,
      offsetHandlePoint: {
        x: midpoint.x + normal.x * signedOffset,
        y: midpoint.y + normal.y * signedOffset,
      },
    };
  }

  function getFallbackDimensionDisplayText(entity, deps = {}) {
    const override = String(entity.textOverride || "").trim();
    if (override) {
      return override;
    }
    const distanceUnits = Math.hypot(entity.p2.x - entity.p1.x, entity.p2.y - entity.p1.y);
    const precision = Math.max(0, Math.min(3, Math.round(Number(entity.precision) || 0)));
    return unitsToMm(distanceUnits, deps).toFixed(precision);
  }

  function getFallbackDimensionTextNormal(lineDx, lineDy, lineLen) {
    const safeLen = lineLen || 1;
    const baseNormal = { x: -lineDy / safeLen, y: lineDx / safeLen };
    const verticalBiasThreshold = 0.86;
    if (Math.abs(lineDx) >= Math.abs(lineDy)) {
      return baseNormal.y <= 0 ? baseNormal : { x: -baseNormal.x, y: -baseNormal.y };
    }
    if (Math.abs(lineDy / safeLen) >= verticalBiasThreshold) {
      return baseNormal.x <= 0 ? baseNormal : { x: -baseNormal.x, y: -baseNormal.y };
    }
    return baseNormal.y <= 0 ? baseNormal : { x: -baseNormal.x, y: -baseNormal.y };
  }

  function normalizeAngleRad(angleRad) {
    let angle = Number(angleRad) || 0;
    while (angle <= -Math.PI) angle += Math.PI * 2;
    while (angle > Math.PI) angle -= Math.PI * 2;
    return angle;
  }

  function isNearlyVerticalAngle(angleRad) {
    const normalized = normalizeAngleRad(angleRad);
    const absCos = Math.abs(Math.cos(normalized));
    return absCos < 0.25;
  }

  function normalizeDimensionTextRotation(angleRad) {
    let angle = normalizeAngleRad(angleRad);
    if (!isNearlyVerticalAngle(angle)) {
      if (angle > Math.PI / 2 || angle < -Math.PI / 2) {
        angle += Math.PI;
      }
      return normalizeAngleRad(angle);
    }
    angle += Math.PI;
    return normalizeAngleRad(angle);
  }

  function getFallbackDimensionTextLayout(entity, geometry, deps = {}) {
    const lineDx = geometry.o2.x - geometry.o1.x;
    const lineDy = geometry.o2.y - geometry.o1.y;
    const lineLen = Math.hypot(lineDx, lineDy) || 1;
    const midpoint = {
      x: (geometry.o1.x + geometry.o2.x) / 2,
      y: (geometry.o1.y + geometry.o2.y) / 2,
    };
    const textNormal = getFallbackDimensionTextNormal(lineDx, lineDy, lineLen);
    const textOffsetUnits = (entity.textHeight || 250) * 0.55;
    const textAngleRad = normalizeDimensionTextRotation(Math.atan2(lineDy, lineDx));
    return {
      text: getFallbackDimensionDisplayText(entity, deps),
      textAngleRad,
      textNormal,
      textOffsetUnits,
      textPosition: {
        x: midpoint.x + textNormal.x * textOffsetUnits,
        y: midpoint.y + textNormal.y * textOffsetUnits,
      },
    };
  }

  function getDimensionExportData(entity, deps = {}) {
    const geometry = typeof deps.getDimensionGeometryForExport === "function"
      ? deps.getDimensionGeometryForExport(entity)
      : getFallbackDimensionGeometry(entity);
    const textLayout = typeof deps.getDimensionTextLayoutForExport === "function"
      ? deps.getDimensionTextLayoutForExport(entity)
      : getFallbackDimensionTextLayout(entity, geometry, deps);
    const text = typeof deps.getDimensionDisplayTextForExport === "function"
      ? deps.getDimensionDisplayTextForExport(entity)
      : getFallbackDimensionDisplayText(entity, deps);
    const tickRadiusUnits = typeof deps.getDimensionTickRadiusUnitsForExport === "function"
      ? Math.abs(Number(deps.getDimensionTickRadiusUnitsForExport(entity)) || 0)
      : Math.abs((entity.tickSize || 250) * 0.06);
    return {
      geometry,
      text: {
        type: "text",
        x: textLayout.textPosition.x,
        y: textLayout.textPosition.y,
        text,
        height: entity.textHeight || 250,
        align: "center",
        rotationRad: textLayout.textAngleRad,
        color: typeof deps.getDimensionTextColorForExport === "function"
          ? deps.getDimensionTextColorForExport(entity)
          : "",
        fontWeight: 400,
        baselineShiftEm: 0.35,
      },
      tickRadiusUnits,
      geometryColor: typeof deps.getDimensionGeometryColorForExport === "function"
        ? deps.getDimensionGeometryColorForExport(entity)
        : "",
    };
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeHexColor(color, fallback = "#2e3135") {
    const label = String(color || "").trim();
    if (/^#[0-9a-f]{6}$/i.test(label)) {
      return label;
    }
    if (/^#[0-9a-f]{3}$/i.test(label)) {
      return `#${label.slice(1).split("").map((char) => char + char).join("")}`;
    }
    return fallback;
  }

  function hexToRgb01(color) {
    const hex = normalizeHexColor(color);
    return [
      parseInt(hex.slice(1, 3), 16) / 255,
      parseInt(hex.slice(3, 5), 16) / 255,
      parseInt(hex.slice(5, 7), 16) / 255,
    ];
  }

  function blendColorOverWhite(hexColor, alpha) {
    const rgb = hexToRgb01(hexColor);
    const effectiveAlpha = clamp(Number(alpha) || 0, 0, 1);
    return [
      1 - effectiveAlpha + rgb[0] * effectiveAlpha,
      1 - effectiveAlpha + rgb[1] * effectiveAlpha,
      1 - effectiveAlpha + rgb[2] * effectiveAlpha,
    ];
  }

  function rgb01ToCss(rgb, alpha) {
    const values = Array.isArray(rgb) ? rgb : [0, 0, 0];
    const r = Math.round(clamp(values[0] || 0, 0, 1) * 255);
    const g = Math.round(clamp(values[1] || 0, 0, 1) * 255);
    const b = Math.round(clamp(values[2] || 0, 0, 1) * 255);
    if (Number.isFinite(alpha)) {
      return `rgba(${r}, ${g}, ${b}, ${clamp(alpha, 0, 1).toFixed(3)})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
  }

  function resolveExportEntityStyle(entity, deps) {
    const layerColor = typeof deps.getLayerColor === "function" ? deps.getLayerColor(entity.layerId) : "#2e3135";
    const strokeColor = normalizeHexColor(entity.color || entity.strokeColor || entity.lineColor || layerColor, layerColor);
    const fillColor = normalizeHexColor(entity.fillColor || strokeColor, strokeColor);
    const opacity = Number.isFinite(Number(entity.opacity)) ? clamp(Number(entity.opacity), 0, 1) : 1;
    let fillAlpha;
    if (Number.isFinite(Number(entity.fillAlpha))) {
      fillAlpha = clamp(Number(entity.fillAlpha), 0, 1);
    } else {
      fillAlpha = 0.18;
    }
    return {
      strokeColor,
      fillColor,
      opacity,
      fillAlpha,
      strokeWidthMm: PDF_STYLE.normalStrokeWidthMm,
    };
  }

  function renderEntityToCanvas(ctx, entity, projector, deps = {}) {
    const isPrintExport = deps.exportMode === "print";
    const projectPoint = projector.projectPoint;
    const unitsToPixels = projector.unitsToPixels;
    const style = resolveExportEntityStyle(entity, deps);
    const strokeStyle = style.strokeColor;
    const fillStyle = style.fillColor;
    const normalStrokePx = isPrintExport
      ? Math.max(1, Math.abs(unitsToPixels(mmToUnits(style.strokeWidthMm, deps))))
      : 1.1;
    const titleBlockStrokePx = isPrintExport
      ? Math.max(1, Math.abs(unitsToPixels(mmToUnits(PDF_STYLE.titleBlockStrokeWidthMm, deps))))
      : 1.1;

    if (entity.type === "line") {
      drawWorldLine(ctx, projectPoint, entity, { strokeStyle, lineWidth: normalStrokePx });
      return;
    }
    if (entity.type === "rect") {
      const start = projectPoint({ x: entity.x, y: entity.y });
      const end = projectPoint({ x: entity.x + entity.width, y: entity.y + entity.height });
      const width = end.x - start.x;
      const height = end.y - start.y;
      ctx.save();
      if (entity.fill !== false) {
        ctx.globalAlpha = style.fillAlpha;
        ctx.fillStyle = fillStyle;
        ctx.fillRect(start.x, start.y, width, height);
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = normalStrokePx;
      ctx.strokeRect(start.x, start.y, width, height);
      ctx.restore();
      return;
    }
    if (entity.type === "circle") {
      const center = projectPoint(entity.center);
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = normalStrokePx;
      ctx.beginPath();
      ctx.arc(center.x, center.y, Math.max(1, Math.abs(unitsToPixels(entity.radius))), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (entity.type === "arc") {
      const center = projectPoint(entity.center);
      ctx.save();
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = normalStrokePx;
      ctx.beginPath();
      ctx.arc(
        center.x,
        center.y,
        Math.max(1, Math.abs(unitsToPixels(entity.radius))),
        (Number(entity.startAngleDeg) || 0) * Math.PI / 180,
        (Number(entity.endAngleDeg) || 0) * Math.PI / 180
      );
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (entity.type === "filledRegion") {
      const points = (entity.points || []).map(projectPoint);
      if (points.length < 3) {
        return;
      }
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      if (entity.fill !== false) {
        ctx.globalAlpha = style.fillAlpha;
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = strokeStyle;
      ctx.lineWidth = normalStrokePx;
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (entity.type === "text") {
      drawWorldText(ctx, projectPoint, entity, { fillStyle: strokeStyle, unitsToPixels });
      return;
    }
    if (entity.type === "dimension") {
      drawDimensionEntityToCanvas(ctx, entity, projector, deps, {
        geometryColor: typeof deps.getDimensionGeometryColorForExport === "function"
          ? deps.getDimensionGeometryColorForExport(entity)
          : strokeStyle,
        textColor: typeof deps.getDimensionTextColorForExport === "function"
          ? deps.getDimensionTextColorForExport(entity)
          : strokeStyle,
        lineWidth: normalStrokePx,
      });
      return;
    }
    if (entity.type === "titleBlock") {
      if (isPrintExport) {
        const primitives = getTitleBlockPrimitives(entity, deps, {
          includeOuterBorder: false,
          includeInnerFrame: true,
          forceFull: true,
        });
        primitives.lines.forEach((line) => {
          drawWorldLine(ctx, projectPoint, line, {
            strokeStyle,
            lineWidth: titleBlockStrokePx,
          });
        });
        primitives.texts.forEach((textEntity) => {
          drawWorldText(ctx, projectPoint, textEntity, {
            fillStyle: rgb01ToCss(PDF_STYLE.textRgb),
            unitsToPixels,
          });
        });
        return;
      }
      drawTitleBlock(ctx, entity, {
        projectPoint,
        projectBounds: projector.projectBounds,
        unitsToPixels,
        strokeColor: strokeStyle,
        isSelected: false,
        mmToUnits: deps.mmToUnits,
        roundToUnit: deps.roundToUnit,
      });
    }
  }

  function renderTitleBlockSelectionCanvas(titleBlockEntity, deps = {}) {
    const includedEntities = collectEntitiesForExport(titleBlockEntity, deps);
    const { canvas, context } = createExportCanvas(titleBlockEntity, deps);
    const projector = createRasterExportProjector(
      getTitleBlockBounds(titleBlockEntity),
      titleBlockEntity.scale,
      canvas.width,
      canvas.height,
      deps
    );
    includedEntities.forEach((entity) => {
      renderEntityToCanvas(context, entity, projector, {
        ...deps,
        exportMode: "print",
      });
    });
    return canvas;
  }

  function blobFromCanvas(canvas, type) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error(`Failed to create ${type} blob.`));
      }, type);
    });
  }

  async function saveBlob(blob, suggestedName, types, deps = {}) {
    if (typeof window.showSaveFilePicker === "function") {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types,
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return { ok: true, method: "picker" };
      } catch (error) {
        if (error && error.name === "AbortError") {
          return { ok: false, cancelled: true };
        }
      }
    }
    if (typeof deps.downloadBlob === "function") {
      deps.downloadBlob(blob, suggestedName);
      return { ok: true, method: "download" };
    }
    return { ok: false };
  }

  function mmToPt(mm) {
    return (Number(mm) || 0) * 72 / 25.4;
  }

  function createPdfProjector(bounds, scale, deps = {}) {
    const effectiveScale = Math.max(1, Number(scale) || 1);
    const widthMm = unitsToMm(bounds.maxX - bounds.minX, deps) / effectiveScale;
    const heightMm = unitsToMm(bounds.maxY - bounds.minY, deps) / effectiveScale;
    const widthPt = mmToPt(widthMm);
    const heightPt = mmToPt(heightMm);
    return {
      widthPt,
      heightPt,
      projectPoint(point) {
        return {
          x: mmToPt(unitsToMm(point.x - bounds.minX, deps) / effectiveScale),
          y: mmToPt(unitsToMm(bounds.maxY - point.y, deps) / effectiveScale),
        };
      },
      fontSizePt(heightUnits) {
        return mmToPt(unitsToMm(heightUnits, deps) / effectiveScale);
      },
      strokeWidthPt(widthMmValue) {
        return Math.max(PDF_STYLE.minStrokeWidthPt, mmToPt(widthMmValue));
      },
    };
  }

  function getPdfMeasureContext() {
    if (!document || typeof document.createElement !== "function") {
      return null;
    }
    const canvas = document.createElement("canvas");
    return canvas && typeof canvas.getContext === "function" ? canvas.getContext("2d") : null;
  }

  function estimatePdfTextWidthPt(textOrEntity, fontSizePt, deps = {}) {
    const context = deps.measureContext || getPdfMeasureContext();
    const label = typeof textOrEntity === "object" && textOrEntity
      ? String(textOrEntity.text || "")
      : String(textOrEntity || "");
    const fontWeight = typeof textOrEntity === "object" && textOrEntity && Number(textOrEntity.fontWeight) >= 600 ? 700 : 400;
    if (!context || typeof context.measureText !== "function") {
      return label.length * fontSizePt * 0.52;
    }
    const fontPx = fontSizePt * 96 / 72;
    context.font = `${fontWeight} ${fontPx}px Helvetica, Arial, sans-serif`;
    return context.measureText(label).width * 72 / 96;
  }

  function escapePdfText(text) {
    return String(text || "")
      .replace(/[^\x20-\x7E]/g, "?")
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)")
      .replace(/\r/g, " ")
      .replace(/\n/g, " ");
  }

  function formatPdfNumber(value) {
    return Number(value).toFixed(3);
  }

  function pdfRgbCommand(rgb, operator) {
    return `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} ${operator}`;
  }

  function buildPdfLineCommands(projector, line, strokeWidthPt, strokeRgb = PDF_STYLE.strokeRgb) {
    const start = projector.projectPoint(line.p1);
    const end = projector.projectPoint(line.p2);
    return [
      pdfRgbCommand(strokeRgb, "RG"),
      `${formatPdfNumber(strokeWidthPt)} w`,
      `${formatPdfNumber(start.x)} ${formatPdfNumber(start.y)} m`,
      `${formatPdfNumber(end.x)} ${formatPdfNumber(end.y)} l`,
      "S",
    ];
  }

  function buildPdfPolygonCommands(projector, points, options = {}) {
    if (!Array.isArray(points) || points.length < 2) {
      return [];
    }
    const projected = points.map((point) => projector.projectPoint(point));
    const commands = [];
    if (Array.isArray(options.strokeRgb)) {
      commands.push(pdfRgbCommand(options.strokeRgb, "RG"));
    }
    if (Array.isArray(options.fillRgb)) {
      commands.push(pdfRgbCommand(options.fillRgb, "rg"));
    }
    commands.push(`${formatPdfNumber(options.strokeWidthPt || PDF_STYLE.minStrokeWidthPt)} w`);
    commands.push(`${formatPdfNumber(projected[0].x)} ${formatPdfNumber(projected[0].y)} m`);
    for (let index = 1; index < projected.length; index += 1) {
      commands.push(`${formatPdfNumber(projected[index].x)} ${formatPdfNumber(projected[index].y)} l`);
    }
    if (options.closePath !== false) {
      commands.push("h");
    }
    if (options.fill && options.stroke) {
      commands.push("B");
    } else if (options.fill) {
      commands.push("f");
    } else {
      commands.push("S");
    }
    return commands;
  }

  function approximateCirclePoints(center, radius, segments = 48) {
    const points = [];
    for (let index = 0; index < segments; index += 1) {
      const angle = (Math.PI * 2 * index) / segments;
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
    return points;
  }

  function approximateArcPoints(center, radius, startAngleDeg, endAngleDeg, segments = 24) {
    const startRad = (Number(startAngleDeg) || 0) * Math.PI / 180;
    let endRad = (Number(endAngleDeg) || 0) * Math.PI / 180;
    while (endRad <= startRad) {
      endRad += Math.PI * 2;
    }
    const points = [];
    for (let index = 0; index <= segments; index += 1) {
      const t = index / segments;
      const angle = startRad + (endRad - startRad) * t;
      points.push({
        x: center.x + Math.cos(angle) * radius,
        y: center.y + Math.sin(angle) * radius,
      });
    }
    return points;
  }

  function buildPdfTextCommands(projector, textEntity, deps = {}) {
    const point = projector.projectPoint({ x: textEntity.x, y: textEntity.y });
    const fontSizePt = projector.fontSizePt(textEntity.height);
    const widthPt = estimatePdfTextWidthPt(textEntity, fontSizePt, deps);
    let textOffsetXPt = 0;
    if (textEntity.align === "right") {
      textOffsetXPt -= widthPt;
    } else if (textEntity.align === "center") {
      textOffsetXPt -= widthPt / 2;
    }
    const textRgb = textEntity.color ? hexToRgb01(textEntity.color) : PDF_STYLE.textRgb;
    const fontName = Number(textEntity.fontWeight) >= 600 ? "/F2" : "/F1";
    const charSpacingPt = Number.isFinite(Number(textEntity.letterSpacingEm))
      ? Number(textEntity.letterSpacingEm) * fontSizePt
      : 0;
    const commands = [
      pdfRgbCommand(textRgb, "rg"),
      "BT",
      `${fontName} ${formatPdfNumber(fontSizePt)} Tf`,
      `${formatPdfNumber(charSpacingPt)} Tc`,
    ];
    if (Number.isFinite(Number(textEntity.rotationRad))) {
      const angle = Number(textEntity.rotationRad) || 0;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      commands.push(`${formatPdfNumber(cos)} ${formatPdfNumber(sin)} ${formatPdfNumber(-sin)} ${formatPdfNumber(cos)} ${formatPdfNumber(point.x)} ${formatPdfNumber(point.y)} Tm`);
      commands.push(`${formatPdfNumber(textOffsetXPt)} ${formatPdfNumber(-fontSizePt * (Number(textEntity.baselineShiftEm) || 0))} Td`);
    } else {
      commands.push(`${formatPdfNumber(point.x + textOffsetXPt)} ${formatPdfNumber(point.y)} Td`);
    }
    commands.push(`(${escapePdfText(textEntity.text)}) Tj`);
    commands.push("ET");
    return commands;
  }

  function buildPdfFilledCircleCommands(projector, center, radiusUnits, fillRgb, segments = 16) {
    return buildPdfPolygonCommands(projector, approximateCirclePoints(center, radiusUnits, segments), {
      closePath: true,
      stroke: false,
      fill: true,
      strokeWidthPt: PDF_STYLE.minStrokeWidthPt,
      fillRgb,
    });
  }

  function boundsToRectLines(bounds, layerId) {
    return [
      { type: "line", layerId, p1: { x: bounds.minX, y: bounds.minY }, p2: { x: bounds.maxX, y: bounds.minY } },
      { type: "line", layerId, p1: { x: bounds.maxX, y: bounds.minY }, p2: { x: bounds.maxX, y: bounds.maxY } },
      { type: "line", layerId, p1: { x: bounds.maxX, y: bounds.maxY }, p2: { x: bounds.minX, y: bounds.maxY } },
      { type: "line", layerId, p1: { x: bounds.minX, y: bounds.maxY }, p2: { x: bounds.minX, y: bounds.minY } },
    ];
  }

  function isSameLine(a, b) {
    const direct = a.p1.x === b.p1.x && a.p1.y === b.p1.y && a.p2.x === b.p2.x && a.p2.y === b.p2.y;
    const reverse = a.p1.x === b.p2.x && a.p1.y === b.p2.y && a.p2.x === b.p1.x && a.p2.y === b.p1.y;
    return direct || reverse;
  }

  function buildPdfCommandsForEntity(entity, projector, deps = {}) {
    const style = resolveExportEntityStyle(entity, deps);
    const strokeRgb = hexToRgb01(style.strokeColor);
    const fillRgb = blendColorOverWhite(style.fillColor, style.fillAlpha);
    const strokeWidthPt = projector.strokeWidthPt(style.strokeWidthMm);
    if (entity.type === "line") {
      return buildPdfLineCommands(projector, entity, strokeWidthPt, strokeRgb);
    }
    if (entity.type === "rect") {
      const points = [
        { x: entity.x, y: entity.y },
        { x: entity.x + entity.width, y: entity.y },
        { x: entity.x + entity.width, y: entity.y + entity.height },
        { x: entity.x, y: entity.y + entity.height },
      ];
      return buildPdfPolygonCommands(projector, points, {
        closePath: true,
        stroke: true,
        fill: entity.fill !== false,
        strokeWidthPt,
        strokeRgb,
        fillRgb: entity.fill !== false ? fillRgb : null,
      });
    }
    if (entity.type === "circle") {
      return buildPdfPolygonCommands(projector, approximateCirclePoints(entity.center, entity.radius), {
        closePath: true,
        stroke: true,
        fill: false,
        strokeWidthPt,
        strokeRgb,
      });
    }
    if (entity.type === "arc") {
      return buildPdfPolygonCommands(projector, approximateArcPoints(entity.center, entity.radius, entity.startAngleDeg, entity.endAngleDeg), {
        closePath: false,
        stroke: true,
        fill: false,
        strokeWidthPt,
        strokeRgb,
      });
    }
    if (entity.type === "filledRegion") {
      return buildPdfPolygonCommands(projector, entity.points || [], {
        closePath: true,
        stroke: true,
        fill: entity.fill !== false,
        strokeWidthPt,
        strokeRgb,
        fillRgb: entity.fill !== false ? fillRgb : null,
      });
    }
    if (entity.type === "text") {
      return buildPdfTextCommands(projector, entity, deps);
    }
    if (entity.type === "dimension") {
      const dimensionData = getDimensionExportData(entity, deps);
      const dimensionStrokeWidthPt = projector.strokeWidthPt(0.15);
      const geometryRgb = hexToRgb01(
        dimensionData.geometryColor
        || (typeof deps.getDimensionGeometryColorForExport === "function" ? deps.getDimensionGeometryColorForExport(entity) : style.strokeColor)
      );
      const projectedO1 = projector.projectPoint(dimensionData.geometry.o1);
      const projectedO2 = projector.projectPoint(dimensionData.geometry.o2);
      const pdfAngleRad = normalizeDimensionTextRotation(
        Math.atan2(projectedO2.y - projectedO1.y, projectedO2.x - projectedO1.x)
      );
      const textColor = dimensionData.text.color
        || (typeof deps.getDimensionTextColorForExport === "function" ? deps.getDimensionTextColorForExport(entity) : entity.color || style.strokeColor);
      const commands = [];
      commands.push(...buildPdfLineCommands(projector, { p1: dimensionData.geometry.extensionStart1, p2: dimensionData.geometry.o1 }, dimensionStrokeWidthPt, geometryRgb));
      commands.push(...buildPdfLineCommands(projector, { p1: dimensionData.geometry.extensionStart2, p2: dimensionData.geometry.o2 }, dimensionStrokeWidthPt, geometryRgb));
      commands.push(...buildPdfLineCommands(projector, { p1: dimensionData.geometry.o1, p2: dimensionData.geometry.o2 }, dimensionStrokeWidthPt, geometryRgb));
      if (dimensionData.tickRadiusUnits > 0) {
        commands.push(...buildPdfFilledCircleCommands(projector, dimensionData.geometry.o1, dimensionData.tickRadiusUnits, geometryRgb));
        commands.push(...buildPdfFilledCircleCommands(projector, dimensionData.geometry.o2, dimensionData.tickRadiusUnits, geometryRgb));
      }
      commands.push(...buildPdfTextCommands(projector, {
        ...dimensionData.text,
        rotationRad: pdfAngleRad,
        color: textColor,
      }, deps));
      return commands;
    }
    if (entity.type === "titleBlock") {
      const primitives = getTitleBlockPrimitives(entity, deps, {
        includeOuterBorder: false,
        includeInnerFrame: true,
        forceFull: true,
      });
      const commands = [];
      primitives.lines.forEach((line) => {
        commands.push(...buildPdfLineCommands(projector, line, projector.strokeWidthPt(PDF_STYLE.titleBlockStrokeWidthMm), PDF_STYLE.titleBlockStrokeRgb));
      });
      primitives.texts.forEach((textEntity) => {
        commands.push(...buildPdfTextCommands(projector, textEntity, deps));
      });
      return commands;
    }
    return [];
  }

  function buildVectorPdfBlob(titleBlockEntity, deps = {}) {
    const exportEntities = collectEntitiesForExport(titleBlockEntity, deps);
    const titleBlockPrimitives = getTitleBlockPrimitives(titleBlockEntity, deps, {
      includeOuterBorder: false,
      includeInnerFrame: true,
      forceFull: true,
    });
    const pageBounds = titleBlockPrimitives.paperBounds;
    const projector = createPdfProjector(pageBounds, titleBlockEntity.scale, deps);
    const bodyCommands = [];
    const measureContext = getPdfMeasureContext();

    exportEntities.forEach((entity) => {
      bodyCommands.push(...buildPdfCommandsForEntity(entity, projector, {
        ...deps,
        measureContext,
      }));
    });

    const stream = `${bodyCommands.join("\n")}\n`;
    const pageWidthPt = projector.widthPt;
    const pageHeightPt = projector.heightPt;
    const objects = [
      "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
      "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${formatPdfNumber(pageWidthPt)} ${formatPdfNumber(pageHeightPt)}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>\nendobj\n`,
      "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n",
      "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n",
      `6 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}endstream\nendobj\n`,
    ];

    const header = "%PDF-1.4\n";
    const chunks = [new TextEncoder().encode(header)];
    const offsets = [0];
    let cursor = header.length;

    objects.forEach((objectText, index) => {
      offsets[index + 1] = cursor;
      const encoded = new TextEncoder().encode(objectText);
      chunks.push(encoded);
      cursor += encoded.length;
    });

    const xrefOffset = cursor;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let objectNumber = 1; objectNumber <= objects.length; objectNumber += 1) {
      xref += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`;
    }
    const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    chunks.push(new TextEncoder().encode(xref), new TextEncoder().encode(trailer));
    return new Blob(chunks, { type: "application/pdf" });
  }

  function getSuggestedFilename(entity, extension, deps = {}) {
    const timestamp = typeof deps.createTimestampLabel === "function"
      ? deps.createTimestampLabel()
      : String(Date.now());
    return `draftlite-title-block-${normalizePaperSize(entity.paperSize).toLowerCase()}-${timestamp}.${extension}`;
  }

  async function exportTitleBlockScreenshot(entity, deps = {}) {
    const canvas = renderTitleBlockSelectionCanvas(entity, deps);
    const blob = await blobFromCanvas(canvas, "image/png");
    if (navigator.clipboard && window.ClipboardItem) {
      try {
        await navigator.clipboard.write([
          new window.ClipboardItem({ "image/png": blob }),
        ]);
        if (typeof deps.setStatus === "function") {
          deps.setStatus("Title Block screenshot copied to clipboard.");
        }
        return;
      } catch (error) {
        // Fall through to file download.
      }
    }
    if (typeof deps.downloadBlob === "function") {
      deps.downloadBlob(blob, getSuggestedFilename(entity, "png", deps));
      if (typeof deps.setStatus === "function") {
        deps.setStatus("Title Block screenshot downloaded.");
      }
    }
  }

  async function exportTitleBlockPdfVector(entity, deps = {}) {
    const blob = buildVectorPdfBlob(entity, deps);
    const result = await saveBlob(blob, getSuggestedFilename(entity, "pdf", deps), [
      {
        description: "PDF",
        accept: { "application/pdf": [".pdf"] },
      },
    ], deps);
    if (typeof deps.setStatus === "function") {
      deps.setStatus(result.ok ? "Title Block PDF exported." : "Title Block PDF export cancelled.");
    }
  }

  async function exportTitleBlockPdf(entity, deps = {}) {
    return exportTitleBlockPdfVector(entity, deps);
  }

  async function exportTitleBlockDxf(entity, deps = {}) {
    const entities = collectEntitiesForExport(entity, deps);
    if (typeof deps.buildDxfTextFromEntities !== "function" || typeof deps.getDxfExportSummaryForEntities !== "function") {
      throw new Error("DXF export helpers are unavailable.");
    }
    const summary = deps.getDxfExportSummaryForEntities(entities);
    if (summary.exportedLineCount + summary.exportedTextCount + summary.exportedCircleCount + summary.exportedArcCount === 0) {
      if (typeof deps.setStatus === "function") {
        deps.setStatus("No entities inside the selected Title Block range.");
      }
      return;
    }
    const dxfText = deps.buildDxfTextFromEntities(entities);
    const blob = new Blob([dxfText], { type: "text/plain;charset=us-ascii" });
    const result = await saveBlob(blob, getSuggestedFilename(entity, "dxf", deps), [
      {
        description: "DXF",
        accept: { "application/dxf": [".dxf"], "text/plain": [".dxf"] },
      },
    ], deps);
    if (typeof deps.setStatus === "function") {
      deps.setStatus(result.ok ? "Title Block DXF exported." : "Title Block DXF export cancelled.");
    }
  }

  window.DraftLiteTitleBlock = {
    createTitleBlockEntity,
    getTitleBlockWorldSize,
    updateTitleBlockSizeFromScale,
    drawTitleBlock,
    drawTitleBlockTemplateA3StandardV6,
    buildTitleBlockProperties,
    updateTitleBlockFromProperties,
    exportTitleBlockScreenshot,
    exportTitleBlockPdf,
    exportTitleBlockPdfVector,
    exportTitleBlockDxf,
    normalizeTitleBlockEntity,
    getTitleBlockBounds,
    getTitleBlockCropBounds,
    hitTestTitleBlock,
    getDxfPrimitives,
  };
})();
