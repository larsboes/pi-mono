#!/usr/bin/env node
/**
 * Convert a URL or local file to Markdown using `uvx markitdown`.
 * Optionally summarize via `pi` and store to memory.
 *
 * Usage:
 *   node to-markdown.mjs <url-or-path> [options]
 *
 * Options:
 *   --out <file>          Write to specific file
 *   --tmp                 Write to temp file (returns path)
 *   --summary [prompt]    Summarize with optional custom prompt
 *   --prompt <text>       Custom summary instructions
 *   --memory              Store summary to Cortex memory
 *   --extract <type>      Extract specific entities (apis, dates, people, emails)
 *   --json                Output as JSON (structured extraction)
 *   --batch <file>        Process multiple URLs/paths from file (one per line)
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { basename, join, dirname } from 'path';
import { tmpdir } from 'os';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Model selection - prefers haiku-4-5, falls back to sonnet-4-5
const SUMMARY_MODEL = process.env.PI_SUMMARY_MODEL || 'claude-haiku-4-5';
const SUMMARY_FALLBACK = 'claude-sonnet-4-5';

const argv = process.argv.slice(2);

function usageAndExit(code = 1) {
  console.error(`Usage: node to-markdown.mjs <url-or-path> [options]

Options:
  --out <file>          Write to specific file
  --tmp                 Write to temp file (returns path)
  --summary [prompt]    Summarize with optional custom prompt
  --prompt <text>       Custom summary instructions
  --memory              Store summary to Cortex memory
  --extract <type>      Extract specific entities (apis, dates, people, emails, links)
  --json                Output as JSON (structured extraction)
  --batch <file>        Process multiple URLs/paths from file (one per line)
  --model <model>       Override summary model (default: ${SUMMARY_MODEL})
`);
  process.exit(code);
}

function isFlag(s) {
  return typeof s === 'string' && s.startsWith('--');
}

function isUrl(s) {
  return /^https?:\/\//i.test(s);
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function safeName(s) {
  return (s || 'document').replace(/[^a-z0-9._-]+/gi, '_');
}

function getInputBasename(s) {
  if (isUrl(s)) {
    const u = new URL(s);
    const b = basename(u.pathname);
    return safeName(b || 'document');
  }
  return safeName(basename(s));
}

function makeTmpMdPath(input) {
  const dir = join(tmpdir(), 'pi-summarize-out');
  ensureDir(dir);
  const base = getInputBasename(input);
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(16).slice(2, 8);
  return join(dir, `${base}-${stamp}-${rand}.md`);
}

function storeToMemory(text, metadata = {}) {
  const memoryScript = join(__dirname, 'scripts', 'store-memory.mjs');
  
  // Check if memory script exists
  if (!existsSync(memoryScript)) {
    console.error('[memory] Warning: store-memory.mjs not found, skipping memory storage');
    return false;
  }

  const result = spawnSync('node', [memoryScript, JSON.stringify(metadata)], {
    input: text,
    encoding: 'utf-8',
    timeout: 30000
  });

  if (result.error || result.status !== 0) {
    console.error('[memory] Failed to store:', result.stderr || result.error?.message);
    return false;
  }
  
  return true;
}

// --- args parsing ---
let input = null;
let outPath = null;
let writeTmp = false;
let doSummary = false;
let summaryPrompt = null;
let useMemory = false;
let extractType = null;
let outputJson = false;
let batchFile = null;
let customModel = null;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];

  if (a === '--out') {
    outPath = argv[i + 1] ?? null;
    if (!outPath || isFlag(outPath)) {
      console.error('Expected a value after --out');
      process.exit(1);
    }
    i++;
    continue;
  }

  if (a === '--tmp') {
    writeTmp = true;
    continue;
  }

  if (a === '--prompt' || a === '--summary-prompt') {
    summaryPrompt = argv[i + 1] ?? null;
    if (!summaryPrompt || isFlag(summaryPrompt)) {
      console.error(`Expected a value after ${a}`);
      process.exit(1);
    }
    i++;
    continue;
  }

  if (a === '--summary') {
    doSummary = true;
    const next = argv[i + 1];
    if (input && next && !isFlag(next) && summaryPrompt == null) {
      summaryPrompt = next;
      i++;
    }
    continue;
  }

  if (a === '--memory') {
    useMemory = true;
    continue;
  }

  if (a === '--extract') {
    extractType = argv[i + 1] ?? 'entities';
    if (!extractType || isFlag(extractType)) {
      console.error('Expected a value after --extract');
      process.exit(1);
    }
    i++;
    continue;
  }

  if (a === '--json') {
    outputJson = true;
    continue;
  }

  if (a === '--batch') {
    batchFile = argv[i + 1] ?? null;
    if (!batchFile || isFlag(batchFile)) {
      console.error('Expected a file path after --batch');
      process.exit(1);
    }
    i++;
    continue;
  }

  if (a === '--model') {
    customModel = argv[i + 1] ?? null;
    if (!customModel || isFlag(customModel)) {
      console.error('Expected a model name after --model');
      process.exit(1);
    }
    i++;
    continue;
  }

  if (isFlag(a)) {
    console.error(`Unknown flag: ${a}`);
    usageAndExit(1);
  }

  if (!input) {
    input = a;
  } else if (doSummary && summaryPrompt == null) {
    summaryPrompt = a;
  } else {
    console.error(`Unexpected argument: ${a}`);
    usageAndExit(1);
  }
}

// Batch mode
if (batchFile) {
  if (!existsSync(batchFile)) {
    console.error(`Batch file not found: ${batchFile}`);
    process.exit(1);
  }
  
  const lines = readFileSync(batchFile, 'utf-8')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'));
  
  const results = [];
  for (const line of lines) {
    console.error(`Processing: ${line}`);
    try {
      const md = runMarkitdown(line);
      const tmpPath = makeTmpMdPath(line);
      writeFileSync(tmpPath, md, 'utf-8');
      results.push({ input: line, output: tmpPath, size: md.length });
    } catch (err) {
      results.push({ input: line, error: err.message });
    }
  }
  
  console.log(JSON.stringify(results, null, 2));
  process.exit(0);
}

if (!input) usageAndExit(1);

function runMarkitdown(arg) {
  const result = spawnSync('uvx', ['markitdown', arg], {
    encoding: 'utf-8',
    maxBuffer: 50 * 1024 * 1024
  });

  if (result.error) {
    throw new Error(`Failed to run uvx markitdown: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`markitdown failed for ${arg}${stderr ? `\n${stderr}` : ''}`);
  }
  return result.stdout;
}

function getExtractPrompt(type) {
  const prompts = {
    apis: 'Extract all API endpoints mentioned. Format: METHOD /path - description. Group by service if applicable.',
    dates: 'Extract all dates and deadlines mentioned. Format: YYYY-MM-DD - event/description. Flag any overdue or upcoming dates.',
    people: 'Extract all people mentioned with their roles/affiliations. Format: Name (Role/Org) - context.',
    emails: 'Extract all email addresses and their contexts. Format: email@example.com - context/purpose.',
    links: 'Extract all URLs/links mentioned. Format: https://... - description/context.',
    entities: 'Extract key entities: people, organizations, products, technologies. Format: Type: Name - context.'
  };
  return prompts[type] || prompts.entities;
}

function summarizeWithPi(markdown, { mdPathForNote = null, extraPrompt = null, extractType = null, outputJson = false } = {}) {
  const MAX_CHARS = 140_000;
  let truncated = false;
  let body = markdown;
  if (body.length > MAX_CHARS) {
    const head = body.slice(0, 110_000);
    const tail = body.slice(-20_000);
    body = `${head}\n\n[...TRUNCATED ${body.length - (head.length + tail.length)} chars...]\n\n${tail}`;
    truncated = true;
  }

  const note = mdPathForNote ? `\n\n(Generated markdown file: ${mdPathForNote})\n` : '';
  const truncNote = truncated ? '\n\nNote: Input was truncated due to size.' : '';

  let contextBlock;
  if (extractType) {
    contextBlock = `\n\nEXTRACTION TASK: ${getExtractPrompt(extractType)}\nOutput as ${outputJson ? 'JSON array' : 'structured list'}.\n`;
  } else if (extraPrompt) {
    contextBlock = `\n\nUser-provided context / instructions (follow these closely):\n${extraPrompt}\n`;
  } else {
    contextBlock = '\n\nNo extra context was provided. Produce a general summary suitable for a technical audience.\n';
  }

  const outputFormat = outputJson 
    ? 'Output as valid JSON with no markdown formatting.'
    : 'Produce:\n- A short 1-paragraph executive summary\n- 8-15 bullet points of key facts / decisions / requirements\n- A section "Open questions / missing info" (bullets)\n\nBe concise. Preserve important numbers, names, and constraints.';

  const prompt = `You are analyzing a document that has been converted to Markdown.${note}
${contextBlock}
${outputFormat}
${truncNote}

--- BEGIN DOCUMENT (Markdown) ---
${body}
--- END DOCUMENT ---`;

  const model = customModel || SUMMARY_MODEL;
  
  // Try primary model, fallback if needed
  const tryModel = (m) => spawnSync('pi', [
    '--provider', 'anthropic',
    '--model', m,
    '--no-tools',
    '--no-session',
    '-p',
    prompt
  ], {
    encoding: 'utf-8',
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120_000
  });

  let result = tryModel(model);
  
  // Fallback if model not found
  if (result.status !== 0 && result.stderr?.includes('model')) {
    console.error(`[warn] Model ${model} not available, trying fallback...`);
    result = tryModel(SUMMARY_FALLBACK);
  }

  if (result.error) {
    throw new Error(`Failed to run pi: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = (result.stderr || '').trim();
    throw new Error(`pi failed${stderr ? `\n${stderr}` : ''}`);
  }
  
  return (result.stdout || '').trim();
}

async function main() {
  if (!isUrl(input) && !existsSync(input)) {
    throw new Error(`File not found: ${input}`);
  }

  const md = runMarkitdown(input);

  if (outPath) {
    writeFileSync(outPath, md, 'utf-8');
  }

  let tmpMdPath = null;
  if (writeTmp || doSummary || extractType) {
    tmpMdPath = makeTmpMdPath(input);
    writeFileSync(tmpMdPath, md, 'utf-8');
  }

  if (writeTmp && !doSummary && !extractType && !outPath) {
    console.log(tmpMdPath);
    return;
  }

  if (doSummary || extractType) {
    const summary = summarizeWithPi(md, { 
      mdPathForNote: tmpMdPath ?? outPath, 
      extraPrompt: summaryPrompt,
      extractType,
      outputJson
    });
    
    // Store to memory if requested
    if (useMemory) {
      const metadata = {
        source: input,
        type: extractType || 'summary',
        timestamp: new Date().toISOString(),
        model: customModel || SUMMARY_MODEL
      };
      const stored = storeToMemory(summary, metadata);
      if (stored) {
        console.error('[memory] Stored to Cortex');
      }
    }
    
    process.stdout.write(summary);
    if (tmpMdPath && !outputJson) {
      process.stdout.write(`\n\n[Hint: Full document Markdown saved to: ${tmpMdPath}]\n`);
    }
    return;
  }

  process.stdout.write(md);
}

main().catch(err => {
  console.error(err?.message || String(err));
  process.exit(1);
});
