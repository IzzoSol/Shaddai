process.chdir('C:/Users/Brittany/Shaddai/backend');
require('dotenv').config();
const core = require('./telegram-core');
const t = core.token();

async function chat(scope, id) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${t}/getChat?chat_id=${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(20000) });
    const j = await r.json();
    if (j.ok) {
      const m = await fetch(`https://api.telegram.org/bot${t}/getChatMember?chat_id=${encodeURIComponent(id)}&user_id=${process.env.TELEGRAM_BOT_ID || 8862650635}`, { signal: AbortSignal.timeout(20000) });
      const jm = await m.json();
      const botStatus = jm.ok ? (jm.result.status + (jm.result.can_post_messages !== undefined ? ` can_post=${jm.result.can_post_messages}` : '')) : jm.description || '?';
      console.log(`${scope}  ${id}  type=${j.result.type}  title="${j.result.title || j.result.first_name || ''}"  uname=${j.result.username || '-'}  bot=${botStatus}`);
    } else {
      console.log(`${scope}  ${id}  ${j.description || JSON.stringify(j).slice(0,120)}`);
    }
  } catch (e) { console.log(`${scope}  ${id}  ERR ${e.message}`); }
}

(async () => {
  for (const id of core.chats().map(c => c.id || c)) await chat('chat', id);
  if (core.channel()) await chat('CHANNEL', core.channel());
})();