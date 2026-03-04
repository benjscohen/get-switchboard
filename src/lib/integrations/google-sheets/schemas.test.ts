import {
  spreadsheetId,
  sheetId,
  range,
  rangeNotation,
  values,
  getInfoSchema,
  createSchema,
  searchSchema,
  readSchema,
  writeSchema,
  appendSchema,
  clearSchema,
  sortFilterSchema,
  manageTabsSchema,
  copyTabSchema,
  modifyStructureSchema,
  formatSchema,
  conditionalFormatSchema,
  validateSchema,
  manageChartsSchema,
  manageNamedRangesSchema,
} from "./schemas";

// ── Shared fragments ──

describe("shared fragments", () => {
  it("spreadsheetId requires a string", () => {
    expect(() => spreadsheetId.parse(undefined)).toThrow();
    expect(spreadsheetId.parse("abc123")).toBe("abc123");
  });

  it("sheetId requires an integer", () => {
    expect(() => sheetId.parse(undefined)).toThrow();
    expect(() => sheetId.parse(1.5)).toThrow();
    expect(sheetId.parse(0)).toBe(0);
    expect(sheetId.parse(42)).toBe(42);
  });

  it("range requires a string", () => {
    expect(() => range.parse(undefined)).toThrow();
    expect(range.parse("Sheet1!A1:C10")).toBe("Sheet1!A1:C10");
  });

  it("rangeNotation requires a string", () => {
    expect(() => rangeNotation.parse(undefined)).toThrow();
    expect(rangeNotation.parse("0:0:10:5")).toBe("0:0:10:5");
  });

  it("values requires a string", () => {
    expect(() => values.parse(undefined)).toThrow();
    expect(values.parse('[["a","b"]]')).toBe('[["a","b"]]');
  });
});

// ── Metadata & Discovery ──

describe("metadata & discovery schemas", () => {
  describe("getInfoSchema", () => {
    it("requires spreadsheetId", () => {
      expect(() => getInfoSchema.parse({})).toThrow();
    });

    it("accepts valid input", () => {
      const result = getInfoSchema.parse({ spreadsheetId: "ss1" });
      expect(result.spreadsheetId).toBe("ss1");
    });
  });

  describe("createSchema", () => {
    it("requires title", () => {
      expect(() => createSchema.parse({})).toThrow();
    });

    it("accepts title only", () => {
      const result = createSchema.parse({ title: "My Sheet" });
      expect(result.title).toBe("My Sheet");
      expect(result.sheetNames).toBeUndefined();
    });

    it("accepts title with sheetNames", () => {
      const result = createSchema.parse({
        title: "Budget",
        sheetNames: "Income,Expenses,Summary",
      });
      expect(result.sheetNames).toBe("Income,Expenses,Summary");
    });
  });

  describe("searchSchema", () => {
    it("requires spreadsheetId and searchText", () => {
      expect(() => searchSchema.parse({})).toThrow();
      expect(() => searchSchema.parse({ spreadsheetId: "ss1" })).toThrow();
    });

    it("accepts valid input without sheetName", () => {
      const result = searchSchema.parse({
        spreadsheetId: "ss1",
        searchText: "revenue",
      });
      expect(result.searchText).toBe("revenue");
      expect(result.sheetName).toBeUndefined();
    });

    it("accepts valid input with sheetName", () => {
      const result = searchSchema.parse({
        spreadsheetId: "ss1",
        searchText: "total",
        sheetName: "Summary",
      });
      expect(result.sheetName).toBe("Summary");
    });
  });
});

// ── Data Read/Write ──

describe("data read/write schemas", () => {
  describe("readSchema", () => {
    it("requires spreadsheetId and range", () => {
      expect(() => readSchema.parse({})).toThrow();
      expect(() => readSchema.parse({ spreadsheetId: "ss1" })).toThrow();
    });

    it("accepts single range", () => {
      const result = readSchema.parse({
        spreadsheetId: "ss1",
        range: "Sheet1!A1:B5",
      });
      expect(result.range).toBe("Sheet1!A1:B5");
      expect(result.ranges).toBeUndefined();
      expect(result.showFormulas).toBeUndefined();
    });

    it("accepts batch ranges and showFormulas", () => {
      const result = readSchema.parse({
        spreadsheetId: "ss1",
        range: "Sheet1!A1",
        ranges: "Sheet1!A1:B5|Sheet2!C1:D10",
        showFormulas: true,
      });
      expect(result.ranges).toBe("Sheet1!A1:B5|Sheet2!C1:D10");
      expect(result.showFormulas).toBe(true);
    });
  });

  describe("writeSchema", () => {
    it("requires spreadsheetId, range, and values", () => {
      expect(() => writeSchema.parse({})).toThrow();
      expect(() =>
        writeSchema.parse({ spreadsheetId: "ss1", range: "A1" })
      ).toThrow();
    });

    it("accepts single write", () => {
      const result = writeSchema.parse({
        spreadsheetId: "ss1",
        range: "Sheet1!A1",
        values: '[["hello"]]',
      });
      expect(result.values).toBe('[["hello"]]');
      expect(result.rangesData).toBeUndefined();
    });

    it("accepts batch write with rangesData", () => {
      const result = writeSchema.parse({
        spreadsheetId: "ss1",
        range: "Sheet1!A1",
        values: "[]",
        rangesData: '[{"range":"A1","values":[["x"]]}]',
      });
      expect(result.rangesData).toBeDefined();
    });
  });

  describe("appendSchema", () => {
    it("requires spreadsheetId, range, and values", () => {
      expect(() => appendSchema.parse({})).toThrow();
      expect(() =>
        appendSchema.parse({ spreadsheetId: "ss1", range: "A1" })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = appendSchema.parse({
        spreadsheetId: "ss1",
        range: "Sheet1!A1",
        values: '[["new row"]]',
      });
      expect(result.values).toBe('[["new row"]]');
    });
  });

  describe("clearSchema", () => {
    it("requires spreadsheetId and range", () => {
      expect(() => clearSchema.parse({})).toThrow();
      expect(() => clearSchema.parse({ spreadsheetId: "ss1" })).toThrow();
    });

    it("accepts valid input", () => {
      const result = clearSchema.parse({
        spreadsheetId: "ss1",
        range: "Sheet1!A1:Z100",
      });
      expect(result.range).toBe("Sheet1!A1:Z100");
    });
  });

  describe("sortFilterSchema", () => {
    it("requires spreadsheetId, sheetId, and operation", () => {
      expect(() => sortFilterSchema.parse({})).toThrow();
      expect(() =>
        sortFilterSchema.parse({ spreadsheetId: "ss1", sheetId: 0 })
      ).toThrow();
    });

    it("rejects invalid operation", () => {
      expect(() =>
        sortFilterSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "reverse",
        })
      ).toThrow();
    });

    it.each(["sort", "set_filter", "clear_filter"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = sortFilterSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    );

    it("accepts sort with column and order", () => {
      const result = sortFilterSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "sort",
        sortColumn: 2,
        sortOrder: "DESCENDING",
      });
      expect(result.sortColumn).toBe(2);
      expect(result.sortOrder).toBe("DESCENDING");
    });

    it("accepts sort with sortSpecs JSON", () => {
      const result = sortFilterSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "sort",
        sortSpecs: '[{"column_index":0,"order":"ASCENDING"}]',
      });
      expect(result.sortSpecs).toBeDefined();
    });

    it("rejects invalid sortOrder", () => {
      expect(() =>
        sortFilterSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "sort",
          sortOrder: "UP",
        })
      ).toThrow();
    });
  });
});

// ── Structure ──

describe("structure schemas", () => {
  describe("manageTabsSchema", () => {
    it("requires spreadsheetId and operation", () => {
      expect(() => manageTabsSchema.parse({})).toThrow();
      expect(() =>
        manageTabsSchema.parse({ spreadsheetId: "ss1" })
      ).toThrow();
    });

    it.each(["add", "delete", "rename", "duplicate"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageTabsSchema.parse({
          spreadsheetId: "ss1",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        manageTabsSchema.parse({
          spreadsheetId: "ss1",
          operation: "move",
        })
      ).toThrow();
    });

    it("accepts add with title", () => {
      const result = manageTabsSchema.parse({
        spreadsheetId: "ss1",
        operation: "add",
        title: "New Tab",
      });
      expect(result.title).toBe("New Tab");
    });

    it("accepts rename with sheetId and newTitle", () => {
      const result = manageTabsSchema.parse({
        spreadsheetId: "ss1",
        operation: "rename",
        sheetId: 0,
        newTitle: "Renamed",
      });
      expect(result.sheetId).toBe(0);
      expect(result.newTitle).toBe("Renamed");
    });

    it("accepts duplicate with destSpreadsheetId", () => {
      const result = manageTabsSchema.parse({
        spreadsheetId: "ss1",
        operation: "duplicate",
        sheetId: 0,
        destSpreadsheetId: "ss2",
      });
      expect(result.destSpreadsheetId).toBe("ss2");
    });
  });

  describe("copyTabSchema", () => {
    it("requires all three fields", () => {
      expect(() => copyTabSchema.parse({})).toThrow();
      expect(() =>
        copyTabSchema.parse({ spreadsheetId: "ss1", sheetId: 0 })
      ).toThrow();
    });

    it("accepts valid input", () => {
      const result = copyTabSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        destSpreadsheetId: "ss2",
      });
      expect(result.destSpreadsheetId).toBe("ss2");
    });
  });

  describe("modifyStructureSchema", () => {
    it("requires spreadsheetId, sheetId, and operation", () => {
      expect(() => modifyStructureSchema.parse({})).toThrow();
    });

    it.each([
      "insert_rows",
      "insert_cols",
      "delete_rows",
      "delete_cols",
      "freeze",
      "auto_resize",
    ] as const)("accepts operation '%s'", (operation) => {
      const result = modifyStructureSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation,
      });
      expect(result.operation).toBe(operation);
    });

    it("rejects invalid operation", () => {
      expect(() =>
        modifyStructureSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "hide",
        })
      ).toThrow();
    });

    it("accepts insert with start and end", () => {
      const result = modifyStructureSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "insert_rows",
        start: 5,
        end: 10,
      });
      expect(result.start).toBe(5);
      expect(result.end).toBe(10);
    });

    it("accepts freeze with frozenRows and frozenCols", () => {
      const result = modifyStructureSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "freeze",
        frozenRows: 1,
        frozenCols: 2,
      });
      expect(result.frozenRows).toBe(1);
      expect(result.frozenCols).toBe(2);
    });

    it("rejects non-integer sheetId", () => {
      expect(() =>
        modifyStructureSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 1.5,
          operation: "insert_rows",
        })
      ).toThrow();
    });
  });
});

// ── Formatting & Validation ──

describe("formatting & validation schemas", () => {
  describe("formatSchema", () => {
    it("requires spreadsheetId, sheetId, rangeNotation, and operation", () => {
      expect(() => formatSchema.parse({})).toThrow();
      expect(() =>
        formatSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:10:5",
        })
      ).toThrow();
    });

    it.each(["format", "merge", "unmerge", "note"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = formatSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:1:1",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    );

    it("accepts full format fields", () => {
      const result = formatSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        rangeNotation: "0:0:5:3",
        operation: "format",
        bold: true,
        italic: false,
        fontSize: 14,
        fontColor: "#FF0000",
        bgColor: "#FFFF00",
        numberFormat: "#,##0.00",
        horizontalAlign: "CENTER",
        verticalAlign: "MIDDLE",
        wrapStrategy: "WRAP",
      });
      expect(result.bold).toBe(true);
      expect(result.italic).toBe(false);
      expect(result.fontSize).toBe(14);
      expect(result.fontColor).toBe("#FF0000");
      expect(result.bgColor).toBe("#FFFF00");
      expect(result.horizontalAlign).toBe("CENTER");
      expect(result.verticalAlign).toBe("MIDDLE");
      expect(result.wrapStrategy).toBe("WRAP");
    });

    it("rejects invalid horizontalAlign", () => {
      expect(() =>
        formatSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:1:1",
          operation: "format",
          horizontalAlign: "JUSTIFY",
        })
      ).toThrow();
    });

    it("rejects invalid verticalAlign", () => {
      expect(() =>
        formatSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:1:1",
          operation: "format",
          verticalAlign: "BASELINE",
        })
      ).toThrow();
    });

    it("rejects invalid wrapStrategy", () => {
      expect(() =>
        formatSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:1:1",
          operation: "format",
          wrapStrategy: "ELLIPSIS",
        })
      ).toThrow();
    });

    it("accepts merge with mergeType", () => {
      const result = formatSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        rangeNotation: "0:0:2:3",
        operation: "merge",
        mergeType: "MERGE_ALL",
      });
      expect(result.mergeType).toBe("MERGE_ALL");
    });

    it.each(["MERGE_ALL", "MERGE_COLUMNS", "MERGE_ROWS"] as const)(
      "accepts mergeType '%s'",
      (mergeType) => {
        const result = formatSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:2:3",
          operation: "merge",
          mergeType,
        });
        expect(result.mergeType).toBe(mergeType);
      }
    );

    it("accepts note operation", () => {
      const result = formatSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        rangeNotation: "0:0:1:1",
        operation: "note",
        note: "This is a note",
      });
      expect(result.note).toBe("This is a note");
    });
  });

  describe("conditionalFormatSchema", () => {
    it("requires spreadsheetId, sheetId, and operation", () => {
      expect(() => conditionalFormatSchema.parse({})).toThrow();
    });

    it("accepts add with condition", () => {
      const result = conditionalFormatSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "add",
        rangeNotation: "0:0:10:1",
        conditionType: "NUMBER_GREATER",
        conditionValues: "100",
        bgColor: "#FF0000",
      });
      expect(result.conditionType).toBe("NUMBER_GREATER");
      expect(result.conditionValues).toBe("100");
    });

    it("accepts add with BETWEEN (pipe-separated values)", () => {
      const result = conditionalFormatSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "add",
        rangeNotation: "0:0:10:1",
        conditionType: "NUMBER_BETWEEN",
        conditionValues: "10|20",
      });
      expect(result.conditionValues).toBe("10|20");
    });

    it("accepts add with custom formula", () => {
      const result = conditionalFormatSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "add",
        rangeNotation: "0:0:10:5",
        conditionType: "CUSTOM_FORMULA",
        customFormula: "=A1>100",
        bgColor: "#00FF00",
        fontColor: "#000000",
        bold: true,
      });
      expect(result.customFormula).toBe("=A1>100");
      expect(result.bold).toBe(true);
    });

    it("accepts delete with ruleIndex", () => {
      const result = conditionalFormatSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "delete",
        ruleIndex: 0,
      });
      expect(result.ruleIndex).toBe(0);
    });

    it.each([
      "NUMBER_GREATER",
      "NUMBER_LESS",
      "NUMBER_EQ",
      "NUMBER_BETWEEN",
      "TEXT_CONTAINS",
      "TEXT_NOT_CONTAINS",
      "TEXT_STARTS_WITH",
      "TEXT_ENDS_WITH",
      "TEXT_EQ",
      "DATE_BEFORE",
      "DATE_AFTER",
      "BLANK",
      "NOT_BLANK",
      "CUSTOM_FORMULA",
    ] as const)("accepts conditionType '%s'", (conditionType) => {
      const result = conditionalFormatSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "add",
        conditionType,
      });
      expect(result.conditionType).toBe(conditionType);
    });

    it("rejects invalid conditionType", () => {
      expect(() =>
        conditionalFormatSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "add",
          conditionType: "INVALID",
        })
      ).toThrow();
    });

    it("rejects invalid operation", () => {
      expect(() =>
        conditionalFormatSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "update",
        })
      ).toThrow();
    });
  });

  describe("validateSchema", () => {
    it("requires spreadsheetId, sheetId, operation, and rangeNotation", () => {
      expect(() => validateSchema.parse({})).toThrow();
      expect(() =>
        validateSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "set",
        })
      ).toThrow();
    });

    it("accepts set with dropdown list", () => {
      const result = validateSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "set",
        rangeNotation: "1:0:100:1",
        validationType: "ONE_OF_LIST",
        values: "Yes|No|Maybe",
        strict: true,
      });
      expect(result.validationType).toBe("ONE_OF_LIST");
      expect(result.values).toBe("Yes|No|Maybe");
      expect(result.strict).toBe(true);
    });

    it("accepts set with number constraint", () => {
      const result = validateSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "set",
        rangeNotation: "0:0:10:1",
        validationType: "NUMBER_GREATER",
        values: "0",
      });
      expect(result.validationType).toBe("NUMBER_GREATER");
    });

    it("accepts set with custom formula", () => {
      const result = validateSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "set",
        rangeNotation: "0:0:10:1",
        validationType: "CUSTOM_FORMULA",
        customFormula: "=A1>0",
      });
      expect(result.customFormula).toBe("=A1>0");
    });

    it("accepts clear", () => {
      const result = validateSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "clear",
        rangeNotation: "0:0:10:1",
      });
      expect(result.operation).toBe("clear");
    });

    it.each([
      "ONE_OF_LIST",
      "NUMBER_GREATER",
      "NUMBER_LESS",
      "NUMBER_EQ",
      "NUMBER_BETWEEN",
      "DATE_BEFORE",
      "DATE_AFTER",
      "TEXT_CONTAINS",
      "CUSTOM_FORMULA",
    ] as const)("accepts validationType '%s'", (validationType) => {
      const result = validateSchema.parse({
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "set",
        rangeNotation: "0:0:1:1",
        validationType,
      });
      expect(result.validationType).toBe(validationType);
    });

    it("rejects invalid validationType", () => {
      expect(() =>
        validateSchema.parse({
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "set",
          rangeNotation: "0:0:1:1",
          validationType: "REGEX",
        })
      ).toThrow();
    });
  });
});

// ── Charts & Named Ranges ──

describe("charts & named ranges schemas", () => {
  describe("manageChartsSchema", () => {
    it("requires spreadsheetId and operation", () => {
      expect(() => manageChartsSchema.parse({})).toThrow();
      expect(() =>
        manageChartsSchema.parse({ spreadsheetId: "ss1" })
      ).toThrow();
    });

    it.each(["create", "update", "delete"] as const)(
      "accepts operation '%s'",
      (operation) => {
        const result = manageChartsSchema.parse({
          spreadsheetId: "ss1",
          operation,
        });
        expect(result.operation).toBe(operation);
      }
    );

    it("rejects invalid operation", () => {
      expect(() =>
        manageChartsSchema.parse({
          spreadsheetId: "ss1",
          operation: "move",
        })
      ).toThrow();
    });

    it.each([
      "BAR",
      "LINE",
      "PIE",
      "COLUMN",
      "SCATTER",
      "AREA",
      "COMBO",
      "STEPPED_AREA",
    ] as const)("accepts chartType '%s'", (chartType) => {
      const result = manageChartsSchema.parse({
        spreadsheetId: "ss1",
        operation: "create",
        chartType,
      });
      expect(result.chartType).toBe(chartType);
    });

    it("rejects invalid chartType", () => {
      expect(() =>
        manageChartsSchema.parse({
          spreadsheetId: "ss1",
          operation: "create",
          chartType: "DONUT",
        })
      ).toThrow();
    });

    it("accepts create with all fields", () => {
      const result = manageChartsSchema.parse({
        spreadsheetId: "ss1",
        operation: "create",
        sheetId: 0,
        chartType: "BAR",
        title: "Revenue Chart",
        dataRange: "Sheet1!A1:C10",
        positionRow: 0,
        positionCol: 5,
      });
      expect(result.title).toBe("Revenue Chart");
      expect(result.dataRange).toBe("Sheet1!A1:C10");
      expect(result.positionRow).toBe(0);
      expect(result.positionCol).toBe(5);
    });

    it("accepts delete with chartId", () => {
      const result = manageChartsSchema.parse({
        spreadsheetId: "ss1",
        operation: "delete",
        chartId: 12345,
      });
      expect(result.chartId).toBe(12345);
    });
  });

  describe("manageNamedRangesSchema", () => {
    it("requires spreadsheetId and operation", () => {
      expect(() => manageNamedRangesSchema.parse({})).toThrow();
      expect(() =>
        manageNamedRangesSchema.parse({ spreadsheetId: "ss1" })
      ).toThrow();
    });

    it("accepts create with all fields", () => {
      const result = manageNamedRangesSchema.parse({
        spreadsheetId: "ss1",
        operation: "create",
        name: "TotalRevenue",
        sheetId: 0,
        rangeNotation: "0:0:1:1",
      });
      expect(result.name).toBe("TotalRevenue");
    });

    it("accepts delete with namedRangeId", () => {
      const result = manageNamedRangesSchema.parse({
        spreadsheetId: "ss1",
        operation: "delete",
        namedRangeId: "nr123",
      });
      expect(result.namedRangeId).toBe("nr123");
    });

    it("rejects invalid operation", () => {
      expect(() =>
        manageNamedRangesSchema.parse({
          spreadsheetId: "ss1",
          operation: "update",
        })
      ).toThrow();
    });
  });
});

// ── Cross-cutting: schemas with required fields reject {} ──

describe("all schemas reject empty object (all have required spreadsheetId or title)", () => {
  it.each([
    ["getInfoSchema", getInfoSchema],
    ["createSchema", createSchema],
    ["searchSchema", searchSchema],
    ["readSchema", readSchema],
    ["writeSchema", writeSchema],
    ["appendSchema", appendSchema],
    ["clearSchema", clearSchema],
    ["sortFilterSchema", sortFilterSchema],
    ["manageTabsSchema", manageTabsSchema],
    ["copyTabSchema", copyTabSchema],
    ["modifyStructureSchema", modifyStructureSchema],
    ["formatSchema", formatSchema],
    ["conditionalFormatSchema", conditionalFormatSchema],
    ["validateSchema", validateSchema],
    ["manageChartsSchema", manageChartsSchema],
    ["manageNamedRangesSchema", manageNamedRangesSchema],
  ] as const)("%s rejects {}", (_name, schema) => {
    expect(() => schema.parse({})).toThrow();
  });
});
