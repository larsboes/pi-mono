#!/usr/bin/env node
/**
 * Notion CLI - Read pages, query databases, export to Markdown
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync, createWriteStream } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { NotionClient, NotionAPIErrorException } from "../lib/notion-client.js";
import {
  blocksToMarkdown,
  extractTitle,
  formatDatabaseAsTable,
} from "../lib/notion-md.js";
import type { Block as BaseBlock, Page, Database } from "../references/notion-types.js";

// Extended Block type with children for recursive fetching
type Block = BaseBlock & { children?: Block[] };

/**
 * Load token from environment or shell config files
 */
function loadToken(): string | null {
  const envToken = process.env.NOTION_API_TOKEN;
  if (envToken) return envToken;

  const configFiles = [
    ".zshrc",
    ".bashrc",
    ".bash_profile",
    ".profile",
    ".zprofile",
  ];

  const home = homedir();

  for (const file of configFiles) {
    const filepath = join(home, file);
    if (!existsSync(filepath)) continue;

    try {
      const content = readFileSync(filepath, "utf-8");
      const match = content.match(
        /export\s+NOTION_API_TOKEN\s*=\s*["']?([^"'\n]+)["']?/
      );
      if (match) {
        console.error(`(Loaded token from ~/${file})`);
        return match[1];
      }
    } catch {
      continue;
    }
  }

  return null;
}

const token = loadToken();

if (!token) {
  console.error("Error: NOTION_API_TOKEN not found");
  console.error("\nOptions to set it:");
  console.error("  1. Environment variable: export NOTION_API_TOKEN=secret_xxx");
  console.error("  2. Shell config (~/.zshrc, ~/.bashrc, etc.):");
  console.error("     echo 'export NOTION_API_TOKEN=secret_xxx' >> ~/.zshrc");
  console.error("\nGet your token at: https://www.notion.so/my-integrations");
  process.exit(1);
}

const client = new NotionClient({ token });

const args = process.argv.slice(2);
const command = args[0];

async function main() {
  try {
    switch (command) {
      case "read":
        await readCommand(args.slice(1));
        break;
      case "query":
        await queryCommand(args.slice(1));
        break;
      case "search":
        await searchCommand(args.slice(1));
        break;
      case "create":
        await createCommand(args.slice(1));
        break;
      case "update":
        await updateCommand(args.slice(1));
        break;
      case "schema":
        await schemaCommand(args.slice(1));
        break;
      case "export":
        await exportCommand(args.slice(1));
        break;
      case "help":
      case "--help":
      case "-h":
        showHelp();
        break;
      default:
        if (!command) {
          showHelp();
        } else {
          console.error(`Unknown command: ${command}`);
          console.error("Run 'notion help' for usage");
          process.exit(1);
        }
    }
  } catch (error) {
    if (error instanceof NotionAPIErrorException) {
      console.error(`Error: ${error.getUserMessage()}`);
      if (error.isAuthError()) {
        console.error("\nTo set up a Notion integration:");
        console.error("1. Go to https://www.notion.so/my-integrations");
        console.error("2. Create a new integration");
        console.error("3. Copy the 'Internal Integration Token'");
        console.error("4. Share your page/database with the integration");
      }
    } else {
      console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    }
    process.exit(1);
  }
}

async function readCommand(args: string[]) {
  if (args.length === 0) {
    console.error("Usage: notion read <page-id-or-url> [--children] [--download=<dir>]");
    process.exit(1);
  }

  const input = args[0];
  const includeChildren = args.includes("--children");
  const downloadArg = args.find((a) => a.startsWith("--download="));
  const downloadDir = downloadArg ? downloadArg.split("=")[1] : null;
  const pageId = extractId(input);

  console.error(`Fetching page: ${pageId}...`);

  const page = await client.getPage(pageId);
  const title = extractTitle(page.properties);

  console.log(`# ${title}\n`);

  const blocks = await fetchBlocksRecursively(pageId, includeChildren);
  
  if (downloadDir) {
    await downloadAttachments(blocks, downloadDir);
  }
  
  const markdown = blocksToMarkdown(blocks);
  console.log(markdown);
}

async function queryCommand(args: string[]) {
  if (args.length === 0) {
    console.error("Usage: notion query <database-id-or-url> [--filter property=value] [--limit N]");
    process.exit(1);
  }

  const input = args[0];
  const databaseId = extractId(input);

  const filterArg = args.find((a) => a.startsWith("--filter="))?.split("=")[1];
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const formatArg = args.find((a) => a.startsWith("--format="))?.split("=")[1];

  const limit = limitArg ? parseInt(limitArg, 10) : undefined;
  const format = formatArg || "table";

  let filter: Record<string, unknown> | undefined;
  if (filterArg) {
    const [prop, value] = filterArg.split("=");
    if (prop && value) {
      filter = buildFilter(prop, value);
    }
  }

  console.error(`Querying database: ${databaseId}...`);

  const pages = await client.queryDatabase(databaseId, {
    filter,
    pageSize: limit,
  });

  if (pages.length === 0) {
    console.log("_No results_");
    return;
  }

  console.error(`Found ${pages.length} results\n`);

  switch (format) {
    case "json":
      console.log(JSON.stringify(pages, null, 2));
      break;
    case "markdown":
      for (const page of pages) {
        const title = extractTitle(page.properties);
        console.log(`- [${title}](${page.url})`);
      }
      break;
    case "table":
    default: {
      const propertyNames = Object.keys(pages[0].properties);
      const priorityProps = ["Name", "Title", "Status", "Tags", "Created"];
      const sortedProps = [
        ...priorityProps.filter((p) => propertyNames.includes(p)),
        ...propertyNames.filter((p) => !priorityProps.includes(p)).slice(0, 5),
      ].slice(0, 6);

      console.log(formatDatabaseAsTable(pages, sortedProps));
      break;
    }
  }
}

async function searchCommand(args: string[]) {
  const query = args[0] || "";
  const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
  const filterArg = args.find((a) => a.startsWith("--filter="))?.split("=")[1];

  const limit = limitArg ? parseInt(limitArg, 10) : 10;
  const filter = filterArg === "page" || filterArg === "database"
    ? { value: filterArg as "page" | "database", property: "object" as const }
    : undefined;

  console.error(`Searching for: "${query}"...`);

  const results = await client.search({
    query,
    filter,
    pageSize: limit,
  });

  console.error(`Found ${results.length} results\n`);

  for (const item of results) {
    const icon = item.object === "page" ? "📄" : "🗃️";
    const title = item.object === "page"
      ? extractTitle(item.properties)
      : item.title.map((t) => t.plain_text).join("");
    console.log(`${icon} [${title}](${item.url})`);
  }
}

async function createCommand(args: string[]) {
  const parentArg = args.find((a) => a.startsWith("--parent="))?.split("=")[1];
  const dbArg = args.find((a) => a.startsWith("--database="))?.split("=")[1];
  const titleArg = args.find((a) => a.startsWith("--title="))?.split("=")[1];
  const propsArg = args.find((a) => a.startsWith("--props="))?.split("=")[1];
  
  if (!parentArg && !dbArg) {
    console.error("Usage: notion create --parent=<page-id> --title=\"Title\" [--props=key=value,...]");
    console.error("       notion create --database=<db-id> --props=\"Name=Title,Status=Done\"");
    process.exit(1);
  }

  let parent: { page_id: string } | { database_id: string };
  let properties: Record<string, unknown> = {};

  if (dbArg) {
    parent = { database_id: extractId(dbArg) };
    if (propsArg) {
      properties = parseProperties(propsArg, true);
    }
  } else {
    parent = { page_id: extractId(parentArg!) };
    if (titleArg) {
      properties = {
        title: {
          title: [{ text: { content: titleArg } }],
        },
      };
    }
    if (propsArg) {
      Object.assign(properties, parseProperties(propsArg, false));
    }
  }

  console.error("Creating page...");
  const page = await client.createPage({ parent, properties });
  console.log(`Created: ${page.url}`);
}

async function updateCommand(args: string[]) {
  if (args.length === 0) {
    console.error("Usage: notion update <page-id> --props=\"Status=Done,Priority=High\"");
    process.exit(1);
  }

  const pageId = extractId(args[0]);
  const propsArg = args.find((a) => a.startsWith("--props="))?.split("=")[1];
  
  if (!propsArg) {
    console.error("Error: --props required");
    process.exit(1);
  }

  console.error(`Updating page: ${pageId}...`);
  const properties = parseProperties(propsArg, true);
  const page = await client.updatePage(pageId, properties);
  console.log(`Updated: ${page.url}`);
}

async function schemaCommand(args: string[]) {
  if (args.length === 0) {
    console.error("Usage: notion schema <database-id-or-url>");
    process.exit(1);
  }

  const databaseId = extractId(args[0]);
  console.error(`Fetching schema: ${databaseId}...`);

  const db = await client.getDatabase(databaseId);
  
  console.log(`\n# ${db.title.map(t => t.plain_text).join("")}\n`);
  console.log(`**ID:** ${db.id}`);
  console.log(`**URL:** ${db.url}\n`);
  
  console.log("## Properties\n");
  console.log("| Name | Type | Options |");
  console.log("|------|------|---------|");
  
  for (const [name, prop] of Object.entries(db.properties)) {
    const type = prop.type;
    let options = "";
    
    if (type === "select" && "select" in prop) {
      options = prop.select.options.map(o => o.name).join(", ") || "-";
    } else if (type === "multi_select" && "multi_select" in prop) {
      options = prop.multi_select.options.map(o => o.name).join(", ") || "-";
    } else if (type === "status" && "status" in prop) {
      options = prop.status.options.map(o => o.name).join(", ") || "-";
    } else if (type === "relation" && "relation" in prop) {
      options = `→ ${prop.relation.database_id}`;
    } else if (type === "formula" && "formula" in prop) {
      options = prop.formula.expression;
    } else {
      options = "-";
    }
    
    console.log(`| ${name} | ${type} | ${options} |`);
  }
}

async function exportCommand(args: string[]) {
  if (args.length === 0) {
    console.error("Usage: notion export <database-id-or-url> [--output=file.csv]");
    process.exit(1);
  }

  const databaseId = extractId(args[0]);
  const outputArg = args.find((a) => a.startsWith("--output="))?.split("=")[1];
  const outputFile = outputArg || "export.csv";

  console.error(`Exporting database: ${databaseId}...`);
  
  const db = await client.getDatabase(databaseId);
  const pages = await client.queryDatabase(databaseId, {});
  
  console.error(`Found ${pages.length} rows\n`);

  const propertyNames = Object.keys(db.properties);
  const headers = ["ID", "URL", ...propertyNames];
  
  const rows = pages.map(page => {
    const values = propertyNames.map(prop => {
      const val = page.properties[prop];
      return escapeCsv(extractPropertyValue(val));
    });
    return [page.id, page.url, ...values];
  });
  
  const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
  
  writeFileSync(outputFile, csv, "utf-8");
  console.log(`Exported to: ${outputFile}`);
}

async function fetchBlocksRecursively(
  blockId: string,
  includeChildren: boolean
): Promise<Block[]> {
  const blocks = await client.getBlockChildren(blockId);

  if (!includeChildren) {
    return blocks;
  }

  const blocksWithChildren = await Promise.all(
    blocks.map(async (block) => {
      if (block.has_children) {
        const children = await fetchBlocksRecursively(block.id, true);
        return { ...block, children };
      }
      return block;
    })
  );

  return blocksWithChildren;
}

async function downloadAttachments(blocks: Block[], dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  
  let count = 0;
  for (const block of blocks) {
    let url: string | null = null;
    let filename: string | null = null;
    
    if (block.type === "image" && block.image) {
      url = block.image.external?.url || block.image.file?.url || null;
      filename = `image-${block.id}.png`;
    } else if (block.type === "file" && block.file) {
      url = block.file.external?.url || block.file.file?.url || null;
      const name = block.file.caption?.[0]?.plain_text || block.id;
      filename = `file-${name}`;
    } else if (block.type === "pdf" && block.pdf) {
      url = block.pdf.external?.url || block.pdf.file?.url || null;
      filename = `doc-${block.id}.pdf`;
    }
    
    if (url && filename) {
      try {
        const response = await fetch(url);
        if (response.ok) {
          const buffer = Buffer.from(await response.arrayBuffer());
          const filepath = join(dir, filename.replace(/[^a-zA-Z0-9.-]/g, "_"));
          writeFileSync(filepath, buffer);
          count++;
        }
      } catch (e) {
        console.error(`Failed to download ${filename}: ${e}`);
      }
    }
    
    if (block.children) {
      await downloadAttachments(block.children, dir);
    }
  }
  
  if (count > 0) {
    console.error(`Downloaded ${count} attachment(s) to ${dir}/`);
  }
}

function parseProperties(propsString: string, isDatabase: boolean): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  const pairs = propsString.split(",");
  
  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split("=");
    const value = valueParts.join("="); // In case value contains =
    
    if (!key || value === undefined) continue;
    
    const trimmedKey = key.trim();
    const trimmedValue = value.trim();
    
    if (isDatabase) {
      // Database properties - use title for Name field
      if (trimmedKey.toLowerCase() === "name") {
        props[trimmedKey] = {
          title: [{ text: { content: trimmedValue } }],
        };
      } else if (trimmedValue.toLowerCase() === "true" || trimmedValue.toLowerCase() === "false") {
        props[trimmedKey] = { checkbox: trimmedValue.toLowerCase() === "true" };
      } else {
        props[trimmedKey] = { select: { name: trimmedValue } };
      }
    } else {
      // Page properties - rich_text default
      props[trimmedKey] = {
        rich_text: [{ text: { content: trimmedValue } }],
      };
    }
  }
  
  return props;
}

function extractId(input: string): string {
  const uuidPattern = /^[0-9a-f]{32}$/i;
  const dashedUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  if (uuidPattern.test(input)) {
    return input;
  }
  if (dashedUuidPattern.test(input)) {
    return input;
  }

  const urlPattern = /([0-9a-f]{32})(?:\?|$)/i;
  const match = input.match(urlPattern);
  if (match) {
    return match[1];
  }

  throw new Error(`Invalid ID or URL: ${input}`);
}

function buildFilter(property: string, value: string): Record<string, unknown> {
  return {
    property,
    [detectFilterType(value)]: { equals: value },
  };
}

function detectFilterType(value: string): string {
  const lower = value.toLowerCase();
  if (["true", "false"].includes(lower)) {
    return "checkbox";
  }
  return "select";
}

function extractPropertyValue(prop: unknown): string {
  if (!prop || typeof prop !== "object") return "";

  const p = prop as Record<string, unknown>;

  switch (p.type) {
    case "title":
      return ((p.title as Array<{ plain_text: string }>) || [])
        .map((t) => t.plain_text)
        .join("");
    case "rich_text":
      return ((p.rich_text as Array<{ plain_text: string }>) || [])
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
      return (p.date as { start?: string })?.start || "";
    case "checkbox":
      return p.checkbox ? "Yes" : "No";
    case "url":
      return (p.url as string) || "";
    case "email":
      return (p.email as string) || "";
    case "phone_number":
      return (p.phone_number as string) || "";
    case "formula":
      return String(
        (p.formula as { string?: string; number?: number })?.string ??
          (p.formula as { number?: number })?.number ??
          ""
      );
    case "created_time":
      return (p.created_time as string) || "";
    case "last_edited_time":
      return (p.last_edited_time as string) || "";
    case "people":
      return ((p.people as Array<{ name?: string }>) || [])
        .map((u) => u.name)
        .filter(Boolean)
        .join(", ");
    default:
      return "";
  }
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function showHelp() {
  console.log(`
Notion CLI - Read and query your Notion workspace

USAGE:
  notion <command> [options]

COMMANDS:
  read <page-id-or-url>      Export a page to Markdown
    --children               Recursively fetch nested blocks
    --download=<dir>         Download attachments to directory

  query <database-id-or-url> Query a database
    --filter=property=value  Filter by property (simple equals)
    --limit=N                Limit results (default: all)
    --format=table|json|md   Output format (default: table)

  search [query]             Search pages and databases
    --limit=N                Limit results (default: 10)
    --filter=page|database   Filter by type

  create                     Create a new page
    --parent=<page-id>       Create as child of page
    --database=<db-id>       Create as database entry
    --title="Title"          Page title (for --parent)
    --props="Key=Value,..."  Properties (comma-separated)

  update <page-id>           Update page properties
    --props="Status=Done,Priority=High"

  schema <database-id>       Show database schema/properties

  export <database-id>       Export database to CSV
    --output=file.csv        Output file (default: export.csv)

  help                       Show this help

ENVIRONMENT:
  NOTION_API_TOKEN           Required. Loaded from env or ~/.zshrc, ~/.bashrc, etc.

EXAMPLES:
  notion read abc123def456... --download=./images
  notion query def789abc... --filter="Status=Done" --limit=20
  notion create --database=abc... --props="Name=Task,Status=To Do"
  notion update xyz... --props="Status=Done"
  notion schema abc...       
  notion export abc... --output=tasks.csv
`);
}

main();
