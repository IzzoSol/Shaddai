// SERIOUS AUDIT: does every agent's assigned tool actually exist and RUN for real?
//   node backend/scripts/audit-tools.js
// Classifies each tool: REAL (returned live data) · EMPTY · ERROR · NEEDS-KEY · MISSING · MUTATING(skipped)
const { TOOLS, AGENTS } = require('../agent-engine.js');

// Safe default params so tools that need input can still run.
const SAFE = {
  symbol:'bitcoin', coin:'bitcoin', ids:'bitcoin', query:'bitcoin', q:'bitcoin', search:'bitcoin',
  text:'hello world', message:'hello world', content:'hello world', word:'test', topic:'bitcoin',
  url:'https://example.com', address:'0x0000000000000000000000000000000000000000',
  city:'London', country:'France', repo:'facebook/react', owner:'facebook', name:'react', package:'react',
  limit:3, subreddit:'technology', language:'javascript', tag:'javascript', category:'technology',
  expression:'2+2', code:'const x = 1;', json:'{"a":1}', hex:'ff0000', ip:'8.8.8.8', tags:'javascript',
};
// Tools that MUTATE or cost money/credits — never auto-run in an audit.
const MUTATING = /(post|send|tweet|publish|share|reply|comment|dm_|email|mint|deploy|shorten|buy|sell|swap|trade|transfer|sign|pay|vote|generate_image|draw|render|upload|write_file|create_github|webhook|complete_job|save_to_inbox|save_memory|execute_trade|set_)/i;

function classifyError(msg){
  return /key|token|auth|401|403|unauthorized|forbidden|not configured|api_key|apikey|credential/i.test(String(msg)) ? 'NEEDS-KEY' : 'ERROR';
}
function classifyResult(r){
  const s = typeof r === 'string' ? r : JSON.stringify(r||'');
  if (!s || s.length < 2) return 'EMPTY';
  if (/no .*data|not found|no results|failed|unavailable|try the full|needs? (a )?key|not configured|invalid|error/i.test(s.slice(0,120))) return 'EMPTY';
  return 'REAL';
}
async function runTool(name){
  const t = TOOLS[name];
  if (!t) return { status:'MISSING' };
  if (typeof t.execute !== 'function') return { status:'MISSING', note:'no execute' };
  if (MUTATING.test(name)) return { status:'MUTATING' };
  try{
    const r = await Promise.race([
      t.execute(SAFE),
      new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')),13000)),
    ]);
    return { status: classifyResult(r), sample: (typeof r==='string'?r:JSON.stringify(r)).replace(/\s+/g,' ').slice(0,70) };
  }catch(e){ return { status: classifyError(e.message), err: String(e.message).slice(0,60) }; }
}

(async () => {
  const agentNames = Object.keys(AGENTS);
  const allAssigned = new Set();
  const tally = { REAL:0, EMPTY:0, ERROR:0, 'NEEDS-KEY':0, MISSING:0, MUTATING:0 };
  const problems = { MISSING:[], ERROR:[], EMPTY:[], 'NEEDS-KEY':[] };

  for (const an of agentNames){
    const tools = (AGENTS[an].tools)||[];
    if (!tools.length) continue;
    console.log(`\n===== ${an} (${tools.length} tools) =====`);
    for (const name of tools){
      allAssigned.add(name);
      const res = await runTool(name);
      tally[res.status] = (tally[res.status]||0)+1;
      if (problems[res.status]) problems[res.status].push(`${an}:${name}${res.err?' ('+res.err+')':''}`);
      const mark = { REAL:'✅', EMPTY:'⚪', ERROR:'❌', 'NEEDS-KEY':'🔑', MISSING:'⛔', MUTATING:'✋' }[res.status]||'?';
      console.log(`  ${mark} ${res.status.padEnd(9)} ${name}${res.sample?'  → '+res.sample:''}${res.err?'  ! '+res.err:''}`);
    }
  }

  console.log(`\n${'='.repeat(60)}\nSUMMARY (${allAssigned.size} unique assigned tools)`);
  for (const k of Object.keys(tally)) console.log(`  ${k.padEnd(10)}: ${tally[k]}`);
  for (const k of ['MISSING','ERROR']){
    if (problems[k].length) console.log(`\n⚠ ${k} — FIX OR REMOVE:\n  ` + problems[k].join('\n  '));
  }
  if (problems['NEEDS-KEY'].length) console.log(`\n🔑 NEEDS-KEY (real but needs a key wired):\n  ` + problems['NEEDS-KEY'].join('\n  '));
  process.exit(0);
})().catch(e=>{ console.error('AUDIT CRASH', e); process.exit(1); });
