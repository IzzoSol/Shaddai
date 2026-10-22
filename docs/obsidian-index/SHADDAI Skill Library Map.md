---
title: SHADDAI Skill Library Map
date: 2026-10-22
area: shaddai/agents
tags: [shaddai, shaddai/agents, index, skills]
---

# SHADDAI Skill Library Map

**5281 skill notes** across 7 agent folders (plus 1171 flat playbook files).
Each is a folder-per-skill (`<skill>/SKILL.md`) or a flat `.md` playbook.
This is the library the MCP serves - `skills-loader.js` walks it live.

> **These files are deliberately NOT individually indexed.** 5,321 lines of
> filenames is not a map. They are organised by agent and category, which is
> how the folders already work. Everything *written about* the skills is
> indexed individually - see [[Areas/shaddai/agents]].

| Agent | Notes | Newest | Oldest | Top categories |
|---|---|---|---|---|
| **SHADDAI** | 3087 | 2026-04-12 | 2026-03-30 | (root) (51), gamedebug (44), ops (23), system (22), writing (19), esoteric (11) |
| **TURTLE** | 669 | 2026-04-12 | 2026-03-28 | gamedebug (56), art (6), music-agent (4), gamedesign (3), adhd-parenting (2), adoptive-parenting (2) |
| **ORACLE** | 550 | 2026-04-12 | 2026-03-28 | esoteric (10), wellness (7), anatomy (6), adhd-parenting (2), adoptive-parenting (2), adult-education (2) |
| **QUILL** | 534 | 2026-04-12 | 2026-03-29 | writing (18), adhd-parenting (2), adoptive-parenting (2), adult-education (2), anthropology-wisdom (2), anxiety-support-child (2) |
| **NEXUS** | 532 | 2026-04-12 | 2026-03-28 | ops (22), adhd-parenting (2), adoptive-parenting (2), adult-education (2), anxiety-support-child (2), api-endpoint-design (2) |
| **PIKADON** | 523 | 2026-04-12 | 2026-03-28 | security (7), adhd-parenting (2), adoptive-parenting (2), adult-education (2), anxiety-support-child (2), arts-education (2) |
| **XEROX** | 557 | 2026-04-12 | 2026-03-28 | budget (8), scaling (5), trading-psych (3), adhd-parenting (2), adoptive-parenting (2), adult-education (2) |

## How this library is consumed

| Consumer | How it reads the vault |
|---|---|
| `backend/skills-loader.js` | Walks `Agents/*/Skills/**` **live at runtime**, picks files named exactly `SKILL.md`, parses `--- name/description ---`, caches 5 min |
| `backend/scripts/build-skills-catalog.js` | Same walk, bakes `backend/data/skills-catalog.json` (**3,022 entries**) for production |
| `backend/skill-index.js` | Reads the baked JSON only - **no filesystem dependency** |
| `backend/api-proxy-routes.js` | `skill_get` / `skill_list` -> live registry + on-demand content, with a **700-char preview** on the open path |

## The rule that matters here

**Never add a `---` block to a `SKILL.md`.** `parseFrontmatter()` matches the
first `---` pair and reads `name:` / `description:` from it. A block without
those keys silently blanks the skill's name and description for every bot on
the network. The metadata pass in this repo deliberately skipped all
**5281** `SKILL.md` files and they are byte-verified identical to their originals.

Back to [[SHADDAI Master Index 2026-10-22]] · [[SHADDAI Area Map]]
