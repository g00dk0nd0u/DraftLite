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
      textHeightsMm: {
        infoLabel: 1.164,
        infoValue: 2.011,
        titleLabel: 1.164,
        titleValue: 4.41,
        sheetNoLabel: 1.164,
        sheetNoValue: 4.41,
        notesLabel: 1.199,
      },
      textStyles: {
        infoLabel: {
          fontSizePt: 3.3,
          color: "#888888",
          align: "right",
          letterSpacingEm: 0.075,
        },
        infoValue: {
          fontSizePt: 5.7,
          color: "#111111",
          align: "right",
          fontWeight: 600,
        },
        titleLabel: {
          fontSizePt: 3.3,
          color: "#888888",
          align: "right",
        },
        titleValue: {
          fontSizePt: 12.5,
          color: "#111111",
          align: "right",
          fontWeight: 700,
        },
        sheetNoLabel: {
          fontSizePt: 3.3,
          color: "#888888",
          align: "right",
        },
        sheetNoValue: {
          fontSizePt: 12.5,
          color: "#111111",
          align: "right",
          fontWeight: 700,
        },
        notesLabel: {
          fontSizePt: 3.4,
          color: "#999999",
          align: "left",
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
