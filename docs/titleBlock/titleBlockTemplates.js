"use strict";

(function attachDraftLiteTitleBlockTemplates() {
  const PAPER_SIZES = {
    A3: { widthMm: 420, heightMm: 297 },
    A4: { widthMm: 297, heightMm: 210 },
    "16:9": { widthMm: 420, heightMm: 236.25 },
  };

  const TEMPLATES = {
    "a3-standard-v6": {
      id: "a3-standard-v6",
      name: "A3 Standard v6",
      defaultPaperSize: "A3",
      defaultOrientation: "landscape",
      outerInsetMm: 5,
      innerInsetMm: 10,
      titleBlockHeightMm: 12,
      infoRowHeightMm: 6,
      notesRowHeightMm: 6,
      leftWingWidthMm: 200,
      rightWingWidthMm: 200,
      sheetNoWidthMm: 40,
      infoColumns: [
        "PROJECT NAME",
        "DRAWN BY",
        "SCALE",
        "PAPER",
        "DATE",
      ],
      textStyles: {
        label: {
          fontSizePt: 3.0,
          fontSizeMm: 1.058333,
          color: "#888888",
          align: "right",
          letterSpacingEm: 0.075,
          fontWeight: 400,
        },
        value: {
          fontSizePt: 5.7,
          fontSizeMm: 2.010833,
          color: "#111111",
          align: "right",
          fontWeight: 600,
        },
        notesLabel: {
          fontSizePt: 3.0,
          fontSizeMm: 1.058333,
          color: "#888888",
          align: "right",
          letterSpacingEm: 0.075,
          fontWeight: 400,
        },
        titleLabel: {
          fontSizePt: 3.0,
          fontSizeMm: 1.058333,
          color: "#888888",
          align: "right",
          letterSpacingEm: 0.075,
          fontWeight: 400,
        },
        titleValue: {
          fontSizePt: 12.5,
          fontSizeMm: 4.409722,
          color: "#111111",
          align: "right",
          fontWeight: 700,
        },
      },
    },
  };

  function getTemplate(templateId) {
    return TEMPLATES[templateId] || TEMPLATES["a3-standard-v6"];
  }

  function getPaperSize(paperSize) {
    return PAPER_SIZES[paperSize] || PAPER_SIZES.A3;
  }

  window.DraftLiteTitleBlockTemplates = {
    PAPER_SIZES,
    TEMPLATES,
    getTemplate,
    getPaperSize,
  };
})();
