import { z } from "zod";

// ── Shared fragments ──

export const presentationId = z
  .string()
  .describe("The Google Slides presentation ID (from the URL)");

export const pageObjectId = z
  .string()
  .describe("The slide/page object ID");

export const elementObjectId = z
  .string()
  .describe("The element object ID (shape, text box, image, etc.)");

export const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Must be a hex color like #FF0000")
  .describe("Color as hex string (e.g. '#FF0000' for red)");

export const sizeInPt = z.object({
  width: z.number().describe("Width in points"),
  height: z.number().describe("Height in points"),
});

export const positionInPt = z.object({
  x: z.number().describe("X position in points from top-left"),
  y: z.number().describe("Y position in points from top-left"),
});

// ── Per-tool schemas (13) ──

// 1. Get presentation
export const getPresentationSchema = z.object({
  presentationId,
});

// 2. Get slide content
export const getSlideContentSchema = z.object({
  presentationId,
  pageObjectId,
});

// 3. Get slide thumbnail
export const getSlideThumbnailSchema = z.object({
  presentationId,
  pageObjectId,
  size: z
    .enum(["SMALL", "MEDIUM", "LARGE"])
    .optional()
    .describe("Thumbnail size (default MEDIUM). SMALL ~200px, MEDIUM ~800px, LARGE ~1600px"),
});

// 4. Create presentation
export const createPresentationSchema = z.object({
  title: z.string().describe("Title for the new presentation"),
  width: z
    .number()
    .optional()
    .describe("Slide width in points (default 720 = 10 inches)"),
  height: z
    .number()
    .optional()
    .describe("Slide height in points (default 405 = 5.625 inches)"),
});

// 5. Manage slides
export const manageSlidesSchema = z.object({
  presentationId,
  operation: z
    .enum(["add", "duplicate", "move", "delete", "update_notes"])
    .describe("Slide operation to perform"),
  pageObjectId: z
    .string()
    .optional()
    .describe("Slide ID to operate on (for duplicate, move, delete, update_notes)"),
  layoutId: z
    .string()
    .optional()
    .describe("Layout ID to apply when adding a slide (omit for blank)"),
  insertionIndex: z
    .number()
    .int()
    .optional()
    .describe("Position to insert/move the slide (0-based)"),
  speakerNotes: z
    .string()
    .optional()
    .describe("Speaker notes text (for update_notes)"),
});

// 6. Add element
export const addElementSchema = z.object({
  presentationId,
  pageObjectId,
  elementType: z
    .enum(["text_box", "shape", "image", "table", "line"])
    .describe("Type of element to add"),
  objectId: z
    .string()
    .optional()
    .describe("Optional custom object ID for the new element"),
  x: z.number().optional().describe("X position in points (default 100)"),
  y: z.number().optional().describe("Y position in points (default 100)"),
  width: z.number().optional().describe("Width in points (default 300)"),
  height: z.number().optional().describe("Height in points (default 50)"),
  text: z
    .string()
    .optional()
    .describe("Initial text content (for text_box and shape)"),
  shapeType: z
    .string()
    .optional()
    .describe("Shape type for shape elements (e.g. RECTANGLE, ELLIPSE, ROUND_RECTANGLE, STAR_5). Default TEXT_BOX"),
  imageUrl: z
    .string()
    .optional()
    .describe("Public URL of image to insert (for image elements)"),
  rows: z
    .number()
    .int()
    .optional()
    .describe("Number of rows (for table elements)"),
  columns: z
    .number()
    .int()
    .optional()
    .describe("Number of columns (for table elements)"),
  lineType: z
    .enum(["STRAIGHT", "CURVED", "BENT"])
    .optional()
    .describe("Line type (for line elements, default STRAIGHT)"),
  endX: z.number().optional().describe("End X position in points (for line elements)"),
  endY: z.number().optional().describe("End Y position in points (for line elements)"),
});

// 7. Manage text
export const manageTextSchema = z.object({
  presentationId,
  elementObjectId,
  operation: z
    .enum(["insert", "delete", "replace"])
    .describe("Text operation"),
  text: z
    .string()
    .optional()
    .describe("Text to insert or replacement text"),
  insertionIndex: z
    .number()
    .int()
    .optional()
    .describe("Character index for insertion (0-based)"),
  startIndex: z
    .number()
    .int()
    .optional()
    .describe("Start index for delete/replace range (inclusive)"),
  endIndex: z
    .number()
    .int()
    .optional()
    .describe("End index for delete/replace range (exclusive)"),
});

// 8. Manage table
export const manageTableSchema = z.object({
  presentationId,
  elementObjectId: z
    .string()
    .describe("The table element's object ID"),
  operation: z
    .enum([
      "insert_rows",
      "insert_columns",
      "delete_rows",
      "delete_columns",
      "merge_cells",
      "unmerge_cells",
    ])
    .describe("Table operation"),
  rowIndex: z.number().int().optional().describe("Row index (0-based)"),
  columnIndex: z.number().int().optional().describe("Column index (0-based)"),
  count: z
    .number()
    .int()
    .optional()
    .describe("Number of rows/columns to insert or delete"),
  insertBelow: z
    .boolean()
    .optional()
    .describe("Insert rows below (true) or above (false)"),
  insertRight: z
    .boolean()
    .optional()
    .describe("Insert columns right (true) or left (false)"),
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
});

// 9. Format text
export const formatTextSchema = z.object({
  presentationId,
  elementObjectId,
  startIndex: z
    .number()
    .int()
    .optional()
    .describe("Start index (inclusive, omit for entire element)"),
  endIndex: z
    .number()
    .int()
    .optional()
    .describe("End index (exclusive, omit for entire element)"),
  bold: z.boolean().optional().describe("Bold text"),
  italic: z.boolean().optional().describe("Italic text"),
  underline: z.boolean().optional().describe("Underline text"),
  strikethrough: z.boolean().optional().describe("Strikethrough text"),
  fontFamily: z
    .string()
    .optional()
    .describe('Font name (e.g. "Arial", "Roboto")'),
  fontSize: z.number().optional().describe("Font size in points"),
  foregroundColor: hexColor
    .optional()
    .describe("Text color as hex"),
  backgroundColor: hexColor
    .optional()
    .describe("Text highlight color as hex"),
  linkUrl: z.string().optional().describe("URL to link the text to"),
});

// 10. Format element
export const formatElementSchema = z.object({
  presentationId,
  elementObjectId,
  operation: z
    .enum(["fill", "border", "shadow", "transform", "opacity"])
    .describe("Element formatting operation"),
  // fill
  fillColor: hexColor.optional().describe("Solid fill color"),
  // border
  borderColor: hexColor.optional().describe("Border/outline color"),
  borderWeight: z.number().optional().describe("Border weight in points"),
  borderDashStyle: z
    .enum(["SOLID", "DOT", "DASH", "DASH_DOT", "LONG_DASH", "LONG_DASH_DOT"])
    .optional()
    .describe("Border dash style"),
  // shadow
  shadowType: z
    .enum(["OUTER"])
    .optional()
    .describe("Shadow type"),
  shadowColor: hexColor.optional().describe("Shadow color"),
  shadowBlurRadius: z.number().optional().describe("Shadow blur radius in points"),
  shadowOffsetX: z.number().optional().describe("Shadow X offset in points"),
  shadowOffsetY: z.number().optional().describe("Shadow Y offset in points"),
  // transform
  x: z.number().optional().describe("New X position in points"),
  y: z.number().optional().describe("New Y position in points"),
  width: z.number().optional().describe("New width in points"),
  height: z.number().optional().describe("New height in points"),
  rotation: z.number().optional().describe("Rotation in degrees"),
  // opacity
  opacity: z
    .number()
    .min(0)
    .max(1)
    .optional()
    .describe("Element opacity (0 = transparent, 1 = opaque)"),
});

// 11. Update page
export const updatePageSchema = z.object({
  presentationId,
  pageObjectId,
  operation: z
    .enum(["background_color", "background_image", "apply_layout"])
    .describe("Page-level operation"),
  backgroundColor: hexColor
    .optional()
    .describe("Slide background color"),
  backgroundImageUrl: z
    .string()
    .optional()
    .describe("Public URL for background image"),
  layoutId: z
    .string()
    .optional()
    .describe("Layout ID to apply to the slide"),
});

// 12. Batch update
export const batchUpdateSchema = z.object({
  presentationId,
  requests: z
    .union([
      z.string(),
      z.array(z.record(z.string(), z.unknown())),
    ])
    .describe(
      "Slides API batchUpdate requests — pass a JSON string or a native array of request objects"
    ),
});

// 13. Delete element
export const deleteElementSchema = z.object({
  presentationId,
  objectIds: z
    .union([z.string(), z.array(z.string())])
    .describe("Element object ID(s) to delete — single string or array of strings"),
});
