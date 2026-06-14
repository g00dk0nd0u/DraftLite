"use strict";

(function () {
  const DEFAULT_OPACITY = 0.45;
  const PDFJS_WORKER_BASE = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/";
  const PDFJS_DIST_ASSET_BASE = "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/";
  const PDF_RENDER_SCALE = 3;
  const PDF_RENDER_MAX_DIMENSION = 4096;
  const DRAFTLITE_UNITS_PER_PDF_POINT = 25.4 / 72 / 0.1;
  const SERIALIZABLE_KEYS = [
    "enabled",
    "visible",
    "locked",
    "name",
    "page",
    "opacity",
    "x",
    "y",
    "scale",
    "widthUnits",
    "heightUnits",
  ];

  function createInitialPdfUnderlayState() {
    return {
      enabled: false,
      visible: true,
      locked: false,
      name: "",
      page: 1,
      opacity: DEFAULT_OPACITY,
      x: 0,
      y: 0,
      scale: 1,
      widthUnits: 0,
      heightUnits: 0,
      imageBitmap: null,
      imageDataUrl: null,
    };
  }

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, number));
  }

  function roundUnit(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.round(number) : 0;
  }

  function normalizePdfUnderlayState(raw) {
    const base = createInitialPdfUnderlayState();
    if (!raw || typeof raw !== "object") {
      return base;
    }

    return {
      enabled: Boolean(raw.enabled),
      visible: raw.visible !== false,
      locked: Boolean(raw.locked),
      name: typeof raw.name === "string" ? raw.name : "",
      page: Math.max(1, Math.round(Number(raw.page) || 1)),
      opacity: clampNumber(raw.opacity, 0, 1, DEFAULT_OPACITY),
      x: roundUnit(raw.x),
      y: roundUnit(raw.y),
      scale: clampNumber(raw.scale, 0.01, 100, 1),
      widthUnits: Math.max(0, roundUnit(raw.widthUnits)),
      heightUnits: Math.max(0, roundUnit(raw.heightUnits)),
      imageBitmap: raw.imageBitmap && Number.isFinite(Number(raw.imageBitmap.width)) && Number.isFinite(Number(raw.imageBitmap.height)) ? raw.imageBitmap : null,
      imageDataUrl: typeof raw.imageDataUrl === "string" ? raw.imageDataUrl : null,
    };
  }

  function getPdfJs() {
    return window.pdfjsLib || null;
  }

  function isPdfFile(file) {
    if (!file) {
      return false;
    }
    const name = typeof file.name === "string" ? file.name.toLowerCase() : "";
    const type = typeof file.type === "string" ? file.type.toLowerCase() : "";
    return type === "application/pdf" || name.endsWith(".pdf");
  }

  function getViewportPointDimensions(page) {
    const viewport = page.getViewport({ scale: 1 });
    return {
      viewport,
      widthPoints: Number(viewport.width) || 0,
      heightPoints: Number(viewport.height) || 0,
    };
  }

  function getPdfRenderScale(page) {
    const unitViewport = page.getViewport({ scale: 1 });
    const width = Number(unitViewport.width) || 0;
    const height = Number(unitViewport.height) || 0;
    if (width <= 0 || height <= 0) {
      return PDF_RENDER_SCALE;
    }
    return Math.min(PDF_RENDER_SCALE, PDF_RENDER_MAX_DIMENSION / width, PDF_RENDER_MAX_DIMENSION / height);
  }

  function getPdfDocumentOptions(data) {
    return {
      data,
      cMapUrl: `${PDFJS_DIST_ASSET_BASE}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${PDFJS_DIST_ASSET_BASE}standard_fonts/`,
      disableFontFace: false,
      useSystemFonts: true,
    };
  }

  async function loadPdfFileAsUnderlay(file, currentState) {
    const pdfjsLib = getPdfJs();
    if (!pdfjsLib) {
      throw new Error("PDF.js is not loaded.");
    }
    if (!isPdfFile(file)) {
      throw new Error("Please select a PDF file.");
    }

    if (pdfjsLib.GlobalWorkerOptions && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `${PDFJS_WORKER_BASE}pdf.worker.min.js`;
    }

    const arrayBuffer = await file.arrayBuffer();
    let pdf = null;
    try {
      pdf = await pdfjsLib.getDocument(getPdfDocumentOptions(arrayBuffer)).promise;
    } catch (error) {
      console.error("PDF.js failed to load the PDF document. Font or CMap resources may also be unavailable.", error);
      throw new Error("PDF rendering failed. Font or CMap resources may be unavailable.");
    }

    let page = null;
    try {
      page = await pdf.getPage(1);
    } catch (error) {
      console.error("PDF.js failed to read the first PDF underlay page.", error);
      throw new Error("PDF rendering failed.");
    }

    const { viewport: unitViewport, widthPoints, heightPoints } = getViewportPointDimensions(page);
    const renderScale = getPdfRenderScale(page);
    if (renderScale < PDF_RENDER_SCALE) {
      console.warn(`PDF underlay render scale reduced from ${PDF_RENDER_SCALE} to ${renderScale.toFixed(2)} to keep the canvas within ${PDF_RENDER_MAX_DIMENSION}px.`);
    }
    const viewport = page.getViewport({ scale: renderScale });
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.ceil(viewport.width));
    canvas.height = Math.max(1, Math.ceil(viewport.height));
    const renderContext = canvas.getContext("2d");
    if (!renderContext) {
      throw new Error("Failed to load PDF underlay.");
    }
    renderContext.save();
    renderContext.fillStyle = "#ffffff";
    renderContext.fillRect(0, 0, canvas.width, canvas.height);
    renderContext.restore();
    try {
      await page.render({ canvasContext: renderContext, viewport }).promise;
    } catch (error) {
      console.error("PDF.js failed while rendering the PDF underlay. Font or CMap loading may have failed.", error);
      throw new Error("PDF rendering failed. Font or CMap resources may be unavailable.");
    }

    const imageDataUrl = canvas.toDataURL("image/png");
    let imageBitmap = null;
    if (typeof window.createImageBitmap === "function") {
      try {
        imageBitmap = await window.createImageBitmap(canvas);
      } catch (error) {
        imageBitmap = null;
      }
    }

    const fallbackWidthPoints = unitViewport && unitViewport.width ? unitViewport.width : canvas.width / renderScale;
    const fallbackHeightPoints = unitViewport && unitViewport.height ? unitViewport.height : canvas.height / renderScale;
    const widthUnits = Math.max(1, Math.round((widthPoints || fallbackWidthPoints) * DRAFTLITE_UNITS_PER_PDF_POINT));
    const heightUnits = Math.max(1, Math.round((heightPoints || fallbackHeightPoints) * DRAFTLITE_UNITS_PER_PDF_POINT));

    return normalizePdfUnderlayState({
      ...(currentState || {}),
      enabled: true,
      visible: true,
      locked: false,
      name: file.name || "Imported PDF",
      page: 1,
      opacity: currentState && Number.isFinite(Number(currentState.opacity)) ? currentState.opacity : DEFAULT_OPACITY,
      x: 0,
      y: 0,
      scale: 1,
      widthUnits,
      heightUnits,
      imageBitmap,
      imageDataUrl,
    });
  }

  function drawImageFallback(ctx, underlay, cacheTarget, left, top, width, height) {
    if (!underlay.imageDataUrl) {
      return false;
    }
    const target = cacheTarget || underlay;
    if (!target._imageElement || target._imageElement.src !== underlay.imageDataUrl) {
      const image = new Image();
      image.src = underlay.imageDataUrl;
      target._imageElement = image;
    }
    if (!target._imageElement.complete) {
      return false;
    }
    ctx.drawImage(target._imageElement, left, top, width, height);
    return true;
  }

  function drawPdfUnderlay(ctx, state, worldToScreen) {
    const rawUnderlay = state && state.pdfUnderlay ? state.pdfUnderlay : state;
    const underlay = normalizePdfUnderlayState(rawUnderlay);
    if (!underlay.enabled || !underlay.visible || underlay.opacity <= 0 || underlay.widthUnits <= 0 || underlay.heightUnits <= 0) {
      return;
    }
    const image = underlay.imageBitmap;
    if (!image && !underlay.imageDataUrl) {
      return;
    }

    const origin = worldToScreen({ x: underlay.x, y: underlay.y });
    const corner = worldToScreen({
      x: underlay.x + underlay.widthUnits * underlay.scale,
      y: underlay.y + underlay.heightUnits * underlay.scale,
    });
    const left = Math.min(origin.x, corner.x);
    const top = Math.min(origin.y, corner.y);
    const width = Math.abs(corner.x - origin.x);
    const height = Math.abs(corner.y - origin.y);
    if (width <= 0 || height <= 0) {
      return;
    }

    ctx.save();
    ctx.globalAlpha = underlay.opacity;
    if (image) {
      ctx.drawImage(image, left, top, width, height);
    } else {
      drawImageFallback(ctx, underlay, rawUnderlay, left, top, width, height);
    }
    ctx.restore();
  }

  function clearPdfUnderlay() {
    return createInitialPdfUnderlayState();
  }

  function setPdfUnderlayOpacity(state, opacity) {
    return normalizePdfUnderlayState({ ...(state || {}), opacity });
  }

  function setPdfUnderlayVisible(state, visible) {
    return normalizePdfUnderlayState({ ...(state || {}), visible: Boolean(visible) });
  }

  function setPdfUnderlayScale(state, scale) {
    return normalizePdfUnderlayState({ ...(state || {}), scale });
  }

  function serializePdfUnderlayState(state) {
    const normalized = normalizePdfUnderlayState(state);
    return SERIALIZABLE_KEYS.reduce((result, key) => {
      result[key] = normalized[key];
      return result;
    }, {});
  }

  window.DraftLitePdfUnderlay = {
    createInitialPdfUnderlayState,
    normalizePdfUnderlayState,
    loadPdfFileAsUnderlay,
    drawPdfUnderlay,
    clearPdfUnderlay,
    setPdfUnderlayOpacity,
    setPdfUnderlayVisible,
    setPdfUnderlayScale,
    serializePdfUnderlayState,
  };
}());
