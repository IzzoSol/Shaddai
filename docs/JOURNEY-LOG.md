# JOURNEY LOG — workflows and skills learned while building SHADDAI (raw material for books / courses)

Each entry: what we did, the reusable trick, what bit us. Keep entries short; append newest at the bottom.

## 2026-10-02
- **Pure-rules-first game dev.** Every mechanic (race modes, hazards, taming, passive mode, districts) is a dependency-free module with a node test, then a thin wiring hook in the host page. Result: 100+ tests stay green, refactors are safe, and a laptop with 8 GB never needs a browser to prove logic. *Trick:* run the real three.js (`three.cjs`) in node with stub DOM for physics-level tests.
- **Data over layout code.** The city is one JSON plan read by both the game and Blender; district identity was added as a lookup layer so the plan stays deterministic. *Trick:* add identity as a function of position, not by editing 983 records.
- **Safe by default.** New punishing systems (hazards) ship with a floor (HP never below 25) until the player has a way to counter them (gear shop). *Trick:* ship the rule and the escape hatch together, remove the hatch when the counter exists.
- **Plumbing push.** With a dirty shared working tree, push single commits to `main` via git plumbing (`read-tree` + `commit-tree`), refusing if main changed the same files. No checkout, no collisions with parallel sessions.
- **Tool honesty.** The MCP orchestrator failed (backing model removed); we noted it and worked from first principles instead of pretending it reviewed anything. *Trick:* always report a failed tool plainly and route around it.
- **Memory pressure.** Headless-browser screenshot jobs were killed by the OS at ~1 GB free; keep one heavy job at a time and ask before re-running.
- **Reference-led art.** Owner reference images (car sheet, black/teal/gold board) drive procedural models: sculpted lofts, transparent glass cabins, a style entry per reference. *Trick:* one registry of styles, one test that every style builds under the triangle budget.
- **Stairs from existing physics.** The player controller already steps onto any collider whose top is within 0.45 m, so real stairs are just a run of 0.2 m collider boxes plus matching instanced treads; no new physics. *Trick:* find the engine rule first (stepUp), then express the feature as data that satisfies it, and test the data (riser <= 0.45, head clearance >= 1.8 m). *Open:* the sand house stairs end in a 1.8 m ledge; the roof terminal still sits at floor level, so a landing + roof access is the next piece.
