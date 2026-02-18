/**
 * Notion API HTTP Client with retry logic and rate limit handling
 */

import type {
  NotionId,
  Page,
  Database,
  Block,
  BlockChildrenResponse,
  DatabaseQueryResponse,
  SearchResponse,
  NotionAPIError,
} from "../references/notion-types.js";

const NOTION_API_BASE = "https://api.notion.com/v1";
const NOTION_API_VERSION = "2022-06-28";

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const RATE_LIMIT_STATUS = 429;

export interface ClientConfig {
  token: string;
  baseUrl?: string;
  version?: string;
}

export class NotionClient {
  private token: string;
  private baseUrl: string;
  private version: string;

  constructor(config: ClientConfig) {
    this.token = config.token;
    this.baseUrl = config.baseUrl || NOTION_API_BASE;
    this.version = config.version || NOTION_API_VERSION;
  }

  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retryCount = 0
  ): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      "Notion-Version": this.version,
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle rate limiting with exponential backoff
      if (response.status === RATE_LIMIT_STATUS && retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        console.error(`Rate limited. Retrying in ${delay}ms...`);
        await sleep(delay);
        return this.fetchWithRetry(url, options, retryCount + 1);
      }

      // Handle 5xx errors with retry
      if (response.status >= 500 && retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        console.error(`Server error ${response.status}. Retrying in ${delay}ms...`);
        await sleep(delay);
        return this.fetchWithRetry(url, options, retryCount + 1);
      }

      if (!response.ok) {
        const error: NotionAPIError = await response.json().catch(() => ({
          object: "error",
          status: response.status,
          code: "unknown",
          message: `HTTP ${response.status}: ${response.statusText}`,
        }));
        throw new NotionAPIErrorException(error);
      }

      return response;
    } catch (error) {
      if (error instanceof NotionAPIErrorException) {
        throw error;
      }
      // Network errors - retry if we haven't exhausted retries
      if (retryCount < MAX_RETRIES) {
        const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, retryCount);
        console.error(`Network error. Retrying in ${delay}ms...`);
        await sleep(delay);
        return this.fetchWithRetry(url, options, retryCount + 1);
      }
      throw error;
    }
  }

  // --------------------------------------------------------------------------
  // Pages
  // --------------------------------------------------------------------------

  async getPage(pageId: NotionId): Promise<Page> {
    const url = `${this.baseUrl}/pages/${pageId}`;
    const response = await this.fetchWithRetry(url, { method: "GET" });
    return response.json();
  }

  // --------------------------------------------------------------------------
  // Blocks
  // --------------------------------------------------------------------------

  async getBlockChildren(
    blockId: NotionId,
    pageSize = 100
  ): Promise<Block[]> {
    const blocks: Block[] = [];
    let cursor: string | undefined;

    do {
      const url = new URL(`${this.baseUrl}/blocks/${blockId}/children`);
      url.searchParams.set("page_size", String(Math.min(pageSize, 100)));
      if (cursor) {
        url.searchParams.set("start_cursor", cursor);
      }

      const response = await this.fetchWithRetry(url.toString(), { method: "GET" });
      const data: BlockChildrenResponse = await response.json();

      blocks.push(...data.results);
      cursor = data.next_cursor ?? undefined;
    } while (cursor);

    return blocks;
  }

  // --------------------------------------------------------------------------
  // Databases
  // --------------------------------------------------------------------------

  async getDatabase(databaseId: NotionId): Promise<Database> {
    const url = `${this.baseUrl}/databases/${databaseId}`;
    const response = await this.fetchWithRetry(url, { method: "GET" });
    return response.json();
  }

  async queryDatabase(
    databaseId: NotionId,
    options?: {
      filter?: Record<string, unknown>;
      sorts?: Array<Record<string, unknown>>;
      pageSize?: number;
    }
  ): Promise<Page[]> {
    const pages: Page[] = [];
    let cursor: string | undefined;
    const pageSize = options?.pageSize ?? 100;

    do {
      const url = `${this.baseUrl}/databases/${databaseId}/query`;
      const body: Record<string, unknown> = {
        page_size: Math.min(pageSize - pages.length, 100),
      };

      if (cursor) {
        body.start_cursor = cursor;
      }
      if (options?.filter) {
        body.filter = options.filter;
      }
      if (options?.sorts) {
        body.sorts = options.sorts;
      }

      const response = await this.fetchWithRetry(url, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const data: DatabaseQueryResponse = await response.json();
      pages.push(...data.results);
      cursor = data.next_cursor ?? undefined;

      // Stop if we've collected enough pages
      if (options?.pageSize && pages.length >= options.pageSize) {
        break;
      }
    } while (cursor);

    return pages;
  }

  // --------------------------------------------------------------------------
  // Search
  // --------------------------------------------------------------------------

  async search(options?: {
    query?: string;
    filter?: { value: "page" | "database"; property: "object" };
    pageSize?: number;
  }): Promise<(Page | Database)[]> {
    const results: (Page | Database)[] = [];
    let cursor: string | undefined;
    const pageSize = options?.pageSize ?? 100;

    do {
      const url = `${this.baseUrl}/search`;
      const body: Record<string, unknown> = {
        page_size: Math.min(pageSize - results.length, 100),
      };

      if (cursor) {
        body.start_cursor = cursor;
      }
      if (options?.query) {
        body.query = options.query;
      }
      if (options?.filter) {
        body.filter = options.filter;
      }

      const response = await this.fetchWithRetry(url, {
        method: "POST",
        body: JSON.stringify(body),
      });

      const data: SearchResponse = await response.json();
      results.push(...data.results);
      cursor = data.next_cursor ?? undefined;

      if (options?.pageSize && results.length >= options.pageSize) {
        break;
      }
    } while (cursor);

    return results;
  }

  // --------------------------------------------------------------------------
  // Create / Update
  // --------------------------------------------------------------------------

  async createPage(options: {
    parent: { database_id: NotionId } | { page_id: NotionId };
    properties: Record<string, unknown>;
    children?: Array<Record<string, unknown>>;
  }): Promise<Page> {
    const url = `${this.baseUrl}/pages`;
    const body: Record<string, unknown> = {
      parent: options.parent,
      properties: options.properties,
    };
    if (options.children) {
      body.children = options.children;
    }

    const response = await this.fetchWithRetry(url, {
      method: "POST",
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async updatePage(
    pageId: NotionId,
    properties: Record<string, unknown>,
    options?: { archived?: boolean }
  ): Promise<Page> {
    const url = `${this.baseUrl}/pages/${pageId}`;
    const body: Record<string, unknown> = { properties };
    if (options?.archived !== undefined) {
      body.archived = options.archived;
    }

    const response = await this.fetchWithRetry(url, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    return response.json();
  }

  async createDatabaseItem(
    databaseId: NotionId,
    properties: Record<string, unknown>
  ): Promise<Page> {
    return this.createPage({
      parent: { database_id: databaseId },
      properties,
    });
  }

  // --------------------------------------------------------------------------
  // File Operations
  // --------------------------------------------------------------------------

  async getFileUrl(blockId: NotionId): Promise<string | null> {
    const url = `${this.baseUrl}/blocks/${blockId}`;
    const response = await this.fetchWithRetry(url, { method: "GET" });
    const block: Block = await response.json();

    if (block.type === "image" && block.image) {
      return block.image.external?.url || block.image.file?.url || null;
    }
    if (block.type === "file" && block.file) {
      return block.file.external?.url || block.file.file?.url || null;
    }
    if (block.type === "pdf" && block.pdf) {
      return block.pdf.external?.url || block.pdf.file?.url || null;
    }
    return null;
  }
}

export class NotionAPIErrorException extends Error {
  status: number;
  code: string;

  constructor(error: NotionAPIError) {
    super(error.message);
    this.name = "NotionAPIErrorException";
    this.status = error.status;
    this.code = error.code;
  }

  isAuthError(): boolean {
    return this.status === 401 || this.code === "unauthorized";
  }

  isNotFound(): boolean {
    return this.status === 404 || this.code === "object_not_found";
  }

  isRateLimited(): boolean {
    return this.status === 429 || this.code === "rate_limited";
  }

  getUserMessage(): string {
    switch (this.code) {
      case "unauthorized":
        return "Authentication failed. Check your NOTION_API_TOKEN.";
      case "restricted_resource":
        return "Access denied. Ensure the integration has access to this resource (Share → Add integration).";
      case "object_not_found":
        return "Resource not found. Check the ID and ensure the page/database exists.";
      case "rate_limited":
        return "Rate limit exceeded. Wait a moment and try again.";
      case "validation_error":
        return `Validation error: ${this.message}`;
      default:
        return `Notion API error (${this.code}): ${this.message}`;
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
