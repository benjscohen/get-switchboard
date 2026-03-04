import {
  documentId,
  tabId,
  segmentId,
  rgbColor,
  suggestionsViewMode,
  createDocumentSchema,
  getDocumentSchema,
  readContentSchema,
  searchSchema,
  insertTextSchema,
  replaceTextSchema,
  deleteContentSchema,
  formatTextSchema,
  formatParagraphSchema,
  manageTablesSchema,
  manageSectionsSchema,
  manageHeadersFootersSchema,
  manageImagesSchema,
  manageNamedRangesSchema,
  manageTabsSchema,
  updateDocumentStyleSchema,
  insertSpecialElementSchema,
} from "./schemas";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("documentId requires a string", () => {
    expect(() => documentId.parse(undefined)).toThrow();
    expect(documentId.parse("abc123")).toBe("abc123");
  });

  it("tabId is optional", () => {
    expect(tabId.parse(undefined)).toBeUndefined();
    expect(tabId.parse("tab1")).toBe("tab1");
  });

  it("segmentId is optional", () => {
    expect(segmentId.parse(undefined)).toBeUndefined();
    expect(segmentId.parse("kix.header1")).toBe("kix.header1");
  });

  it("rgbColor validates range 0-1", () => {
    expect(rgbColor.parse({ red: 0, green: 0.5, blue: 1 })).toEqual({
      red: 0,
      green: 0.5,
      blue: 1,
    });
  });

  it("rgbColor rejects values outside 0-1", () => {
    expect(() => rgbColor.parse({ red: -0.1, green: 0, blue: 0 })).toThrow();
    expect(() => rgbColor.parse({ red: 0, green: 1.1, blue: 0 })).toThrow();
  });

  it("rgbColor requires all three channels", () => {
    expect(() => rgbColor.parse({ red: 0 })).toThrow();
    expect(() => rgbColor.parse({ red: 0, green: 0 })).toThrow();
  });

  it("suggestionsViewMode accepts valid enum values", () => {
    expect(suggestionsViewMode.parse("SUGGESTIONS_INLINE")).toBe(
      "SUGGESTIONS_INLINE"
    );
    expect(
      suggestionsViewMode.parse("PREVIEW_SUGGESTIONS_ACCEPTED")
    ).toBe("PREVIEW_SUGGESTIONS_ACCEPTED");
  });

  it("suggestionsViewMode is optional", () => {
    expect(suggestionsViewMode.parse(undefined)).toBeUndefined();
  });

  it("suggestionsViewMode rejects invalid values", () => {
    expect(() => suggestionsViewMode.parse("INVALID")).toThrow();
  });
});

// ── Document lifecycle schemas ──

describe("document lifecycle schemas", () => {
  describe("createDocumentSchema", () => {
    it("requires title", () => {
      expect(() => createDocumentSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = createDocumentSchema.parse({ title: "My Doc" });
      expect(result.title).toBe("My Doc");
    });
  });

  describe("getDocumentSchema", () => {
    it("requires documentId", () => {
      expect(() => getDocumentSchema.parse({})).toThrow();
    });

    it("accepts documentId with optional fields", () => {
      const result = getDocumentSchema.parse({
        documentId: "doc1",
        suggestionsViewMode: "SUGGESTIONS_INLINE",
        includeTabsContent: true,
      });
      expect(result.documentId).toBe("doc1");
      expect(result.includeTabsContent).toBe(true);
    });

    it("accepts documentId alone", () => {
      const result = getDocumentSchema.parse({ documentId: "doc1" });
      expect(result.suggestionsViewMode).toBeUndefined();
    });
  });

  describe("readContentSchema", () => {
    it("requires documentId", () => {
      expect(() => readContentSchema.parse({})).toThrow();
    });

    it("accepts all format options", () => {
      for (const format of ["text", "structured", "raw"] as const) {
        const result = readContentSchema.parse({
          documentId: "doc1",
          format,
        });
        expect(result.format).toBe(format);
      }
    });

    it("rejects invalid format", () => {
      expect(() =>
        readContentSchema.parse({ documentId: "doc1", format: "html" })
      ).toThrow();
    });

    it("format is optional", () => {
      const result = readContentSchema.parse({ documentId: "doc1" });
      expect(result.format).toBeUndefined();
    });
  });

  describe("searchSchema", () => {
    it("requires documentId and searchText", () => {
      expect(() => searchSchema.parse({})).toThrow();
      expect(() =>
        searchSchema.parse({ documentId: "doc1" })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = searchSchema.parse({
        documentId: "doc1",
        searchText: "hello",
      });
      expect(result.searchText).toBe("hello");
    });

    it("tabId is optional", () => {
      const result = searchSchema.parse({
        documentId: "doc1",
        searchText: "test",
        tabId: "t1",
      });
      expect(result.tabId).toBe("t1");
    });
  });
});

// ── Text mutation schemas ──

describe("text mutation schemas", () => {
  describe("insertTextSchema", () => {
    it("requires documentId and text", () => {
      expect(() => insertTextSchema.parse({})).toThrow();
      expect(() =>
        insertTextSchema.parse({ documentId: "doc1" })
      ).toThrow();
    });

    it("accepts text without index (append mode)", () => {
      const result = insertTextSchema.parse({
        documentId: "doc1",
        text: "Hello",
      });
      expect(result.text).toBe("Hello");
      expect(result.index).toBeUndefined();
    });

    it("accepts text with index (insert mode)", () => {
      const result = insertTextSchema.parse({
        documentId: "doc1",
        text: "Hello",
        index: 5,
      });
      expect(result.index).toBe(5);
    });

    it("accepts segmentId and tabId", () => {
      const result = insertTextSchema.parse({
        documentId: "doc1",
        text: "Hello",
        index: 1,
        segmentId: "kix.header1",
        tabId: "t1",
      });
      expect(result.segmentId).toBe("kix.header1");
      expect(result.tabId).toBe("t1");
    });

    it("rejects non-integer index", () => {
      expect(() =>
        insertTextSchema.parse({
          documentId: "doc1",
          text: "Hello",
          index: 1.5,
        })
      ).toThrow();
    });
  });

  describe("replaceTextSchema", () => {
    it("requires documentId, searchText, and replaceText", () => {
      expect(() => replaceTextSchema.parse({})).toThrow();
      expect(() =>
        replaceTextSchema.parse({
          documentId: "doc1",
          searchText: "old",
        })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = replaceTextSchema.parse({
        documentId: "doc1",
        searchText: "old",
        replaceText: "new",
      });
      expect(result.searchText).toBe("old");
      expect(result.replaceText).toBe("new");
    });

    it("matchCase is optional", () => {
      const result = replaceTextSchema.parse({
        documentId: "doc1",
        searchText: "a",
        replaceText: "b",
        matchCase: false,
      });
      expect(result.matchCase).toBe(false);
    });
  });

  describe("deleteContentSchema", () => {
    it("requires documentId, startIndex, and endIndex", () => {
      expect(() => deleteContentSchema.parse({})).toThrow();
      expect(() =>
        deleteContentSchema.parse({ documentId: "doc1", startIndex: 1 })
      ).toThrow();
    });

    it("accepts valid range", () => {
      const result = deleteContentSchema.parse({
        documentId: "doc1",
        startIndex: 1,
        endIndex: 10,
      });
      expect(result.startIndex).toBe(1);
      expect(result.endIndex).toBe(10);
    });

    it("rejects non-integer indices", () => {
      expect(() =>
        deleteContentSchema.parse({
          documentId: "doc1",
          startIndex: 1.5,
          endIndex: 10,
        })
      ).toThrow();
    });
  });
});

// ── Formatting schemas ──

describe("formatting schemas", () => {
  const baseRange = { documentId: "doc1", startIndex: 1, endIndex: 10 };

  describe("formatTextSchema", () => {
    it("requires documentId, startIndex, endIndex", () => {
      expect(() => formatTextSchema.parse({})).toThrow();
    });

    it("accepts range with no style fields (all optional)", () => {
      const result = formatTextSchema.parse(baseRange);
      expect(result.bold).toBeUndefined();
    });

    it("accepts all text style fields", () => {
      const result = formatTextSchema.parse({
        ...baseRange,
        bold: true,
        italic: true,
        underline: false,
        strikethrough: false,
        fontFamily: "Arial",
        fontSize: 12,
        foregroundColor: { red: 1, green: 0, blue: 0 },
        backgroundColor: { red: 1, green: 1, blue: 0 },
        linkUrl: "https://example.com",
        baselineOffset: "SUPERSCRIPT",
        smallCaps: true,
      });
      expect(result.bold).toBe(true);
      expect(result.fontFamily).toBe("Arial");
      expect(result.fontSize).toBe(12);
      expect(result.foregroundColor).toEqual({ red: 1, green: 0, blue: 0 });
      expect(result.baselineOffset).toBe("SUPERSCRIPT");
      expect(result.smallCaps).toBe(true);
    });

    it("accepts link variants", () => {
      expect(
        formatTextSchema.parse({
          ...baseRange,
          linkBookmarkId: "bm1",
        }).linkBookmarkId
      ).toBe("bm1");

      expect(
        formatTextSchema.parse({
          ...baseRange,
          linkHeadingId: "h1",
        }).linkHeadingId
      ).toBe("h1");
    });

    it("rejects invalid baselineOffset", () => {
      expect(() =>
        formatTextSchema.parse({
          ...baseRange,
          baselineOffset: "MIDDLE",
        })
      ).toThrow();
    });
  });

  describe("formatParagraphSchema", () => {
    it("requires documentId, startIndex, endIndex", () => {
      expect(() => formatParagraphSchema.parse({})).toThrow();
    });

    it("accepts range with heading style", () => {
      const result = formatParagraphSchema.parse({
        ...baseRange,
        namedStyleType: "HEADING_1",
      });
      expect(result.namedStyleType).toBe("HEADING_1");
    });

    it("accepts all named style types", () => {
      for (const style of [
        "NORMAL_TEXT",
        "HEADING_1",
        "HEADING_2",
        "HEADING_3",
        "HEADING_4",
        "HEADING_5",
        "HEADING_6",
        "TITLE",
        "SUBTITLE",
      ] as const) {
        expect(
          formatParagraphSchema.parse({
            ...baseRange,
            namedStyleType: style,
          }).namedStyleType
        ).toBe(style);
      }
    });

    it("accepts alignment options", () => {
      for (const alignment of [
        "START",
        "CENTER",
        "END",
        "JUSTIFIED",
      ] as const) {
        expect(
          formatParagraphSchema.parse({ ...baseRange, alignment }).alignment
        ).toBe(alignment);
      }
    });

    it("accepts spacing, indent, and pagination fields", () => {
      const result = formatParagraphSchema.parse({
        ...baseRange,
        lineSpacing: 200,
        spaceAbove: 12,
        spaceBelow: 6,
        indentFirstLine: 36,
        indentStart: 18,
        indentEnd: 18,
        keepLinesTogether: true,
        keepWithNext: true,
        avoidWidowAndOrphan: true,
      });
      expect(result.lineSpacing).toBe(200);
      expect(result.spaceAbove).toBe(12);
      expect(result.keepLinesTogether).toBe(true);
    });

    it("accepts border strings and shading color", () => {
      const result = formatParagraphSchema.parse({
        ...baseRange,
        borderTop: "1,#000000,SOLID",
        borderBottom: "2,#FF0000,DASH",
        shadingColor: { red: 0.9, green: 0.9, blue: 0.9 },
      });
      expect(result.borderTop).toBe("1,#000000,SOLID");
      expect(result.shadingColor).toEqual({
        red: 0.9,
        green: 0.9,
        blue: 0.9,
      });
    });

    it("accepts bullet action and preset", () => {
      const result = formatParagraphSchema.parse({
        ...baseRange,
        bulletAction: "create",
        bulletPreset: "NUMBERED_DECIMAL_ALPHA_ROMAN",
      });
      expect(result.bulletAction).toBe("create");
      expect(result.bulletPreset).toBe("NUMBERED_DECIMAL_ALPHA_ROMAN");
    });

    it("rejects invalid bulletAction", () => {
      expect(() =>
        formatParagraphSchema.parse({
          ...baseRange,
          bulletAction: "toggle",
        })
      ).toThrow();
    });

    it("rejects invalid alignment", () => {
      expect(() =>
        formatParagraphSchema.parse({ ...baseRange, alignment: "LEFT" })
      ).toThrow();
    });
  });
});

// ── Table schemas ──

describe("manageTablesSchema", () => {
  it("requires documentId and action", () => {
    expect(() => manageTablesSchema.parse({})).toThrow();
    expect(() =>
      manageTablesSchema.parse({ documentId: "doc1" })
    ).toThrow();
  });

  it("accepts all 11 action types", () => {
    const actions = [
      "insert_table",
      "insert_row",
      "insert_column",
      "delete_row",
      "delete_column",
      "merge_cells",
      "unmerge_cells",
      "column_properties",
      "row_style",
      "cell_style",
      "pin_headers",
    ] as const;

    for (const action of actions) {
      const result = manageTablesSchema.parse({
        documentId: "doc1",
        action,
      });
      expect(result.action).toBe(action);
    }
  });

  it("rejects invalid action", () => {
    expect(() =>
      manageTablesSchema.parse({
        documentId: "doc1",
        action: "resize_table",
      })
    ).toThrow();
  });

  it("accepts insert_table fields", () => {
    const result = manageTablesSchema.parse({
      documentId: "doc1",
      action: "insert_table",
      index: 5,
      rows: 3,
      columns: 4,
    });
    expect(result.rows).toBe(3);
    expect(result.columns).toBe(4);
  });

  it("accepts merge_cells fields", () => {
    const result = manageTablesSchema.parse({
      documentId: "doc1",
      action: "merge_cells",
      tableStartIndex: 10,
      rowIndex: 0,
      columnIndex: 0,
      rowSpan: 2,
      columnSpan: 3,
    });
    expect(result.rowSpan).toBe(2);
    expect(result.columnSpan).toBe(3);
  });

  it("accepts cell_style fields", () => {
    const result = manageTablesSchema.parse({
      documentId: "doc1",
      action: "cell_style",
      tableStartIndex: 10,
      cellBgColor: { red: 0.9, green: 0.9, blue: 1 },
      cellPaddingTop: 4,
      cellPaddingBottom: 4,
      contentAlignment: "MIDDLE",
    });
    expect(result.cellBgColor).toEqual({ red: 0.9, green: 0.9, blue: 1 });
    expect(result.contentAlignment).toBe("MIDDLE");
  });

  it("rejects invalid contentAlignment", () => {
    expect(() =>
      manageTablesSchema.parse({
        documentId: "doc1",
        action: "cell_style",
        contentAlignment: "CENTER",
      })
    ).toThrow();
  });

  it("accepts column_properties fields", () => {
    const result = manageTablesSchema.parse({
      documentId: "doc1",
      action: "column_properties",
      tableStartIndex: 10,
      columnIndex: 1,
      width: 150,
      widthType: "FIXED_WIDTH",
    });
    expect(result.width).toBe(150);
    expect(result.widthType).toBe("FIXED_WIDTH");
  });

  it("accepts pin_headers fields", () => {
    const result = manageTablesSchema.parse({
      documentId: "doc1",
      action: "pin_headers",
      tableStartIndex: 10,
      pinnedHeaderRows: 2,
    });
    expect(result.pinnedHeaderRows).toBe(2);
  });
});

// ── Section schemas ──

describe("manageSectionsSchema", () => {
  it("requires documentId and action", () => {
    expect(() => manageSectionsSchema.parse({})).toThrow();
    expect(() =>
      manageSectionsSchema.parse({ documentId: "doc1" })
    ).toThrow();
  });

  it("accepts insert_page_break with index", () => {
    const result = manageSectionsSchema.parse({
      documentId: "doc1",
      action: "insert_page_break",
      index: 5,
    });
    expect(result.action).toBe("insert_page_break");
    expect(result.index).toBe(5);
  });

  it("accepts insert_section_break with type", () => {
    const result = manageSectionsSchema.parse({
      documentId: "doc1",
      action: "insert_section_break",
      index: 10,
      sectionType: "CONTINUOUS",
    });
    expect(result.sectionType).toBe("CONTINUOUS");
  });

  it("accepts update_section_style with all style fields", () => {
    const result = manageSectionsSchema.parse({
      documentId: "doc1",
      action: "update_section_style",
      sectionStartIndex: 0,
      sectionEndIndex: 100,
      columnCount: 2,
      columnSeparatorStyle: "BETWEEN_EACH_COLUMN",
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 72,
      marginRight: 72,
      pageNumberStart: 1,
      useFirstPageHeaderFooter: true,
      flipMarginOnEvenPage: true,
    });
    expect(result.columnCount).toBe(2);
    expect(result.marginTop).toBe(72);
    expect(result.useFirstPageHeaderFooter).toBe(true);
  });

  it("rejects invalid sectionType", () => {
    expect(() =>
      manageSectionsSchema.parse({
        documentId: "doc1",
        action: "insert_section_break",
        index: 1,
        sectionType: "ODD_PAGE",
      })
    ).toThrow();
  });
});

// ── Headers/footers schema ──

describe("manageHeadersFootersSchema", () => {
  it("requires documentId and action", () => {
    expect(() => manageHeadersFootersSchema.parse({})).toThrow();
    expect(() =>
      manageHeadersFootersSchema.parse({ documentId: "doc1" })
    ).toThrow();
  });

  it("accepts all 5 action types", () => {
    const actions = [
      "create_header",
      "create_footer",
      "delete_header",
      "delete_footer",
      "create_footnote",
    ] as const;

    for (const action of actions) {
      expect(
        manageHeadersFootersSchema.parse({ documentId: "doc1", action })
          .action
      ).toBe(action);
    }
  });

  it("accepts sectionBreakType for create operations", () => {
    const result = manageHeadersFootersSchema.parse({
      documentId: "doc1",
      action: "create_header",
      sectionBreakType: "FIRST_PAGE",
    });
    expect(result.sectionBreakType).toBe("FIRST_PAGE");
  });

  it("accepts headerId for delete_header", () => {
    const result = manageHeadersFootersSchema.parse({
      documentId: "doc1",
      action: "delete_header",
      headerId: "kix.hdr1",
    });
    expect(result.headerId).toBe("kix.hdr1");
  });

  it("accepts footnote index", () => {
    const result = manageHeadersFootersSchema.parse({
      documentId: "doc1",
      action: "create_footnote",
      index: 15,
    });
    expect(result.index).toBe(15);
  });
});

// ── Images schema ──

describe("manageImagesSchema", () => {
  it("requires documentId and action", () => {
    expect(() => manageImagesSchema.parse({})).toThrow();
    expect(() =>
      manageImagesSchema.parse({ documentId: "doc1" })
    ).toThrow();
  });

  it("accepts insert with full size spec", () => {
    const result = manageImagesSchema.parse({
      documentId: "doc1",
      action: "insert",
      imageUri: "https://example.com/img.png",
      index: 5,
      widthMagnitude: 200,
      heightMagnitude: 150,
      sizeUnit: "PT",
    });
    expect(result.imageUri).toBe("https://example.com/img.png");
    expect(result.widthMagnitude).toBe(200);
    expect(result.sizeUnit).toBe("PT");
  });

  it("accepts replace with objectId", () => {
    const result = manageImagesSchema.parse({
      documentId: "doc1",
      action: "replace",
      imageObjectId: "obj1",
      imageUri: "https://example.com/new.png",
      replaceMethod: "CENTER_CROP",
    });
    expect(result.imageObjectId).toBe("obj1");
  });

  it("accepts delete_positioned with objectId", () => {
    const result = manageImagesSchema.parse({
      documentId: "doc1",
      action: "delete_positioned",
      objectId: "posObj1",
    });
    expect(result.objectId).toBe("posObj1");
  });

  it("rejects invalid sizeUnit", () => {
    expect(() =>
      manageImagesSchema.parse({
        documentId: "doc1",
        action: "insert",
        sizeUnit: "INCHES",
      })
    ).toThrow();
  });
});

// ── Named ranges schema ──

describe("manageNamedRangesSchema", () => {
  it("requires documentId and action", () => {
    expect(() => manageNamedRangesSchema.parse({})).toThrow();
    expect(() =>
      manageNamedRangesSchema.parse({ documentId: "doc1" })
    ).toThrow();
  });

  it("accepts all 4 action types", () => {
    for (const action of [
      "create",
      "delete",
      "replace_content",
      "list",
    ] as const) {
      expect(
        manageNamedRangesSchema.parse({ documentId: "doc1", action }).action
      ).toBe(action);
    }
  });

  it("accepts create with name and range", () => {
    const result = manageNamedRangesSchema.parse({
      documentId: "doc1",
      action: "create",
      name: "myRange",
      startIndex: 5,
      endIndex: 20,
    });
    expect(result.name).toBe("myRange");
    expect(result.startIndex).toBe(5);
  });

  it("accepts delete by ID or name", () => {
    expect(
      manageNamedRangesSchema.parse({
        documentId: "doc1",
        action: "delete",
        namedRangeId: "nr1",
      }).namedRangeId
    ).toBe("nr1");

    expect(
      manageNamedRangesSchema.parse({
        documentId: "doc1",
        action: "delete",
        namedRangeName: "myRange",
      }).namedRangeName
    ).toBe("myRange");
  });

  it("accepts replace_content with text", () => {
    const result = manageNamedRangesSchema.parse({
      documentId: "doc1",
      action: "replace_content",
      namedRangeId: "nr1",
      replaceText: "new content",
    });
    expect(result.replaceText).toBe("new content");
  });
});

// ── Tabs schema ──

describe("manageTabsSchema", () => {
  it("requires documentId and action", () => {
    expect(() => manageTabsSchema.parse({})).toThrow();
    expect(() =>
      manageTabsSchema.parse({ documentId: "doc1" })
    ).toThrow();
  });

  it("accepts add with title", () => {
    const result = manageTabsSchema.parse({
      documentId: "doc1",
      action: "add",
      title: "New Tab",
    });
    expect(result.title).toBe("New Tab");
  });

  it("accepts delete with tabId", () => {
    const result = manageTabsSchema.parse({
      documentId: "doc1",
      action: "delete",
      deleteTabId: "t1",
    });
    expect(result.deleteTabId).toBe("t1");
  });

  it("accepts update_properties with new title", () => {
    const result = manageTabsSchema.parse({
      documentId: "doc1",
      action: "update_properties",
      updateTabId: "t1",
      newTitle: "Renamed",
    });
    expect(result.newTitle).toBe("Renamed");
  });

  it("rejects invalid action", () => {
    expect(() =>
      manageTabsSchema.parse({ documentId: "doc1", action: "move" })
    ).toThrow();
  });
});

// ── Document style schema ──

describe("updateDocumentStyleSchema", () => {
  it("requires documentId", () => {
    expect(() => updateDocumentStyleSchema.parse({})).toThrow();
  });

  it("accepts documentId with no style fields", () => {
    const result = updateDocumentStyleSchema.parse({
      documentId: "doc1",
    });
    expect(result.pageWidth).toBeUndefined();
  });

  it("accepts page size and margins", () => {
    const result = updateDocumentStyleSchema.parse({
      documentId: "doc1",
      pageWidth: 612,
      pageHeight: 792,
      marginTop: 72,
      marginBottom: 72,
      marginLeft: 72,
      marginRight: 72,
    });
    expect(result.pageWidth).toBe(612);
    expect(result.marginTop).toBe(72);
  });

  it("accepts header/footer margin and flags", () => {
    const result = updateDocumentStyleSchema.parse({
      documentId: "doc1",
      marginHeader: 36,
      marginFooter: 36,
      useFirstPageHeaderFooter: true,
      useEvenPageHeaderFooter: true,
      useCustomHeaderFooterMargins: true,
    });
    expect(result.useFirstPageHeaderFooter).toBe(true);
    expect(result.useCustomHeaderFooterMargins).toBe(true);
  });

  it("accepts backgroundColor as rgb", () => {
    const result = updateDocumentStyleSchema.parse({
      documentId: "doc1",
      backgroundColor: { red: 1, green: 1, blue: 0.9 },
    });
    expect(result.backgroundColor).toEqual({
      red: 1,
      green: 1,
      blue: 0.9,
    });
  });

  it("accepts header/footer ID assignments", () => {
    const result = updateDocumentStyleSchema.parse({
      documentId: "doc1",
      defaultHeaderId: "kix.hdr1",
      defaultFooterId: "kix.ftr1",
      firstPageHeaderId: "kix.hdr2",
      evenPageHeaderId: "kix.hdr3",
    });
    expect(result.defaultHeaderId).toBe("kix.hdr1");
    expect(result.firstPageHeaderId).toBe("kix.hdr2");
  });

  it("accepts flipPageOrientation", () => {
    const result = updateDocumentStyleSchema.parse({
      documentId: "doc1",
      flipPageOrientation: true,
    });
    expect(result.flipPageOrientation).toBe(true);
  });
});

// ── Special elements schema ──

describe("insertSpecialElementSchema", () => {
  it("requires documentId, action, and index", () => {
    expect(() => insertSpecialElementSchema.parse({})).toThrow();
    expect(() =>
      insertSpecialElementSchema.parse({ documentId: "doc1" })
    ).toThrow();
    expect(() =>
      insertSpecialElementSchema.parse({
        documentId: "doc1",
        action: "person",
      })
    ).toThrow();
  });

  it("accepts person with email", () => {
    const result = insertSpecialElementSchema.parse({
      documentId: "doc1",
      action: "person",
      index: 5,
      email: "alice@example.com",
    });
    expect(result.action).toBe("person");
    expect(result.email).toBe("alice@example.com");
  });

  it("accepts date action", () => {
    const result = insertSpecialElementSchema.parse({
      documentId: "doc1",
      action: "date",
      index: 10,
    });
    expect(result.action).toBe("date");
  });

  it("rejects invalid action", () => {
    expect(() =>
      insertSpecialElementSchema.parse({
        documentId: "doc1",
        action: "link",
        index: 1,
      })
    ).toThrow();
  });

  it("rejects non-integer index", () => {
    expect(() =>
      insertSpecialElementSchema.parse({
        documentId: "doc1",
        action: "date",
        index: 1.5,
      })
    ).toThrow();
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("schemas with required fields reject empty object", () => {
  it.each([
    ["createDocumentSchema", createDocumentSchema],
    ["getDocumentSchema", getDocumentSchema],
    ["readContentSchema", readContentSchema],
    ["searchSchema", searchSchema],
    ["insertTextSchema", insertTextSchema],
    ["replaceTextSchema", replaceTextSchema],
    ["deleteContentSchema", deleteContentSchema],
    ["formatTextSchema", formatTextSchema],
    ["formatParagraphSchema", formatParagraphSchema],
    ["manageTablesSchema", manageTablesSchema],
    ["manageSectionsSchema", manageSectionsSchema],
    ["manageHeadersFootersSchema", manageHeadersFootersSchema],
    ["manageImagesSchema", manageImagesSchema],
    ["manageNamedRangesSchema", manageNamedRangesSchema],
    ["manageTabsSchema", manageTabsSchema],
    ["updateDocumentStyleSchema", updateDocumentStyleSchema],
    ["insertSpecialElementSchema", insertSpecialElementSchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});

// ── Cross-cutting: tool count ──

describe("tool count", () => {
  it("exports exactly 17 per-tool schemas", () => {
    const schemas = [
      createDocumentSchema,
      getDocumentSchema,
      readContentSchema,
      searchSchema,
      insertTextSchema,
      replaceTextSchema,
      deleteContentSchema,
      formatTextSchema,
      formatParagraphSchema,
      manageTablesSchema,
      manageSectionsSchema,
      manageHeadersFootersSchema,
      manageImagesSchema,
      manageNamedRangesSchema,
      manageTabsSchema,
      updateDocumentStyleSchema,
      insertSpecialElementSchema,
    ];
    expect(schemas).toHaveLength(17);
  });
});
