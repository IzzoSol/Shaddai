# RAG Knowledge Bases

**This folder is gitignored.** All files regenerate on startup from the mastery card corpus.

## Layout

```
backend/data/rag/
├── kb_<agent>/          # one per agent (shaddai, oracle, zerox, nexus, turtle, quill, pikadon)
│   ├── docs.json        # chunked documents (TF-IDF input)
│   └── idf.json         # inverse-document-frequency weights
├── e2e/                 # end-to-end test fixtures
├── e2e-rag/             # end-to-end RAG pipeline tests
├── auditUser/           # sandbox for user-KB experiments
├── u_<hash>/            # per-user ephemeral KB workspaces (auto-created on demand)
└── kb_test/             # unit-test fixtures
```

## What builds the KBs

- `backend/agent-engine.js` and the RAG service in `backend/rag-*.js` read from `backend/knowledge/mastery/<agent>/*.md` (the mastery cards) and emit the TF-IDF index.
- They rebuild on server boot — no manual step needed.
- To force a rebuild, delete the relevant `kb_<agent>/` folder and restart `backend/server-production.js`.

## Why it's gitignored

Index files are derived artifacts. Tracking them bloats git, and they desync whenever the source corpus changes. The startup rebuild is faster than the diff to verify.

## Per-user KBs

`u_<hash>/` folders appear dynamically when a user starts a session and ingests content. They're safe to delete if older than 30 days — see `backend/rag-user-service.js` for the cleanup TTL.
