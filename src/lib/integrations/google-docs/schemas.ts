import { z } from "zod";

// ── Shared fragments ──

export const documentId = z
  .string()
  .describe("The Google Docs document ID (from the URL)");

export const tabId = z
  .string()
  .optional()
  .describe("Target tab ID (omit for first/default tab)");

export const segmentId = z
  .string()
  .optional()
  .describe(
    "Segment ID to target a header, footer, or footnote (omit for document body)"
  );

export const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color like #FF0000")
  .describe("Color as hex string (e.g. '#FF0000' for red)");

export const insertionPoint = {
  index: z
    .number()
    .int()
    .optional()
    .describe(
      "Character index for insertion (1-based). Omit to append at end of segment."
    ),
  segmentId,
  tabId,
};

export const suggestionsViewMode = z
  .enum([
    "DEFAULT_FOR_CURRENT_ACCESS",
    "SUGGESTIONS_INLINE",
    "PREVIEW_SUGGESTIONS_ACCEPTED",
    "PREVIEW_WITHOUT_SUGGESTIONS",
  ])
  .optional()
  .describe("How to render suggestions in the response");

export const textStyleFields = {
  bold: z.boolean().optional().describe("Bold text"),
  italic: z.boolean().optional().describe("Italic text"),
  underline: z.boolean().optional().describe("Underline text"),
  strikethrough: z.boolean().optional().describe("Strikethrough text"),
  fontFamily: z
    .string()
    .optional()
    .describe('Font name (e.g. "Arial", "Times New Roman")'),
  fontSize: z.number().optional().describe("Font size in points"),
  foregroundColor: hexColor
    .optional()
    .describe("Text color as hex (e.g. '#FF0000')"),
  backgroundColor: hexColor
    .optional()
    .describe("Text highlight/background color as hex (e.g. '#FFFF00')"),
  linkUrl: z.string().optional().describe("URL to link the text to"),
  linkBookmarkId: z
    .string()
    .optional()
    .describe("Bookmark ID to link to within the document"),
  linkHeadingId: z
    .string()
    .optional()
    .describe("Heading ID to link to within the document"),
  baselineOffset: z
    .enum(["SUPERSCRIPT", "SUBSCRIPT", "NONE"])
    .optional()
    .describe("Superscript or subscript"),
  smallCaps: z.boolean().optional().describe("Small caps text"),
};

export const paragraphStyleFields = {
  namedStyleType: z
    .enum([
      "NORMAL_TEXT",
      "HEADING_1",
      "HEADING_2",
      "HEADING_3",
      "HEADING_4",
      "HEADING_5",
      "HEADING_6",
      "TITLE",
      "SUBTITLE",
    ])
    .optional()
    .describe("Named style / heading level"),
  alignment: z
    .enum(["START", "CENTER", "END", "JUSTIFIED"])
    .optional()
    .describe("Text alignment"),
  lineSpacing: z
    .number()
    .optional()
    .describe(
      "Line spacing as percentage (e.g. 100 for single, 200 for double)"
    ),
  direction: z
    .enum(["LEFT_TO_RIGHT", "RIGHT_TO_LEFT"])
    .optional()
    .describe("Text direction"),
  spacingMode: z
    .enum(["NEVER_COLLAPSE", "COLLAPSE_LISTS"])
    .optional()
    .describe("Spacing mode"),
  spaceAbove: z
    .number()
    .optional()
    .describe("Space above paragraph in points"),
  spaceBelow: z
    .number()
    .optional()
    .describe("Space below paragraph in points"),
  indentFirstLine: z
    .number()
    .optional()
    .describe("First line indent in points"),
  indentStart: z
    .number()
    .optional()
    .describe("Start/left indent in points"),
  indentEnd: z.number().optional().describe("End/right indent in points"),
  keepLinesTogether: z
    .boolean()
    .optional()
    .describe("Keep all lines of paragraph on same page"),
  keepWithNext: z
    .boolean()
    .optional()
    .describe("Keep paragraph with the next one on same page"),
  avoidWidowAndOrphan: z
    .boolean()
    .optional()
    .describe("Avoid widow and orphan lines"),
  borderTop: z
    .string()
    .optional()
    .describe(
      'Top border as "width,#rrggbb,dashStyle" (e.g. "1,#000000,SOLID")'
    ),
  borderBottom: z
    .string()
    .optional()
    .describe('Bottom border as "width,#rrggbb,dashStyle"'),
  borderLeft: z
    .string()
    .optional()
    .describe('Left border as "width,#rrggbb,dashStyle"'),
  borderRight: z
    .string()
    .optional()
    .describe('Right border as "width,#rrggbb,dashStyle"'),
  shadingColor: hexColor
    .optional()
    .describe("Paragraph background/shading color as hex (e.g. '#E8F5E9')"),
};

// ── Per-tool schemas (17) ──

// 1. Create document
export const createDocumentSchema = z.object({
  title: z.string().describe("Title for the new document"),
  body_text: z
    .string()
    .optional()
    .describe("Optional initial text content for the document"),
});

// 2. Get document
export const getDocumentSchema = z.object({
  documentId,
  suggestionsViewMode,
  includeTabsContent: z
    .boolean()
    .optional()
    .describe("Include content from all tabs"),
});

// 3. Read content
export const readContentSchema = z.object({
  documentId,
  tabId,
  format: z
    .enum(["text", "structured", "raw"])
    .optional()
    .describe(
      "Output format: text (plain text), structured (headings + paragraphs + tables with indices), raw (full JSON body)"
    ),
  suggestionsViewMode,
});

// 4. Search
export const searchSchema = z.object({
  documentId,
  tabId,
  searchText: z
    .string()
    .describe("Text to search for (case-sensitive, as in the document)"),
});

// 5. Insert text
export const insertTextSchema = z.object({
  documentId,
  text: z.string().describe("Text to insert"),
  position: z
    .enum(["start", "end"])
    .optional()
    .describe(
      "Convenience position: 'start' (index 1) or 'end' (append). Overrides index if provided."
    ),
  ...insertionPoint,
});

// 6. Replace text
export const replaceTextSchema = z.object({
  documentId,
  tabId,
  searchText: z.string().describe("Text to find"),
  replaceText: z.string().describe("Replacement text"),
  matchCase: z
    .boolean()
    .optional()
    .describe("Case-sensitive match (default true)"),
});

// 7. Delete content
export const deleteContentSchema = z.object({
  documentId,
  startIndex: z
    .number()
    .int()
    .describe("Start index of range to delete (inclusive)"),
  endIndex: z
    .number()
    .int()
    .describe("End index of range to delete (exclusive)"),
  segmentId,
  tabId,
});

// 8. Format text
export const formatTextSchema = z.object({
  documentId,
  startIndex: z
    .number()
    .int()
    .describe("Start index of text range (inclusive)"),
  endIndex: z
    .number()
    .int()
    .describe("End index of text range (exclusive)"),
  segmentId,
  tabId,
  ...textStyleFields,
});

// 9. Format paragraph
export const formatParagraphSchema = z.object({
  documentId,
  startIndex: z
    .number()
    .int()
    .describe("Start index of paragraph range (inclusive)"),
  endIndex: z
    .number()
    .int()
    .describe("End index of paragraph range (exclusive)"),
  segmentId,
  tabId,
  ...paragraphStyleFields,
  bulletAction: z
    .enum(["create", "delete"])
    .optional()
    .describe("Create or delete paragraph bullets"),
  bulletPreset: z
    .enum([
      "BULLET_DISC_CIRCLE_SQUARE",
      "BULLET_DIAMONDX_ARROW3D_SQUARE",
      "BULLET_CHECKBOX",
      "BULLET_ARROW_DIAMOND_DISC",
      "BULLET_STAR_CIRCLE_SQUARE",
      "BULLET_ARROW3D_CIRCLE_SQUARE",
      "BULLET_LEFTTRIANGLE_DIAMOND_DISC",
      "BULLET_DIAMONDX_HOLLOWDIAMOND_SQUARE",
      "BULLET_DIAMOND_CIRCLE_SQUARE",
      "NUMBERED_DECIMAL_ALPHA_ROMAN",
      "NUMBERED_DECIMAL_ALPHA_ROMAN_PARENS",
      "NUMBERED_DECIMAL_NESTED",
      "NUMBERED_UPPERALPHA_ALPHA_ROMAN",
      "NUMBERED_UPPERROMAN_UPPERALPHA_DECIMAL",
      "NUMBERED_ZERODECIMAL_ALPHA_ROMAN",
    ])
    .optional()
    .describe("Bullet/numbering preset (for create)"),
});

// 10. Manage tables (structural operations only)
export const manageTablesSchema = z.object({
  documentId,
  tabId,
  operation: z
    .enum([
      "insert_table",
      "insert_row",
      "insert_column",
      "delete_row",
      "delete_column",
      "merge_cells",
      "unmerge_cells",
      "pin_headers",
    ])
    .describe("Table structural operation to perform"),
  index: z
    .number()
    .int()
    .optional()
    .describe("Document index for table insertion"),
  segmentId,
  rows: z
    .number()
    .int()
    .optional()
    .describe("Number of rows (for insert_table)"),
  columns: z
    .number()
    .int()
    .optional()
    .describe("Number of columns (for insert_table)"),
  tableStartIndex: z
    .number()
    .int()
    .optional()
    .describe("Start index of the table in the document"),
  rowIndex: z.number().int().optional().describe("Row index (0-based)"),
  columnIndex: z.number().int().optional().describe("Column index (0-based)"),
  insertBelow: z
    .boolean()
    .optional()
    .describe("Insert row below (true) or above (false)"),
  insertRight: z
    .boolean()
    .optional()
    .describe("Insert column right (true) or left (false)"),
  rowSpan: z
    .number()
    .int()
    .optional()
    .describe("Number of rows to span (for merge/unmerge)"),
  columnSpan: z
    .number()
    .int()
    .optional()
    .describe("Number of columns to span (for merge/unmerge)"),
  pinnedHeaderRows: z
    .number()
    .int()
    .optional()
    .describe("Number of rows to pin as headers (0 to unpin)"),
});

// 10b. Format table (styling operations)
export const formatTableSchema = z.object({
  documentId,
  tabId,
  operation: z
    .enum(["cell_style", "row_style", "column_width"])
    .describe("Table formatting operation"),
  tableStartIndex: z
    .number()
    .int()
    .describe("Start index of the table in the document"),
  rowIndex: z.number().int().optional().describe("Row index (0-based)"),
  columnIndex: z.number().int().optional().describe("Column index (0-based)"),
  rowSpan: z
    .number()
    .int()
    .optional()
    .describe("Number of rows to span (for cell_style)"),
  columnSpan: z
    .number()
    .int()
    .optional()
    .describe("Number of columns to span (for cell_style)"),
  width: z.number().optional().describe("Column width in points"),
  widthType: z
    .enum(["EVENLY_DISTRIBUTED", "FIXED_WIDTH"])
    .optional()
    .describe("Column width type"),
  minRowHeight: z
    .number()
    .optional()
    .describe("Minimum row height in points"),
  preventOverflow: z
    .boolean()
    .optional()
    .describe("Prevent row from overflowing across pages"),
  cellBgColor: hexColor.optional().describe("Cell background color as hex (e.g. '#E3F2FD')"),
  cellPaddingTop: z
    .number()
    .optional()
    .describe("Cell top padding in points"),
  cellPaddingBottom: z
    .number()
    .optional()
    .describe("Cell bottom padding in points"),
  cellPaddingLeft: z
    .number()
    .optional()
    .describe("Cell left padding in points"),
  cellPaddingRight: z
    .number()
    .optional()
    .describe("Cell right padding in points"),
  contentAlignment: z
    .enum(["TOP", "MIDDLE", "BOTTOM"])
    .optional()
    .describe("Vertical content alignment in cell"),
});

// 11. Manage sections
export const manageSectionsSchema = z.object({
  documentId,
  operation: z
    .enum([
      "insert_page_break",
      "insert_section_break",
      "update_section_style",
    ])
    .describe("Section operation"),
  ...insertionPoint,
  sectionType: z
    .enum(["CONTINUOUS", "NEXT_PAGE"])
    .optional()
    .describe("Section break type"),
  sectionStartIndex: z
    .number()
    .int()
    .optional()
    .describe("Start index of the section to style"),
  sectionEndIndex: z
    .number()
    .int()
    .optional()
    .describe("End index of the section to style"),
  columnCount: z
    .number()
    .int()
    .optional()
    .describe("Number of text columns (1-3)"),
  columnSeparatorStyle: z
    .enum(["NONE", "BETWEEN_EACH_COLUMN"])
    .optional(),
  contentDirection: z
    .enum(["LEFT_TO_RIGHT", "RIGHT_TO_LEFT"])
    .optional(),
  marginTop: z.number().optional().describe("Top margin in points"),
  marginBottom: z.number().optional().describe("Bottom margin in points"),
  marginLeft: z.number().optional().describe("Left margin in points"),
  marginRight: z.number().optional().describe("Right margin in points"),
  marginHeader: z.number().optional().describe("Header margin in points"),
  marginFooter: z.number().optional().describe("Footer margin in points"),
  pageNumberStart: z
    .number()
    .int()
    .optional()
    .describe("Starting page number"),
  useFirstPageHeaderFooter: z
    .boolean()
    .optional()
    .describe("Use different first page header/footer"),
  useEvenPageHeaderFooter: z
    .boolean()
    .optional()
    .describe("Use different even/odd page headers/footers"),
  flipMarginOnEvenPage: z
    .boolean()
    .optional()
    .describe("Mirror margins on even pages"),
});

// 12. Manage headers/footers
export const manageHeadersFootersSchema = z.object({
  documentId,
  tabId,
  operation: z
    .enum([
      "create_header",
      "create_footer",
      "delete_header",
      "delete_footer",
      "create_footnote",
    ])
    .describe("Header/footer/footnote operation"),
  sectionBreakType: z
    .enum(["DEFAULT", "FIRST_PAGE", "EVEN_PAGE"])
    .optional()
    .describe("Which section header/footer type to create"),
  headerId: z.string().optional().describe("Header ID to delete"),
  footerId: z.string().optional().describe("Footer ID to delete"),
  index: z
    .number()
    .int()
    .optional()
    .describe("Document index for footnote insertion"),
  segmentId,
});

// 13. Manage images
export const manageImagesSchema = z.object({
  documentId,
  tabId,
  operation: z
    .enum(["insert", "replace", "delete_positioned"])
    .describe("Image operation"),
  imageUri: z
    .string()
    .optional()
    .describe("Public URL of the image to insert"),
  index: z
    .number()
    .int()
    .optional()
    .describe("Document index for image insertion"),
  segmentId,
  widthMagnitude: z.number().optional().describe("Image width value"),
  heightMagnitude: z.number().optional().describe("Image height value"),
  sizeUnit: z
    .enum(["PT", "EMU"])
    .optional()
    .describe("Unit for width/height (default PT)"),
  imageObjectId: z
    .string()
    .optional()
    .describe("Inline object ID of the image to replace"),
  replaceMethod: z
    .enum(["CENTER_CROP"])
    .optional()
    .describe("How to fit the replacement image"),
  objectId: z
    .string()
    .optional()
    .describe("Positioned object ID to delete"),
});

// 14. Manage named ranges
export const manageNamedRangesSchema = z.object({
  documentId,
  tabId,
  operation: z
    .enum(["create", "delete", "replace_content", "list"])
    .describe("Named range operation"),
  name: z.string().optional().describe("Name for the range"),
  startIndex: z.number().int().optional().describe("Start index of range"),
  endIndex: z.number().int().optional().describe("End index of range"),
  segmentId,
  namedRangeId: z
    .string()
    .optional()
    .describe("Named range ID to delete or replace content"),
  namedRangeName: z
    .string()
    .optional()
    .describe("Delete all named ranges with this name"),
  replaceText: z
    .string()
    .optional()
    .describe("Text to replace the named range content with"),
});

// 15. Manage tabs
export const manageTabsSchema = z.object({
  documentId,
  operation: z
    .enum(["add", "delete", "update_properties"])
    .describe("Tab operation"),
  title: z.string().optional().describe("Title for the new tab"),
  deleteTabId: z.string().optional().describe("Tab ID to delete"),
  updateTabId: z.string().optional().describe("Tab ID to update"),
  newTitle: z.string().optional().describe("New title for the tab"),
});

// 16. Update document style
export const updateDocumentStyleSchema = z.object({
  documentId,
  tabId,
  pageWidth: z.number().optional().describe("Page width in points"),
  pageHeight: z.number().optional().describe("Page height in points"),
  marginTop: z.number().optional().describe("Top margin in points"),
  marginBottom: z.number().optional().describe("Bottom margin in points"),
  marginLeft: z.number().optional().describe("Left margin in points"),
  marginRight: z.number().optional().describe("Right margin in points"),
  marginHeader: z.number().optional().describe("Header margin in points"),
  marginFooter: z.number().optional().describe("Footer margin in points"),
  backgroundColor: hexColor
    .optional()
    .describe("Page background color as hex (e.g. '#FFFFFF')"),
  useFirstPageHeaderFooter: z
    .boolean()
    .optional()
    .describe("Different first page header/footer"),
  useEvenPageHeaderFooter: z
    .boolean()
    .optional()
    .describe("Different even/odd headers/footers"),
  useCustomHeaderFooterMargins: z
    .boolean()
    .optional()
    .describe("Use custom header/footer margins"),
  flipPageOrientation: z
    .boolean()
    .optional()
    .describe("Flip page between portrait and landscape"),
  defaultHeaderId: z.string().optional().describe("Default header ID"),
  defaultFooterId: z.string().optional().describe("Default footer ID"),
  firstPageHeaderId: z
    .string()
    .optional()
    .describe("First page header ID"),
  firstPageFooterId: z
    .string()
    .optional()
    .describe("First page footer ID"),
  evenPageHeaderId: z.string().optional().describe("Even page header ID"),
  evenPageFooterId: z.string().optional().describe("Even page footer ID"),
});

