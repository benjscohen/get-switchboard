import { z } from "zod";

// ── Shared fragments ──

export const spreadsheetId = z
  .string()
  .describe("The ID of the spreadsheet (from the URL)");

export const sheetId = z
  .number()
  .int()
  .describe("Numeric sheet/tab ID (0 for first tab)");

export const range = z
  .string()
  .describe('A1 notation range (e.g. "Sheet1!A1:C10")');

export const rangeNotation = z
  .string()
  .describe(
    "Grid range as start_row:start_col:end_row:end_col (0-indexed, exclusive end). Example: 0:0:10:5"
  );

export const values = z
  .string()
  .describe(
    'JSON array of row arrays, e.g. [["Name","Age"],["Alice",30]]'
  );

// ── Metadata & Discovery (3) ──

export const getInfoSchema = z.object({
  spreadsheetId,
});

export const createSchema = z.object({
  title: z.string().describe("Title for the new spreadsheet"),
  sheetNames: z
    .string()
    .optional()
    .describe("Comma-separated tab names to create (e.g. Sheet1,Sheet2)"),
});

export const searchSchema = z.object({
  spreadsheetId,
  searchText: z.string().describe("Text to search for (case-insensitive)"),
  sheetName: z
    .string()
    .optional()
    .describe("Limit search to a specific sheet name"),
});

// ── Data Read/Write (5) ──

export const readSchema = z.object({
  spreadsheetId,
  range,
  ranges: z
    .string()
    .optional()
    .describe('Pipe-separated ranges for batch read (e.g. "Sheet1!A1:B5|Sheet2!C1:D10")'),
  showFormulas: z
    .boolean()
    .optional()
    .describe("Return formulas instead of computed values"),
});

export const writeSchema = z.object({
  spreadsheetId,
  range,
  values,
  rangesData: z
    .string()
    .optional()
    .describe(
      'JSON array of {range, values} for batch writes, e.g. [{"range":"Sheet1!A1","values":[["a"]]}]'
    ),
});

export const appendSchema = z.object({
  spreadsheetId,
  range,
  values,
});

export const clearSchema = z.object({
  spreadsheetId,
  range,
});

export const sortFilterSchema = z.object({
  spreadsheetId,
  sheetId,
  operation: z
    .enum(["sort", "set_filter", "clear_filter"])
    .describe("Operation to perform"),
  rangeNotation: rangeNotation.optional(),
  sortColumn: z
    .number()
    .int()
    .optional()
    .describe("Column index to sort by (0-indexed)"),
  sortOrder: z
    .enum(["ASCENDING", "DESCENDING"])
    .optional()
    .describe("Sort direction"),
  sortSpecs: z
    .string()
    .optional()
    .describe(
      'JSON array of {column_index, order} for multi-column sort, e.g. [{"column_index":0,"order":"ASCENDING"}]'
    ),
});

// ── Structure (3) ──

export const manageTabsSchema = z.object({
  spreadsheetId,
  operation: z
    .enum(["add", "delete", "rename", "duplicate"])
    .describe("Tab operation to perform"),
  title: z.string().optional().describe("Tab name (for add)"),
  sheetId: sheetId.optional(),
  newTitle: z.string().optional().describe("New name (for rename)"),
  destSpreadsheetId: z
    .string()
    .optional()
    .describe("Destination spreadsheet ID (for duplicate to another spreadsheet)"),
});

export const copyTabSchema = z.object({
  spreadsheetId,
  sheetId,
  destSpreadsheetId: z
    .string()
    .describe("Destination spreadsheet ID to copy the tab to"),
});

export const modifyStructureSchema = z.object({
  spreadsheetId,
  sheetId,
  operation: z
    .enum([
      "insert_rows",
      "insert_cols",
      "delete_rows",
      "delete_cols",
      "freeze",
      "auto_resize",
    ])
    .describe("Structural operation to perform"),
  start: z
    .number()
    .int()
    .optional()
    .describe("Start index (0-indexed, inclusive)"),
  end: z
    .number()
    .int()
    .optional()
    .describe("End index (0-indexed, exclusive)"),
  frozenRows: z.number().int().optional().describe("Number of rows to freeze"),
  frozenCols: z
    .number()
    .int()
    .optional()
    .describe("Number of columns to freeze"),
});

// ── Formatting & Validation (3) ──

export const formatSchema = z.object({
  spreadsheetId,
  sheetId,
  rangeNotation,
  operation: z
    .enum(["format", "merge", "unmerge", "note"])
    .describe("Formatting operation"),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
  fontSize: z.number().int().optional().describe("Font size in points"),
  fontColor: z.string().optional().describe('Hex color for text (e.g. "#FF0000")'),
  bgColor: z
    .string()
    .optional()
    .describe('Hex color for background (e.g. "#FFFF00")'),
  numberFormat: z
    .string()
    .optional()
    .describe('Number format pattern (e.g. "#,##0.00", "yyyy-mm-dd")'),
  horizontalAlign: z
    .enum(["LEFT", "CENTER", "RIGHT"])
    .optional(),
  verticalAlign: z
    .enum(["TOP", "MIDDLE", "BOTTOM"])
    .optional(),
  wrapStrategy: z
    .enum(["OVERFLOW_CELL", "CLIP", "WRAP"])
    .optional(),
  mergeType: z
    .enum(["MERGE_ALL", "MERGE_COLUMNS", "MERGE_ROWS"])
    .optional()
    .describe("Merge type (for merge operation)"),
  note: z.string().optional().describe("Cell note text (for note operation)"),
});

export const conditionalFormatSchema = z.object({
  spreadsheetId,
  sheetId,
  operation: z.enum(["add", "delete"]).describe("Add or delete a rule"),
  rangeNotation: rangeNotation.optional(),
  conditionType: z
    .enum([
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
    ])
    .optional()
    .describe("Condition type"),
  conditionValues: z
    .string()
    .optional()
    .describe("Pipe-separated condition values (e.g. 10|20 for BETWEEN)"),
  customFormula: z
    .string()
    .optional()
    .describe('Custom formula (e.g. "=A1>100")'),
  bgColor: z.string().optional().describe("Hex background color when condition is met"),
  fontColor: z.string().optional().describe("Hex font color when condition is met"),
  bold: z.boolean().optional().describe("Bold when condition is met"),
  ruleIndex: z
    .number()
    .int()
    .optional()
    .describe("Index of rule to delete (for delete operation)"),
});

export const validateSchema = z.object({
  spreadsheetId,
  sheetId,
  operation: z.enum(["set", "clear"]).describe("Set or clear validation"),
  rangeNotation,
  validationType: z
    .enum([
      "ONE_OF_LIST",
      "NUMBER_GREATER",
      "NUMBER_LESS",
      "NUMBER_EQ",
      "NUMBER_BETWEEN",
      "DATE_BEFORE",
      "DATE_AFTER",
      "TEXT_CONTAINS",
      "CUSTOM_FORMULA",
    ])
    .optional()
    .describe("Validation type"),
  values: z
    .string()
    .optional()
    .describe("Pipe-separated values (dropdown items, or number/date constraints)"),
  customFormula: z
    .string()
    .optional()
    .describe('Custom formula for validation (e.g. "=A1>0")'),
  strict: z
    .boolean()
    .optional()
    .describe("If true, reject invalid input; if false, show warning"),
});

// ── Charts & Named Ranges (2) ──

export const manageChartsSchema = z.object({
  spreadsheetId,
  operation: z
    .enum(["create", "update", "delete"])
    .describe("Chart operation"),
  sheetId: sheetId.optional(),
  chartId: z.number().int().optional().describe("Chart ID (for update/delete)"),
  chartType: z
    .enum([
      "BAR",
      "LINE",
      "PIE",
      "COLUMN",
      "SCATTER",
      "AREA",
      "COMBO",
      "STEPPED_AREA",
    ])
    .optional()
    .describe("Chart type"),
  title: z.string().optional().describe("Chart title"),
  dataRange: z
    .string()
    .optional()
    .describe('A1 notation for chart data (e.g. "Sheet1!A1:C10")'),
  positionRow: z
    .number()
    .int()
    .optional()
    .describe("Anchor row for chart placement"),
  positionCol: z
    .number()
    .int()
    .optional()
    .describe("Anchor column for chart placement"),
});

export const manageNamedRangesSchema = z.object({
  spreadsheetId,
  operation: z.enum(["create", "delete"]).describe("Named range operation"),
  name: z.string().optional().describe("Named range name (for create)"),
  sheetId: sheetId.optional(),
  rangeNotation: rangeNotation.optional(),
  namedRangeId: z
    .string()
    .optional()
    .describe("Named range ID (for delete)"),
});
