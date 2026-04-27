#!/usr/bin/env node
// Build-time RAG indexer for Maleen's notes site.
// Reads markdown under /notes/{COSZO,BransfieldEQ,Earthnote}/**, chunks each note,
// embeds chunks via Gemini, and writes search-index.json + chunks.json + embeddings.bin
// into /public.

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { remark } from 'remark';
import strip from 'strip-markdown';
import MiniSearch from 'minisearch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const NOTES_DIR = path.join(ROOT, 'notes');
const OUT_DIR = path.join(ROOT, 'public');

const PROJECT_FOLDERS = ['COSZO', 'BransfieldEQ', 'Earthnote'];
const EMBED_MODEL = 'gemini-embedding-001';
const EMBED_DIM = 768;
const CHUNK_WORDS = 375;     // ~500 tokens at 0.75 words/token
const OVERLAP_WORDS = 75;    // ~100 tokens
const BATCH_SIZE = 100;

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

function chunkWords(text) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  if (!words.length) return chunks;
  if (words.length <= CHUNK_WORDS) {
    chunks.push(words.join(' '));
    return chunks;
  }
  const step = CHUNK_WORDS - OVERLAP_WORDS;
  for (let i = 0; i < words.length; i += step) {
    const piece = words.slice(i, i + CHUNK_WORDS).join(' ');
    chunks.push(piece);
    if (i + CHUNK_WORDS >= words.length) break;
  }
  return chunks;
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

async function embedBatch(texts, apiKey) {
  const body = {
    requests: texts.map((t) => ({
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text: t }] },
      outputDimensionality: EMBED_DIM,
      taskType: 'RETRIEVAL_DOCUMENT',
    })),
  };
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Embed batch failed (${res.status}): ${txt.slice(0, 500)}`);
  }
  const j = await res.json();
  return j.embeddings.map((e) => e.values);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('GEMINI_API_KEY not set; aborting.');
    process.exit(1);
  }

  const files = [];
  for (const folder of PROJECT_FOLDERS) {
    const found = await walk(path.join(NOTES_DIR, folder));
    files.push(...found);
  }
  files.sort();
  console.log(`Found ${files.length} markdown files across ${PROJECT_FOLDERS.join(', ')}.`);

  const stripper = remark().use(strip);
  const chunks = [];
  let totalWords = 0;

  for (const file of files) {
    const raw = await fs.readFile(file, 'utf8');
    const { data, content } = matter(raw);
    const plain = String(await stripper.process(content)).replace(/\s+/g, ' ').trim();
    if (!plain) continue;
    const rel = path.relative(ROOT, file);
    const noteId = rel;
    const noteTitle = data.title || path.basename(file, path.extname(file));
    const noteUrl = urlForRelPath(rel);
    const pieces = chunkWords(plain);
    pieces.forEach((text, idx) => {
      totalWords += text.split(/\s+/).length;
      chunks.push({
        id: chunks.length,
        noteId,
        noteTitle,
        noteUrl,
        chunkIndex: idx,
        text,
      });
    });
  }

  console.log(`Chunked into ${chunks.length} pieces (~${Math.round(totalWords / 0.75)} tokens).`);

  await fs.mkdir(OUT_DIR, { recursive: true });

  if (chunks.length === 0) {
    console.warn('No content to index. Writing empty artifacts.');
    const mini = new MiniSearch({
      fields: ['text', 'noteTitle'],
      storeFields: ['noteTitle', 'noteUrl', 'chunkIndex', 'noteId'],
      idField: 'id',
    });
    await fs.writeFile(path.join(OUT_DIR, 'search-index.json'), JSON.stringify(mini));
    await fs.writeFile(path.join(OUT_DIR, 'chunks.json'), '[]');
    await fs.writeFile(path.join(OUT_DIR, 'embeddings.bin'), Buffer.alloc(0));
    return;
  }

  const embeddings = new Float32Array(chunks.length * EMBED_DIM);
  let calls = 0;
  for (let b = 0; b < chunks.length; b += BATCH_SIZE) {
    const batch = chunks.slice(b, b + BATCH_SIZE);
    const vectors = await embedBatch(batch.map((c) => c.text), apiKey);
    calls++;
    vectors.forEach((vec, i) => {
      const norm = l2norm(vec);
      embeddings.set(norm, (b + i) * EMBED_DIM);
    });
    console.log(`  embedded ${Math.min(b + BATCH_SIZE, chunks.length)}/${chunks.length}`);
  }

  const mini = new MiniSearch({
    fields: ['text', 'noteTitle'],
    storeFields: ['noteTitle', 'noteUrl', 'chunkIndex', 'noteId'],
    idField: 'id',
  });
  mini.addAll(chunks);

  await fs.writeFile(path.join(OUT_DIR, 'search-index.json'), JSON.stringify(mini));
  await fs.writeFile(path.join(OUT_DIR, 'chunks.json'), JSON.stringify(chunks));
  await fs.writeFile(
    path.join(OUT_DIR, 'embeddings.bin'),
    Buffer.from(embeddings.buffer, embeddings.byteOffset, embeddings.byteLength),
  );

  console.log(
    `Done. notes=${files.length} chunks=${chunks.length} ~tokens=${Math.round(totalWords / 0.75)} embed_calls=${calls} bytes=${chunks.length * EMBED_DIM * 4}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
