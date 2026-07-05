/*
 * THE LIBRARY OF SHADDAI — self-contained frontend module
 * Usage:  window.renderLibraryPanel(container, { tier: 'pro', user: 'owner' })
 *
 *   container : a DOM element to render into (its contents are replaced)
 *   opts.tier : 'free' | 'builder' | 'pro' | 'alpha'  (premium = builder/pro/alpha unlocks Esoteric Wing)
 *   opts.user : display name used for borrow/return + My Loans
 *
 * QUILL greets the General Stacks · ORACLE seals the Esoteric Wing.
 * Pure vanilla JS + DOM. Injects its own scoped <style>. Same-origin fetches.
 */
(function () {
  'use strict';

  var STYLE_ID = 'shaddai-library-style';
  var PREMIUM = ['builder', 'pro', 'alpha'];

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var css = `
.shd-lib { --void:#04060d; --quill1:#f0c8d8; --quill2:#b98cff; --oracle1:#9b59f5; --oracle2:#c084fc;
  position:relative; box-sizing:border-box; width:100%; min-height:100%; padding:26px clamp(14px,4vw,42px);
  background:radial-gradient(1200px 600px at 50% -10%, rgba(185,140,255,.10), transparent 60%), var(--void);
  color:#e8eaf4; font-family:'Share Tech Mono', ui-monospace, monospace; overflow-y:auto; }
.shd-lib *{ box-sizing:border-box; }
.shd-lib .lib-head{ text-align:center; margin-bottom:22px; }
.shd-lib .lib-title{ font-family:'Orbitron', sans-serif; font-weight:800; letter-spacing:.18em;
  font-size:clamp(20px,3.4vw,34px); margin:0;
  background:linear-gradient(90deg,var(--quill1),var(--quill2)); -webkit-background-clip:text; background-clip:text; color:transparent;
  text-shadow:0 0 26px rgba(185,140,255,.35); }
.shd-lib .lib-sub{ margin:6px 0 0; font-size:12px; letter-spacing:.32em; color:var(--quill1); opacity:.8; text-transform:uppercase; }
.shd-lib .lib-tabs{ display:flex; gap:10px; justify-content:center; flex-wrap:wrap; margin:18px 0 22px; }
.shd-lib .lib-tab{ cursor:pointer; font-family:'Orbitron',sans-serif; font-size:12px; letter-spacing:.14em; text-transform:uppercase;
  padding:10px 18px; border-radius:11px; border:1px solid rgba(185,140,255,.30); background:rgba(185,140,255,.05);
  color:#cdd2ec; transition:.18s; }
.shd-lib .lib-tab:hover{ border-color:var(--quill2); color:#fff; }
.shd-lib .lib-tab.on{ background:linear-gradient(180deg,rgba(185,140,255,.22),rgba(185,140,255,.06)); border-color:var(--quill2);
  color:#fff; box-shadow:0 0 18px rgba(185,140,255,.30); }
.shd-lib .lib-tab.eso{ border-color:rgba(155,89,245,.35); }
.shd-lib .lib-tab.eso.on{ background:linear-gradient(180deg,rgba(155,89,245,.26),rgba(155,89,245,.06));
  border-color:var(--oracle2); box-shadow:0 0 18px rgba(155,89,245,.40); }
.shd-lib.eso-mode{ background:radial-gradient(1200px 600px at 50% -10%, rgba(155,89,245,.14), transparent 60%), var(--void); }
.shd-lib.eso-mode .lib-title{ background:linear-gradient(90deg,var(--oracle1),var(--oracle2)); -webkit-background-clip:text; background-clip:text;
  text-shadow:0 0 28px rgba(155,89,245,.45); }
.shd-lib .lib-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(248px,1fr)); gap:14px; }
.shd-lib .book{ border:1px solid rgba(185,140,255,.20); border-radius:14px; padding:16px 16px 14px;
  background:linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.18)); transition:.18s; position:relative; }
.shd-lib.eso-mode .book{ border-color:rgba(155,89,245,.28); }
.shd-lib .book:hover{ transform:translateY(-2px); border-color:var(--quill2); box-shadow:0 8px 26px rgba(0,0,0,.5),0 0 18px rgba(185,140,255,.18); }
.shd-lib.eso-mode .book:hover{ border-color:var(--oracle2); box-shadow:0 8px 26px rgba(0,0,0,.5),0 0 18px rgba(155,89,245,.22); }
.shd-lib .bk-title{ font-family:'Orbitron',sans-serif; font-size:14px; font-weight:700; letter-spacing:.03em; color:#fff; margin:0 0 5px; line-height:1.3; }
.shd-lib .bk-author{ font-size:12px; color:var(--quill1); opacity:.85; margin:0 0 10px; }
.shd-lib.eso-mode .bk-author{ color:var(--oracle2); }
.shd-lib .bk-status{ font-size:11px; letter-spacing:.06em; margin-bottom:11px; }
.shd-lib .bk-avail{ color:#5fe3a1; }
.shd-lib .bk-out{ color:#ffb27a; }
.shd-lib .bk-due{ color:#9aa0bf; }
.shd-lib .bk-actions{ display:flex; gap:8px; }
.shd-lib button.act{ cursor:pointer; font-family:'Share Tech Mono',monospace; font-size:11px; letter-spacing:.08em;
  padding:7px 14px; border-radius:9px; border:1px solid var(--quill2); background:rgba(185,140,255,.12); color:#fff; transition:.16s; }
.shd-lib button.act:hover{ background:var(--quill2); color:#0a0612; box-shadow:0 0 14px rgba(185,140,255,.5); }
.shd-lib button.act.ret{ border-color:#ffb27a; background:rgba(255,178,122,.12); }
.shd-lib button.act.ret:hover{ background:#ffb27a; color:#241204; box-shadow:0 0 14px rgba(255,178,122,.5); }
.shd-lib button.act:disabled{ opacity:.4; cursor:not-allowed; box-shadow:none; }
.shd-lib .gate{ text-align:center; padding:46px 20px; border:1px dashed rgba(155,89,245,.45); border-radius:16px;
  background:rgba(155,89,245,.06); color:var(--oracle2); }
.shd-lib .gate .seal{ font-size:34px; margin-bottom:12px; }
.shd-lib .gate p{ font-size:13px; line-height:1.6; max-width:440px; margin:0 auto; color:#d7c9f4; }
.shd-lib .lib-msg{ text-align:center; padding:30px; color:#8a90b3; font-size:13px; }
.shd-lib .add-wrap{ margin-top:28px; border-top:1px solid rgba(185,140,255,.18); padding-top:20px; }
.shd-lib .add-title{ font-family:'Orbitron',sans-serif; font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:var(--quill1); margin:0 0 14px; }
.shd-lib.eso-mode .add-title{ color:var(--oracle2); }
.shd-lib .add-form{ display:grid; grid-template-columns:1fr 1fr; gap:10px; max-width:680px; }
.shd-lib .add-form .full{ grid-column:1 / -1; }
.shd-lib .add-form input, .shd-lib .add-form select, .shd-lib .add-form textarea{
  width:100%; font-family:'Share Tech Mono',monospace; font-size:12px; color:#e8eaf4;
  background:rgba(0,0,0,.32); border:1px solid rgba(185,140,255,.28); border-radius:9px; padding:10px 12px; outline:none; transition:.16s; }
.shd-lib .add-form input:focus, .shd-lib .add-form select:focus, .shd-lib .add-form textarea:focus{ border-color:var(--quill2); box-shadow:0 0 12px rgba(185,140,255,.3); }
.shd-lib .add-form textarea{ resize:vertical; min-height:60px; }
.shd-lib .add-form option{ background:#0a0a18; }
.shd-lib .add-submit{ font-family:'Orbitron',sans-serif; letter-spacing:.1em; font-size:12px; cursor:pointer;
  padding:11px 18px; border-radius:10px; border:1px solid var(--quill2);
  background:linear-gradient(180deg,rgba(185,140,255,.25),rgba(185,140,255,.08)); color:#fff; transition:.16s; }
.shd-lib .add-submit:hover{ background:var(--quill2); color:#0a0612; box-shadow:0 0 16px rgba(185,140,255,.5); }
.shd-lib .form-note{ font-size:11px; color:#8a90b3; margin-top:8px; }
.shd-lib .form-note.err{ color:#ff8a8a; }
.shd-lib .form-note.ok{ color:#5fe3a1; }
.shd-lib .loans-list{ display:flex; flex-direction:column; gap:8px; }
.shd-lib .loan-row{ display:flex; justify-content:space-between; align-items:center; gap:12px;
  border:1px solid rgba(185,140,255,.18); border-radius:10px; padding:10px 14px; background:rgba(255,255,255,.025); font-size:12px; }
.shd-lib .loan-row .ld{ color:#9aa0bf; }
.shd-lib .spin{ text-align:center; color:var(--quill2); padding:24px; font-size:12px; letter-spacing:.2em; }
`;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  function esc(s) { return String(s == null ? '' : s); }

  async function jfetch(url, opts) {
    var res = await fetch(url, opts);
    var data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    return { status: res.status, ok: res.ok, data: data };
  }

  function renderLibraryPanel(container, opts) {
    if (!container) { console.error('[library] no container'); return; }
    opts = opts || {};
    var tier = String(opts.tier || 'free').toLowerCase();
    var user = String(opts.user || 'guest');
    var premium = PREMIUM.indexOf(tier) !== -1;

    injectStyle();

    var state = { view: 'general' }; // 'general' | 'esoteric' | 'loans'

    var root = el('div', 'shd-lib');
    container.innerHTML = '';
    container.appendChild(root);

    // ---- header ----
    var head = el('div', 'lib-head');
    head.appendChild(el('h1', 'lib-title', 'THE LIBRARY OF SHADDAI'));
    head.appendChild(el('p', 'lib-sub', 'QUILL · entrance'));
    root.appendChild(head);

    // ---- tabs ----
    var tabs = el('div', 'lib-tabs');
    var tGen = el('div', 'lib-tab', 'General Stacks');
    var tEso = el('div', 'lib-tab eso', 'Esoteric Wing');
    var tLoan = el('div', 'lib-tab', 'My Loans');
    tabs.appendChild(tGen); tabs.appendChild(tEso); tabs.appendChild(tLoan);
    root.appendChild(tabs);

    var body = el('div', 'lib-body');
    root.appendChild(body);

    function setMode() {
      root.classList.toggle('eso-mode', state.view === 'esoteric');
      tGen.classList.toggle('on', state.view === 'general');
      tEso.classList.toggle('on', state.view === 'esoteric');
      tLoan.classList.toggle('on', state.view === 'loans');
      head.querySelector('.lib-sub').textContent =
        state.view === 'esoteric' ? 'ORACLE · esoteric wing' : 'QUILL · entrance';
    }

    tGen.onclick = function () { state.view = 'general'; setMode(); load(); };
    tEso.onclick = function () { state.view = 'esoteric'; setMode(); load(); };
    tLoan.onclick = function () { state.view = 'loans'; setMode(); load(); };

    // ---- book card ----
    function bookCard(b) {
      var card = el('div', 'book');
      card.appendChild(el('h3', 'bk-title', b.title));
      card.appendChild(el('p', 'bk-author', 'by ' + (b.author || 'Anonymous')));

      var st = el('div', 'bk-status');
      if (b.borrowed) {
        var who = b.borrowedBy === user ? 'you' : b.borrowedBy;
        st.appendChild(el('span', 'bk-out', 'On loan to ' + who));
        if (b.dueAt) {
          var due = new Date(b.dueAt);
          st.appendChild(el('div', 'bk-due', 'Due ' + due.toISOString().slice(0, 10)));
        }
      } else {
        st.appendChild(el('span', 'bk-avail', 'Available'));
      }
      card.appendChild(st);

      var actions = el('div', 'bk-actions');
      if (b.borrowed && b.borrowedBy === user) {
        var rbtn = el('button', 'act ret', 'Return');
        rbtn.onclick = function () { returnBook(b.id, rbtn); };
        actions.appendChild(rbtn);
      } else if (!b.borrowed) {
        var bbtn = el('button', 'act', 'Borrow');
        bbtn.onclick = function () { borrowBook(b.id, bbtn); };
        actions.appendChild(bbtn);
      } else {
        var dbtn = el('button', 'act', 'Borrowed');
        dbtn.disabled = true;
        actions.appendChild(dbtn);
      }
      card.appendChild(actions);
      return card;
    }

    async function borrowBook(id, btn) {
      btn.disabled = true; btn.textContent = '...';
      var r = await jfetch('/api/library/borrow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: id, user: user })
      });
      if (!r.ok) { btn.disabled = false; btn.textContent = 'Borrow'; alert((r.data && r.data.error) || 'Could not borrow.'); return; }
      load();
    }

    async function returnBook(id, btn) {
      btn.disabled = true; btn.textContent = '...';
      var r = await jfetch('/api/library/return', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId: id })
      });
      if (!r.ok) { btn.disabled = false; btn.textContent = 'Return'; alert((r.data && r.data.error) || 'Could not return.'); return; }
      load();
    }

    // ---- views ----
    function renderBooks(books) {
      body.innerHTML = '';
      if (!books.length) {
        body.appendChild(el('div', 'lib-msg', 'No books on these shelves yet. Add the first one below.'));
      } else {
        var grid = el('div', 'lib-grid');
        books.forEach(function (b) { grid.appendChild(bookCard(b)); });
        body.appendChild(grid);
      }
      body.appendChild(addForm(state.view === 'esoteric' ? 'esoteric' : 'general'));
    }

    function renderGate(msg) {
      body.innerHTML = '';
      var g = el('div', 'gate');
      g.appendChild(el('div', 'seal', '❖')); // ❖
      g.appendChild(el('p', null, msg || 'The Esoteric Wing is sealed by ORACLE. Enter with a Builder, Pro, or Alpha tier.'));
      body.appendChild(g);
    }

    function renderLoans(loans) {
      body.innerHTML = '';
      var wrap = el('div');
      wrap.appendChild(el('h3', 'add-title', 'My Loans — ' + user));
      if (!loans.length) {
        wrap.appendChild(el('div', 'lib-msg', 'You have no books on loan.'));
      } else {
        var list = el('div', 'loans-list');
        loans.forEach(function (l) {
          var row = el('div', 'loan-row');
          row.appendChild(el('span', null, l.title));
          var right = el('span', 'ld', l.dueDate ? ('due ' + l.dueDate) : 'on loan');
          row.appendChild(right);
          var rb = el('button', 'act ret', 'Return');
          rb.style.marginLeft = '10px';
          rb.onclick = function () { returnBook(l.id, rb); };
          row.appendChild(rb);
          list.appendChild(row);
        });
        wrap.appendChild(list);
      }
      body.appendChild(wrap);
    }

    // ---- add form ----
    function addForm(defaultSection) {
      var wrap = el('div', 'add-wrap');
      wrap.appendChild(el('h3', 'add-title', 'Add a book to the stacks'));
      var form = el('form', 'add-form');

      var title = el('input'); title.placeholder = 'Title'; title.required = true; title.className = 'full';
      var author = el('input'); author.placeholder = 'Author';
      var sel = el('select');
      var oG = el('option', null, 'General Stacks'); oG.value = 'general';
      var oE = el('option', null, 'Esoteric Wing (ORACLE)'); oE.value = 'esoteric';
      sel.appendChild(oG); sel.appendChild(oE);
      sel.value = defaultSection || 'general';
      var bodyTa = el('textarea'); bodyTa.placeholder = 'Optional: book contents / description'; bodyTa.className = 'full';
      var submit = el('button', 'add-submit', 'Shelve it'); submit.type = 'submit';
      var note = el('div', 'form-note full');

      form.appendChild(title);
      form.appendChild(author);
      form.appendChild(sel);
      form.appendChild(bodyTa);
      form.appendChild(submit);
      form.appendChild(note);

      form.onsubmit = async function (ev) {
        ev.preventDefault();
        if (!title.value.trim()) { note.className = 'form-note full err'; note.textContent = 'Title is required.'; return; }
        submit.disabled = true; note.className = 'form-note full'; note.textContent = 'Shelving...';
        var payload = {
          title: title.value.trim(),
          author: author.value.trim() || 'Anonymous',
          section: sel.value,
          body: bodyTa.value.trim(),
          addedBy: user,
          tier: tier
        };
        var r = await jfetch('/api/library/books', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        submit.disabled = false;
        if (!r.ok) {
          note.className = 'form-note full err';
          note.textContent = (r.data && r.data.error) || ('Could not add (HTTP ' + r.status + ').');
          return;
        }
        note.className = 'form-note full ok';
        note.textContent = 'Shelved: ' + (r.data.book && r.data.book.title);
        // jump to the section the book landed in, then refresh
        state.view = payload.section === 'esoteric' ? 'esoteric' : 'general';
        setMode();
        load();
      };
      return wrap;
    }

    // ---- loader ----
    async function load() {
      body.innerHTML = '';
      body.appendChild(el('div', 'spin', 'consulting the stacks...'));

      if (state.view === 'loans') {
        var rl = await jfetch('/api/library/loans?user=' + encodeURIComponent(user));
        renderLoans((rl.data && rl.data.loans) || []);
        return;
      }

      var section = state.view === 'esoteric' ? 'esoteric' : 'general';
      var url = '/api/library/books?section=' + section + (premium ? '&tier=' + encodeURIComponent(tier) : '');
      var r = await jfetch(url);
      if (r.status === 402) { renderGate(r.data && r.data.error); return; }
      if (!r.ok) { body.innerHTML = ''; body.appendChild(el('div', 'lib-msg', 'Could not load the library (HTTP ' + r.status + ').')); return; }
      renderBooks((r.data && r.data.books) || []);
    }

    setMode();
    load();
  }

  window.renderLibraryPanel = renderLibraryPanel;
})();
