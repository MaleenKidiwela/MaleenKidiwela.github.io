#!/usr/bin/env node
// Build-time RAG indexer for Maleen's notes site.
// Walks /notes/{COSZO,BransfieldEQ,Earthnote}/**, parses each markdown file
// into a mdast tree, splits into section-aware chunks, embeds via Gemini,
// and writes search-index.json + chunks.json + embeddings.bin into /public.

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { remark } from 'remark';
import MiniSearch from 'minisearch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NOTES_DIR = path.join(ROOT, 'notes');
const OUT_DIR = path.join(ROOT, 'public');
const CONFIG_PATH = path.join(ROOT, 'rag-config.json');

const PROJECT_FOLDERS = ['COSZO', 'BransfieldEQ', 'Earthnote'];
const EMBED_MODEL = 'gemini-embedding-001';
const CONCEPT_MODEL = 'gemini-2.5-flash';
const BATCH_SIZE = 25;
const MAX_RETRIES = 6;
const BASE_BACKOFF_MS = 4000;
const INTER_BATCH_DELAY_MS = 1500;
const CONCEPT_INTER_CALL_MS = 200;
const CONCEPT_MIN_CHUNKS = 1; // include even singletons; UI can filter

const DEFAULTS = {
  embedDim: 768,
  chunking: { minChunkWords: 60, maxChunkWords: 375, overlapWords: 75 },
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function loadConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      embedDim: parsed.embedDim ?? DEFAULTS.embedDim,
      chunking: { ...DEFAULTS.chunking, ...(parsed.chunking || {}) },
    };
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.warn(`No rag-config.json at ${CONFIG_PATH}; using defaults.`);
      return DEFAULTS;
    }
    throw e;
  }
}

async function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (e) {
    if (e.code === 'ENOENT') return out;
    throw e;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full));
    else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) out.push(full);
  }
  return out;
}

// Render an mdast node (or array) to plain inline-ish text.
// Handles paragraphs, lists, code blocks, blockquotes, links, etc.
function flattenNode(node) {
  if (!node) return '';
  if (typeof node.value === 'string') return node.value;
  if (Array.isArray(node.children)) {
    const blockTypes = new Set([
      'paragraph', 'heading', 'listItem', 'blockquote',
      'tableRow', 'tableCell', 'definition', 'footnoteDefinition',
    ]);
    const sep = blockTypes.has(node.type) ? ' ' : '\n';
    return node.children.map(flattenNode).join(sep);
  }
  return '';
}

function flattenNodes(nodes) {
  return nodes.map(flattenNode).join('\n').replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

// Split a tree into sections delimited by headings.
// Returns [{ headingPath: [{depth,title}], nodes: [...] }, ...]
function splitIntoSections(tree) {
  const sections = [];
  const headingStack = [];
  let current = { headingPath: [], nodes: [] };
  for (const node of tree.children) {
    if (node.type === 'heading') {
      // Close previous if it has any content.
      if (current.nodes.length || current.headingPath.length) sections.push(current);
      // Pop the heading stack to reflect entering a heading at this depth.
      while (headingStack.length && headingStack[headingStack.length - 1].depth >= node.depth) {
        headingStack.pop();
      }
      const title = flattenNode(node).trim();
      headingStack.push({ depth: node.depth, title });
      current = { headingPath: headingStack.map((h) => ({ ...h })), nodes: [] };
    } else {
      current.nodes.push(node);
    }
  }
  if (current.nodes.length || current.headingPath.length) sections.push(current);
  return sections;
}

function wordCount(s) {
  return s ? s.split(/\s+/).filter(Boolean).length : 0;
}

function splitWithOverlap(text, maxWords, overlapWords) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return [words.join(' ')];
  const step = Math.max(1, maxWords - overlapWords);
  const out = [];
  for (let i = 0; i < words.length; i += step) {
    out.push(words.slice(i, i + maxWords).join(' '));
    if (i + maxWords >= words.length) break;
  }
  return out;
}

function rootSection(headingPath) {
  return headingPath.length ? headingPath[0].title : '';
}

// Build chunk records from sections, applying min/max word policy.
function buildChunksForNote(sections, meta, cfg) {
  const { minChunkWords, maxChunkWords, overlapWords } = cfg;
  const draft = [];

  for (const sec of sections) {
    const text = flattenNodes(sec.nodes);
    if (!text) continue;
    const sectionTitle = sec.headingPath.length
      ? sec.headingPath[sec.headingPath.length - 1].title
      : '';
    const sectionPath = sec.headingPath.map((h) => h.title);
    const wc = wordCount(text);
    if (wc <= maxChunkWords) {
      draft.push({ sectionTitle, sectionPath, text });
    } else {
      const splits = splitWithOverlap(text, maxChunkWords, overlapWords);
      splits.forEach((piece) => draft.push({ sectionTitle, sectionPath, text: piece }));
    }
  }

  // Merge tiny chunks into the previous chunk when they share a root section,
  // so we don't ship weak fragmentary chunks.
  const merged = [];
  for (const ch of draft) {
    const wc = wordCount(ch.text);
    const prev = merged[merged.length - 1];
    const sameRoot = prev && rootSection(prev.sectionPath) === rootSection(ch.sectionPath);
    if (wc < minChunkWords && prev && sameRoot) {
      prev.text = (prev.text + '\n' + ch.text).trim();
      // Keep the prev's sectionTitle/path; the merged content is "under" it logically.
    } else {
      merged.push({ ...ch });
    }
  }

  // If the last chunk is itself tiny and there is nothing to merge into,
  // and we have a previous chunk, fold it backward.
  if (merged.length >= 2) {
    const last = merged[merged.length - 1];
    if (wordCount(last.text) < minChunkWords && rootSection(last.sectionPath) === rootSection(merged[merged.length - 2].sectionPath)) {
      merged[merged.length - 2].text = (merged[merged.length - 2].text + '\n' + last.text).trim();
      merged.pop();
    }
  }

  return merged.map((ch, idx) => ({
    ...meta,
    chunkIndex: idx,
    sectionTitle: ch.sectionTitle || meta.noteTitle,
    sectionPath: ch.sectionPath,
    text: ch.text,
  }));
}

function l2norm(values) {
  let s = 0;
  for (const v of values) s += v * v;
  s = Math.sqrt(s) || 1;
  const out = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) out[i] = values[i] / s;
  return out;
}

function urlForRelPath(rel) {
  return '/' + rel.split(path.sep).map(encodeURIComponent).join('/');
}

function projectFromRel(rel) {
  const parts = rel.split(path.sep);
  // rel looks like notes/COSZO/foo.md → parts[0]=notes, parts[1]=COSZO
  if (parts[0] === 'notes' && parts.length > 1) return parts[1];
  return parts[0] || '';
}

function dateFromFilename(name) {
  // YYYY-MM-DD or YYYYMMDD anywhere in the filename
  let m = name.match(/(\d{4})[-_.]?(\d{2})[-_.]?(\d{2})/);
  if (m) {
    const moi = parseInt(m[2], 10), di = parseInt(m[3], 10);
    if (moi >= 1 && moi <= 12 && di >= 1 && di <= 31) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  // US-style MM-DD-YY: e.g., "05-01-26 Notes" → 2026-05-01
  m = name.match(/\b(\d{2})-(\d{2})-(\d{2})\b/);
  if (m) {
    const moi = parseInt(m[1], 10), di = parseInt(m[2], 10);
    if (moi >= 1 && moi <= 12 && di >= 1 && di <= 31) {
      return `20${m[3]}-${m[1]}-${m[2]}`;
    }
  }
  return '';
}

function noteTitleFromTree(tree, frontmatterTitle, fallback) {
  if (frontmatterTitle) return String(frontmatterTitle);
  const h1 = tree.children.find((n) => n.type === 'heading' && n.depth === 1);
  if (h1) {
    const t = flattenNode(h1).trim();
    if (t) return t;
  }
  return fallback;
}

function embeddingInputFor(c) {
  const sectionPathStr = Array.isArray(c.sectionPath) && c.sectionPath.length
    ? c.sectionPath.join(' / ')
    : c.noteTitle;
  return `${c.project} :: ${c.noteTitle} :: ${sectionPathStr}\n\n${c.text}`;
}

function sha1(s) {
  return crypto.createHash('sha1').update(s).digest('hex');
}

async function loadPreviousCache(outDir, embedDim) {
  // Load the previous build's chunks.json + embeddings.bin so we can reuse
  // vectors for chunks whose embedding-input hash hasn't changed.
  let chunksRaw, embBuf;
  try {
    chunksRaw = await fs.readFile(path.join(outDir, 'chunks.json'), 'utf8');
    embBuf = await fs.readFile(path.join(outDir, 'embeddings.bin'));
  } catch {
    return null;
  }
  let prevChunks;
  try { prevChunks = JSON.parse(chunksRaw); } catch { return null; }
  if (!Array.isArray(prevChunks) || !prevChunks.length) return null;
  const expectedFloats = prevChunks.length * embedDim;
  if (embBuf.byteLength !== expectedFloats * 4) {
    console.warn(`Previous embeddings.bin size mismatch (${embBuf.byteLength} vs expected ${expectedFloats * 4}); ignoring cache.`);
    return null;
  }
  // Copy into a fresh, aligned ArrayBuffer so the Float32Array view is safe.
  const ab = new ArrayBuffer(embBuf.byteLength);
  new Uint8Array(ab).set(embBuf);
  const arr = new Float32Array(ab);

  const map = new Map();
  for (let i = 0; i < prevChunks.length; i++) {
    const c = prevChunks[i];
    if (!c || typeof c.text !== 'string') continue;
    const key = sha1(embeddingInputFor(c));
    if (map.has(key)) continue;
    map.set(key, arr.subarray(i * embedDim, (i + 1) * embedDim));
  }
  return map;
}

async function embedBatch(texts, apiKey, embedDim) {
  const body = {
    requests: texts.map((t) => ({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: t }] },
      outputDimensionality: embedDim,
      taskType: 'RETRIEVAL_DOCUMENT',
    })),
  };
  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      const j = await res.json();
      return j.embeddings.map((e) => e.values);
    }
    const txt = await res.text().catch(() => '');
    lastErr = new Error(`Embed batch failed (${res.status}): ${txt.slice(0, 500)}`);
    if (res.status !== 429 && res.status < 500) throw lastErr;
    if (attempt === MAX_RETRIES) throw lastErr;
    let wait = BASE_BACKOFF_MS * Math.pow(2, attempt);
    const retryHdr = res.headers.get('retry-after');
    if (retryHdr && !Number.isNaN(parseInt(retryHdr, 10))) {
      wait = Math.max(wait, parseInt(retryHdr, 10) * 1000);
    }
    console.warn(`  ${res.status} from embed API; retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await sleep(wait);
  }
  throw lastErr;
}

// ── Concept extraction ──────────────────────────────────────────────────────
// One Gemini 2.5 Flash call per chunk pulls out methods/instruments/datasets/
// quantities as structured JSON. Cached by sha1(text) so daily syncs only
// re-extract changed chunks.

const CONCEPT_KINDS = ['methods', 'instruments', 'datasets', 'quantities'];

const CONCEPT_SYSTEM_PROMPT = [
  'You extract a structured concept inventory from a chunk of a geophysics research note.',
  'Return only items SUBSTANTIVELY used, applied, computed, or discussed in the excerpt.',
  'Exclude items that are merely name-dropped, cited, or listed as background.',
  'Use canonical short names (e.g. "cross-correlation" not "the cross-correlation method";',
  '"OOI broadband seismometer" not "OOI\'s broadband instrument"). Lowercase unless it is a',
  'proper noun, acronym, or station code. Prefer the most common form.',
  'Categories:',
  '- methods: techniques, algorithms, procedures (e.g. cross-correlation, spectral whitening, RANSAC)',
  '- instruments: physical sensors or platforms (e.g. OOI broadband seismometer, RBR pressure gauge)',
  '- datasets: named data products or archives (e.g. ETOPO1, IRIS DMC, OOI cabled array)',
  '- quantities: physical observables or derived measures (e.g. dv/v, travel-time residual, PSD)',
  'Return an empty array for any category with no qualifying items.',
].join('\n');

const CONCEPT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: Object.fromEntries(
    CONCEPT_KINDS.map((k) => [k, { type: 'array', items: { type: 'string' } }]),
  ),
  required: CONCEPT_KINDS,
};

function canonicalizeLabel(s) {
  return String(s)
    .trim()
    .replace(/^the\s+/i, '')
    .replace(/\s+/g, ' ')
    .replace(/[‐-―]/g, '-') // unicode dashes → ascii
    .toLowerCase();
}

function chunkTextHash(c) {
  return sha1(`${c.project}::${c.noteTitle}::${c.text}`);
}

async function loadConceptCache(outDir) {
  try {
    const raw = await fs.readFile(path.join(outDir, 'concepts-cache.json'), 'utf8');
    const j = JSON.parse(raw);
    return j && typeof j === 'object' ? j : {};
  } catch {
    return {};
  }
}

async function extractConceptsForChunk(chunk, apiKey) {
  const body = {
    systemInstruction: { parts: [{ text: CONCEPT_SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [{
        text: [
          `Note: ${chunk.noteTitle}`,
          `Project: ${chunk.project}`,
          chunk.sectionTitle ? `Section: ${chunk.sectionTitle}` : '',
          '',
          chunk.text,
        ].filter(Boolean).join('\n'),
      }],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CONCEPT_RESPONSE_SCHEMA,
      temperature: 0,
      maxOutputTokens: 512,
    },
  };

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${CONCEPT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (res.ok) {
      const j = await res.json();
      const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
      try {
        const parsed = JSON.parse(text);
        const out = {};
        for (const k of CONCEPT_KINDS) out[k] = Array.isArray(parsed[k]) ? parsed[k] : [];
        return out;
      } catch (e) {
        return { methods: [], instruments: [], datasets: [], quantities: [] };
      }
    }
    const txt = await res.text().catch(() => '');
    lastErr = new Error(`Concept call failed (${res.status}): ${txt.slice(0, 500)}`);
    if (res.status !== 429 && res.status < 500) throw lastErr;
    if (attempt === MAX_RETRIES) throw lastErr;
    let wait = BASE_BACKOFF_MS * Math.pow(2, attempt);
    const retryHdr = res.headers.get('retry-after');
    if (retryHdr && !Number.isNaN(parseInt(retryHdr, 10))) {
      wait = Math.max(wait, parseInt(retryHdr, 10) * 1000);
    }
    console.warn(`  ${res.status} from concept API; retrying in ${Math.round(wait / 1000)}s (attempt ${attempt + 1}/${MAX_RETRIES})`);
    await sleep(wait);
  }
  throw lastErr;
}

async function buildConceptIndex(savedChunks, outDir, apiKey) {
  const cache = await loadConceptCache(outDir);
  const nextCache = {};
  const byChunk = {};
  let hits = 0;
  let calls = 0;

  for (const c of savedChunks) {
    const key = chunkTextHash(c);
    let extracted = cache[key];
    if (extracted) {
      hits++;
    } else {
      try {
        extracted = await extractConceptsForChunk(c, apiKey);
        calls++;
        if (calls % 10 === 0) console.log(`  concepts: ${calls} chunks extracted`);
      } catch (err) {
        console.error(`  concept extraction failed for chunk ${c.id}: ${err.message}`);
        extracted = { methods: [], instruments: [], datasets: [], quantities: [] };
      }
      await sleep(CONCEPT_INTER_CALL_MS);
    }
    nextCache[key] = extracted;
    byChunk[c.id] = extracted;
  }

  // Build inverted index: (kind, canonical-label) → chunk ids.
  const conceptMap = new Map();
  for (const c of savedChunks) {
    const ex = byChunk[c.id];
    if (!ex) continue;
    for (const kind of CONCEPT_KINDS) {
      const seen = new Set();
      for (const raw of ex[kind] || []) {
        const label = canonicalizeLabel(raw);
        if (!label || seen.has(label)) continue;
        seen.add(label);
        const id = `${kind}:${label}`;
        let entry = conceptMap.get(id);
        if (!entry) {
          entry = {
            id,
            label,
            display: String(raw).trim(),
            kind: kind.replace(/s$/, ''),
            chunkIds: [],
            noteIds: new Set(),
            projects: new Set(),
          };
          conceptMap.set(id, entry);
        }
        entry.chunkIds.push(c.id);
        entry.noteIds.add(c.noteId);
        entry.projects.add(c.project);
      }
    }
  }

  const concepts = [...conceptMap.values()]
    .filter((e) => e.chunkIds.length >= CONCEPT_MIN_CHUNKS)
    .map((e) => ({
      id: e.id,
      label: e.label,
      display: e.display,
      kind: e.kind,
      chunkIds: e.chunkIds,
      noteIds: [...e.noteIds],
      projects: [...e.projects],
      count: e.chunkIds.length,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    concepts,
    byChunk,
    cache: nextCache,
    stats: { hits, calls, totalConcepts: concepts.length },
  };
}

async function main() {
  // Prefer the dedicated embedding key (paid tier); fall back to the legacy
  // single key so existing CI setups keep working.
  const apiKey = process.env.GEMINI_EMBED_KEY || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_EMBED_KEY (or GEMINI_API_KEY) not set; aborting.');
    process.exit(1);
  }

  const cfg = await loadConfig();
  console.log(`Config: embedDim=${cfg.embedDim} chunking=${JSON.stringify(cfg.chunking)}`);

  const files = [];
  for (const folder of PROJECT_FOLDERS) {
    const found = await walk(path.join(NOTES_DIR, folder));
    files.push(...found);
  }
  files.sort();
  console.log(`Found ${files.length} markdown files across ${PROJECT_FOLDERS.join(', ')}.`);

  const parser = remark();
  const allChunks = [];
  let totalWords = 0;

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    const { data, content } = matter(raw);
    const tree = parser.parse(content);
    const rel = path.relative(ROOT, file);
    const baseName = path.basename(file, path.extname(file));
    const noteTitle = noteTitleFromTree(tree, data.title, baseName);
    const meta = {
      noteId: rel,
      noteTitle,
      noteUrl: urlForRelPath(rel),
      project: projectFromRel(rel),
      filePath: rel,
      dateFromFilename: dateFromFilename(baseName),
    };

    const sections = splitIntoSections(tree);
    const chunks = buildChunksForNote(sections, meta, cfg.chunking);

    for (const ch of chunks) {
      if (!ch.text || !wordCount(ch.text)) continue;
      const id = allChunks.length;
      totalWords += wordCount(ch.text);
      allChunks.push({ id, ...ch });
    }
  }

  console.log(`Chunked into ${allChunks.length} pieces (~${Math.round(totalWords / 0.75)} tokens).`);

  await fs.mkdir(OUT_DIR, { recursive: true });

  const indexFields = ['text', 'noteTitle', 'sectionTitle', 'project'];
  const storeFields = ['noteId', 'noteTitle', 'noteUrl', 'chunkIndex', 'sectionTitle', 'sectionPath', 'project', 'dateFromFilename', 'filePath'];

  if (allChunks.length === 0) {
    console.warn('No content to index. Writing empty artifacts.');
    const mini = new MiniSearch({ fields: indexFields, storeFields, idField: 'id' });
    await fs.writeFile(path.join(OUT_DIR, 'search-index.json'), JSON.stringify(mini));
    await fs.writeFile(path.join(OUT_DIR, 'chunks.json'), '[]');
    await fs.writeFile(path.join(OUT_DIR, 'embeddings.bin'), Buffer.alloc(0));
    return;
  }

  // Reuse vectors from the previous build whenever the embedding-input hash
  // matches, so the daily auto-sync only embeds chunks that actually changed.
  const cache = await loadPreviousCache(OUT_DIR, cfg.embedDim);
  const cacheSize = cache ? cache.size : 0;
  console.log(`Cache: ${cacheSize} prior chunk vectors available.`);

  const embeddings = new Float32Array(allChunks.length * cfg.embedDim);
  const toEmbed = []; // { chunkIndex, input }
  let cachedHits = 0;

  for (let i = 0; i < allChunks.length; i++) {
    const c = allChunks[i];
    const input = embeddingInputFor(c);
    const key = cache ? sha1(input) : null;
    const hit = cache && cache.get(key);
    if (hit) {
      embeddings.set(hit, i * cfg.embedDim);
      cachedHits++;
    } else {
      toEmbed.push({ chunkIndex: i, input });
    }
  }

  console.log(`Cache hits: ${cachedHits}/${allChunks.length}; embedding ${toEmbed.length} new chunks.`);

  // Track which chunk indices have a usable vector (cache hit OR freshly
  // embedded). On a mid-run failure (e.g. embedding RPD exhausted), we save
  // partial artifacts containing only the chunks with vectors so the next
  // rebuild's cache covers them and we only retry the missing ones.
  const haveVector = new Uint8Array(allChunks.length);
  for (let i = 0; i < allChunks.length; i++) {
    if (cache && cache.get(sha1(embeddingInputFor(allChunks[i])))) haveVector[i] = 1;
  }

  let calls = 0;
  let abortError = null;
  try {
    for (let b = 0; b < toEmbed.length; b += BATCH_SIZE) {
      const batch = toEmbed.slice(b, b + BATCH_SIZE);
      const vectors = await embedBatch(batch.map((x) => x.input), apiKey, cfg.embedDim);
      calls++;
      vectors.forEach((vec, i) => {
        const norm = l2norm(vec);
        embeddings.set(norm, batch[i].chunkIndex * cfg.embedDim);
        haveVector[batch[i].chunkIndex] = 1;
      });
      console.log(`  embedded ${Math.min(b + BATCH_SIZE, toEmbed.length)}/${toEmbed.length}`);
      if (b + BATCH_SIZE < toEmbed.length) await sleep(INTER_BATCH_DELAY_MS);
    }
  } catch (err) {
    abortError = err;
    console.error(`Embedding aborted: ${err.message}`);
  }

  // Build the saved set: only chunks that actually have a vector. Drop the
  // missing ones so the artifacts are coherent and retrieval still works.
  const savedChunks = [];
  const savedEmbeddings = new Float32Array(allChunks.length * cfg.embedDim); // size is upper bound
  let writeIdx = 0;
  for (let i = 0; i < allChunks.length; i++) {
    if (!haveVector[i]) continue;
    const slice = embeddings.subarray(i * cfg.embedDim, (i + 1) * cfg.embedDim);
    savedEmbeddings.set(slice, writeIdx * cfg.embedDim);
    savedChunks.push({ ...allChunks[i], id: writeIdx });
    writeIdx++;
  }
  const savedEmbView = savedEmbeddings.subarray(0, writeIdx * cfg.embedDim);

  const mini = new MiniSearch({ fields: indexFields, storeFields, idField: 'id' });
  mini.addAll(savedChunks);

  await fs.writeFile(path.join(OUT_DIR, 'search-index.json'), JSON.stringify(mini));
  await fs.writeFile(path.join(OUT_DIR, 'chunks.json'), JSON.stringify(savedChunks));
  await fs.writeFile(
    path.join(OUT_DIR, 'embeddings.bin'),
    Buffer.from(savedEmbView.buffer, savedEmbView.byteOffset, savedEmbView.byteLength),
  );

  const dropped = allChunks.length - savedChunks.length;
  console.log(
    `Done. notes=${files.length} chunks_total=${allChunks.length} chunks_saved=${savedChunks.length} dropped=${dropped} ~tokens=${Math.round(totalWords / 0.75)} cached=${cachedHits} embedded=${writeIdx - cachedHits} embed_calls=${calls} bytes=${savedChunks.length * cfg.embedDim * 4}`,
  );
  if (abortError) {
    console.error(`Saved partial index (missing ${dropped} chunks). Re-run after quota reset to fill in.`);
    process.exit(1);
  }

  // ── Concept extraction (best-effort) ─────────────────────────────────────
  // Runs after the RAG artifacts are safely on disk. A failure here only
  // skips the Concepts tab; the chat pipeline is unaffected.
  if (process.env.SKIP_CONCEPTS === '1') {
    console.log('SKIP_CONCEPTS=1 set; skipping concept extraction.');
    return;
  }
  const conceptKey = process.env.GEMINI_CONCEPT_KEY || apiKey;
  try {
    console.log('Extracting concepts via gemini-2.5-flash …');
    const t0 = Date.now();
    const { concepts, byChunk, cache: nextCache, stats } = await buildConceptIndex(savedChunks, OUT_DIR, conceptKey);
    const generatedAt = new Date().toISOString();
    await fs.writeFile(
      path.join(OUT_DIR, 'concepts.json'),
      JSON.stringify({ generatedAt, concepts, byChunk }),
    );
    await fs.writeFile(
      path.join(OUT_DIR, 'concepts-cache.json'),
      JSON.stringify(nextCache),
    );
    const ms = Date.now() - t0;
    console.log(
      `Concepts: ${stats.totalConcepts} unique across ${savedChunks.length} chunks ` +
      `(cache=${stats.hits}, new=${stats.calls}, ${Math.round(ms / 1000)}s).`,
    );
  } catch (err) {
    console.error(`Concept extraction failed: ${err.message}`);
    console.error('RAG artifacts are still saved; Concepts tab may be stale.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
