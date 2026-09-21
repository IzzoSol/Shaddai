/* SHADDAI · in-game dialogs — replaces the browser's blocking alert()/confirm()/prompt()
   with a non-blocking on-screen toast + styled modals that match the gold/obsidian look. */
(function () {
  if (window.__igd) return; window.__igd = 1;
  var css = document.createElement('style');
  css.textContent = '#igd-wrap{position:fixed;left:50%;top:14px;transform:translateX(-50%);z-index:2147483000;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;max-width:min(92vw,520px)}' +
    '.igd-t{pointer-events:auto;background:rgba(8,11,18,.94);border:1px solid rgba(232,196,92,.55);color:#f2e6c0;font:600 13px/1.4 system-ui,sans-serif;letter-spacing:.03em;padding:10px 16px;border-radius:12px;box-shadow:0 0 22px rgba(232,196,92,.18);white-space:pre-line;cursor:pointer;opacity:0;transform:translateY(-8px);transition:opacity .25s,transform .25s}' +
    '.igd-t.on{opacity:1;transform:none}' +
    '#igd-mask{position:fixed;inset:0;z-index:2147483010;background:rgba(4,6,10,.72);display:flex;align-items:center;justify-content:center;animation:igdFade .15s ease-out}' +
    '#igd-mask.hide{display:none}' +
    '.igd-modal{background:linear-gradient(180deg,#10151f,#0a0e16);border:1px solid rgba(232,196,92,.5);border-radius:14px;box-shadow:0 0 34px rgba(232,196,92,.18);padding:20px 22px;max-width:min(92vw,440px);width:100%;font-family:system-ui,sans-serif}' +
    '.igd-modal h3{margin:0 0 6px;font:700 15px/1.3 system-ui,sans-serif;color:#e8c45c;letter-spacing:.04em}' +
    '.igd-modal p{margin:0 0 14px;font:500 13px/1.5 system-ui,sans-serif;color:#f2e6c0;white-space:pre-line}' +
    '.igd-modal input{box-sizing:border-box;width:100%;background:#0c1119;border:1px solid rgba(232,196,92,.4);color:#f2e6c0;font:600 14px system-ui,sans-serif;border-radius:9px;padding:10px 12px;outline:none}' +
    '.igd-modal input:focus{border-color:#e8c45c;box-shadow:0 0 10px rgba(232,196,92,.22)}' +
    '.igd-btns{display:flex;gap:10px;justify-content:flex-end;margin-top:18px}' +
    '.igd-btns button{cursor:pointer;font:600 13px system-ui,sans-serif;border-radius:8px;border:1px solid rgba(232,196,92,.5);background:transparent;color:#f2e6c0;padding:9px 16px;transition:.12s}' +
    '.igd-btns button:hover{border-color:#e8c45c;background:rgba(232,196,92,.1)}' +
    '.igd-btns button.igd-ok{background:linear-gradient(180deg,#ffe38a,#e8c45c);color:#241c06;border:1px solid #b8912e;font-weight:800}' +
    '.igd-btns button.igd-ok:hover{filter:brightness(1.06);background:linear-gradient(180deg,#ffe38a,#e8c45c)}' +
    '@keyframes igdFade{from{opacity:0}to{opacity:1}}';
  if (document.head) document.head.appendChild(css); else document.addEventListener('DOMContentLoaded', function () { document.head.appendChild(css); });

  function wrap() { var w = document.getElementById('igd-wrap'); if (!w) { w = document.createElement('div'); w.id = 'igd-wrap'; (document.body || document.documentElement).appendChild(w); } return w; }

  /* toast — non-blocking status message that fades itself after ms (default 3.8s) */
  window.gameToast = function (msg, ms) {
    var t = document.createElement('div'); t.className = 'igd-t'; t.textContent = String(msg == null ? '' : msg); wrap().appendChild(t);
    requestAnimationFrame(function () { t.classList.add('on'); });
    var kill = function () { t.classList.remove('on'); setTimeout(function () { t.remove(); }, 300); };
    t.onclick = kill; setTimeout(kill, ms || 3800);
  };

  /* confirm — in-game Yes/No modal; onYes(true/false) is called once */
  window.gameConfirm = function (text, onYes, okLabel) {
    if (!onYes) return; var m = document.getElementById('igd-mask'); if (m) m.remove();
    var mask = document.createElement('div'); mask.id = 'igd-mask';
    mask.innerHTML = '<div class="igd-modal"><h3>Confirm</h3><p></p><div class="igd-btns"><button class="igd-no">Cancel</button><button class="igd-ok">' + (okLabel || 'Yes') + '</button></div></div>';
    mask.querySelector('p').textContent = String(text == null ? '' : text);
    var done = function (v) { mask.remove(); onYes(!!v); };
    mask.querySelector('.igd-no').onclick = function () { done(false); };
    mask.querySelector('.igd-ok').onclick = function () { done(true); };
    mask.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(false); if (e.key === 'Enter') done(true); });
    (document.body || document.documentElement).appendChild(mask); mask.querySelector('.igd-ok').focus();
  };

  /* prompt — in-game text-input modal; onValue(valueOrNull) is called once */
  window.gamePrompt = function (text, defVal, onValue, okLabel) {
    if (!onValue) return; var m = document.getElementById('igd-mask'); if (m) m.remove();
    var mask = document.createElement('div'); mask.id = 'igd-mask';
    mask.innerHTML = '<div class="igd-modal"><h3>SHADDAI</h3><p></p><input type="text" maxlength="60"><div class="igd-btns"><button class="igd-no">Cancel</button><button class="igd-ok">' + (okLabel || 'OK') + '</button></div></div>';
    mask.querySelector('p').textContent = String(text == null ? '' : text);
    var inp = mask.querySelector('input'); inp.value = defVal == null ? '' : String(defVal);
    var done = function () { mask.remove(); onValue(inp.value == null ? null : String(inp.value)); };
    var cancel = function () { mask.remove(); onValue(null); };
    mask.querySelector('.igd-no').onclick = cancel;
    mask.querySelector('.igd-ok').onclick = function () { done(); };
    mask.addEventListener('keydown', function (e) { if (e.key === 'Escape') cancel(); if (e.key === 'Enter') done(); });
    (document.body || document.documentElement).appendChild(mask); inp.focus(); inp.select();
  };

  /* every alert() anywhere now shows as a toast instead of blocking */
  window.alert = function (m) { window.gameToast(m); };
})();