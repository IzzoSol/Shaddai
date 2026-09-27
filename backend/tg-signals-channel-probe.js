process.chdir('C:/Users/Brittany/Shaddai/backend');
require('dotenv').config();
const core = require('./telegram-core');
const t = core.token();

async function q(label, value) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${t}/getChat?chat_id=${encodeURIComponent(value)}`, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    if (j.ok) {
      const d = j.result;
      console.log(`${label} ${value} -> OK type=${d.type} id=${d.id} title="${d.username || d.title || ''}"`);
      return d.id;
    } else {
      console.log(`${label} ${value} -> ${j.error_code} ${j.description}`);
      return null;
    }
  } catch (e) { console.log(`${label} ${value} -> ERR ${e.message}`); return null; }
}

(async () => {
  console.log('token:', t ? t.slice(0, 8) + '...' : 'NONE');
  const a = await q('channel', '@ShaddaiSignals');
  await q('channel', '-1004433718662');
  await q('botme', '@ShaddaiTempleBot');
  if (a) {
    const rm = await fetch(`https://api.telegram.org/bot${t}/getChatMember?chat_id=${encodeURIComponent(a)}&user_id=8862650635`, { signal: AbortSignal.timeout(20000) });
    const jm = await rm.json();
    console.log('membership in @ShaddaiSignals:', jm.ok ? jm.result.status : (jm.description || 'ERR'));
  }
})();