// Frontend chat for the notes RAG site.
// Loads the prebuilt index from /public, embeds queries via the Worker,
// runs hybrid retrieval locally, and streams answers from Gemini through the Worker.

import MiniSearch from 'https://cdn.jsdelivr.net/npm/minisearch@7.1.0/+esm';

const CONFIG = {
  // EDIT this after `wrangler deploy`. Falls back to a clear error if left as placeholder.
  workerUrl: 'https://notes-rag.quakehunt.workers.dev',
  indexPath: '/public/search-index.json',
  embeddingsPath: '/public/embeddings.bin',
  chunksPath: '/public/chunks.json',
  embedDim: 768,
  bm25K: 14,
  semanticK: 14,
  fuseK: 6,
  neighborRadius: 1,
  maxContextWords: 2400,
};

const $ = (id) => document.getElementById(id);

let password = null;
let mini = null;
let chunks = null;
let embeddings = null; // Float32Array, length = chunks.length * embedDim
let assetsReady = false;
let noteIndex = null; // noteId -> sorted array of chunk ids by chunkIndex

function setStatus(text, mode = 'loading') {
  // mode: 'loading' | 'ready' | 'error'
  const el = $('status');
  const txt = $('statusText');
  if (txt) txt.textContent = text; else el.textContent = text;
  el.classList.remove('is-loading', 'is-ready', 'is-error');
  el.classList.add(`is-${mode}`);
}

function configLooksUnset() {
  return !CONFIG.workerUrl || CONFIG.workerUrl.includes('YOUR-ACCOUNT');
}

// ---------- Password gate ----------

$('pwForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const pw = $('pwInput').value;
  $('pwError').textContent = '';
  $('pwBtn').disabled = true;

  if (configLooksUnset()) {
    $('pwError').textContent = 'Worker URL not configured yet. Set CONFIG.workerUrl in chat.js after deploying the Worker.';
    $('pwBtn').disabled = false;
    return;
  }

  try {
    const r = await fetch(`${CONFIG.workerUrl}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password: pw, text: 'ping' }),
    });
    if (r.status === 401) {
      $('pwError').textContent = 'Wrong password.';
      $('pwInput').value = '';
      $('pwBtn').disabled = false;
      return;
    }
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      $('pwError').textContent = `Worker error (${r.status}). ${detail.slice(0, 200)}`;
      $('pwBtn').disabled = false;
      return;
    }
    password = pw;
    $('pwScreen').hidden = true;
    $('chatScreen').hidden = false;
    await loadAssets();
  } catch (err) {
    $('pwError').textContent = `Network error: ${err.message}`;
    $('pwBtn').disabled = false;
  }
});

// ---------- Asset loading ----------

async function loadAssets() {
  setStatus('Loading index…', 'loading');
  try {
    const [idxText, chunkData, embBuf] = await Promise.all([
      fetchText(CONFIG.indexPath, 'search-index.json'),
      fetchJson(CONFIG.chunksPath, 'chunks.json'),
      fetchBuffer(CONFIG.embeddingsPath, 'embeddings.bin'),
    ]);
    mini = MiniSearch.loadJSON(idxText, {
      fields: ['text', 'noteTitle', 'sectionTitle', 'project'],
      storeFields: ['noteId', 'noteTitle', 'noteUrl', 'chunkIndex', 'sectionTitle', 'sectionPath', 'project', 'dateFromFilename', 'filePath'],
      idField: 'id',
    });
    chunks = chunkData;
    embeddings = new Float32Array(embBuf);
    if (embeddings.length !== chunks.length * CONFIG.embedDim) {
      throw new Error(`embedding/chunk mismatch (${embeddings.length} vs ${chunks.length * CONFIG.embedDim})`);
    }
    noteIndex = buildNoteIndex(chunks);
    assetsReady = true;
    setStatus(`Ready · ${chunks.length} chunks · ${countNotes()} notes`, 'ready');
  } catch (e) {
    setStatus(
      `Index not available: ${e.message}. The chat will work after the GitHub Action has built /public.`,
      'error',
    );
  }
}

function countNotes() {
  const s = new Set();
  for (const c of chunks) s.add(c.noteId);
  return s.size;
}

async function fetchText(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} ${r.status}`);
  return r.text();
}
async function fetchJson(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} ${r.status}`);
  return r.json();
}
async function fetchBuffer(url, label) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${label} ${r.status}`);
  return r.arrayBuffer();
}

// ---------- Chat ----------

// Prompt-suggestion chips populate the input.
document.querySelectorAll('.suggestion').forEach((btn) => {
  btn.addEventListener('click', () => {
    const q = btn.dataset.q || btn.textContent.trim();
    const input = $('qInput');
    input.value = q;
    input.focus();
    $('chatForm').requestSubmit();
  });
});

function dismissEmptyState() {
  const el = $('emptyState');
  if (el && !el.hidden) el.hidden = true;
}

$('chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('qInput').value.trim();
  if (!q) return;
  $('qInput').value = '';
  dismissEmptyState();
  appendUser(q);
  if (!assetsReady) {
    appendAssistant().textEl.textContent = 'Index is not loaded yet. Try again once the status bar says Ready.';
    return;
  }
  $('qBtn').disabled = true;
  try {
    await ask(q);
  } finally {
    $('qBtn').disabled = false;
    $('qInput').focus();
  }
});

function appendUser(text) {
  const div = document.createElement('div');
  div.className = 'msg msg-user';
  div.textContent = text;
  $('messages').appendChild(div);
  scrollDown();
}

function appendAssistant() {
  const wrap = document.createElement('div');
  wrap.className = 'msg msg-assistant thinking';
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.setAttribute('role', 'img');
  avatar.setAttribute('aria-label', 'fox');
  const body = document.createElement('div');
  body.className = 'body';
  const textEl = document.createElement('div');
  textEl.className = 'text';
  body.appendChild(textEl);
  const cites = document.createElement('div');
  cites.className = 'citations';
  body.appendChild(cites);
  wrap.appendChild(avatar);
  wrap.appendChild(body);
  $('messages').appendChild(wrap);
  scrollDown();
  return { textEl, cites, wrap };
}

function scrollDown() {
  const m = $('messages');
  m.scrollTop = m.scrollHeight;
}

async function ask(query) {
  const { textEl, cites, wrap } = appendAssistant();
  textEl.textContent = '…';
  const stopThinking = () => wrap.classList.remove('thinking');

  // 1. embed query
  let qEmb;
  try {
    const r = await fetch(`${CONFIG.workerUrl}/embed`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, text: query }),
    });
    if (r.status === 401) {
      password = null;
      $('chatScreen').hidden = true;
      $('pwScreen').hidden = false;
      $('pwBtn').disabled = false;
      $('pwError').textContent = 'Session expired. Re-enter the password.';
      stopThinking();
      return;
    }
    if (!r.ok) throw new Error(`embed ${r.status}`);
    qEmb = (await r.json()).embedding;
  } catch (e) {
    textEl.textContent = `Embedding error: ${e.message}`;
    stopThinking();
    return;
  }
  const qVec = l2norm(new Float32Array(qEmb));

  // 2. hybrid retrieval (BM25 + semantic, fused via RRF)
  const bm25 = mini
    .search(query, {
      fuzzy: 0.2,
      prefix: true,
      boost: { noteTitle: 2, sectionTitle: 1.5, project: 1.2 },
    })
    .slice(0, CONFIG.bm25K)
    .map((r) => ({ id: r.id }));
  const semantic = cosineTopK(qVec, CONFIG.semanticK);
  const fused = rrf(bm25, semantic, CONFIG.fuseK);

  if (fused.length === 0) {
    textEl.textContent = 'No relevant notes found for that query.';
    stopThinking();
    return;
  }

  // 3. neighbor expansion + budget-packed context
  const { context, included } = packContext(fused, CONFIG.neighborRadius, CONFIG.maxContextWords);

  // 4. citations (dedup by note + section, labelled Note · Section)
  cites.innerHTML = '';
  const seen = new Set();
  for (const c of fused) {
    const key = citationKey(c);
    if (seen.has(key)) continue;
    seen.add(key);
    const a = document.createElement('a');
    a.className = 'chip';
    a.href = c.noteUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = formatCitation(c);
    cites.appendChild(a);
  }
  void included; // included is reserved for future debug surfacing

  // 5. stream
  textEl.textContent = '';
  let gotText = false;
  let lastFinish = null;
  let upstreamErr = null;
  try {
    const r = await fetch(`${CONFIG.workerUrl}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password, query, context }),
    });
    if (!r.ok || !r.body) {
      const t = await r.text().catch(() => '');
      textEl.textContent = `Chat error (${r.status}): ${t.slice(0, 300)}`;
      return;
    }
    const reader = r.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    let raw = '';
    const handleLine = (line) => {
      const m = line.match(/^data:\s?(.*)$/);
      if (!m) return;
      const payload = m[1].trim();
      if (!payload || payload === '[DONE]') return;
      try {
        const j = JSON.parse(payload);
        if (j.error) { upstreamErr = j.error; return; }
        const cand = j?.candidates?.[0];
        const parts = cand?.content?.parts || [];
        for (const p of parts) {
          if (typeof p.text === 'string' && p.text) {
            textEl.textContent += p.text;
            gotText = true;
            scrollDown();
          }
        }
        if (cand?.finishReason) lastFinish = cand.finishReason;
        if (j?.promptFeedback?.blockReason) lastFinish = `blocked: ${j.promptFeedback.blockReason}`;
      } catch {
        // ignore unparseable line
      }
    };
    const flushEvents = () => {
      // Normalize CRLF, then split on blank line.
      buf = buf.replace(/\r\n/g, '\n');
      let idx;
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const event = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        for (const line of event.split('\n')) handleLine(line);
      }
    };
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = dec.decode(value, { stream: true });
      raw += chunk;
      buf += chunk;
      flushEvents();
    }
    // Process anything left in the buffer (no trailing blank line).
    if (buf.trim()) {
      for (const line of buf.split('\n')) handleLine(line);
      buf = '';
    }
    if (!gotText) {
      console.log('[chat] raw stream (', raw.length, 'bytes):', raw);
      const detail = upstreamErr
        ? JSON.stringify(upstreamErr)
        : (lastFinish || `no text — ${raw.length} raw bytes (see console)`);
      textEl.textContent = `(empty response — ${detail})`;
    }
  } catch (e) {
    textEl.textContent += `\n[stream error: ${e.message}]`;
  } finally {
    stopThinking();
  }
}

// ---------- Retrieval helpers ----------

function buildNoteIndex(chunkArr) {
  // For each note, collect chunk ids in sectionTitle then chunkIndex order so
  // we can find same-section neighbors quickly.
  const map = new Map();
  for (let i = 0; i < chunkArr.length; i++) {
    const c = chunkArr[i];
    if (!map.has(c.noteId)) map.set(c.noteId, []);
    map.get(c.noteId).push(i);
  }
  // Within each note, ids are already in document order from the indexer,
  // so chunkIndex is monotonically increasing. No re-sort needed.
  return map;
}

function citationKey(c) {
  const sec = c.sectionTitle && c.sectionTitle !== c.noteTitle ? c.sectionTitle : '';
  return `${c.noteId}|${sec}`;
}

function formatCitation(c) {
  if (c.sectionTitle && c.sectionTitle !== c.noteTitle) {
    return `${c.noteTitle} · ${c.sectionTitle}`;
  }
  return c.noteTitle;
}

function sectionHeading(c) {
  const path = Array.isArray(c.sectionPath) && c.sectionPath.length
    ? c.sectionPath.join(' / ')
    : c.sectionTitle || c.noteTitle;
  return `### ${c.noteTitle} · ${path}`;
}

function neighborsOf(c) {
  // Return the chunk ids in the same note + same top-level section (shared
  // first heading) within ±neighborRadius of c.chunkIndex.
  if (!noteIndex) return [];
  const ids = noteIndex.get(c.noteId) || [];
  const root = (Array.isArray(c.sectionPath) && c.sectionPath[0]) || c.sectionTitle || '';
  const out = [];
  for (const id of ids) {
    const n = chunks[id];
    if (!n || id === c.id) continue;
    const nRoot = (Array.isArray(n.sectionPath) && n.sectionPath[0]) || n.sectionTitle || '';
    if (nRoot !== root) continue;
    if (Math.abs((n.chunkIndex ?? 0) - (c.chunkIndex ?? 0)) <= CONFIG.neighborRadius) {
      out.push(id);
    }
  }
  return out;
}

function wordsIn(text) {
  return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function packContext(fused, neighborRadius, maxWords) {
  // Greedy pack: for each fused chunk in fusion order, attempt to add a
  // section-coherent block (chunk + its same-section neighbors). If the
  // block doesn't fit, fall back to the chunk alone. Stop when the budget
  // is exhausted. Dedup chunks across blocks.
  const seenChunks = new Set();
  const blocks = [];
  let used = 0;

  for (const c of fused) {
    if (seenChunks.has(c.id)) continue;
    const neighborIds = neighborRadius > 0 ? neighborsOf(c) : [];
    const blockIds = [...neighborIds.filter((id) => !seenChunks.has(id)), c.id]
      .map((id) => ({ id, idx: chunks[id]?.chunkIndex ?? 0 }))
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.id);
    const blockChunks = blockIds.map((id) => chunks[id]).filter(Boolean);
    const blockWords = blockChunks.reduce((s, ch) => s + wordsIn(ch.text), 0);

    if (used + blockWords <= maxWords) {
      blockChunks.forEach((ch) => seenChunks.add(ch.id));
      blocks.push({ anchor: c, chunks: blockChunks });
      used += blockWords;
      continue;
    }
    // Block too big: try the anchor alone.
    const anchorWords = wordsIn(c.text);
    if (used + anchorWords <= maxWords) {
      seenChunks.add(c.id);
      blocks.push({ anchor: c, chunks: [c] });
      used += anchorWords;
      continue;
    }
    // No room left at all; stop.
    break;
  }

  const context = blocks
    .map((b) => `${sectionHeading(b.anchor)}\n${b.chunks.map((ch) => ch.text).join('\n\n')}`)
    .join('\n\n---\n\n');

  return { context, included: blocks, words: used };
}

// ---------- Math ----------

function l2norm(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  s = Math.sqrt(s) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / s;
  return out;
}

function cosineTopK(qVec, k) {
  const D = CONFIG.embedDim;
  const N = chunks.length;
  const scored = new Array(N);
  for (let i = 0; i < N; i++) {
    let s = 0;
    const off = i * D;
    for (let d = 0; d < D; d++) s += qVec[d] * embeddings[off + d];
    scored[i] = { id: i, score: s };
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

function rrf(bm25, semantic, k, c = 60) {
  const map = new Map();
  bm25.forEach((r, rank) => map.set(r.id, (map.get(r.id) || 0) + 1 / (c + rank)));
  semantic.forEach((r, rank) => map.set(r.id, (map.get(r.id) || 0) + 1 / (c + rank)));
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id]) => chunks[id])
    .filter(Boolean);
}
