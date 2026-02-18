/**
 * Notion API Type Definitions
 * Based on Notion API v2022-06-28
 */

// ============================================================================
// Core Types
// ============================================================================

export type NotionId = string;

export interface Parent {
  type: "page_id" | "database_id" | "block_id" | "workspace";
  page_id?: NotionId;
  database_id?: NotionId;
  block_id?: NotionId;
  workspace?: boolean;
}

export interface User {
  object: "user";
  id: NotionId;
  type?: "person" | "bot";
  name?: string;
  avatar_url?: string | null;
  person?: { email: string };
  bot?: Record<string, unknown>;
}

// ============================================================================
// Pages
// ============================================================================

export interface Page {
  object: "page";
  id: NotionId;
  created_time: string;
  last_edited_time: string;
  created_by: User;
  last_edited_by: User;
  cover: FileObject | null;
  icon: EmojiObject | FileObject | null;
  parent: Parent;
  archived: boolean;
  in_trash: boolean;
  properties: Record<string, PropertyValue>;
  url: string;
  public_url: string | null;
}

// ============================================================================
// Blocks
// ============================================================================

export type BlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "to_do"
  | "toggle"
  | "code"
  | "quote"
  | "divider"
  | "callout"
  | "image"
  | "video"
  | "pdf"
  | "file"
  | "bookmark"
  | "link_preview"
  | "embed"
  | "equation"
  | "table"
  | "table_row"
  | "column_list"
  | "column"
  | "link_to_page"
  | "synced_block"
  | "template"
  | "child_page"
  | "child_database"
  | "unsupported";

export interface Block {
  object: "block";
  id: NotionId;
  type: BlockType;
  created_time: string;
  last_edited_time: string;
  created_by: User;
  last_edited_by: User;
  archived: boolean;
  in_trash: boolean;
  has_children: boolean;
  parent: Parent;
  // Block-specific content based on type
  paragraph?: ParagraphBlock;
  heading_1?: HeadingBlock;
  heading_2?: HeadingBlock;
  heading_3?: HeadingBlock;
  bulleted_list_item?: ListItemBlock;
  numbered_list_item?: ListItemBlock;
  to_do?: ToDoBlock;
  toggle?: ToggleBlock;
  code?: CodeBlock;
  quote?: QuoteBlock;
  divider?: Record<string, never>;
  callout?: CalloutBlock;
  image?: FileBlock;
  video?: FileBlock;
  pdf?: FileBlock;
  file?: FileBlock;
  bookmark?: BookmarkBlock;
  link_preview?: LinkPreviewBlock;
  embed?: EmbedBlock;
  equation?: EquationBlock;
  table?: TableBlock;
  table_row?: TableRowBlock;
  column_list?: { children: Block[] };
  column?: { children: Block[] };
  link_to_page?: LinkToPageBlock;
  synced_block?: SyncedBlock;
  template?: TemplateBlock;
  child_page?: ChildPageBlock;
  child_database?: ChildDatabaseBlock;
  unsupported?: Record<string, never>;
}

export interface ParagraphBlock {
  rich_text: RichText[];
  color: Color;
  children?: Block[];
}

export interface HeadingBlock {
  rich_text: RichText[];
  color: Color;
  is_toggleable?: boolean;
  children?: Block[];
}

export interface ListItemBlock {
  rich_text: RichText[];
  color: Color;
  children?: Block[];
}

export interface ToDoBlock {
  rich_text: RichText[];
  checked: boolean;
  color: Color;
  children?: Block[];
}

export interface ToggleBlock {
  rich_text: RichText[];
  color: Color;
  children?: Block[];
}

export interface CodeBlock {
  rich_text: RichText[];
  caption: RichText[];
  language: string;
}

export interface QuoteBlock {
  rich_text: RichText[];
  color: Color;
  children?: Block[];
}

export interface CalloutBlock {
  rich_text: RichText[];
  icon: EmojiObject | FileObject;
  color: Color;
  children?: Block[];
}

export interface FileBlock {
  caption: RichText[];
  type: "external" | "file";
  external?: { url: string };
  file?: { url: string; expiry_time: string };
}

export interface BookmarkBlock {
  caption: RichText[];
  url: string;
}

export interface LinkPreviewBlock {
  url: string;
}

export interface EmbedBlock {
  url: string;
}

export interface EquationBlock {
  expression: string;
}

export interface TableBlock {
  table_width: number;
  has_column_header: boolean;
  has_row_header: boolean;
  children: TableRowBlock[];
}

export interface TableRowBlock {
  type: "table_row";
  table_row: { cells: RichText[][] };
}

export interface LinkToPageBlock {
  type: "page_id" | "database_id";
  page_id?: NotionId;
  database_id?: NotionId;
}

export interface SyncedBlock {
  synced_from: { type: "block_id"; block_id: NotionId } | null;
  children?: Block[];
}

export interface TemplateBlock {
  rich_text: RichText[];
  children?: Block[];
}

export interface ChildPageBlock {
  title: string;
}

export interface ChildDatabaseBlock {
  title: string;
}

// ============================================================================
// Rich Text
// ============================================================================

export interface RichText {
  type: "text" | "mention" | "equation";
  text?: TextContent;
  mention?: MentionContent;
  equation?: { expression: string };
  annotations: Annotations;
  plain_text: string;
  href: string | null;
}

export interface TextContent {
  content: string;
  link: { url: string } | null;
}

export interface MentionContent {
  type: "user" | "page" | "database" | "date" | "link_preview";
  user?: User;
  page?: { id: NotionId };
  database?: { id: NotionId };
  date?: DateRange;
  link_preview?: { url: string };
}

export interface Annotations {
  bold: boolean;
  italic: boolean;
  strikethrough: boolean;
  underline: boolean;
  code: boolean;
  color: Color;
}

export type Color =
  | "default"
  | "gray"
  | "brown"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "purple"
  | "pink"
  | "red"
  | "gray_background"
  | "brown_background"
  | "orange_background"
  | "yellow_background"
  | "green_background"
  | "blue_background"
  | "purple_background"
  | "pink_background"
  | "red_background";

// ============================================================================
// File Objects
// ============================================================================

export interface FileObject {
  type: "external" | "file";
  external?: { url: string };
  file?: { url: string; expiry_time: string };
}

export interface EmojiObject {
  type: "emoji";
  emoji: string;
}

// ============================================================================
// Properties
// ============================================================================

export type PropertyValue =
  | TitleProperty
  | RichTextProperty
  | NumberProperty
  | SelectProperty
  | MultiSelectProperty
  | StatusProperty
  | DateProperty
  | FormulaProperty
  | RelationProperty
  | RollupProperty
  | PeopleProperty
  | FilesProperty
  | CheckboxProperty
  | URLProperty
  | EmailProperty
  | PhoneProperty
  | CreatedTimeProperty
  | CreatedByProperty
  | LastEditedTimeProperty
  | LastEditedByProperty;

interface BaseProperty {
  id: string;
  type: string;
}

export interface TitleProperty extends BaseProperty {
  type: "title";
  title: RichText[];
}

export interface RichTextProperty extends BaseProperty {
  type: "rich_text";
  rich_text: RichText[];
}

export interface NumberProperty extends BaseProperty {
  type: "number";
  number: number | null;
}

export interface SelectProperty extends BaseProperty {
  type: "select";
  select: SelectOption | null;
}

export interface MultiSelectProperty extends BaseProperty {
  type: "multi_select";
  multi_select: SelectOption[];
}

export interface StatusProperty extends BaseProperty {
  type: "status";
  status: SelectOption | null;
}

export interface DateProperty extends BaseProperty {
  type: "date";
  date: DateRange | null;
}

export interface DateRange {
  start: string;
  end: string | null;
  time_zone: string | null;
}

export interface FormulaProperty extends BaseProperty {
  type: "formula";
  formula: { type: "string"; string: string } | { type: "number"; number: number } | { type: "boolean"; boolean: boolean } | { type: "date"; date: DateRange };
}

export interface RelationProperty extends BaseProperty {
  type: "relation";
  relation: { id: NotionId }[];
  has_more?: boolean;
}

export interface RollupProperty extends BaseProperty {
  type: "rollup";
  rollup: {
    type: "number" | "date" | "array" | "unsupported";
    number?: number;
    date?: DateRange;
    array?: PropertyValue[];
    function: string;
  };
}

export interface PeopleProperty extends BaseProperty {
  type: "people";
  people: User[];
}

export interface FilesProperty extends BaseProperty {
  type: "files";
  files: FileObject[];
}

export interface CheckboxProperty extends BaseProperty {
  type: "checkbox";
  checkbox: boolean;
}

export interface URLProperty extends BaseProperty {
  type: "url";
  url: string | null;
}

export interface EmailProperty extends BaseProperty {
  type: "email";
  email: string | null;
}

export interface PhoneProperty extends BaseProperty {
  type: "phone_number";
  phone_number: string | null;
}

export interface CreatedTimeProperty extends BaseProperty {
  type: "created_time";
  created_time: string;
}

export interface CreatedByProperty extends BaseProperty {
  type: "created_by";
  created_by: User;
}

export interface LastEditedTimeProperty extends BaseProperty {
  type: "last_edited_time";
  last_edited_time: string;
}

export interface LastEditedByProperty extends BaseProperty {
  type: "last_edited_by";
  last_edited_by: User;
}

export interface SelectOption {
  id: string;
  name: string;
  color: Color;
}

// ============================================================================
// Databases
// ============================================================================

export interface Database {
  object: "database";
  id: NotionId;
  created_time: string;
  last_edited_time: string;
  created_by: User;
  last_edited_by: User;
  title: RichText[];
  description: RichText[];
  icon: EmojiObject | FileObject | null;
  cover: FileObject | null;
  properties: Record<string, DatabaseProperty>;
  parent: Parent;
  url: string;
  public_url: string | null;
  archived: boolean;
  in_trash: boolean;
  is_inline: boolean;
}

export type DatabaseProperty =
  | { type: "title"; title: {} }
  | { type: "rich_text"; rich_text: {} }
  | { type: "number"; number: { format: string } }
  | { type: "select"; select: { options: SelectOption[] } }
  | { type: "multi_select"; multi_select: { options: SelectOption[] } }
  | { type: "status"; status: { options: SelectOption[]; groups: StatusGroup[] } }
  | { type: "date"; date: {} }
  | { type: "formula"; formula: { expression: string } }
  | { type: "relation"; relation: { type: string; database_id: NotionId; single_property?: {}; dual_property?: {} } }
  | { type: "rollup"; rollup: { relation_property_name: string; rollup_property_name: string; function: string } }
  | { type: "people"; people: {} }
  | { type: "files"; files: {} }
  | { type: "checkbox"; checkbox: {} }
  | { type: "url"; url: {} }
  | { type: "email"; email: {} }
  | { type: "phone_number"; phone_number: {} }
  | { type: "created_time"; created_time: {} }
  | { type: "created_by"; created_by: {} }
  | { type: "last_edited_time"; last_edited_time: {} }
  | { type: "last_edited_by"; last_edited_by: {} }
  | { type: "unique_id"; unique_id: { prefix: string | null } }
  | { type: "verification"; verification: {} }
  | { type: "button"; button: {} }
  & { id: string; name: string };

export interface StatusGroup {
  id: string;
  name: string;
  color: Color;
  option_ids: string[];
}

// ============================================================================
// API Responses
// ============================================================================

export interface ListResponse<T> {
  object: "list";
  results: T[];
  next_cursor: string | null;
  has_more: boolean;
  type: "page" | "database" | "block" | "page_or_database";
}

export interface SearchResponse extends ListResponse<Page | Database> {
  type: "page_or_database";
}

export interface BlockChildrenResponse extends ListResponse<Block> {
  type: "block";
}

export interface DatabaseQueryResponse extends ListResponse<Page> {
  type: "page";
}

// ============================================================================
// Errors
// ============================================================================

export interface NotionAPIError {
  object: "error";
  status: number;
  code: string;
  message: string;
}

export type NotionErrorCode =
  | "invalid_json"
  | "invalid_request_url"
  | "invalid_request"
  | "validation_error"
  | "missing_version"
  | "unauthorized"
  | "restricted_resource"
  | "object_not_found"
  | "conflict_error"
  | "rate_limited"
  | "internal_server_error"
  | "service_unavailable";
