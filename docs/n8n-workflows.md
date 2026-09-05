# SHADDAI — n8n Automation Starter Pack

Import-ready n8n workflows that drive the SHADDAI eco REST spine. Each snippet is
a JSON *nodes array* you paste under **Workflows → Import from JSON**, then set
two credentials:
- **HTTP Request** → your server root (`http://localhost:3000` locally,
  `https://shaddai-g81x.onrender.com` deployed). Endpoints are the verified ones
  from `docs/mcp-endpoints/INDEX.md`.
- **Telegram** → bot token + chat id (the same token the `/api/hall` uses when set).

No MCP needed — these run against plain HTTP routes the production server serves.

---

## 1. Daily Market Digest → Telegram

Cron `0 6 * * *`: pull top-dex + sentiment, post a compact digest to Telegram.

```json
[
  { "parameters": { "rule": { "interval": [{ "field": "cronExpression", "expression": "0 6 * * *" }] } },
    "name": "Cron", "type": "n8n-nodes-base.cron", "typeVersion": 1.2, "position": [0, 0] },
  { "parameters": { "method": "GET", "url": "={{$env.SHADDAI_BASE || 'http://localhost:3000'}}/api/pro-signals/top-dex?limit=5", "options": {} },
    "name": "Top DEX", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [200, 0] },
  { "parameters": { "method": "GET", "url": "={{$env.SHADDAI_BASE || 'http://localhost:3000'}}/api/scheduler/jobs", "options": {} },
    "name": "Scheduler jobs", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [400, 0] },
  { "parameters": { "jsCode": "const pairs=(items[0].json.pairs||[]).slice(0,5);\nconst jobs=(items[1].json.jobs||[]).length;\nconst lines=['📡 ZEROX DAILY DIGEST',''];\npairs.forEach((p,i)=>lines.push(`${i+1}. ${p.symbol} · ${p.chg24>0?'+':''}${p.chg24}% · vol $${Math.round(p.vol24||0)}`));\nlines.push('','scheduler jobs armed: '+jobs);\nreturn [{json:{text:lines.join('\\n')}}];" },
    "name": "Compose", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [600, 0] },
  { "parameters": { "chatId": "={{$env.TELEGRAM_CHAT_ID}}", "text": "={{$json.text}}" },
    "name": "Telegram", "type": "n8n-nodes-base.telegram", "typeVersion": 1, "position": [800, 0] }
]
```

Set env vars in n8n: `SHADDAI_BASE`, `TELEGRAM_CHAT_ID`.

---

## 2. Economy Health Watch → Alert

Every 30 min, hit `/api/eco/health`; Telegram only when a module is down.

```json
[
  { "parameters": { "rule": { "interval": [{ "field": "minutes", "minutesInterval": 30 }] } },
    "name": "Cron", "type": "n8n-nodes-base.cron", "typeVersion": 1.2, "position": [0, 0] },
  { "parameters": { "method": "GET", "url": "={{$env.SHADDAI_BASE || 'http://localhost:3000'}}/api/eco/health", "options": {} },
    "name": "Health", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [200, 0] },
  { "parameters": { "jsCode": "const m=items[0].json.modules||{};\nconst down=Object.entries(m).filter(([,v])=>!v.ok).map(([k])=>k);\nif(!down.length) return [];\nreturn [{json:{text:'🔴 SHADDAI economy: '+down.join(', ')+' down'}}];" },
    "name": "Filter down", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [400, 0] },
  { "parameters": { "chatId": "={{$env.TELEGRAM_CHAT_ID}}", "text": "={{$json.text}}" },
    "name": "Telegram", "type": "n8n-nodes-base.telegram", "typeVersion": 1, "position": [600, 0] }
]
```

---

## 3. Market Scan Memo → File

Cron `0 9 * * 1` (Mondays): call `/api/eco/ledger/summary`, append a one-line memo
to a Google Sheet or file. Swap the last node for **Google Sheets** with creds.

```json
[
  { "parameters": { "rule": { "interval": [{ "field": "cronExpression", "expression": "0 9 * * 1" }] } },
    "name": "Cron", "type": "n8n-nodes-base.cron", "typeVersion": 1.2, "position": [0, 0] },
  { "parameters": { "method": "GET", "url": "={{$env.SHADDAI_BASE || 'http://localhost:3000'}}/api/eco/ledger/summary", "options": {} },
    "name": "Ledger", "type": "n8n-nodes-base.httpRequest", "typeVersion": 4.2, "position": [200, 0] },
  { "parameters": { "jsCode": "const j=items[0].json;\nconst row=[j.receipts??0, j.gross??0, j.platform_cut??0, j.owner_share??0, new Date().toISOString().slice(0,10)];\nreturn [{json:{values:[row]}}];" },
    "name": "Row", "type": "n8n-nodes-base.code", "typeVersion": 2, "position": [400, 0] },
  { "parameters": { "sheetId": "={{$env.GSHEET_ID}}", "range": "A:E", "options": { "appended": true } },
    "name": "Sheets", "type": "n8n-nodes-base.googleSheets", "typeVersion": 4, "position": [600, 0] }
]
```

---

## Notes

- Endpoints are all **GET / read-only** from the eco spine — safe to poll.
- For auth-gated routes later, add an `Authorization: Bearer <token>` header on the
  HTTP node (identity rules in `docs/mcp-endpoints/INDEX.md` → Auth notes).
- `SHADDAI_BASE` default is localhost:3000; set it to the Render URL in production
  via n8n Environment Variables.