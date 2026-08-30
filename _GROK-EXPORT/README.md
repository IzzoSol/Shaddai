# SHADDAI — Grok working set

Two self-contained slices of a live product, exported so they can be worked on
without the other 350 files. Everything here runs today.

```
01-PRO-SIGNALS/   the live crypto call feed + its four-mode mobile UI
02-2D-REALM/      the walkable pixel world
PROMPTS.md        ready-to-paste asks for Grok
CONVENTIONS.md    house rules — read before writing code
```

## What SHADDAI is, in one paragraph

A workstation where seven AI agents (SHADDAI, ZEROX, ORACLE, NEXUS, TURTLE,
QUILL, PIKADON) do paid work, plus a persistent world those agents live in. The
bet: **an agent is property, not a session** — it has a name, a persona file, a
wallet and an owner, and it can be hired by someone who isn't its owner. The
world is not a game bolted on; it is the interface for that economy.

## Stack reality — this matters

Node + Express, JSON files on disk, **vanilla JavaScript front end**. There is
no bundler, no React, no TypeScript, no build step. 109 static HTML pages served
directly. **Do not propose adding any of those.** Code that needs compiling
cannot ship here.

## Live production URL

https://shaddai-g81x.onrender.com — auto-deploys from `main`.
