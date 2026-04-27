# Implementation Plan: RAG Chat for MaleenKidiwela.github.io/notes

This document is a build spec for Claude Code. Follow phases in order. Each phase has a concrete deliverable and acceptance check before moving on.

## 1. Goal

Add a chat panel to the existing GitHub Pages notes site that answers questions grounded in the markdown notes. Access is gated by a shared password. Anonymous visitors can still browse the site normally; the chat panel is the only thing behind the password.

## 2. Architecture

```
notes.md (in repo)
    |
    | git push
    v
GitHub Actions (build-time)
    - chunk markdown
    - call Gemini embedding API
    - emit search-index.json + embeddings.bin
    |
    v
GitHub Pages (static hosting)
    - serves site + index files + chat UI
    |
    | fetch
    v
Cloudflare Worker (proxy)
    - validates shared password
    - holds Gemini API key
    - streams Gemini 2.5 Flash output back to browser
```

No database, no user accounts, no per-IP tracking. One shared password (`quakehunter`) unlocks the chat for anyone who has it.

## 3. Prerequisites

Before Claude Code starts, confirm the following exist. If anything is missing, stop and ask the user.

1. GitHub repo `MaleenKidiwela/MaleenKidiwela.github.io` with a `/notes` directory of markdown files.
2. A Google AI Studio API key (free tier). Will be added to GitHub Actions secrets as `GEMINI_API_KEY` and to Cloudflare Worker secrets.
3. A Cloudflare account with Wrangler CLI installed locally. The Worker will be deployed to `*.workers.dev`.
4. Node.js 20+ available for the indexing script.

## 4. Repository structure (target end state)

```
MaleenKidiwela.github.io/
├── .github/
│   └── workflows/
│       └── build-index.yml          # builds index on every push to /notes
├── notes/                           # existing markdown notes (unchanged)
├── public/                          # generated build artifacts (gitignored)
│   ├── search-index.json
│   ├── embeddings.bin
│   └── chunks.json
├── scripts/
│   └── index-notes.mjs              # build-time indexer
├── chat/
│   ├── index.html                   # chat panel page
│   ├── chat.js                      # frontend logic
│   ├── chat.css                     # styling
│   └── fox.svg                      # pixel fox avatar
├── worker/
│   ├── src/
│   │   └── index.js                 # Cloudflare Worker
│   ├── wrangler.toml
│   └── package.json
└── package.json                     # for indexing deps
```

## 5. Phase 1: Build-time indexing

### Deliverable
A `scripts/index-notes.mjs` script and a GitHub Actions workflow that produce three files in `public/` whenever notes change.

### Tasks

1. Create `package.json` at repo root with these dev dependencies:
   - `gray-matter` (frontmatter parsing)
   - `remark`, `remark-parse`, `strip-markdown` (clean markdown to plain text)
   - `minisearch` (BM25 keyword index)
   - `@google/generative-ai` (Gemini SDK for embeddings)

2. Write `scripts/index-notes.mjs` with this behavior:
   - Walk `/notes` recursively, read every `.md` file.
   - For each file: extract frontmatter (title, tags, date), strip markdown to plain text body.
   - Chunk body into ~500-token windows with ~100-token overlap. Use a simple word-count heuristic (`words.length / 0.75 ≈ tokens`); do not pull in a tokenizer dependency.
   - For each chunk, store: `{ id, noteId, noteTitle, noteUrl, chunkIndex, text, headingPath }`.
   - Call `gemini-embedding-001` in batches of up to 100 chunks. Collect 768-dim Float32 vectors.
   - Write three outputs:
     - `public/search-index.json`: MiniSearch serialized index over `text` and `noteTitle`.
     - `public/chunks.json`: array of chunk metadata (no embeddings).
     - `public/embeddings.bin`: concatenated Float32Array of all embeddings, in chunk order.
   - Print summary: number of notes, chunks, total tokens, embedding API calls.

3. Create `.github/workflows/build-index.yml`:
   - Trigger on push to `main` affecting `notes/**` or `scripts/index-notes.mjs`.
   - Steps: checkout, setup Node 20, `npm ci`, run the indexer with `GEMINI_API_KEY` from secrets, commit the `public/` directory back to the repo (or upload as Pages artifact, depending on existing site setup).

### Acceptance check
After a push to `main`, the workflow runs green and `public/embeddings.bin` exists with size roughly equal to `(num_chunks * 768 * 4)` bytes.

## 6. Phase 2: Cloudflare Worker

### Deliverable
A deployed Worker at `https://notes-rag.<account>.workers.dev` that accepts POST requests with a password and a query, and streams a Gemini response.

### Tasks

1. In `worker/`, run `wrangler init` (or set up manually). Configure `wrangler.toml` with the Worker name and compatibility date.

2. Set two Worker secrets via `wrangler secret put`:
   - `GEMINI_API_KEY`: the Google AI Studio key.
   - `CHAT_PASSWORD`: the string `quakehunter`.

3. Write `worker/src/index.js` with two endpoints:

   **POST `/embed`**: takes `{ password, text }`. Validates password with constant-time comparison. Calls Gemini embedding API and returns `{ embedding: [...] }`.

   **POST `/chat`**: takes `{ password, query, context }` where `context` is a pre-assembled string of retrieved chunks. Validates password. Calls `gemini-2.5-flash:streamGenerateContent` with this system prompt:

   ```
   You are a research assistant for a marine geophysicist named Maleen.
   Use ONLY the notes provided in the context to answer.
   If the answer isn't in the context, say so clearly and suggest what
   related topics might be worth searching for instead.
   Cite specific notes by title when you reference them.
   Do not use em dashes in your writing.
   ```

   Stream the response back as Server-Sent Events. Set CORS to allow the GitHub Pages origin only.

4. Add basic safety: reject requests with `query` longer than 2000 chars or `context` longer than 20000 chars. Return 400 with a helpful message.

5. Deploy with `wrangler deploy`. Note the resulting URL; it goes into the frontend config.

### Acceptance check
`curl -X POST https://notes-rag.<account>.workers.dev/chat -d '{"password":"quakehunter","query":"test","context":"test note"}'` returns a streamed response. Wrong password returns 401.

## 7. Phase 3: Frontend chat UI

### Deliverable
A `/chat` page on the site with a password gate, chat interface, and pixel fox avatar.

### Tasks

1. **Password screen** (`chat/index.html` initial state):
   - Centered card with the fox avatar at the top.
   - Single password input, "Enter" button.
   - On submit, the entered password is held in memory only (no localStorage, no cookie). User retypes it on each visit. This is intentional given how casual the protection is; persisting it would make a forgotten laptop a real leak.
   - On wrong password (Worker returns 401), show inline error and clear input.
   - On correct password, swap to the chat interface.

2. **Chat interface** (`chat/chat.js`):
   - Message list, input box at the bottom, send button.
   - On send, run the retrieval pipeline:
     ```js
     async function ask(query) {
       // 1. embed the query via Worker
       const queryEmb = await fetchEmbedding(query);
       
       // 2. local hybrid retrieval
       const bm25 = miniSearch.search(query, { fuzzy: 0.2, prefix: true }).slice(0, 10);
       const semantic = cosineTopK(queryEmb, embeddings, 10);
       const fused = reciprocalRankFusion(bm25, semantic, 5);
       
       // 3. assemble context
       const context = fused.map(c => 
         `### ${c.noteTitle}\n${c.text}`
       ).join('\n\n---\n\n');
       
       // 4. stream answer from Worker
       streamChat(query, context, onToken, onDone);
     }
     ```
   - Display streamed tokens as they arrive.
   - Below each answer, show citation chips: clickable links to the notes that were in the retrieved context. Use `chunks.json` metadata to get note URLs.

3. **Asset loading on mount**:
   - Fetch `public/search-index.json` and call `MiniSearch.loadJSON()`.
   - Fetch `public/embeddings.bin` as `ArrayBuffer`, wrap in `Float32Array`. Reshape into `[numChunks][768]`.
   - Fetch `public/chunks.json` for chunk metadata.
   - Show a loading spinner while these load. They are cached by the browser after first visit, so subsequent loads are instant.

4. **Cosine similarity + RRF helpers** (in `chat.js`):
   ```js
   function cosineTopK(query, embeddings, k) {
     const scores = embeddings.map((emb, i) => ({
       id: i,
       score: dot(query, emb) // assumes both L2-normalized
     }));
     return scores.sort((a, b) => b.score - a.score).slice(0, k);
   }
   
   function reciprocalRankFusion(bm25, semantic, k, c = 60) {
     const scores = new Map();
     bm25.forEach((r, rank) => 
       scores.set(r.id, (scores.get(r.id) || 0) + 1 / (c + rank))
     );
     semantic.forEach((r, rank) => 
       scores.set(r.id, (scores.get(r.id) || 0) + 1 / (c + rank))
     );
     return [...scores.entries()]
       .sort((a, b) => b[1] - a[1])
       .slice(0, k)
       .map(([id]) => chunks[id]);
   }
   ```
   Important: when storing embeddings in Phase 1, L2-normalize them. Then cosine similarity reduces to a dot product, which is fast enough in plain JS for a few hundred chunks.

5. **Styling** (`chat/chat.css`):
   - Match the existing site's visual language (read existing CSS first).
   - Chat bubbles: user right-aligned, assistant left-aligned with the fox avatar.
   - Mobile-first: full-width on phones, max 720px on desktop.
   - System font stack, no external font loads.

### Acceptance check
- Wrong password rejected with clear message.
- Correct password reveals chat.
- Asking "what is the recent finding at Axial Seamount" returns a grounded answer streaming in within ~1s, with at least one citation chip.
- Refresh: password is required again. (Verifying no persistence.)

## 8. Phase 4: Pixel fox avatar

### Deliverable
An SVG pixel fox at `chat/fox.svg`, used as the assistant's avatar in chat and as the password screen logo.

### Spec
- 24x24 logical grid, rendered with `<rect>` blocks of 1x1 unit each. ViewBox `0 0 24 24`.
- Three colors only:
  - Rust orange: `#D85A30` (body, ear outer, head)
  - Cream: `#F5E6D3` (chin, inner ear, belly mark)
  - Charcoal: `#2C2C2A` (eyes, nose, ear tips)
- Style: friendly, alert. Forward-facing head, pointy ears, small visible muzzle, two dot eyes. Optional: a tail curl visible at the bottom corner.
- Keep it readable at 32px display size. No anti-aliasing tricks; let the pixels stay crisp via `image-rendering: pixelated` on the parent.
- Reference Claude's circular avatar size and presence; the fox should sit in the same visual slot.

### Implementation note
Don't try to one-shot the pixel art. Sketch the 24x24 grid on paper or in a comment block first, mapping each pixel to one of the three colors, then translate to `<rect>` elements. A simple block-by-block layout file makes future edits sane.

### Acceptance check
The avatar renders crisply at 32px and 64px in Chrome and Safari. No blur, no smoothed edges.

## 9. Phase 5: Wiring and deployment

### Tasks

1. Add a link to `/chat` from the main notes index page. Label it "Ask the notes" with the fox avatar inline.

2. Add a config block at the top of `chat.js`:
   ```js
   const CONFIG = {
     workerUrl: 'https://notes-rag.<account>.workers.dev',
     indexPath: '/public/search-index.json',
     embeddingsPath: '/public/embeddings.bin',
     chunksPath: '/public/chunks.json',
   };
   ```

3. Verify GitHub Pages serves `/public/` correctly. If the site uses Jekyll, add `public` to the `include` list in `_config.yml` so it isn't excluded.

4. Deploy: push to `main`. Confirm:
   - Action runs and produces fresh index files.
   - Site rebuilds with the chat page accessible.
   - End-to-end test: open `/chat` in incognito, enter password, ask a question, verify streamed answer with citations.

## 10. Acceptance criteria (full system)

- [ ] `/notes` browsing experience is unchanged for anonymous visitors.
- [ ] `/chat` shows password gate before revealing UI.
- [ ] Password `quakehunter` unlocks the chat. Wrong password fails clearly.
- [ ] Asking a question about Axial Seamount returns a relevant, grounded answer.
- [ ] At least one citation chip appears under each answer, linking to a real note.
- [ ] First token visible within ~1s on WiFi, full answer within ~3s.
- [ ] Works on iPhone Safari (test on actual device, not desktop emulation).
- [ ] Pushing a new note to `/notes` and merging triggers re-indexing automatically.
- [ ] Fox avatar renders crisply on retina displays.
- [ ] No em dashes appear in any generated answers (verified by checking the system prompt).

## 11. Out of scope (do not implement)

- User accounts, OAuth, per-user history.
- Server-side conversation memory; each query is independent.
- Voice input or output.
- Multilingual support.
- Admin panel for managing notes.
- Analytics or telemetry beyond Cloudflare's built-in Worker metrics.

## 12. Things Claude Code should ask the user about before starting

1. The current site framework. Is it Jekyll, plain HTML, or something else? This affects where `chat/` lives and how `public/` is served.
2. The Cloudflare account name (for the Worker URL) and whether a custom domain is wanted.
3. Whether the existing site has a CSS design system to match, or if `chat.css` should establish its own.
4. Confirmation that committing `public/` back to the repo from the Action is acceptable, vs. uploading as a Pages artifact.

## 13. Implementation order

1. Phase 1 (indexer + Action), verified end-to-end with a single test note.
2. Phase 2 (Worker), tested with `curl`.
3. Phase 4 (fox avatar) done in parallel; it's standalone.
4. Phase 3 (frontend), starting with the password gate and bare chat shell, then layering in retrieval, then streaming.
5. Phase 5 (wiring) and full acceptance pass.

Build incrementally. After each phase, demonstrate it working before moving on.
