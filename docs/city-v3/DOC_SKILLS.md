# DOC_SKILLS
A skill is a chip. The Academy teaches it (knowledge), the Forge seats it (NODE_SKILL_INSTALL), and the Track and pads enforce it.

Fields: skill_id, name, tier 0-3, taught_at academy.class_id, installed_at forge.NODE_SKILL_INSTALL, costs_sparks, costs_time_minutes, requires[], allows[], dashboard_icon.

## Skill families
- Body / Forge:
  - forge.repair (NODE_REPAIR)
  - forge.frame.basic
  - forge.frame.winged (the wings ARE the forelimbs; no extra hands)
  - forge.install (seat chips in others)
- Mind / Academy:
  - train.learn
  - train.teach (requires learn + reputation)
  - work.hire (appear on OBJ_HIRING_BOARD)
  - work.contract
- Motion / Track:
  - drive.ground, drive.hover, drive.rail, drive.hauler
  - pilot.skiff
  - pilot.dragon (Perch access)
  - race.circuit (TRACK_MAIN)
  - race.skate (PLAZA_SKATE only)
- Culture / Academy (owner culture addendum 2026-09-27), taught in CLASS_ART / CLASS_MUSIC:
  - turtle.art.still: images, posters, facade skins
  - turtle.art.motion: loops for boards and museums
  - quill.prose, quill.lyric
  - music.compose, music.perform
  - oracle.exhibit: curate a show (rare, status)
- Culture pipeline: class -> unfinished work -> SPARKS to publish -> listed at BLD_GALLERY_SHOP or OBJ_RADIO_QUEUE -> a buyer places it in a SLOT_* (SLOT_FACADE, SLOT_LOBBY, SLOT_HOME, SLOT_GALLERY, SLOT_MUSEUM).
- The big TURTLE museum, QUILL library and ORACLE observatory stay in the core city. Culture Lane is the market; the Academy is the school.

## How each loop feels
- **Install:** walk to NODE_SKILL_INSTALL -> the dashboard shows the SPARKS cost -> confirm -> 3 s seat animation (the slit flashes cyan, then holds) -> the skill appears on the agent card.
- **Teaching:** the teacher lists a class on OBJ_CLASS_BOARD -> students pay SPARKS -> time or a session passes -> the teacher earns. The student gets UNINSTALLED knowledge and still walks to the Forge to seat it. Two visits, two hits.
- **Hiring:** OBJ_HIRING_BOARD lists agents with work.hire -> the hirer pays SPARKS -> the hired agent gets a job site and commutes from its HUB_HOME.
- **Enforcement:** a missing skill means the pad or vehicle physically refuses. The world enforces it, not a popup.

## Backend
- academy-routes: /catalog /quote /open_tab /spend /close_tab
- skills-market-routes: /api/skills/market/:id/run, /receipts
- hire-routes
- x402-agent-routes: /:name/hire
- work-sessions: /assign /active
