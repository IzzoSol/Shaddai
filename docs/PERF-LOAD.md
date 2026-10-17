# PERF-LOAD — startup speed (2026-09-28)

**What changed (public/SHADDAI-WORLD-3D.html)**
- Light loading screen is the default. Old cinematic intro only with `?intro=cinematic`.
- `performance.mark/measure` around every startup step -> `window.__loadTimings`, `window.__loadSummary`, console table (`window.__loadReport()`).
- Progressive startup: only the spawn-area steps (`__LD.critical`) block the loader. Far steps (fill, clusters, dragons, wildlife, void castle, sky traffic...) wait for the sky-dive to land (or 20 s after entry) and then start one per idle slot (`_ldStep` + `_ldDeferGate`). `?nodefer` disables the gate.
- Long tasks are logged per step so any remaining stall is attributable.

**Measured (headless Chrome, SwiftShader, dev CPU, `?map=v4`, before entering the world)**
- World built flag at ~14 s. Longest main-thread task 210 ms (canon 210, sky 208, buildings 188). No page errors.
- Real HD 620 GPU numbers: check `__loadSummary` in the console on the beta.
