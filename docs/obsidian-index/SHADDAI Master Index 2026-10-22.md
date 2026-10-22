---
title: SHADDAI Master Index
date: 2026-10-22
area: shaddai/plans
tags: [shaddai, shaddai/plans, index, master, shaddai-hub]
---

# SHADDAI Master Index

> **Every SHADDAI note in every Obsidian vault, newest to oldest, by area.**
> Generated 2026-10-22 by an automated inventory + classification pass over
> **5 vault roots / 6,809 markdown notes**. Nothing was moved. Nothing was deleted.

## Start here

| I want to know... | Go to |
|---|---|
| What is the newest work? | [[SHADDAI Timeline Newest First]] |
| Everything about the 3D realm / games | [[Areas/shaddai/world-3d\|3D World & Games]] |
| Everything about money | [[Areas/shaddai/economy\|Economy, Pricing & Payments]] |
| The MCP + headless gateway + discovery | [[Areas/shaddai/mcp\|MCP, Headless Gateway & Discovery]] |
| The brain, retrieval, RAG, AURA | [[Areas/shaddai/rag-brain\|RAG Brain, Retrieval & Knowledge]] |
| The 7 agents and their skills | [[Areas/shaddai/agents\|The 7 Agents & Skill Library]] |
| Security, audits, credentials | [[Areas/shaddai/security\|Security, Audit & Credentials]] |
| Backend, APIs, deployment | [[Areas/shaddai/backend\|Backend, APIs & Infrastructure]] |
| The dashboard SPA | [[Areas/shaddai/dashboard\|Dashboard & Front-of-House]] |
| Front end, FLUX, design, SEO | [[Areas/shaddai/frontend\|Front End & Creative Pipeline]] |
| Whitepapers, strategy, founder material | [[Areas/shaddai/content\|Content, Marketing & Founder Material]] |
| The plans and blueprints | [[Areas/shaddai/plans\|Master Plans, Specs & Blueprints]] |
| What happened, in order | [[Areas/shaddai/sessions\|Session Logs & Build Logs]] |
| Where everything lives on disk | [[SHADDAI Vault Map]] |
| The 5,321-skill library | [[SHADDAI Skill Library Map]] |
| The build session handoff | [[SHADDAI Session Handoff 2026-10-22]] |

## The corpus at a glance

| | |
|---|---|
| **Vault roots** | 5 (one main, one active, one MCP set, two archives) |
| **Markdown notes indexed** | **6,809** |
| **Notes with full metadata** | 1488 (date + area + tags) |
| **Skill library** | 5,321 playbooks across 7 agents |
| **Date range** | **2026-03-22 -> 2026-10-22** |
### By area
| Area | What it covers | Notes |
|---|---|---|
| [[Areas/shaddai/agents\|The 7 Agents & Skill Library]] | SHADDAI, NEXUS, ZEROX, ORACLE, TURTLE, QUILL, PIKADON - and the 5,321 skill playbooks they carry | **1202** |
| [[Areas/shaddai/content\|Content, Marketing & Founder Material]] | Whitepapers, vision, strategy, marketing, launch, forum lore, founder narrative | **96** |
| [[Areas/shaddai/dashboard\|Dashboard & Front-of-House]] | The SPA | **37** |
| [[Areas/shaddai/plans\|Master Plans, Specs & Blueprints]] | The plans | **24** |
| [[Areas/shaddai/economy\|Economy, Pricing & Payments]] | Prices, tiers, the peg, the seven splits, Stripe, x402, PayBox, royalties, tokens, wallets, the consultancy line | **22** |
| [[Areas/shaddai/security\|Security, Audit & Credentials]] | Everything defensive | **22** |
| [[Areas/shaddai/backend\|Backend, APIs & Infrastructure]] | Servers, routes, deployment, architecture, API clients, the plumbing under the product | **21** |
| [[Areas/shaddai/mcp\|MCP, Headless Gateway & Discovery]] | The one entry point | **18** |
| [[Areas/shaddai/sessions\|Session Logs & Build Logs]] | What actually happened, in order | **16** |
| [[Areas/shaddai/rag-brain\|RAG Brain, Retrieval & Knowledge]] | How the brain finds the right thing | **13** |
| [[Areas/shaddai/world-3d\|3D World & Games]] | The realm | **12** |
| [[Areas/shaddai/frontend\|Front End & Creative Pipeline]] | Front end and creative pipeline - FLUX, HuggingFace, design systems, landing, SEO | **5** |

### By vault

| Vault | Notes |
|---|---|
| SHADDAI OBSIDIAN (main) | 1449 |
| 02 Agents/SHADDAI (Desktop) | 26 |
| Obsidian Vault (Documents) | 9 |
| BACKUP_ARCHIVE/SKILLS | 2 |
| Shaddai_oldvault (archived) | 2 |

---

## How this was organized (and what was deliberately NOT done)

**What changed**
- **1,488 curated notes** gained frontmatter: `date:` (the real authoring date, not today's), `area:` (one of the 12 above), and `tags:`. That makes every note sortable by date and filterable by area inside Obsidian.
- **File modification times were restored** to their pre-change values, so "newest first" still means what it meant before.
- **Bodies were not rewritten.** Every one of the 641 notes that existed before the pass was byte-verified against a backup: **0 body bytes changed**.

**What was deliberately left alone**
- **All 5,321 `SKILL.md` files were left byte-identical.** This is not caution for its own sake: `backend/skills-loader.js` reads them **live from this vault at runtime**, and `backend/scripts/build-skills-catalog.js` bakes them into the shipped catalog. Adding a `---` block to one of them would have blanked its `name`/`description` for every bot on the network. Verified after the fact: the loader still returns **5,321 skills, 0 with an empty name, 0 with an empty description**, and `getSkillContent()` returns the original text.
- **Credential notes were indexed but never modified** - they are classified and listed, but not one byte of a file holding a live key was rewritten.
- **One file was left in its original encoding.** `Agents/Agent_Marketplace_Knowledge.md` is UTF-16; it was restored byte-exact rather than silently converted.
- **Nothing was moved or renamed.** Links from the old 2026-06-25 reorganization still resolve.

## The honest limit
The 5,321 `SKILL.md` playbooks are **not** individually listed in the timeline - that would be 5,321 lines nobody reads. They are organised by **agent and category**, which is how the folder structure already works, and rolled up in [[SHADDAI Skill Library Map]]. Everything that is *written about* (1,488 notes) is listed individually.
