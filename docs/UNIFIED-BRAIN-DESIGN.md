# Unified Brain — one cohesive brain (design, owner 2026-10-02)

Repo: main Shaddai (`/rag` and `/brain` pages). Today there are two disconnected views: **3D BRAIN** (Neural Cockpit: a three.js bust cut into stacked slabs by the "open compartments" slider, plus stat panels) and **CLASSIC BRAIN** (a node cloud with SCAN / ASK AI / COUNCIL / CROSS-TALK / RESEARCH / GALLERY / BINAURAL / INTROSPECT / BOOKS). The slabs look glitchy and the two never talk to each other.

## Target: one scene, one state
- **One page, no tab split.** The scene is the 7 agent faces (SHADDAI, NEXUS, ZEROX, ORACLE, TURTLE, QUILL, PIKADON) arranged around a central knowledge field. Selecting an agent sets the "mask" (answer scope), exactly like the cockpit's mask today.
- **Face = three.js bust, properly built.** Replace the slab slicing with a real **opening**: the face splits along a seam into two hinged shells (jaw and cranium plates), revealing an inner **compartment bay** of glowing modules. Opening is animated (not sliced geometry) and reversible; closed = clean bust, open = tool bay.
- **What is inside each face (its compartments):** that agent's **tools** (MCP tools, workflows), **skills** (Academy skills learned, with level), **knowledge** (its corpus shards with counts, e.g. "TURTLE 1353 videos"), **recent activity**, and a **teach** slot to add a source. Clicking a module runs or opens it.
- **The node cloud becomes the knowledge layer behind the faces**: clusters per agent; a question lights the passages it used and draws lines back to the face that answered. SCAN, COUNCIL, CROSS-TALK, RESEARCH become actions on the one scene, not separate screens.
- **Stats panels stay but get honest:** videos / chunks / shards, search speed, load, confidence/hallucination risk are real numbers from the backend, not placeholders; hide any panel with no real data.

## Accuracy (do this first, before visuals)
1. Provider fallback: Groq `llama-3.1-8b-instant` returns 404, HF `hf-inference` returns 410; use a configured provider chain (nscale / fal-ai / wavespeed per the API keys vault note) and surface "no provider configured" instead of dumping raw excerpts.
2. Answers must **cite**: every answer lists the passages (video, timestamp, chunk) it used; confidence shown from retrieval scores, and "I don't know" when retrieval is weak.
3. Eval set: 30 questions with known answers per agent; run on every change; track accuracy over time (this is also content for the books/courses).
4. Teaching loop: "Teach" button ingests a URL/file/video into the chosen agent's shard, shows it in the activity log, and reports what was added.

## Build order
1. Provider chain + citations + no-provider message (+ node test).
2. One shared state module (selected agent, open/closed, last query, passages) used by both renderers.
3. New face rig + opening animation (three.js, instanced glow modules, low-poly so it runs on the laptop: < 40k tris, 1 draw per module group).
4. Fold the node cloud in as the background layer; remove the tab switch.
5. Modules per face wired to real tools/skills; Teach slot.
6. QA gate shots: closed, open, asking, answer with citations (see `docs/QA-PROCESS.md`).

Blocked right now by: full disk (239 MB free) which prevents making a working copy; owner to free space or approve what can be cleared.
