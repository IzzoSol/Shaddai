// ─────────────────────────────────────────────────────────────────────────────
// COCKPIT DATA — the cockpit's only source of truth.
//
// Every panel and compartment reads from here. Each loader returns
// { ok, items, note } — `ok:false` means the endpoint didn't answer, and the UI
// says so rather than showing an invented number. Nothing here fabricates data.
//
// Endpoint map (verified against this backend, not assumed):
//   /api/overview        corpus stats per agent (videos, chunks, words, topics)
//   /api/digests?agent=  distilled lessons for an agent
//   /api/agent/tools     live tool registry (name, description, category, agents)
//   /api/skills/catalog  3,022 skills (id, name, description, agent, category)
//   /api/ainl/list       .ainl workflow files (real, runnable)
//   /api/agent/workflows built-in workflow templates
//   /api/ask?q&agent     grounded answer + sources (real TF-IDF retrieval)
//   /api/tools/run       execute one tool
//   /api/ainl/run        execute one workflow
// ─────────────────────────────────────────────────────────────────────────────
'use strict';

const TIMEOUT_MS = 9000;

// The cockpit is often opened from a static file server (python http.server on
// :8123) while the API lives on the backend's own port. Probe same-origin first
// and fall back to :3000 so it works either way without hand-editing URLs.
export let API_BASE = '';
let _resolved = null;

export function resolveBase() {
  if (_resolved) return _resolved;
  _resolved = (async () => {
    for (const base of ['', 'http://localhost:3000']) {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 3500);
        const r = await fetch(base + '/api/overview', { signal: ctl.signal });
        clearTimeout(t);
        if (r.ok) { API_BASE = base; return base; }
      } catch (_) { /* try next */ }
    }
    API_BASE = '';
    return '';
  })();
  return _resolved;
}

async function get(url, timeout = TIMEOUT_MS) {
  await resolveBase();
  url = API_BASE + url;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) return { ok: false, note: `HTTP ${r.status}` };
    return { ok: true, data: await r.json() };
  } catch (e) {
    return { ok: false, note: e.name === 'AbortError' ? 'timeout' : 'offline' };
  } finally { clearTimeout(t); }
}

async function post(url, body) {
  await resolveBase();
  url = API_BASE + url;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 60000);
  try {
    const r = await fetch(url, {
      method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, note: `HTTP ${r.status}`, data };
    return { ok: true, data };
  } catch (e) {
    return { ok: false, note: e.name === 'AbortError' ? 'timeout' : 'offline' };
  } finally { clearTimeout(t); }
}

/** Corpus overview — also tells the cockpit whether it is LIVE at all. */
export async function loadOverview() {
  const r = await get('/api/overview');
  if (!r.ok) return { ok: false, note: r.note, agents: [] };
  const d = r.data || {};
  return {
    ok: true,
    agents: d.agents || [],
    videos: d.videos ?? 0,
    chunks: d.chunks ?? d.n_chunks ?? 0,
    words: d.words ?? 0,
  };
}

/** CRANIUM — what the agent knows. */
export async function loadKnowledge(agent) {
  const r = await get(`/api/digests?agent=${encodeURIComponent(agent)}`);
  if (r.ok) {
    const raw = r.data?.digests || r.data?.items || (Array.isArray(r.data) ? r.data : []);
    if (raw.length) {
      return {
        ok: true,
        items: raw.slice(0, 60).map((d) => ({
          title: d.title || d.name || 'untitled',
          detail: d.thesis || d.summary || '',
        })),
      };
    }
  }
  // Fall back to the agent's real topic list from the overview.
  const o = await loadOverview();
  const a = (o.agents || []).find((x) => String(x.id || '').toUpperCase() === agent);
  if (a?.topics?.length) {
    return {
      ok: true,
      items: a.topics.slice(0, 60).map(([t, n]) => ({ title: t, detail: `${n} chunks` })),
    };
  }
  return { ok: false, note: r.note || 'no digests', items: [] };
}

/** OPTICS — what the agent can operate. */
export async function loadTools(agent) {
  const r = await get('/api/agent/tools');
  if (!r.ok) return { ok: false, note: r.note, items: [] };
  const all = r.data?.tools || [];
  const mine = all.filter((t) => {
    const a = t.agents;
    if (!a || (Array.isArray(a) && (!a.length || a.includes('ALL')))) return true;
    return Array.isArray(a) ? a.map(String).map((s) => s.toUpperCase()).includes(agent) : true;
  });
  return {
    ok: true,
    total: all.length,
    items: (mine.length ? mine : all).slice(0, 80).map((t) => ({
      title: t.name, detail: t.description || t.category || '', runnable: true, tool: t.name,
    })),
  };
}

/** JAW — what the agent knows how to do. */
export async function loadSkills(agent) {
  // The catalog is PAGINATED (default 60/page of ~3,163). Ask for a large page
  // and read the real corpus size off `total`, not the page length — otherwise
  // the drawer reports "of 60" for a 3,163-skill catalog.
  const r = await get('/api/skills/catalog?limit=1000', 30000);
  if (!r.ok) return { ok: false, note: r.note, items: [] };
  const all = r.data?.skills || [];
  const mine = all.filter((s) => String(s.agent || '').toUpperCase() === agent);
  return {
    ok: true,
    total: r.data?.total ?? all.length,
    loaded: all.length,
    mineTotal: mine.length,
    items: mine.slice(0, 80).map((s) => ({
      title: s.name, detail: s.category || s.description || '',
      runnable: true, kind: 'skill', ref: s.id || s.name,
    })),
  };
}

/** COLUMN — the loops: runnable scripts and workflows. */
export async function loadScripts() {
  const [ainl, wf] = await Promise.all([get('/api/ainl/list'), get('/api/agent/workflows')]);
  const items = [];
  if (ainl.ok) {
    const list = ainl.data?.workflows || ainl.data?.list || (Array.isArray(ainl.data) ? ainl.data : []);
    list.forEach((w) => items.push({
      title: w.name || w.file || String(w),
      detail: w.description || '.ainl workflow',
      runnable: true, kind: 'ainl', ref: w.file || w.name || String(w),
    }));
  }
  if (wf.ok) {
    const list = wf.data?.workflows || (Array.isArray(wf.data) ? wf.data : []);
    list.forEach((w) => items.push({
      title: w.name || w.id,
      detail: w.description || 'workflow template',
      runnable: true, kind: 'template', ref: w.id || w.name,
    }));
  }
  if (!items.length) return { ok: false, note: ainl.note || wf.note || 'none', items: [] };
  return { ok: true, items };
}

/** Grounded query — the grounding laser's actual payload. */
export async function ask(query, agent) {
  // Retrieval loads a large TF-IDF index on first call — 9s is not enough.
  const r = await get(`/api/ask?q=${encodeURIComponent(query)}&agent=${encodeURIComponent(agent)}`, 60000);
  if (!r.ok) return { ok: false, note: r.note };
  const d = r.data || {};
  return {
    ok: true,
    answer: d.answer || '',
    provider: d.provider || (d.llm_powered ? 'llm' : 'rag-only'),
    ms: d.ms,
    sources: d.sources || [],
  };
}

/**
 * Materialise the actual chunk behind a shard — the "why did it say that?"
 * path. Uses real retrieval; returns the top passages verbatim.
 */
export async function inspectShard(term, agent) {
  const r = await get(`/api/search?q=${encodeURIComponent(term)}&agent=${encodeURIComponent(agent)}&k=3`, 45000);
  if (!r.ok) return { ok: false, note: r.note, passages: [] };
  const rows = r.data?.results || [];
  return {
    ok: true,
    ms: r.data?.ms,
    passages: rows.map((c) => ({
      title: c.title || c.docName || c.video_id || 'chunk',
      text: c.text || c.chunkText || '',
      score: c.score,
      time: c.timeLabel || null,
      link: c.deepLink || null,
    })),
  };
}

/** Put the question to every agent at once. */
export async function askCouncil(query, k = 3) {
  // Council can take ~35s: it runs retrieval for all seven agents.
  const r = await get(`/api/council?q=${encodeURIComponent(query)}&k=${k}`, 120000);
  if (!r.ok) return { ok: false, note: r.note, agents: [] };
  // Shape is { agents:[{id, role, color, score, chunks, results:[{title,text}]}] }
  // — there is no `answer` field; earlier code looked for one and rendered blanks.
  const agents = (r.data?.agents || []).map((a) => ({
    id: String(a.id || a.agent || '').toUpperCase(),
    role: a.role || '',
    color: a.color || null,
    score: a.score,
    chunks: a.chunks,
    passages: (a.results || []).map((x) => ({
      title: x.title || 'source',
      text: x.text || '',
    })),
  })).sort((x, y) => (y.score || 0) - (x.score || 0));
  return { ok: true, agents, ms: r.data?.ms };
}

/**
 * Skills execute ASYNCHRONOUSLY: /api/skills/run returns a taskId, and the
 * actual work (tool steps + result) lands later on /api/agent/task/:id.
 * Fire, then poll until it settles, so the UI can show what really happened.
 */
export async function runSkill(skillId, agent, onTick, input) {
  const body = { skillId, agent };
  // The runner reads arguments from a NESTED `input` object and passes them
  // straight through as tool params — flat top-level keys are ignored. Spread
  // the one value across the common param names so whichever the tool wants is
  // there (verified: input:{repo:'owner/name'} reaches get_github_repo).
  if (input) {
    body.input = { input, query: input, topic: input, symbol: input, repo: input, url: input, text: input };
  }
  const started = await post('/api/skills/run', body);
  if (!started.ok) return { ok: false, note: started.note || started.data?.error || 'failed to start' };
  const taskId = started.data?.taskId;
  if (!taskId) return { ok: true, status: 'started', steps: [], result: started.data };

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const t = await get(`/api/agent/task/${taskId}`, 15000);
    if (!t.ok) continue;
    const d = t.data || {};
    if (onTick) onTick(d);
    if (d.status === 'completed' || d.status === 'failed' || d.status === 'error') {
      return {
        ok: d.status === 'completed',
        status: d.status,
        steps: d.steps || [],
        result: d.result,
        tools: d.tools_used || [],
        taskId,
      };
    }
  }
  return { ok: false, note: 'still running', taskId };
}

export async function runTool(tool, args = {}) { return post('/api/tools/run', { tool, args }); }
export async function runWorkflow(ref, input) {
  return post('/api/ainl/run', { workflow: ref, inputs: input ? { input, topic: input, query: input } : {} });
}

export const SLOT_LOADERS = {
  knowledge: loadKnowledge,
  tools: loadTools,
  skills: loadSkills,
  scripts: () => loadScripts(),
};
