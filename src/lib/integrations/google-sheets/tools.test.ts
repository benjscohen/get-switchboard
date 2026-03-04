import { vi } from "vitest";
import { SHEETS_TOOLS } from "./tools";

// ── Mock factory for sheets_v4.Sheets ──

function ok<T>(data: T) {
  return Promise.resolve({ data });
}

function mockSheets() {
  return {
    spreadsheets: {
      get: vi.fn(() =>
        ok({
          spreadsheetId: "ss1",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/ss1",
          properties: { title: "Test Sheet" },
          sheets: [
            {
              properties: {
                sheetId: 0,
                title: "Sheet1",
                gridProperties: { rowCount: 100, columnCount: 26 },
              },
            },
          ],
          namedRanges: [],
        })
      ),
      create: vi.fn(() =>
        ok({
          spreadsheetId: "new-ss",
          spreadsheetUrl: "https://docs.google.com/spreadsheets/d/new-ss",
          properties: { title: "New Sheet" },
          sheets: [{ properties: { title: "Sheet1" } }],
        })
      ),
      batchUpdate: vi.fn(() =>
        ok({ spreadsheetId: "ss1", replies: [{}] })
      ),
      values: {
        get: vi.fn(() =>
          ok({
            range: "Sheet1!A1:B3",
            values: [
              ["Name", "Age"],
              ["Alice", "30"],
              ["Bob", "25"],
            ],
          })
        ),
        batchGet: vi.fn(() =>
          ok({
            spreadsheetId: "ss1",
            valueRanges: [
              { range: "Sheet1!A1:B1", values: [["Name", "Age"]] },
            ],
          })
        ),
        update: vi.fn(() =>
          ok({ updatedRange: "Sheet1!A1:B2", updatedRows: 2, updatedColumns: 2 })
        ),
        batchUpdate: vi.fn(() =>
          ok({
            totalUpdatedRows: 2,
            totalUpdatedColumns: 2,
            totalUpdatedCells: 4,
          })
        ),
        append: vi.fn(() =>
          ok({ updates: { updatedRange: "Sheet1!A4:B4", updatedRows: 1 } })
        ),
        clear: vi.fn(() =>
          ok({ spreadsheetId: "ss1", clearedRange: "Sheet1!A1:Z100" })
        ),
      },
      sheets: {
        copyTo: vi.fn(() =>
          ok({ sheetId: 999, title: "Copy of Sheet1", sheetType: "GRID" })
        ),
      },
    },
  };
}

type MockSheets = ReturnType<typeof mockSheets>;

// Helper to find a tool by name
function tool(name: string) {
  const t = SHEETS_TOOLS.find((t) => t.name === name);
  if (!t) throw new Error(`Tool not found: ${name}`);
  return t;
}

// ── Tool count ──

describe("SHEETS_TOOLS", () => {
  it("exports exactly 16 tools", () => {
    expect(SHEETS_TOOLS).toHaveLength(16);
  });

  it("has unique tool names", () => {
    const names = SHEETS_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("all tool names start with google_sheets_", () => {
    for (const t of SHEETS_TOOLS) {
      expect(t.name).toMatch(/^google_sheets_/);
    }
  });

  it("all tools have a non-empty description", () => {
    for (const t of SHEETS_TOOLS) {
      expect(t.description.length).toBeGreaterThan(10);
    }
  });

  it("all tools have a schema and execute function", () => {
    for (const t of SHEETS_TOOLS) {
      expect(t.schema).toBeDefined();
      expect(typeof t.execute).toBe("function");
    }
  });
});

// ── Metadata & Discovery ──

describe("metadata & discovery tools", () => {
  let sheets: MockSheets;

  beforeEach(() => {
    sheets = mockSheets();
  });

  describe("google_sheets_get_info", () => {
    it("calls spreadsheets.get with correct fields", async () => {
      const t = tool("google_sheets_get_info");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await t.execute({ spreadsheetId: "ss1" }, sheets as any);

      expect(sheets.spreadsheets.get).toHaveBeenCalledWith({
        spreadsheetId: "ss1",
        fields:
          "spreadsheetId,spreadsheetUrl,properties.title,sheets.properties,namedRanges",
      });
      expect(result).toHaveProperty("spreadsheetId", "ss1");
      expect(result).toHaveProperty("properties");
    });
  });

  describe("google_sheets_create", () => {
    it("creates a spreadsheet with title only", async () => {
      const t = tool("google_sheets_create");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = (await t.execute({ title: "Budget" }, sheets as any)) as Record<string, unknown>;

      expect(sheets.spreadsheets.create).toHaveBeenCalledWith({
        requestBody: {
          properties: { title: "Budget" },
          sheets: undefined,
        },
      });
      expect(result.spreadsheetId).toBe("new-ss");
      expect(result.title).toBe("New Sheet");
    });

    it("creates a spreadsheet with tab names", async () => {
      const t = tool("google_sheets_create");
      await t.execute(
        { title: "Budget", sheetNames: "Income, Expenses, Summary" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      expect(sheets.spreadsheets.create).toHaveBeenCalledWith({
        requestBody: {
          properties: { title: "Budget" },
          sheets: [
            { properties: { title: "Income" } },
            { properties: { title: "Expenses" } },
            { properties: { title: "Summary" } },
          ],
        },
      });
    });
  });

  describe("google_sheets_search", () => {
    it("finds matching cells across sheets", async () => {
      const t = tool("google_sheets_search");

      // Mock get for sheet list
      sheets.spreadsheets.get.mockResolvedValueOnce({
        data: {
          sheets: [{ properties: { title: "Sheet1" } }],
        },
      });

      // Mock values.get for the sheet data
      sheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: {
          values: [
            ["Name", "Revenue"],
            ["Alice", "1000"],
            ["Bob", "2000"],
          ],
        },
      });

      const result = (await t.execute(
        { spreadsheetId: "ss1", searchText: "alice" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      )) as { matches: Array<{ sheet: string; cell: string; value: string }>; count: number };

      expect(result.count).toBe(1);
      expect(result.matches[0]).toEqual({
        sheet: "Sheet1",
        cell: "A2",
        value: "Alice",
      });
    });

    it("searches only specified sheet", async () => {
      const t = tool("google_sheets_search");

      sheets.spreadsheets.get.mockResolvedValueOnce({
        data: {
          sheets: [
            { properties: { title: "Sheet1" } },
            { properties: { title: "Sheet2" } },
          ],
        },
      });

      sheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [["match"]] },
      });

      const result = (await t.execute(
        {
          spreadsheetId: "ss1",
          searchText: "match",
          sheetName: "Sheet1",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      )) as { count: number };

      // Should only read Sheet1, not Sheet2
      expect(sheets.spreadsheets.values.get).toHaveBeenCalledTimes(1);
      expect(result.count).toBe(1);
    });

    it("returns empty when no match", async () => {
      const t = tool("google_sheets_search");

      sheets.spreadsheets.get.mockResolvedValueOnce({
        data: { sheets: [{ properties: { title: "Sheet1" } }] },
      });
      sheets.spreadsheets.values.get.mockResolvedValueOnce({
        data: { values: [["No", "Match"]] },
      });

      const result = (await t.execute(
        { spreadsheetId: "ss1", searchText: "xyz" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      )) as { count: number };

      expect(result.count).toBe(0);
    });
  });
});

// ── Data Read/Write ──

describe("data read/write tools", () => {
  let sheets: MockSheets;

  beforeEach(() => {
    sheets = mockSheets();
  });

  describe("google_sheets_read", () => {
    it("reads single range", async () => {
      const t = tool("google_sheets_read");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await t.execute({ spreadsheetId: "ss1", range: "Sheet1!A1:B3" }, sheets as any);

      expect(sheets.spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: "ss1",
        range: "Sheet1!A1:B3",
        valueRenderOption: "FORMATTED_VALUE",
      });
    });

    it("reads with showFormulas", async () => {
      const t = tool("google_sheets_read");
      await t.execute(
        { spreadsheetId: "ss1", range: "A1", showFormulas: true },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      expect(sheets.spreadsheets.values.get).toHaveBeenCalledWith({
        spreadsheetId: "ss1",
        range: "A1",
        valueRenderOption: "FORMULA",
      });
    });

    it("reads batch ranges (pipe-separated)", async () => {
      const t = tool("google_sheets_read");
      await t.execute(
        {
          spreadsheetId: "ss1",
          range: "Sheet1!A1",
          ranges: "Sheet1!A1:B5|Sheet2!C1:D10",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      expect(sheets.spreadsheets.values.batchGet).toHaveBeenCalledWith({
        spreadsheetId: "ss1",
        ranges: ["Sheet1!A1:B5", "Sheet2!C1:D10"],
        valueRenderOption: "FORMATTED_VALUE",
      });
    });
  });

  describe("google_sheets_write", () => {
    it("writes single range", async () => {
      const t = tool("google_sheets_write");
      await t.execute(
        {
          spreadsheetId: "ss1",
          range: "Sheet1!A1",
          values: '[["hello","world"]]',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      expect(sheets.spreadsheets.values.update).toHaveBeenCalledWith({
        spreadsheetId: "ss1",
        range: "Sheet1!A1",
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [["hello", "world"]] },
      });
    });

    it("writes batch with rangesData", async () => {
      const t = tool("google_sheets_write");
      const rangesData = JSON.stringify([
        { range: "Sheet1!A1", values: [["a"]] },
        { range: "Sheet1!B1", values: [["b"]] },
      ]);

      await t.execute(
        {
          spreadsheetId: "ss1",
          range: "Sheet1!A1",
          values: "[]",
          rangesData,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      expect(sheets.spreadsheets.values.batchUpdate).toHaveBeenCalledWith({
        spreadsheetId: "ss1",
        requestBody: {
          valueInputOption: "USER_ENTERED",
          data: [
            { range: "Sheet1!A1", values: [["a"]] },
            { range: "Sheet1!B1", values: [["b"]] },
          ],
        },
      });
    });
  });

  describe("google_sheets_append", () => {
    it("appends rows", async () => {
      const t = tool("google_sheets_append");
      await t.execute(
        {
          spreadsheetId: "ss1",
          range: "Sheet1!A1",
          values: '[["new","row"]]',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      expect(sheets.spreadsheets.values.append).toHaveBeenCalledWith({
        spreadsheetId: "ss1",
        range: "Sheet1!A1",
        valueInputOption: "USER_ENTERED",
        insertDataOption: "INSERT_ROWS",
        requestBody: { values: [["new", "row"]] },
      });
    });
  });

  describe("google_sheets_clear", () => {
    it("clears a range", async () => {
      const t = tool("google_sheets_clear");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await t.execute({ spreadsheetId: "ss1", range: "Sheet1!A1:Z100" }, sheets as any);

      expect(sheets.spreadsheets.values.clear).toHaveBeenCalledWith({
        spreadsheetId: "ss1",
        range: "Sheet1!A1:Z100",
      });
    });
  });
});

// ── Sort & Filter ──

describe("sort & filter tool", () => {
  let sheets: MockSheets;

  beforeEach(() => {
    sheets = mockSheets();
  });

  it("sorts by single column", async () => {
    const t = tool("google_sheets_sort_filter");
    await t.execute(
      {
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "sort",
        sortColumn: 1,
        sortOrder: "DESCENDING",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const call = sheets.spreadsheets.batchUpdate.mock.calls[0][0];
    expect(call.requestBody.requests[0].sortRange).toBeDefined();
    expect(call.requestBody.requests[0].sortRange.sortSpecs).toEqual([
      { dimensionIndex: 1, sortOrder: "DESCENDING" },
    ]);
  });

  it("sorts by multi-column specs", async () => {
    const t = tool("google_sheets_sort_filter");
    await t.execute(
      {
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "sort",
        sortSpecs: '[{"column_index":0,"order":"ASCENDING"},{"column_index":1,"order":"DESCENDING"}]',
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const specs =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0]
        .sortRange.sortSpecs;
    expect(specs).toHaveLength(2);
    expect(specs[0].dimensionIndex).toBe(0);
    expect(specs[1].dimensionIndex).toBe(1);
  });

  it("sets a basic filter", async () => {
    const t = tool("google_sheets_sort_filter");
    await t.execute(
      {
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "set_filter",
        rangeNotation: "0:0:10:5",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const req =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.setBasicFilter).toBeDefined();
    expect(req.setBasicFilter.filter.range).toEqual({
      sheetId: 0,
      startRowIndex: 0,
      startColumnIndex: 0,
      endRowIndex: 10,
      endColumnIndex: 5,
    });
  });

  it("clears a basic filter", async () => {
    const t = tool("google_sheets_sort_filter");
    await t.execute(
      { spreadsheetId: "ss1", sheetId: 0, operation: "clear_filter" },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const req =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.clearBasicFilter).toEqual({ sheetId: 0 });
  });
});

// ── Structure ──

describe("structure tools", () => {
  let sheets: MockSheets;

  beforeEach(() => {
    sheets = mockSheets();
  });

  describe("google_sheets_manage_tabs", () => {
    it("adds a tab", async () => {
      const t = tool("google_sheets_manage_tabs");
      await t.execute(
        { spreadsheetId: "ss1", operation: "add", title: "NewTab" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.addSheet.properties.title).toBe("NewTab");
    });

    it("deletes a tab", async () => {
      const t = tool("google_sheets_manage_tabs");
      await t.execute(
        { spreadsheetId: "ss1", operation: "delete", sheetId: 0 },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.deleteSheet.sheetId).toBe(0);
    });

    it("renames a tab", async () => {
      const t = tool("google_sheets_manage_tabs");
      await t.execute(
        {
          spreadsheetId: "ss1",
          operation: "rename",
          sheetId: 0,
          newTitle: "Renamed",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.updateSheetProperties.properties.title).toBe("Renamed");
      expect(req.updateSheetProperties.fields).toBe("title");
    });

    it("duplicates a tab", async () => {
      const t = tool("google_sheets_manage_tabs");
      await t.execute(
        {
          spreadsheetId: "ss1",
          operation: "duplicate",
          sheetId: 0,
          newTitle: "Copy",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.duplicateSheet.sourceSheetId).toBe(0);
      expect(req.duplicateSheet.newSheetName).toBe("Copy");
    });

    it("throws on unknown operation", async () => {
      const t = tool("google_sheets_manage_tabs");
      await expect(
        t.execute(
          { spreadsheetId: "ss1", operation: "move" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sheets as any
        )
      ).rejects.toThrow("Unknown tab operation: move");
    });
  });

  describe("google_sheets_copy_tab", () => {
    it("copies tab to another spreadsheet", async () => {
      const t = tool("google_sheets_copy_tab");
      await t.execute(
        { spreadsheetId: "ss1", sheetId: 0, destSpreadsheetId: "ss2" },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      expect(sheets.spreadsheets.sheets.copyTo).toHaveBeenCalledWith({
        spreadsheetId: "ss1",
        sheetId: 0,
        requestBody: { destinationSpreadsheetId: "ss2" },
      });
    });
  });

  describe("google_sheets_modify_structure", () => {
    it("inserts rows", async () => {
      const t = tool("google_sheets_modify_structure");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "insert_rows",
          start: 5,
          end: 10,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.insertDimension.range).toEqual({
        sheetId: 0,
        dimension: "ROWS",
        startIndex: 5,
        endIndex: 10,
      });
    });

    it("inserts columns", async () => {
      const t = tool("google_sheets_modify_structure");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "insert_cols",
          start: 2,
          end: 4,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.insertDimension.range.dimension).toBe("COLUMNS");
    });

    it("deletes rows", async () => {
      const t = tool("google_sheets_modify_structure");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "delete_rows",
          start: 0,
          end: 3,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.deleteDimension.range.dimension).toBe("ROWS");
    });

    it("deletes columns", async () => {
      const t = tool("google_sheets_modify_structure");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "delete_cols",
          start: 1,
          end: 3,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.deleteDimension.range.dimension).toBe("COLUMNS");
    });

    it("freezes panes", async () => {
      const t = tool("google_sheets_modify_structure");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "freeze",
          frozenRows: 1,
          frozenCols: 2,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.updateSheetProperties.properties.gridProperties).toEqual({
        frozenRowCount: 1,
        frozenColumnCount: 2,
      });
      expect(req.updateSheetProperties.fields).toBe(
        "gridProperties.frozenRowCount,gridProperties.frozenColumnCount"
      );
    });

    it("auto-resizes columns", async () => {
      const t = tool("google_sheets_modify_structure");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "auto_resize",
          start: 0,
          end: 10,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.autoResizeDimensions.dimensions).toEqual({
        sheetId: 0,
        dimension: "COLUMNS",
        startIndex: 0,
        endIndex: 10,
      });
    });

    it("throws on unknown operation", async () => {
      const t = tool("google_sheets_modify_structure");
      await expect(
        t.execute(
          { spreadsheetId: "ss1", sheetId: 0, operation: "hide" },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          sheets as any
        )
      ).rejects.toThrow("Unknown structure operation: hide");
    });
  });
});

// ── Formatting ──

describe("formatting tools", () => {
  let sheets: MockSheets;

  beforeEach(() => {
    sheets = mockSheets();
  });

  describe("google_sheets_format", () => {
    it("applies bold and font size", async () => {
      const t = tool("google_sheets_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:1:3",
          operation: "format",
          bold: true,
          fontSize: 14,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.repeatCell).toBeDefined();
      expect(req.repeatCell.cell.userEnteredFormat.textFormat.bold).toBe(true);
      expect(req.repeatCell.cell.userEnteredFormat.textFormat.fontSize).toBe(14);
      expect(req.repeatCell.range).toEqual({
        sheetId: 0,
        startRowIndex: 0,
        startColumnIndex: 0,
        endRowIndex: 1,
        endColumnIndex: 3,
      });
    });

    it("applies background color", async () => {
      const t = tool("google_sheets_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:5:5",
          operation: "format",
          bgColor: "#FF0000",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      const bg = req.repeatCell.cell.userEnteredFormat.backgroundColorStyle.rgbColor;
      expect(bg.red).toBe(1);
      expect(bg.green).toBe(0);
      expect(bg.blue).toBe(0);
    });

    it("applies alignment and wrap", async () => {
      const t = tool("google_sheets_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:10:5",
          operation: "format",
          horizontalAlign: "CENTER",
          verticalAlign: "MIDDLE",
          wrapStrategy: "WRAP",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const fmt =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0]
          .repeatCell.cell.userEnteredFormat;
      expect(fmt.horizontalAlignment).toBe("CENTER");
      expect(fmt.verticalAlignment).toBe("MIDDLE");
      expect(fmt.wrapStrategy).toBe("WRAP");
    });

    it("merges cells", async () => {
      const t = tool("google_sheets_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:2:3",
          operation: "merge",
          mergeType: "MERGE_ALL",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.mergeCells).toBeDefined();
      expect(req.mergeCells.mergeType).toBe("MERGE_ALL");
    });

    it("unmerges cells", async () => {
      const t = tool("google_sheets_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:2:3",
          operation: "unmerge",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.unmergeCells).toBeDefined();
    });

    it("adds a note", async () => {
      const t = tool("google_sheets_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "0:0:1:1",
          operation: "note",
          note: "Important cell",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.updateCells).toBeDefined();
      expect(req.updateCells.rows[0].values[0].note).toBe("Important cell");
    });

    it("applies number format", async () => {
      const t = tool("google_sheets_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          rangeNotation: "1:1:10:2",
          operation: "format",
          numberFormat: "#,##0.00",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const fmt =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0]
          .repeatCell.cell.userEnteredFormat;
      expect(fmt.numberFormat.pattern).toBe("#,##0.00");
    });
  });

  describe("google_sheets_conditional_format", () => {
    it("adds a value-based rule", async () => {
      const t = tool("google_sheets_conditional_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "add",
          rangeNotation: "1:1:100:2",
          conditionType: "NUMBER_GREATER",
          conditionValues: "100",
          bgColor: "#00FF00",
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.addConditionalFormatRule).toBeDefined();
      const rule = req.addConditionalFormatRule.rule;
      expect(rule.booleanRule.condition.type).toBe("NUMBER_GREATER");
      expect(rule.booleanRule.condition.values).toEqual([
        { userEnteredValue: "100" },
      ]);
    });

    it("adds a custom formula rule with formatting", async () => {
      const t = tool("google_sheets_conditional_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "add",
          rangeNotation: "0:0:10:5",
          conditionType: "CUSTOM_FORMULA",
          customFormula: "=A1>100",
          bgColor: "#FF0000",
          fontColor: "#FFFFFF",
          bold: true,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const rule =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0]
          .addConditionalFormatRule.rule;
      expect(rule.booleanRule.condition.type).toBe("CUSTOM_FORMULA");
      expect(rule.booleanRule.condition.values[0].userEnteredValue).toBe("=A1>100");
      expect(rule.booleanRule.format.textFormat.bold).toBe(true);
    });

    it("deletes a rule by index", async () => {
      const t = tool("google_sheets_conditional_format");
      await t.execute(
        {
          spreadsheetId: "ss1",
          sheetId: 0,
          operation: "delete",
          ruleIndex: 2,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        sheets as any
      );

      const req =
        sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
      expect(req.deleteConditionalFormatRule).toEqual({
        sheetId: 0,
        index: 2,
      });
    });
  });
});

// ── Validation ──

describe("validation tool", () => {
  let sheets: MockSheets;

  beforeEach(() => {
    sheets = mockSheets();
  });

  it("sets dropdown validation", async () => {
    const t = tool("google_sheets_validate");
    await t.execute(
      {
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "set",
        rangeNotation: "1:0:100:1",
        validationType: "ONE_OF_LIST",
        values: "Yes|No|Maybe",
        strict: true,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const req =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
    const rule = req.setDataValidation.rule;
    expect(rule.condition.type).toBe("ONE_OF_LIST");
    expect(rule.condition.values).toEqual([
      { userEnteredValue: "Yes" },
      { userEnteredValue: "No" },
      { userEnteredValue: "Maybe" },
    ]);
    expect(rule.strict).toBe(true);
    expect(rule.showCustomUi).toBe(true);
  });

  it("sets custom formula validation", async () => {
    const t = tool("google_sheets_validate");
    await t.execute(
      {
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "set",
        rangeNotation: "0:0:10:1",
        validationType: "CUSTOM_FORMULA",
        customFormula: "=A1>0",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const rule =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0]
        .setDataValidation.rule;
    expect(rule.condition.type).toBe("CUSTOM_FORMULA");
    expect(rule.condition.values[0].userEnteredValue).toBe("=A1>0");
  });

  it("clears validation", async () => {
    const t = tool("google_sheets_validate");
    await t.execute(
      {
        spreadsheetId: "ss1",
        sheetId: 0,
        operation: "clear",
        rangeNotation: "0:0:10:1",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const req =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.setDataValidation.range).toBeDefined();
    // No rule when clearing
    expect(req.setDataValidation.rule).toBeUndefined();
  });
});

// ── Charts ──

describe("charts tool", () => {
  let sheets: MockSheets;

  beforeEach(() => {
    sheets = mockSheets();
  });

  it("creates a chart", async () => {
    const t = tool("google_sheets_manage_charts");
    await t.execute(
      {
        spreadsheetId: "ss1",
        operation: "create",
        sheetId: 0,
        chartType: "BAR",
        title: "Revenue",
        dataRange: "Sheet1!A1:C10",
        positionRow: 0,
        positionCol: 5,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const req =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.addChart).toBeDefined();
    expect(req.addChart.chart.spec.title).toBe("Revenue");
    expect(req.addChart.chart.spec.basicChart.chartType).toBe("BAR");
    expect(
      req.addChart.chart.position.overlayPosition.anchorCell.columnIndex
    ).toBe(5);
  });

  it("updates a chart", async () => {
    const t = tool("google_sheets_manage_charts");
    await t.execute(
      {
        spreadsheetId: "ss1",
        operation: "update",
        sheetId: 0,
        chartId: 123,
        chartType: "LINE",
        title: "Updated Chart",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const req =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.updateChartSpec).toBeDefined();
    expect(req.updateChartSpec.chartId).toBe(123);
    expect(req.updateChartSpec.spec.title).toBe("Updated Chart");
  });

  it("deletes a chart", async () => {
    const t = tool("google_sheets_manage_charts");
    await t.execute(
      { spreadsheetId: "ss1", operation: "delete", chartId: 456 },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const req =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.deleteEmbeddedObject.objectId).toBe(456);
  });
});

// ── Named Ranges ──

describe("named ranges tool", () => {
  let sheets: MockSheets;

  beforeEach(() => {
    sheets = mockSheets();
  });

  it("creates a named range", async () => {
    const t = tool("google_sheets_manage_named_ranges");
    await t.execute(
      {
        spreadsheetId: "ss1",
        operation: "create",
        name: "TotalRevenue",
        sheetId: 0,
        rangeNotation: "0:0:1:1",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const req =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.addNamedRange.namedRange.name).toBe("TotalRevenue");
    expect(req.addNamedRange.namedRange.range).toEqual({
      sheetId: 0,
      startRowIndex: 0,
      startColumnIndex: 0,
      endRowIndex: 1,
      endColumnIndex: 1,
    });
  });

  it("deletes a named range", async () => {
    const t = tool("google_sheets_manage_named_ranges");
    await t.execute(
      {
        spreadsheetId: "ss1",
        operation: "delete",
        namedRangeId: "nr-abc",
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sheets as any
    );

    const req =
      sheets.spreadsheets.batchUpdate.mock.calls[0][0].requestBody.requests[0];
    expect(req.deleteNamedRange.namedRangeId).toBe("nr-abc");
  });
});

// ── Integration config ──

describe("google-sheets integration config", () => {
  it("exports correct config from index", async () => {
    const { googleSheetsIntegration } = await import("./index");

    expect(googleSheetsIntegration.id).toBe("google-sheets");
    expect(googleSheetsIntegration.name).toBe("Google Sheets");
    expect(googleSheetsIntegration.oauth.scopes).toContain(
      "https://www.googleapis.com/auth/spreadsheets"
    );
    expect(googleSheetsIntegration.oauth.extraAuthParams).toEqual({
      access_type: "offline",
      prompt: "consent",
    });
    expect(googleSheetsIntegration.toolCount).toBe(16);
    expect(googleSheetsIntegration.tools).toHaveLength(16);
  });

  it("wraps all tools as IntegrationToolDef (execute accepts unknown client)", async () => {
    const { googleSheetsIntegration } = await import("./index");

    for (const tool of googleSheetsIntegration.tools) {
      expect(tool.name).toMatch(/^google_sheets_/);
      expect(typeof tool.execute).toBe("function");
      expect(tool.schema).toBeDefined();
      expect(tool.description).toBeTruthy();
    }
  });
});
