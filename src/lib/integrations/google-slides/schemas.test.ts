import {
  presentationId,
  pageObjectId,
  elementObjectId,
  hexColor,
  sizeInPt,
  positionInPt,
  getPresentationSchema,
  getSlideContentSchema,
  getSlideThumbnailSchema,
  createPresentationSchema,
  manageSlidesSchema,
  addElementSchema,
  manageTextSchema,
  manageTableSchema,
  formatTextSchema,
  formatElementSchema,
  updatePageSchema,
  batchUpdateSchema,
} from "./schemas";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("presentationId requires a string", () => {
    expect(() => presentationId.parse(undefined)).toThrow();
    expect(presentationId.parse("abc123")).toBe("abc123");
  });

  it("pageObjectId requires a string", () => {
    expect(() => pageObjectId.parse(undefined)).toThrow();
    expect(pageObjectId.parse("p")).toBe("p");
  });

  it("elementObjectId requires a string", () => {
    expect(() => elementObjectId.parse(undefined)).toThrow();
    expect(elementObjectId.parse("g123")).toBe("g123");
  });

  it("hexColor validates hex format", () => {
    expect(hexColor.parse("#FF0000")).toBe("#FF0000");
    expect(hexColor.parse("#00ff00")).toBe("#00ff00");
  });

  it("hexColor rejects invalid formats", () => {
    expect(() => hexColor.parse("FF0000")).toThrow();
    expect(() => hexColor.parse("#FFF")).toThrow();
    expect(() => hexColor.parse("#GGGGGG")).toThrow();
    expect(() => hexColor.parse("red")).toThrow();
  });

  it("sizeInPt requires width and height", () => {
    expect(() => sizeInPt.parse({})).toThrow();
    expect(sizeInPt.parse({ width: 720, height: 405 })).toEqual({
      width: 720,
      height: 405,
    });
  });

  it("positionInPt requires x and y", () => {
    expect(() => positionInPt.parse({})).toThrow();
    expect(positionInPt.parse({ x: 50, y: 30 })).toEqual({
      x: 50,
      y: 30,
    });
  });
});

// ── Read schemas ──

describe("read schemas", () => {
  describe("getPresentationSchema", () => {
    it("requires presentationId", () => {
      expect(() => getPresentationSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = getPresentationSchema.parse({
        presentationId: "pres1",
      });
      expect(result.presentationId).toBe("pres1");
    });
  });

  describe("getSlideContentSchema", () => {
    it("requires presentationId and pageObjectId", () => {
      expect(() => getSlideContentSchema.parse({})).toThrow();
      expect(() =>
        getSlideContentSchema.parse({ presentationId: "pres1" })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = getSlideContentSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
      });
      expect(result.pageObjectId).toBe("p");
    });
  });

  describe("getSlideThumbnailSchema", () => {
    it("requires presentationId and pageObjectId", () => {
      expect(() => getSlideThumbnailSchema.parse({})).toThrow();
      expect(() =>
        getSlideThumbnailSchema.parse({ presentationId: "pres1" })
      ).toThrow();
    });

    it("accepts valid size options", () => {
      for (const size of ["SMALL", "MEDIUM", "LARGE"] as const) {
        const result = getSlideThumbnailSchema.parse({
          presentationId: "pres1",
          pageObjectId: "p",
          size,
        });
        expect(result.size).toBe(size);
      }
    });

    it("size is optional", () => {
      const result = getSlideThumbnailSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
      });
      expect(result.size).toBeUndefined();
    });

    it("rejects invalid size", () => {
      expect(() =>
        getSlideThumbnailSchema.parse({
          presentationId: "pres1",
          pageObjectId: "p",
          size: "HUGE",
        })
      ).toThrow();
    });
  });
});

// ── Structure schemas ──

describe("structure schemas", () => {
  describe("createPresentationSchema", () => {
    it("requires title", () => {
      expect(() => createPresentationSchema.parse({})).toThrow();
    });

    it("accepts title only", () => {
      const result = createPresentationSchema.parse({
        title: "Q4 Report",
      });
      expect(result.title).toBe("Q4 Report");
      expect(result.width).toBeUndefined();
    });

    it("accepts title with dimensions", () => {
      const result = createPresentationSchema.parse({
        title: "Custom",
        width: 720,
        height: 405,
      });
      expect(result.width).toBe(720);
      expect(result.height).toBe(405);
    });
  });

  describe("manageSlidesSchema", () => {
    it("requires presentationId and operation", () => {
      expect(() => manageSlidesSchema.parse({})).toThrow();
      expect(() =>
        manageSlidesSchema.parse({ presentationId: "pres1" })
      ).toThrow();
    });

    it("accepts all 5 operations", () => {
      const operations = [
        "add",
        "duplicate",
        "move",
        "delete",
        "update_notes",
      ] as const;

      for (const operation of operations) {
        const result = manageSlidesSchema.parse({
          presentationId: "pres1",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    });

    it("accepts add with layout and index", () => {
      const result = manageSlidesSchema.parse({
        presentationId: "pres1",
        operation: "add",
        layoutId: "layout1",
        insertionIndex: 2,
      });
      expect(result.layoutId).toBe("layout1");
      expect(result.insertionIndex).toBe(2);
    });

    it("accepts update_notes with speakerNotes", () => {
      const result = manageSlidesSchema.parse({
        presentationId: "pres1",
        operation: "update_notes",
        pageObjectId: "p",
        speakerNotes: "Remember to mention the quarterly data",
      });
      expect(result.speakerNotes).toBe(
        "Remember to mention the quarterly data"
      );
    });

    it("rejects invalid operation", () => {
      expect(() =>
        manageSlidesSchema.parse({
          presentationId: "pres1",
          operation: "resize",
        })
      ).toThrow();
    });
  });
});

// ── Content schemas ──

describe("content schemas", () => {
  describe("addElementSchema", () => {
    it("requires presentationId, pageObjectId, and elementType", () => {
      expect(() => addElementSchema.parse({})).toThrow();
      expect(() =>
        addElementSchema.parse({
          presentationId: "pres1",
          pageObjectId: "p",
        })
      ).toThrow();
    });

    it("accepts all 5 element types", () => {
      for (const elementType of [
        "text_box",
        "shape",
        "image",
        "table",
        "line",
      ] as const) {
        const result = addElementSchema.parse({
          presentationId: "pres1",
          pageObjectId: "p",
          elementType,
        });
        expect(result.elementType).toBe(elementType);
      }
    });

    it("accepts text_box with all fields", () => {
      const result = addElementSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
        elementType: "text_box",
        objectId: "myTextBox",
        x: 50,
        y: 30,
        width: 620,
        height: 60,
        text: "Hello World",
      });
      expect(result.objectId).toBe("myTextBox");
      expect(result.x).toBe(50);
      expect(result.text).toBe("Hello World");
    });

    it("accepts shape with shapeType", () => {
      const result = addElementSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
        elementType: "shape",
        shapeType: "ELLIPSE",
        x: 100,
        y: 100,
        width: 200,
        height: 200,
      });
      expect(result.shapeType).toBe("ELLIPSE");
    });

    it("accepts image with url", () => {
      const result = addElementSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
        elementType: "image",
        imageUrl: "https://example.com/image.png",
      });
      expect(result.imageUrl).toBe("https://example.com/image.png");
    });

    it("accepts table with rows and columns", () => {
      const result = addElementSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
        elementType: "table",
        rows: 4,
        columns: 3,
      });
      expect(result.rows).toBe(4);
      expect(result.columns).toBe(3);
    });

    it("accepts line with endpoints", () => {
      const result = addElementSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
        elementType: "line",
        x: 50,
        y: 200,
        endX: 670,
        endY: 200,
        lineType: "STRAIGHT",
      });
      expect(result.lineType).toBe("STRAIGHT");
      expect(result.endX).toBe(670);
    });

    it("rejects invalid elementType", () => {
      expect(() =>
        addElementSchema.parse({
          presentationId: "pres1",
          pageObjectId: "p",
          elementType: "chart",
        })
      ).toThrow();
    });

    it("rejects invalid lineType", () => {
      expect(() =>
        addElementSchema.parse({
          presentationId: "pres1",
          pageObjectId: "p",
          elementType: "line",
          lineType: "ZIGZAG",
        })
      ).toThrow();
    });
  });

  describe("manageTextSchema", () => {
    it("requires presentationId, elementObjectId, and operation", () => {
      expect(() => manageTextSchema.parse({})).toThrow();
      expect(() =>
        manageTextSchema.parse({
          presentationId: "pres1",
          elementObjectId: "g123",
        })
      ).toThrow();
    });

    it("accepts all 3 operations", () => {
      for (const operation of ["insert", "delete", "replace"] as const) {
        const result = manageTextSchema.parse({
          presentationId: "pres1",
          elementObjectId: "g123",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    });

    it("accepts insert with text and index", () => {
      const result = manageTextSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
        operation: "insert",
        text: "Hello",
        insertionIndex: 0,
      });
      expect(result.text).toBe("Hello");
      expect(result.insertionIndex).toBe(0);
    });

    it("accepts delete with range", () => {
      const result = manageTextSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
        operation: "delete",
        startIndex: 0,
        endIndex: 5,
      });
      expect(result.startIndex).toBe(0);
      expect(result.endIndex).toBe(5);
    });

    it("accepts replace with range and text", () => {
      const result = manageTextSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
        operation: "replace",
        startIndex: 0,
        endIndex: 5,
        text: "World",
      });
      expect(result.text).toBe("World");
    });

    it("rejects non-integer indices", () => {
      expect(() =>
        manageTextSchema.parse({
          presentationId: "pres1",
          elementObjectId: "g123",
          operation: "insert",
          insertionIndex: 1.5,
        })
      ).toThrow();
    });
  });

  describe("manageTableSchema", () => {
    it("requires presentationId, elementObjectId, and operation", () => {
      expect(() => manageTableSchema.parse({})).toThrow();
      expect(() =>
        manageTableSchema.parse({
          presentationId: "pres1",
          elementObjectId: "t1",
        })
      ).toThrow();
    });

    it("accepts all 6 operations", () => {
      for (const operation of [
        "insert_rows",
        "insert_columns",
        "delete_rows",
        "delete_columns",
        "merge_cells",
        "unmerge_cells",
      ] as const) {
        const result = manageTableSchema.parse({
          presentationId: "pres1",
          elementObjectId: "t1",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    });

    it("accepts insert_rows with count and position", () => {
      const result = manageTableSchema.parse({
        presentationId: "pres1",
        elementObjectId: "t1",
        operation: "insert_rows",
        rowIndex: 2,
        count: 3,
        insertBelow: true,
      });
      expect(result.rowIndex).toBe(2);
      expect(result.count).toBe(3);
      expect(result.insertBelow).toBe(true);
    });

    it("accepts merge_cells with span", () => {
      const result = manageTableSchema.parse({
        presentationId: "pres1",
        elementObjectId: "t1",
        operation: "merge_cells",
        rowIndex: 0,
        columnIndex: 0,
        rowSpan: 2,
        columnSpan: 3,
      });
      expect(result.rowSpan).toBe(2);
      expect(result.columnSpan).toBe(3);
    });

    it("rejects invalid operation", () => {
      expect(() =>
        manageTableSchema.parse({
          presentationId: "pres1",
          elementObjectId: "t1",
          operation: "resize",
        })
      ).toThrow();
    });
  });
});

// ── Styling schemas ──

describe("styling schemas", () => {
  describe("formatTextSchema", () => {
    it("requires presentationId and elementObjectId", () => {
      expect(() => formatTextSchema.parse({})).toThrow();
      expect(() =>
        formatTextSchema.parse({ presentationId: "pres1" })
      ).toThrow();
    });

    it("accepts range with no style fields (all optional)", () => {
      const result = formatTextSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
      });
      expect(result.bold).toBeUndefined();
    });

    it("accepts all text style fields", () => {
      const result = formatTextSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
        startIndex: 0,
        endIndex: 10,
        bold: true,
        italic: true,
        underline: false,
        strikethrough: false,
        fontFamily: "Roboto",
        fontSize: 24,
        foregroundColor: "#1A237E",
        backgroundColor: "#FFFF00",
        linkUrl: "https://example.com",
      });
      expect(result.bold).toBe(true);
      expect(result.fontFamily).toBe("Roboto");
      expect(result.fontSize).toBe(24);
      expect(result.foregroundColor).toBe("#1A237E");
    });

    it("startIndex and endIndex are optional (entire element)", () => {
      const result = formatTextSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
        bold: true,
      });
      expect(result.startIndex).toBeUndefined();
      expect(result.endIndex).toBeUndefined();
    });
  });

  describe("formatElementSchema", () => {
    it("requires presentationId, elementObjectId, and operation", () => {
      expect(() => formatElementSchema.parse({})).toThrow();
      expect(() =>
        formatElementSchema.parse({
          presentationId: "pres1",
          elementObjectId: "g123",
        })
      ).toThrow();
    });

    it("accepts all 5 operations", () => {
      for (const operation of [
        "fill",
        "border",
        "shadow",
        "transform",
        "opacity",
      ] as const) {
        const result = formatElementSchema.parse({
          presentationId: "pres1",
          elementObjectId: "g123",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    });

    it("accepts fill with color", () => {
      const result = formatElementSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
        operation: "fill",
        fillColor: "#4285F4",
      });
      expect(result.fillColor).toBe("#4285F4");
    });

    it("accepts border with all fields", () => {
      const result = formatElementSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
        operation: "border",
        borderColor: "#000000",
        borderWeight: 2,
        borderDashStyle: "DASH",
      });
      expect(result.borderColor).toBe("#000000");
      expect(result.borderWeight).toBe(2);
      expect(result.borderDashStyle).toBe("DASH");
    });

    it("accepts transform with position and size", () => {
      const result = formatElementSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
        operation: "transform",
        x: 100,
        y: 50,
        width: 400,
        height: 300,
        rotation: 45,
      });
      expect(result.x).toBe(100);
      expect(result.rotation).toBe(45);
    });

    it("accepts opacity value", () => {
      const result = formatElementSchema.parse({
        presentationId: "pres1",
        elementObjectId: "g123",
        operation: "opacity",
        opacity: 0.5,
      });
      expect(result.opacity).toBe(0.5);
    });

    it("rejects opacity out of range", () => {
      expect(() =>
        formatElementSchema.parse({
          presentationId: "pres1",
          elementObjectId: "g123",
          operation: "opacity",
          opacity: 1.5,
        })
      ).toThrow();
      expect(() =>
        formatElementSchema.parse({
          presentationId: "pres1",
          elementObjectId: "g123",
          operation: "opacity",
          opacity: -0.1,
        })
      ).toThrow();
    });

    it("rejects invalid borderDashStyle", () => {
      expect(() =>
        formatElementSchema.parse({
          presentationId: "pres1",
          elementObjectId: "g123",
          operation: "border",
          borderDashStyle: "WAVY",
        })
      ).toThrow();
    });
  });
});

// ── Page schema ──

describe("updatePageSchema", () => {
  it("requires presentationId, pageObjectId, and operation", () => {
    expect(() => updatePageSchema.parse({})).toThrow();
    expect(() =>
      updatePageSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
      })
    ).toThrow();
  });

  it("accepts all 4 operations", () => {
    for (const operation of [
      "background_color",
      "background_image",
      "transition",
      "apply_layout",
    ] as const) {
      const result = updatePageSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
        operation,
      });
      expect(result.operation).toBe(operation);
    }
  });

  it("accepts background_color with hex", () => {
    const result = updatePageSchema.parse({
      presentationId: "pres1",
      pageObjectId: "p",
      operation: "background_color",
      backgroundColor: "#1A237E",
    });
    expect(result.backgroundColor).toBe("#1A237E");
  });

  it("accepts background_image with URL", () => {
    const result = updatePageSchema.parse({
      presentationId: "pres1",
      pageObjectId: "p",
      operation: "background_image",
      backgroundImageUrl: "https://example.com/bg.png",
    });
    expect(result.backgroundImageUrl).toBe(
      "https://example.com/bg.png"
    );
  });

  it("accepts transition with type and duration", () => {
    const result = updatePageSchema.parse({
      presentationId: "pres1",
      pageObjectId: "p",
      operation: "transition",
      transitionType: "FADE",
      transitionDuration: 750,
    });
    expect(result.transitionType).toBe("FADE");
    expect(result.transitionDuration).toBe(750);
  });

  it("accepts all transition types", () => {
    for (const transitionType of [
      "NONE",
      "FADE",
      "SLIDE_FROM_LEFT",
      "SLIDE_FROM_RIGHT",
      "FLIP",
      "CUBE",
      "GALLERY",
      "PUSH",
      "ZOOM",
    ] as const) {
      const result = updatePageSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
        operation: "transition",
        transitionType,
      });
      expect(result.transitionType).toBe(transitionType);
    }
  });

  it("rejects invalid transition type", () => {
    expect(() =>
      updatePageSchema.parse({
        presentationId: "pres1",
        pageObjectId: "p",
        operation: "transition",
        transitionType: "DISSOLVE",
      })
    ).toThrow();
  });

  it("accepts apply_layout with layoutId", () => {
    const result = updatePageSchema.parse({
      presentationId: "pres1",
      pageObjectId: "p",
      operation: "apply_layout",
      layoutId: "layout1",
    });
    expect(result.layoutId).toBe("layout1");
  });
});

// ── Batch update schema ──

describe("batchUpdateSchema", () => {
  it("requires presentationId and requests", () => {
    expect(() => batchUpdateSchema.parse({})).toThrow();
    expect(() =>
      batchUpdateSchema.parse({ presentationId: "pres1" })
    ).toThrow();
  });

  it("accepts valid input", () => {
    const result = batchUpdateSchema.parse({
      presentationId: "pres1",
      requests: '[{"deleteObject":{"objectId":"g123"}}]',
    });
    expect(result.requests).toContain("deleteObject");
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("schemas with required fields reject empty object", () => {
  it.each([
    ["getPresentationSchema", getPresentationSchema],
    ["getSlideContentSchema", getSlideContentSchema],
    ["getSlideThumbnailSchema", getSlideThumbnailSchema],
    ["createPresentationSchema", createPresentationSchema],
    ["manageSlidesSchema", manageSlidesSchema],
    ["addElementSchema", addElementSchema],
    ["manageTextSchema", manageTextSchema],
    ["manageTableSchema", manageTableSchema],
    ["formatTextSchema", formatTextSchema],
    ["formatElementSchema", formatElementSchema],
    ["updatePageSchema", updatePageSchema],
    ["batchUpdateSchema", batchUpdateSchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});

// ── Cross-cutting: tool count ──

describe("tool count", () => {
  it("exports exactly 12 per-tool schemas", () => {
    const schemas = [
      getPresentationSchema,
      getSlideContentSchema,
      getSlideThumbnailSchema,
      createPresentationSchema,
      manageSlidesSchema,
      addElementSchema,
      manageTextSchema,
      manageTableSchema,
      formatTextSchema,
      formatElementSchema,
      updatePageSchema,
      batchUpdateSchema,
    ];
    expect(schemas).toHaveLength(12);
  });
});
