# owl.md — Design Specification

**Date:** 2026-04-03  
**Status:** Approved  
**Project:** `/home/device/Documents/owl.md`

---

## 1. Product Summary

owl.md is a local-first desktop knowledge workspace that combines Obsidian-style markdown vaults with Notion-style hierarchy, an infinite whiteboard canvas, mind map support, and grounded local LLM capabilities via Ollama. The app is designed for power users who want full data ownership, offline reliability, and AI that works against their own notes without sending anything to the cloud.

**Core principles:**
- Local-first by default — vault on disk, user owns the data
- Notes remain human-readable without the app
- `.owl/` metadata directory is derived state — deletable and fully rebuildable
- AI augments notes; it does not replace them and is never required for core use
- Fast, deterministic, inspectable behavior throughout

---

## 2. Architecture

### 2.1 Process Model

```
┌─────────────────────────────────────────────────────────┐
│  Renderer Process  (React 18 + TypeScript)               │
│  Zustand stores · TipTap 2 · React Flow 11 · Components  │
│                     ↕ contextBridge IPC                  │
├─────────────────────────────────────────────────────────┤
│  Main Process  (Node.js / Electron 30)                   │
│  VaultService · DatabaseService · IndexService           │
│  WatcherService · EmbeddingService · RagService          │
│  AIService · BackupService                               │
│                     ↕ better-sqlite3 / chokidar          │
├─────────────────────────────────────────────────────────┤
│  On-Disk Vault                                           │
│  notes/**/*.md · attachments/ · .owl/db.sqlite           │
│  .owl/vectors.usearch · .owl/config.json                 │
└─────────────────────────────────────────────────────────┘
```

The **preload script** exposes a typed `window.owl` IPC bridge via Electron's `contextBridge`. The renderer never touches Node.js APIs directly. Every cross-process call is a named, typed RPC (e.g., `window.owl.notes.save(note)`, `window.owl.search.query(q)`).

### 2.2 Main Process Services

| Service | Responsibility |
|---|---|
| `VaultService` | File CRUD, path resolution, vault open/create |
| `DatabaseService` | SQLite connection, migrations, schema bootstrap |
| `IndexService` | FTS5 index writes/reads, backlink graph maintenance |
| `WatcherService` | chokidar FS watch → triggers incremental reindex |
| `EmbeddingService` | Ollama embed calls + usearch index management |
| `RagService` | Chunk retrieval, context assembly, citation references |
| `AIService` | Ollama chat completions, prompt construction |
| `BackupService` | Google Drive OAuth, atomic snapshot bundling |

### 2.3 Key Invariants

- `notes/**/*.md` are the source of truth — never the SQLite database
- `content_hash` (sha256) on the `notes` row enables efficient incremental reindex: skip unchanged files on watcher events
- SQLite is the only process writing to `db.sqlite` — no concurrent writers
- On corrupted or missing `.owl/`, a full vault scan rebuilds the database from scratch
- AI panel shows a graceful "Ollama not connected" state; all P1–P3 features work without Ollama running

---

## 3. Tech Stack

| Concern | Choice | Justification |
|---|---|---|
| Desktop shell | Electron 30 | Proven for knowledge apps (Obsidian, VS Code); full Node.js ecosystem; single TypeScript stack |
| Frontend | React 18 + TypeScript | |
| Editor | TipTap 2 (ProseMirror) | Block model native; slash commands, drag-and-drop block reorder, wiki links, callouts available as extensions; TipTap nodes are React components |
| State management | Zustand 4 | Lighter than Redux Toolkit; no action boilerplate; clean domain slices (vault, editor, canvas, search, ai) |
| Canvas | React Flow 11 | Nodes are React components — live TipTap editors embed directly inside canvas cards; built-in pan/zoom, minimap, edge routing, grouping |
| Database | better-sqlite3 + FTS5 | Single file, synchronous API, no separate process; FTS5 built into SQLite for full-text search |
| FS watcher | chokidar 3 | Cross-platform; polling fallback for Linux filesystems that miss inotify events |
| Vector index | usearch (HNSW) | Tiny Node.js binding; single binary file per vault; no sidecar process |
| AI runtime | Ollama local API | Local only; nomic-embed-text for embeddings; user-chosen model for generation |
| Build | electron-vite + Vite 5 | Fast HMR in development; separate main/preload/renderer bundles |
| Styling | CSS modules + custom glass CSS | Aurora glass design requires custom `backdrop-filter` and gradient control |
| Backup | Google Drive API + OAuth2 | Optional; user-triggered or scheduled; local vault always authoritative |

**Rejected alternatives:**
- Tauri: smaller binary but Rust split-stack slows iteration; SQLite plugin less mature; system WebView inconsistencies on Windows
- CodeMirror 6: better raw markdown fidelity but block IDs, slash commands, and drag-and-drop must all be custom-built
- Redux Toolkit: more boilerplate than needed for this app shape
- tldraw: whiteboard-focused, not node-graph-focused; BSL 1.1 license
- Tantivy: faster at 100k+ notes but requires native addon or sidecar; FTS5 is sufficient and zero-dependency
- Full vector DB (Qdrant, Chroma): overkill for local vault scale; usearch is a single binary file

---

## 4. Data Model

All tables live in `.owl/db.sqlite`. This file is derived state — fully rebuildable by scanning the vault.

### 4.1 Phase 1 — Core Tables

```sql
-- Central hub. Every other table references notes.id.
CREATE TABLE notes (
  id            TEXT PRIMARY KEY,          -- nanoid
  path          TEXT UNIQUE NOT NULL,      -- vault-relative path
  title         TEXT NOT NULL,
  content_hash  TEXT NOT NULL,             -- sha256, used for incremental reindex
  created_at    INTEGER NOT NULL,          -- unix ms
  updated_at    INTEGER NOT NULL,
  parent_id     TEXT REFERENCES notes(id), -- nullable, for logical hierarchy
  folder_path   TEXT NOT NULL,
  note_type     TEXT NOT NULL DEFAULT 'note' -- note | daily | canvas | mindmap
);

-- Wiki link graph. Rebuilt on every note save.
CREATE TABLE links (
  source_note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  target_note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  source_block_id TEXT,                    -- nullable block-level reference
  link_text       TEXT NOT NULL,           -- raw [[text]] content
  is_resolved     INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE tags (
  note_id  TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  tag      TEXT NOT NULL                   -- stored without leading #
);

-- Block registry for AI chunking and block-level references.
CREATE TABLE blocks (
  block_id     TEXT PRIMARY KEY,           -- nanoid, stable across edits
  note_id      TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  block_type   TEXT NOT NULL,              -- paragraph | heading | code | callout | …
  content      TEXT NOT NULL,
  order_index  INTEGER NOT NULL
);

-- FTS5 virtual table — auto-synced via triggers.
-- Title hits weighted 10× over body in BM25 ranking.
CREATE VIRTUAL TABLE notes_fts USING fts5(
  title, content,
  content=notes,
  content_rowid=rowid
);
```

### 4.2 Phase 3 — Spatial Tables

```sql
CREATE TABLE canvas_nodes (
  node_id      TEXT NOT NULL,
  canvas_id    TEXT NOT NULL,
  node_type    TEXT NOT NULL,  -- note | text | image | file | mindmap
  ref_note_id  TEXT REFERENCES notes(id) ON DELETE SET NULL,
  pos_x        REAL NOT NULL,
  pos_y        REAL NOT NULL,
  width        REAL NOT NULL,
  height       REAL NOT NULL,
  style_json   TEXT,           -- color, label, border style
  PRIMARY KEY (node_id, canvas_id)
);

CREATE TABLE canvas_edges (
  edge_id        TEXT NOT NULL,
  canvas_id      TEXT NOT NULL,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  label          TEXT,
  PRIMARY KEY (edge_id, canvas_id)
);

CREATE TABLE mindmap_nodes (
  node_id        TEXT NOT NULL,
  mindmap_id     TEXT NOT NULL,
  parent_node_id TEXT,         -- nullable for root nodes
  label          TEXT NOT NULL,
  ref_note_id    TEXT REFERENCES notes(id) ON DELETE SET NULL,
  order_index    INTEGER NOT NULL,
  PRIMARY KEY (node_id, mindmap_id)
);
```

### 4.3 Phase 4 — AI Tables

```sql
CREATE TABLE embeddings (
  chunk_id        TEXT PRIMARY KEY,        -- nanoid
  note_id         TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  block_id        TEXT REFERENCES blocks(block_id) ON DELETE SET NULL,
  embedding_model TEXT NOT NULL,           -- e.g. nomic-embed-text
  vector_index    INTEGER NOT NULL,        -- integer key into vectors.usearch
  chunk_text      TEXT NOT NULL,
  chunk_hash      TEXT NOT NULL            -- sha256 for invalidation
);
```

`vectors.usearch` is a separate HNSW binary file in `.owl/`. The `vector_index` column is the integer key that maps SQLite rows to usearch entries. When `chunk_hash` changes, the old vector is deleted and a new one inserted.

---

## 5. On-Disk Vault Layout

```
~/my-vault/
  notes/
    Research/
      paper-notes.md
      papers/
        arxiv-2024-01.md
    Projects/
      owl-md-spec.md
    daily-2026-04-03.md
    index.md
  attachments/
    images/
    files/
    pdfs/
  .owl/
    db.sqlite          ← metadata, FTS5, backlinks, tags, blocks, canvas, mindmap
    vectors.usearch    ← HNSW binary (Phase 4)
    config.json        ← { name, created_at, schema_version }
    backups/           ← staging area (Phase 5)
```

Notes are plain `.md` files with optional YAML frontmatter for metadata. The `.owl/` directory can be safely added to `.gitignore` or deleted — the app rebuilds it on next open.

---

## 6. Project Source Structure

```
owl.md/
  src/
    main/
      index.ts
      ipc/
        vault.ts          # P1
        notes.ts          # P1
        search.ts         # P1
        canvas.ts         # P3
        mindmap.ts        # P3
        ai.ts             # P4
        backup.ts         # P5
      services/
        VaultService.ts   # P1
        DatabaseService.ts # P1
        IndexService.ts   # P1
        WatcherService.ts # P1
        EmbeddingService.ts # P4
        RagService.ts     # P4
        AIService.ts      # P4
        BackupService.ts  # P5
      db/
        schema.ts
        migrations/
    renderer/
      index.tsx
      App.tsx
      stores/
        vaultStore.ts     # P1
        editorStore.ts    # P1
        searchStore.ts    # P1
        canvasStore.ts    # P3
        aiStore.ts        # P4
      components/
        layout/
          AppShell.tsx    # P1
          LeftSidebar.tsx # P1
          RightSidebar.tsx # P1
          CommandPalette.tsx # P2
          TabBar.tsx      # P2
        editor/
          NoteEditor.tsx  # P1
          extensions/
            WikiLink.ts   # P1
            BlockId.ts    # P1
            SlashCommand.ts # P2
            Callout.ts    # P2
        canvas/
          CanvasView.tsx  # P3
          nodes/
            NoteCard.tsx
            ImageCard.tsx
            TextCard.tsx
        mindmap/
          MindMapView.tsx # P3
          MindMapNode.tsx
        ai/
          AIPanel.tsx     # P4
          ChatThread.tsx
          ContextSelector.tsx
        graph/
          GraphView.tsx   # P2
        search/
          SearchModal.tsx # P1
          SearchResults.tsx
      lib/
        ipc.ts            # P1 — typed window.owl bridge
        markdown.ts       # P1 — TipTap ↔ markdown serialization
    shared/
      types/
        Note.ts           # P1
        Canvas.ts         # P3
        AI.ts             # P4
        IPC.ts            # P1
    preload/
      index.ts            # P1
  docs/
    superpowers/
      specs/
        2026-04-03-owl-md-design.md
  electron.vite.config.ts
  electron-builder.yml
  package.json
  tsconfig.json
```

---

## 7. UI Design

**Style:** Aurora glass — deep teal/navy base with violet accent, frosted translucent panels (`backdrop-filter: blur(28px) saturate(180%)`) layered over a teal/violet nebula gradient background. Each panel uses a slightly different blur radius to create depth hierarchy.

**Layout:**
- **Left sidebar:** workspace tree (folders + notes), favorites, recent notes, daily note link
- **Center:** note editor (TipTap) or canvas (React Flow) or mind map — tabs at top
- **Right sidebar:** backlinks, outline, note metadata/properties, AI context panel
- **Top bar:** macOS-style traffic lights, vault name, ⌘K quick open

**Design constraints:**
- No modal dialogs for basic operations
- AI panel is a collapsible right sidebar section — never intrusive
- Plain note editing is the default; block mode is opt-in
- Sidebars are collapsible to maximize editor space

---

## 8. Phased Roadmap

### Phase 1 — Core Local Vault & Editor (MVP)
**Deliverables:** vault create/open, markdown CRUD, TipTap editor, folder tree, `[[WikiLink]]` extension, backlink index + panel, chokidar FS watcher, SQLite + migrations, FTS5 full-text search, search modal, Aurora glass UI shell, pinned/recent notes, autosave, electron-vite scaffold.  
**Unlock:** fully usable note-taking app before any further phases begin.

### Phase 2 — Rich UX & Convenience
**Deliverables:** command palette (⌘K), tabs + split panes, slash commands, callout blocks, outline sidebar, templates, daily notes, tags + saved searches, drag-and-drop note hierarchy, properties panel, graph view (React Flow), note metadata YAML frontmatter, keyboard shortcut map.  
**Unlock:** power-user workflow.

### Phase 3 — Whiteboard & Mind Maps
**Deliverables:** React Flow infinite canvas (pan/zoom), draggable note cards with live embedded TipTap editors, image/file/text cards, labeled connectors, node grouping, color coding, canvas persistence (SQLite), mind map editor, note→mind map conversion, mind map→note hierarchy, node↔note linking, viewport state persistence.  
**Unlock:** spatial knowledge organization. Canvas and mind map share the React Flow engine introduced in Phase 2.

### Phase 4 — Ollama AI Integration
**Deliverables:** Ollama connection config UI, model selector (separate for generation and embeddings), nomic-embed-text embeddings pipeline, usearch HNSW index, note chunking by headings and blocks, RAG context assembly, ask current note / linked notes / folder / canvas selection / mind map, citation panel showing retrieved chunks, summarize / rewrite / extract tasks / suggest backlinks / generate outline, incremental embedding invalidation via `chunk_hash`.  
**Unlock:** grounded local LLM. Graceful degradation when Ollama is unavailable.

### Phase 5 — Backup, Hardening & Polish
**Deliverables:** Google Drive OAuth connection, atomic snapshot bundling, versioned restore UI with preview before overwrite, conflict detection, scheduled + manual backups, crash recovery journal, corrupted index auto-repair, large vault performance tuning, import from Obsidian vault, import from Notion export, export to PDF/HTML, plugin extension point API (documented hooks for notes, commands, sidebar panels, AI actions — no sandbox in v1).  
**Unlock:** production-ready, importable, exportable.

---

## 9. Key Tradeoffs

**TipTap over CodeMirror:** TipTap's block model gives block IDs, slash commands, and drag-and-drop reorder for free. The cost is that the internal document format is JSON (ProseMirror AST), requiring a markdown serializer to keep `.md` files human-readable. A custom serializer is needed for callout and embed node types.

**Electron over Tauri:** The Node.js ecosystem — especially `better-sqlite3`, `chokidar`, and `usearch` Node bindings — is mature and well-tested for knowledge apps. Tauri would give a smaller binary (~15MB vs ~150MB) and lower idle memory, but the Rust backend split and thinner SQLite plugin ecosystem would slow Phase 1 iteration.

**FTS5 over Tantivy:** FTS5 lives inside the same SQLite file as all metadata, giving atomic consistency between content changes and index updates at zero extra dependency cost. Tantivy is faster at 100k+ note scale. The `IndexService` interface is abstracted to allow swapping later.

**`.owl/` as derived cache:** Notes are never locked into the app. The trade-off is that first open of a large existing vault requires a full scan to build the initial index. This is handled with a progress UI and background indexing that keeps the app responsive.

---

## 10. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| TipTap markdown round-trip breaks custom nodes (callouts, embeds) | Custom serializer per node type; round-trip tests in Phase 1 before any custom nodes are added |
| React Flow performance degrades past 500+ canvas nodes | Viewport culling; virtualization for off-screen nodes; document as known limit in Phase 3 |
| usearch + Ollama setup friction for non-technical users | Clear onboarding UI with status indicators; all AI features disabled gracefully if Ollama absent |
| chokidar misses external edits on some Linux filesystems | Polling fallback mode (`usePolling: true`); manual "rescan vault" command always available |
| Google Drive API token expiry during backup | Atomic backup: write to `.owl/backups/staging/`, move to final path on completion; never partial overwrite of previous snapshot |
| Schema migrations break existing vaults on upgrade | Versioned migration runner in `DatabaseService`; schema version stored in `config.json`; migrations are append-only |
| Block IDs drift between TipTap state and SQLite blocks table | Block ID extension assigns stable nanoids on creation; sync happens on every save via `IndexService.syncBlocks()` |

---

## 11. Acceptance Criteria

- User can create and browse nested notes quickly with folder tree navigation
- User can link notes with `[[wiki links]]` and see backlinks instantly in the right sidebar
- User can open a whiteboard and place notes spatially, connect them, and persist the layout
- User can create or import a mind map and link nodes to notes
- User can ask a local Ollama model questions grounded in selected notes or workspace scope, with citations
- User can back up the workspace to Google Drive and restore from versioned snapshots
- Workspace remains fully usable offline; no cloud dependency except optional backup
- Raw `.md` notes remain accessible and readable on disk without the app
- Indexing and AI processing happen in background without freezing the UI
- The `.owl/` directory can be deleted and fully rebuilt by reopening the vault
