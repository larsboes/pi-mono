#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import os from 'os';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { LocalIndex } from 'vectra';
import { glob } from 'glob';

// ── Paths ──────────────────────────────────────────────────────────────────
const HOME = os.homedir();
const MEMORY_DIR = path.join(HOME, '.pi', 'memory');
const INDEX_DIR = path.join(MEMORY_DIR, 'index');
const DAILY_DIR = path.join(MEMORY_DIR, 'daily');
const ENV_FILE = path.join(HOME, '.pi', '.env');

for (const dir of [MEMORY_DIR, INDEX_DIR, DAILY_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── Load API key from ~/.pi/.env or process.env ────────────────────────────
function loadGeminiKey() {
  // Check process env first
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  // Read ~/.pi/.env
  try {
    const content = fs.readFileSync(ENV_FILE, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (key.trim() === 'GEMINI_API_KEY') return rest.join('=').trim();
    }
  } catch {}
  return null;
}

const GEMINI_KEY = loadGeminiKey();
const EMBEDDING_MODEL = 'gemini-embedding-001';

// ── Embedding: Gemini API with API key ─────────────────────────────────────
async function getEmbedding(text) {
  if (!GEMINI_KEY) return null; // no key → signal keyword fallback

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: { parts: [{ text }] } }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Embedding API ${res.status}: ${err}`);
  }

  const data = await res.json();
  if (data.embedding?.values) return data.embedding.values;
  throw new Error('Invalid embedding response');
}

// ── Keyword search (BM25-lite) ─────────────────────────────────────────────
async function keywordSearch(query, maxResults = 5) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  if (terms.length === 0) return [];

  const results = [];
  const files = [
    ...['MEMORY.md', 'IDENTITY.md', 'USER.md'].map(f => path.join(MEMORY_DIR, f)),
    ...(await glob(path.join(DAILY_DIR, '*.md'))),
  ];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    const chunks = content.split('\n\n').filter(c => c.trim().length > 20);
    const filename = path.basename(file);

    for (const chunk of chunks) {
      const lower = chunk.toLowerCase();
      const matchCount = terms.filter(t => lower.includes(t)).length;
      if (matchCount > 0) {
        results.push({
          source: filename,
          text: chunk.trim(),
          score: matchCount / terms.length,
          method: 'keyword',
        });
      }
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

// ── Vector index ───────────────────────────────────────────────────────────
const index = new LocalIndex(INDEX_DIR);

async function vectorSearch(query, maxResults = 5) {
  if (!(await index.isIndexCreated())) return null;

  const vector = await getEmbedding(query);
  if (!vector) return null;

  const results = await index.queryItems(vector, maxResults);
  return results.map(r => ({
    source: r.item.metadata.source,
    text: r.item.metadata.text,
    score: r.score,
    method: 'vector',
  }));
}

async function addToIndex(text, metadata) {
  if (!(await index.isIndexCreated())) await index.createIndex();
  try {
    const vector = await getEmbedding(text);
    if (!vector) {
      console.error('[skip] No API key — chunk not indexed.');
      return;
    }
    await index.insertItem({ vector, metadata: { ...metadata, text } });
  } catch (e) {
    console.error(`[error] Indexing chunk: ${e.message}`);
  }
}

// ── Search: vector first, keyword fallback ─────────────────────────────────
async function search(query, maxResults = 5) {
  try {
    const vectorResults = await vectorSearch(query, maxResults);
    if (vectorResults && vectorResults.length > 0) return vectorResults;
  } catch (e) {
    console.error(`[warn] Vector search failed (${e.message}), using keyword fallback`);
  }
  return keywordSearch(query, maxResults);
}

// ── Reindex ────────────────────────────────────────────────────────────────
async function reindex() {
  if (!GEMINI_KEY) {
    console.error('[error] No GEMINI_API_KEY found in ~/.pi/.env or environment.');
    console.error('        Get a free key at https://aistudio.google.com/apikey');
    process.exit(1);
  }
  console.log(`[info] Reindexing with model: ${EMBEDDING_MODEL}`);

  // Clear and recreate index
  if (fs.existsSync(INDEX_DIR)) {
    fs.rmSync(INDEX_DIR, { recursive: true, force: true });
    fs.mkdirSync(INDEX_DIR);
  }
  await index.createIndex();

  let totalChunks = 0;

  // Core files
  for (const filename of ['MEMORY.md', 'IDENTITY.md', 'USER.md']) {
    const file = path.join(MEMORY_DIR, filename);
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf-8');
    const chunks = content.split('\n\n').filter(c => c.trim().length > 20);
    for (const chunk of chunks) {
      await addToIndex(chunk.trim(), { source: filename, type: 'core' });
      totalChunks++;
    }
    console.log(`[ok] ${filename} (${chunks.length} chunks)`);
  }

  // Daily notes
  const dailyFiles = await glob(path.join(DAILY_DIR, '*.md'));
  for (const file of dailyFiles) {
    const content = fs.readFileSync(file, 'utf-8');
    const chunks = content.split('\n\n').filter(c => c.trim().length > 20);
    const filename = path.basename(file);
    for (const chunk of chunks) {
      await addToIndex(chunk.trim(), { source: filename, type: 'daily' });
      totalChunks++;
    }
    console.log(`[ok] ${filename} (${chunks.length} chunks)`);
  }

  console.log(`[done] Indexed ${totalChunks} chunks total`);
}

// ── CLI ────────────────────────────────────────────────────────────────────
yargs(hideBin(process.argv))
  .command('search <query>', 'Search memories (vector + keyword fallback)', {
    n: { alias: 'max', type: 'number', default: 5, description: 'Max results' },
  }, async (argv) => {
    const results = await search(argv.query, argv.n);
    if (results.length === 0) {
      console.log('[info] No relevant memories found.');
    } else {
      for (const r of results) {
        console.log(`\n[${r.source}] (score: ${r.score.toFixed(2)}, ${r.method})`);
        console.log(r.text);
        console.log('---');
      }
    }
  })
  .command('add <text>', 'Add a memory', {
    daily: { alias: 'd', type: 'boolean', description: 'Add to daily note' },
  }, async (argv) => {
    const text = argv.text;
    if (argv.daily) {
      const today = new Date().toISOString().split('T')[0];
      const file = path.join(DAILY_DIR, `${today}.md`);
      const isNew = !fs.existsSync(file);
      fs.appendFileSync(file, isNew ? `# ${today}\n\n${text}` : `\n\n${text}`);
      console.log(`[ok] Added to daily/${today}.md`);
    } else {
      const file = path.join(MEMORY_DIR, 'MEMORY.md');
      fs.appendFileSync(file, `\n\n${text}`);
      console.log('[ok] Added to MEMORY.md');
    }
    await addToIndex(text, {
      source: argv.daily ? `${new Date().toISOString().split('T')[0]}.md` : 'MEMORY.md',
      type: argv.daily ? 'daily' : 'core',
    });
  })
  .command('get <file>', 'Read a memory file', {}, (argv) => {
    const file = path.join(MEMORY_DIR, argv.file);
    if (!fs.existsSync(file)) {
      console.error(`[error] File not found: ${argv.file}`);
      process.exit(1);
    }
    console.log(fs.readFileSync(file, 'utf-8'));
  })
  .command('list', 'List all memory files', {}, async () => {
    const files = [
      ...['MEMORY.md', 'IDENTITY.md', 'USER.md'].filter(f =>
        fs.existsSync(path.join(MEMORY_DIR, f))
      ),
    ];
    const dailyFiles = await glob(path.join(DAILY_DIR, '*.md'));
    for (const f of dailyFiles) files.push(`daily/${path.basename(f)}`);
    if (files.length === 0) {
      console.log('[info] No memory files yet.');
    } else {
      for (const f of files) console.log(f);
    }
  })
  .command('reindex', 'Rebuild vector index from all memory files', {}, async () => {
    await reindex();
  })
  .command('status', 'Show memory system status', {}, async () => {
    const hasKey = !!GEMINI_KEY;
    const hasIndex = await index.isIndexCreated();
    console.log(`Gemini API key: ${hasKey ? '✓' : '✗ (set GEMINI_API_KEY in ~/.pi/.env)'}`);
    console.log(`Vector index:   ${hasIndex ? '✓' : '✗ (run reindex)'}`);
    console.log(`Keyword search: ✓ (always available)`);
    console.log(`Memory dir:     ${MEMORY_DIR}`);
    console.log(`Embedding:      ${EMBEDDING_MODEL}`);
    const core = ['MEMORY.md', 'IDENTITY.md', 'USER.md'].filter(f =>
      fs.existsSync(path.join(MEMORY_DIR, f))
    ).length;
    const daily = (await glob(path.join(DAILY_DIR, '*.md'))).length;
    console.log(`Files:          ${core} core, ${daily} daily`);
  })
  .demandCommand(1, 'Specify a command: search, add, get, list, reindex, status')
  .strict()
  .help()
  .argv;
