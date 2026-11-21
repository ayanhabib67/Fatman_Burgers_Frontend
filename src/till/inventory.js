/* FatMan till — Inventory tab (Nov 2026).
   Online only: every call goes straight to /api/v1/rpc/inv_* with this device's token and never
   through the offline outbox / pos_sync. app.js hands over what it needs as window.FATMAN_TILL.
   Stock never changes directly here: only through Arrived (in), Used (out) and a physical count (adjust). */
(function () {
'use strict';

var T = window.FATMAN_TILL;
if (!T) return;

var UNITS = ['pcs', 'kg', 'g', 'L', 'ml', 'packet', 'box'];
var ERR = {
  auth: 'This device was signed out. Enter the PIN again.',
  owner_only: 'Only the owner can do that.',
  not_found: 'That item or entry no longer exists. Refresh and try again.',
  insufficient_stock: 'There is not enough stock for that.',
  duplicate: 'That is already there. An item with this name may already exist.',
  bad_request: 'Something in the form is not right. Check it and try again.',
  bad_day: 'That date cannot be used. Future days are not allowed.',
  busy: 'The server is busy. Try again in a moment.',
  offline: 'You are offline. Inventory needs the internet.',
  timeout: 'The server took too long to answer. Try again.',
  network: 'Could not reach the server. Check the internet and try again.',
  server: 'The server had a problem. Try again in a moment.',
  notoken: 'This till is not signed in to the server yet. Lock and enter the PIN again while online.'
};
var TRASH = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14M10 11v6M14 11v6"/></svg>';

var inv = { root: null, role: '', day: '', today: '', data: null, loading: false, failed: '', q: '', view: 'sheet', seq: 0,
  hist: null, histFrom: '', histTo: '', histItem: '', histLoading: false, histFailed: '', hseq: 0 };
var mv = null;   /* the Arrived / Used modal */
var mg = null;   /* the Manage Items modal */
var lineKey = 0;

/* ---------- small helpers ---------- */
function $(id) { return document.getElementById(id); }
var esc = T.esc;
function isOwner() { return T.role() === 'owner'; }
function online() { return navigator.onLine !== false; }
function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
/* Pakistan has no daylight saving: UTC+5 all year, so the calendar day is simple to work out. */
function todayPk() { return new Date(T.nowMs() + 5 * 3600000).toISOString().slice(0, 10); }
function validDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z')); }
function addDays(day, n) { var d = new Date(day + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
function dayLabel(day) {
  try { return new Date(day + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }); }
  catch (e) { return day; }
}
function timeLabel(at) {
  if (!at) return '';
  try { return new Date(at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Karachi' }); }
  catch (e) { var d = new Date(new Date(at).getTime() + 5 * 3600000); return d.toISOString().slice(11, 16); }
}
function fq(n) { n = Math.round(num(n) * 1000) / 1000; return n.toLocaleString('en-US', { maximumFractionDigits: 3 }); }
function qu(n, unit) { return fq(n) + (unit ? ' ' + unit : ''); }
function signed(n, unit) { n = num(n); return (n > 0 ? '+' : n < 0 ? '−' : '') + qu(Math.abs(n), unit); }
function errText(res) {
  if (res && res.message) return String(res.message);
  return ERR[res && res.error] || 'Something went wrong. Try again.';
}
function visible() { return !!(inv.root && inv.root.offsetParent !== null); }
function items() { return (inv.data && inv.data.items) || []; }
function itemById(id) {
  var list = items(), i;
  for (i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
  if (mg && mg.items) for (i = 0; i < mg.items.length; i++) if (String(mg.items[i].id) === String(id)) return mg.items[i];
  return null;
}
function byCatName(a, b) {
  var ca = (a.category || '').toLowerCase(), cb = (b.category || '').toLowerCase();
  if (ca !== cb) { if (!ca) return 1; if (!cb) return -1; return ca < cb ? -1 : 1; }
  return String(a.name || '').toLowerCase() < String(b.name || '').toLowerCase() ? -1 : 1;
}

/* ---------- server ---------- */
function call(fn, params, cb) {
  if (!online()) { cb({ ok: false, error: 'offline' }); return; }
  var tok = T.token();
  if (!tok) { cb({ ok: false, error: 'notoken' }); return; }
  var ctl = window.AbortController ? new AbortController() : null, done = false;
  var timer = setTimeout(function () { if (ctl) ctl.abort(); finish({ ok: false, error: 'timeout' }); }, 20000);
  function finish(r) {
    if (done) return; done = true; clearTimeout(timer);
    if (r && r.error === 'auth') T.signedOut();
    cb(r);
  }
  var p = Object.assign({}, params, { token: tok });
  /* not app.js api(): that one drops the { ok:false, error } body on a 4xx, and the codes matter here */
  fetch(T.rpcBase() + '/' + fn, { method: 'POST', headers: T.headers(), body: JSON.stringify({ p: p }), signal: ctl ? ctl.signal : undefined })
    .then(function (r) {
      return r.json().then(function (j) { return j; }, function () { return null; }).then(function (j) {
        if (j && typeof j.ok === 'boolean') finish(j);
        else finish({ ok: false, error: r.status === 503 || r.status === 429 ? 'busy' : 'server' });
      });
    }, function () { finish({ ok: false, error: online() ? 'network' : 'offline' }); });
}

function load(quiet) {
  var seq = ++inv.seq;
  inv.loading = true;
  if (!quiet) inv.failed = '';
  render();
  call('inv_day', { day: inv.day }, function (res) {
    if (seq !== inv.seq) return;
    inv.loading = false;
    if (res.ok) {
      inv.data = res; inv.failed = '';
      if (res.day && validDay(res.day)) {
        if (res.isToday) inv.today = res.day;
        inv.day = res.day;
      }
      if (res.isToday) setLowBadge((res.items || []).filter(function (x) { return x.active !== false && x.low; }).length);
    } else {
      inv.failed = res.error === 'offline' ? 'offline' : errText(res);
    }
    render();
  });
}
function setLowBadge(n) {
  ['invLowB', 'invLowO'].forEach(function (id) {
    var b = $(id); if (!b) return;
    b.textContent = n; b.classList.toggle('hidden', !n);
    b.title = n ? n + ' item' + (n === 1 ? '' : 's') + ' low on stock' : '';
  });
}

/* ---------- the tab ---------- */
function render() {
  var r = inv.root; if (!r) return;
  var own = isOwner(), isToday = inv.day === inv.today;
  var h = '<div class="inv">';
  h += '<div class="inv-head">';
  h += '<div class="inv-date"><label class="field-l" for="invDay">Day</label>' +
    '<input type="date" id="invDay" value="' + esc(inv.day) + '" max="' + esc(inv.today) + '"' + (own ? '' : ' disabled title="Only the owner can open past days"') + '>' +
    (own && !isToday ? '<button type="button" class="btn sm quiet" data-iact="today">Today</button>' : '') +
    '<button type="button" class="btn sm quiet" data-iact="refresh"' + (inv.loading ? ' disabled' : '') + '>' + (inv.loading ? 'Loading…' : 'Refresh') + '</button></div>';
  h += '<div class="seg small inv-view" role="group" aria-label="Inventory view">' +
    '<button type="button" data-iact="view" data-v="sheet"' + (inv.view === 'sheet' ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>Stock sheet</button>' +
    '<button type="button" data-iact="view" data-v="history"' + (inv.view === 'history' ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>History</button></div>';
  h += '</div>';
  h += '<div class="btn-row inv-acts">' +
    '<button type="button" class="btn primary" data-iact="move" data-v="in">+ Stock Arrived</button>' +
    '<button type="button" class="btn secondary" data-iact="move" data-v="out">− Stock Used</button>' +
    (own ? '<button type="button" class="btn secondary" data-iact="manage">Manage Items</button>' : '') + '</div>';
  if (!isToday) h += '<p class="banner inv-past">You are looking at ' + esc(dayLabel(inv.day)) + '. Anything you record now is dated that day.</p>';
  if (!online()) h += '<p class="banner inv-off">You are offline. Inventory needs the internet; the figures below may be out of date.</p>';
  else if (inv.failed && inv.data) h += '<p class="banner inv-off">' + esc(inv.failed === 'offline' ? ERR.offline : inv.failed) + '</p>';

  if (inv.view === 'history') h += historyHtml();
  else {
    h += '<div id="invSummary"></div>';
    h += '<label class="search inv-search"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>' +
      '<input type="search" id="invSearch" placeholder="Search stock items" aria-label="Search stock items" autocomplete="off" value="' + esc(inv.q) + '"></label>';
    h += '<div id="invSheet"></div>';
    h += '<h2 class="h">' + (isToday ? "Today's entries" : 'Entries on ' + esc(dayLabel(inv.day))) + '</h2><div id="invMoves" class="rows"></div>';
  }
  h += '</div>';
  var typing = document.activeElement && document.activeElement.id === 'invSearch';
  r.innerHTML = h;
  if (inv.view !== 'history') { renderSheet(); renderMoves(); }
  if (typing && $('invSearch')) { var s = $('invSearch'); s.focus(); try { s.setSelectionRange(s.value.length, s.value.length); } catch (e) {} }
}

function stateBox(kind, title, sub, retry) {
  return '<div class="empty-state ' + kind + '"><span class="empty-state-ico" aria-hidden="true"></span><p class="empty-state-t">' + esc(title) + '</p>' +
    (sub ? '<p class="empty-state-s">' + esc(sub) + '</p>' : '') +
    (retry ? '<button type="button" class="btn sm secondary" data-iact="refresh">Try again</button>' : '') + '</div>';
}

function sheetItems() {
  /* hidden items stay out of the sheet unless something happened to them that day */
  return items().filter(function (x) {
    return x.active !== false || num(x.received) || num(x.used) || num(x.adjusted);
  });
}

function renderSheet() {
  var box = $('invSheet'), sum = $('invSummary'); if (!box) return;
  var d = inv.data;
  if (!d) {
    if (sum) sum.innerHTML = '';
    if (inv.failed === 'offline' || (!online() && !inv.loading)) box.innerHTML = stateBox('idle', 'Offline', ERR.offline, true);
    else if (inv.failed) box.innerHTML = stateBox('idle', 'Could not load', inv.failed, true);
    else box.innerHTML = stateBox('idle', 'Loading…', 'Fetching the stock sheet.');
    return;
  }
  var all = sheetItems();
  var low = all.filter(function (x) { return x.active !== false && x.low; }).length;
  if (sum) sum.innerHTML = all.length ? '<div class="stats inv-stats">' +
    '<div class="stat"><span class="stat-l">Items</span><b class="num">' + all.length + '</b></div>' +
    '<div class="stat' + (low ? ' warn' : ' good') + '"><span class="stat-l">Low stock</span><b class="num">' + low + '</b></div>' +
    '<div class="stat"><span class="stat-l">Entries</span><b class="num">' + ((d.movements || []).length) + '</b></div></div>' : '';
  if (!all.length) {
    box.innerHTML = stateBox('idle', 'No items yet', isOwner() ? 'Add your stock items in Manage Items.' : 'No items yet, the owner can add items in Manage Items.');
    return;
  }
  var q = inv.q.trim().toLowerCase();
  var list = all.filter(function (x) {
    return !q || String(x.name || '').toLowerCase().indexOf(q) >= 0 || String(x.category || '').toLowerCase().indexOf(q) >= 0;
  }).sort(byCatName);
  if (!list.length) { box.innerHTML = stateBox('idle', 'No match', 'Nothing called "' + inv.q.trim() + '".'); return; }
  var showAdj = all.some(function (x) { return num(x.adjusted); });
  var groups = [], cur = null;
  list.forEach(function (x) {
    var c = x.category || 'Other';
    if (!cur || cur.c !== c) { cur = { c: c, rows: [] }; groups.push(cur); }
    cur.rows.push(x);
  });
  var head = '<thead><tr><th scope="col">Item</th><th scope="col">Opening</th><th scope="col">Arrived</th><th scope="col">Used</th>' +
    (showAdj ? '<th scope="col">Adjusted</th>' : '') + '<th scope="col">Remaining</th></tr></thead>';
  box.innerHTML = groups.map(function (g) {
    return '<section class="inv-group"><h3 class="inv-cat">' + esc(g.c) + ' <span class="soft">' + g.rows.length + '</span></h3>' +
      '<table class="inv-table">' + head + '<tbody>' + g.rows.map(function (x) {
        var u = x.unit || '';
        return '<tr class="' + (x.low && x.active !== false ? 'low' : '') + (x.active === false ? ' off' : '') + '">' +
          '<th scope="row" class="inv-name"><span>' + esc(x.name) + '</span>' +
          (x.low && x.active !== false ? ' <em class="inv-badge low">Low stock</em>' : '') +
          (x.active === false ? ' <em class="inv-badge">Hidden</em>' : '') + '</th>' +
          '<td data-l="Opening">' + esc(qu(x.opening, u)) + '</td>' +
          '<td data-l="Arrived" class="in">' + (num(x.received) ? '+' + esc(qu(x.received, u)) : '<span class="nil">—</span>') + '</td>' +
          '<td data-l="Used" class="out">' + (num(x.used) ? '−' + esc(qu(x.used, u)) : '<span class="nil">—</span>') + '</td>' +
          (showAdj ? '<td data-l="Adjusted" class="adj">' + (num(x.adjusted) ? esc(signed(x.adjusted, u)) : '<span class="nil">—</span>') + '</td>' : '') +
          '<td data-l="Remaining" class="rem"><b>' + esc(qu(x.closing, u)) + '</b></td></tr>';
      }).join('') + '</tbody></table></section>';
  }).join('');
}

function canUndo(m) {
  if (isOwner()) return true;
  return inv.day === inv.today && m.day === inv.today && (m.type === 'in' || m.type === 'out');
}
function moveQty(m) {
  var u = m.unit || '';
  if (m.type === 'in') return { cls: 'in', t: '+' + qu(m.qty, u) };
  if (m.type === 'out') return { cls: 'out', t: '−' + qu(m.qty, u) };
  return { cls: 'adj', t: 'set to ' + qu(m.balanceAfter, u) + (num(m.delta) ? ' (' + signed(m.delta, u) + ')' : '') };
}
function renderMoves() {
  var box = $('invMoves'); if (!box) return;
  if (!inv.data) { box.innerHTML = ''; return; }
  var list = (inv.data.movements || []).slice().sort(function (a, b) { return String(b.at || '') < String(a.at || '') ? -1 : 1; });
  if (!list.length) { box.innerHTML = '<p class="hint">Nothing recorded on this day yet.</p>'; return; }
  box.innerHTML = list.map(function (m) {
    var q = moveQty(m), meta = [];
    if (m.note) meta.push(esc(m.note));
    if (m.by) meta.push('by ' + esc(m.by));
    return '<div class="row inv-mv ' + q.cls + '"><span class="inv-time num">' + esc(timeLabel(m.at)) + '</span>' +
      '<div class="row-main"><h3>' + esc(m.itemName || 'Item') + (m.type === 'adjust' ? ' <em class="inv-badge">Count</em>' : '') + '</h3>' +
      (meta.length ? '<p>' + meta.join(' · ') + '</p>' : '') + '</div>' +
      '<div class="row-side"><b class="inv-q ' + q.cls + '">' + esc(q.t) + '</b>' +
      (canUndo(m) ? '<button type="button" class="btn sm quiet inv-undo" data-iact="undo" data-iid="' + esc(m.id) + '" aria-label="Undo this entry">' + TRASH + '<span>Undo</span></button>' : '') +
      '</div></div>';
  }).join('');
}

/* ---------- undo ---------- */
function moveById(id) {
  var list = (inv.data && inv.data.movements) || [];
  for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
  return null;
}
function askUndo(id) {
  var m = moveById(id); if (!m) return;
  var q = moveQty(m);
  T.openModal('<h2 id="modalTitle">Undo this entry?</h2>' +
    '<p><b>' + esc(m.itemName || 'Item') + '</b>: ' + esc(q.t) + (m.at ? ' at ' + esc(timeLabel(m.at)) : '') + (m.by ? ' by ' + esc(m.by) : '') + '.</p>' +
    '<p>The entry is removed and the stock goes back by the same amount.</p>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-iact="close">Keep it</button>' +
    '<button type="button" class="btn danger" data-iact="undo-yes" data-iid="' + esc(m.id) + '">Undo entry</button></div>');
}
function doUndo(btn, id) {
  btn.disabled = true; btn.textContent = 'Undoing…';
  call('inv_move_delete', { id: id }, function (res) {
    if (res.ok) { T.closeModal(); T.toast('Entry undone'); load(true); return; }
    btn.disabled = false; btn.textContent = 'Undo entry';
    T.toast(errText(res));
  });
}

/* ---------- Stock Arrived / Stock Used ---------- */
function newLine() { return { key: 'l' + (++lineKey), itemId: '', qty: '', note: '', error: '' }; }
function openMove(type) {
  if (!inv.data) { T.toast(inv.failed ? (inv.failed === 'offline' ? ERR.offline : inv.failed) : 'The stock sheet is still loading.'); return; }
  if (!items().some(function (x) { return x.active !== false; })) {
    T.toast(isOwner() ? 'Add stock items in Manage Items first.' : 'No items yet, the owner can add items in Manage Items.');
    return;
  }
  mv = { type: type, lines: [newLine()], note: '', busy: false, pick: '', pickQ: '' };
  mv.pick = mv.lines[0].key;
  renderMove();
}
function lineByKey(k) { for (var i = 0; i < mv.lines.length; i++) if (mv.lines[i].key === k) return mv.lines[i]; return null; }
function readMove() {
  if (!mv || !$('invMvForm')) return;
  mv.lines.forEach(function (l) {
    var row = document.querySelector('.inv-line[data-iline="' + l.key + '"]'); if (!row) return;
    var q = row.querySelector('.inv-qty'), n = row.querySelector('.inv-lnote');
    if (q) l.qty = q.value; if (n) l.note = n.value;
  });
  if ($('invMvNote')) mv.note = $('invMvNote').value;
}
function lineWarn(l) {
  if (l.error) return { cls: 'err', t: l.error };
  if (mv.type !== 'out' || !l.itemId) return null;
  var it = itemById(l.itemId), q = parseFloat(l.qty);
  if (it && q > num(it.stock)) return { cls: 'warn', t: 'Only ' + qu(it.stock, it.unit) + ' in stock.' };
  return null;
}
function pickListHtml(key) {
  var q = (mv.pickQ || '').trim().toLowerCase();
  var list = items().filter(function (x) {
    return x.active !== false && (!q || String(x.name || '').toLowerCase().indexOf(q) >= 0 || String(x.category || '').toLowerCase().indexOf(q) >= 0);
  }).sort(byCatName);
  if (!list.length) return '<p class="hint">No item matches.</p>';
  return list.map(function (x) {
    return '<button type="button" class="inv-pick-opt' + (x.low ? ' low' : '') + '" data-iact="pick-item" data-iline="' + key + '" data-iid="' + esc(x.id) + '">' +
      '<span>' + esc(x.name) + (x.category ? ' <small>' + esc(x.category) + '</small>' : '') + '</span>' +
      '<b>' + esc(qu(x.stock, x.unit)) + '</b></button>';
  }).join('');
}
function renderMove() {
  if (!mv) return;
  var isIn = mv.type === 'in', isToday = inv.day === inv.today;
  var valid = mv.lines.filter(function (l) { return l.itemId && parseFloat(l.qty) > 0; }).length;
  var h = '<form id="invMvForm" class="inv-mv-form" autocomplete="off" onsubmit="return false">' +
    '<h2 id="modalTitle">' + (isIn ? 'Stock arrived' : 'Stock used') + '</h2>' +
    '<p>' + (isIn ? 'Everything that came in' : 'Everything that was used') + (isToday ? ' today' : ' on ' + esc(dayLabel(inv.day))) + '. One line per item.</p>' +
    '<div class="inv-lines">';
  mv.lines.forEach(function (l) {
    var it = l.itemId ? itemById(l.itemId) : null, w = lineWarn(l);
    h += '<div class="inv-line' + (w && w.cls === 'err' ? ' err' : '') + '" data-iline="' + l.key + '">' +
      '<div class="inv-line-top">' +
      '<button type="button" class="inv-pick-btn' + (it ? '' : ' none') + '" data-iact="pick" data-iline="' + l.key + '" aria-expanded="' + (mv.pick === l.key) + '">' +
      (it ? '<span>' + esc(it.name) + '</span><small>' + esc(qu(it.stock, it.unit)) + ' in stock</small>' : '<span>Choose an item</span>') + '</button>' +
      '<label class="inv-qty-wrap"><input type="number" class="inv-qty" data-iline="' + l.key + '" inputmode="decimal" step="any" min="0" placeholder="Qty" aria-label="Quantity" value="' + esc(l.qty) + '">' +
      '<span class="inv-unit">' + esc(it ? it.unit || '' : '') + '</span></label>' +
      (mv.lines.length > 1 ? '<button type="button" class="btn sm quiet inv-x" data-iact="line-del" data-iline="' + l.key + '" aria-label="Remove this line">×</button>' : '') +
      '</div>';
    if (mv.pick === l.key) {
      h += '<div class="inv-pick"><input type="search" class="inv-pick-q" data-iline="' + l.key + '" placeholder="Search items" aria-label="Search items" value="' + esc(mv.pickQ) + '">' +
        '<div class="inv-pick-list" id="invPickList">' + pickListHtml(l.key) + '</div></div>';
    }
    h += '<input type="text" class="inv-lnote" data-iline="' + l.key + '" placeholder="Note for this line, optional" aria-label="Note for this line, optional" maxlength="120" value="' + esc(l.note) + '">' +
      '<p class="inv-warn' + (w ? ' ' + w.cls : ' hidden') + '">' + (w ? esc(w.t) : '') + '</p></div>';
  });
  h += '</div><button type="button" class="btn sm secondary inv-add" data-iact="line-add">+ Add line</button>' +
    '<label for="invMvNote">Note for the whole ' + (isIn ? 'delivery' : 'entry') + ', optional</label>' +
    '<input type="text" id="invMvNote" maxlength="160" placeholder="' + (isIn ? 'Supplier, bill number' : 'Shift, reason') + '" value="' + esc(mv.note) + '">' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-iact="close">Cancel</button>' +
    '<button type="button" class="btn primary" data-iact="move-save"' + (mv.busy ? ' disabled' : '') + '>' +
    (mv.busy ? 'Saving…' : 'Save' + (valid > 1 ? ' ' + valid + ' lines' : '')) + '</button></div></form>';
  var focusPick = mv.pick && !$('invMvForm');
  var hadPickFocus = document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('inv-pick-q');
  if ($('invMvForm')) $('modalCard').innerHTML = h; else T.openModal(h);
  var pq = document.querySelector('.inv-pick-q');
  if (pq && (focusPick || hadPickFocus || mv.focusPick)) { pq.focus(); try { pq.setSelectionRange(pq.value.length, pq.value.length); } catch (e) {} }
  mv.focusPick = false;
}
function updateLineWarn(key) {
  var l = lineByKey(key); if (!l) return;
  var row = document.querySelector('.inv-line[data-iline="' + key + '"]'); if (!row) return;
  var w = lineWarn(l), p = row.querySelector('.inv-warn');
  row.classList.toggle('err', !!(w && w.cls === 'err'));
  p.className = 'inv-warn' + (w ? ' ' + w.cls : ' hidden'); p.textContent = w ? w.t : '';
  var go = document.querySelector('[data-iact="move-save"]');
  if (go && !mv.busy) {
    var valid = mv.lines.filter(function (x) { return x.itemId && parseFloat(x.qty) > 0; }).length;
    go.textContent = 'Save' + (valid > 1 ? ' ' + valid + ' lines' : '');
  }
}
function saveMove() {
  if (!mv || mv.busy) return;
  readMove();
  var lines = mv.lines.filter(function (l) { return l.itemId || String(l.qty).trim() || String(l.note).trim(); });
  if (!lines.length) { T.toast('Add at least one item.'); return; }
  var bad = 0;
  lines.forEach(function (l) {
    l.error = '';
    if (!l.itemId) { l.error = 'Choose an item.'; bad++; }
    else if (!(parseFloat(l.qty) > 0)) { l.error = 'Enter a quantity above 0.'; bad++; }
  });
  mv.lines = lines; mv.pick = '';
  if (bad) { renderMove(); return; }
  mv.busy = true; renderMove();
  var type = mv.type, sent = lines.slice(), body = {
    type: type, day: inv.day,
    lines: sent.map(function (l) { var o = { itemId: l.itemId, qty: parseFloat(l.qty) }; if (l.note.trim()) o.note = l.note.trim(); return o; })
  };
  if (mv.note.trim()) body.note = mv.note.trim();
  var mine = mv;
  call('inv_move_bulk', body, function (res) {
    var still = mv === mine && $('invMvForm');
    mine.busy = false;
    var word = type === 'in' ? 'arrival' : 'usage';
    if (res.ok) {
      if (still) T.closeModal();
      mv = null;
      T.toast(sent.length > 1 ? sent.length + ' lines of ' + word + ' saved' : (type === 'in' ? 'Arrival saved' : 'Usage saved'));
      load(true); return;
    }
    if (res.results && res.results.length) {
      var failed = [];
      res.results.forEach(function (x, i) {
        if (x.ok) return;
        var l = sent[i] && String(sent[i].itemId) === String(x.itemId) ? sent[i] : null;
        if (!l) sent.forEach(function (s) { if (!l && String(s.itemId) === String(x.itemId) && failed.indexOf(s) < 0) l = s; });
        if (!l) return;
        l.error = errText(x); failed.push(l);
      });
      var saved = sent.length - failed.length;
      if (saved) load(true);
      if (!failed.length) { if (still) T.closeModal(); mv = null; T.toast('Saved'); return; }
      mine.lines = failed;
      if (still) renderMove();
      T.toast(saved ? saved + ' saved. ' + failed.length + ' need fixing.' : 'Nothing was saved. Check the lines marked in red.');
      return;
    }
    if (still) renderMove();
    T.toast(errText(res));
  });
}

/* ---------- Manage Items (owner) ---------- */
function openManage() {
  if (!isOwner()) return;
  mg = { items: null, failed: '', screen: 'list', edit: null, showHidden: false };
  renderManage();
  loadManage();
}
function loadManage() {
  call('inv_items', { includeInactive: true }, function (res) {
    if (!mg) return;
    if (res.ok) { mg.items = res.items || []; mg.failed = ''; }
    else mg.failed = errText(res);
    if (mg.screen === 'list' && $('invMgList')) renderManage();
  });
}
function mgOpen() { return !!(mg && ($('invMgList') || $('invItemForm') || $('invCountForm') || $('invHideAsk'))); }
function renderManage() {
  if (!mg) return;
  mg.screen = 'list';
  var h = '<h2 id="modalTitle">Manage items</h2>' +
    '<p>Stock only changes through Arrived, Used and a physical count. Hidden items keep their history.</p>' +
    '<div class="btn-row"><button type="button" class="btn secondary" data-iact="item-new">+ Add item</button></div>' +
    '<div id="invMgList" class="rows inv-mg-list">';
  if (!mg.items) h += mg.failed ? '<p class="banner">' + esc(mg.failed) + '</p><button type="button" class="btn sm secondary" data-iact="manage-reload">Try again</button>' : '<p class="hint">Loading items…</p>';
  else if (!mg.items.length) h += '<p class="hint">No items yet. Add buns, patties, cheese, boxes: anything you want to count.</p>';
  else {
    var on = mg.items.filter(function (x) { return x.active !== false; }).sort(byCatName);
    var off = mg.items.filter(function (x) { return x.active === false; }).sort(byCatName);
    h += on.map(mgRow).join('');
    if (off.length) {
      h += '<button type="button" class="btn sm quiet inv-hidden-toggle" data-iact="toggle-hidden">' + (mg.showHidden ? 'Hide' : 'Show') + ' hidden items (' + off.length + ')</button>';
      if (mg.showHidden) h += off.map(mgRow).join('');
    }
  }
  h += '</div><div class="modal-actions"><button type="button" class="btn secondary" data-iact="close">Done</button></div>';
  if (mgOpen()) $('modalCard').innerHTML = h; else T.openModal(h);
}
function mgRow(x) {
  var off = x.active === false, meta = [x.category || 'No category', x.unit || ''];
  if (num(x.lowStockAt)) meta.push('alert at ' + qu(x.lowStockAt, x.unit));
  return '<div class="row inv-mrow' + (off ? ' off' : '') + '"><div class="row-main"><h3>' + esc(x.name) +
    (x.low && !off ? ' <em class="inv-badge low">Low stock</em>' : '') + (off ? ' <em class="inv-badge">Hidden</em>' : '') + '</h3>' +
    '<p>' + esc(meta.filter(Boolean).join(' · ')) + '</p></div>' +
    '<div class="row-side"><b class="inv-stock">' + esc(qu(x.stock, x.unit)) + '</b>' +
    '<button type="button" class="btn sm quiet" data-iact="item-edit" data-iid="' + esc(x.id) + '">Edit</button>' +
    (off ? '<button type="button" class="btn sm quiet" data-iact="item-show" data-iid="' + esc(x.id) + '">Show again</button>'
      : '<button type="button" class="btn sm quiet" data-iact="adjust" data-iid="' + esc(x.id) + '">Physical count</button>' +
        '<button type="button" class="btn sm quiet" data-iact="item-hide" data-iid="' + esc(x.id) + '">Hide</button>') +
    '</div></div>';
}
function mgItem(id) {
  var list = (mg && mg.items) || [];
  for (var i = 0; i < list.length; i++) if (String(list[i].id) === String(id)) return list[i];
  return null;
}
function categories() {
  var seen = {}, out = [];
  ((mg && mg.items) || items()).forEach(function (x) { var c = (x.category || '').trim(); if (c && !seen[c.toLowerCase()]) { seen[c.toLowerCase()] = 1; out.push(c); } });
  return out.sort();
}
function openItemForm(id) {
  var x = id ? mgItem(id) : null;
  if (id && !x) return;
  mg.screen = 'edit'; mg.edit = x;
  var create = !x;
  var h = '<form id="invItemForm" class="form inv-item-form" autocomplete="off" onsubmit="return false">' +
    '<h2 id="modalTitle">' + (create ? 'Add an item' : 'Edit ' + esc(x.name)) + '</h2>' +
    '<label for="invIName">Name</label><input type="text" id="invIName" maxlength="60" placeholder="Buns, beef patties, cheese slices" value="' + esc(x ? x.name : '') + '">' +
    '<label for="invIUnit">Unit</label><input type="text" id="invIUnit" maxlength="20" placeholder="pcs" value="' + esc(x ? x.unit : 'pcs') + '">' +
    '<div class="chips tight inv-units" role="group" aria-label="Common units">' + UNITS.map(function (u) {
      return '<button type="button" data-iact="unit" data-v="' + esc(u) + '"' + ((x ? x.unit : 'pcs') === u ? ' class="on"' : '') + '>' + esc(u) + '</button>';
    }).join('') + '</div>' +
    '<label for="invICat">Category</label><input type="text" id="invICat" maxlength="40" list="invCats" placeholder="Bread, meat, dairy, packaging" value="' + esc(x ? x.category || '' : '') + '">' +
    '<datalist id="invCats">' + categories().map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join('') + '</datalist>' +
    '<div class="split"><div><label for="invILow">Low-stock alert at</label><input type="number" id="invILow" inputmode="decimal" step="any" min="0" placeholder="0" value="' + esc(x && x.lowStockAt != null ? x.lowStockAt : '') + '"></div>' +
    (create ? '<div><label for="invIOpen">Opening stock</label><input type="number" id="invIOpen" inputmode="decimal" step="any" min="0" placeholder="0"></div>'
      : '<div><span class="field-l">In stock now</span><p class="inv-now"><b>' + esc(qu(x.stock, x.unit)) + '</b></p></div>') + '</div>' +
    (create ? '<p class="hint">Opening stock is what is on the shelf right now. After this, stock only changes through Arrived, Used and a physical count.</p>'
      : '<p class="hint">To change the stock figure, use Physical count.</p>') +
    '<p class="banner hidden" id="invIErr"></p>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-iact="manage-back">Back</button>' +
    '<button type="button" class="btn primary" data-iact="item-save">Save</button></div></form>';
  $('modalCard').innerHTML = h;
  $('invIName').focus();
}
function formErr(id, t) { var e = $(id); if (!e) return; e.textContent = t; e.classList.toggle('hidden', !t); }
function saveItem(btn) {
  var create = !mg.edit;
  var name = $('invIName').value.trim(), unit = $('invIUnit').value.trim(), cat = $('invICat').value.trim();
  var lowRaw = $('invILow').value.trim(), lowAt = lowRaw === '' ? 0 : parseFloat(lowRaw);
  var openRaw = create ? $('invIOpen').value.trim() : '', open = openRaw === '' ? 0 : parseFloat(openRaw);
  if (!name) { formErr('invIErr', 'Give the item a name.'); $('invIName').focus(); return; }
  if (!unit) { formErr('invIErr', 'Give a unit, such as pcs or kg.'); $('invIUnit').focus(); return; }
  if (!isFinite(lowAt) || lowAt < 0) { formErr('invIErr', 'The low-stock alert must be 0 or more.'); $('invILow').focus(); return; }
  if (create && (!isFinite(open) || open < 0)) { formErr('invIErr', 'Opening stock must be 0 or more.'); $('invIOpen').focus(); return; }
  var body = { name: name, unit: unit, category: cat, lowStockAt: lowAt };
  if (create) body.openingStock = open; else body.id = mg.edit.id;
  formErr('invIErr', ''); btn.disabled = true; btn.textContent = 'Saving…';
  call('inv_item_save', body, function (res) {
    if (!mg || !$('invItemForm')) { if (res.ok) { T.toast('Item saved'); load(true); } return; }
    if (!res.ok) {
      btn.disabled = false; btn.textContent = 'Save';
      formErr('invIErr', res.error === 'duplicate' && !res.message ? 'An item with that name already exists.' : errText(res));
      return;
    }
    T.toast(create ? 'Item added' : 'Item saved');
    mg.items = null; renderManage(); loadManage(); load(true);
  });
}
function askHide(id) {
  var x = mgItem(id); if (!x) return;
  mg.screen = 'hide';
  $('modalCard').innerHTML = '<div id="invHideAsk"><h2 id="modalTitle">Hide ' + esc(x.name) + '?</h2>' +
    '<p>It leaves the stock sheet and the Arrived and Used lists. Its history is kept, and you can show it again from Manage Items.</p>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-iact="manage-back">Back</button>' +
    '<button type="button" class="btn danger" data-iact="item-hide-yes" data-iid="' + esc(x.id) + '">Hide item</button></div></div>';
}
function doHide(btn, id) {
  btn.disabled = true; btn.textContent = 'Hiding…';
  call('inv_item_delete', { id: id }, function (res) {
    if (!res.ok) { btn.disabled = false; btn.textContent = 'Hide item'; T.toast(errText(res)); return; }
    T.toast('Item hidden');
    if (mg) { mg.items = null; if ($('invHideAsk')) { renderManage(); } loadManage(); }
    load(true);
  });
}
function doShow(btn, id) {
  var x = mgItem(id); if (!x) return;
  btn.disabled = true;
  call('inv_item_save', { id: x.id, name: x.name, unit: x.unit, category: x.category || '', lowStockAt: num(x.lowStockAt), active: true }, function (res) {
    if (!res.ok) { btn.disabled = false; T.toast(errText(res)); return; }
    T.toast(x.name + ' is back on the sheet');
    if (mg) loadManage();
    load(true);
  });
}
function openCount(id) {
  var x = mgItem(id); if (!x) return;
  mg.screen = 'count'; mg.edit = x;
  var isToday = inv.day === inv.today;
  $('modalCard').innerHTML = '<form id="invCountForm" class="form" autocomplete="off" onsubmit="return false">' +
    '<h2 id="modalTitle">Physical count: ' + esc(x.name) + '</h2>' +
    '<p>The till has <b>' + esc(qu(x.stock, x.unit)) + '</b>. Enter what is actually on the shelf' + (isToday ? '' : ' (dated ' + esc(dayLabel(inv.day)) + ')') + '. The difference is recorded as an adjustment.</p>' +
    '<label for="invCount">Counted (' + esc(x.unit || '') + ')</label>' +
    '<input type="number" id="invCount" inputmode="decimal" step="any" min="0" placeholder="0">' +
    '<p class="hint" id="invCDiff"></p>' +
    '<label for="invCNote">Note, optional</label><input type="text" id="invCNote" maxlength="120" placeholder="Weekly count, spoiled, spilled">' +
    '<p class="banner hidden" id="invCErr"></p>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-iact="manage-back">Back</button>' +
    '<button type="button" class="btn primary" data-iact="count-save">Save count</button></div></form>';
  $('invCount').focus();
}
function countDiff() {
  var x = mg && mg.edit, el = $('invCDiff'); if (!x || !el) return;
  var raw = $('invCount').value.trim(), c = parseFloat(raw);
  if (raw === '' || !isFinite(c)) { el.textContent = ''; return; }
  var d = Math.round((c - num(x.stock)) * 1000) / 1000;
  el.textContent = d ? 'Difference: ' + signed(d, x.unit) : 'Matches the till. No change.';
}
function saveCount(btn) {
  var x = mg.edit, raw = $('invCount').value.trim(), c = parseFloat(raw), note = $('invCNote').value.trim();
  if (raw === '' || !isFinite(c) || c < 0) { formErr('invCErr', 'Enter the number you counted, 0 or more.'); $('invCount').focus(); return; }
  var body = { itemId: x.id, type: 'adjust', count: c, day: inv.day };
  if (note) body.note = note;
  formErr('invCErr', ''); btn.disabled = true; btn.textContent = 'Saving…';
  call('inv_move', body, function (res) {
    if (!mg || !$('invCountForm')) { if (res.ok) { T.toast('Count saved'); load(true); } return; }
    if (!res.ok) { btn.disabled = false; btn.textContent = 'Save count'; formErr('invCErr', errText(res)); return; }
    T.toast(x.name + ' set to ' + qu(c, x.unit));
    mg.items = null; renderManage(); loadManage(); load(true);
  });
}

/* ---------- History ---------- */
function historyHtml() {
  if (!inv.histTo) inv.histTo = inv.today;
  if (!inv.histFrom) inv.histFrom = addDays(inv.histTo, -6);
  var opts = items().slice().sort(byCatName).map(function (x) {
    return '<option value="' + esc(x.id) + '"' + (String(inv.histItem) === String(x.id) ? ' selected' : '') + '>' + esc(x.name) + (x.active === false ? ' (hidden)' : '') + '</option>';
  }).join('');
  var h = '<div class="card inv-hist-tools">' +
    '<div><label class="field-l" for="invHFrom">From</label><input type="date" id="invHFrom" max="' + esc(inv.today) + '" value="' + esc(inv.histFrom) + '"></div>' +
    '<div><label class="field-l" for="invHTo">To</label><input type="date" id="invHTo" max="' + esc(inv.today) + '" value="' + esc(inv.histTo) + '"></div>' +
    '<div><label class="field-l" for="invHItem">Item</label><select id="invHItem"><option value="">All items</option>' + opts + '</select></div>' +
    '<button type="button" class="btn secondary" data-iact="hist-load"' + (inv.histLoading ? ' disabled' : '') + '>' + (inv.histLoading ? 'Loading…' : 'Show') + '</button></div>';
  h += '<div class="inv-hist">';
  if (inv.histFailed) h += stateBox('idle', 'Could not load', inv.histFailed, false);
  else if (!inv.hist) h += stateBox('idle', 'Loading…', 'Fetching the history.');
  else {
    var days = (inv.hist.days || []).slice().sort(function (a, b) { return a.day < b.day ? 1 : -1; });
    if (!days.length) h += stateBox('idle', 'Nothing recorded', 'No arrivals or usage in these days.');
    h += days.map(function (d) {
      var rows = (d.items || []).filter(function (x) { return num(x.received) || num(x.used) || num(x.adjusted); });
      return '<section class="card inv-day"><h3>' + esc(dayLabel(d.day)) + ' <span class="soft">' + esc(d.day) + '</span></h3>' +
        (rows.length ? '<div class="inv-hrows">' + rows.map(function (x) {
          var u = x.unit || '';
          return '<div class="inv-hrow"><span class="inv-hname">' + esc(x.itemName || 'Item') + '</span>' +
            '<span class="in">' + (num(x.received) ? '+' + esc(qu(x.received, u)) : '') + '</span>' +
            '<span class="out">' + (num(x.used) ? '−' + esc(qu(x.used, u)) : '') + '</span>' +
            '<span class="adj">' + (num(x.adjusted) ? esc(signed(x.adjusted, u)) + ' count' : '') + '</span></div>';
        }).join('') + '</div>' : '<p class="hint">Nothing recorded.</p>') + '</section>';
    }).join('');
  }
  return h + '</div>';
}
function loadHist() {
  var from = inv.histFrom, to = inv.histTo;
  if (!validDay(from) || !validDay(to)) { T.toast('Pick both dates.'); return; }
  if (from > to) { T.toast('"From" must be on or before "To".'); return; }
  if (to > inv.today) { T.toast('Future days have no history.'); return; }
  if (daysBetween(from, to) > 91) { T.toast('Pick at most 92 days.'); return; }
  var seq = ++inv.hseq, body = { from: from, to: to };
  if (inv.histItem) body.itemId = inv.histItem;
  inv.histLoading = true; inv.histFailed = '';
  render();
  call('inv_history', body, function (res) {
    if (seq !== inv.hseq) return;
    inv.histLoading = false;
    if (res.ok) inv.hist = res; else { inv.hist = null; inv.histFailed = errText(res); }
    if (inv.view === 'history') render();
  });
}

/* ---------- wiring ---------- */
document.addEventListener('click', function (ev) {
  var el = ev.target.closest ? ev.target.closest('[data-iact]') : null;
  if (!el || el.disabled) return;
  var a = el.getAttribute('data-iact'), id = el.getAttribute('data-iid'), key = el.getAttribute('data-iline'), v = el.getAttribute('data-v');
  switch (a) {
    case 'refresh': load(!!inv.data); if (inv.view === 'history') loadHist(); break;
    case 'today': inv.day = inv.today; inv.data = null; load(); break;
    case 'view':
      if (inv.view === v) break;
      inv.view = v === 'history' ? 'history' : 'sheet'; render();
      if (inv.view === 'history' && !inv.hist && !inv.histLoading) loadHist();
      break;
    case 'move': openMove(v === 'out' ? 'out' : 'in'); break;
    case 'close': T.closeModal(); mv = null; mg = null; break;
    case 'undo': askUndo(id); break;
    case 'undo-yes': doUndo(el, id); break;
    case 'pick': if (!mv) break; readMove(); mv.pick = mv.pick === key ? '' : key; mv.pickQ = ''; mv.focusPick = !!mv.pick; renderMove(); break;
    case 'pick-item': {
      if (!mv) break;
      readMove();
      var l = lineByKey(key); if (!l) break;
      l.itemId = id; l.error = ''; mv.pick = ''; mv.pickQ = '';
      renderMove();
      var q = document.querySelector('.inv-qty[data-iline="' + key + '"]'); if (q && !q.value) q.focus();
      break;
    }
    case 'line-add': {
      if (!mv) break;
      readMove();
      var nl = newLine(); mv.lines.push(nl); mv.pick = nl.key; mv.pickQ = ''; mv.focusPick = true;
      renderMove(); break;
    }
    case 'line-del':
      if (!mv) break;
      readMove();
      mv.lines = mv.lines.filter(function (x) { return x.key !== key; });
      if (!mv.lines.length) mv.lines.push(newLine());
      if (mv.pick === key) mv.pick = '';
      renderMove(); break;
    case 'move-save': saveMove(); break;
    case 'manage': openManage(); break;
    case 'manage-reload': if (mg) { mg.failed = ''; renderManage(); loadManage(); } break;
    case 'manage-back': if (mg) renderManage(); break;
    case 'toggle-hidden': if (mg) { mg.showHidden = !mg.showHidden; renderManage(); } break;
    case 'item-new': if (mg) openItemForm(''); break;
    case 'item-edit': if (mg) openItemForm(id); break;
    case 'unit':
      if ($('invIUnit')) {
        $('invIUnit').value = v;
        [].forEach.call(el.parentNode.querySelectorAll('button'), function (b) { b.classList.toggle('on', b === el); });
      }
      break;
    case 'item-save': if (mg) saveItem(el); break;
    case 'item-hide': if (mg) askHide(id); break;
    case 'item-hide-yes': doHide(el, id); break;
    case 'item-show': doShow(el, id); break;
    case 'adjust': if (mg) openCount(id); break;
    case 'count-save': if (mg) saveCount(el); break;
    case 'hist-load':
      if ($('invHFrom')) { inv.histFrom = $('invHFrom').value; inv.histTo = $('invHTo').value; inv.histItem = $('invHItem').value; }
      loadHist(); break;
  }
});
document.addEventListener('input', function (ev) {
  var t = ev.target; if (!t || !t.id && !t.classList) return;
  if (t.id === 'invSearch') { inv.q = t.value; renderSheet(); return; }
  if (t.id === 'invCount') { countDiff(); return; }
  if (t.id === 'invIUnit') {
    var u = t.value.trim();
    [].forEach.call(document.querySelectorAll('.inv-units button'), function (b) { b.classList.toggle('on', b.getAttribute('data-v') === u); });
    return;
  }
  if (!mv || !t.classList) return;
  if (t.classList.contains('inv-pick-q')) { mv.pickQ = t.value; var pl = $('invPickList'); if (pl) pl.innerHTML = pickListHtml(t.getAttribute('data-iline')); return; }
  if (t.classList.contains('inv-qty')) {
    var l = lineByKey(t.getAttribute('data-iline')); if (!l) return;
    l.qty = t.value; l.error = ''; updateLineWarn(l.key);
  }
});
document.addEventListener('change', function (ev) {
  var t = ev.target; if (!t) return;
  if (t.id === 'invHFrom') { inv.histFrom = t.value; return; }
  if (t.id === 'invHTo') { inv.histTo = t.value; return; }
  if (t.id === 'invHItem') { inv.histItem = t.value; return; }
  if (t.id === 'invDay') {
    var d = t.value;
    if (!validDay(d) || !isOwner()) { t.value = inv.day; return; }
    if (d > inv.today) { T.toast('Future days cannot be opened.'); t.value = inv.day; return; }
    if (d === inv.day) return;
    inv.day = d; inv.data = null; load();
  }
});
/* Enter in the item search picks the first match instead of saving the whole form */
document.addEventListener('keydown', function (ev) {
  var t = ev.target;
  if (ev.key !== 'Enter' || !t || !t.classList) return;
  if (t.classList.contains('inv-pick-q')) {
    ev.preventDefault(); ev.stopPropagation();
    var first = document.querySelector('#invPickList .inv-pick-opt'); if (first) first.click();
  } else if (t.id === 'invSearch') ev.preventDefault();
}, true);
window.addEventListener('online', function () { if (visible()) load(!!inv.data); });
window.addEventListener('offline', function () { if (visible()) render(); });
document.addEventListener('visibilitychange', function () { if (!document.hidden && visible() && !$('invMvForm') && !mgOpen()) load(true); });

if (!T.backend) {
  [].forEach.call(document.querySelectorAll('.inv-tab'), function (b) { b.classList.add('hidden'); });
}

window.FatInv = {
  show: function (root) {
    var r = T.role();
    if (inv.role !== r) {
      inv.role = r; inv.data = null; inv.hist = null; inv.histFailed = ''; inv.view = 'sheet'; inv.q = ''; inv.day = '';
      inv.histFrom = ''; inv.histTo = ''; inv.histItem = '';
    }
    if (inv.root && inv.root !== root) inv.root.innerHTML = '';
    inv.root = root;
    inv.today = todayPk();
    if (!inv.day || !isOwner() || inv.day > inv.today) { if (inv.day !== inv.today) inv.data = null; inv.day = inv.today; }
    render();
    load(!!inv.data);
    if (inv.view === 'history' && !inv.histLoading) loadHist();
  },
  /* the till locked: nothing of this session stays on screen */
  reset: function () {
    inv.seq++; inv.hseq++;
    if (inv.root) inv.root.innerHTML = '';
    inv.root = null; inv.role = ''; inv.data = null; inv.hist = null; mv = null; mg = null;
    setLowBadge(0);
  }
};

})();
