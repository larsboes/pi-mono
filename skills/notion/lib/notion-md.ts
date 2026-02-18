/**
 * Notion Block to Markdown Converter
 * Converts Notion block trees to Markdown format
 */

import type { Block, RichText, Color } from "../references/notion-types.js";

const HEADING_PREFIX: Record<string, string> = {
  heading_1: "# ",
  heading_2: "## ",
  heading_3: "### ",
};

const LIST_PREFIX: Record<string, string> = {
  bulleted_list_item: "- ",
  numbered_list_item: "1. ", // Numbering handled separately
};

export interface MarkdownOptions {
  includeCalloutEmoji?: boolean;
  preserveColors?: boolean;
}

/**
 * Convert an array of Notion blocks to Markdown
 */
export function blocksToMarkdown(
  blocks: Block[],
  options: MarkdownOptions = {},
  indent = ""
): string {
  const lines: string[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const line = blockToMarkdown(block, options, indent, blocks, i);
    if (line !== null) {
      lines.push(line);
    }
  }

  return lines.join("\n");
}

/**
 * Convert a single block to Markdown
 */
function blockToMarkdown(
  block: Block,
  options: MarkdownOptions,
  indent: string,
  siblings: Block[],
  index: number
): string | null {
  switch (block.type) {
    case "paragraph":
      return block.paragraph
        ? `${indent}${richTextToMarkdown(block.paragraph.rich_text)}`
        : "";

    case "heading_1":
    case "heading_2":
    case "heading_3":
      return block[block.type]
        ? `${indent}${HEADING_PREFIX[block.type]}${richTextToMarkdown(
            block[block.type]!.rich_text
          )}`
        : "";

    case "bulleted_list_item":
      return block.bulleted_list_item
        ? `${indent}- ${richTextToMarkdown(block.bulleted_list_item.rich_text)}${
            childrenToMarkdown(block, options, indent + "  ")
          }`
        : "";

    case "numbered_list_item": {
      if (!block.numbered_list_item) return "";
      const number = calculateListNumber(siblings, index);
      return `${indent}${number}. ${richTextToMarkdown(
        block.numbered_list_item.rich_text
      )}${childrenToMarkdown(block, options, indent + "  ")}`;
    }

    case "to_do":
      return block.to_do
        ? `${indent}- [${block.to_do.checked ? "x" : " "}] ${richTextToMarkdown(
            block.to_do.rich_text
          )}${childrenToMarkdown(block, options, indent + "  ")}`
        : "";

    case "toggle":
      return block.toggle
        ? `${indent}<details>\n${indent}<summary>${richTextToMarkdown(
            block.toggle.rich_text
          )}</summary>\n\n${childrenToMarkdown(
            block,
            options,
            indent + "  "
          )}\n${indent}</details>`
        : "";

    case "code":
      return block.code
        ? `${indent}\`\`\`${block.code.language || ""}\n${indent}${block.code.rich_text
            .map((t) => t.plain_text)
            .join("")}\n${indent}\`\`\``
        : "";

    case "quote":
      return block.quote
        ? `${indent}> ${richTextToMarkdown(block.quote.rich_text).replace(
            /\n/g,
            `\n${indent}> `
          )}${childrenToMarkdown(block, options, indent + "> ")}`
        : "";

    case "divider":
      return `${indent}---`;

    case "callout":
      if (!block.callout) return "";
      const emoji =
        options.includeCalloutEmoji !== false &&
        block.callout.icon?.type === "emoji"
          ? block.callout.icon.emoji + " "
          : "";
      return `${indent}> ${emoji}${richTextToMarkdown(
        block.callout.rich_text
      ).replace(/\n/g, `\n${indent}> `)}${childrenToMarkdown(
        block,
        options,
        indent + "> "
      )}`;

    case "image":
      return block.image
        ? `${indent}![${getCaption(block.image.caption)}](${
            block.image.external?.url || block.image.file?.url || ""
          })`
        : "";

    case "bookmark":
      return block.bookmark
        ? `${indent}[${block.bookmark.url}](${block.bookmark.url})`
        : "";

    case "link_preview":
      return block.link_preview
        ? `${indent}[${block.link_preview.url}](${block.link_preview.url})`
        : "";

    case "embed":
      return block.embed
        ? `${indent}[Embedded: ${block.embed.url}](${block.embed.url})`
        : "";

    case "equation":
      return block.equation
        ? `${indent}$$${block.equation.expression}$$`
        : "";

    case "table": {
      if (!block.table) return "";
      // Table rows are children, handled separately
      return childrenToMarkdown(block, options, indent).trim();
    }

    case "table_row": {
      if (!block.table_row) return "";
      const cells = block.table_row.table_row.cells;
      const rowContent = cells
        .map((cell) => richTextToMarkdown(cell).replace(/\|/g, "\\|"))
        .join(" | ");
      return `${indent}| ${rowContent} |`;
    }

    case "child_page":
      return block.child_page
        ? `${indent}[📄 ${block.child_page.title}](https://notion.so/${block.id.replace(
            /-/g,
            ""
          )})`
        : "";

    case "child_database":
      return block.child_database
        ? `${indent}[🗃️ ${block.child_database.title}](https://notion.so/${block.id.replace(
            /-/g,
            ""
          )})`
        : "";

    case "link_to_page": {
      const linkedId =
        block.link_to_page?.page_id || block.link_to_page?.database_id || "";
      return `${indent}[🔗 Linked Page](https://notion.so/${linkedId.replace(
        /-/g,
        ""
      )})`;
    }

    case "column_list":
    case "column":
      // Container blocks - just render children
      return childrenToMarkdown(block, options, indent).trim() || null;

    case "synced_block":
      return block.synced_block
        ? childrenToMarkdown(block, options, indent).trim() || null
        : null;

    case "template":
      return block.template
        ? `${indent}<!-- Template: ${richTextToMarkdown(
            block.template.rich_text
          )} -->${childrenToMarkdown(block, options, indent)}`
        : "";

    case "unsupported":
      return `${indent}<!-- Unsupported block type -->`;

    default:
      return `${indent}<!-- Unknown block type: ${block.type} -->`;
  }
}

/**
 * Convert RichText array to Markdown string
 */
function richTextToMarkdown(richText: RichText[]): string {
  return richText
    .map((text) => {
      let content = text.plain_text;

      // Escape markdown special characters
      content = content.replace(/([\\`*_{}[\]()#+\-.!])/g, "\\$1");

      // Apply annotations
      if (text.annotations.code) {
        content = `\`${content}\``;
      }
      if (text.annotations.bold) {
        content = `**${content}**`;
      }
      if (text.annotations.italic) {
        content = `*${content}*`;
      }
      if (text.annotations.strikethrough) {
        content = `~~${content}~~`;
      }
      if (text.annotations.underline) {
        content = `<u>${content}</u>`;
      }

      // Handle links
      if (text.href) {
        content = `[${content}](${text.href})`;
      }

      return content;
    })
    .join("");
}

/**
 * Get caption text from rich text array
 */
function getCaption(caption: RichText[]): string {
  return caption.map((t) => t.plain_text).join("");
}

/**
 * Convert child blocks to Markdown
 */
function childrenToMarkdown(
  block: Block,
  options: MarkdownOptions,
  indent: string
): string {
  if (!block.has_children) return "";

  // For tables, we need special handling
  if (block.type === "table" && block.table) {
    return formatTable(block, options, indent);
  }

  // For other blocks, we can't fetch children here (would need async)
  // In a real implementation, this would be async and fetch children
  return "";
}

/**
 * Format a table block with proper Markdown syntax
 */
function formatTable(
  tableBlock: Block,
  options: MarkdownOptions,
  indent: string
): string {
  // Note: This is a placeholder - actual table rendering requires
  // fetching children. In the CLI, we'd need to fetch recursively.
  return `${indent}<!-- Table: ${tableBlock.table?.table_width} columns -->`;
}

/**
 * Calculate the correct number for a numbered list item
 * by counting preceding numbered items at the same level
 */
function calculateListNumber(blocks: Block[], index: number): number {
  let number = 1;
  for (let i = index - 1; i >= 0; i--) {
    if (blocks[i].type === "numbered_list_item") {
      number++;
    } else if (
      blocks[i].type !== "bulleted_list_item" &&
      blocks[i].type !== "to_do"
    ) {
      // Stop at non-list blocks
      break;
    }
  }
  return number;
}

/**
 * Extract title from page properties
 */
export function extractTitle(properties: Record<string, unknown>): string {
  const titleProp = Object.values(properties).find(
    (p): p is { title: Array<{ plain_text: string }> } =>
      typeof p === "object" &&
      p !== null &&
      "type" in p &&
      p.type === "title"
  );

  if (titleProp?.title) {
    return titleProp.title.map((t) => t.plain_text).join("");
  }

  return "Untitled";
}

/**
 * Format a database query result as a Markdown table
 */
export function formatDatabaseAsTable(
  rows: Array<{
    id: string;
    properties: Record<string, unknown>;
    url: string;
  }>,
  propertyNames: string[]
): string {
  if (rows.length === 0) {
    return "_No results_";
  }

  const headers = propertyNames.length > 0 ? propertyNames : ["Name"];
  const headerLine = `| ${headers.join(" | ")} |`;
  const separatorLine = `| ${headers.map(() => "---").join(" | ")} |`;

  const dataLines = rows.map((row) => {
    const cells = headers.map((header) => {
      const prop = row.properties[header];
      const value = extractPropertyValue(prop);
      return value.replace(/\|/g, "\\|").replace(/\n/g, " ");
    });
    return `| ${cells.join(" | ")} |`;
  });

  return [headerLine, separatorLine, ...dataLines].join("\n");
}

/**
 * Extract a string value from a property value
 */
function extractPropertyValue(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";

  const p = prop as Record<string, unknown>;

  switch (p.type) {
    case "title":
      return ((p.title as RichText[]) || [])
        .map((t) => t.plain_text)
        .join("");
    case "rich_text":
      return ((p.rich_text as RichText[]) || [])
        .map((t) => t.plain_text)
        .join("");
    case "number":
      return p.number !== null ? String(p.number) : "";
    case "select":
      return (p.select as { name?: string })?.name || "";
    case "multi_select":
      return ((p.multi_select as Array<{ name: string }>) || [])
        .map((s) => s.name)
        .join(", ");
    case "status":
      return (p.status as { name?: string })?.name || "";
    case "date":
      return (p.date as { start?: string; end?: string })?.start || "";
    case "checkbox":
      return p.checkbox ? "☑" : "☐";
    case "url":
      return (p.url as string) || "";
    case "email":
      return (p.email as string) || "";
    case "phone_number":
      return (p.phone_number as string) || "";
    case "formula":
      return String((p.formula as { string?: string; number?: number })?.string ??
        (p.formula as { number?: number })?.number ?? "")
    case "created_time":
      return (p.created_time as string) || "";
    case "last_edited_time":
      return (p.last_edited_time as string) || "";
    case "people":
      return ((p.people as Array<{ name?: string }>) || [])
        .map((u) => u.name)
        .filter(Boolean)
        .join(", ");
    case "relation":
      return `${(p.relation as Array<unknown>)?.length || 0} linked`;
    case "rollup":
      return "rollup";
    case "files":
      return `${(p.files as Array<unknown>)?.length || 0} files`;
    default:
      return "";
  }
}
