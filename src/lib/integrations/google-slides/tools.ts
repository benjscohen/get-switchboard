import { slides_v1 } from "googleapis";
import type { IntegrationToolDef } from "../types";
import type { McpToolResult } from "../types";
import { hexToRgb } from "../shared/color";
import * as s from "./schemas";

type SlidesToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    slides: slides_v1.Slides
  ) => Promise<unknown>;
};

// ── Helpers ──

function pid(a: Record<string, unknown>): string {
  return a.presentationId as string;
}

/** Convert points to EMU (English Metric Units). 1 pt = 12700 EMU */
function emu(pt: number): number {
  return Math.round(pt * 12700);
}

/** Build Size object from points */
function emuSize(
  w: number,
  h: number
): slides_v1.Schema$Size {
  return {
    width: { magnitude: emu(w), unit: "EMU" },
    height: { magnitude: emu(h), unit: "EMU" },
  };
}

/** Convert EMU to points */
function emuToPt(emuVal: number | null | undefined): number {
  if (!emuVal) return 0;
  return Math.round((emuVal / 12700) * 100) / 100;
}

/** Build an OpaqueColor from hex */
function opaqueColor(hex: string): slides_v1.Schema$OpaqueColor {
  return { rgbColor: hexToRgb(hex) };
}

/** Build an OptionalColor from hex */
function solidFill(hex: string): slides_v1.Schema$SolidFill {
  return { color: opaqueColor(hex), alpha: 1 };
}

/** Extract text content from a page element */
function extractElementText(
  el: slides_v1.Schema$PageElement
): string | undefined {
  const textElements = el.shape?.text?.textElements ?? [];
  const parts: string[] = [];
  for (const te of textElements) {
    if (te.textRun?.content) parts.push(te.textRun.content);
  }
  const text = parts.join("").replace(/\n$/, "");
  return text || undefined;
}

/** Determine element type string */
function getElementType(el: slides_v1.Schema$PageElement): string {
  if (el.shape) return "SHAPE";
  if (el.image) return "IMAGE";
  if (el.table) return "TABLE";
  if (el.line) return "LINE";
  if (el.sheetsChart) return "SHEETS_CHART";
  if (el.video) return "VIDEO";
  if (el.wordArt) return "WORD_ART";
  if (el.elementGroup) return "GROUP";
  return "UNKNOWN";
}

export const SLIDES_TOOLS: SlidesToolDef[] = [
  // ── 1. Get Presentation ──
  {
    name: "google_slides_get_presentation",
    description:
      "Get presentation metadata: title, slide IDs, dimensions, master/layout info",
    schema: s.getPresentationSchema,
    execute: async (a, slides) => {
      const res = await slides.presentations.get({
        presentationId: pid(a),
      });
      const p = res.data;
      return {
        presentationId: p.presentationId,
        title: p.title,
        pageSize: p.pageSize
          ? {
              width: emuToPt(
                p.pageSize.width?.magnitude
              ),
              height: emuToPt(
                p.pageSize.height?.magnitude
              ),
            }
          : undefined,
        slides: (p.slides ?? []).map((slide) => ({
          objectId: slide.objectId,
          layoutObjectId:
            slide.slideProperties?.layoutObjectId,
        })),
        masters: (p.masters ?? []).map((m) => ({
          objectId: m.objectId,
        })),
        layouts: (p.layouts ?? []).map((l) => ({
          objectId: l.objectId,
          name: l.layoutProperties?.name,
          displayName: l.layoutProperties?.displayName,
          masterObjectId:
            l.layoutProperties?.masterObjectId,
        })),
      };
    },
  },

  // ── 2. Get Slide Content ──
  {
    name: "google_slides_get_slide_content",
    description:
      "Get detailed content of a specific slide: all elements with positions, sizes, text content, and types. Positions/sizes in points.",
    schema: s.getSlideContentSchema,
    execute: async (a, slides) => {
      const res = await slides.presentations.pages.get({
        presentationId: pid(a),
        pageObjectId: a.pageObjectId as string,
      });
      const page = res.data;
      const elements = (page.pageElements ?? []).map((el) => {
        const transform = el.transform;
        return {
          objectId: el.objectId,
          type: getElementType(el),
          shapeType: el.shape?.shapeType,
          position: {
            x: emuToPt(transform?.translateX),
            y: emuToPt(transform?.translateY),
          },
          size: {
            width: emuToPt(el.size?.width?.magnitude),
            height: emuToPt(el.size?.height?.magnitude),
          },
          rotation: transform?.shearY
            ? Math.round(
                (Math.atan2(
                  transform.shearY,
                  transform.scaleX ?? 1
                ) *
                  180) /
                  Math.PI
              )
            : 0,
          text: extractElementText(el),
          table: el.table
            ? {
                rows: el.table.rows,
                columns: el.table.columns,
              }
            : undefined,
        };
      });

      return {
        slideId: page.objectId,
        elements,
      };
    },
  },

  // ── 3. Get Slide Thumbnail ──
  {
    name: "google_slides_get_slide_thumbnail",
    description:
      "Get a visual PNG thumbnail of a slide. Returns an image that the agent can see to evaluate layout and design.",
    schema: s.getSlideThumbnailSchema,
    execute: async (a, slides) => {
      const thumb =
        await slides.presentations.pages.getThumbnail({
          presentationId: pid(a),
          pageObjectId: a.pageObjectId as string,
          "thumbnailProperties.thumbnailSize":
            (a.size as string) || "MEDIUM",
          "thumbnailProperties.mimeType": "PNG",
        });

      const url = thumb.data.contentUrl!;
      const response = await fetch(url);
      const buffer = Buffer.from(await response.arrayBuffer());

      return {
        _mcpContent: [
          {
            type: "image" as const,
            data: buffer.toString("base64"),
            mimeType: "image/png",
          },
          {
            type: "text" as const,
            text: `Thumbnail of slide ${a.pageObjectId} (${thumb.data.width}x${thumb.data.height})`,
          },
        ],
      } satisfies McpToolResult;
    },
  },

  // ── 4. Create Presentation ──
  {
    name: "google_slides_create_presentation",
    description:
      "Create a new Google Slides presentation with a title. Optionally specify slide dimensions in points.",
    schema: s.createPresentationSchema,
    execute: async (a, slides) => {
      const body: slides_v1.Schema$Presentation = {
        title: a.title as string,
      };
      if (a.width && a.height) {
        body.pageSize = emuSize(
          a.width as number,
          a.height as number
        );
      }
      const res = await slides.presentations.create({
        requestBody: body,
      });
      return {
        presentationId: res.data.presentationId,
        title: res.data.title,
        slides: (res.data.slides ?? []).map((s) => ({
          objectId: s.objectId,
        })),
      };
    },
  },

  // ── 5. Manage Slides ──
  {
    name: "google_slides_manage_slides",
    description:
      "Slide operations: add (with optional layout), duplicate, move, delete, or update speaker notes",
    schema: s.manageSlidesSchema,
    execute: async (a, slides) => {
      const op = a.operation as string;
      const requests: slides_v1.Schema$Request[] = [];

      switch (op) {
        case "add": {
          const req: slides_v1.Schema$Request = {
            createSlide: {
              insertionIndex: a.insertionIndex as
                | number
                | undefined,
              slideLayoutReference: a.layoutId
                ? {
                    layoutId: a.layoutId as string,
                  }
                : undefined,
            },
          };
          requests.push(req);
          break;
        }
        case "duplicate":
          requests.push({
            duplicateObject: {
              objectId: a.pageObjectId as string,
            },
          });
          break;
        case "move":
          requests.push({
            updateSlidesPosition: {
              slideObjectIds: [a.pageObjectId as string],
              insertionIndex: a.insertionIndex as number,
            },
          });
          break;
        case "delete":
          requests.push({
            deleteObject: {
              objectId: a.pageObjectId as string,
            },
          });
          break;
        case "update_notes": {
          // Speaker notes are on the notesPage's shape
          // First get the slide to find the notes page shape
          const pres = await slides.presentations.get({
            presentationId: pid(a),
          });
          const slide = (pres.data.slides ?? []).find(
            (s) => s.objectId === (a.pageObjectId as string)
          );
          const notesShape =
            slide?.slideProperties?.notesPage?.pageElements?.find(
              (el) =>
                el.shape?.shapeType ===
                "TEXT_BOX"
            );
          if (!notesShape?.objectId) {
            return {
              error: "Could not find notes shape on this slide",
            };
          }
          // Clear existing text then insert new
          requests.push(
            {
              deleteText: {
                objectId: notesShape.objectId,
                textRange: { type: "ALL" },
              },
            },
            {
              insertText: {
                objectId: notesShape.objectId,
                text: a.speakerNotes as string,
                insertionIndex: 0,
              },
            }
          );
          break;
        }
        default:
          return { error: `Unknown slide operation: ${op}` };
      }

      const res =
        await slides.presentations.batchUpdate({
          presentationId: pid(a),
          requestBody: { requests },
        });
      return res.data;
    },
  },

  // ── 6. Add Element ──
  {
    name: "google_slides_add_element",
    description:
      "Add elements to a slide: text_box, shape, image, table, or line. All positions/sizes in points.",
    schema: s.addElementSchema,
    execute: async (a, slides) => {
      const elementType = a.elementType as string;
      const x = (a.x as number) ?? 100;
      const y = (a.y as number) ?? 100;
      const w = (a.width as number) ?? 300;
      const h = (a.height as number) ?? 50;
      const objId = a.objectId as string | undefined;
      const requests: slides_v1.Schema$Request[] = [];

      switch (elementType) {
        case "text_box":
          requests.push({
            createShape: {
              objectId: objId,
              shapeType: "TEXT_BOX",
              elementProperties: {
                pageObjectId: a.pageObjectId as string,
                size: emuSize(w, h),
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: emu(x),
                  translateY: emu(y),
                  unit: "EMU",
                },
              },
            },
          });
          if (a.text) {
            const targetId = objId || `__pending__`;
            requests.push({
              insertText: {
                objectId: targetId,
                text: a.text as string,
                insertionIndex: 0,
              },
            });
          }
          break;

        case "shape":
          requests.push({
            createShape: {
              objectId: objId,
              shapeType:
                (a.shapeType as string) || "RECTANGLE",
              elementProperties: {
                pageObjectId: a.pageObjectId as string,
                size: emuSize(w, h),
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: emu(x),
                  translateY: emu(y),
                  unit: "EMU",
                },
              },
            },
          });
          if (a.text) {
            const targetId = objId || `__pending__`;
            requests.push({
              insertText: {
                objectId: targetId,
                text: a.text as string,
                insertionIndex: 0,
              },
            });
          }
          break;

        case "image":
          requests.push({
            createImage: {
              objectId: objId,
              url: a.imageUrl as string,
              elementProperties: {
                pageObjectId: a.pageObjectId as string,
                size: emuSize(w, h),
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: emu(x),
                  translateY: emu(y),
                  unit: "EMU",
                },
              },
            },
          });
          break;

        case "table":
          requests.push({
            createTable: {
              objectId: objId,
              rows: (a.rows as number) ?? 3,
              columns: (a.columns as number) ?? 3,
              elementProperties: {
                pageObjectId: a.pageObjectId as string,
                size: emuSize(w, h),
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: emu(x),
                  translateY: emu(y),
                  unit: "EMU",
                },
              },
            },
          });
          break;

        case "line": {
          const endX = (a.endX as number) ?? x + w;
          const endY = (a.endY as number) ?? y;
          requests.push({
            createLine: {
              objectId: objId,
              lineCategory:
                (a.lineType as string) === "CURVED"
                  ? "CURVED"
                  : (a.lineType as string) === "BENT"
                    ? "BENT"
                    : "STRAIGHT",
              elementProperties: {
                pageObjectId: a.pageObjectId as string,
                size: emuSize(
                  Math.abs(endX - x) || 1,
                  Math.abs(endY - y) || 1
                ),
                transform: {
                  scaleX: 1,
                  scaleY: 1,
                  translateX: emu(Math.min(x, endX)),
                  translateY: emu(Math.min(y, endY)),
                  unit: "EMU",
                },
              },
            },
          });
          break;
        }

        default:
          return {
            error: `Unknown element type: ${elementType}`,
          };
      }

      // If we pushed an insertText with __pending__ objectId, we need
      // to handle it via a two-step batchUpdate. For simplicity, if
      // no custom objectId was provided and text is needed, we'll do
      // the create first, then get the created ID.
      if (
        !objId &&
        a.text &&
        (elementType === "text_box" || elementType === "shape")
      ) {
        // Only send the createShape request first
        const createRes =
          await slides.presentations.batchUpdate({
            presentationId: pid(a),
            requestBody: {
              requests: [requests[0]],
            },
          });
        // Get the objectId from the reply
        const reply = createRes.data.replies?.[0];
        const createdId =
          reply?.createShape?.objectId;
        if (createdId) {
          await slides.presentations.batchUpdate({
            presentationId: pid(a),
            requestBody: {
              requests: [
                {
                  insertText: {
                    objectId: createdId,
                    text: a.text as string,
                    insertionIndex: 0,
                  },
                },
              ],
            },
          });
        }
        return createRes.data;
      }

      const res =
        await slides.presentations.batchUpdate({
          presentationId: pid(a),
          requestBody: { requests },
        });
      return res.data;
    },
  },

  // ── 7. Manage Text ──
  {
    name: "google_slides_manage_text",
    description:
      "Insert, delete, or replace text within an existing element on a slide",
    schema: s.manageTextSchema,
    execute: async (a, slides) => {
      const op = a.operation as string;
      const objId = a.elementObjectId as string;
      const requests: slides_v1.Schema$Request[] = [];

      switch (op) {
        case "insert":
          requests.push({
            insertText: {
              objectId: objId,
              text: a.text as string,
              insertionIndex:
                (a.insertionIndex as number) ?? 0,
            },
          });
          break;

        case "delete":
          requests.push({
            deleteText: {
              objectId: objId,
              textRange: {
                type: "FIXED_RANGE",
                startIndex: a.startIndex as number,
                endIndex: a.endIndex as number,
              },
            },
          });
          break;

        case "replace":
          requests.push(
            {
              deleteText: {
                objectId: objId,
                textRange: {
                  type: "FIXED_RANGE",
                  startIndex: a.startIndex as number,
                  endIndex: a.endIndex as number,
                },
              },
            },
            {
              insertText: {
                objectId: objId,
                text: a.text as string,
                insertionIndex: a.startIndex as number,
              },
            }
          );
          break;

        default:
          return { error: `Unknown text operation: ${op}` };
      }

      const res =
        await slides.presentations.batchUpdate({
          presentationId: pid(a),
          requestBody: { requests },
        });
      return res.data;
    },
  },

  // ── 8. Manage Table ──
  {
    name: "google_slides_manage_table",
    description:
      "Table operations: insert/delete rows and columns, merge/unmerge cells",
    schema: s.manageTableSchema,
    execute: async (a, slides) => {
      const op = a.operation as string;
      const objId = a.elementObjectId as string;
      const requests: slides_v1.Schema$Request[] = [];

      switch (op) {
        case "insert_rows":
          requests.push({
            insertTableRows: {
              tableObjectId: objId,
              cellLocation: {
                rowIndex: (a.rowIndex as number) ?? 0,
                columnIndex: 0,
              },
              insertBelow: (a.insertBelow as boolean) ?? true,
              number: (a.count as number) ?? 1,
            },
          });
          break;

        case "insert_columns":
          requests.push({
            insertTableColumns: {
              tableObjectId: objId,
              cellLocation: {
                rowIndex: 0,
                columnIndex: (a.columnIndex as number) ?? 0,
              },
              insertRight: (a.insertRight as boolean) ?? true,
              number: (a.count as number) ?? 1,
            },
          });
          break;

        case "delete_rows":
          requests.push({
            deleteTableRow: {
              tableObjectId: objId,
              cellLocation: {
                rowIndex: (a.rowIndex as number) ?? 0,
                columnIndex: 0,
              },
            },
          });
          break;

        case "delete_columns":
          requests.push({
            deleteTableColumn: {
              tableObjectId: objId,
              cellLocation: {
                rowIndex: 0,
                columnIndex: (a.columnIndex as number) ?? 0,
              },
            },
          });
          break;

        case "merge_cells":
          requests.push({
            mergeTableCells: {
              objectId: objId,
              tableRange: {
                location: {
                  rowIndex: (a.rowIndex as number) ?? 0,
                  columnIndex:
                    (a.columnIndex as number) ?? 0,
                },
                rowSpan: (a.rowSpan as number) ?? 1,
                columnSpan:
                  (a.columnSpan as number) ?? 1,
              },
            },
          });
          break;

        case "unmerge_cells":
          requests.push({
            unmergeTableCells: {
              objectId: objId,
              tableRange: {
                location: {
                  rowIndex: (a.rowIndex as number) ?? 0,
                  columnIndex:
                    (a.columnIndex as number) ?? 0,
                },
                rowSpan: (a.rowSpan as number) ?? 1,
                columnSpan:
                  (a.columnSpan as number) ?? 1,
              },
            },
          });
          break;

        default:
          return {
            error: `Unknown table operation: ${op}`,
          };
      }

      const res =
        await slides.presentations.batchUpdate({
          presentationId: pid(a),
          requestBody: { requests },
        });
      return res.data;
    },
  },

  // ── 9. Format Text ──
  {
    name: "google_slides_format_text",
    description:
      "Apply character formatting to text within an element: bold, italic, font, size, color, links",
    schema: s.formatTextSchema,
    execute: async (a, slides) => {
      const objId = a.elementObjectId as string;
      const style: slides_v1.Schema$TextStyle = {};
      const fields: string[] = [];

      if (a.bold !== undefined) {
        style.bold = a.bold as boolean;
        fields.push("bold");
      }
      if (a.italic !== undefined) {
        style.italic = a.italic as boolean;
        fields.push("italic");
      }
      if (a.underline !== undefined) {
        style.underline = a.underline as boolean;
        fields.push("underline");
      }
      if (a.strikethrough !== undefined) {
        style.strikethrough = a.strikethrough as boolean;
        fields.push("strikethrough");
      }
      if (a.fontFamily !== undefined) {
        style.fontFamily = a.fontFamily as string;
        fields.push("fontFamily");
      }
      if (a.fontSize !== undefined) {
        style.fontSize = {
          magnitude: a.fontSize as number,
          unit: "PT",
        };
        fields.push("fontSize");
      }
      if (a.foregroundColor) {
        style.foregroundColor = {
          opaqueColor: opaqueColor(
            a.foregroundColor as string
          ),
        };
        fields.push("foregroundColor");
      }
      if (a.backgroundColor) {
        style.backgroundColor = {
          opaqueColor: opaqueColor(
            a.backgroundColor as string
          ),
        };
        fields.push("backgroundColor");
      }
      if (a.linkUrl !== undefined) {
        style.link = { url: a.linkUrl as string };
        fields.push("link");
      }

      if (fields.length === 0) {
        return { message: "No formatting fields provided" };
      }

      const textRange: slides_v1.Schema$Range =
        a.startIndex !== undefined && a.endIndex !== undefined
          ? {
              type: "FIXED_RANGE",
              startIndex: a.startIndex as number,
              endIndex: a.endIndex as number,
            }
          : { type: "ALL" };

      const res =
        await slides.presentations.batchUpdate({
          presentationId: pid(a),
          requestBody: {
            requests: [
              {
                updateTextStyle: {
                  objectId: objId,
                  textRange,
                  style,
                  fields: fields.join(","),
                },
              },
            ],
          },
        });
      return res.data;
    },
  },

  // ── 10. Format Element ──
  {
    name: "google_slides_format_element",
    description:
      "Style a shape/element: fill color, border, shadow, reposition/resize/rotate, or set opacity",
    schema: s.formatElementSchema,
    execute: async (a, slides) => {
      const objId = a.elementObjectId as string;
      const op = a.operation as string;
      const requests: slides_v1.Schema$Request[] = [];

      switch (op) {
        case "fill": {
          const fields: string[] = [];
          const shapeProperties: slides_v1.Schema$ShapeProperties =
            {};
          if (a.fillColor) {
            shapeProperties.shapeBackgroundFill = {
              solidFill: solidFill(a.fillColor as string),
            };
            fields.push("shapeBackgroundFill.solidFill.color");
            fields.push("shapeBackgroundFill.solidFill.alpha");
          }
          requests.push({
            updateShapeProperties: {
              objectId: objId,
              shapeProperties,
              fields: fields.join(","),
            },
          });
          break;
        }

        case "border": {
          const fields: string[] = [];
          const outline: slides_v1.Schema$Outline = {};
          if (a.borderColor) {
            outline.outlineFill = {
              solidFill: solidFill(a.borderColor as string),
            };
            fields.push(
              "outline.outlineFill.solidFill.color"
            );
            fields.push(
              "outline.outlineFill.solidFill.alpha"
            );
          }
          if (a.borderWeight !== undefined) {
            outline.weight = {
              magnitude: a.borderWeight as number,
              unit: "PT",
            };
            fields.push("outline.weight");
          }
          if (a.borderDashStyle) {
            outline.dashStyle =
              a.borderDashStyle as string;
            fields.push("outline.dashStyle");
          }
          requests.push({
            updateShapeProperties: {
              objectId: objId,
              shapeProperties: { outline },
              fields: fields.join(","),
            },
          });
          break;
        }

        case "shadow": {
          const shadow: slides_v1.Schema$Shadow = {
            type: "OUTER",
            alignment: "BOTTOM_LEFT",
            rotateWithShape: false,
          };
          if (a.shadowColor) {
            shadow.color = opaqueColor(
              a.shadowColor as string
            );
          }
          if (a.shadowBlurRadius !== undefined) {
            shadow.blurRadius = {
              magnitude: a.shadowBlurRadius as number,
              unit: "PT",
            };
          }
          if (a.shadowOffsetX !== undefined) {
            shadow.propertyState = "RENDERED";
          }
          requests.push({
            updateShapeProperties: {
              objectId: objId,
              shapeProperties: { shadow },
              fields: "shadow",
            },
          });
          break;
        }

        case "transform": {
          const newX = a.x as number | undefined;
          const newY = a.y as number | undefined;
          const newW = a.width as number | undefined;
          const newH = a.height as number | undefined;
          const rot = a.rotation as number | undefined;

          if (
            newX === undefined &&
            newY === undefined &&
            newW === undefined &&
            newH === undefined &&
            rot === undefined
          ) {
            return {
              message: "No transform properties provided",
            };
          }

          // Fetch current element state to preserve values not being changed
          const pres = await slides.presentations.get({
            presentationId: pid(a),
          });
          let currentEl: slides_v1.Schema$PageElement | undefined;
          for (const slide of pres.data.slides ?? []) {
            currentEl = (slide.pageElements ?? []).find(
              (el) => el.objectId === objId
            );
            if (currentEl) break;
          }
          // Also check masters and layouts
          if (!currentEl) {
            for (const master of pres.data.masters ?? []) {
              currentEl = (master.pageElements ?? []).find(
                (el) => el.objectId === objId
              );
              if (currentEl) break;
            }
          }
          if (!currentEl) {
            for (const layout of pres.data.layouts ?? []) {
              currentEl = (layout.pageElements ?? []).find(
                (el) => el.objectId === objId
              );
              if (currentEl) break;
            }
          }

          // Current state from the element
          const curTransform = currentEl?.transform;
          const curSizeW = currentEl?.size?.width?.magnitude ?? emu(300);
          const curSizeH = currentEl?.size?.height?.magnitude ?? emu(50);
          const curTranslateX = curTransform?.translateX ?? 0;
          const curTranslateY = curTransform?.translateY ?? 0;

          // Desired values (fall back to current)
          const desiredX = newX !== undefined ? emu(newX) : curTranslateX;
          const desiredY = newY !== undefined ? emu(newY) : curTranslateY;

          // Scale factors: desiredSize / baseSize (base size = element's size property in EMU)
          const scaleX = newW !== undefined ? emu(newW) / (curSizeW || 1) : (curTransform?.scaleX ?? 1);
          const scaleY = newH !== undefined ? emu(newH) / (curSizeH || 1) : (curTransform?.scaleY ?? 1);

          // Build affine transform matrix (rotation combined with scale)
          const rad = rot !== undefined
            ? (rot * Math.PI) / 180
            : curTransform?.shearY != null && curTransform?.scaleX != null
              ? Math.atan2(curTransform.shearY, curTransform.scaleX)
              : 0;
          const cos = Math.cos(rad);
          const sin = Math.sin(rad);

          // For the absolute transform, scaleX/Y encode both scale and rotation:
          // | scaleX*cos  -scaleY*sin  translateX |
          // | scaleX*sin   scaleY*cos  translateY |
          const absScaleX = Math.abs(scaleX);
          const absScaleY = Math.abs(scaleY);

          requests.push({
            updatePageElementTransform: {
              objectId: objId,
              applyMode: "ABSOLUTE",
              transform: {
                scaleX: absScaleX * cos,
                scaleY: absScaleY * cos,
                shearX: -absScaleY * sin,
                shearY: absScaleX * sin,
                translateX: desiredX,
                translateY: desiredY,
                unit: "EMU",
              },
            },
          });
          break;
        }

        case "opacity":
          // Opacity is not directly settable via a single field
          // in the Slides API. It's per shape's shapeBackgroundFill alpha.
          if (a.opacity !== undefined) {
            requests.push({
              updateShapeProperties: {
                objectId: objId,
                shapeProperties: {
                  shapeBackgroundFill: {
                    solidFill: {
                      alpha: a.opacity as number,
                    },
                  },
                },
                fields:
                  "shapeBackgroundFill.solidFill.alpha",
              },
            });
          }
          break;

        default:
          return {
            error: `Unknown format operation: ${op}`,
          };
      }

      if (requests.length === 0) {
        return {
          message: "No format changes to apply",
        };
      }

      const res =
        await slides.presentations.batchUpdate({
          presentationId: pid(a),
          requestBody: { requests },
        });
      return res.data;
    },
  },

  // ── 11. Update Page ──
  {
    name: "google_slides_update_page",
    description:
      "Slide-level properties: background color/image or apply a layout",
    schema: s.updatePageSchema,
    execute: async (a, slides) => {
      const op = a.operation as string;
      const pageId = a.pageObjectId as string;
      const requests: slides_v1.Schema$Request[] = [];

      switch (op) {
        case "background_color":
          requests.push({
            updatePageProperties: {
              objectId: pageId,
              pageProperties: {
                pageBackgroundFill: {
                  solidFill: solidFill(
                    a.backgroundColor as string
                  ),
                },
              },
              fields:
                "pageBackgroundFill.solidFill.color,pageBackgroundFill.solidFill.alpha",
            },
          });
          break;

        case "background_image":
          requests.push({
            updatePageProperties: {
              objectId: pageId,
              pageProperties: {
                pageBackgroundFill: {
                  stretchedPictureFill: {
                    contentUrl:
                      a.backgroundImageUrl as string,
                  },
                },
              },
              fields:
                "pageBackgroundFill.stretchedPictureFill.contentUrl",
            },
          });
          break;

        case "apply_layout":
          requests.push({
            updateSlideProperties: {
              objectId: pageId,
              slideProperties: {
                layoutObjectId: a.layoutId as string,
              },
              fields: "layoutObjectId",
            },
          });
          break;

        default:
          return {
            error: `Unknown page operation: ${op}`,
          };
      }

      const res =
        await slides.presentations.batchUpdate({
          presentationId: pid(a),
          requestBody: { requests },
        });
      return res.data;
    },
  },

  // ── 12. Batch Update ──
  {
    name: "google_slides_batch_update",
    description:
      "Raw batchUpdate escape hatch: send Slides API requests directly (as a JSON string or native array) for advanced operations",
    schema: s.batchUpdateSchema,
    execute: async (a, slides) => {
      const raw = a.requests;
      const requests = (
        typeof raw === "string"
          ? JSON.parse(raw)
          : raw
      ) as slides_v1.Schema$Request[];
      const res =
        await slides.presentations.batchUpdate({
          presentationId: pid(a),
          requestBody: { requests },
        });
      return res.data;
    },
  },

  // ── 13. Delete Element ──
  {
    name: "google_slides_delete_element",
    description:
      "Delete one or more elements from a presentation by object ID",
    schema: s.deleteElementSchema,
    execute: async (a, slides) => {
      const raw = a.objectIds;
      const ids = typeof raw === "string" ? [raw] : raw as string[];
      const requests: slides_v1.Schema$Request[] = ids.map((id) => ({
        deleteObject: { objectId: id },
      }));
      const res =
        await slides.presentations.batchUpdate({
          presentationId: pid(a),
          requestBody: { requests },
        });
      return res.data;
    },
  },
];
