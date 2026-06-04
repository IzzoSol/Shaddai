/*!
 * <shaddai-agent> — embeddable SHADDAI agent chat widget (v1.0)
 * SHADDAI's answer to three.ws <agent-3d>, adapted to a 2D pixel agent.
 * Zero dependencies, Shadow-DOM isolated, works in plain HTML/React/Vue/etc.
 *
 *   <script src="https://YOUR-HOST/embed/shaddai-agent.js"></script>
 *   <shaddai-agent agent="ORACLE" mode="floating"></shaddai-agent>
 *
 * Attributes:
 *   agent     — agent name (e.g. "ORACLE"); loads /api/agents/<agent>/manifest
 *   manifest  — explicit manifest URL (overrides agent)
 *   endpoint  — API base origin (default: same-origin as the script)
 *   mode      — inline (default) | floating | fullscreen
 *   width/height — inline size (default 380x520)
 *   title     — header label override
 *
 * Public API (on the element):
 *   .say(text) / .ask(text)→Promise<string> / .clearConversation()
 *   .setMode(mode) / .manifest (property)
 *
 * Events (bubbling, composed):
 *   shaddai:ready {manifest} · shaddai:message {role,text} · shaddai:error {error}
 */
(function () {
  if (customElements.get('shaddai-agent')) return;

  // Infer API base from this script's src (so it works when embedded cross-site).
  const SCRIPT_SRC = (document.currentScript && document.currentScript.src) || '';
  function defaultEndpoint() {
    try { return new URL(SCRIPT_SRC).origin; } catch (e) { return location.origin; }
  }
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  class ShaddaiAgent extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
      this.manifest = null;
      this._history = [];
      this._endpoint = '';
    }

    connectedCallback() {
      this._endpoint = (this.getAttribute('endpoint') || defaultEndpoint()).replace(/\/$/, '');
      this._mode = this.getAttribute('mode') || 'inline';
      this._renderShell();
      this._loadManifest();
    }

    async _loadManifest() {
      const explicit = this.getAttribute('manifest');
      const agent = this.getAttribute('agent') || 'SHADDAI';
      const url = explicit || `${this._endpoint}/api/agents/${encodeURIComponent(agent)}/manifest`;
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error('manifest ' + r.status);
        this.manifest = await r.json();
        this._applyManifest();
        this._emit('shaddai:ready', { manifest: this.manifest });
        this._pushSystem(`${this.manifest.label || this.manifest.name} ready. Ask me anything.`);
      } catch (e) {
        this._pushSystem('⚠ could not load agent (' + e.message + ')');
        this._emit('shaddai:error', { error: e.message });
      }
    }

    _applyManifest() {
      const m = this.manifest || {};
      const color = (m.avatar && m.avatar.color) || '#ffd23f';
      this._color = color;
      this.shadowRoot.host.style.setProperty('--accent', color);
      const t = this.getAttribute('title') || m.label || m.name || 'SHADDAI Agent';
      const hEl = this.shadowRoot.querySelector('.title'); if (hEl) hEl.textContent = t;
      const sub = this.shadowRoot.querySelector('.sub');
      if (sub) sub.textContent = (m.brain ? (m.brain.provider + ' · ' + m.brain.model) : '').slice(0, 40);
      const sig = this.shadowRoot.querySelector('.sigil'); if (sig) sig.textContent = (m.name || '◈')[0];
    }

    // ── Public API ──
    say(text) { this._send(text); }
    ask(text) { return this._send(text); }
    clearConversation() { this._history = []; const log = this.shadowRoot.querySelector('.log'); if (log) log.innerHTML = ''; }
    setMode(mode) { this._mode = mode; this.setAttribute('mode', mode); this._applyMode(); }

    async _send(text) {
      text = (text || '').trim(); if (!text) return '';
      this._push('user', text);
      this._emit('shaddai:message', { role: 'user', text });
      const typing = this._push('agent', '…', true);
      try {
        const r = await fetch(`${this._endpoint}/api/llm/chat`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: text, agent: (this.manifest && this.manifest.name) || this.getAttribute('agent') || 'SHADDAI' })
        });
        const data = await r.json();
        const reply = data.response || data.error || '(no response)';
        typing.querySelector('.bubble').textContent = reply;
        typing.classList.remove('typing');
        this._history.push({ role: 'agent', text: reply });
        this._emit('shaddai:message', { role: 'agent', text: reply });
        return reply;
      } catch (e) {
        typing.querySelector('.bubble').textContent = '⚠ ' + e.message;
        typing.classList.remove('typing');
        this._emit('shaddai:error', { error: e.message });
        return '';
      }
    }

    // ── rendering ──
    _push(role, text, typing) {
      const log = this.shadowRoot.querySelector('.log');
      const row = document.createElement('div');
      row.className = 'row ' + role + (typing ? ' typing' : '');
      row.innerHTML = `<div class="bubble">${esc(text)}</div>`;
      log.appendChild(row); log.scrollTop = log.scrollHeight;
      if (role === 'user') this._history.push({ role, text });
      return row;
    }
    _pushSystem(text) {
      const log = this.shadowRoot.querySelector('.log');
      const row = document.createElement('div'); row.className = 'row sys';
      row.innerHTML = `<div class="sysmsg">${esc(text)}</div>`;
      log.appendChild(row); log.scrollTop = log.scrollHeight;
    }
    _emit(name, detail) { this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true })); }

    _applyMode() {
      const host = this.shadowRoot.host;
      host.setAttribute('data-mode', this._mode);
    }

    _renderShell() {
      const w = this.getAttribute('width') || '380px';
      const h = this.getAttribute('height') || '520px';
      this.shadowRoot.innerHTML = `
        <style>
          :host{--accent:#ffd23f;--bg:#0e1117;--panel:#12161e;--line:rgba(255,255,255,.08);--txt:#e8ecf2;--mut:#7c8aa0;
                font-family:'Segoe UI',system-ui,sans-serif;display:block}
          :host([data-mode="floating"]){position:fixed;right:18px;bottom:18px;z-index:2147483000}
          :host([data-mode="fullscreen"]){position:fixed;inset:0;z-index:2147483000}
          .wrap{display:flex;flex-direction:column;background:var(--bg);color:var(--txt);
                border:1px solid var(--line);border-radius:14px;overflow:hidden;box-shadow:0 18px 50px -12px rgba(0,0,0,.7)}
          :host([data-mode="inline"]) .wrap{width:${w};height:${h}}
          :host([data-mode="floating"]) .wrap{width:360px;height:500px}
          :host([data-mode="fullscreen"]) .wrap{width:100vw;height:100vh;border-radius:0}
          .head{display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--panel);border-bottom:1px solid var(--line)}
          .sigil{width:30px;height:30px;display:grid;place-items:center;font-weight:700;color:#10131a;background:var(--accent);
                 border-radius:8px;font-size:15px}
          .meta{flex:1;min-width:0}
          .title{font-weight:700;font-size:13px;letter-spacing:.02em}
          .sub{font-size:9px;color:var(--mut);font-family:ui-monospace,monospace;letter-spacing:.04em}
          .dot{width:7px;height:7px;border-radius:50%;background:#1fe6a0;box-shadow:0 0 8px #1fe6a0}
          .log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}
          .row{display:flex}.row.user{justify-content:flex-end}
          .bubble{max-width:80%;padding:8px 11px;border-radius:12px;font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word}
          .row.agent .bubble{background:var(--panel);border:1px solid var(--line);border-bottom-left-radius:3px}
          .row.user .bubble{background:var(--accent);color:#10131a;border-bottom-right-radius:3px}
          .row.sys{justify-content:center}
          .sysmsg{font-size:10px;color:var(--mut);font-family:ui-monospace,monospace}
          .row.typing .bubble{opacity:.6;animation:pulse 1s infinite}
          @keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}
          .foot{display:flex;gap:8px;padding:10px;border-top:1px solid var(--line);background:var(--panel)}
          input{flex:1;background:var(--bg);border:1px solid var(--line);color:var(--txt);border-radius:9px;padding:9px 11px;font-size:13px;outline:none}
          input:focus{border-color:var(--accent)}
          button{background:var(--accent);color:#10131a;border:none;border-radius:9px;padding:0 14px;font-weight:700;cursor:pointer;font-size:13px}
          .credit{text-align:center;font-size:8px;color:var(--mut);padding:4px;font-family:ui-monospace,monospace;letter-spacing:.1em}
          ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:var(--line)}
        </style>
        <div class="wrap">
          <div class="head">
            <div class="sigil">◈</div>
            <div class="meta"><div class="title">SHADDAI Agent</div><div class="sub">loading…</div></div>
            <div class="dot"></div>
          </div>
          <div class="log"></div>
          <div class="foot">
            <input type="text" placeholder="Ask…" />
            <button>Send</button>
          </div>
          <div class="credit">⊳ POWERED BY SHADDAI</div>
        </div>`;
      this._applyMode();
      const input = this.shadowRoot.querySelector('input');
      const btn = this.shadowRoot.querySelector('button');
      const go = () => { const v = input.value; input.value = ''; if (v.trim()) this._send(v); };
      btn.addEventListener('click', go);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
    }
  }

  customElements.define('shaddai-agent', ShaddaiAgent);
  window.ShaddaiAgent = ShaddaiAgent;
})();
