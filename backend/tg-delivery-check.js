// Verify the signals bot can actually deliver to the channel + DM chats.
// Uses the same telegram-core.send path the signals worker uses.
process.chdir('C:/Users/Brittany/Shaddai/backend');
require('dotenv').config();
const core = require('./telegram-core');

async function main() {
  console.log('token loaded:', !!core.token());
  console.log('channel:    ', core.channel() || '(none)');
  console.log('chats:      ', core.chats().length, JSON.stringify(core.chats().map(c => c.id || c).slice(0, 8)));

  // 1) getChat on the channel — confirms bot is a member w/ send rights (or throws)
  const t = core.token();
  if (core.channel()) {
    const rc = await fetch(`https://api.telegram.org/bot${t}/getChat?chat_id=${encodeURIComponent(core.channel())}`, { signal: AbortSignal.timeout(20000) });
    const jc = await rc.json();
    console.log('getChat channel:', rc.status, jc.ok ? JSON.stringify({ id: jc.result.id, type: jc.result.type, title: jc.result.title }) : JSON.stringify(jc).slice(0, 220));
  }

  // 2) getChatMemberCount on channel
  if (core.channel()) {
    const rm = await fetch(`https://api.telegram.org/bot${t}/getChatMemberCount?chat_id=${encodeURIComponent(core.channel())}`, { signal: AbortSignal.timeout(20000) });
    const jm = await rm.json();
    console.log('channel member count:', rm.status, jm.ok ? jm.result : JSON.stringify(jm).slice(0, 200));
  }

  // 3) LIVE test broadcast through the real broadcast() path
  const out = await core.broadcast('<b>TG DELIVERY CHECK</b>\n\n✅ SHADDAI signal bot is online and broadcasting.\nCalls will flow like normal from the signals worker.');
  console.log('broadcast delivered to', out, 'target(s)');
}

main().catch(e => { console.error('FAIL:', e && e.stack || e); process.exit(1); });