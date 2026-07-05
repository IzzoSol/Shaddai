/**
 * world-chat.js — SHADDAI World In-World Chat Panel
 * NEXUS build · neon/cyber aesthetic · polling-based (Render-safe)
 *
 * Usage (called by the world lead after <script src="/world-chat.js">):
 *
 *   const chat = window.buildWorldChat();
 *   chat.start();                  // init, name-prompt, begin polling
 *   chat.toggle();                 // open/close   [default key: T]
 *   chat.setRoom('nexus');         // switch ROOM channel (call on building entry)
 *   chat.show() / chat.hide();
 *   chat.isOpen();
 *
 * The panel is self-contained — appends to document.body, zero dependencies.
 */

(function () {
  'use strict';

  if (window.__shaddaiChatBuilt) return;   // idempotent
  window.__shaddaiChatBuilt = true;

  // ── Config ──────────────────────────────────────────────────────────────
  const API_BASE   = '/api/chat';
  const POLL_MS    = 2500;
  const LS_NAME    = 'shaddai_chat_handle';
  const LS_OPEN    = 'shaddai_chat_open';
  const REALM_CHAN = 'realm';

  // ── State ────────────────────────────────────────────────────────────────
  let currentRoom   = 'lobby';
  let activeTab     = 'realm';   // 'realm' | 'room'
  let operative     = '';
  let sinceRealm    = 0;
  let sinceRoom     = 0;
  let pollTimer     = null;
  let panelOpen     = false;
  let initialized   = false;

  // Message caches (keyed by channel id)
  const msgCache = {};

  // ── Styles ───────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('shaddai-chat-styles')) return;
    const s = document.createElement('style');
    s.id = 'shaddai-chat-styles';
    s.textContent = `
      #shaddai-chat-panel {
        position: fixed;
        bottom: 20px;
        left: 20px;
        width: 340px;
        max-height: 420px;
        display: flex;
        flex-direction: column;
        background: rgba(5, 8, 20, 0.93);
        border: 1px solid rgba(0, 255, 255, 0.35);
        border-radius: 10px;
        box-shadow: 0 0 24px rgba(0, 255, 255, 0.15), inset 0 0 40px rgba(0,0,0,0.5);
        font-family: 'Share Tech Mono', 'Courier New', monospace;
        font-size: 12px;
        color: #c8f0ff;
        z-index: 9999;
        transition: opacity .2s, transform .2s;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
      }
      #shaddai-chat-panel.shc-hidden {
        opacity: 0;
        pointer-events: none;
        transform: translateY(8px);
      }
      /* Header */
      #shc-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px 0;
        border-bottom: 1px solid rgba(0,255,255,0.15);
        flex-shrink: 0;
      }
      #shc-title {
        color: #00ffff;
        font-size: 11px;
        letter-spacing: 2px;
        text-transform: uppercase;
        text-shadow: 0 0 8px #00ffff;
      }
      #shc-close-btn {
        background: none;
        border: none;
        color: #555;
        font-size: 16px;
        cursor: pointer;
        line-height: 1;
        padding: 0 0 4px;
      }
      #shc-close-btn:hover { color: #ff4466; }
      /* Tab switcher */
      #shc-tabs {
        display: flex;
        gap: 0;
        padding: 6px 12px 0;
        flex-shrink: 0;
      }
      .shc-tab {
        background: none;
        border: 1px solid rgba(0,255,255,0.2);
        border-bottom: none;
        color: #667788;
        font-family: inherit;
        font-size: 11px;
        letter-spacing: 1px;
        text-transform: uppercase;
        padding: 4px 14px;
        cursor: pointer;
        border-radius: 4px 4px 0 0;
        transition: color .15s, background .15s;
      }
      .shc-tab.active {
        color: #00ffff;
        background: rgba(0,255,255,0.08);
        border-color: rgba(0,255,255,0.45);
        text-shadow: 0 0 6px #00ffff;
      }
      .shc-tab:hover:not(.active) { color: #aaddee; }
      /* Room badge */
      #shc-room-badge {
        font-size: 9px;
        color: #ffcc44;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-left: 5px;
        opacity: 0.8;
      }
      /* Message list */
      #shc-messages {
        flex: 1;
        overflow-y: auto;
        padding: 8px 12px;
        min-height: 180px;
        max-height: 240px;
        scrollbar-width: thin;
        scrollbar-color: rgba(0,255,255,0.2) transparent;
      }
      #shc-messages::-webkit-scrollbar { width: 4px; }
      #shc-messages::-webkit-scrollbar-track { background: transparent; }
      #shc-messages::-webkit-scrollbar-thumb { background: rgba(0,255,255,0.2); border-radius: 2px; }
      .shc-msg {
        margin: 0 0 7px;
        line-height: 1.45;
        word-break: break-word;
        animation: shcFadeIn .2s ease;
      }
      @keyframes shcFadeIn { from { opacity:0; transform: translateY(4px); } to { opacity:1; transform:none; } }
      .shc-msg-name {
        color: #ffcc44;
        font-weight: bold;
        text-shadow: 0 0 5px rgba(255,200,60,0.4);
        margin-right: 5px;
      }
      .shc-msg-name.is-self { color: #00ffcc; text-shadow: 0 0 5px rgba(0,255,180,0.4); }
      .shc-msg-text { color: #c8eeff; }
      .shc-msg-time { color: #334455; font-size: 10px; margin-left: 5px; }
      .shc-system {
        color: rgba(0,255,255,0.4);
        font-style: italic;
        font-size: 11px;
        margin: 4px 0;
        text-align: center;
      }
      .shc-empty {
        color: #334455;
        font-style: italic;
        text-align: center;
        margin-top: 20px;
        font-size: 11px;
      }
      /* Input row */
      #shc-input-row {
        display: flex;
        gap: 6px;
        padding: 8px 10px 10px;
        border-top: 1px solid rgba(0,255,255,0.1);
        flex-shrink: 0;
      }
      #shc-input {
        flex: 1;
        background: rgba(0,255,255,0.05);
        border: 1px solid rgba(0,255,255,0.2);
        border-radius: 5px;
        color: #c8f0ff;
        font-family: inherit;
        font-size: 12px;
        padding: 5px 8px;
        outline: none;
        transition: border-color .2s;
      }
      #shc-input:focus { border-color: rgba(0,255,255,0.5); background: rgba(0,255,255,0.08); }
      #shc-input::placeholder { color: #334455; }
      #shc-send-btn {
        background: linear-gradient(135deg, rgba(0,255,255,0.15), rgba(0,200,255,0.08));
        border: 1px solid rgba(0,255,255,0.35);
        border-radius: 5px;
        color: #00ffff;
        font-family: inherit;
        font-size: 11px;
        padding: 5px 12px;
        cursor: pointer;
        letter-spacing: 1px;
        text-shadow: 0 0 6px #00ffff;
        transition: background .15s, box-shadow .15s;
        flex-shrink: 0;
      }
      #shc-send-btn:hover {
        background: rgba(0,255,255,0.2);
        box-shadow: 0 0 10px rgba(0,255,255,0.2);
      }
      #shc-send-btn:active { transform: scale(0.96); }
      /* Toggle button (always visible) */
      #shaddai-chat-toggle {
        position: fixed;
        bottom: 20px;
        left: 20px;
        background: rgba(5,8,20,0.88);
        border: 1px solid rgba(0,255,255,0.4);
        border-radius: 6px;
        color: #00ffff;
        font-family: 'Share Tech Mono', 'Courier New', monospace;
        font-size: 11px;
        letter-spacing: 1px;
        padding: 7px 12px;
        cursor: pointer;
        z-index: 9998;
        text-shadow: 0 0 6px #00ffff;
        box-shadow: 0 0 12px rgba(0,255,255,0.1);
        transition: background .15s;
        display: none;
      }
      #addai-chat-toggle:hover { background: rgba(0,255,255,0.12); }
      /* Unread dot */
      #shc-unread-dot {
        display: inline-block;
        width: 7px;
        height: 7px;
        background: #ff4466;
        border-radius: 50%;
        margin-left: 5px;
        vertical-align: middle;
        box-shadow: 0 0 6px #ff4466;
      }
      /* Name prompt overlay */
      #shc-name-prompt {
        position: absolute;
        inset: 0;
        background: rgba(5,8,20,0.97);
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 14px;
        padding: 24px;
        z-index: 10;
      }
      #shc-name-prompt h3 {
        color: #00ffff;
        font-size: 13px;
        letter-spacing: 2px;
        text-transform: uppercase;
        text-shadow: 0 0 10px #00ffff;
        margin: 0;
        text-align: center;
      }
      #shc-name-prompt p {
        color: #667788;
        font-size: 11px;
        margin: 0;
        text-align: center;
        line-height: 1.5;
      }
      #shc-name-input {
        background: rgba(0,255,255,0.05);
        border: 1px solid rgba(0,255,255,0.3);
        border-radius: 5px;
        color: #c8f0ff;
        font-family: inherit;
        font-size: 13px;
        padding: 8px 12px;
        outline: none;
        width: 100%;
        box-sizing: border-box;
        text-align: center;
        letter-spacing: 1px;
      }
      #shc-name-input:focus { border-color: rgba(0,255,255,0.6); }
      #shc-name-submit {
        background: rgba(0,255,255,0.12);
        border: 1px solid rgba(0,255,255,0.4);
        border-radius: 5px;
        color: #00ffff;
        font-family: inherit;
        font-size: 12px;
        letter-spacing: 2px;
        padding: 8px 24px;
        cursor: pointer;
        text-shadow: 0 0 6px #00ffff;
        transition: background .15s;
      }
      #shc-name-submit:hover { background: rgba(0,255,255,0.22); }
    `;
    document.head.appendChild(s);
  }

  // ── DOM Construction ─────────────────────────────────────────────────────
  let panel, msgList, textInput, tabRealm, tabRoom, roomBadge, namePromptEl;

  function buildPanel() {
    injectStyles();

    // Main panel
    panel = document.createElement('div');
    panel.id = 'shaddai-chat-panel';
    panel.classList.add('shc-hidden');
    panel.innerHTML = `
      <div id="shc-header">
        <span id="shc-title">⬡ SHADDAI REALM CHAT</span>
        <button id="shc-close-btn" title="Close chat (T)">✕</button>
      </div>
      <div id="shc-tabs">
        <button class="shc-tab active" data-tab="realm">REALM</button>
        <button class="shc-tab" data-tab="room">ROOM <span id="shc-room-badge">lobby</span></button>
      </div>
      <div id="shc-messages"><div class="shc-empty">No messages yet. Say something!</div></div>
      <div id="shc-input-row">
        <input id="shc-input" type="text" maxlength="300" placeholder="Say something..." autocomplete="off" />
        <button id="shc-send-btn">SEND</button>
      </div>
    `;
    document.body.appendChild(panel);

    // Grab refs
    msgList   = panel.querySelector('#shc-messages');
    textInput = panel.querySelector('#shc-input');
    tabRealm  = panel.querySelector('[data-tab="realm"]');
    tabRoom   = panel.querySelector('[data-tab="room"]');
    roomBadge = panel.querySelector('#shc-room-badge');

    // Wire tab buttons
    panel.querySelector('#shc-tabs').addEventListener('click', e => {
      const btn = e.target.closest('.shc-tab');
      if (!btn) return;
      switchTab(btn.dataset.tab);
    });

    // Close button
    panel.querySelector('#shc-close-btn').addEventListener('click', () => hide());

    // Send on button or Enter
    panel.querySelector('#shc-send-btn').addEventListener('click', sendMessage);
    textInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }

  // ── Name Prompt ─────────────────────────────────────────────────────────
  function showNamePrompt(cb) {
    if (namePromptEl) { namePromptEl.remove(); namePromptEl = null; }

    const adjectives = ['NEON','DARK','CYBER','VOID','FLUX','IRON','GHOST','AURA','SOLAR','APEX'];
    const nouns      = ['WOLF','OWL','RAVEN','FORGE','NODE','SHARD','ECHO','PRISM','NEXUS','BYTE'];
    const rand = arr => arr[Math.floor(Math.random() * arr.length)];
    const suggestion = rand(adjectives) + '_' + rand(nouns);

    namePromptEl = document.createElement('div');
    namePromptEl.id = 'shc-name-prompt';
    namePromptEl.innerHTML = `
      <h3>CHOOSE YOUR OPERATIVE HANDLE</h3>
      <p>Your display name in SHADDAI Realm Chat.<br>Max 24 characters.</p>
      <input id="shc-name-input" type="text" maxlength="24" placeholder="${suggestion}" autocomplete="off" />
      <button id="shc-name-submit">ENTER THE REALM</button>
    `;
    panel.appendChild(namePromptEl);

    const nameInput  = namePromptEl.querySelector('#shc-name-input');
    const submitBtn  = namePromptEl.querySelector('#shc-name-submit');

    setTimeout(() => nameInput.focus(), 50);

    const confirm = () => {
      let name = nameInput.value.trim().slice(0, 24);
      if (!name) name = suggestion;
      operative = name;
      localStorage.setItem(LS_NAME, name);
      namePromptEl.remove();
      namePromptEl = null;
      cb(name);
    };

    submitBtn.addEventListener('click', confirm);
    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
  }

  // ── Tab switching ────────────────────────────────────────────────────────
  function switchTab(tab) {
    activeTab = tab;
    tabRealm.classList.toggle('active', tab === 'realm');
    tabRoom.classList.toggle('active', tab === 'room');
    renderMessages();
    textInput.focus();
  }

  function currentChannel() {
    return activeTab === 'realm' ? REALM_CHAN : currentRoom;
  }

  // ── Message rendering ────────────────────────────────────────────────────
  function renderMessages() {
    const chan = currentChannel();
    const msgs = msgCache[chan] || [];

    msgList.innerHTML = '';

    if (msgs.length === 0) {
      const el = document.createElement('div');
      el.className = 'shc-empty';
      el.textContent = activeTab === 'realm'
        ? 'Realm is quiet. Speak first.'
        : `No one in ${currentRoom} yet.`;
      msgList.appendChild(el);
      return;
    }

    for (const m of msgs) {
      const el  = document.createElement('div');
      el.className = 'shc-msg';
      el.dataset.id = m.id;

      const nameEl = document.createElement('span');
      nameEl.className = 'shc-msg-name' + (m.name === operative ? ' is-self' : '');
      nameEl.textContent = m.name + ':';

      const textEl = document.createElement('span');
      textEl.className = 'shc-msg-text';
      textEl.textContent = ' ' + m.text;   // textContent = no XSS

      const timeEl = document.createElement('span');
      timeEl.className = 'shc-msg-time';
      timeEl.textContent = formatTime(m.at);

      el.appendChild(nameEl);
      el.appendChild(textEl);
      el.appendChild(timeEl);
      msgList.appendChild(el);
    }

    msgList.scrollTop = msgList.scrollHeight;
  }

  function formatTime(epoch) {
    const d = new Date(epoch);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  // ── Append new messages (incremental) ────────────────────────────────────
  function appendMessages(chan, newMsgs) {
    if (!msgCache[chan]) msgCache[chan] = [];
    const existing = new Set(msgCache[chan].map(m => m.id));
    const fresh    = newMsgs.filter(m => !existing.has(m.id));
    if (!fresh.length) return false;

    msgCache[chan].push(...fresh);
    // Keep cache trimmed
    if (msgCache[chan].length > 200) msgCache[chan] = msgCache[chan].slice(-200);

    if (chan === currentChannel()) {
      // Append directly without full re-render for smoothness
      const wasAtBottom = msgList.scrollHeight - msgList.scrollTop - msgList.clientHeight < 40;
      const empty = msgList.querySelector('.shc-empty');
      if (empty) empty.remove();

      for (const m of fresh) {
        const el  = document.createElement('div');
        el.className = 'shc-msg';
        el.dataset.id = m.id;

        const nameEl = document.createElement('span');
        nameEl.className = 'shc-msg-name' + (m.name === operative ? ' is-self' : '');
        nameEl.textContent = m.name + ':';

        const textEl = document.createElement('span');
        textEl.className = 'shc-msg-text';
        textEl.textContent = ' ' + m.text;

        const timeEl = document.createElement('span');
        timeEl.className = 'shc-msg-time';
        timeEl.textContent = formatTime(m.at);

        el.appendChild(nameEl);
        el.appendChild(textEl);
        el.appendChild(timeEl);
        msgList.appendChild(el);
      }

      if (wasAtBottom) msgList.scrollTop = msgList.scrollHeight;
    }

    return true;
  }

  // ── Polling ──────────────────────────────────────────────────────────────
  async function pollChannel(chan, sinceRef) {
    try {
      const url = `${API_BASE}/${encodeURIComponent(chan)}?since=${sinceRef.val}`;
      const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
      if (!res.ok) return;
      const data = await res.json();
      if (!data.messages || !data.messages.length) return;
      appendMessages(chan, data.messages);
      sinceRef.val = data.ts || Date.now();
    } catch (_) {
      // offline — degrade silently
    }
  }

  const sinceRealmRef = { val: 0 };
  const sinceRoomRef  = { val: 0 };

  function startPolling() {
    stopPolling();
    const tick = async () => {
      if (!panelOpen) return;
      await pollChannel(REALM_CHAN, sinceRealmRef);
      if (currentRoom && currentRoom !== REALM_CHAN) {
        await pollChannel(currentRoom, sinceRoomRef);
      }
    };
    tick();
    pollTimer = setInterval(tick, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  // ── Send ─────────────────────────────────────────────────────────────────
  async function sendMessage() {
    const text = textInput.value.trim();
    if (!text) return;
    const chan = currentChannel();
    textInput.value = '';
    textInput.focus();

    try {
      const res = await fetch(`${API_BASE}/${encodeURIComponent(chan)}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body:    JSON.stringify({ name: operative, text }),
      });

      if (res.status === 429) {
        showSystemMsg('Slow down — 1 message per 1.5s');
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showSystemMsg(err.error || 'Send failed');
        return;
      }
      const data = await res.json();
      if (data.message) {
        appendMessages(chan, [data.message]);
        // Bump since past the message we just sent to avoid duplicate on next poll
        if (chan === REALM_CHAN) sinceRealmRef.val = data.message.at;
        else sinceRoomRef.val = data.message.at;
      }
    } catch (_) {
      showSystemMsg('Offline — message not sent');
    }
  }

  function showSystemMsg(text) {
    const el = document.createElement('div');
    el.className = 'shc-system';
    el.textContent = '⚠ ' + text;
    msgList.appendChild(el);
    msgList.scrollTop = msgList.scrollHeight;
    setTimeout(() => { if (el.parentNode) el.remove(); }, 4000);
  }

  // ── Keyboard shortcut: T to toggle ──────────────────────────────────────
  function attachKeyboardShortcut() {
    window.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'c' || e.key === 'C') {   // C = chat (T is used for talk-to-agent dialogue)
        e.preventDefault();
        toggle();
      }
    });
  }

  // ── Public API ───────────────────────────────────────────────────────────
  function show() {
    // First open ever: ask for a name, THEN reveal the chat. Never on load.
    const saved = localStorage.getItem(LS_NAME);
    if (!operative && !(saved && saved.trim())) {
      panelOpen = true;
      panel.classList.remove('shc-hidden');
      showNamePrompt(() => {
        localStorage.setItem(LS_OPEN, '1');
        sinceRealmRef.val = 0;
        pollChannel(REALM_CHAN, sinceRealmRef);
        startPolling();
        renderMessages();
        setTimeout(() => textInput.focus(), 80);
      });
      return;
    }
    if (saved && saved.trim() && !operative) operative = saved.trim();
    panelOpen = true;
    panel.classList.remove('shc-hidden');
    localStorage.setItem(LS_OPEN, '1');
    startPolling();
    renderMessages();
    setTimeout(() => textInput.focus(), 80);
  }

  function hide() {
    panelOpen = false;
    panel.classList.add('shc-hidden');
    localStorage.setItem(LS_OPEN, '0');
    stopPolling();
  }

  function toggle() {
    panelOpen ? hide() : show();
  }

  function isOpen() { return panelOpen; }

  function setRoom(roomId) {
    if (!roomId || typeof roomId !== 'string') return;
    const safe = roomId.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'lobby';
    if (safe === currentRoom) return;
    currentRoom = safe;
    sinceRoomRef.val = 0;   // reset since — fresh load for new room
    if (!msgCache[safe]) msgCache[safe] = [];
    if (roomBadge) roomBadge.textContent = safe;
    // Auto-switch to ROOM tab when player enters a room
    switchTab('room');
    if (panelOpen) pollChannel(safe, sinceRoomRef);
  }

  function start() {
    if (initialized) return;
    initialized = true;

    buildPanel();   // build hidden — click-only. No keyboard auto-open, no name prompt on load.

    // Silently restore a saved name (does NOT open the panel).
    const saved = localStorage.getItem(LS_NAME);
    if (saved && saved.trim()) operative = saved.trim();
  }

  // ── Export ────────────────────────────────────────────────────────────────
  window.buildWorldChat = function () {
    return { toggle, show, hide, isOpen, setRoom, start };
  };

})();
