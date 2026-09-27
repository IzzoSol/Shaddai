process.chdir('C:/Users/Brittany/Shaddai/backend');
require('dotenv').config();
const core = require('./telegram-core');
const t = core.token();

async function trySend(label, chatId, text) {
  try {
    const r = await fetch(`https://api.telegram.org/bot${t}/sendMessage`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_notification: true, disable_web_page_preview: true }),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    console.log(`${label} ${chatId} -> ${j.ok ? 'SENT id=' + j.result.message_id : j.description}`);
    return j.ok;
  } catch (e) { console.log(`${label} ${chatId} -> ERR ${e.message}`); return false; }
}

(async () => {
  console.log('token prefix:', t.slice(0, 8) + '...');
  await trySend('signals-channel', '@ShaddaiSignals', 'PROBE via SHADDAI signals');
  await trySend('sig-num-id', '-1004433718662', 'PROBE via SHADDAI signals (numeric)');
  await trySend('temple-bot', '@ShaddaiTempleBot', 'PROBE');
})();