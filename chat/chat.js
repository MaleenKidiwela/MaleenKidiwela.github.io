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
  bm25K: 10,
  semanticK: 10,
  fuseK: 5,
};

const $ = (id) => document.getElementById(id);

let password = null;
let mini = null;
let chunks = null;
let embeddings = null; // Float32Array, length = chunks.length * embedDim
let assetsReady = false;

function setStatus(text, isError = false) {
  const el = $('status');
  el.textContent = text;
  el.classList.toggle('error', !!isError);
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
  setStatus('Loading index…');
  try {
    const [idxText, chunkData, embBuf] = await Promise.all([
      fetchText(CONFIG.indexPath, 'search-index.json'),
      fetchJson(CONFIG.chunksPath, 'chunks.json'),
      fetchBuffer(CONFIG.embeddingsPath, 'embeddings.bin'),
    ]);
    mini = MiniSearch.loadJSON(idxText, {
      fields: ['text', 'noteTitle'],
      storeFields: ['noteTitle', 'noteUrl', 'chunkIndex', 'noteId'],
      idField: 'id',
    });
    chunks = chunkData;
    embeddings = new Float32Array(embBuf);
    if (embeddings.length !== chunks.length * CONFIG.embedDim) {
      throw new Error(`embedding/chunk mismatch (${embeddings.length} vs ${chunks.length * CONFIG.embedDim})`);
    }
    assetsReady = true;
    setStatus(`Ready. ${chunks.length} chunks across ${countNotes()} notes.`);
  } catch (e) {
    setStatus(
      `Index not available: ${e.message}. The chat will work after the GitHub Action has built /public.`,
      true,
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

$('chatForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('qInput').value.trim();
  if (!q) return;
  $('qInput').value = '';
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
  wrap.className = 'msg msg-assistant';
  const avatar = document.createElement('img');
  avatar.src = 'fox.svg';
  avatar.className = 'avatar';
  avatar.alt = '';
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
  return { textEl, cites };
}

function scrollDown() {
  const m = $('messages');
  m.scrollTop = m.scrollHeight;
}

async function ask(query) {
  const { textEl, cites } = appendAssistant();
  textEl.textContent = '…';

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
      return;
    }
    if (!r.ok) throw new Error(`embed ${r.status}`);
    qEmb = (await r.json()).embedding;
  } catch (e) {
    textEl.textContent = `Embedding error: ${e.message}`;
    return;
  }
  const qVec = l2norm(new Float32Array(qEmb));

  // 2. hybrid retrieval
  const bm25 = mini.search(query, { fuzzy: 0.2, prefix: true })
    .slice(0, CONFIG.bm25K)
    .map((r) => ({ id: r.id }));
  const semantic = cosineTopK(qVec, CONFIG.semanticK);
  const fused = rrf(bm25, semantic, CONFIG.fuseK);

  if (fused.length === 0) {
    textEl.textContent = 'No relevant notes found for that query.';
    return;
  }

  // 3. context
  const context = fused
    .map((c) => `### ${c.noteTitle}\n${c.text}`)
    .join('\n\n---\n\n');

  // 4. citations (dedup by note)
  cites.innerHTML = '';
  const seen = new Set();
  for (const c of fused) {
    if (seen.has(c.noteId)) continue;
    seen.add(c.noteId);
    const a = document.createElement('a');
    a.className = 'chip';
    a.href = c.noteUrl;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = c.noteTitle;
    cites.appendChild(a);
  }

  // 5. stream
  textEl.textContent = '';
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
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n\n')) !== -1) {
        const event = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        for (const line of event.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;
          try {
            const j = JSON.parse(payload);
            const parts = j?.candidates?.[0]?.content?.parts || [];
            for (const p of parts) {
              if (typeof p.text === 'string' && p.text) {
                textEl.textContent += p.text;
                scrollDown();
              }
            }
          } catch {
            // ignore unparseable line
          }
        }
      }
    }
  } catch (e) {
    textEl.textContent += `\n[stream error: ${e.message}]`;
  }
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
