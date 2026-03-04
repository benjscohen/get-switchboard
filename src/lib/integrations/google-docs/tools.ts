import { docs_v1 } from "googleapis";
import type { IntegrationToolDef } from "../types";
import * as s from "./schemas";

type DocsToolDef = Omit<IntegrationToolDef, "execute"> & {
  execute: (
    args: Record<string, unknown>,
    docs: docs_v1.Docs
  ) => Promise<unknown>;
};

type DocRequest = docs_v1.Schema$Request;

// ── Helpers ──

function did(a: Record<string, unknown>): string {
  return a.documentId as string;
}

function pt(value: number): docs_v1.Schema$Dimension {
  return { magnitude: value, unit: "PT" };
}

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const h = hex.replace("#", "");
  return {
    red: parseInt(h.substring(0, 2), 16) / 255,
    green: parseInt(h.substring(2, 4), 16) / 255,
    blue: parseInt(h.substring(4, 6), 16) / 255,
  };
}

function optColor(hex: string | undefined) {
  if (!hex) return undefined;
  return { color: { rgbColor: hexToRgb(hex) } };
}

function buildLocation(
  index: number,
  a: Record<string, unknown>
): docs_v1.Schema$Location {
  return {
    index,
    segmentId: (a.segmentId as string) || undefined,
    tabId: (a.tabId as string) || undefined,
  };
}

function buildRange(a: Record<string, unknown>): docs_v1.Schema$Range {
  return {
    startIndex: a.startIndex as number,
    endIndex: a.endIndex as number,
    segmentId: (a.segmentId as string) || undefined,
    tabId: (a.tabId as string) || undefined,
  };
}

function buildTableCellLocation(
  a: Record<string, unknown>
): docs_v1.Schema$TableCellLocation {
  return {
    tableStartLocation: { index: a.tableStartIndex as number },
    rowIndex: (a.rowIndex as number) ?? 0,
    columnIndex: (a.columnIndex as number) ?? 0,
  };
}

function buildTextStyle(a: Record<string, unknown>) {
  const style: Record<string, unknown> = {};
  const fields: string[] = [];

  if (a.bold !== undefined) {
    style.bold = a.bold;
    fields.push("bold");
  }
  if (a.italic !== undefined) {
    style.italic = a.italic;
    fields.push("italic");
  }
  if (a.underline !== undefined) {
    style.underline = a.underline;
    fields.push("underline");
  }
  if (a.strikethrough !== undefined) {
    style.strikethrough = a.strikethrough;
    fields.push("strikethrough");
  }
  if (a.fontFamily !== undefined) {
    style.weightedFontFamily = { fontFamily: a.fontFamily };
    fields.push("weightedFontFamily");
  }
  if (a.fontSize !== undefined) {
    style.fontSize = pt(a.fontSize as number);
    fields.push("fontSize");
  }

  const fg = optColor(a.foregroundColor as string | undefined);
  if (fg) {
    style.foregroundColor = fg;
    fields.push("foregroundColor");
  }
  const bg = optColor(a.backgroundColor as string | undefined);
  if (bg) {
    style.backgroundColor = bg;
    fields.push("backgroundColor");
  }

  if (a.linkUrl !== undefined) {
    style.link = { url: a.linkUrl };
    fields.push("link");
  } else if (a.linkBookmarkId !== undefined) {
    style.link = { bookmarkId: a.linkBookmarkId };
    fields.push("link");
  } else if (a.linkHeadingId !== undefined) {
    style.link = { headingId: a.linkHeadingId };
    fields.push("link");
  }

  if (a.baselineOffset !== undefined) {
    style.baselineOffset = a.baselineOffset;
    fields.push("baselineOffset");
  }
  if (a.smallCaps !== undefined) {
    style.smallCaps = a.smallCaps;
    fields.push("smallCaps");
  }

  return { style, fields: fields.join(",") };
}

function parseBorder(str: string): docs_v1.Schema$ParagraphBorder {
  const [w, hex, dash] = str.split(",");
  const h = (hex || "#000000").replace("#", "");
  return {
    width: pt(parseFloat(w)),
    color: {
      color: {
        rgbColor: {
          red: parseInt(h.substring(0, 2), 16) / 255,
          green: parseInt(h.substring(2, 4), 16) / 255,
          blue: parseInt(h.substring(4, 6), 16) / 255,
        },
      },
    },
    dashStyle: dash || "SOLID",
    padding: pt(1),
  };
}

function buildParagraphStyle(a: Record<string, unknown>) {
  const style: Record<string, unknown> = {};
  const fields: string[] = [];

  if (a.namedStyleType !== undefined) {
    style.namedStyleType = a.namedStyleType;
    fields.push("namedStyleType");
  }
  if (a.alignment !== undefined) {
    style.alignment = a.alignment;
    fields.push("alignment");
  }
  if (a.lineSpacing !== undefined) {
    style.lineSpacing = a.lineSpacing;
    fields.push("lineSpacing");
  }
  if (a.direction !== undefined) {
    style.direction = a.direction;
    fields.push("direction");
  }
  if (a.spacingMode !== undefined) {
    style.spacingMode = a.spacingMode;
    fields.push("spacingMode");
  }
  if (a.spaceAbove !== undefined) {
    style.spaceAbove = pt(a.spaceAbove as number);
    fields.push("spaceAbove");
  }
  if (a.spaceBelow !== undefined) {
    style.spaceBelow = pt(a.spaceBelow as number);
    fields.push("spaceBelow");
  }
  if (a.indentFirstLine !== undefined) {
    style.indentFirstLine = pt(a.indentFirstLine as number);
    fields.push("indentFirstLine");
  }
  if (a.indentStart !== undefined) {
    style.indentStart = pt(a.indentStart as number);
    fields.push("indentStart");
  }
  if (a.indentEnd !== undefined) {
    style.indentEnd = pt(a.indentEnd as number);
    fields.push("indentEnd");
  }
  if (a.keepLinesTogether !== undefined) {
    style.keepLinesTogether = a.keepLinesTogether;
    fields.push("keepLinesTogether");
  }
  if (a.keepWithNext !== undefined) {
    style.keepWithNext = a.keepWithNext;
    fields.push("keepWithNext");
  }
  if (a.avoidWidowAndOrphan !== undefined) {
    style.avoidWidowAndOrphan = a.avoidWidowAndOrphan;
    fields.push("avoidWidowAndOrphan");
  }
  if (a.borderTop) {
    style.borderTop = parseBorder(a.borderTop as string);
    fields.push("borderTop");
  }
  if (a.borderBottom) {
    style.borderBottom = parseBorder(a.borderBottom as string);
    fields.push("borderBottom");
  }
  if (a.borderLeft) {
    style.borderLeft = parseBorder(a.borderLeft as string);
    fields.push("borderLeft");
  }
  if (a.borderRight) {
    style.borderRight = parseBorder(a.borderRight as string);
    fields.push("borderRight");
  }

  const sc = optColor(a.shadingColor as string | undefined);
  if (sc) {
    style.shading = { backgroundColor: sc };
    fields.push("shading");
  }

  return { style, fields: fields.join(",") };
}

/** Extract plain text from a document body */
function extractText(body: docs_v1.Schema$Body): string {
  const parts: string[] = [];
  for (const el of body.content ?? []) {
    if (el.paragraph) {
      for (const pe of el.paragraph.elements ?? []) {
        if (pe.textRun?.content) parts.push(pe.textRun.content);
      }
    } else if (el.table) {
      for (const row of el.table.tableRows ?? []) {
        const cells: string[] = [];
        for (const cell of row.tableCells ?? []) {
          const cellText: string[] = [];
          for (const ce of cell.content ?? []) {
            if (ce.paragraph) {
              for (const pe of ce.paragraph.elements ?? []) {
                if (pe.textRun?.content)
                  cellText.push(pe.textRun.content.replace(/\n$/, ""));
              }
            }
          }
          cells.push(cellText.join(""));
        }
        parts.push(cells.join("\t") + "\n");
      }
    }
  }
  return parts.join("");
}

/** Extract structured elements from a document body */
function extractStructured(body: docs_v1.Schema$Body): unknown[] {
  const elements: unknown[] = [];
  for (const el of body.content ?? []) {
    if (el.paragraph) {
      const style =
        el.paragraph.paragraphStyle?.namedStyleType ?? "NORMAL_TEXT";
      const text = (el.paragraph.elements ?? [])
        .map((e) => e.textRun?.content ?? "")
        .join("")
        .replace(/\n$/, "");
      elements.push({
        type: "paragraph",
        style,
        text,
        startIndex: el.startIndex,
        endIndex: el.endIndex,
        bullet: el.paragraph.bullet
          ? {
              listId: el.paragraph.bullet.listId,
              nestingLevel: el.paragraph.bullet.nestingLevel,
            }
          : undefined,
      });
    } else if (el.table) {
      elements.push({
        type: "table",
        rows: el.table.rows,
        columns: el.table.columns,
        startIndex: el.startIndex,
        endIndex: el.endIndex,
      });
    } else if (el.sectionBreak) {
      elements.push({ type: "sectionBreak", startIndex: el.startIndex });
    } else if (el.tableOfContents) {
      elements.push({
        type: "tableOfContents",
        startIndex: el.startIndex,
        endIndex: el.endIndex,
      });
    }
  }
  return elements;
}

/** Get the body for a specific tab, or the default body */
function getBody(
  doc: docs_v1.Schema$Document,
  tabId?: string
): docs_v1.Schema$Body | null {
  if (tabId && doc.tabs) {
    for (const tab of doc.tabs) {
      if (tab.tabProperties?.tabId === tabId) {
        return tab.documentTab?.body ?? null;
      }
      // Check child tabs
      for (const child of tab.childTabs ?? []) {
        if (child.tabProperties?.tabId === tabId) {
          return child.documentTab?.body ?? null;
        }
      }
    }
    return null;
  }
  return doc.body ?? null;
}

export const DOCS_TOOLS: DocsToolDef[] = [
  // ── 1. Create Document ──
  {
    name: "google_docs_create_document",
    description:
      "Create a new Google Docs document, optionally with initial text content",
    schema: s.createDocumentSchema,
    execute: async (a, docs) => {
      const r = await docs.documents.create({
        requestBody: { title: a.title as string },
      });
      const docId = r.data.documentId!;

      if (a.body_text) {
        await docs.documents.batchUpdate({
          documentId: docId,
          requestBody: {
            requests: [
              {
                insertText: {
                  endOfSegmentLocation: {},
                  text: a.body_text as string,
                },
              },
            ],
          },
        });
      }

      return {
        documentId: docId,
        title: r.data.title,
        revisionId: r.data.revisionId,
      };
    },
  },

  // ── 2. Get Document ──
  {
    name: "google_docs_get_document",
    description:
      "Get the full structured document: metadata, body content with indices, styles, named ranges, tabs, headers, and footers",
    schema: s.getDocumentSchema,
    execute: (a, docs) =>
      docs.documents
        .get({
          documentId: did(a),
          suggestionsViewMode: a.suggestionsViewMode as string | undefined,
          includeTabsContent: a.includeTabsContent as boolean | undefined,
        })
        .then((r) => r.data),
  },

  // ── 3. Read Content ──
  {
    name: "google_docs_read_content",
    description:
      "Read document content as plain text, structured elements (with headings/tables/indices), or raw JSON body",
    schema: s.readContentSchema,
    execute: async (a, docs) => {
      const tabIdVal = a.tabId as string | undefined;
      const doc = await docs.documents
        .get({
          documentId: did(a),
          suggestionsViewMode: a.suggestionsViewMode as string | undefined,
          includeTabsContent: tabIdVal ? true : undefined,
        })
        .then((r) => r.data);

      const body = getBody(doc, tabIdVal);
      if (!body) return { error: "No content found for the specified tab" };

      const format = (a.format as string) || "text";
      if (format === "raw") return body;
      if (format === "structured")
        return { title: doc.title, elements: extractStructured(body) };
      return { title: doc.title, text: extractText(body) };
    },
  },

  // ── 4. Search ──
  {
    name: "google_docs_search",
    description:
      "Search for text in a document and return matches with their document indices (useful for targeted edits)",
    schema: s.searchSchema,
    execute: async (a, docs) => {
      const tabIdVal = a.tabId as string | undefined;
      const doc = await docs.documents
        .get({
          documentId: did(a),
          includeTabsContent: tabIdVal ? true : undefined,
        })
        .then((r) => r.data);

      const body = getBody(doc, tabIdVal);
      if (!body) return { matches: [], count: 0 };

      const searchText = a.searchText as string;
      const matches: Array<{
        startIndex: number;
        endIndex: number;
        context: string;
      }> = [];

      for (const el of body.content ?? []) {
        if (el.paragraph) {
          for (const pe of el.paragraph.elements ?? []) {
            if (!pe.textRun?.content || pe.startIndex == null) continue;
            const text = pe.textRun.content;
            const startIdx = pe.startIndex;
            let pos = 0;
            while (pos < text.length) {
              const idx = text.indexOf(searchText, pos);
              if (idx === -1) break;
              const docIdx = startIdx + idx;
              matches.push({
                startIndex: docIdx,
                endIndex: docIdx + searchText.length,
                context: text
                  .substring(
                    Math.max(0, idx - 30),
                    idx + searchText.length + 30
                  )
                  .trim(),
              });
              pos = idx + 1;
            }
          }
        }
      }
      return { matches, count: matches.length };
    },
  },

  // ── 5. Insert Text ──
  {
    name: "google_docs_insert_text",
    description:
      "Insert text at a specific index, or use position 'start'/'end' for convenience, or append by default",
    schema: s.insertTextSchema,
    execute: (a, docs) => {
      const position = a.position as string | undefined;
      const idx = a.index as number | undefined;
      let request: DocRequest;

      if (position === "start") {
        request = {
          insertText: {
            location: buildLocation(1, a),
            text: a.text as string,
          },
        };
      } else if (position === "end" || (idx === undefined && !position)) {
        request = {
          insertText: {
            endOfSegmentLocation: {
              segmentId: (a.segmentId as string) || undefined,
              tabId: (a.tabId as string) || undefined,
            },
            text: a.text as string,
          },
        };
      } else {
        request = {
          insertText: {
            location: buildLocation(idx!, a),
            text: a.text as string,
          },
        };
      }

      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: { requests: [request] },
        })
        .then((r) => r.data);
    },
  },

  // ── 6. Replace Text ──
  {
    name: "google_docs_replace_text",
    description:
      "Find and replace all occurrences of text in a document",
    schema: s.replaceTextSchema,
    execute: (a, docs) =>
      docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: {
            requests: [
              {
                replaceAllText: {
                  containsText: {
                    text: a.searchText as string,
                    matchCase: (a.matchCase as boolean) ?? true,
                  },
                  replaceText: a.replaceText as string,
                },
              },
            ],
          },
        })
        .then((r) => r.data),
  },

  // ── 7. Delete Content ──
  {
    name: "google_docs_delete_content",
    description: "Delete content within a specified index range",
    schema: s.deleteContentSchema,
    execute: (a, docs) =>
      docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: {
            requests: [{ deleteContentRange: { range: buildRange(a) } }],
          },
        })
        .then((r) => r.data),
  },

  // ── 8. Format Text ──
  {
    name: "google_docs_format_text",
    description:
      "Apply character formatting: bold, italic, underline, strikethrough, font, size, color, highlight, links, superscript/subscript, small caps",
    schema: s.formatTextSchema,
    execute: (a, docs) => {
      const { style, fields } = buildTextStyle(a);
      if (!fields)
        return Promise.resolve({ message: "No formatting fields provided" });
      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: {
            requests: [
              {
                updateTextStyle: {
                  range: buildRange(a),
                  textStyle: style,
                  fields,
                },
              },
            ],
          },
        })
        .then((r) => r.data);
    },
  },

  // ── 9. Format Paragraph ──
  {
    name: "google_docs_format_paragraph",
    description:
      "Apply paragraph formatting: headings, alignment, spacing, indentation, borders, shading, bullets/numbered lists",
    schema: s.formatParagraphSchema,
    execute: (a, docs) => {
      const requests: DocRequest[] = [];

      if (a.bulletAction === "create") {
        requests.push({
          createParagraphBullets: {
            range: buildRange(a),
            bulletPreset:
              (a.bulletPreset as string) || "BULLET_DISC_CIRCLE_SQUARE",
          },
        });
      } else if (a.bulletAction === "delete") {
        requests.push({ deleteParagraphBullets: { range: buildRange(a) } });
      }

      const { style, fields } = buildParagraphStyle(a);
      if (fields) {
        requests.push({
          updateParagraphStyle: {
            range: buildRange(a),
            paragraphStyle: style,
            fields,
          },
        });
      }

      if (requests.length === 0)
        return Promise.resolve({ message: "No formatting fields provided" });

      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: { requests },
        })
        .then((r) => r.data);
    },
  },

  // ── 10. Manage Tables (structural) ──
  {
    name: "google_docs_manage_tables",
    description:
      "Table structural operations: insert table, insert/delete rows and columns, merge/unmerge cells, pin header rows",
    schema: s.manageTablesSchema,
    execute: (a, docs) => {
      const op = a.operation as string;
      const requests: DocRequest[] = [];

      switch (op) {
        case "insert_table":
          requests.push({
            insertTable: {
              rows: a.rows as number,
              columns: a.columns as number,
              location: buildLocation(a.index as number, a),
            },
          });
          break;

        case "insert_row":
          requests.push({
            insertTableRow: {
              tableCellLocation: buildTableCellLocation(a),
              insertBelow: (a.insertBelow as boolean) ?? true,
            },
          });
          break;

        case "insert_column":
          requests.push({
            insertTableColumn: {
              tableCellLocation: buildTableCellLocation(a),
              insertRight: (a.insertRight as boolean) ?? true,
            },
          });
          break;

        case "delete_row":
          requests.push({
            deleteTableRow: {
              tableCellLocation: buildTableCellLocation(a),
            },
          });
          break;

        case "delete_column":
          requests.push({
            deleteTableColumn: {
              tableCellLocation: buildTableCellLocation(a),
            },
          });
          break;

        case "merge_cells":
          requests.push({
            mergeTableCells: {
              tableRange: {
                tableCellLocation: buildTableCellLocation(a),
                rowSpan: (a.rowSpan as number) ?? 1,
                columnSpan: (a.columnSpan as number) ?? 1,
              },
            },
          });
          break;

        case "unmerge_cells":
          requests.push({
            unmergeTableCells: {
              tableRange: {
                tableCellLocation: buildTableCellLocation(a),
                rowSpan: (a.rowSpan as number) ?? 1,
                columnSpan: (a.columnSpan as number) ?? 1,
              },
            },
          });
          break;

        case "pin_headers":
          requests.push({
            pinTableHeaderRows: {
              tableStartLocation: { index: a.tableStartIndex as number },
              pinnedHeaderRowsCount: a.pinnedHeaderRows as number,
            },
          });
          break;

        default:
          return Promise.resolve({ error: `Unknown table operation: ${op}` });
      }

      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: { requests },
        })
        .then((r) => r.data);
    },
  },

  // ── 10b. Format Table (styling) ──
  {
    name: "google_docs_format_table",
    description:
      "Table formatting: set cell background/padding/alignment, row height, or column width",
    schema: s.formatTableSchema,
    execute: (a, docs) => {
      const op = a.operation as string;
      const requests: DocRequest[] = [];

      switch (op) {
        case "column_width":
          requests.push({
            updateTableColumnProperties: {
              tableStartLocation: { index: a.tableStartIndex as number },
              columnIndices: [a.columnIndex as number],
              tableColumnProperties: {
                width: a.width ? pt(a.width as number) : undefined,
                widthType: (a.widthType as string) ?? "FIXED_WIDTH",
              },
              fields: "width,widthType",
            },
          });
          break;

        case "row_style": {
          const rowStyle: Record<string, unknown> = {};
          const rowFields: string[] = [];
          if (a.minRowHeight !== undefined) {
            rowStyle.minRowHeight = pt(a.minRowHeight as number);
            rowFields.push("minRowHeight");
          }
          if (a.preventOverflow !== undefined) {
            rowStyle.preventOverflow = a.preventOverflow;
            rowFields.push("preventOverflow");
          }
          requests.push({
            updateTableRowStyle: {
              tableStartLocation: { index: a.tableStartIndex as number },
              rowIndices: [a.rowIndex as number],
              tableRowStyle: rowStyle,
              fields: rowFields.join(","),
            },
          });
          break;
        }

        case "cell_style": {
          const cellStyle: Record<string, unknown> = {};
          const cellFields: string[] = [];
          const bgc = optColor(a.cellBgColor as string | undefined);
          if (bgc) {
            cellStyle.backgroundColor = bgc;
            cellFields.push("backgroundColor");
          }
          if (a.cellPaddingTop !== undefined) {
            cellStyle.paddingTop = pt(a.cellPaddingTop as number);
            cellFields.push("paddingTop");
          }
          if (a.cellPaddingBottom !== undefined) {
            cellStyle.paddingBottom = pt(a.cellPaddingBottom as number);
            cellFields.push("paddingBottom");
          }
          if (a.cellPaddingLeft !== undefined) {
            cellStyle.paddingLeft = pt(a.cellPaddingLeft as number);
            cellFields.push("paddingLeft");
          }
          if (a.cellPaddingRight !== undefined) {
            cellStyle.paddingRight = pt(a.cellPaddingRight as number);
            cellFields.push("paddingRight");
          }
          if (a.contentAlignment !== undefined) {
            cellStyle.contentAlignment = a.contentAlignment;
            cellFields.push("contentAlignment");
          }
          requests.push({
            updateTableCellStyle: {
              tableRange: {
                tableCellLocation: buildTableCellLocation(a),
                rowSpan: (a.rowSpan as number) ?? 1,
                columnSpan: (a.columnSpan as number) ?? 1,
              },
              tableCellStyle: cellStyle,
              fields: cellFields.join(","),
            },
          });
          break;
        }

        default:
          return Promise.resolve({ error: `Unknown format_table operation: ${op}` });
      }

      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: { requests },
        })
        .then((r) => r.data);
    },
  },

  // ── 11. Manage Sections ──
  {
    name: "google_docs_manage_sections",
    description:
      "Insert page/section breaks or update section style (columns, margins, orientation, page numbering)",
    schema: s.manageSectionsSchema,
    execute: (a, docs) => {
      const op = a.operation as string;
      const requests: DocRequest[] = [];

      switch (op) {
        case "insert_page_break":
          requests.push({
            insertPageBreak: {
              location: buildLocation(a.index as number, a),
            },
          });
          break;

        case "insert_section_break":
          requests.push({
            insertSectionBreak: {
              location: buildLocation(a.index as number, a),
              sectionType: (a.sectionType as string) ?? "NEXT_PAGE",
            },
          });
          break;

        case "update_section_style": {
          const style: Record<string, unknown> = {};
          const fields: string[] = [];

          if (a.columnCount !== undefined) {
            style.columnProperties = Array.from(
              { length: a.columnCount as number },
              () => ({})
            );
            style.columnSeparatorStyle =
              a.columnSeparatorStyle ?? "NONE";
            fields.push("columnProperties", "columnSeparatorStyle");
          }
          if (a.contentDirection !== undefined) {
            style.contentDirection = a.contentDirection;
            fields.push("contentDirection");
          }
          if (a.marginTop !== undefined) {
            style.marginTop = pt(a.marginTop as number);
            fields.push("marginTop");
          }
          if (a.marginBottom !== undefined) {
            style.marginBottom = pt(a.marginBottom as number);
            fields.push("marginBottom");
          }
          if (a.marginLeft !== undefined) {
            style.marginLeft = pt(a.marginLeft as number);
            fields.push("marginLeft");
          }
          if (a.marginRight !== undefined) {
            style.marginRight = pt(a.marginRight as number);
            fields.push("marginRight");
          }
          if (a.marginHeader !== undefined) {
            style.marginHeader = pt(a.marginHeader as number);
            fields.push("marginHeader");
          }
          if (a.marginFooter !== undefined) {
            style.marginFooter = pt(a.marginFooter as number);
            fields.push("marginFooter");
          }
          if (a.pageNumberStart !== undefined) {
            style.pageNumberStart = a.pageNumberStart;
            fields.push("pageNumberStart");
          }
          if (a.useFirstPageHeaderFooter !== undefined) {
            style.useFirstPageHeaderFooter = a.useFirstPageHeaderFooter;
            fields.push("useFirstPageHeaderFooter");
          }
          if (a.useEvenPageHeaderFooter !== undefined) {
            style.useEvenPageHeaderFooter = a.useEvenPageHeaderFooter;
            fields.push("useEvenPageHeaderFooter");
          }
          if (a.flipMarginOnEvenPage !== undefined) {
            style.flipMarginOnEvenPage = a.flipMarginOnEvenPage;
            fields.push("flipMarginOnEvenPage");
          }

          requests.push({
            updateSectionStyle: {
              range: {
                startIndex: a.sectionStartIndex as number,
                endIndex: a.sectionEndIndex as number,
                segmentId: (a.segmentId as string) || undefined,
                tabId: (a.tabId as string) || undefined,
              },
              sectionStyle: style,
              fields: fields.join(","),
            },
          });
          break;
        }

        default:
          return Promise.resolve({
            error: `Unknown section operation: ${op}`,
          });
      }

      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: { requests },
        })
        .then((r) => r.data);
    },
  },

  // ── 12. Manage Headers/Footers ──
  {
    name: "google_docs_manage_headers_footers",
    description:
      "Create or delete headers, footers, and footnotes in a document",
    schema: s.manageHeadersFootersSchema,
    execute: (a, docs) => {
      const op = a.operation as string;
      let request: DocRequest;

      switch (op) {
        case "create_header":
          request = {
            createHeader: {
              type: (a.sectionBreakType as string) ?? "DEFAULT",
              sectionBreakLocation: { index: 0 },
            },
          };
          break;
        case "create_footer":
          request = {
            createFooter: {
              type: (a.sectionBreakType as string) ?? "DEFAULT",
              sectionBreakLocation: { index: 0 },
            },
          };
          break;
        case "delete_header":
          request = { deleteHeader: { headerId: a.headerId as string } };
          break;
        case "delete_footer":
          request = { deleteFooter: { footerId: a.footerId as string } };
          break;
        case "create_footnote":
          request = {
            createFootnote: {
              location: buildLocation(a.index as number, a),
            },
          };
          break;
        default:
          return Promise.resolve({
            error: `Unknown header/footer operation: ${op}`,
          });
      }

      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: { requests: [request] },
        })
        .then((r) => r.data);
    },
  },

  // ── 13. Manage Images ──
  {
    name: "google_docs_manage_images",
    description:
      "Insert inline images, replace existing images, or delete positioned objects",
    schema: s.manageImagesSchema,
    execute: (a, docs) => {
      const op = a.operation as string;
      let request: DocRequest;

      switch (op) {
        case "insert": {
          const size: Record<string, unknown> = {};
          const unit = (a.sizeUnit as string) || "PT";
          if (a.widthMagnitude !== undefined)
            size.width = { magnitude: a.widthMagnitude, unit };
          if (a.heightMagnitude !== undefined)
            size.height = { magnitude: a.heightMagnitude, unit };
          request = {
            insertInlineImage: {
              uri: a.imageUri as string,
              location: buildLocation(a.index as number, a),
              objectSize:
                Object.keys(size).length > 0 ? size : undefined,
            },
          };
          break;
        }
        case "replace":
          request = {
            replaceImage: {
              imageObjectId: a.imageObjectId as string,
              uri: a.imageUri as string,
              imageReplaceMethod:
                (a.replaceMethod as string) || "CENTER_CROP",
            },
          };
          break;
        case "delete_positioned":
          request = {
            deletePositionedObject: {
              objectId: a.objectId as string,
            },
          };
          break;
        default:
          return Promise.resolve({
            error: `Unknown image operation: ${op}`,
          });
      }

      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: { requests: [request] },
        })
        .then((r) => r.data);
    },
  },

  // ── 14. Manage Named Ranges ──
  {
    name: "google_docs_manage_named_ranges",
    description:
      "Create, delete, replace content of, or list named ranges in a document",
    schema: s.manageNamedRangesSchema,
    execute: async (a, docs) => {
      const op = a.operation as string;

      if (op === "list") {
        const doc = await docs.documents
          .get({ documentId: did(a) })
          .then((r) => r.data);
        return {
          namedRanges: doc.namedRanges
            ? Object.entries(doc.namedRanges).map(([name, nr]) => ({
                name,
                namedRanges: nr.namedRanges?.map((r) => ({
                  namedRangeId: r.namedRangeId,
                  name: r.name,
                  ranges: r.ranges,
                })),
              }))
            : [],
        };
      }

      let request: DocRequest;
      switch (op) {
        case "create":
          request = {
            createNamedRange: {
              name: a.name as string,
              range: {
                startIndex: a.startIndex as number,
                endIndex: a.endIndex as number,
                segmentId: (a.segmentId as string) || undefined,
                tabId: (a.tabId as string) || undefined,
              },
            },
          };
          break;
        case "delete":
          if (a.namedRangeId) {
            request = {
              deleteNamedRange: { namedRangeId: a.namedRangeId as string },
            };
          } else {
            request = {
              deleteNamedRange: { name: a.namedRangeName as string },
            };
          }
          break;
        case "replace_content":
          request = {
            replaceNamedRangeContent: {
              namedRangeId: a.namedRangeId as string,
              text: a.replaceText as string,
            },
          };
          break;
        default:
          return { error: `Unknown named range operation: ${op}` };
      }

      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: { requests: [request] },
        })
        .then((r) => r.data);
    },
  },

  // ── 15. Manage Tabs ──
  {
    name: "google_docs_manage_tabs",
    description:
      "Add, delete, or update tab properties in a multi-tab document. Note: tab CRUD requires Docs API support for tab operations.",
    schema: s.manageTabsSchema,
    execute: async (a, docs) => {
      const op = a.operation as string;

      // Tab operations use newer API request types that may not be in all
      // googleapis versions. We construct the request objects manually.
      switch (op) {
        case "add": {
          const req = { addDocumentTab: { tabProperties: { title: a.title as string } } };
          return docs.documents
            .batchUpdate({
              documentId: did(a),
              requestBody: { requests: [req as DocRequest] },
            })
            .then((r) => r.data)
            .catch(() => ({
              message:
                "Tab creation is not yet supported in the current Docs API version. Use the Google Docs UI to add tabs.",
            }));
        }
        case "delete": {
          const req = { deleteTab: { tabId: a.deleteTabId as string } };
          return docs.documents
            .batchUpdate({
              documentId: did(a),
              requestBody: { requests: [req as DocRequest] },
            })
            .then((r) => r.data)
            .catch(() => ({
              message:
                "Tab deletion is not yet supported in the current Docs API version. Use the Google Docs UI to delete tabs.",
            }));
        }
        case "update_properties": {
          const req = {
            updateDocumentTabProperties: {
              tabId: a.updateTabId as string,
              tabProperties: { title: a.newTitle as string },
              fields: "title",
            },
          };
          return docs.documents
            .batchUpdate({
              documentId: did(a),
              requestBody: { requests: [req as DocRequest] },
            })
            .then((r) => r.data)
            .catch(() => ({
              message:
                "Tab property updates are not yet supported in the current Docs API version. Use the Google Docs UI to rename tabs.",
            }));
        }
        default:
          return { error: `Unknown tab operation: ${op}` };
      }
    },
  },

  // ── 16. Update Document Style ──
  {
    name: "google_docs_update_document_style",
    description:
      "Update document-level styling: page size, margins, background color, header/footer configuration, orientation",
    schema: s.updateDocumentStyleSchema,
    execute: (a, docs) => {
      const style: Record<string, unknown> = {};
      const fields: string[] = [];

      if (a.pageWidth !== undefined || a.pageHeight !== undefined) {
        style.pageSize = {
          width: a.pageWidth !== undefined ? pt(a.pageWidth as number) : undefined,
          height:
            a.pageHeight !== undefined ? pt(a.pageHeight as number) : undefined,
        };
        fields.push("pageSize");
      }
      if (a.marginTop !== undefined) {
        style.marginTop = pt(a.marginTop as number);
        fields.push("marginTop");
      }
      if (a.marginBottom !== undefined) {
        style.marginBottom = pt(a.marginBottom as number);
        fields.push("marginBottom");
      }
      if (a.marginLeft !== undefined) {
        style.marginLeft = pt(a.marginLeft as number);
        fields.push("marginLeft");
      }
      if (a.marginRight !== undefined) {
        style.marginRight = pt(a.marginRight as number);
        fields.push("marginRight");
      }
      if (a.marginHeader !== undefined) {
        style.marginHeader = pt(a.marginHeader as number);
        fields.push("marginHeader");
      }
      if (a.marginFooter !== undefined) {
        style.marginFooter = pt(a.marginFooter as number);
        fields.push("marginFooter");
      }

      const bgc = optColor(a.backgroundColor as string | undefined);
      if (bgc) {
        style.background = { color: bgc };
        fields.push("background");
      }

      if (a.useFirstPageHeaderFooter !== undefined) {
        style.useFirstPageHeaderFooter = a.useFirstPageHeaderFooter;
        fields.push("useFirstPageHeaderFooter");
      }
      if (a.useEvenPageHeaderFooter !== undefined) {
        style.useEvenPageHeaderFooter = a.useEvenPageHeaderFooter;
        fields.push("useEvenPageHeaderFooter");
      }
      if (a.useCustomHeaderFooterMargins !== undefined) {
        style.useCustomHeaderFooterMargins = a.useCustomHeaderFooterMargins;
        fields.push("useCustomHeaderFooterMargins");
      }
      if (a.flipPageOrientation !== undefined) {
        style.flipPageOrientation = a.flipPageOrientation;
        fields.push("flipPageOrientation");
      }
      if (a.defaultHeaderId !== undefined) {
        style.defaultHeaderId = a.defaultHeaderId;
        fields.push("defaultHeaderId");
      }
      if (a.defaultFooterId !== undefined) {
        style.defaultFooterId = a.defaultFooterId;
        fields.push("defaultFooterId");
      }
      if (a.firstPageHeaderId !== undefined) {
        style.firstPageHeaderId = a.firstPageHeaderId;
        fields.push("firstPageHeaderId");
      }
      if (a.firstPageFooterId !== undefined) {
        style.firstPageFooterId = a.firstPageFooterId;
        fields.push("firstPageFooterId");
      }
      if (a.evenPageHeaderId !== undefined) {
        style.evenPageHeaderId = a.evenPageHeaderId;
        fields.push("evenPageHeaderId");
      }
      if (a.evenPageFooterId !== undefined) {
        style.evenPageFooterId = a.evenPageFooterId;
        fields.push("evenPageFooterId");
      }

      if (fields.length === 0)
        return Promise.resolve({ message: "No style fields provided" });

      return docs.documents
        .batchUpdate({
          documentId: did(a),
          requestBody: {
            requests: [
              {
                updateDocumentStyle: {
                  documentStyle: style,
                  fields: fields.join(","),
                  tabId: (a.tabId as string) || undefined,
                },
              },
            ],
          },
        })
        .then((r) => r.data);
    },
  },

];
