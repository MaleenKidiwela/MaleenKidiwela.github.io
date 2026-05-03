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
  maxContextChars: 17000, // worker hard caps at 20000; leave headroom for headings/preamble
  hardContextCap: 19500,
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

  // Short-circuit greetings, meta-questions, and other small talk so they
  // don't get sent through retrieval and refused as out-of-context.
  const reply = handleSmallTalk(q);
  if (reply) {
    appendAssistant().textEl.textContent = reply;
    $('qInput').focus();
    return;
  }

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

function handleSmallTalk(qRaw) {
  // Strip trailing punctuation/whitespace, lowercase, then require the WHOLE
  // input to match — substrings like "what do you know about X" must NOT be
  // treated as small talk.
  const q = qRaw.toLowerCase().replace(/[\s!?.,]+$/g, '').trim();
  if (!q || q.length > 60) return null;

  const greetings = /^(hi+|hello+|hey+|yo|sup|hiya|howdy|good (morning|afternoon|evening|night)|hola|namaste|ayubowan)$/;
  const thanks    = /^(thanks?|thank you|thx|ty|cheers)$/;
  const farewells = /^(bye|goodbye|see ya|later|cya|peace)$/;
  const meta      = /^(who are you|what are you|what can you do|how do you work|what is this|help|how (do i|to) use( this)?)$/;

  if (greetings.test(q)) {
    return 'Hi. I answer questions grounded in the research notes — Cascadia, Bransfield earthquakes, and Earthnote. Try one of the suggestions, or ask something specific (a place, a date, a finding).';
  }
  if (thanks.test(q)) return 'Anytime.';
  if (farewells.test(q)) return 'See you.';
  if (meta.test(q)) {
    return 'I search the working vault — Cascadia, Bransfield earthquakes, Earthnote — and answer with citations back to the source notes. Ask about a place, a date, a measurement, or a finding. I will not guess outside the notes.';
  }
  return null;
}

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
  const fusedRRF = rrf(bm25, semantic, CONFIG.fuseK);

  // Date-aware retrieval: if the query references "today/yesterday/05-01-26",
  // resolve to dates and prepend all chunks tagged with those dates so the
  // packer is guaranteed to surface them ahead of merely-similar chunks.
  const today = todayISO();
  const intentDates = extractDateIntent(query, today);
  const dateSeed = chunksMatchingDates(intentDates);

  const seenIds = new Set();
  const fused = [];
  for (const c of dateSeed) { if (!seenIds.has(c.id)) { fused.push(c); seenIds.add(c.id); } }
  for (const c of fusedRRF) { if (!seenIds.has(c.id)) { fused.push(c); seenIds.add(c.id); } }

  if (fused.length === 0) {
    textEl.textContent = intentDates.size
      ? `No notes found for ${[...intentDates].join(', ')}.`
      : 'No relevant notes found for that query.';
    stopThinking();
    return;
  }

  // 3. neighbor expansion + budget-packed context, with a date-aware preamble
  let { context, included } = packContext(fused, CONFIG.neighborRadius, CONFIG.maxContextChars, today);
  // Hard safety cap so we never trip the worker's 20K-char limit.
  if (context.length > CONFIG.hardContextCap) {
    context = context.slice(0, CONFIG.hardContextCap);
  }

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

// ---------- Date helpers ----------

function todayISO() {
  // Local-date YYYY-MM-DD, since note filenames are local-day-stamped.
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function shiftDate(iso, deltaDays) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + deltaDays);
  const yyyy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

const MONTHS = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

function pad2(n) { return String(n).padStart(2, '0'); }

function extractDateIntent(query, today) {
  // Returns a Set of YYYY-MM-DD strings the user appears to be asking about.
  const out = new Set();
  const lower = query.toLowerCase();
  const padded = ` ${lower} `;
  const todayYear = parseInt(today.slice(0, 4), 10);

  if (/\btoday\b/.test(padded)) out.add(today);
  if (/\byesterday\b/.test(padded)) out.add(shiftDate(today, -1));
  if (/\bday before yesterday\b/.test(padded)) out.add(shiftDate(today, -2));

  const nDaysAgo = padded.match(/\b(\d{1,3})\s+days?\s+ago\b/);
  if (nDaysAgo) out.add(shiftDate(today, -parseInt(nDaysAgo[1], 10)));

  // Explicit ISO: 2026-05-01
  for (const m of query.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) {
    out.add(`${m[1]}-${m[2]}-${m[3]}`);
  }
  // US-style MM-DD-YY: 05-01-26 → 2026-05-01
  for (const m of query.matchAll(/\b(\d{2})-(\d{2})-(\d{2})\b/g)) {
    const mm = parseInt(m[1], 10), dd = parseInt(m[2], 10);
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      out.add(`20${m[3]}-${m[1]}-${m[2]}`);
    }
  }
  // MM/DD/YY or MM/DD/YYYY
  for (const m of query.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    const mm = parseInt(m[1], 10), dd = parseInt(m[2], 10);
    let yyyy = m[3];
    if (yyyy.length === 2) yyyy = '20' + yyyy;
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      out.add(`${yyyy}-${pad2(mm)}-${pad2(dd)}`);
    }
  }

  // Month name then day: "April 19", "Apr 19th", "April 19, 2026", "April 19 2026"
  const reMonthDay = new RegExp(`\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[,\\s]+(\\d{2,4}))?\\b`, 'gi');
  for (const m of lower.matchAll(reMonthDay)) {
    const mm = MONTHS[m[1]];
    const dd = parseInt(m[2], 10);
    let yyyy = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : todayYear;
    if (mm && dd >= 1 && dd <= 31) out.add(`${yyyy}-${pad2(mm)}-${pad2(dd)}`);
  }

  // Day then month: "19 April", "19th April", "19th of April", "19 April 2026"
  const reDayMonth = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}(?:[,\\s]+(\\d{2,4}))?\\b`, 'gi');
  for (const m of lower.matchAll(reDayMonth)) {
    const dd = parseInt(m[1], 10);
    const mm = MONTHS[m[2]];
    let yyyy = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10)) : todayYear;
    if (mm && dd >= 1 && dd <= 31) out.add(`${yyyy}-${pad2(mm)}-${pad2(dd)}`);
  }

  return out;
}

function chunksMatchingDates(dateSet) {
  if (!dateSet || !dateSet.size || !chunks) return [];
  const out = [];
  for (const c of chunks) {
    if (c.dateFromFilename && dateSet.has(c.dateFromFilename)) out.push(c);
  }
  return out;
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
  const date = c.dateFromFilename ? ` · ${c.dateFromFilename}` : '';
  return `### ${c.noteTitle} · ${path}${date}`;
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

function blockSerialized(anchor, blockChunks) {
  return `${sectionHeading(anchor)}\n${blockChunks.map((ch) => ch.text).join('\n\n')}`;
}

function packContext(fused, neighborRadius, maxChars, today) {
  // Char-budgeted greedy pack: each fused chunk attempts to add a
  // section-coherent block (chunk + same-section neighbors). If the
  // block doesn't fit, fall back to the chunk alone. Stop when the
  // running total of *serialized* chars (including headings + separators)
  // would exceed the budget.
  const SEP = '\n\n---\n\n';
  const preamble = today
    ? `Today's date is ${today}. Each section below is headed with "Note · Section · YYYY-MM-DD" when the source note has a date in its filename. When the user asks about "today", "yesterday", or other relative dates, resolve them against ${today} and use those date headers to identify the relevant entries.${SEP}`
    : '';

  const seenChunks = new Set();
  const blocks = [];
  let used = preamble.length;

  for (const c of fused) {
    if (seenChunks.has(c.id)) continue;
    const neighborIds = neighborRadius > 0 ? neighborsOf(c) : [];
    const blockIds = [...neighborIds.filter((id) => !seenChunks.has(id)), c.id]
      .map((id) => ({ id, idx: chunks[id]?.chunkIndex ?? 0 }))
      .sort((a, b) => a.idx - b.idx)
      .map((x) => x.id);
    const blockChunks = blockIds.map((id) => chunks[id]).filter(Boolean);
    const sepCost = blocks.length === 0 ? 0 : SEP.length;

    const fullSerialized = blockSerialized(c, blockChunks);
    if (used + sepCost + fullSerialized.length <= maxChars) {
      blockChunks.forEach((ch) => seenChunks.add(ch.id));
      blocks.push({ anchor: c, chunks: blockChunks });
      used += sepCost + fullSerialized.length;
      continue;
    }
    // Block too big: try the anchor alone.
    const anchorSerialized = blockSerialized(c, [c]);
    if (used + sepCost + anchorSerialized.length <= maxChars) {
      seenChunks.add(c.id);
      blocks.push({ anchor: c, chunks: [c] });
      used += sepCost + anchorSerialized.length;
      continue;
    }
    // No room left at all; stop.
    break;
  }

  const body = blocks
    .map((b) => blockSerialized(b.anchor, b.chunks))
    .join(SEP);

  return { context: preamble + body, included: blocks, chars: used };
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
