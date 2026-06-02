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

// Bump when the rationale prompt or concept-embedding input format changes,
// to invalidate stale entries in directions-*-cache.json on the next run.
const DIRECTIONS_CACHE_VERSION = '1';

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
const KIND_SINGULAR = {
  methods:     'method',
  instruments: 'instrument',
  datasets:    'dataset',
  quantities:  'quantity',
};

const CONCEPT_SYSTEM_PROMPT = [
  'You extract a structured concept inventory from a chunk of a geophysics research note.',
  '',
  'Categories:',
  '- methods: techniques, algorithms, processing steps',
  '  (cross-correlation, spectral whitening, traveltime tomography, beamforming, RANSAC)',
  '- instruments: physical sensors, sensor platforms, deployments',
  '  (OOI broadband seismometer, RBR pressure gauge, 3-D single-point current meter, ADCP, OBS,',
  '  CTD, hydrophone, surface buoy, subsurface mooring)',
  '- datasets: named data products, archives, registries, surveys',
  '  (ETOPO1, IRIS DMC, OOI cabled array, USGS ANSS catalog)',
  '- quantities: physical observables and measured or derived quantities',
  '  (dv/v, travel-time residual, PSD, sea-floor pressure, RMS amplitude)',
  '',
  'Be GENEROUS in what you extract. Include every named item that:',
  '  - is used, applied, processed, measured, or computed in the work, OR',
  '  - is described or characterized with any concrete detail (location, depth, type,',
  '    parameters, status, configuration, sampling rate, time span, etc.), OR',
  '  - appears as a named entry in a catalog, inventory, list, or table — every named',
  '    entry counts, even with only a brief characterizing detail. Do NOT skip items',
  '    because they sit in a bullet list or table.',
  '',
  'Only EXCLUDE:',
  '  - items appearing solely as bibliographic citations ("as in Smith 2019", "see Wapenaar"),',
  '  - bare generic terms with no name attached ("a seismometer", "the dataset"),',
  '  - author names, person names, vessel names.',
  '',
  'Note: programs and observatories like OOI, OBSIP, USArray are valid sources of named',
  'instruments and datasets. When the excerpt names instruments deployed by such a program,',
  'extract the instruments — do not skip them because they belong to a program.',
  '',
  'Naming:',
  '  - canonical short form ("cross-correlation" not "the cross-correlation method")',
  '  - lowercase except for proper nouns, acronyms, station codes (ADCP, HYS14, ETOPO1)',
  '  - if both full name and acronym appear, return only the more common one',
  '  - each item appears in exactly one category',
  '',
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

// Concept-embedding cache. Keyed on concept id (e.g. "method:beamforming");
// each value is a plain array of `embedDim` floats. Invalidated when the cache
// version or embedDim changes (a different embedding model would also need a
// version bump).
async function loadConceptEmbCache(outDir, embedDim) {
  try {
    const raw = await fs.readFile(path.join(outDir, 'directions-emb-cache.json'), 'utf8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return {};
    if (j.version !== DIRECTIONS_CACHE_VERSION) return {};
    if (j.embedDim !== embedDim) return {};
    return j.vectors && typeof j.vectors === 'object' ? j.vectors : {};
  } catch {
    return {};
  }
}

// Rationale cache. Keyed on "<source.id>|||<target.id>" → rationale string.
// Invalidated when the cache version changes.
async function loadRationaleCache(outDir) {
  try {
    const raw = await fs.readFile(path.join(outDir, 'directions-rationale-cache.json'), 'utf8');
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return {};
    if (j.version !== DIRECTIONS_CACHE_VERSION) return {};
    return j.rationales && typeof j.rationales === 'object' ? j.rationales : {};
  } catch {
    return {};
  }
}

// Detect whether a chunk is a catalog/inventory section vs narrative prose.
// Three independent signals; any one trips the flag. We surface this to the
// LLM via the user message so its (c) "explicit subject of enumeration" rule
// activates with high confidence.
function isCatalogChunk(chunk) {
  const path = (chunk.filePath || chunk.noteId || '').toLowerCase();
  const filenameHint =
    /(catalog|catalogue|inventory|registry|index[_\s-]of|list[_\s-]of|_list\b|instruments|datasets|data[_\s-]?notes|reference[_\s-]?notes)/.test(path);
  if (filenameHint) return true;

  const sectionStr = (Array.isArray(chunk.sectionPath) ? chunk.sectionPath.join(' ') : '').toLowerCase();
  if (/(catalog|catalogue|inventory|registry|list of|table of|reference)/.test(sectionStr)) return true;

  const lines = String(chunk.text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 4) {
    const listish = lines.filter((l) => /^([-*+]\s|\d+[.)]\s|\|)/.test(l)).length;
    if (listish / lines.length >= 0.4) return true;
  }
  return false;
}

async function extractConceptsForChunk(chunk, apiKey) {
  const catalog = isCatalogChunk(chunk);
  const body = {
    systemInstruction: { parts: [{ text: CONCEPT_SYSTEM_PROMPT }] },
    contents: [{
      role: 'user',
      parts: [{
        text: [
          `Note: ${chunk.noteTitle}`,
          `Project: ${chunk.project}`,
          chunk.sectionTitle ? `Section: ${chunk.sectionTitle}` : '',
          catalog
            ? 'Mode: CATALOG / INVENTORY — this excerpt\'s purpose is to enumerate or characterize items. Apply the (c) substantive-criterion liberally: every named entry with any characterizing detail (location, parameters, status, type, etc.) is in scope. Do NOT exclude items just because they appear in a list or table.'
            : '',
          '',
          chunk.text,
        ].filter(Boolean).join('\n'),
      }],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: CONCEPT_RESPONSE_SCHEMA,
      temperature: 0,
      maxOutputTokens: 2048,
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
            kind: KIND_SINGULAR[kind] || kind,
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

  // Canonicalize network.station code duplicates: when both "uw.cbs" and "cbs"
  // appear as instruments, merge the bare form into the network-prefixed form.
  // Pattern: 1-3 letter network, dot, alnum station (uw.cbs, cn.clrs, iu.cor).
  const NETWORK_RE = /^([a-z]{1,3})\.([a-z0-9]+)$/;
  const bareToFull = new Map();
  for (const entry of conceptMap.values()) {
    if (entry.kind !== 'instrument') continue;
    const m = entry.label.match(NETWORK_RE);
    if (m) bareToFull.set(m[2], entry.id);
  }
  for (const [bareLabel, fullId] of bareToFull) {
    const bareId   = `instruments:${bareLabel}`;
    if (bareId === fullId) continue;
    const bareEntry = conceptMap.get(bareId);
    const fullEntry = conceptMap.get(fullId);
    if (!bareEntry || !fullEntry) continue;
    for (const c of bareEntry.chunkIds) fullEntry.chunkIds.push(c);
    for (const n of bareEntry.noteIds)  fullEntry.noteIds.add(n);
    for (const p of bareEntry.projects) fullEntry.projects.add(p);
    conceptMap.delete(bareId);
  }

  const concepts = [...conceptMap.values()]
    .filter((e) => e.chunkIds.length >= CONCEPT_MIN_CHUNKS)
    .map((e) => ({
      id: e.id,
      label: e.label,
      display: e.display,
      kind: e.kind,
      chunkIds: [...new Set(e.chunkIds)],
      noteIds: [...e.noteIds],
      projects: [...e.projects],
      count: new Set(e.chunkIds).size,
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));

  return {
    concepts,
    byChunk,
    cache: nextCache,
    stats: { hits, calls, totalConcepts: concepts.length },
  };
}

// ── Directions: concept co-occurrence graph + link prediction ────────────────
// Builds a unipartite graph of concept co-occurrences, computes concept-level
// embeddings, scores all non-existing concept pairs, and generates LLM
// rationales for the top predictions. Output: directions.json.

function buildCooccurrenceGraph(concepts, byChunk, savedChunks) {
  // Build a lookup from concept id → concept object for fast access.
  const conceptById = new Map();
  for (const c of concepts) conceptById.set(c.id, c);

  // For each chunk, get all concepts present and create pairwise edges.
  const edgeMap = new Map(); // "id1|||id2" → edge object
  const chunkLookup = new Map();
  for (const c of savedChunks) chunkLookup.set(c.id, c);

  for (const c of savedChunks) {
    const ex = byChunk[c.id];
    if (!ex) continue;

    // Collect all concept ids present in this chunk.
    const chunkConcepts = new Set();
    for (const kind of CONCEPT_KINDS) {
      for (const raw of ex[kind] || []) {
        const label = canonicalizeLabel(raw);
        if (!label) continue;
        const singular = KIND_SINGULAR[kind] || kind;
        const id = `${singular}:${label}`;
        // Only include concepts that survived the min-chunks filter.
        if (conceptById.has(id)) chunkConcepts.add(id);
      }
    }

    const ids = [...chunkConcepts].sort();
    const date = c.dateFromFilename || null;

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = `${ids[i]}|||${ids[j]}`;
        let edge = edgeMap.get(key);
        if (!edge) {
          edge = {
            source: ids[i],
            target: ids[j],
            weight: 0,
            chunks: [],
            projects: new Set(),
            dates: [],
          };
          edgeMap.set(key, edge);
        }
        edge.weight++;
        edge.chunks.push(c.id);
        if (c.project) edge.projects.add(c.project);
        if (date) edge.dates.push(date);
      }
    }
  }

  // Build node list with degree counts.
  const degree = new Map();
  for (const c of concepts) degree.set(c.id, 0);

  const edges = [...edgeMap.values()].map((e) => {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
    return {
      source: e.source,
      target: e.target,
      weight: e.weight,
      chunks: e.chunks,
      projects: [...e.projects],
      dates: e.dates,
    };
  });

  const nodes = concepts.map((c) => ({
    id: c.id,
    label: c.label,
    display: c.display,
    kind: c.kind,
    degree: degree.get(c.id) || 0,
    projects: c.projects,
    count: c.count,
    firstSeen: c.noteIds.length ? c.noteIds[0] : null,
  }));

  return { nodes, edges };
}

async function embedConcepts(concepts, savedChunks, savedEmbView, apiKey, embedDim, outDir) {
  // Embed each concept label directly via the Gemini embedding API. Cache
  // results in directions-emb-cache.json so unchanged concepts don't burn
  // calls on every daily sync. Falls back to averaged chunk embeddings if
  // the API call fails (fallbacks are not cached, since chunk content shifts).
  const cache = await loadConceptEmbCache(outDir, embedDim);
  const conceptEmbeddings = new Map();
  const apiSourced = new Set(); // concept ids whose vector came from the API (cached or freshly embedded)

  const chunkEmbLookup = new Map();
  for (let i = 0; i < savedChunks.length; i++) {
    const start = i * embedDim;
    chunkEmbLookup.set(savedChunks[i].id, savedEmbView.subarray(start, start + embedDim));
  }

  // Partition concepts into cache hits vs misses.
  const misses = [];
  let cachedCount = 0;
  for (const c of concepts) {
    const hit = cache[c.id];
    if (Array.isArray(hit) && hit.length === embedDim) {
      conceptEmbeddings.set(c.id, new Float32Array(hit));
      apiSourced.add(c.id);
      cachedCount++;
    } else {
      misses.push(c);
    }
  }

  // Batch embed only the misses.
  const batchSize = BATCH_SIZE;
  let embeddedCount = 0;
  for (let i = 0; i < misses.length; i += batchSize) {
    const batch = misses.slice(i, i + batchSize);
    const texts = batch.map((c) => `geophysics :: ${c.kind} :: ${c.display}`);
    try {
      const vectors = await embedBatch(texts, apiKey, embedDim);
      for (let k = 0; k < batch.length; k++) {
        conceptEmbeddings.set(batch[k].id, new Float32Array(vectors[k]));
        apiSourced.add(batch[k].id);
      }
      embeddedCount += batch.length;
      if (i + batchSize < misses.length) await sleep(INTER_BATCH_DELAY_MS);
    } catch (err) {
      console.warn(`  Concept embed batch failed: ${err.message}; falling back to chunk averages for ${batch.length} concepts.`);
      // Fallback: average chunk embeddings for the failed batch's concepts.
      for (const c of batch) {
        if (conceptEmbeddings.has(c.id)) continue;
        const vecs = c.chunkIds.map((id) => chunkEmbLookup.get(id)).filter(Boolean);
        if (vecs.length) {
          const avg = new Float32Array(embedDim);
          for (const v of vecs) for (let d = 0; d < embedDim; d++) avg[d] += v[d];
          for (let d = 0; d < embedDim; d++) avg[d] /= vecs.length;
          conceptEmbeddings.set(c.id, avg);
        }
      }
    }
  }

  // Final safety net: any concept still missing gets a chunk-average fallback.
  let fallbackCount = 0;
  for (const c of concepts) {
    if (conceptEmbeddings.has(c.id)) {
      if (!apiSourced.has(c.id)) fallbackCount++;
      continue;
    }
    const vecs = c.chunkIds.map((id) => chunkEmbLookup.get(id)).filter(Boolean);
    if (vecs.length) {
      const avg = new Float32Array(embedDim);
      for (const v of vecs) for (let d = 0; d < embedDim; d++) avg[d] += v[d];
      for (let d = 0; d < embedDim; d++) avg[d] /= vecs.length;
      conceptEmbeddings.set(c.id, avg);
      fallbackCount++;
    }
  }

  // Persist the cache. Only API-sourced vectors go in; pruned to current
  // concepts so stale labels don't grow the file forever.
  const nextCache = {};
  for (const c of concepts) {
    if (!apiSourced.has(c.id)) continue;
    const v = conceptEmbeddings.get(c.id);
    if (!v || v.length !== embedDim) continue;
    nextCache[c.id] = Array.from(v);
  }
  await fs.writeFile(
    path.join(outDir, 'directions-emb-cache.json'),
    JSON.stringify({
      version: DIRECTIONS_CACHE_VERSION,
      embedDim,
      vectors: nextCache,
    }),
  );

  console.log(
    `  Concept embeddings: ${cachedCount} cached, ${embeddedCount} via API, ${fallbackCount} via chunk average.`,
  );
  return conceptEmbeddings;
}

function cosineSimilarity(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom > 0 ? dot / denom : 0;
}

function scoreDirections(graph, conceptEmbeddings, concepts) {
  const ALPHA = 0.35; // semantic similarity weight
  const BETA  = 0.30; // shared neighbor weight
  const GAMMA = 0.25; // cross-project bonus weight
  const DELTA = 0.10; // kind diversity weight

  const SIM_MAX = 0.92;  // near-synonyms
  const SIM_MIN = 0.15;  // no plausible connection

  // Build adjacency for the co-occurrence graph.
  const adj = new Map();
  for (const n of graph.nodes) adj.set(n.id, new Set());
  for (const e of graph.edges) {
    adj.get(e.source)?.add(e.target);
    adj.get(e.target)?.add(e.source);
  }

  // Build connected set for quick "already linked?" checks.
  const connected = new Set();
  for (const e of graph.edges) {
    connected.add(`${e.source}|||${e.target}`);
    connected.add(`${e.target}|||${e.source}`);
  }

  // Compute degree percentiles for generic-concept filtering.
  const degrees = graph.nodes.map((n) => n.degree).sort((a, b) => a - b);
  const p75 = degrees[Math.floor(degrees.length * 0.75)] || Infinity;

  // Build project sets and kind map.
  const conceptById = new Map();
  for (const c of concepts) conceptById.set(c.id, c);

  const predictions = [];
  const nodeIds = graph.nodes.map((n) => n.id);

  for (let i = 0; i < nodeIds.length; i++) {
    const uId = nodeIds[i];
    const u = conceptById.get(uId);
    if (!u) continue;
    const uEmb = conceptEmbeddings.get(uId);
    if (!uEmb) continue;
    const uAdj = adj.get(uId);
    const uDeg = uAdj?.size || 0;

    // Skip overly generic concepts.
    if (uDeg > p75 && uDeg > 10) continue;

    for (let j = i + 1; j < nodeIds.length; j++) {
      const vId = nodeIds[j];
      // Skip already-connected pairs.
      if (connected.has(`${uId}|||${vId}`)) continue;

      const v = conceptById.get(vId);
      if (!v) continue;
      const vEmb = conceptEmbeddings.get(vId);
      if (!vEmb) continue;
      const vAdj = adj.get(vId);
      const vDeg = vAdj?.size || 0;

      if (vDeg > p75 && vDeg > 10) continue;

      // Semantic similarity.
      const semanticSim = cosineSimilarity(uEmb, vEmb);
      if (semanticSim > SIM_MAX || semanticSim < SIM_MIN) continue;

      // Shared neighbors (Jaccard-like).
      let shared = 0;
      if (uAdj && vAdj) {
        for (const n of uAdj) if (vAdj.has(n)) shared++;
      }
      const union = (uAdj?.size || 0) + (vAdj?.size || 0) - shared;
      const sharedNeighborScore = union > 0 ? shared / union : 0;

      // Cross-project bonus.
      const uProjects = new Set(u.projects);
      const vProjects = new Set(v.projects);
      let crossProject = false;
      for (const p of vProjects) {
        if (!uProjects.has(p)) { crossProject = true; break; }
      }

      // Kind diversity bonus.
      const kindDiversity = u.kind !== v.kind ? 1 : 0;

      const score =
        ALPHA * semanticSim +
        BETA  * sharedNeighborScore +
        GAMMA * (crossProject ? 1 : 0) +
        DELTA * kindDiversity;

      predictions.push({
        source: { id: u.id, display: u.display, kind: u.kind, projects: u.projects },
        target: { id: v.id, display: v.display, kind: v.kind, projects: v.projects },
        score: Math.round(score * 1000) / 1000,
        semanticSim: Math.round(semanticSim * 1000) / 1000,
        sharedNeighbors: shared,
        crossProject,
        rationale: null,
      });
    }
  }

  predictions.sort((a, b) => b.score - a.score);
  return predictions.slice(0, 30);
}

const DIRECTION_RATIONALE_MODEL = 'gemini-2.5-flash';

async function generateRationales(predictions, savedChunks, concepts, apiKey, outDir) {
  const conceptById = new Map();
  for (const c of concepts) conceptById.set(c.id, c);

  const chunkById = new Map();
  for (const c of savedChunks) chunkById.set(c.id, c);

  const cache = await loadRationaleCache(outDir);
  const nextCache = {};

  const top = predictions.slice(0, 20);
  let generated = 0;
  let cached = 0;

  for (const pred of top) {
    const cacheKey = `${pred.source.id}|||${pred.target.id}`;
    const cachedText = cache[cacheKey];
    if (cachedText && typeof cachedText === 'string' && cachedText.trim()) {
      pred.rationale = cachedText;
      nextCache[cacheKey] = cachedText;
      cached++;
      continue;
    }

    const srcConcept = conceptById.get(pred.source.id);
    const tgtConcept = conceptById.get(pred.target.id);
    if (!srcConcept || !tgtConcept) continue;

    // Get sample text for each concept.
    const srcChunk = srcConcept.chunkIds.map((id) => chunkById.get(id)).filter(Boolean)[0];
    const tgtChunk = tgtConcept.chunkIds.map((id) => chunkById.get(id)).filter(Boolean)[0];

    const prompt = [
      'You are a research advisor for a marine geophysicist.',
      '',
      'Two concepts from research notes have been identified as a potentially productive but unexplored connection:',
      '',
      `Concept A: "${pred.source.display}" (${pred.source.kind})`,
      `  Projects: ${pred.source.projects.join(', ')}`,
      srcChunk ? `  Context: "${srcChunk.text.slice(0, 400)}"` : '',
      '',
      `Concept B: "${pred.target.display}" (${pred.target.kind})`,
      `  Projects: ${pred.target.projects.join(', ')}`,
      tgtChunk ? `  Context: "${tgtChunk.text.slice(0, 400)}"` : '',
      '',
      `These concepts share ${pred.sharedNeighbors} neighbors in the concept graph but have never appeared together in the same note.`,
      '',
      'Write 2-3 concise sentences explaining:',
      '1. Why combining these concepts could lead to a new research direction',
      '2. What specific experiment, analysis, or investigation this combination suggests',
      '',
      'Be specific and scientific. Do not use em dashes.',
    ].filter((l) => l !== '').join('\n');

    try {
      const body = {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 300 },
      };

      let lastErr;
      for (let attempt = 0; attempt <= 3; attempt++) {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${DIRECTION_RATIONALE_MODEL}:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(body),
          },
        );
        if (res.ok) {
          const j = await res.json();
          const text = j?.candidates?.[0]?.content?.parts?.map((p) => p.text).filter(Boolean).join('') || '';
          pred.rationale = text.trim();
          if (pred.rationale) nextCache[cacheKey] = pred.rationale;
          generated++;
          break;
        }
        const txt = await res.text().catch(() => '');
        lastErr = new Error(`Rationale gen failed (${res.status}): ${txt.slice(0, 300)}`);
        if (res.status !== 429 && res.status < 500) break;
        await sleep(BASE_BACKOFF_MS * Math.pow(2, attempt));
      }
      if (!pred.rationale) {
        console.warn(`  Rationale failed for ${pred.source.display} × ${pred.target.display}: ${lastErr?.message || 'unknown'}`);
      }
    } catch (err) {
      console.warn(`  Rationale error: ${err.message}`);
    }
    await sleep(CONCEPT_INTER_CALL_MS);
  }

  // Persist the cache. nextCache is keyed only on current top-20 pairs, so
  // entries for old predictions are pruned automatically.
  await fs.writeFile(
    path.join(outDir, 'directions-rationale-cache.json'),
    JSON.stringify({
      version: DIRECTIONS_CACHE_VERSION,
      rationales: nextCache,
    }),
  );

  console.log(`  Rationales: ${cached} cached, ${generated} generated, ${top.length - cached - generated} missing.`);
  return predictions;
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
  // Cache-busting key. Chat fetches this with cache:no-store and appends
  // ?v=<key> to the three asset URLs so a new build invalidates atomically.
  const versionKey = crypto
    .createHash('sha1')
    .update(String(savedChunks.length))
    .update(Buffer.from(savedEmbView.buffer, savedEmbView.byteOffset, savedEmbView.byteLength))
    .digest('hex')
    .slice(0, 12);
  await fs.writeFile(path.join(OUT_DIR, 'index-version.txt'), versionKey);

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

    // ── Directions: link prediction pipeline ──────────────────────────────
    // Runs after concept extraction succeeds. A failure here only skips the
    // Directions tab; concepts and RAG are unaffected.
    if (process.env.SKIP_DIRECTIONS !== '1') {
      try {
        console.log('Building research directions …');
        const dt0 = Date.now();
        const graph = buildCooccurrenceGraph(concepts, byChunk, savedChunks);
        console.log(`  Co-occurrence graph: ${graph.nodes.length} nodes, ${graph.edges.length} edges.`);

        const conceptEmbeddings = await embedConcepts(concepts, savedChunks, savedEmbView, conceptKey, cfg.embedDim, OUT_DIR);

        const predictions = scoreDirections(graph, conceptEmbeddings, concepts);
        console.log(`  Scored ${predictions.length} predicted directions.`);

        await generateRationales(predictions, savedChunks, concepts, conceptKey, OUT_DIR);

        const directionsOut = {
          generatedAt: new Date().toISOString(),
          graph: {
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
          },
          predictions,
        };
        await fs.writeFile(
          path.join(OUT_DIR, 'directions.json'),
          JSON.stringify(directionsOut),
        );
        const dms = Date.now() - dt0;
        console.log(`Directions: ${predictions.length} predictions written (${Math.round(dms / 1000)}s).`);
      } catch (dirErr) {
        console.error(`Directions pipeline failed: ${dirErr.message}`);
        console.error('Concepts and RAG artifacts are still saved.');
      }
    }
  } catch (err) {
    console.error(`Concept extraction failed: ${err.message}`);
    console.error('RAG artifacts are still saved; Concepts tab may be stale.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
