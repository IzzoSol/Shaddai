# SHADDAI Media Engine

This directory is the **rebranded, in-house copy** of the media download engine.

- **Provenance**: vendored from [imputnet/cobalt](https://github.com/imputnet/cobalt) v11.7.1
  (AGPL-3.0 — see `LICENSE` at the repo root here). Upstream git history was
  stripped; the code is now owned and maintained inside the SHADDAI build.
- **Rebrand**: package `@imput/cobalt-api` → `@shaddai/media-engine`;
  entrypoint `src/cobalt.js` → `src/engine.js`; banner/serverInfo → SHADDAI;
  outbound UA prefix `cobalt/…` → `shaddai-media/…`.
- **Rail (SHADDAI-original)**: `backend/media-routes.js` mounts `/api/media`
  (status | fetch | dl) with PIKADON guards — SSRF-blocked public URLs, strict
  engine tunnel-origin lock on downloads, per-IP budget, size cap, audit trail.
- **Runner (SHADDAI-original)**: `backend/media-engine-runner.js` health-check +
  auto-spawn on the main server boot (`MEDIA_ENGINE_NODE` must point at Node 24+
  for the isolated-vm ABI prebuild; absent a C++ toolchain this machine relies on
  the shipped prebuilt addon, so do NOT rebuild from source).
- **Runtime config is private**: `api/.env` + `api/keys.json` are gitignored.

Any change under this directory must keep the AGPL-3.0 license file and this
attribution note.