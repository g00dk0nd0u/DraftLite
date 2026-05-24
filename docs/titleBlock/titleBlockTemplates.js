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
        label: 2.1,
        value: 2.7,
        title: 4.1,
        sheetNo: 4.1,
        notes: 2.4,
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
