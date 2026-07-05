/* onboarding-pricing.js
   Injects a collapsible "What can I do?" VALUE / PRICING panel into the
   first-run intro overlay (#shdOnboard > #shdOb-modal), just above the
   footer (#shdOb-foot). Self-contained, never throws. */
(function () {
  'use strict';

  var INJECTED_ID = 'shdOb-value';
  var MAX_WAIT_MS = 6000;
  var POLL_MS = 150;
  var waited = 0;

  function h(tag, attrs, html) {
    var el = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        el.setAttribute(k, attrs[k]);
      });
    }
    if (html != null) el.innerHTML = html;
    return el;
  }

  function buildPanel() {
    var wrap = h('div', { id: INJECTED_ID });

    var toggle = h(
      'button',
      { type: 'button', class: 'sv-toggle', 'aria-expanded': 'false' },
      '<span>❓ What can I do? &nbsp;—&nbsp; See what you get</span>' +
        '<span class="sv-chevron">▼</span>'
    );

    var panel = h('div', { class: 'sv-panel' });

    var cards = h('div', { class: 'sv-cards' });

    // Free (BYOK)
    cards.appendChild(
      h(
        'div',
        { class: 'sv-card' },
        '<div class="sv-tier">🆓 Free (BYOK)</div>' +
          '<div class="sv-price">$0</div>' +
          '<div class="sv-sub">you bring a free key</div>' +
          '<ul class="sv-list">' +
          '<li>All 7 agents + 5,361 skills</li>' +
          '<li>The Forge — build agents</li>' +
          '<li>Workflow Gallery (real multi-agent chains)</li>' +
          '<li>The 3D World + Bazaar browsing</li>' +
          '<li>Runs on YOUR free Groq / Ollama key</li>' +
          '<li>Fair-use limits</li>' +
          '</ul>'
      )
    );

    // Pro
    cards.appendChild(
      h(
        'div',
        { class: 'sv-card' },
        '<div class="sv-tier">💠 Pro</div>' +
          '<div class="sv-price">$29<span style="font-size:11px">/mo</span></div>' +
          '<div class="sv-sub">everything in Free, plus</div>' +
          '<ul class="sv-list">' +
          '<li>Scheduled / always-on automation</li>' +
          '<li>Hosted image + video generation<br>(monthly credit allotment)</li>' +
          '<li>Unlimited saved agents</li>' +
          '<li>SELL agents &amp; skill packs in the Bazaar</li>' +
          '<li>Priority queue</li>' +
          '</ul>'
      )
    );

    // Founding (highlighted)
    var founding = h('div', { class: 'sv-card sv-founding' });
    founding.appendChild(h('div', { class: 'sv-badge' }, 'Limited'));
    founding.appendChild(h('div', { class: 'sv-tier' }, '👑 Founding Pass'));
    founding.appendChild(
      h('div', { class: 'sv-price' }, '$99 <span style="font-size:11px">one-time</span>')
    );
    founding.appendChild(h('div', { class: 'sv-sub' }, 'pre-launch supporters'));
    founding.appendChild(
      h(
        'ul',
        { class: 'sv-list' },
        '<li>Pro-style perks — for life</li>' +
          '<li>Exclusive Genesis collectable</li>' +
          '<li>Your name on the founders wall</li>'
      )
    );
    var cta = h(
      'button',
      { type: 'button', class: 'sv-cta' },
      'Become a Founding Member'
    );
    cta.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      try {
        if (window.SHADDAI_FOUNDING && typeof window.SHADDAI_FOUNDING.open === 'function') {
          window.SHADDAI_FOUNDING.open();
        }
      } catch (err) {
        /* graceful no-op */
      }
    });
    founding.appendChild(cta);
    cards.appendChild(founding);

    panel.appendChild(cards);
    panel.appendChild(
      h(
        'div',
        { class: 'sv-note' },
        'Start free — upgrade only when you’re making money.'
      )
    );

    toggle.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var open = wrap.classList.toggle('sv-open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });

    wrap.appendChild(toggle);
    wrap.appendChild(panel);
    return wrap;
  }

  function tryInject() {
    try {
      if (document.getElementById(INJECTED_ID)) return true; // already injected
      var modal = document.getElementById('shdOb-modal');
      if (!modal) return false;

      var panel = buildPanel();
      var foot = document.getElementById('shdOb-foot');
      if (foot && foot.parentNode === modal) {
        modal.insertBefore(panel, foot);
      } else if (foot && foot.parentNode) {
        foot.parentNode.insertBefore(panel, foot);
      } else {
        modal.appendChild(panel);
      }
      return true;
    } catch (err) {
      return true; // stop polling; never throw
    }
  }

  function poll() {
    if (tryInject()) return;
    waited += POLL_MS;
    if (waited >= MAX_WAIT_MS) return;
    setTimeout(poll, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', poll);
  } else {
    poll();
  }
})();
