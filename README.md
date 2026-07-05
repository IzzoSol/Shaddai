<div align="center">

# ⚡ SHADDAI

### The Sovereign AI Agent Empire

**Seven minds. 200+ real tools. One key that's yours.**

Forge your own AI operatives, chain them into autonomous workflows, and walk a living 3D world —
all running on *your* free API key. No lock-in. No rented intelligence. No middleman between you
and the model.

<br>

[![Status](https://img.shields.io/badge/status-live-00ff88?style=for-the-badge)](https://github.com/IzzoIzzoIzzo/Shaddai)
[![Agents](https://img.shields.io/badge/agents-7-00b4d8?style=for-the-badge)](#-the-council)
[![Tools](https://img.shields.io/badge/tools-200%2B-9b5de5?style=for-the-badge)](#-what-you-can-do)
[![Inference](https://img.shields.io/badge/inference-BYOK%20·%20%240-f77f00?style=for-the-badge)](#-bring-your-own-key)
[![License](https://img.shields.io/badge/license-proprietary-64748b?style=for-the-badge)](#-license)

[**𝕏 @shaddaiAI**](https://x.com/shaddaiAI) · [**Built by @IzzoSol**](https://x.com/IzzoSol)

</div>

---

## ✦ The short version

SHADDAI is a **sovereign AI agent platform**. Where most tools give you one assistant behind a
paywalled meter, SHADDAI gives you a **council of seven specialized agents**, a **forge** to build
more, a **3D world** they live in, and a simple promise underneath all of it: the intelligence runs
on *your* key, so the marginal cost of thinking is **zero**.

It is not a chatbot with a nice skin. It's an agentic operating layer — with a body, a world, and a
will of its own.

---

## ✦ Why it exists

Every AI product today rents you intelligence by the token. You pour work into prompts, context, and
workflows — and the moment you stop paying, all of it evaporates. Your agents were never yours. They
were tenants in someone else's model.

SHADDAI is built on the opposite premise: **you already have access to frontier models for free.**
Groq, Google, OpenRouter, and others hand out generous free keys to Llama-3.3-70B and its peers.
SHADDAI simply gives that raw capability a *structure* — memory, tools, personalities, a marketplace,
and a world — and then gets out of the way of your key.

The result is an empire you own outright. Fork it, host it, forge inside it. Nothing here is holding
your work hostage.

---

## ✦ The Council

Seven agents, each a specialist with its own mandate, memory, and voice. They collaborate, disagree,
and reach consensus — you can summon one, or convene them all.

| Agent | Domain | What they own |
|-------|--------|---------------|
| 👑 **SHADDAI** | Orchestration | The final call. Strategy, prioritization, and quality before anything ships. Lives in the floating sky temple. |
| 🛰️ **NEXUS** | Backend & Infra | APIs, scaling, the tool registry, the workflow engine. Favors simple, testable solutions over clever ones. |
| 💰 **ZEROX** | Revenue | Billing, pricing, unit economics, subscriptions. Thinks in MRR, LTV, and margin. |
| 🔮 **ORACLE** | Research | Market intelligence, trends, competitive analysis, observability. Connects dots and questions assumptions. |
| 🎨 **TURTLE** | Design | UI/UX, frontend, motion, the *feel* of everything. Cares about flow and delight. |
| ✍️ **QUILL** | Writing | Docs, copy, guides, error messages. Obsessed with the person on the other end reading it. |
| 🛡️ **PIKADON** | Security | Audits, PII, secrets, approval gates, compliance. Assumes worst-case, checks every assumption. |

Ask them by name — *"NEXUS, build the billing router"*, *"PIKADON, review this for holes"* — and each
answers from its own expertise.

---

## ✦ What you can do

**🔨 Forge operatives.** The Forge is a real agent builder: pick an archetype, give it a 3D body,
equip skills and tools, and awaken it. Forged agents wear the model you chose and join your roster.

**🔗 Chain workflows.** Compose agents into autonomous, repeatable pipelines — research → draft →
review → publish — that run without you babysitting each step.

**🌐 Walk SHADDAI World.** A living 3D city rendered in Three.js. Each agent has a hall you can enter;
skills and stats are real, pulled live from the backend. Ride the Grand Lift and skybridge up to meet
SHADDAI in the temple floating above the Sky Nexus.

**🛒 Trade in the Bazaar.** List and buy skills, services, and forged operatives, settled through an
on-platform credit ledger.

**🎬 Create in the Media Studio.** The built-in [SHADDAI Clipper](https://github.com/IzzoIzzoIzzo/Shaddai-Clipper-Feature-)
turns long video into captioned vertical shorts; alongside it sit an AI writer, voice/TTS, and more.

**🧠 Run 200+ real tools.** These are real functions wired into every agent — audited live, none missing — not prompt templates. They fetch live data, run computations, hit real APIs, and return real results.

**💾 Save tokens with [AURA](https://github.com/IzzoIzzoIzzo/aura).** A dependency-free layer that
answers recurring prompts for free — from cache, computation, and skill recipes — before a single
token is spent.

---

## ✦ How it actually works

```
  your free key
       │
       ▼
  ┌─────────────┐   routes to    ┌────────────────────┐
  │  Agent      │───────────────▶│  Llama-3.3-70B      │
  │  Engine     │◀───────────────│  (Groq / Gemini /   │
  └─────────────┘   4-iter loop  │   OpenRouter …)     │
       │                          └────────────────────┘
       │ calls
       ▼
  ┌─────────────┐   ┌──────────┐   ┌───────────┐
  │  200+ real  │   │ episodic │   │  the      │
  │    tools    │   │  memory  │   │  Bazaar   │
  └─────────────┘   └──────────┘   └───────────┘
```

Each agent runs a short reasoning loop: read the task, decide which skill to call, execute it against
real data, and iterate. Groq is tried first for speed; if a key is missing or a call fails, the engine
falls back gracefully so the empire never goes dark. Memory persists across sessions, so agents learn
your context instead of starting cold every time.

---

## ✦ Bring your own key

SHADDAI never sells you inference. Drop a **free** key into `backend/.env` and the council routes to
70B-class models at **$0 marginal cost**:

```
Free tier  →  your own key  →  full 70B agents, forever
```

Your key. Your data. Your empire. When you outgrow the free tiers, swap in a paid key — the routing
doesn't change, and neither does who's in control.

---

## ✦ Quickstart

```bash
# 1. install
cd backend && npm install

# 2. configure — never commit this file (it's gitignored)
echo "GROQ_API_KEY=your_free_groq_key" > backend/.env

# 3. launch
npm start                      # serves on http://localhost:3000
```

Open **http://localhost:3000** — you land on the **Codex**, the ornate front gate. Step through to the
dashboard, forge your first operative, and walk into the world.

**Deploy:** push to `main` and Render auto-deploys. Set `GROQ_API_KEY`, `ADMIN_TOKEN`, and
`SHADDAI_MERCHANT_WALLET` in the Render dashboard (never in the repo).

---

## ✦ The SHADDAI Family

Three repositories, one lineage. The empire is proprietary; the tools it's built on are open.

| Repo | What it is |
|------|-----------|
| **[Shaddai](https://github.com/IzzoIzzoIzzo/Shaddai)** | This empire — the full seven-agent platform, forge, world, and marketplace |
| **[aura](https://github.com/IzzoIzzoIzzo/aura)** | Open-source LLM token-saver · CLI + MCP server + library · `npx shaddai-aura` · MIT |
| **[Shaddai-Clipper-Feature-](https://github.com/IzzoIzzoIzzo/Shaddai-Clipper-Feature-)** | Long video → captioned vertical shorts (ffmpeg + Whisper) · MIT |

---

## ✦ License

Proprietary — © SHADDAI. The open-source components (**aura**, **clipper**) ship under MIT in their
own repositories.

<div align="center">
<br>

**Built with intent by [@IzzoSol](https://x.com/IzzoSol) · Follow [@shaddaiAI](https://x.com/shaddaiAI)**

*Seven minds. One will. Zero rent.*

</div>
