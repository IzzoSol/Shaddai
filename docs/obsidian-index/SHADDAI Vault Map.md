---
title: SHADDAI Vault Map
date: 2026-10-22
area: shaddai/plans
tags: [shaddai, shaddai/plans, index, vault]
---

# SHADDAI Vault Map

The SHADDAI knowledge is spread across **5 Obsidian vaults on 4 disk roots**.
Nothing was moved - moving them would break every existing link and every
hardcoded path in the code. Instead each vault now carries a pointer note.

### SHADDAI OBSIDIAN (main vault)

- **Path:** `C:\Users\Brittany\OneDrive\Desktop\Downloads\OBSIDIAN\SHADDAI OBSIDIAN`
- **Indexed notes:** 1449 (of which 0 are `SKILL.md`)
- **Date range:** 2026-03-22 -> 2026-10-22
- **Top areas:** shaddai/agents (1200), shaddai/content (90), shaddai/dashboard (33), shaddai/plans (23), shaddai/economy (21)

### Obsidian Vault (Documents) - the ACTIVE vault

- **Path:** `C:\Users\Brittany\OneDrive\Documents\Obsidian Vault`
- **Indexed notes:** 9 (of which 0 are `SKILL.md`)
- **Date range:** 2026-10-22 -> 2026-10-22
- **Top areas:** shaddai/mcp (4), shaddai/dashboard (1), shaddai/agents (1), shaddai/content (1), shaddai/world-3d (1)

- **Pointer note:** `SHADDAI - Pointer to the Main Vault.md`

### 02 Agents/SHADDAI (Desktop) - the MCP set

- **Path:** `C:\Users\Brittany\OneDrive\Desktop\02 Agents\SHADDAI`
- **Indexed notes:** 26 (of which 0 are `SKILL.md`)
- **Date range:** 2026-10-22 -> 2026-10-22
- **Top areas:** shaddai/mcp (8), shaddai/rag-brain (5), shaddai/security (5), shaddai/dashboard (3), shaddai/sessions (1)

- **Pointer note:** `SHADDAI - Pointer to the Main Vault.md`

### BACKUP_ARCHIVE/SKILLS - archive stub

- **Path:** `C:\Users\Brittany\OneDrive\Desktop\05 Archives\BACKUP_ARCHIVE\SKILLS`
- **Indexed notes:** 2 (of which 0 are `SKILL.md`)
- **Date range:** 2026-10-22 -> 2026-10-22
- **Top areas:** shaddai/content (2)

- **Pointer note:** `SHADDAI - Pointer to the Main Vault.md`

### Shaddai_oldvault - archive stub

- **Path:** `C:\Users\Brittany\OneDrive\Desktop\03 Mastery\Dreamers Mastery\_ARCHIVED\Shaddai_oldvault`
- **Indexed notes:** 2 (of which 0 are `SKILL.md`)
- **Date range:** 2026-10-22 -> 2026-10-22
- **Top areas:** shaddai/content (2)

- **Pointer note:** `SHADDAI - Pointer to the Main Vault.md`


## Which vault is which

| Vault | Role | Use it for |
|---|---|---|
| **SHADDAI OBSIDIAN** (main) | The library. 6,809 notes. | Everything. Start at [[SHADDAI Master Index 2026-10-22]] |
| **Obsidian Vault** (Documents) | The **active** desk vault. Newest notes (Oct 2026) live here. | Current session work |
| **02 Agents/SHADDAI** (Desktop) | The MCP documentation set (Oct 2026) + the April v48.88 security analysis | MCP, gateway, charging, teaching, retrieval |
| **BACKUP_ARCHIVE/SKILLS** | Archive stub. 2 notes. | Nothing - kept for continuity |
| **Shaddai_oldvault** | Archive stub. 2 notes. | Nothing - kept for continuity |

## The one thing to know

`backend/skills-loader.js` points at the **main** vault:
```
OBSIDIAN_ROOT = process.env.OBSIDIAN_ROOT
             || 'C:\Users\Brittany\OneDrive\Desktop\OBSIDIAN\SHADDAI OBSIDIAN'
```
That default path is **missing the `Downloads\` segment** - the vault actually
lives at `Desktop\Downloads\OBSIDIAN\SHADDAI OBSIDIAN`. Unless `OBSIDIAN_ROOT`
is set in `.env`, the live loader silently finds nothing. The 5,321-skill count
in [[SHADDAI Skill Library Map]] was measured against the **real** path.

Back to [[SHADDAI Master Index 2026-10-22]]
