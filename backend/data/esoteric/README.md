# Esoteric Corpus — SHADDAI's deeper knowledge layer

Drop your esoteric texts here (Human Design, astrology, numerology, sacred geometry,
philosophy, your own writings — any `.md` or `.txt`). They become an **on-demand**
knowledge layer the agents draw from *only when a task calls for it* — they are NOT
injected into every prompt (that would burn tokens and fight AURA).

## How it works
- Each agent already carries a concise **Human Design** chart in `../agents/NAME.md`
  (Type · Strategy · Authority · Profile), injected into its prompt so HD actually
  shapes how it thinks and decides.
- Files placed here are the *reference library* behind that — pulled in when the
  request is esoteric/interpretive, grounded in YOUR texts (the agents won't invent
  doctrine; they cite what's here).

## Suggested files
- `human-design-intro.md` — the system in your words
- `type-strategies.md`, `authority-guide.md`, `profile-roles.md`, `centers-gates.md`
- `<your-own-texts>.md` — anything you want the council to reason from

Just add files; no restart needed beyond the next agent run.
