# How to Run SHADDAI v80

## ⭐ EASIEST — one click (everything live)
**Double-click `START-SHADDAI.bat`.** It starts Ollama + the backend (+ AURA if Python is installed), then opens the dashboard with agents live. First run installs backend dependencies automatically (one-time, ~1 min).
To shut down: **double-click `STOP-SHADDAI.bat`**.

> Prereqs for full power: install **Ollama** (https://ollama.com) then run `ollama pull llama3.2:1b` once. Node.js must be installed. Python is optional (only for AURA).

## Quickest look (no setup)
Just **double-click `FINAL-SHADDAI-V80.html`** to open the dashboard in your browser.
It works standalone — but the agents/tools need the backend running to do real work.

---

## Full setup (agents + tools live)

### 1. Prerequisites
- **Node.js** (v18+; built/tested on v25)
- **Ollama** (free local LLM) — https://ollama.com — then: `ollama pull llama3.2:1b`
- **Python 3** (only if you want the AURA token-saver)

### 2. Start Ollama (the free local brain)
```
ollama serve
```
Leave it running. (Agents use it as the primary LLM — no API costs.)

### 3. Start the backend
```
cd backend
npm install        # first time only
node server-production.js
```
Backend runs on **http://localhost:3000**.

### 4. (Optional) Start AURA token-saver
```
cd aura
pip install -r requirements.txt   # first time only
python aura_server.py             # or run START_AURA.bat
```
AURA runs on **http://localhost:8010** — caches answers so you spend far fewer tokens.

### 5. Open the dashboard
Open `FINAL-SHADDAI-V80.html` in your browser. It connects to the backend automatically.

---

## Tips
- **Low RAM (8GB):** keep only ONE dashboard browser window open, so Ollama has room to load its model.
- **Faster/better answers:** add an API key under Settings (BYOK) — Groq is free and fast.
- **MCP servers:** edit `backend/data/mcp-servers.json`, set a server `"disabled": false`, then connect it from the dashboard (or `POST /api/mcp/connect`).
- **pay.sh (real money):** stays OFF until you set `enabled: true` in `backend/data/pay-config.json`. Caps: $0.50/call, $5/day, approval above $0.10.

## Re-audit anytime
```
cd backend
node audit-connectivity.js   # frontend↔backend links + tools
node audit-dashboard.js      # dead buttons + duplicate IDs
node audit-tools.js          # live test every tool (HTTP only, no tokens)
node test-e2e.js             # 30 end-to-end API tests (needs backend running)
```
