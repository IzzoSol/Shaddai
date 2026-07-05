# SHADDAI - MASTER FINAL BUILD

Clean snapshot (no node_modules/.git/secrets).

- public/index.html = the dashboard users see
- backend/ = Node server + agent engine + 182 tools + x402 + prepaid ledger
- ship/SHADDAI_v85.html = latest keyless build
- render.yaml = Render deploy blueprint
- SHADDAI_BUILD_STATUS.md = what's done / what's left

RUN LOCALLY: cd backend then npm install; add keys to backend/.env (copy .env.example); npm start; open http://localhost:3000

CANONICAL SOURCE = GitHub IzzoIzzoIzzo/Shaddai branch main (Render auto-deploys from main). This Desktop folder is a reference snapshot.

Keys live ONLY in backend/.env or the Render dashboard - never in code.
