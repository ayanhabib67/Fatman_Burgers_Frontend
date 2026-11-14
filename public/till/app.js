/* WHIPPED POS — app logic.
   Settings (menu, PINs, sync link) live in config.js. */
(function () {
'use strict';

var CFG = window.WHIPPED_CONFIG || {};
/* Missing TAX keeps the shared Whipped till's old amounts and screens. */
var TAX = window.TAX || { enabled: false };
function applyOrderTax(o) {
  if (!TAX.enabled) return;
  if (o.payment === 'Unpaid') { delete o.tax; return; }
  var t = TAX.compute(o.items, o.discount, o.payment);
  o.tax = { rate: t.rate, sale: t.sale, tax: t.tax }; o.total = t.total;
}
/* MENU starts from config as offline fallback; loadMenuFromServer() replaces it from Mongo. */
var MENU = (CFG.MENU || []).map(function (m) { return { c: m.c, n: m.n, p: m.p, k: m.k, i: m.i || '' }; });
var menuFromDb = false;
/* Outlets (10 Oct 2026): one database, more than one shop. The till names its shop on sign-in and
   keeps its own books on the device, so a phone can hold both tills without mixing them up. */
var OUTLET = /^[a-z][a-z0-9_-]{1,19}$/.test(String(CFG.OUTLET || '')) ? CFG.OUTLET : 'whipped';
var SUF = OUTLET === 'whipped' ? '' : '_' + OUTLET;
var BRAND = Object.assign({
  name: 'Whipped', wordmark: 'WHIPPED', app: 'Whipped POS', tagline: 'CRAFTED WITH CARE. MADE FOR YOU.',
  sign: "let's get whipped", thing: 'drink', things: 'drinks', start: 'tap a drink to start', statement: 'Whipped Coffee', salePrefix: 'Whipped Sale', filePrefix: 'whipped', staff: 'Barista'
}, CFG.BRAND || {});
/* Where an order came from. A channel with an account goes on that account unless the customer pays now. */
var CHANNELS = Array.isArray(CFG.CHANNELS) && CFG.CHANNELS.length ? CFG.CHANNELS
  : [{ v: 'Counter', l: 'Counter' }, { v: 'FatMan', l: 'FatMan counter', acct: 'Fatman' }, { v: 'Foodpanda', l: 'Foodpanda', acct: 'Foodpanda' }];
/* A kitchen slip prints with every new order: order number, time, the items large. */
var KITCHEN_SLIP = !!CFG.KITCHEN_SLIP;
/* Shift sign-in (10 Oct 2026): with a STAFF list in config.js, whoever unlocks the till picks their name,
   and every order, void, expense, count and waste carries it. No list, no question. */
var STAFF = (CFG.STAFF || []).map(function (n) { return txt(n, 30); }).filter(Boolean);
var WHO_KEY = 'whipped_pos_who' + SUF;
var who = '';
try { who = STAFF.indexOf(sessionStorage.getItem(WHO_KEY) || '') >= 0 ? sessionStorage.getItem(WHO_KEY) : ''; } catch (e) {}
function whoName() { return who || (role === 'owner' ? 'Owner' : BRAND.staff); }
function setWho(n) {
  who = STAFF.indexOf(n) >= 0 ? n : '';
  try { if (who) sessionStorage.setItem(WHO_KEY, who); else sessionStorage.removeItem(WHO_KEY); } catch (e) {}
  var b = $('whoBtn'); if (b) { b.textContent = who || 'Who is on?'; b.classList.toggle('hidden', !STAFF.length); }
}
function askWho(force) {
  if (!STAFF.length) return;
  openModal('<h2 id="modalTitle">Who is on the till?</h2><p>Your name goes on every order and count this shift.</p>' +
    '<div class="chips who-chips" role="group" aria-label="Staff">' + STAFF.map(function (n) {
      return '<button type="button" data-act="who-pick" data-v="' + esc(n) + '"' + (n === who ? ' class="on"' : '') + '>' + esc(n) + '</button>';
    }).join('') + '</div>' + (force ? '' : '<button type="button" class="btn quiet" data-act="close-modal">Cancel</button>'));
}
/* Kitchen display (10 Oct 2026): a tablet at the pass shows open orders oldest first; "Served" stamps the
   time, and order-to-pass minutes follow the order into the owner's numbers. KITCHEN_DISPLAY in config.js. */
var KDS = !!CFG.KITCHEN_DISPLAY;
var kdsTimer = null;
function passMinutes(o) { return o.servedAt && o.id ? Math.max(0, (o.servedAt - o.id) / 60000) : null; }
function elapsedMin(o) { return Math.max(0, (nowMs() - o.id) / 60000); }
function renderKitchen() {
  var list = $('kdsList'), done = $('kdsDone'); if (!list) return;
  var open = orders.filter(function (o) { return isToday(o) && !o.servedAt; }).sort(function (a, b) { return a.id - b.id; });
  var h = '';
  open.forEach(function (o) {
    var m = elapsedMin(o), cls = m >= 15 ? ' late' : m >= 8 ? ' slow' : '';
    h += '<div class="kds-card' + cls + '">' +
      '<div class="kds-head"><div class="kds-top"><span class="num kds-no">#' + pad(o.no) + '</span><span class="kds-age">' + Math.floor(m) + ' min</span></div>' +
      '<div class="kds-meta">' + (o.remake ? '<b class="badge Unpaid">REMAKE of #' + pad(o.remake.no) + ', ' + esc(o.remake.why) + '</b> · ' : '') + (o.adj ? '<b class="badge Unpaid">CHANGE to #' + pad(o.adj.no) + ', ' + esc(o.adj.why) + '</b> · ' : '') + (o.edits && nowMs() - o.edits[o.edits.length - 1].at < 15 * 60000 ? '<b class="badge Unpaid">CHANGED ' + esc(o.edits[o.edits.length - 1].d) + '</b> · ' : '') + (o.svc ? '<b>' + esc(o.svc) + '</b> · ' : '') + esc(shortTime(o)) + (o.channel !== 'Counter' ? ' · ' + esc(channelLabel(o.channel)) : '') + (o.customer && o.customer !== 'Walk-in' ? ' · ' + esc(o.customer) : '') + (o.waiter ? ' · ' + esc(o.waiter) : '') + '</div></div>' +
      '<div class="kds-body"><ul class="kds-items">' + o.items.map(function (it) {
        return '<li><span class="kds-q">' + it.q + '×</span><span class="kds-n">' + (isCancel(it) ? '<span class="kds-cancel">CANCEL</span> ' : '') + esc(label(it)) +
          (hasMods(it) ? '<span class="kds-note">' + esc(it.mods.map(function (m) { return '+ ' + m.n; }).join(', ')) + '</span>' : '') +
          (it.note ? '<span class="kds-note">' + esc(it.note) + '</span>' : '') + '</span></li>';
      }).join('') + '</ul>' +
      (o.note ? '<div class="kds-order-note">' + esc(o.note) + '</div>' : '') + '</div>' +
      '<div class="kds-foot"><button type="button" class="btn primary" data-act="served" data-id="' + o.id + '">Served</button></div></div>';
  });
  list.innerHTML = h || '<div class="empty"><span class="scribble">all clear</span>Every order of today has gone out.</div>';
  var served = orders.filter(function (o) { return isToday(o) && o.servedAt; }).sort(function (a, b) { return b.servedAt - a.servedAt; }).slice(0, 8);
  done.innerHTML = served.length ? served.map(function (o) {
    var pm = passMinutes(o);
    return '<div class="row"><div class="row-main"><h3><span class="num">#' + pad(o.no) + '</span>' + esc(itemsText(o)) + '</h3><p>Rung ' + esc(shortTime(o)) + ', out in ' + pm.toFixed(1) + ' min' + (o.servedBy ? ' by ' + esc(o.servedBy) : '') + '</p></div>' +
      '<div class="row-side"><button type="button" class="btn sm secondary" data-act="unserve" data-id="' + o.id + '">Undo</button></div></div>';
  }).join('') : none('Nothing served yet today.');
  var open8 = open.filter(function (o) { return elapsedMin(o) >= 8; }).length;
  $('kdsNote').textContent = open.length ? open.length + ' open' + (open8 ? ', ' + open8 + ' waiting over 8 minutes' : '') + '.' : '';
  updateLate();
}
/* ---- Slow-order alert (12 Oct 2026): an open order past LATE_MIN shows on the Kitchen tab with the waiter's face, and the tab badge counts them ---- */
var LATE_MIN = CFG.LATE_MIN > 0 ? CFG.LATE_MIN : 15, lateTold = {};
function lateOrders() { return orders.filter(function (o) { return isToday(o) && !o.servedAt && elapsedMin(o) >= LATE_MIN; }).sort(function (a, b) { return a.id - b.id; }); }
function beep() {
  try { var A = window.AudioContext || window.webkitAudioContext; if (!A) return; var ctx = beep.ctx || (beep.ctx = new A()); var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 0.18); } catch (e) {}
}
function updateLate() {
  if (role !== 'barista') return;
  var L = lateOrders(); if (isRole('waiter')) L = L.filter(function (o) { return o.waiter === me.name; });
  var fresh = L.filter(function (o) { return !lateTold[o.id]; });
  L.forEach(function (o) { lateTold[o.id] = 1; });
  var b = $('kdsLate'); if (b) { b.textContent = L.length; b.classList.toggle('hidden', !L.length); }
  var bar = $('lateBar');
  if (bar) {
    bar.classList.toggle('hidden', !L.length);
    bar.innerHTML = L.map(function (o) {
      return '<div class="late-row"><span class="num">#' + pad(o.no) + '</span> ' + Math.floor(elapsedMin(o)) + ' min' + (o.customer && o.customer !== 'Walk-in' ? ' · ' + esc(o.customer) : '') +
        (o.waiter ? ' · ' + faceHtml(o.waiter) + esc(o.waiter) : ' · no waiter') + '<span class="late-what">' + esc(itemsText(o)) + '</span></div>';
    }).join('');
  }
  if (fresh.length) { beep(); if (ui.tab !== 'kitchen') toast(fresh.length === 1 ? 'Order #' + pad(fresh[0].no) + ' is past ' + LATE_MIN + ' minutes' : fresh.length + ' orders past ' + LATE_MIN + ' minutes'); }
}
function markServed(id, undo) {
  var o = findOrder(id); if (!o) return;
  if (undo) { if (nowMs() - o.servedAt > 10 * 60000) { toast('Too late to undo'); return; } delete o.servedAt; delete o.servedBy; }
  else { o.servedAt = nowMs(); o.servedBy = whoName(); }
  stamp(o); commit('orders', o.id); renderKitchen(); if (role === 'barista') renderOrdersTab();
}
/* The lines of the monthly P&L an expense can be filed under (same keys the books use). */
var DEFAULT_LINES = [['grocery', 'Grocery purchase'], ['meat', 'Meat purchase'], ['beverages', 'Beverages purchase'], ['disposables', 'Disposable items'],
  ['salaries', 'Salaries'], ['gas', 'Cylinder / gas'], ['packing', 'Packing'], ['srb', 'SRB (sales tax)'], ['posfees', 'Card machine fees'],
  ['foodpanda', 'Food Panda service fee'], ['consignment', 'Consignment payments'], ['repair', 'Repair and maintenance'], ['unrecovered', 'Unrecovered amount'],
  ['marketing', 'Marketing / vlogger'], ['electricity', 'Electricity'], ['misc', 'Miscellaneous']];
/* A preview on your own computer never touches the live books. It only talks to a
   local test server, and only when the address says so (?api=http://localhost:8787). */
var IS_PREVIEW = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function previewApi() {
  try {
    var m = /[?&]api=([^&#]+)/.exec(location.search);
    if (m) sessionStorage.setItem('whipped_dev_api', decodeURIComponent(m[1]));
    var u = sessionStorage.getItem('whipped_dev_api') || '';
    return /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(u) ? u : '';
  } catch (e) { return ''; }
}
var API_URL = String(IS_PREVIEW ? previewApi() : (CFG.SUPABASE_URL || '')).replace(/\/+$/, '');
var API_KEY = IS_PREVIEW ? 'preview' : (CFG.SUPABASE_KEY || '');
/* BACKEND: orders go to the Supabase database. Without it the till uses the old Google link. */
var BACKEND = !!(CFG.API_RPC_BASE || (API_URL && API_KEY));
var SYNC_URL = IS_PREVIEW ? '' : (CFG.SYNC_URL || '');
var KEEP_DAYS = CFG.KEEP_DAYS || 45;
var AUTH_KEY = 'whipped_pos_auth' + SUF;
var DELIVERY_PKG = CFG.DELIVERY_PKG == null ? 9 : CFG.DELIVERY_PKG;
var DAY_CUTOFF_HOUR = CFG.DAY_CUTOFF_HOUR == null ? 4 : CFG.DAY_CUTOFF_HOUR;
var PIN_DIGITS = CFG.PIN_DIGITS || 4;
/* Bank card deals (11 October): [{bank, pct, cards: [...]}] in config.js. A deal is a discount the customer earns by
   paying with a listed card, so the order carries which card, the receipt names it, the owner's day shows deals apart
   from other discounts, and a deal order can only be closed as Card. Empty list: the Discount sheet is as before. */
/* Kitchen notes and the waiter (11 October 2026). A note on a line ("no onions") or on the whole order ("table by the
   window, birthday") goes on the kitchen slip, the kitchen display, the receipt and the owner's rows. The waiter who took
   the order is chosen per order from WAITERS in config.js plus the names typed on this device; it stays chosen for the
   next order until changed, and is cleared when the till is locked. */
var NOTE_CHIPS = (Array.isArray(CFG.NOTE_CHIPS) ? CFG.NOTE_CHIPS : ['No onions', 'No pickles', 'No jalapeños', 'No sauce', 'Extra cheese', 'Extra sauce', 'Well done', 'Spicy', 'Cut in half', 'Pack separately']).map(function (n) { return txt(n, 30); }).filter(Boolean);
var WAITERS = (CFG.WAITERS || []).map(function (n) { return txt(n, 30); }).filter(Boolean);
var WAITER_KEY = 'pos_waiters_recent';
function recentWaiters() { try { return (JSON.parse(localStorage.getItem(WAITER_KEY) || '[]') || []).map(function (n) { return txt(n, 30); }).filter(Boolean).slice(0, 8); } catch (e) { return []; } }
function rememberWaiter(n) { try { var r = recentWaiters().filter(function (x) { return x !== n; }); r.unshift(n); localStorage.setItem(WAITER_KEY, JSON.stringify(r.slice(0, 8))); } catch (e) {} }
var BANK_DEALS = Array.isArray(CFG.BANK_DEALS) ? CFG.BANK_DEALS.filter(function (d) { return d && d.bank && d.pct > 0 && Array.isArray(d.cards); }) : [];
var KEY = 'whipped_pos_v5' + SUF;
var LOCK_KEY = 'whipped_pos_lock' + SUF;
var OWNER_IDLE_MS = 5 * 60 * 1000;

var orders = [], expenses = [], voided = [], cart = [], seq = 0, customItems = [];
var storageOK = true, paper80 = true, matchaLocal = true, dirty = false;
var role = null, period = 'today', voidAll = false;
var syncing = false, syncAgain = false, syncTimer = null, lastId = 0, lastActive = Date.now();
var ui = { cat: 'All', q: '', channel: 'Counter', payment: 'Cash', disc: 0, deal: null, waiter: '', tab: 'sell', otab: 'today', ordersChan: 'Counter', payNow: false, bExpType: 'stock', oExpType: 'stock' };
/* The owner's books. They sync like orders do: accounts, day closes, cash moves, and stock. */
var EXTRA = ['accounts', 'days', 'moves', 'stock', 'recipes', 'stockmoves', 'vendors', 'vendormoves', 'people', 'outs', 'customers', 'signoffs', 'feed'];
var VENDORS_ON = !!CFG.VENDORS;
var more = {};
EXTRA.forEach(function (k) { more[k] = []; });
var pin = '', loginRole = 'barista', fails = 0, lockTimer = null, customWarned = false;
var cursor = 0, outbox = {}, migrated = false, epoch = '', skew = 0, skewTold = false, shrinking = false;
var auth = null, sessionPin = '', checking = false;

function $(id) { return document.getElementById(id); }
function copy(o) { return JSON.parse(JSON.stringify(o)); }
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function n0(v) { return Math.round(v || 0).toLocaleString(); }
function money(n) { return n0(n) + ' PKR'; }
function pad(n) { n = Math.max(0, Math.floor(Number(n) || 0)); return String(n).length >= 4 ? String(n) : ('0000' + n).slice(-4); }
/* The time, corrected by what the server says when this device's own clock is wrong. */
function nowMs() { return Date.now() + skew; }
/* A changed record must always carry a later stamp than the copy it replaces, whatever the clocks say. */
function stamp(rec) { rec.u = Math.max(nowMs(), (rec.u || 0) + 1); }
function reducedMotion() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }

/* ====== TRADING DAY ======
   Anything rung up before the cutoff hour counts as the previous
   day's trade, so one night stays on one sheet. */
function bizDate(d) {
  var x = new Date(d ? d.getTime() : nowMs());
  if (x.getHours() < DAY_CUTOFF_HOUR) x.setDate(x.getDate() - 1);
  return x;
}
function isoOf(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function isoNow() { return isoOf(bizDate()); }
function localeDay() { return bizDate().toLocaleDateString(); }
function curMonth() { return isoNow().slice(0, 7); }
function timeNow() { return new Date(nowMs()).toLocaleTimeString(); }
function niceDay(d) { return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }); }
function bizLabel() {
  var late = new Date(nowMs()).getHours() < DAY_CUTOFF_HOUR;
  return 'Trading day ' + niceDay(bizDate()) + (late ? ' (last night)' : '');
}
/* Older records only carry a device-formatted date, newer ones an ISO date. */
function onDay(iso, legacy) { return iso ? iso === isoNow() : legacy === localeDay(); }
function isToday(x) { return onDay(x.iso, x.date); }
function inPeriod(x) { return period === 'today' ? isToday(x) : (x.iso || '').slice(0, 7) === curMonth(); }
function inPeriodVoid(v) { return period === 'today' ? onDay(v.voidedIso, v.voidedDate) : (v.voidedIso || '').slice(0, 7) === curMonth(); }
function paidToday(o) {
  if (o.paidIso) return o.paidIso === isoNow();
  if (o.paidDate) return o.paidDate === localeDay();
  return isToday(o);
}
/* Display times come from the order, never an imported platform-reference id.
   Keep this separate from orderMs: stock counts retain their approved timing rules. */
function displayClock(x) {
  var t = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(String(x.time || '').trim());
  if (t && +t[2] < 60 && (!t[3] || +t[3] < 60) &&
      (t[4] ? +t[1] >= 1 && +t[1] <= 12 : +t[1] < 24)) {
    return { h: t[4] ? +t[1] % 12 + (t[4].toUpperCase() === 'PM' ? 12 : 0) : +t[1], m: +t[2] };
  }
  var candidates = [x.time, x.iso, x.stamp];
  for (var i = 0; i < candidates.length; i++) {
    var v = candidates[i];
    if (!(typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) &&
        !(i === 2 && typeof v === 'number' && v > 1e12 && v < 1e14)) continue;
    var d = new Date(v);
    if (!isNaN(d.getTime())) return { h: d.getHours(), m: d.getMinutes() };
  }
  if (x.id > 1e12 && x.id < 1e14) {
    var legacy = new Date(x.id);
    if (!isNaN(legacy.getTime())) return { h: legacy.getHours(), m: legacy.getMinutes() };
  }
  return null;
}
function shortTime(x) {
  var t = displayClock(x);
  return t ? ('0' + t.h).slice(-2) + ':' + ('0' + t.m).slice(-2) : x.time || '';
}
function dayText(x) {
  if (isToday(x)) return 'today';
  if (x.iso) { var p = x.iso.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  return x.date || '';
}

/* ====== NAMES ====== */
function label(it) {
  var c = it.c || '';
  if (c === 'Hot Coffee' || c === 'Matcha Hot') return (/^hot /i.test(it.n) ? '' : 'Hot ') + it.n;
  if (c === 'Iced Coffee' || c === 'Matcha Iced') return (/^iced /i.test(it.n) ? '' : 'Iced ') + it.n;
  return it.n;
}
function itemsText(o) {
  return o.items.map(function (it) { return (isCancel(it) ? 'Cancel ' : '') + label(it) + modsText(it) + (it.q > 1 ? ' ×' + it.q : '') + (it.note ? ' (' + it.note + ')' : ''); }).join(', ');
}
function itemCount(o) { var c = 0; o.items.forEach(function (it) { c += it.q; }); return c; }

/* ====== SAVE ON THIS DEVICE ====== */
function addCustomToMenu(ci) {
  for (var i = 0; i < MENU.length; i++) {
    if (MENU[i].c === 'Food' && MENU[i].n.toLowerCase() === String(ci.n).toLowerCase()) {
      if ((ci.u || 0) > (MENU[i].u || 0)) { MENU[i].p = ci.p; MENU[i].k = ci.k; MENU[i].u = ci.u; }
      return false;
    }
  }
  MENU.push({ c: 'Food', n: ci.n, p: ci.p, k: ci.k, custom: true, u: ci.u || 0, i: 'food' });
  return true;
}
function syncCustomList() {
  customItems = MENU.filter(function (m) { return m.custom; }).map(function (m) {
    return { c: 'Food', n: m.n, p: m.p, k: m.k, custom: true, u: m.u || 0 };
  });
}
function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
function txt(v, max) { return v == null ? '' : String(v).slice(0, max); }
/* Records are only taken in, from storage or from the server, if they have the shape the till
   itself produces: numbers where numbers are shown, short text where text is shown. */
function cleanOrder(o) {
  if (!o || typeof o !== 'object' || o.id == null || !isFinite(Number(o.id)) || !Array.isArray(o.items)) return null;
  o.id = Number(o.id); o.no = num(o.no); o.total = num(o.total); o.sub = num(o.sub); o.cogs = num(o.cogs);
  o.discount = num(o.discount); o.discountPct = num(o.discountPct);
  if (o.tax && typeof o.tax === 'object') o.tax = { rate: num(o.tax.rate), sale: num(o.tax.sale), tax: num(o.tax.tax) }; else delete o.tax;
  if (o.deal && typeof o.deal === 'object' && o.deal.bank) o.deal = { bank: txt(o.deal.bank, 20), card: txt(o.deal.card, 60), pct: num(o.deal.pct) }; else delete o.deal;
  if (o.u != null) o.u = num(o.u);
  if (['Cash', 'Card', 'Transfer', 'Unpaid'].indexOf(o.payment) < 0) o.payment = 'Unpaid';
  o.customer = txt(o.customer, 60) || 'Walk-in'; o.channel = txt(o.channel, 30) || 'Counter';
  if (o.phone != null) { o.phone = phoneDigits(o.phone); if (o.phone.length < 7) delete o.phone; }
  if (o.reward != null) { o.reward = txt(o.reward, 40); if (!o.reward) delete o.reward; }
  if (o.svc != null) { o.svc = txt(o.svc, 20); if (!o.svc) delete o.svc; }
  if (o.visit != null) { o.visit = num(o.visit); if (!o.visit) delete o.visit; }
  if (o.remake && typeof o.remake === 'object') o.remake = { of: num(o.remake.of), no: num(o.remake.no), why: txt(o.remake.why, 40) }; else delete o.remake;
  if (o.adj && typeof o.adj === 'object') o.adj = { of: num(o.adj.of), no: num(o.adj.no), why: txt(o.adj.why, 60) }; else delete o.adj;
  if (Array.isArray(o.edits) && o.edits.length) {
    o.edits = o.edits.slice(-20).filter(function (e) { return e && typeof e === 'object' && num(e.at) > 0; }).map(function (e) { var r = { at: num(e.at), by: txt(e.by, 30), why: txt(e.why, 60), was: num(e.was), now: num(e.now), d: txt(e.d, 100) }; if (e.adjNo) r.adjNo = num(e.adjNo); return r; });
    if (!o.edits.length) delete o.edits;
  } else delete o.edits;
  if (o.note != null) { o.note = txt(o.note, 160); if (!o.note) delete o.note; }
  if (o.waiter != null) { o.waiter = txt(o.waiter, 30); if (!o.waiter) delete o.waiter; }
  if (o.table != null) o.table = num(o.table);
  o.items = o.items.filter(function (it) { return it && typeof it === 'object'; }).map(function (it) {
    var r = { n: txt(it.n, 80), c: txt(it.c, 40), p: num(it.p), k: num(it.k), q: Math.max(1, Math.floor(num(it.q))) };
    if (num(it.v)) { r.v = num(it.v); r.vi = num(it.vi); } /* a vendor's shelf item: whose it is */
    if (it.note != null && txt(it.note, 80)) r.note = txt(it.note, 80);
    if (it.free === true) r.free = true;
    if (it.cancel === true) r.cancel = true;
    if (Array.isArray(it.mods) && it.mods.length) {
      r.mods = it.mods.slice(0, 8).filter(function (m) { return m && typeof m === 'object' && txt(m.n, 40); }).map(function (m) { return { n: txt(m.n, 40), p: num(m.p), k: num(m.k) }; });
      if (r.mods.length) { r.bp = num(it.bp); r.bk = num(it.bk); } else delete r.mods;
    }
    return r;
  });
  return o;
}
function cleanExpense(e) {
  if (!e || typeof e !== 'object' || e.id == null || !isFinite(Number(e.id))) return null;
  e.id = Number(e.id); e.amount = num(e.amount); e.name = txt(e.name, 80);
  if (e.u != null) e.u = num(e.u);
  if (Array.isArray(e.items)) {
    e.items = e.items.slice(0, 40).map(function (x) {
      if (!x || typeof x !== 'object') return null;
      var n = txt(x.n, 40), a = num(x.a);
      if (!n || !(a > 0)) return null;
      return { n: n, a: a };
    }).filter(Boolean);
    if (!e.items.length) delete e.items;
  }
  return e;
}
function cleanItem(c) {
  if (!c || typeof c !== 'object' || typeof c.n !== 'string' || !c.n) return null;
  return { c: 'Food', n: txt(c.n, 60), p: num(c.p), k: num(c.k), custom: true, u: num(c.u) };
}
/* A flat record from the books: numbers, true/false, short text, or a short list of flat rows. */
function cleanPlain(r) {
  if (!r || typeof r !== 'object' || (typeof r.id !== 'number' && typeof r.id !== 'string')) return null;
  function flat(src, maxKeys, maxLen, lists) {
    var out = {};
    Object.keys(src).slice(0, maxKeys).forEach(function (k) {
      var v = src[k];
      if (typeof v === 'number') out[k] = isFinite(v) ? v : 0;
      else if (typeof v === 'string') out[k] = v.slice(0, k === 'pl' ? 30 : k === 'i' ? 80 : maxLen);
      else if (typeof v === 'boolean' || v === null) out[k] = v;
      else if (lists && Array.isArray(v)) out[k] = v.slice(0, 100).filter(function (x) { return x && typeof x === 'object'; }).map(function (x) { return flat(x, 12, 100, false); });
    });
    return out;
  }
  var o = flat(r, 40, 200, true);
  if (o.u != null) o.u = num(o.u);
  return o;
}
function cleanPerson(r) {
  /* people (11 Oct 2026): a waiter with a photo. The photo is a small JPEG data URL, longer than the plain rule allows. */
  if (!r || typeof r !== 'object' || typeof r.id !== 'number' || !txt(r.name, 40)) return null;
  var o = { id: r.id, name: txt(r.name, 40), role: txt(r.role, 20) || 'waiter', u: num(r.u) };
  if (typeof r.photo === 'string' && r.photo.length <= 12000 && r.photo.indexOf('data:image/jpeg;base64,') === 0) o.photo = r.photo;
  if (r.deleted === true) o.deleted = true;
  return o;
}
function cleanFor(k) { return k === 'people' ? cleanPerson : cleanPlain; }
function cleanList(list, fn) { return (Array.isArray(list) ? list : []).map(fn).filter(Boolean); }
function load() {
  try {
    var s = localStorage.getItem(KEY);
    if (s) {
      var d = JSON.parse(s);
      orders = cleanList(d.orders, cleanOrder); expenses = cleanList(d.expenses, cleanExpense); voided = cleanList(d.voided, cleanOrder); seq = num(d.seq);
      if (d.paper80 === false) paper80 = false;
      if (d.matchaLocal === false) matchaLocal = false;
      dirty = !!d.dirty;
      cursor = num(d.cursor); outbox = d.outbox && typeof d.outbox === 'object' ? d.outbox : {}; migrated = !!d.migrated;
      epoch = txt(d.epoch, 64); skew = num(d.skew);
      EXTRA.forEach(function (k) { more[k] = cleanList((d.more || {})[k], cleanFor(k)); });
      var known = Array.isArray(d.kinds) ? d.kinds : [];
      if (cursor > 0 && EXTRA.some(function (k) { return known.indexOf(k) < 0; })) cursor = 0;   /* new kinds since this device last synced: start from the top once */
      cleanList(d.customItems, cleanItem).forEach(addCustomToMenu);
      syncCustomList(); shelfMenu();
      /* very old records carry no trading day: work it out from when they were rung up */
      [orders, expenses, voided].forEach(function (list) {
        list.forEach(function (x) { if (!x.iso && x.id > 1e12) x.iso = isoOf(bizDate(new Date(x.id))); });
      });
    }
    var wipeTok = txt(CFG.WIPE_ORDERS_TOKEN, 40);
    var wipeKey = 'pos_wipe_orders' + SUF;
    if (wipeTok && localStorage.getItem(wipeKey) !== wipeTok) {
      Object.keys(outbox).forEach(function (k) {
        if (/^(orders|voided|expenses|days|moves):/.test(k)) delete outbox[k];
      });
      orders = [];
      voided = [];
      expenses = [];
      more.days = [];
      more.moves = [];
      closeDraft = null;
      seq = 0;
      dirty = false;
      localStorage.setItem(wipeKey, wipeTok);
      try { localStorage.setItem(KEY, stateBlob()); } catch (e2) {}
    }
  } catch (e) { storageOK = false; }
}
function stateBlob() {
  return JSON.stringify({
    orders: orders, expenses: expenses, voided: voided, seq: seq,
    paper80: paper80, matchaLocal: matchaLocal, customItems: customItems, dirty: dirty,
    cursor: cursor, outbox: outbox, migrated: migrated, epoch: epoch, skew: skew, more: more, kinds: EXTRA
  });
}
function save() {
  try { localStorage.setItem(KEY, stateBlob()); return; } catch (e) {}
  if (BACKEND && !shrinking) {
    /* this device is out of room: keep fewer days here (the server has them all) and try again */
    shrinking = true;
    KEEP_DAYS = Math.max(7, Math.floor(KEEP_DAYS / 2)); prune();
    try { localStorage.setItem(KEY, stateBlob()); shrinking = false; return; } catch (e2) {}
    shrinking = false;
  }
  storageOK = false; $('storageWarning').classList.remove('hidden');
}
function newId() {
  var t = nowMs();
  if (t <= lastId) t = lastId + 1;
  lastId = t;
  return t;
}
/* Save a change here, and keep it on the upload list until the server confirms it. */
function commit(kind, id) {
  if (kind && BACKEND) outbox[kind + ':' + id] = 1;
  dirty = true; save(); queueSync();
}

/* ====== SYNC ====== */
function setSync(state, text) {
  ['syncB', 'syncO'].forEach(function (id) {
    var el = $(id); if (!el) return;
    el.className = 'sync-pill ' + state;
    el.querySelector('span').textContent = text;
  });
}
function waiting() { return Object.keys(outbox).length; }
function token() { var a = role && auth && auth.roles[role]; return a ? a.token : ''; }
function idleSyncText() {
  if (IS_PREVIEW && !BACKEND) return setSync('', 'Preview, not syncing');
  if (!BACKEND && !SYNC_URL) return setSync('', 'This device only');
  if (!BACKEND) return setSync(dirty ? 'off' : 'ok', dirty ? 'Waiting to sync' : 'Synced');
  var n = waiting();
  if (!token()) return setSync('off', n ? n + ' waiting, not signed in' : 'Not signed in to the server');
  setSync(n ? 'off' : 'ok', n ? n + ' waiting to upload' : 'Synced');
}
/* When two devices hold the same record, keep the one changed last. */
function pick(a, b) {
  var ua = a.u || 0, ub = b.u || 0;
  if (ub > ua) return b;
  if (ub === ua) {
    if (a.payment === 'Unpaid' && b.payment && b.payment !== 'Unpaid') return b;
    if (b.deleted && !a.deleted) return b;
  }
  return a;
}
function mergeById(a, b) {
  var map = {}, out = [];
  a.forEach(function (x) { map[x.id] = x; });
  b.forEach(function (x) { map[x.id] = map[x.id] ? pick(map[x.id], x) : x; });
  Object.keys(map).forEach(function (k) { out.push(map[k]); });
  out.sort(function (p, q) { return p.id - q.id; });
  return out;
}
function mergeRemote(d) {
  var src = d;
  EXTRA.forEach(function (k) { more[k] = mergeById(more[k], cleanList(src[k], cleanFor(k))); });
  shelfMenu();
  d = { orders: cleanList(d.orders, cleanOrder), voided: cleanList(d.voided, cleanOrder), expenses: cleanList(d.expenses, cleanExpense),
        customItems: cleanList(d.customItems, cleanItem), seq: num(d.seq) };
  voided = mergeById(voided, d.voided || []);
  var gone = {};
  voided.forEach(function (v) { gone[v.id] = 1; });
  /* a voided order must not come back from another device's copy */
  orders = mergeById(orders, d.orders || []).filter(function (o) { return !gone[o.id]; });
  expenses = mergeById(expenses, d.expenses || []);
  seq = Math.max(seq, d.seq || 0);
  var grew = false;
  (d.customItems || []).forEach(function (ci) { if (addCustomToMenu(ci)) grew = true; });
  syncCustomList();
  return grew;
}
function payload() {
  return JSON.stringify({ orders: orders, expenses: expenses, voided: voided, seq: seq, customItems: customItems });
}
function cloudSave(cb) {
  if (!SYNC_URL) { if (cb) cb('No sync URL set'); return; }
  fetch(SYNC_URL, { method: 'POST', mode: 'no-cors', body: payload() })
    .then(function () {
      dirty = false; save();
      setSync('ok', 'Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      if (cb) cb('sent');
    })
    .catch(function (e) {
      dirty = true; save();
      setSync('off', 'Offline, will retry');
      if (cb) cb('FAILED: ' + e.message);
    });
}
function jsonpGet(done, fail) {
  var cbName = '__wc' + Date.now();
  var sc = document.createElement('script');
  var t = setTimeout(function () { cleanup(); fail('timed out'); }, 15000);
  function cleanup() {
    try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    if (sc.parentNode) sc.parentNode.removeChild(sc);
    clearTimeout(t);
  }
  window[cbName] = function (d) { cleanup(); done(d); };
  sc.src = SYNC_URL + '?callback=' + cbName + '&t=' + Date.now();
  sc.onerror = function () { cleanup(); fail('could not reach the script'); };
  document.body.appendChild(sc);
}
/* Pull the shared copy, merge it with this device, then push the result. */
function cloudLoad(cb) {
  if (!SYNC_URL) { if (cb) cb(false); return; }
  if (syncing) { syncAgain = true; if (cb) cb(false); return; }
  syncing = true; setSync('busy', 'Syncing');
  jsonpGet(function (d) {
    var grew = mergeRemote(d || {});
    save(); syncing = false;
    if (grew) renderTiles();
    refreshAll();
    cloudSave(function () { if (syncAgain) { syncAgain = false; cloudLoad(); } });
    if (cb) cb(true);
  }, function (err) {
    syncing = false; setSync('off', 'Offline, will retry');
    /* the shared copy could not be read: still send this device's records so they are not stranded here */
    if (dirty && (orders.length || expenses.length || voided.length)) cloudSave();
    if (cb) cb(false, err);
  });
}

/* ---- Supabase backend ---- */
function randomHex() {
  var a = new Uint8Array(16), h = '';
  (window.crypto || window.msCrypto).getRandomValues(a);
  for (var i = 0; i < a.length; i++) h += ('0' + a[i].toString(16)).slice(-2);
  return h;
}
function deviceLabel() {
  var ua = navigator.userAgent;
  var kind = /iPhone/.test(ua) ? 'iPhone' : (/iPad/.test(ua) || (/Mac/.test(ua) && navigator.maxTouchPoints > 1)) ? 'iPad' :
    /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows PC' : 'Device';
  return kind + ' ' + randomHex().slice(0, 4);
}
function loadAuth() {
  try { auth = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { auth = null; }
  if (!auth || !auth.salt) auth = { salt: randomHex(), device: deviceLabel(), roles: {} };
  if (!auth.roles) auth.roles = {};
}
function saveAuth() { try { localStorage.setItem(AUTH_KEY, JSON.stringify(auth)); } catch (e) {} }
/* Lets a device that has signed in before check the PIN with no internet. */
function verifier(r, p) { return sha256(auth.salt + '|' + r + '|' + p); }
function remember(r, p, res) {
  auth.roles[r] = { token: res.token, ver: verifier(r, p), pv: (res.pv || {})[r] || 0 };
  saveAuth();
}
function api(fn, body, cb) {
  var ctl = window.AbortController ? new AbortController() : null, done = false;
  var t = setTimeout(function () { if (ctl) ctl.abort(); }, 20000);
  function finish(err, j) { if (done) return; done = true; clearTimeout(t); cb(err, j); }
  var head = { 'Content-Type': 'application/json', apikey: API_KEY };
  if (/^eyJ/.test(API_KEY)) head.Authorization = 'Bearer ' + API_KEY;
  fetch((CFG.API_RPC_BASE || (API_URL + '/rest/v1/rpc')) + '/' + fn, {
    method: 'POST', headers: head, body: JSON.stringify(body ? { p: body } : {}), signal: ctl ? ctl.signal : undefined
  }).then(function (r) {
    return r.json().then(function (j) { return { status: r.status, j: j }; });
  }).then(function (x) {
    if (x.status >= 400 || !x.j || typeof x.j.ok === 'undefined') finish(new Error((x.j && x.j.message) || ('server said ' + x.status)));
    else finish(null, x.j);
  }, function (e) { finish(e && e.name === 'AbortError' ? new Error('timed out') : e); });
}
function recFor(key) {
  var i = key.indexOf(':'), kind = key.slice(0, i), id = key.slice(i + 1), list, j;
  if (kind === 'customItems') {
    for (j = 0; j < customItems.length; j++) if (customItems[j].n.toLowerCase() === id) return customItems[j];
    return null;
  }
  list = more[kind] || (kind === 'orders' ? orders : kind === 'voided' ? voided : kind === 'expenses' ? expenses : []);
  for (j = 0; j < list.length; j++) if (String(list[j].id) === id) return list[j];
  return null;
}
function queueEverything() {
  orders.forEach(function (o) { outbox['orders:' + o.id] = 1; });
  voided.forEach(function (v) { outbox['voided:' + v.id] = 1; });
  expenses.forEach(function (e) { outbox['expenses:' + e.id] = 1; });
  customItems.forEach(function (c) { outbox['customItems:' + c.n.toLowerCase()] = 1; });
  EXTRA.forEach(function (k) { if (k !== 'feed') more[k].forEach(function (r) { outbox[k + ':' + r.id] = 1; }); });   /* the feed is the server's, never sent back */
}
function minDay() { return isoOf(new Date(bizDate().getTime() - KEEP_DAYS * 86400000)); }
/* Full history lives on the server. This device keeps recent days, anything unpaid,
   and anything the server has not confirmed yet. */
function prune() {
  var cut = minDay();
  orders = orders.filter(function (o) {
    var day = o.paidIso && o.paidIso > o.iso ? o.paidIso : o.iso;   /* an old tab paid today still counts in today's drawer */
    return !(day && day < cut && o.payment !== 'Unpaid' && !outbox['orders:' + o.id]);
  });
  expenses = expenses.filter(function (e) { return !(e.iso && e.iso < cut && !outbox['expenses:' + e.id]); });
  voided = voided.filter(function (v) { var d = v.voidedIso || v.iso; return !(d && d < cut && !outbox['voided:' + v.id]); });
  ['days', 'moves', 'stockmoves'].forEach(function (k) {
    /* stock counts are kept: the latest one is where every stock figure starts from */
    more[k] = more[k].filter(function (x) { return x.kind === 'count' || !(x.iso && x.iso < cut && !outbox[k + ':' + x.id]); });
  });
}
function checkPinVersions(pv) {
  if (!pv) return;
  var changed = false;
  Object.keys(auth.roles).forEach(function (r) {
    /* that role's PIN was changed somewhere: this device must confirm the new one online at its next unlock */
    if (pv[r] != null && (auth.roles[r].pv || 0) < pv[r] && auth.roles[r].ver) { auth.roles[r].ver = ''; changed = true; }
  });
  if (changed) saveAuth();
}
/* The till opened on the PIN kept in config.js because the server was out of reach.
   Sign in properly as soon as it answers. */
function serverSignIn(cb) {
  if (!sessionPin || !role) { cb(false); return; }
  var r = role, p = sessionPin;
  api('pos_login', { outlet: OUTLET, role: r, pin: p, device: { label: auth.device } }, function (err, res) {
    if (err) { cb(false); return; }
    if (res.ok) { remember(r, p, res); sessionPin = ''; cb(true); return; }
    if (res.error === 'bad_pin') { sessionPin = ''; if (role === r) logout('That PIN is no longer right. Enter the new one.'); }
    cb(false);
  });
}
/* One round trip: send what the server has not confirmed, take in what other devices did. */
function apiSync(cb, round) {
  if (!token()) {
    serverSignIn(function (ok) { if (ok) apiSync(cb); else { idleSyncText(); if (cb) cb(false, 'not signed in'); } });
    return;
  }
  if (syncing) { syncAgain = true; if (cb) cb(false, 'already syncing'); return; }
  syncing = true; setSync('busy', 'Syncing');
  var asRole = role, sent = {}, changes = { orders: [], voided: [], expenses: [], customItems: [] };
  Object.keys(outbox).slice(0, 200).forEach(function (k) {
    var rec = recFor(k);
    if (!rec) { delete outbox[k]; return; }
    var kind = k.slice(0, k.indexOf(':'));
    (changes[kind] = changes[kind] || []).push(rec); sent[k] = rec.u || 0;
  });
  var asSession = (rolesOn && me && asRole === 'barista') ? me.session : '';   /* whose sign-in this round goes out under */
  api('pos_sync', { token: token(), cursor: cursor, minDay: minDay(), seq: seq, changes: changes, staff: asSession }, function (err, res) {
    syncing = false;
    if (err) {
      setSync('off', waiting() ? waiting() + ' waiting, offline' : 'Offline, will retry');
      if (cb) cb(false, err.message); return;
    }
    if (!res.ok) {
      if (res.error === 'auth') {
        delete auth.roles[asRole]; saveAuth();
        if (role === asRole) logout('This device was signed out. Enter the PIN again.');
      } else setSync('off', 'Server problem, will retry');
      if (cb) cb(false, res.error); return;
    }
    var nobody = res.roles === true && res.as === 'none' && asRole === 'barista';
    if (typeof res.roles === 'boolean' && res.roles !== rolesOn) { rolesOn = res.roles; loadRoles(function () { applyMe(); if (rolesOn && !me && role === 'barista') askWhoAmI(true); }); }
    if (nobody) {
      /* nothing was written: everything stays queued until the person signs in again */
      /* only if the person on the tablet now is the one this round went out for: an answer to an older round must not sign out whoever signed in since */
      if (me && me.session === asSession) { meOut(false); applyMe(); if (role === 'barista') askWhoAmI(true, 'Your sign-in has ended. Sign in again to save your orders.'); }
      else if (me && role === 'barista') syncAgain = true;
    } else {
      Object.keys(sent).forEach(function (k) { var rec = recFor(k); if (!rec || (rec.u || 0) === sent[k]) delete outbox[k]; });
      if (Array.isArray(res.rejected) && res.rejected.length) handleRefused(res.rejected.filter(function (k) { return sent[k] != null; }));
    }
    var d = { orders: [], voided: [], expenses: [], customItems: [] };
    (res.rows || []).forEach(function (r) { if (Array.isArray(r) && typeof r[0] === 'string') (d[r[0]] = d[r[0]] || []).push(r[1]); });
    var grew = mergeRemote(d);
    seq = Math.max(seq, num(res.seq)); cursor = num(res.cursor);
    if (rereadAll) { rereadAll = false; cursor = 0; syncAgain = true; }
    if (res.reset || (res.epoch && epoch && res.epoch !== epoch)) {
      /* the database was restored or replaced: send it everything this device holds, and read it afresh */
      queueEverything(); cursor = 0;
    }
    if (res.epoch) epoch = txt(res.epoch, 64);
    if (res.now) {
      var off = num(res.now) - Date.now();
      skew = Math.abs(off) > 120000 ? off : 0;
      if (Math.abs(off) > 300000 && !skewTold) { skewTold = true; toast("This device's clock is wrong by " + Math.round(Math.abs(off) / 60000) + ' minutes. The till is using the right time.'); }
    }
    checkPinVersions(res.pv);
    prune(); dirty = waiting() > 0; save();
    if (grew) renderTiles();
    refreshAll();
    if ((res.more || waiting() || syncAgain) && (round || 0) < 60) { syncAgain = false; apiSync(cb, (round || 0) + 1); return; }
    var seeded = false;
    if (!more.accounts.length) { seedAccounts(); seeded = true; }
    if (!more.stock.length && !more.recipes.length) { seedStock(); seeded = true; }
    if (seeded && waiting()) { apiSync(cb, (round || 0) + 1); return; }
    setSync('ok', 'Saved ' + new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
    if (cb) cb(true);
  });
}
function applyDbMenu(items) {
  if (!items || !items.length) return false;
  var keep = MENU.filter(function (m) { return m.custom || m.shelf; });
  MENU = items.map(function (m) {
    return {
      c: m.c || m.category || 'Food',
      n: m.n || m.name || '',
      p: Number(m.p != null ? m.p : m.price) || 0,
      k: Number(m.k != null ? m.k : m.cost) || 0,
      i: m.i || m.imageKey || '',
      id: m.id || ''
    };
  }).filter(function (m) { return m.n; });
  keep.forEach(function (m) { MENU.push(m); });
  menuFromDb = true;
  return true;
}
function loadMenuFromServer(cb) {
  var url = '/api/v1/menu?outlet=' + encodeURIComponent(OUTLET);
  fetch(url, { method: 'GET', headers: { Accept: 'application/json' } })
    .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('menu ' + r.status)); })
    .then(function (data) {
      var items = (data && data.items) || [];
      if (applyDbMenu(items)) {
        try {
          if (role === 'barista') { renderCats(); renderTiles(); }
        } catch (e) {}
        if (cb) cb(true);
        return;
      }
      if (cb) cb(false);
    })
    .catch(function () { if (cb) cb(false); });
}
function startSync() {
  loadMenuFromServer();
  if (!BACKEND) { seedAccounts(); seedStock(); cloudLoad(); return; }
  if (!migrated) { queueEverything(); migrated = true; save(); }
  apiSync();
}
function runSync(cb) { if (BACKEND) apiSync(cb); else cloudLoad(cb); }
function queueSync() {
  if (!BACKEND && !SYNC_URL) { idleSyncText(); return; }
  setSync('off', BACKEND ? waiting() + ' waiting to upload' : 'Waiting to sync');
  clearTimeout(syncTimer);
  syncTimer = setTimeout(function () { runSync(); }, BACKEND ? 400 : 1200);
}
function syncNow() {
  if (!BACKEND && !SYNC_URL) { toast(IS_PREVIEW ? 'Preview mode does not sync' : 'No server is set in config.js'); return; }
  runSync(function (ok) { toast(ok ? 'Synced' : 'Could not reach the server'); });
}
function testSync() {
  var out = $('syncDiag');
  out.classList.remove('hidden'); out.innerHTML = 'Testing\u2026';
  if (!BACKEND && !SYNC_URL) { out.innerHTML = '<span class="bad">' + (IS_PREVIEW ? 'Preview mode: sync is switched off on this computer.' : 'No server is set in config.js.') + '</span>'; return; }
  var lines;
  function show() { out.innerHTML = lines.join('<br>'); }
  if (BACKEND) {
    lines = ['This device holds ' + orders.length + ' orders, ' + waiting() + ' waiting to upload'];
    api('pos_ping', null, function (err, res) {
      if (err) { lines.push('<span class="bad">SERVER: not reachable (' + esc(err.message) + ')</span>'); show(); return; }
      lines.push('SERVER: reachable' + (res.ready ? '' : ', but its PINs are not set yet')); show();
      apiSync(function (ok, why) {
        lines.push(ok ? '<span class="good">SYNC: working. Everything on this device is saved on the server.</span>'
                      : '<span class="bad">SYNC: failed' + (why ? ' (' + esc(why) + ')' : '') + '</span>');
        show();
      });
    });
    return;
  }
  lines = ['This device has ' + orders.length + ' orders'];
  jsonpGet(function (d) {
    lines.push('READ: ok, Drive has ' + ((d && d.orders) || []).length + ' orders');
    cloudSave(function (msg) {
      lines.push('WRITE: ' + esc(msg)); show();
      setTimeout(function () {
        jsonpGet(function (d2) {
          var after = ((d2 && d2.orders) || []).length;
          lines.push('VERIFY: Drive now has ' + after + ' orders');
          lines.push(after >= orders.length ? '<span class="good">Sync is working.</span>' : '<span class="bad">The write did not stick. Redeploy the Apps Script as a new version.</span>');
          show();
        }, function (e) { lines.push('VERIFY failed: ' + esc(e)); show(); });
      }, 2500);
    });
  }, function (e) {
    lines.push('<span class="bad">READ FAILED: ' + esc(e) + '</span>');
    lines.push('Check the Apps Script is deployed and the link in config.js is right.');
    show();
  });
}

/* ====== SMALL UI HELPERS ====== */
function toast(m) {
  var t = $('toast'); t.textContent = m; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2200);
}
function animateNum(el, to) {
  to = Math.round(to || 0);
  var from = el._v == null ? 0 : el._v;
  el._v = to;
  cancelAnimationFrame(el._raf || 0); clearTimeout(el._end);
  if (reducedMotion() || from === to) { el.textContent = to.toLocaleString(); return; }
  var start = null, dur = 450;
  /* the count-up is decoration: always land on the real figure, even in a background tab */
  el._end = setTimeout(function () { cancelAnimationFrame(el._raf || 0); el.textContent = to.toLocaleString(); }, dur + 150);
  function step(ts) {
    if (start === null) start = ts;
    var k = Math.min(1, (ts - start) / dur); k = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(from + (to - from) * k).toLocaleString();
    if (k < 1) el._raf = requestAnimationFrame(step);
  }
  el._raf = requestAnimationFrame(step);
}
function setNum(id, v) { animateNum($(id), v); }
function bump(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function setSeg(id, v) {
  [].forEach.call($(id).querySelectorAll('button'), function (b) {
    var on = (b.getAttribute('data-v') || b.getAttribute('data-role')) === String(v);
    b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}
function measureTop() {
  var bar = document.querySelector('#baristaScreen .top');
  if (bar && bar.offsetHeight) document.documentElement.style.setProperty('--top-h', bar.offsetHeight + 'px');
}
var lastFocus = null;
function openModal(html, cardClass) {
  lastFocus = document.activeElement;
  $('modalCard').classList.remove('chg-wide', 'disc-modal', 'paid-modal', 'remake-modal');
  if (cardClass) $('modalCard').classList.add(cardClass);
  $('modalCard').innerHTML = html;
  $('modal').classList.remove('hidden');
  document.body.classList.add('modal-open');
  var f = $('modalCard').querySelector('input,button');
  if (f) f.focus();
}
function closeModal() {
  basketPanel = false;
  if (chg) { chg.pendingCancel = null; chg.cancelPick = ''; }
  paidAsk = null;
  $('modal').classList.add('hidden'); $('modalCard').innerHTML = '';
  $('modalCard').classList.remove('chg-wide', 'disc-modal', 'paid-modal', 'remake-modal');
  document.body.classList.remove('modal-open');
  if (lastFocus && lastFocus.focus) lastFocus.focus();
}
function showDone(no, text) {
  var d = $('done');
  $('doneNo').textContent = '#' + pad(no); $('doneT').textContent = text;
  d.classList.remove('hidden', 'out');
  clearTimeout(showDone._a); clearTimeout(showDone._b);
  showDone._a = setTimeout(function () { d.classList.add('out'); }, 1100);
  showDone._b = setTimeout(function () { d.classList.add('hidden'); }, 1400);
}

/* ====== LOGIN ====== */
function sha256(ascii) {
  function rr(v, a) { return (v >>> a) | (v << (32 - a)); }
  var mp = Math.pow, maxWord = mp(2, 32), i, j, result = '', words = [], bitLen = ascii.length * 8;
  var hash = sha256.h = sha256.h || [], k = sha256.k = sha256.k || [], primes = k.length, comp = {};
  for (var c = 2; primes < 64; c++) {
    if (!comp[c]) {
      for (i = 0; i < 313; i += c) comp[i] = c;
      hash[primes] = (mp(c, .5) * maxWord) | 0;
      k[primes++] = (mp(c, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += '\x80';
  while (ascii.length % 64 - 56) ascii += '\x00';
  for (i = 0; i < ascii.length; i++) {
    j = ascii.charCodeAt(i);
    if (j >> 8) return '';
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words.length] = ((bitLen / maxWord) | 0);
  words[words.length] = (bitLen);
  for (j = 0; j < words.length;) {
    var w = words.slice(j, j += 16), old = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      var w15 = w[i - 15], w2 = w[i - 2], a = hash[0], e = hash[4];
      var t1 = hash[7] + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & hash[5]) ^ ((~e) & hash[6])) + k[i] +
        (w[i] = (i < 16) ? w[i] : (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0);
      var t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(t1 + t2) | 0].concat(hash);
      hash[4] = (hash[4] + t1) | 0;
    }
    for (i = 0; i < 8; i++) hash[i] = (hash[i] + old[i]) | 0;
  }
  for (i = 0; i < 8; i++) for (j = 3; j + 1; j--) { var b = (hash[i] >> (j * 8)) & 255; result += ((b < 16) ? 0 : '') + b.toString(16); }
  return result;
}
function pinHash(r, p) { return sha256('whipped-pos|' + r + '|' + p); }
function lockLeft() {
  var until = 0;
  try { until = +localStorage.getItem(LOCK_KEY) || 0; } catch (e) {}
  return Math.max(0, Math.ceil((until - Date.now()) / 1000));
}
function drawDots(bad) {
  var h = '';
  for (var i = 0; i < PIN_DIGITS; i++) h += '<i' + (i < pin.length ? ' class="on"' : '') + '></i>';
  var d = $('pinDots'); d.innerHTML = h;
  d.setAttribute('aria-label', 'PIN, ' + pin.length + ' of ' + PIN_DIGITS + ' digits entered');
  if (bad) bump(d, 'bad');
}
function pinMsg(t, bad) { var m = $('pinMsg'); m.textContent = t; m.classList.toggle('bad', !!bad); }
function tickLock() {
  clearInterval(lockTimer);
  function show() {
    var s = lockLeft();
    if (s > 0) pinMsg('Too many wrong tries. Wait ' + s + ' seconds.', true);
    else { clearInterval(lockTimer); pinMsg('Enter your PIN'); }
  }
  show(); lockTimer = setInterval(show, 1000);
}
function pressKey(k) {
  if (lockLeft() > 0) { bump($('pinDots'), 'bad'); return; }
  if (k === 'back') pin = pin.slice(0, -1);
  else if (pin.length < PIN_DIGITS) pin += k;
  if (pin.length && !$('pinMsg').classList.contains('bad')) pinMsg('Enter your PIN');
  drawDots();
  if (pin.length === PIN_DIGITS) setTimeout(tryLogin, 140);
}
function configPinOk(r, p) {
  var h = r === 'owner' ? CFG.PIN_OWNER_HASH : CFG.PIN_BARISTA_HASH;
  return !!h && pinHash(r, p) === h;
}
function loginWrong() {
  fails++;
  drawDots(true);
  if (fails >= 5) {
    fails = 0;
    try { localStorage.setItem(LOCK_KEY, String(Date.now() + 30000)); } catch (e) {}
    tickLock();
  } else pinMsg('Wrong PIN for ' + (loginRole === 'owner' ? 'Owner' : BRAND.staff) + '. Try again.', true);
}
function loginOk(r) {
  fails = 0; drawDots(); pinMsg('Enter your PIN');
  login(r);
}
function waitText(sec) { sec = num(sec) || 60; return sec < 100 ? Math.ceil(sec) + ' seconds' : Math.ceil(sec / 60) + ' minutes'; }
function tryLogin() {
  if (pin.length !== PIN_DIGITS || checking) return;
  var p = pin, r = loginRole;
  pin = '';
  if (!BACKEND) { if (configPinOk(r, p)) loginOk(r); else loginWrong(); return; }
  var known = auth.roles[r];
  if (known && known.ver && known.ver === verifier(r, p)) { loginOk(r); return; }
  /* first sign-in on this device, a changed PIN, or a wrong PIN: the server decides */
  checking = true; drawDots(); pinMsg('Checking');
  api('pos_login', { outlet: OUTLET, role: r, pin: p, token: known ? known.token : '', device: { label: auth.device } }, function (err, res) {
    checking = false;
    if (err) {
      if (known && known.ver) loginWrong();
      else if (configPinOk(r, p)) {
        sessionPin = p; loginOk(r);
        toast('Server out of reach. Orders stay on this device and upload later.');
      } else { drawDots(true); pinMsg('Could not reach the server. Check the internet and try again.', true); }
      return;
    }
    if (res.ok) { remember(r, p, res); loginOk(r); return; }
    if (res.error === 'locked') { drawDots(true); pinMsg('Too many wrong tries. Try again in ' + waitText(res.wait) + '.', true); return; }
    if (res.error === 'not_set_up') { drawDots(true); pinMsg('PINs are not set on the server yet.', true); return; }
    loginWrong();
  });
}
function renderLogin() {
  var h = new Date().getHours();
  $('greet').textContent = h < 4 ? 'Still open' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  $('loginDay').textContent = bizLabel();
  $('verLbl').textContent = BRAND.app + ' ' + (CFG.VERSION || '');
  $('verLblO').textContent = BRAND.app + ' ' + (CFG.VERSION || '');
  drawDots();
  if (lockLeft() > 0) tickLock();
}
function login(r) {
  role = r; lastActive = Date.now();
  if (CAMERAS) { basketLast = 0; setTimeout(function () { pollBaskets(true); }, 0); }
  $('loginScreen').classList.add('hidden');
  if (r === 'barista') {
    $('baristaScreen').classList.remove('hidden');
    showTab('sell');
    renderCats(); renderTiles(); renderCart(); refreshAll();
    measureTop();
    setWho(who);
    applyMe(); if (rolesOn && !me) askWhoAmI(true);
    loadRoles(function () { applyMe(); if (rolesOn) { if (!me) askWhoAmI(true); else showTab(me.role === 'waiter' ? 'sell' : 'orders'); } else if (STAFF.length && !who) askWho(true); });
  } else {
    $('ownerScreen').classList.remove('hidden');
    document.body.removeAttribute('data-me');
    showOTab('today'); refreshAll();
    loadRoles(function () { renderStaff(); if (rolesOn && menuPublished !== txt(CFG.VERSION, 40)) publishMenu(true); });
  }
  idleSyncText();
  window.scrollTo(0, 0);
  startSync();
}
function logout(msg) {
  if (rolesOn && me) meOut(true);
  role = null;
  if (CAMERAS) { basketPanel = false; basketData = { open: [], left: [] }; if ($('basketOwnerBack')) $('basketOwnerBack').classList.add('hidden'); renderBaskets(); }
  pin = ''; sessionPin = ''; setWho(''); ui.waiter = '';
  closeModal(); closeSheet();
  $('loginScreen').classList.remove('hidden');
  $('baristaScreen').classList.add('hidden');
  $('ownerScreen').classList.add('hidden');
  renderLogin();
  if (msg) toast(msg);
}

/* ====== SELL: MENU ====== */
function categories() {
  var seen = {}, out = [];
  MENU.forEach(function (m) { if (!seen[m.c]) { seen[m.c] = 1; out.push(m.c); } });
  return out;
}
function renderCats() {
  var h = '<button type="button" data-cat="All"' + (ui.cat === 'All' ? ' class="on"' : '') + '>All</button>';
  categories().forEach(function (c) {
    h += '<button type="button" data-cat="' + esc(c) + '"' + (ui.cat === c ? ' class="on"' : '') + '>' + esc(c) + '</button>';
  });
  $('cats').innerHTML = h;
}
/* ---- 86 list (11 Oct 2026): 'outs' records mark a menu item out for one trading day ---- */
function outKey(m) { return m.c + '|' + m.n; }
function outsToday() { var iso = isoNow(); return more.outs.filter(function (x) { return !x.deleted && x.iso === iso; }); }
function isOut(m) { var k = outKey(m), L = outsToday(); for (var i = 0; i < L.length; i++) if (L[i].key === k) return true; return false; }
function setOut(m, on) {
  var k = outKey(m), iso = isoNow(), cur = null;
  more.outs.forEach(function (x) { if (x.key === k && x.iso === iso && !x.deleted) cur = x; });
  if (on && !cur) { cur = { id: newId(), key: k, iso: iso, by: whoName(), u: 0 }; more.outs.push(cur); stamp(cur); commit('outs', cur.id); }
  if (!on && cur) { cur.deleted = true; stamp(cur); commit('outs', cur.id); }
}
function askOuts() {
  var cats = [], byCat = {};
  MENU.forEach(function (m) { if (!byCat[m.c]) { byCat[m.c] = []; cats.push(m.c); } byCat[m.c].push(m); });
  openModal('<h2 id="modalTitle">Out of stock today</h2><p class="deal-note">Tap what has run out. It greys out on every till now and comes back tomorrow on its own.</p>' +
    cats.map(function (c) {
      return '<p class="deal-tier"><b>' + esc(c) + '</b></p><div class="chips tight outs-pick">' + byCat[c].map(function (m) {
        return '<button type="button" data-chip="' + esc(outKey(m)) + '"' + (isOut(m) ? ' class="on"' : '') + '>' + esc(m.n) + '</button>';
      }).join('') + '</div>';
    }).join('') +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Cancel</button>' +
    '<button type="button" class="btn primary" data-act="outs-apply">Save</button></div>');
}
function applyOuts() {
  var on = {}; [].forEach.call(document.querySelectorAll('.outs-pick button.on'), function (b) { on[b.getAttribute('data-chip')] = 1; });
  MENU.forEach(function (m) { setOut(m, !!on[outKey(m)]); });
  closeModal(); renderOuts(); renderTiles(); toast(Object.keys(on).length ? Object.keys(on).length + ' out today' : 'Nothing out today');
}
function renderOuts() {
  var L = outsToday(), names = L.map(function (x) { return x.key.split('|')[1]; }).sort();
  var text = names.length ? 'Out today: ' + names.join(', ') + '.' : 'Nothing is out today.';
  ['outsNoteB', 'outsNoteO'].forEach(function (id) { if ($(id)) $(id).textContent = text; });
}
function cartQty(m) {
  for (var i = 0; i < cart.length; i++) if (cart[i].n === m.n && cart[i].c === m.c) return cart[i].q;
  return 0;
}
function renderTiles() {
  var q = ui.q.trim().toLowerCase(), h = '', shown = 0;
  MENU.forEach(function (m, i) {
    if (q ? (m.n.toLowerCase().indexOf(q) < 0 && m.c.toLowerCase().indexOf(q) < 0) : (ui.cat !== 'All' && m.c !== ui.cat)) return;
    shown++;
    var n = cartQty(m);
    var out = isOut(m);
    h += '<button type="button" class="tile' + (out ? ' out' : '') + '" data-act="add" data-i="' + i + '" aria-label="' + (out ? 'Out today: ' : 'Add ') + esc(label(m)) + ', ' + m.p + ' rupees">' +
      '<span class="tile-ph"><img src="/img/' + esc(m.i || 'food') + '.jpg" alt="" loading="lazy" width="320" height="320">' + (out ? '<i class="out-tag">Out today</i>' : '') +
      '<b class="qty' + (n ? '' : ' hidden') + '">' + n + '</b></span>' +
      '<span class="tile-name">' + esc(m.n) + '</span>' +
      '<span class="tile-meta"><span class="tile-cat">' + esc(m.c) + '</span><span class="tile-price">' + n0(m.p) + '</span></span></button>';
  });
  if (!shown && q) h += '<div class="empty"><span class="scribble">nothing called that</span>Check the spelling, or add it as something not on the menu.</div>';
  h += '<button type="button" class="tile custom" data-act="custom">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v9M7.5 12h9"/></svg>' +
    'Something not on the menu</button>';
  $('tiles').innerHTML = h;
}
function updateBadges() {
  [].forEach.call($('tiles').querySelectorAll('.tile[data-i]'), function (t) {
    var n = cartQty(MENU[+t.getAttribute('data-i')]), b = t.querySelector('.qty');
    b.textContent = n; b.classList.toggle('hidden', !n);
  });
}

/* ====== SELL: ORDER ====== */
function addToCart(i, tile) {
  var m = MENU[i]; if (!m) return;
  if (isOut(m)) { toast(m.n + ' is out today'); return; }
  var kk = (!matchaLocal && m.kPrem) ? m.kPrem : m.k, found = null;
  cart.forEach(function (c) { if (c.n === m.n && c.c === m.c && !c.note && !hasMods(c) && !c.free) found = c; });   /* a noted or added-to line is its own line */
  if (found) found.q++; else cart.push(m.v ? { n: m.n, c: m.c, p: m.p, k: kk, q: 1, v: m.v, vi: m.vi } : { n: m.n, c: m.c, p: m.p, k: kk, q: 1 });
  renderCart(true);
  bump(tile, 'bump'); bump($('cartBar'), 'bump');
}
function cartTotals(payment) {
  var sub = 0, count = 0;
  cart.forEach(function (c) { sub += c.p * c.q; count += c.q; });
  var pct = Math.min(100, Math.max(0, parseFloat(ui.disc) || 0));
  var disc = Math.round(sub * pct / 100);
  var paying = payment ? payment !== 'Unpaid' : (ui.channel === 'Counter' || ui.payNow) && !isRole('waiter');
  var tax = TAX.enabled && paying ? TAX.compute(cart, disc, payment || ui.payment) : null;
  return { sub: sub, pct: pct, disc: disc, total: tax ? tax.total : Math.max(0, sub - disc), count: count, tax: tax };
}
function renderCart(tick) {
  var h = '';
  cart.forEach(function (c, i) {
    h += '<div class="line"><span class="line-sn num" aria-hidden="true">' + (i + 1) + '</span><div class="line-info"><div class="line-name">' + esc(label(c)) + (c.cameraCheck ? ' <button type="button" class="btn sm secondary" data-act="basket-check" data-i="' + i + '">check</button>' : '') + '</div>' +
      (c.q > 1 ? '<div class="line-each">' + c.q + ' at ' + n0(c.p) + '</div>' : '') +
      (hasMods(c) ? c.mods.map(function (m) { return '<div class="line-mod">+ ' + esc(m.n) + ' <span>' + n0(m.p) + '</span></div>'; }).join('') : '') +
      (c.note ? '<div class="line-note">' + esc(c.note) + '</div>' : '') +
      '<button type="button" class="line-note-btn" data-act="line-note" data-i="' + i + '">' + (c.note || hasMods(c) ? 'Change' : addonsFor(c).length ? 'Add-ons or a note' : 'Add a note') + '</button></div>' +
      '<div class="stepper"><button type="button" data-act="dec" data-i="' + i + '" aria-label="One less ' + esc(label(c)) + '">\u2212</button>' +
      '<b>' + c.q + '</b><button type="button" data-act="inc" data-i="' + i + '" aria-label="One more ' + esc(label(c)) + '">+</button></div>' +
      '<div class="line-total">' + n0(c.p * c.q) + '</div></div>';
  });
  $('cartList').innerHTML = h || '<div class="cart-empty">' +
    (CFG.EMPTY_ART ? '<img class="empty-art" src="' + esc(CFG.EMPTY_ART) + '" alt="" width="160" height="160">' :
    '<svg viewBox="0 0 44 60" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round" aria-hidden="true"><path d="M9 18h26l-1 4H10z"/><path d="M11 22h22l-4 33a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8z"/><path d="M27 18L33 4"/></svg>') +
    '<div class="scribble">' + esc(BRAND.start) + '</div></div>';
  var t = cartTotals();
  $('cartSub').textContent = n0(t.sub);
  $('subRow').classList.toggle('hidden', !t.disc && !(t.tax && TAX.showLine));
  $('discRow').classList.toggle('hidden', !t.disc);
  $('discLbl').textContent = (ui.deal ? ui.deal.bank + ' card deal ' : 'Discount ') + t.pct + '%';
  $('cartDisc').textContent = '−' + n0(t.disc);
  if ($('taxRow')) {
    $('taxRow').classList.toggle('hidden', !(t.tax && TAX.showLine));
    $('taxLbl').textContent = 'Tax ' + (t.tax ? t.tax.rate : 0) + '%';
    $('cartTax').textContent = Number(t.tax ? t.tax.tax : 0).toFixed(2);
  }
  $('cartTotal').textContent = n0(t.total);
  if (tick) bump($('cartTotal'), 'tick');
  var ca = channelAccount();
  $('chargeLbl').textContent = ca ? 'Put on the ' + ca.name + ' account' : 'Charge ' + money(t.total);
  $('chargeBtn').querySelector('small').textContent = ca ? money(t.total) + ', prints an order slip' : 'prints the receipt';
  $('paySeg').classList.toggle('hidden', !!ca);
  $('payNowBtn').classList.toggle('hidden', !ca);
  if ($('laterBtn')) { $('laterBtn').classList.toggle('hidden', !!ca); $('laterBtn').disabled = !cart.length; }
  $('chargeBtn').disabled = !cart.length;
  $('clearCart').classList.toggle('hidden', !cart.length);
  $('orderNoLbl').textContent = '#' + pad(seq + 1);
  $('cartBar').classList.toggle('hidden', !cart.length);
  $('cartBarCount').textContent = t.count + (t.count === 1 ? ' item' : ' items');
  $('cartBarTotal').textContent = money(t.total);
  updateBadges();
}
function setDiscount(v) {
  ui.disc = Math.min(100, Math.max(0, parseFloat(v) || 0));
  var b = $('discBtn');
  b.textContent = ui.deal ? ui.deal.bank + ' ' + ui.disc + '% off' : (ui.disc ? ui.disc + '% off' : 'Discount');
  b.classList.toggle('active', ui.disc > 0);
  renderCart();
}
/* ---- Priced add-ons on a line (11 Oct 2026): the menu's own add-on items, offered on the categories in CFG.ADDON_FOR ---- */
function hasMods(c) { return !!(c.mods && c.mods.length); }
function addonsFor(c) {
  if ((CFG.ADDON_FOR || []).indexOf(c.c) < 0) return [];
  return MENU.filter(function (m) { return m.c === (CFG.ADDON_CAT || 'Add-ons'); });
}
function setLineMods(i, names) {
  var c = cart[i]; if (!c) return;
  if (c.bp == null) { c.bp = c.p; c.bk = c.k; }   /* the plain price and cost, kept so add-ons can change */
  var mods = [];
  addonsFor(c).forEach(function (m) { if (names.indexOf(m.n) >= 0 && !isOut(m)) mods.push({ n: m.n, p: m.p, k: m.k }); });
  var p = c.bp, k = c.bk; mods.forEach(function (m) { p += m.p; k += m.k; });
  c.p = p; c.k = k;
  if (mods.length) c.mods = mods; else { delete c.mods; delete c.bp; delete c.bk; }
}
function modsText(it) { return hasMods(it) ? it.mods.map(function (m) { return ' + ' + m.n; }).join('') : ''; }
function modsFromModal() { return [].map.call(document.querySelectorAll('#addonChips button.on'), function (b) { return b.getAttribute('data-chip'); }); }
function setLineNote(i, text) {
  var c = cart[i]; if (!c) return;
  text = txt(text, 80).trim();
  if (text) c.note = text; else delete c.note;
  renderCart();
}
function openLineNote(i) {
  var c = cart[i]; if (!c) return;
  var have = (c.note || '').split(', ').filter(Boolean), adds = addonsFor(c), on = (c.mods || []).map(function (m) { return m.n; });
  openModal('<h2 id="modalTitle">' + (adds.length ? 'Add-ons and note' : 'Note for the kitchen') + '</h2><p class="deal-tier"><b>' + esc(label(c)) + '</b>' + (c.q > 1 ? ', all ' + c.q : '') + '</p>' +
    (adds.length ? '<p class="deal-tier"><b>Add-ons</b>, priced</p><div class="chips tight addons" id="addonChips">' + adds.map(function (m) {
      var gone = isOut(m);
      return '<button type="button" data-chip="' + esc(m.n) + '"' + (gone ? ' disabled' : on.indexOf(m.n) >= 0 ? ' class="on"' : '') + '>' + esc(m.n) + ' <small>' + (gone ? 'out today' : '+' + n0(m.p)) + '</small></button>';
    }).join('') + '</div><p class="deal-tier"><b>Note</b>, free</p>' : '') +
    '<div class="chips tight" id="noteChips">' + NOTE_CHIPS.map(function (n) {
      return '<button type="button" data-chip="' + esc(n) + '"' + (have.indexOf(n) >= 0 ? ' class="on"' : '') + '>' + esc(n) + '</button>';
    }).join('') + '</div>' +
    '<label for="noteText">Or type it</label>' +
    '<div class="split"><input type="text" id="noteText" maxlength="80" placeholder="e.g. no onions, sauce on the side" value="' + esc(have.filter(function (n) { return NOTE_CHIPS.indexOf(n) < 0; }).join(', ')) + '">' +
    '<button type="button" class="btn primary" data-act="apply-note" data-i="' + i + '">Apply</button></div>' +
    '<p class="deal-note">' + (adds.length ? 'Add-ons go on the price and the receipt; the note is free. Both print on the kitchen slip. ' : 'The note prints on the kitchen slip and shows on the kitchen screen. ') + 'Add the item again for a plain one.</p>' +
    '<button type="button" class="btn quiet" data-act="clear-note" data-i="' + i + '">' + (adds.length ? 'Plain, no add-ons or note' : 'No note') + '</button>');
}
function noteFromModal() {
  var picked = [].map.call(document.querySelectorAll('#noteChips button.on'), function (b) { return b.getAttribute('data-chip'); });
  var typed = ($('noteText') ? $('noteText').value : '').trim();
  if (typed) picked.push(typed);
  return picked.join(', ');
}
function livePeople(roleWord) { return more.people.filter(function (x) { return !x.deleted && (!roleWord || x.role === roleWord); }).sort(function (a, b) { return a.name.localeCompare(b.name); }); }
function personByName(n) { for (var i = 0; i < more.people.length; i++) if (!more.people[i].deleted && more.people[i].name === n) return more.people[i]; return null; }
function personById(id) { for (var i = 0; i < more.people.length; i++) if (more.people[i].id === id && !more.people[i].deleted) return more.people[i]; return null; }
function initials(n) { return String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w.charAt(0).toUpperCase(); }).join('') || '?'; }
function faceHtml(n, big) {
  var p = personByName(n), cls = 'face' + (big ? ' big' : '');
  return p && p.photo ? '<img class="' + cls + '" src="' + p.photo + '" alt="">' : '<span class="' + cls + ' ini">' + esc(initials(n)) + '</span>';
}
function setWaiter(n) {
  ui.waiter = txt(n, 30).trim();
  if (ui.waiter) rememberWaiter(ui.waiter);
  var b = $('waiterBtn'); if (b) { b.innerHTML = ui.waiter ? faceHtml(ui.waiter) + esc(ui.waiter) : 'Waiter'; b.classList.toggle('active', !!ui.waiter); }
}
function openWaiter() {
  var names = livePeople('waiter').map(function (p) { return p.name; });
  WAITERS.concat(recentWaiters()).forEach(function (n) { if (names.indexOf(n) < 0) names.push(n); });
  openModal('<h2 id="modalTitle">Who took this order?</h2>' +
    (names.length ? '<div class="chips faces" role="group" aria-labelledby="modalTitle">' + names.map(function (n) {
      return '<button type="button" data-waiter="' + esc(n) + '"' + (ui.waiter === n ? ' class="on"' : '') + '>' + faceHtml(n) + esc(n) + '</button>';
    }).join('') + '</div>' : '<p class="deal-note">No names yet. Type the first one; it is remembered on this device. The owner can add waiters with photos under Settings.</p>') +
    '<label for="waiterText">Or type a name</label>' +
    '<div class="split"><input type="text" id="waiterText" maxlength="30" placeholder="Waiter\'s name" autocomplete="off">' +
    '<button type="button" class="btn primary" data-act="apply-waiter">Apply</button></div>' +
    '<p class="deal-note">The name goes on the order, the kitchen slip and the owner\'s day. It stays chosen for the next order until changed.</p>' +
    '<button type="button" class="btn quiet" data-act="clear-waiter">No waiter</button>');
}
/* ---- Waiters with photos (11 Oct 2026): kept in the books as the 'people' kind, edited under Owner > Settings ---- */
function renderPeople() {
  var box = $('peopleList'); if (!box) return;
  var ws = livePeople('waiter');
  box.innerHTML = (ws.length ? ws.map(function (p) {
    return '<div class="row person"><div class="row-main"><h3>' + faceHtml(p.name) + esc(p.name) + '</h3><p>' + (p.photo ? 'Photo on file' : 'No photo yet') + '</p></div>' +
      '<div class="row-side"><button type="button" class="btn sm secondary" data-act="person-edit" data-id="' + p.id + '">' + (p.photo ? 'Change' : 'Add photo') + '</button>' +
      '<button type="button" class="btn sm quiet" data-act="person-del" data-id="' + p.id + '">Remove</button></div></div>';
  }).join('') : '<p class="hint">No waiters yet. Add one with a photo and it shows as a face to tap on every order.</p>');
}
var personPhoto = '';   /* the squared photo waiting in the open sheet */
function askPerson(id) {
  var p = personById(id) || { id: 0, name: '', photo: '' }; personPhoto = '';
  openModal('<h2 id="modalTitle">' + (p.id ? 'Edit ' + esc(p.name) : 'Add a waiter') + '</h2>' +
    '<label for="peName">Name</label><input type="text" id="peName" maxlength="40" value="' + esc(p.name) + '" placeholder="As the team says it" autocomplete="off">' +
    '<span class="field-l">Photo</span><div class="photo-pick"><span id="pePreview">' + faceHtml(p.name, true) + '</span>' +
    '<label class="btn secondary" for="peFile">Take or choose a photo<input type="file" id="peFile" accept="image/*" capture="user" class="hidden"></label></div>' +
    '<p class="hint">Face in the middle, good light. It is squared to 96 pixels and kept in the books behind the sign-in, not on the public site.</p>' +
    '<div class="split"><button type="button" class="btn quiet" data-act="close-modal">Cancel</button>' +
    '<button type="button" class="btn primary" data-act="person-save" data-id="' + p.id + '">Save</button></div>');
  var f = $('peFile'); if (f) f.onchange = function () { if (f.files && f.files[0]) shrinkPhoto(f.files[0], function (url) { personPhoto = url; $('pePreview').innerHTML = '<img class="face big" src="' + url + '" alt="">'; }); };
}
function shrinkPhoto(file, done) {
  /* a square 96 px JPEG under 12,000 characters as a data URL, so it fits one record in the books */
  var img = new Image(), url = URL.createObjectURL(file);
  img.onload = function () {
    URL.revokeObjectURL(url);
    var side = Math.min(img.naturalWidth, img.naturalHeight), sx = (img.naturalWidth - side) / 2, sy = (img.naturalHeight - side) / 2;
    var c = document.createElement('canvas'); c.width = 96; c.height = 96; c.getContext('2d').drawImage(img, sx, sy, side, side, 0, 0, 96, 96);
    var q = 0.8, out = c.toDataURL('image/jpeg', q);
    while (out.length > 12000 && q > 0.3) { q -= 0.1; out = c.toDataURL('image/jpeg', q); }
    if (out.length <= 12000) done(out); else toast('That picture is too busy to shrink; try a plainer one');
  };
  img.onerror = function () { URL.revokeObjectURL(url); toast('That picture could not be read'); };
  img.src = url;
}
function savePerson(id) {
  var name = txt($('peName').value, 40).trim(); if (!name) { toast('Give the waiter a name'); return; }
  var dup = personByName(name); if (dup && dup.id !== id) { toast(name + ' is already on the list'); return; }
  var p = personById(id);
  if (!p) { p = { id: newId(), role: 'waiter', u: 0 }; more.people.push(p); }
  p.name = name; if (personPhoto) p.photo = personPhoto;
  stamp(p); commit('people', p.id); closeModal(); renderPeople(); toast(name + ' saved');
}
function removePerson(id) {
  var p = personById(id); if (!p) return;
  p.deleted = true; delete p.photo; stamp(p); commit('people', p.id); renderPeople(); toast(p.name + ' removed');
}

/* ---- Card pictures for the bank deals (11 Oct 2026): drawn here from the card's name; no bank artwork is copied ---- */
function cardSvg(name) {
  var n = String(name), elite = /World Elite/i.test(n), plat = /Platinum/i.test(n), islamic = /Islamic/i.test(n), biz = /Business/i.test(n);
  var bg = elite ? '#15161a' : islamic ? '#1f6b3a' : biz ? '#1d3b6e' : plat ? '#b9bcc4' : '#3b5f8a', fg = plat && !elite ? '#1e1e1e' : '#ffffff';
  var kind = /Credit/i.test(n) ? 'CREDIT' : 'DEBIT', short = n.replace(/,?\s*HBL Pay$/i, '').replace(/^MasterCard |^VISA /i, '').slice(0, 24);
  var mark = /MasterCard/i.test(n) ? '<circle cx="64" cy="40" r="6" fill="#eb001b"/><circle cx="72" cy="40" r="6" fill="#f79e1b" opacity=".92"/>'
    : /Visa/i.test(n) ? '<text x="78" y="44" font-size="9" font-style="italic" font-weight="800" fill="' + fg + '" text-anchor="end" font-family="sans-serif">VISA</text>' : '';
  var pay = /HBL Pay/i.test(n) ? '<rect x="66" y="6" width="9" height="15" rx="2" fill="none" stroke="' + fg + '" stroke-width="1.4"/><circle cx="70.5" cy="18" r="1" fill="' + fg + '"/>' : '';
  return '<svg class="cardpic" viewBox="0 0 84 52" aria-hidden="true"><rect x="1" y="1" width="82" height="50" rx="6" fill="' + bg + '"/>' +
    '<rect x="8" y="17" width="14" height="11" rx="2" fill="#d9b25c"/><path d="M8 22.5h14M15 17v11" stroke="' + bg + '" stroke-width="1"/>' +
    '<text x="8" y="12" font-size="6.5" font-weight="800" fill="' + fg + '" font-family="sans-serif">HBL</text>' + pay +
    '<text x="8" y="40" font-size="5" fill="' + fg + '" opacity=".85" font-family="sans-serif" letter-spacing=".6">' + kind + '</text>' +
    '<text x="8" y="47" font-size="4.6" fill="' + fg + '" opacity=".75" font-family="sans-serif">' + esc(short) + '</text>' + mark + '</svg>';
}
function cardLabel(c) {
  var s = String(c), pay = /HBL Pay/i.test(s);
  s = s.replace(/,?\s*HBL Pay$/i, '').replace(/^MasterCard\s+/i, 'MC ').replace(/^VISA\s+/i, 'Visa ');
  return s + (pay ? ' · Pay' : '');
}
function dealHtml() {
  if (!BANK_DEALS.length) return '';
  return '<div class="deal-sheet">' + BANK_DEALS.map(function (d, di) {
    return '<section class="deal-band">' +
      '<div class="deal-band-h"><span class="deal-pct num">' + d.pct + '%</span><span class="deal-band-t"><b>' + esc(d.bank) + '</b> off when paid with</span></div>' +
      '<div class="chips cards" role="group" aria-label="' + esc(d.bank) + ' ' + d.pct + '% cards">' + d.cards.map(function (c, ci) {
        var on = ui.deal && ui.deal.bank === d.bank && ui.deal.card === c;
        return '<button type="button" data-deal="' + di + ':' + ci + '"' + (on ? ' class="on"' : '') + ' title="' + esc(c) + '">' + cardSvg(c) + '<span>' + esc(cardLabel(c)) + '</span></button>';
      }).join('') + '</div></section>';
  }).join('') +
    '<p class="deal-note">Pick the card they pay with. This order can only close as Card.</p></div>' +
    '<p class="deal-tier disc-other"><b>Other discount</b></p>';
}
function setDeal(key) {
  var k = String(key).split(':'), d = BANK_DEALS[+k[0]], c = d && d.cards[+k[1]];
  if (!d || c == null) return;
  ui.deal = { bank: d.bank, card: c, pct: d.pct };
  ui.payment = 'Card'; setSeg('paySeg', 'Card');
  setDiscount(d.pct);
}
function dealText(o) { return o.deal ? o.deal.bank + ' card deal, ' + o.deal.card : ''; }
function openDiscount() {
  var std = [0, 5, 10, 15, 20, 50];
  openModal('<h2 id="modalTitle">Discount on this order</h2>' + dealHtml() +
    '<div class="disc-foot">' +
    '<div class="chips disc-pct" role="group" aria-label="Other percentage">' + std.map(function (d) {
      return '<button type="button" data-d="' + d + '"' + (!ui.deal && ui.disc === d ? ' class="on"' : '') + '>' + (d ? d + '%' : 'None') + '</button>';
    }).join('') + '</div>' +
    '<label for="discountPct">Or type another %</label>' +
    '<div class="split disc-apply"><input type="number" id="discountPct" inputmode="numeric" min="0" max="100" placeholder="0–100"' + (!ui.deal && std.indexOf(ui.disc) < 0 ? ' value="' + ui.disc + '"' : '') + '>' +
    '<button type="button" class="btn primary" data-act="apply-disc">Apply</button></div>' +
    '<button type="button" class="btn quiet" data-act="close-modal">Cancel</button></div>', 'disc-modal');
}
/* ---- Customers by phone (11 Oct 2026): 'customers' records, id = the phone's digits ---- */
function phoneDigits(v) { v = String(v || '').replace(/\D/g, ''); if (v.indexOf('92') === 0 && v.length > 11) v = '0' + v.slice(2); return v.slice(0, 15); }
function customerByPhone(d) { var id = Number(d); if (!d || d.length < 7 || !isFinite(id)) return null; for (var i = 0; i < more.customers.length; i++) if (more.customers[i].id === id && !more.customers[i].deleted) return more.customers[i]; return null; }
function phoneTyped() {
  var box = $('custPhone'), hint = $('custHint'); if (!box || !hint) return;
  var d = phoneDigits(box.value), c = customerByPhone(d);
  if (c) {
    if (!$('custName').value.trim() && c.name) $('custName').value = c.name;
    var st = loyalState(c), extra = '';
    if (st && st.earned) extra = freeInCart() ? ' Free ' + esc(LOYALTY.item) + ' is in the order.' : ' <b>Free ' + esc(LOYALTY.item) + ' this visit.</b> <button type="button" class="link" data-act="loyal-add">Add it</button>';
    else if (st) extra = ' ' + st.left + (st.left === 1 ? ' more visit' : ' more visits') + ' to a free ' + esc(LOYALTY.item) + '.';
    hint.innerHTML = esc(c.name || 'This number') + ': ' + ordinal(c.visits + 1) + ' visit, last ' + (c.last ? esc(dayWord(c.last)) : 'before') + ', ' + money(c.spent) + ' so far.' + extra;
    hint.classList.remove('hidden');
  } else if (d.length >= 10) { hint.textContent = 'New number. The name will be remembered against it.'; hint.classList.remove('hidden'); }
  else hint.classList.add('hidden');
}
/* ---- Loyalty (11 Oct 2026): every CFG.LOYALTY.every visits, the named item is free. Visits come from the customer record. ---- */
var LOYALTY = CFG.LOYALTY && CFG.LOYALTY.every > 1 && CFG.LOYALTY.item ? CFG.LOYALTY : null;
function loyalItem() { if (!LOYALTY) return null; for (var i = 0; i < MENU.length; i++) if (MENU[i].n === LOYALTY.item) return MENU[i]; return null; }
function loyalState(c) {
  /* for the visit about to be rung: earned now, or how many more visits */
  if (!LOYALTY || !c) return null;
  var next = num(c.visits) + 1, left = LOYALTY.every - (next % LOYALTY.every);
  return { earned: next % LOYALTY.every === 0, left: left === LOYALTY.every ? 0 : left, visit: next };
}
function freeInCart() { for (var i = 0; i < cart.length; i++) if (cart[i].free) return cart[i]; return null; }
function addFreeItem() {
  var m = loyalItem(), c = customerByPhone(phoneDigits($('custPhone') ? $('custPhone').value : '')), st = loyalState(c);
  if (!m || !st || !st.earned) { toast('No free ' + (LOYALTY ? LOYALTY.item : 'item') + ' on this visit'); return; }
  if (freeInCart()) { toast('The free ' + m.n + ' is already in the order'); return; }
  cart.push({ n: m.n, c: m.c, p: 0, k: m.k, q: 1, free: true, note: 'Loyalty, visit ' + st.visit });
  renderCart(true); phoneTyped();
}
function dayWord(iso) { var p = String(iso).split('-'); if (p.length < 3) return iso; var d = new Date(+p[0], +p[1] - 1, +p[2]); return d.getDate() + ' ' + d.toLocaleDateString('en-US', { month: 'short' }); }
function rememberCustomer(o) {
  if (!o.phone || o.phone.length < 7) return;
  var id = Number(o.phone), c = customerByPhone(o.phone);
  if (!c) { c = { id: id, phone: o.phone, name: '', visits: 0, spent: 0, last: '', u: 0 }; more.customers.push(c); }
  if (o.customer && o.customer !== 'Walk-in') c.name = txt(o.customer, 40);
  c.visits = num(c.visits) + 1; c.spent = num(c.spent) + num(o.total); c.last = o.iso;
  if (o.reward) c.rewards = num(c.rewards) + 1;
  stamp(c); commit('customers', c.id);
}
/* ====== PEOPLE, ROLES AND APPROVALS (12 Oct 2026) ======
   The device signs in with the outlet PIN as before. When the owner has turned personal logins on, a person then signs in
   on it with their own PIN. Waiter: takes orders, sends them to the kitchen, never takes money. Till manager: bills, the
   drawer, stock counts. Manager: approves. Owner: everything. The kitchen has no login; it works from the printed slips.
   The server enforces all of it (pos.refuse); the screens below only show each role what it can do. */
var ME_KEY = 'pos_me' + SUF, ROLES_KEY = 'pos_roles' + SUF, LASTME_KEY = 'pos_lastme' + SUF;
var rolesOn = false, staffList = [], policy = { disc_cap: 10 }, menuPublished = '', me = null, refusedNote = [], rereadAll = false;
try { var rc0 = JSON.parse(localStorage.getItem(ROLES_KEY) || 'null'); if (rc0) { rolesOn = !!rc0.on; staffList = rc0.staff || []; policy = rc0.policy || policy; } } catch (e) {}
try { var me0 = JSON.parse(localStorage.getItem(ME_KEY) || 'null'); if (me0 && me0.session && me0.until > Date.now()) me = me0; } catch (e) {}
var ROLE_WORD = { waiter: 'Waiter', till: 'Till manager', manager: 'Manager' };
function saveMe() { try { if (me) { localStorage.setItem(ME_KEY, JSON.stringify(me)); localStorage.setItem(LASTME_KEY, String(me.id)); } else localStorage.removeItem(ME_KEY); } catch (e) {} }
function isRole(r) { return !!(rolesOn && me && me.role === r); }
function loadRoles(cb) {
  if (!BACKEND || !token()) { if (cb) cb(); return; }
  api('pos_staff_list', { token: token() }, function (err, res) {
    if (!err && res.ok) {
      rolesOn = !!res.roles; staffList = res.staff || []; policy = res.policy || policy; menuPublished = res.menu || '';
      try { localStorage.setItem(ROLES_KEY, JSON.stringify({ on: rolesOn, staff: staffList, policy: policy })); } catch (e) {}
    }
    if (cb) cb();
  });
}
function applyMe() {
  if (role !== 'barista') { document.body.removeAttribute('data-me'); return; }
  document.body.setAttribute('data-me', rolesOn ? (me ? me.role : 'none') : '');
  var b = $('whoBtn'), ob = $('bTabs').querySelector('[data-tab="orders"]'), kt = $('kdsTab'), lb = $('laterBtn');
  if (!rolesOn) return;
  if (kt) { kt.classList.toggle('hidden', !(KDS && me && me.role === 'manager')); if (kt.firstChild) kt.firstChild.nodeValue = 'Pass '; }
  if (!me) { if (b) { b.textContent = 'Sign in'; b.classList.remove('hidden'); } return; }
  who = me.name;
  if (b) { b.innerHTML = faceHtml(me.name) + esc(me.name) + ' · ' + ROLE_WORD[me.role]; b.classList.remove('hidden'); }
  if (ob && ob.firstChild) ob.firstChild.nodeValue = me.role === 'waiter' ? 'My orders ' : 'Bills ';
  if (me.role === 'waiter') {
    ui.waiter = me.name; ui.channel = 'Counter';
    if (lb) { lb.innerHTML = 'Send to the kitchen <small>the till takes the payment</small>'; lb.className = 'btn primary big'; }
  } else if (lb) { lb.innerHTML = 'Pay at the end <small>kitchen now, mark paid on Bills</small>'; lb.className = 'btn secondary'; }
  showTableField();
}
function askWhoAmI(force, msg) {
  var live = staffList.filter(function (x) { return x.active && x.pin; });
  openModal('<h2 id="modalTitle">Who are you?</h2><p class="deal-note">' + esc(msg || 'Tap your name, then enter your own PIN. Everything you ring carries your name.') + '</p>' +
    (live.length ? '<div class="chips faces" role="group" aria-labelledby="modalTitle">' + live.map(function (x) {
      return '<button type="button" data-act="me-pick" data-id="' + num(x.id) + '"' + (me && me.id === x.id ? ' class="on"' : '') + '>' + faceHtml(x.name) + esc(x.name) + ' <small>' + ROLE_WORD[x.role] + '</small></button>';
    }).join('') + '</div>' : '<p class="deal-note">No staff are set up. The owner adds them under Settings.</p>') +
    (force ? '<button type="button" class="btn quiet" data-act="logout">Lock this tablet</button>' : '<button type="button" class="btn quiet" data-act="close-modal">Cancel</button>'));
}
function staffById(id) { for (var i = 0; i < staffList.length; i++) if (staffList[i].id === id) return staffList[i]; return null; }
function askMyPin(id) {
  var x = staffById(id); if (!x) return;
  var last = 0; try { last = num(localStorage.getItem(LASTME_KEY)); } catch (e) {}
  var lp = staffById(last);
  if (waiting() && last && last !== id && lp && lp.active && x.role !== 'manager') { toast('Unsent orders from ' + lp.name + ' are still on this tablet. Connect it and wait for Saved, or ask a manager to sign in on it.'); return; }
  openModal('<h2 id="modalTitle">' + faceHtml(x.name, true) + '</h2><p class="deal-tier"><b>' + esc(x.name) + '</b>, ' + ROLE_WORD[x.role] + '</p>' +
    '<label for="mePin">Your PIN</label><input type="password" id="mePin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off">' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="me-back">Back</button>' +
    '<button type="button" class="btn primary" data-act="me-go" data-id="' + num(id) + '">Sign in</button></div>');
  setTimeout(function () { var f = $('mePin'); if (f) f.focus(); }, 60);
}
function meLogin(id) {
  var pinv = $('mePin') ? $('mePin').value.trim() : '';
  if (!/^\d{4,6}$/.test(pinv)) { toast('Enter your PIN'); return; }
  api('pos_staff_login', { token: token(), staff: String(id), pin: pinv }, function (err, res) {
    if (err) { toast('No internet: signing in needs the server'); return; }
    if (!res.ok) { toast(res.error === 'locked' ? 'This tablet is locked for ' + waitText(res.wait) + ' after wrong PINs' : 'That PIN is not right'); if ($('mePin')) $('mePin').value = ''; return; }
    me = { id: num(res.id), name: txt(res.name, 40), role: res.role, session: res.session, until: num(res.until) }; saveMe();
    closeModal(); applyMe(); resetOrderForm(); renderCart(); showTab(me.role === 'waiter' ? 'sell' : 'orders'); refreshAll(); runSync();
    toast(me.name + ' signed in');
  });
}
function meOut(tellServer) {
  if (me && tellServer && BACKEND && !waiting()) api('pos_staff_logout', { staff: me.session }, function () {});
  me = null; saveMe(); document.body.removeAttribute('data-me');
}
/* what the signed-in person must ask someone else for */
function needsOk(action) {
  if (!rolesOn || !me || role !== 'barista') return false;
  if (me.role === 'waiter') return action === 'reduce' || action === 'remake';
  if (me.role === 'till') return ['void', 'discount', 'refund', 'cashout', 'expense', 'reclose', 'reduce', 'remake'].indexOf(action) >= 0;
  return false;
}
var apAsk = null;
function approve(action, ref, amount, text, cb) {
  var who2 = staffList.filter(function (x) { return x.active && x.pin && x.id !== me.id && (x.role === 'manager' || (x.role === 'till' && (action === 'reduce' || action === 'remake'))); });
  apAsk = { action: action, ref: String(ref), amount: Math.round(Math.abs(num(amount))), text: txt(text, 80), cb: cb, by: who2.length ? String(who2[0].id) : 'owner' };
  openModal('<h2 id="modalTitle">This needs approval</h2><p class="deal-tier"><b>' + esc(text) + '</b></p>' +
    '<p class="deal-note">Hand the tablet to ' + (action === 'reduce' || action === 'remake' ? 'the till manager or a manager' : 'a manager') + '. They tap their name and enter their own PIN. It is kept with their name, yours and the time.</p>' +
    '<div class="chips tight" id="apWho">' + who2.map(function (x, i) { return '<button type="button" data-act="ap-who" data-v="' + num(x.id) + '"' + (i === 0 ? ' class="on"' : '') + '>' + faceHtml(x.name) + esc(x.name) + '</button>'; }).join('') +
    '<button type="button" data-act="ap-who" data-v="owner"' + (who2.length ? '' : ' class="on"') + '>Owner</button></div>' +
    '<label for="apPin">Their PIN</label><input type="password" id="apPin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off">' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Cancel</button>' +
    '<button type="button" class="btn primary" data-act="ap-go">Approve</button></div>');
}
function approveGo() {
  if (!apAsk) return;
  var pinv = $('apPin') ? $('apPin').value.trim() : '', a = apAsk;
  if (!/^\d{4,6}$/.test(pinv)) { toast('Enter the PIN'); return; }
  api('pos_approve', { token: token(), by: a.by, pin: pinv, action: a.action, ref: a.ref, amount: a.amount, why: a.text, staff: me ? me.session : '' }, function (err, res) {
    if (err) { toast('No internet: an approval needs the server'); return; }
    if (!res.ok) { toast(res.error === 'locked' ? 'Locked for ' + waitText(res.wait) + ' after wrong PINs' : res.error === 'self' ? 'You cannot approve your own request' : res.error === 'role' ? 'That person cannot approve this' : 'That PIN is not right'); if ($('apPin')) $('apPin').value = ''; return; }
    apAsk = null; closeModal(); toast('Approved by ' + res.by); a.cb(res.id);
  });
}
/* a change the server turned away: take this device's copy out and read the books afresh, so the screen shows the truth */
function dropLocal(kind, id) {
  var keep = function (x) { return String(x.id) !== id; };
  if (kind === 'orders') orders = orders.filter(keep); else if (kind === 'voided') voided = voided.filter(keep);
  else if (kind === 'expenses') expenses = expenses.filter(keep); else if (more[kind]) more[kind] = more[kind].filter(keep);
}
function handleRefused(keys) {
  var words = [];
  keys.forEach(function (k) {
    var i = k.indexOf(':'), kind = k.slice(0, i), id = k.slice(i + 1), rec = recFor(k);
    words.push(kind === 'orders' && rec ? 'order #' + pad(rec.no) : kind === 'voided' && rec ? 'the void of #' + pad(rec.no) : kind);
    delete outbox[k]; dropLocal(kind, id);
  });
  rereadAll = true;
  refusedNote = words.slice(0, 6);
  toast('Not saved: the server refused ' + words.slice(0, 3).join(', ') + '. Tell the till manager.');
}
/* ---- the owner's side: staff, the switch, the cap, the menu the server checks prices against, the log ---- */
function renderStaff() {
  var box = $('staffList'); if (!box) return;
  if ($('staffCard')) $('staffCard').classList.toggle('hidden', !BACKEND);
  box.innerHTML = staffList.length ? staffList.map(function (x) {
    return '<div class="row person"><div class="row-main"><h3>' + faceHtml(x.name) + esc(x.name) + (x.active ? '' : ' <span class="badge Unpaid">switched off</span>') + '</h3><p>' + ROLE_WORD[x.role] + (x.pin ? '' : ', no PIN yet') + '</p></div>' +
      '<div class="row-side"><button type="button" class="btn sm secondary" data-act="staff-edit" data-id="' + num(x.id) + '">Change</button></div></div>';
  }).join('') : '<p class="hint">Nobody yet. Add each waiter, the till manager and the manager with their own PIN.</p>';
  if ($('rolesNote')) $('rolesNote').textContent = rolesOn ? 'Personal logins are ON. A tablet opened with the Counter PIN does nothing until a person signs in on it with their own PIN.'
    : 'Personal logins are OFF: anyone with the Counter PIN can ring. Add the staff, then turn this on.';
  if ($('rolesBtn')) $('rolesBtn').textContent = rolesOn ? 'Turn personal logins off' : 'Turn personal logins on';
  if ($('capIn') && document.activeElement !== $('capIn')) $('capIn').value = num(policy.disc_cap);
}
function askStaff(id) {
  var x = staffById(id) || { id: 0, name: '', role: 'waiter', active: true };
  openModal('<h2 id="modalTitle">' + (x.id ? 'Change ' + esc(x.name) : 'Add a person') + '</h2>' +
    '<label for="stName">Name</label><input type="text" id="stName" maxlength="40" value="' + esc(x.name) + '" autocomplete="off">' +
    '<label for="stRole">Role</label><select id="stRole">' + ['waiter', 'till', 'manager'].map(function (r) { return '<option value="' + r + '"' + (x.role === r ? ' selected' : '') + '>' + ROLE_WORD[r] + '</option>'; }).join('') + '</select>' +
    '<label for="stPin">' + (x.id ? 'New PIN (leave empty to keep the old one)' : 'PIN, 4 to 6 digits') + '</label><input type="password" id="stPin" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off">' +
    '<label class="check"><input type="checkbox" id="stOn"' + (x.active ? ' checked' : '') + '> Works here now (untick when they leave: their sign-in stops at once)</label>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Cancel</button>' +
    '<button type="button" class="btn primary" data-act="staff-save" data-id="' + num(x.id) + '">Save</button></div>');
}
function saveStaff(id) {
  var body = { token: token(), name: $('stName').value.trim(), role: $('stRole').value, pin: $('stPin').value.trim(), active: $('stOn').checked };
  if (id) body.id = String(id);
  api('pos_staff_set', body, function (err, res) {
    if (err) { toast('No internet'); return; }
    if (!res.ok) { toast(res.error === 'pin' ? 'The PIN must be 4 to 6 digits' : res.error === 'name_taken' ? 'That name is already on the list' : res.error === 'shape' ? 'Give a name and a role' : 'Not saved'); return; }
    closeModal(); loadRoles(function () { renderStaff(); toast('Saved'); });
  });
}
function toggleRoles() {
  api('pos_roles', { token: token(), on: !rolesOn }, function (err, res) {
    if (err) { toast('No internet'); return; }
    if (!res.ok) { toast(res.error === 'no_staff' ? 'Add a till manager or a manager with a PIN first' : 'Not changed'); return; }
    loadRoles(function () { renderStaff(); if (rolesOn) publishMenu(true); toast(rolesOn ? 'Personal logins are on' : 'Personal logins are off'); });
  });
}
function saveCap() {
  api('pos_roles', { token: token(), disc_cap: num($('capIn').value) }, function (err, res) {
    if (err || !res.ok) { toast('Not saved'); return; }
    policy = res.policy || policy; renderStaff(); toast('The till may give up to ' + num(policy.disc_cap) + '% alone');
  });
}
function publishMenu(quiet) {
  var prices = {}, mods = {};
  MENU.forEach(function (m) { if (m.custom) return; prices[m.c + '|' + m.n] = m.p; if (m.c === (CFG.ADDON_CAT || 'Add-ons')) mods[m.n] = m.p; });
  api('pos_menu_set', { token: token(), prices: prices, mods: mods, version: txt(CFG.VERSION, 40), loyalty: LOYALTY ? { every: LOYALTY.every, item: LOYALTY.item } : null,
    deals: BANK_DEALS.map(function (d) { return { bank: d.bank, pct: d.pct, cards: d.cards }; }) }, function (err, res) {
    if (err || !res.ok) { if (!quiet) toast('The menu was not published'); return; }
    menuPublished = txt(CFG.VERSION, 40); if (!quiet) toast(res.items + ' prices published. The server refuses any other price.');
  });
}
function loadLog() {
  var box = $('apLog'); if (!box) return;
  api('pos_approvals', { token: token() }, function (err, res) {
    if (err || !res.ok) { box.innerHTML = '<p class="hint">Could not read the log.</p>'; return; }
    var AW = { void: 'Void', discount: 'Discount', refund: 'Refund', remake: 'Remake', reduce: 'Items taken off', cashout: 'Cash taken out', expense: 'Expense from the drawer', reclose: 'Day counted again' };
    var hm = function (ms) { var d = new Date(ms); return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2) + ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); };
    box.innerHTML = (res.approvals.length ? res.approvals.map(function (a) {
      return '<div class="row"><div class="row-main"><h3>' + esc(AW[a.action] || a.action) + (a.self ? ' <span class="badge Unpaid">manager, own PIN</span>' : '') + '</h3><p>' + esc(hm(a.at)) + ', approved by ' + esc(a.by_name) +
        (a.asked_by && a.asked_by !== a.by_name ? ', asked by ' + esc(a.asked_by) : '') + (a.why ? ', ' + esc(a.why) : '') + '</p></div><div class="row-side"><span class="row-amt">' + n0(a.amount) + '</span></div></div>';
    }).join('') : '<p class="hint">No approvals yet.</p>') +
      (res.refused.length ? '<p class="deal-tier"><b>Refused by the server</b></p>' + res.refused.slice(0, 40).map(function (x) {
        return '<div class="row"><div class="row-main"><h3>' + esc(x.name || 'Nobody signed in') + (x.role ? ', ' + esc(ROLE_WORD[x.role] || x.role) : '') + '</h3><p>' + esc(hm(x.at)) + ', ' + esc(x.device) + ': ' + esc(x.why) + '</p></div></div>';
      }).join('') : '');
  });
}
/* ---- the pass board on the owner's tablet: the kitchen works from paper, so the ages are watched here ---- */
function renderPass() {
  var box = $('oPassList'); if (!box) return;
  var open = orders.filter(function (o) { return isToday(o) && !o.servedAt && !o.adj; }).sort(function (a, b) { return a.id - b.id; }), late = 0;
  box.innerHTML = open.map(function (o) {
    var mn = elapsedMin(o), cls = mn >= LATE_MIN ? ' late' : mn >= 8 ? ' slow' : ''; if (mn >= LATE_MIN) late++;
    return '<div class="kds-card' + cls + '"><div class="kds-head"><div class="kds-top"><span class="num kds-no">#' + pad(o.no) + '</span><span class="kds-age">' + Math.floor(mn) + ' min</span></div>' +
      '<div class="kds-meta">' + (o.remake ? '<b class="badge Unpaid">REMAKE</b> · ' : '') + (o.svc ? '<b>' + esc(o.svc) + (o.table ? ', table ' + num(o.table) : '') + '</b> · ' : '') + esc(o.time) +
      (o.customer && o.customer !== 'Walk-in' ? ' · ' + esc(o.customer) : '') + '</div>' +
      '<div class="kds-meta">' + (o.waiter ? faceHtml(o.waiter) + esc(o.waiter) : 'no waiter') + ' · ' + badge(o.payment) + '</div></div>' +
      '<div class="kds-body"><ul class="kds-items">' + o.items.map(function (it) {
        return '<li><span class="kds-q">' + it.q + '×</span><span class="kds-n">' + esc(label(it)) + modsText(it) +
          (it.note ? '<span class="kds-note">' + esc(it.note) + '</span>' : '') + '</span></li>';
      }).join('') + '</ul></div></div>';
  }).join('') || '<div class="empty"><span class="scribble">all clear</span>Every order of today has gone out.</div>';
  if ($('oPassNote')) $('oPassNote').textContent = open.length ? open.length + ' open' + (late ? ', ' + late + ' past ' + LATE_MIN + ' minutes' : '') : '';
  if ($('oTabLate')) { $('oTabLate').textContent = late; $('oTabLate').classList.toggle('hidden', !late); }
}
function billPlease(id) {
  var o = findOrder(id); if (!o || o.payment !== 'Unpaid') return;
  o.bill = nowMs(); stamp(o); commit('orders', o.id); refreshAll(); toast('The till has been asked for the bill of #' + pad(o.no));
}
var WAITER_NO = ['ask-void', 'confirm-void', 'ask-paid', 'paid-by', 'pay-method', 'paid-deal', 'paid-disc', 'paid-disc-apply', 'discount', 'apply-disc', 'charge', 'reprint', 'reprint-by', 'reslip', 'rekitchen', 'custom', 'move-add', 'move-del',
  'close-day', 'set-opening', 'loyal-add', 'count-ask', 'waste-ask', 'outs-ask', 'pay-now', 'vdel-ask'];
function blockedForMe(act) {
  if (!rolesOn || role !== 'barista') return false;
  if (!me) { if (['me-pick', 'me-go', 'me-back', 'logout', 'sync', 'close-modal'].indexOf(act) >= 0) return false; askWhoAmI(true); return true; }
  if (me.role === 'waiter' && WAITER_NO.indexOf(act) >= 0) { toast('That is done at the till'); return true; }
  return false;
}

var SERVICE = Array.isArray(CFG.SERVICE) && CFG.SERVICE.length ? CFG.SERVICE : null;   /* e.g. ['Dine in', 'Takeaway'] */
function svcDefault() {
  if (!SERVICE) return '';
  var h = new Date(nowMs()).getHours(), from = CFG.SERVICE_EVENING_FROM == null ? 19 : CFG.SERVICE_EVENING_FROM;
  return (h >= from || h < DAY_CUTOFF_HOUR) && SERVICE.length > 1 ? SERVICE[0] : SERVICE[SERVICE.length - 1];   /* seating opens in the evening: dine in after that, takeaway before */
}
function setService(v) {
  if (!SERVICE) return;
  ui.svc = SERVICE.indexOf(v) >= 0 ? v : svcDefault();
  if ($('svcSeg')) setSeg('svcSeg', ui.svc);
  showTableField();
}
function showTableField() {
  var on = !!(CFG.TABLE_NO && ui.svc === 'Dine in');
  if ($('tableField')) $('tableField').classList.toggle('hidden', !on);
  else if ($('tableNo')) $('tableNo').classList.toggle('hidden', !on);
  syncOrderTableLbl();
}
function syncOrderTableLbl() {
  var el = $('orderTableLbl'); if (!el) return;
  var n = ($('tableNo') && CFG.TABLE_NO && ui.svc === 'Dine in') ? num($('tableNo').value) : 0;
  el.textContent = n ? 'Table ' + n : '';
  el.classList.toggle('hidden', !n);
}
function renderServiceSeg() {
  var el = $('svcSeg'); if (!el || !SERVICE) return;
  el.innerHTML = SERVICE.map(function (v) { return '<button type="button" data-v="' + esc(v) + '">' + esc(v) + '</button>'; }).join('');
  el.classList.remove('hidden'); setService(svcDefault());
}
function resetOrderForm() {
  cart = []; ui.channel = 'Counter'; ui.payment = 'Cash'; ui.payNow = false; ui.deal = null;
  setSeg('chanSeg', 'Counter'); setSeg('paySeg', 'Cash');
  setService(svcDefault());
  if ($('tableNo')) $('tableNo').value = '';
  syncOrderTableLbl();
  if (isRole('waiter')) ui.waiter = me.name;
  $('custName').value = '';
  if ($('custPhone')) { $('custPhone').value = ''; $('custHint').classList.add('hidden'); }
  if ($('orderNote')) $('orderNote').value = '';
  setDiscount(0);
}
function confirmOrder(payment, acctWho, preId, okId) {
  if (!cart.length) { toast('Order is empty'); return; }
  if (isRole('waiter') && payment !== 'Unpaid') { toast('Send it to the kitchen. The till takes the payment.'); return; }
  var tableV = $('tableNo') && CFG.TABLE_NO && ui.svc === 'Dine in' ? num($('tableNo').value) : 0;
  if (CFG.TABLE_NO && ui.svc === 'Dine in' && ui.channel !== 'Foodpanda' && !tableV) { toast('Which table?'); if ($('tableNo')) $('tableNo').focus(); return; }
  if (ui.deal && payment !== 'Card' && payment !== 'Unpaid') { toast(ui.deal.bank + ' card deal: this order must be paid by card'); return; }
  var t = cartTotals(payment), cogs = 0, chan = ui.channel;
  if (needsOk('discount') && !ui.deal && t.pct > num(policy.disc_cap) && !okId) {
    var nid = newId();
    approve('discount', nid, t.disc, t.pct + '% off, ' + money(t.disc) + ' on ' + money(t.sub), function (k) { confirmOrder(payment, acctWho, nid, k); });
    return;
  }
  cart.forEach(function (c) { cogs += (c.k + (chan === 'Foodpanda' ? DELIVERY_PKG : 0)) * c.q; });
  seq++;
  var o = {
    no: seq, id: preId || newId(), date: localeDay(), iso: isoNow(), time: timeNow(),
    items: copy(cart), sub: t.sub, discount: t.disc, discountPct: t.pct, total: t.total, cogs: cogs,
    channel: chan, payment: payment, customer: (acctWho && acctWho.name) || $('custName').value.trim() || 'Walk-in', u: nowMs()
  };
  applyOrderTax(o);
  if (acctWho && acctWho.acct) o.acct = acctWho.acct;
  if (ui.deal) o.deal = copy(ui.deal);
  var onote = $('orderNote') ? txt($('orderNote').value, 160).trim() : '';
  if (onote) o.note = onote;
  if (ui.waiter) o.waiter = ui.waiter;
  if (SERVICE) o.svc = chan === 'Foodpanda' ? 'Delivery' : (ui.svc || svcDefault());
  if (tableV) o.table = tableV;
  if (okId) o.ok = okId;
  if (who) o.by = who;
  if (/^\d{1,3}$/.test(o.customer)) o.table = Number(o.customer); /* pay-at-the-end venues ring by table number */
  var ph = $('custPhone') ? phoneDigits($('custPhone').value) : '';
  if (ph.length >= 7) o.phone = ph;
  var fr = freeInCart();
  if (fr) { if (!o.phone || !loyalState(customerByPhone(o.phone)) || !loyalState(customerByPhone(o.phone)).earned) { toast('The free ' + fr.n + ' needs the customer\'s phone number on its 10th visit'); seq--; return; } o.reward = fr.n; }
  if (o.phone) { var cst = loyalState(customerByPhone(o.phone) || { visits: 0 }); o.visit = cst.visit; }
  orders.push(o);
  commit('orders', o.id);
  rememberCustomer(o);
  if (payment === 'Unpaid') printSlip(o, true); else printReceipt(o, true);
  resetOrderForm(); closeSheet(); refreshAll();
  showDone(o.no, payment === 'Unpaid' ? 'On account: ' + o.customer : 'Paid by ' + payment.toLowerCase());
}
/* ====== ACCOUNTS: who owes what ====== */
function liveAccounts() {
  /* in the order they were set up, which is the order the day-end report has always used */
  return more.accounts.filter(function (a) { return !a.deleted; }).sort(function (a, b) { return a.id - b.id; });
}
function accountById(id) {
  for (var i = 0; i < more.accounts.length; i++) if (more.accounts[i].id === id && !more.accounts[i].deleted) return more.accounts[i];
  return null;
}
function accountNamed(n) {
  n = String(n || '').trim().toLowerCase();
  return liveAccounts().filter(function (a) { return String(a.name).toLowerCase() === n; })[0] || null;
}
/* The usual accounts, from config.js. Fixed ids, so two devices starting at once do not make doubles. */
function seedAccounts() {
  if (more.accounts.length) return;
  (CFG.ACCOUNTS || []).forEach(function (n, i) {
    more.accounts.push({ id: i + 1, name: txt(n, 40), u: 1 });
    if (BACKEND) outbox['accounts:' + (i + 1)] = 1;
  });
  save();
}
function accountOf(o) { return (o.acct && accountById(o.acct)) || accountNamed(o.customer); }
/* Foodpanda and FatMan orders are settled later, so they go on that account unless the customer pays now. */
function channelDef(v) { for (var i = 0; i < CHANNELS.length; i++) if (CHANNELS[i].v === v) return CHANNELS[i]; return null; }
function channelLabel(v) { var c = channelDef(v); return c ? (c.l || c.v) : (v === 'FatMan' ? 'FatMan counter' : v); }
function renderChannels() {
  var el = $('chanSeg'); if (!el) return;
  el.innerHTML = CHANNELS.map(function (c, i) {
    return '<button type="button" data-v="' + esc(c.v) + '"' + (i === 0 ? ' class="on" aria-pressed="true"' : ' aria-pressed="false"') + '>' + esc(c.l || c.v) + '</button>';
  }).join('');
}
function channelAccount() {
  if (ui.payNow || ui.channel === 'Counter') return null;
  var c = channelDef(ui.channel);
  return accountNamed(c && c.acct ? c.acct : (ui.channel === 'FatMan' ? 'Fatman' : ui.channel));
}
/* Every unpaid order, grouped by who owes it. */
function owed() {
  var groups = {}, list = [];
  unpaidAll().forEach(function (o) {
    var a = accountOf(o), key = a ? 'a' + a.id : 'n' + String(o.customer).toLowerCase();
    if (!groups[key]) { groups[key] = { key: key, acct: a, name: a ? a.name : o.customer, total: 0, orders: [] }; list.push(groups[key]); }
    groups[key].total += o.total; groups[key].orders.push(o);
  });
  list.forEach(function (g) { g.orders.sort(function (x, y) { return x.id - y.id; }); });
  list.sort(function (x, y) { return y.total - x.total; });
  return list;
}
function owedGroup(key) { return owed().filter(function (g) { return g.key === key; })[0] || null; }
function askAccount() {
  if (!cart.length) { toast('Order is empty'); return; }
  openModal('<h2 id="modalTitle">Put this order on an account</h2>' +
    '<p>' + money(cartTotals('Unpaid').total) + '. An order slip prints, and the amount is added to what they owe.</p>' +
    '<div class="chips" role="group" aria-labelledby="modalTitle">' + liveAccounts().map(function (a) {
      return '<button type="button" data-act="acct-pick" data-id="' + num(a.id) + '">' + esc(a.name) + '</button>';
    }).join('') + '</div>' +
    '<label for="acctOther">Someone else</label>' +
    '<div class="split"><input type="text" id="acctOther" maxlength="40" placeholder="Their name" value="' + esc($('custName').value.trim()) + '">' +
    '<button type="button" class="btn primary" data-act="acct-other">Use this name</button></div>' +
    '<button type="button" class="btn quiet" data-act="close-modal">Cancel</button>');
}
function askReceive(key) {
  var g = owedGroup(key); if (!g) return;
  openModal('<h2 id="modalTitle">Payment from ' + esc(g.name) + '</h2><p>Untick any order that is not being paid now.</p>' +
    '<div class="pick" id="rcvList">' + g.orders.map(function (o) {
      return '<label><input type="checkbox" checked data-id="' + o.id + '" data-amt="' + o.total + '"><span>#' + pad(o.no) + ', ' + esc(dayText(o)) + '</span><b class="num">' + n0(o.total) + '</b></label>';
    }).join('') + '</div>' +
    '<div class="close-line sum"><span>Being paid now' + (TAX.enabled ? ' (before tax)' : '') + '</span><b id="rcvTotal">' + n0(g.total) + '</b></div>' +
    '<div class="pay-pick">' + ['Cash', 'Card', 'Transfer'].map(function (m) {
      return '<button type="button" class="btn secondary" data-act="acct-settle" data-v="' + m + '">' + m + '</button>';
    }).join('') + '</div>' +
    '<button type="button" class="btn quiet" data-act="close-modal">Not now</button>');
  if (TAX.enabled) updateReceiveTotals();
}
function updateReceiveTotals() {
  var sums = { Cash: 0, Card: 0, Transfer: 0 }, base = 0;
  [].forEach.call($('rcvList').querySelectorAll('input:checked'), function (box) {
    base += num(box.getAttribute('data-amt'));
    if (!TAX.enabled) return;
    var o = findOrder(+box.getAttribute('data-id')); if (!o || o.payment !== 'Unpaid') return;
    Object.keys(sums).forEach(function (m) { if (!o.deal || m === 'Card') sums[m] += TAX.compute(o.items, o.discount, m).total; });
  });
  $('rcvTotal').textContent = n0(base);
  if (TAX.enabled) [].forEach.call($('modalCard').querySelectorAll('[data-act="acct-settle"]'), function (b) {
    var m = b.getAttribute('data-v'); b.textContent = m + ' · ' + money(sums[m]);
  });
}
function settle(method) {
  var n = 0, sum = 0, held = 0;
  [].forEach.call($('rcvList').querySelectorAll('input:checked'), function (box) {
    var o = findOrder(+box.getAttribute('data-id'));
    if (!o || o.payment !== 'Unpaid') return;
    if (o.deal && method !== 'Card') { held++; return; }   /* a card deal is only ever closed as Card */
    o.payment = method; applyOrderTax(o); o.paidAt = timeNow(); o.paidDate = localeDay(); o.paidIso = isoNow(); stamp(o);
    if (BACKEND) outbox['orders:' + o.id] = 1;
    n++; sum += o.total;
  });
  closeModal();
  if (held) toast(held + (held === 1 ? ' order has' : ' orders have') + ' a bank card deal and can only be paid by card');
  if (!n) { if (!held) toast('Nothing was ticked'); return; }
  commit(); refreshAll();
  toast(n + (n === 1 ? ' order' : ' orders') + ' paid by ' + method.toLowerCase() + ', ' + money(sum));
}
function statementText(g) {
  var L = [BRAND.statement, 'Statement for ' + g.name + ', ' + niceDay(bizDate()), ''];
  g.orders.forEach(function (o) { L.push(dayText(o) + '  #' + pad(o.no) + '  ' + itemsText(o) + '  ' + n0(o.total)); });
  L.push('', 'Total owed: ' + money(g.total));
  return L.join('\n');
}
function copyText(t, okMsg) {
  function byHand() {
    openModal('<h2 id="modalTitle">Copy this</h2><p>Press and hold the text, choose Select all, then Copy.</p>' +
      '<textarea class="copybox" readonly>' + esc(t) + '</textarea><button type="button" class="btn secondary" data-act="close-modal">Done</button>');
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { toast(okMsg); }, byHand);
  else byHand();
}
function addAccount(name) {
  name = String(name || '').trim();
  if (!name) { toast('Type a name for the account'); return false; }
  if (accountNamed(name)) { toast('There is already an account called ' + name); return false; }
  var a = { id: newId(), name: txt(name, 40), u: nowMs() };
  more.accounts.push(a); commit('accounts', a.id);
  return true;
}
function renderAccounts() {
  var list = owed(), total = 0, h = '', has = {};
  list.forEach(function (g) {
    total += g.total; if (g.acct) has[g.acct.id] = 1;
    h += '<div class="row"><div class="row-main"><h3>' + esc(g.name) + (g.acct ? '' : ' <span class="badge Unpaid">no account</span>') + '</h3>' +
      '<p>' + g.orders.length + (g.orders.length === 1 ? ' unpaid order' : ' unpaid orders') + ', oldest from ' + esc(dayText(g.orders[0])) + '</p></div>' +
      '<div class="row-side"><span class="row-amt">' + n0(g.total) + '</span>' +
      '<button type="button" class="btn sm secondary" data-act="acct-statement" data-key="' + esc(g.key) + '">Copy statement</button>' +
      '<button type="button" class="btn sm primary" data-act="acct-receive" data-key="' + esc(g.key) + '">Receive payment</button></div></div>';
  });
  liveAccounts().forEach(function (a) {
    if (has[a.id]) return;
    h += '<div class="row"><div class="row-main"><h3>' + esc(a.name) + '</h3><p>Owes nothing</p></div>' +
      '<div class="row-side"><button type="button" class="btn sm danger" data-act="acct-remove" data-id="' + num(a.id) + '">Remove</button></div></div>';
  });
  setNum('acctTotal', total);
  $('acctNote').textContent = list.length ? 'Across ' + list.length + (list.length === 1 ? ' name.' : ' names.') + ' Tap Receive payment when one of them settles.' : 'Nobody owes anything.';
  $('acctList').innerHTML = h || none('No accounts yet. Add one below.');
  $('oTabOwed').textContent = list.length; $('oTabOwed').classList.toggle('hidden', !list.length);
}

/* ====== CLOSING THE DAY ====== */
function sumOf(list, fn) { var t = 0; list.forEach(function (x) { t += fn(x) || 0; }); return t; }
function dayId(iso) { return Number(String(iso).replace(/-/g, '')); }
function dayRec(iso) {
  for (var i = 0; i < more.days.length; i++) if (more.days[i].iso === iso && !more.days[i].deleted) return more.days[i];
  return null;
}
function prevClose(iso) {
  var best = null;
  more.days.forEach(function (d) { if (!d.deleted && d.iso < iso && d.counted != null && (!best || d.iso > best.iso)) best = d; });
  return best;
}
/* Everything the day-end report needs for one trading day. */
function dayFigures(iso) {
  var f = { iso: iso, count: 0, sales: 0, by: { Cash: 0, Card: 0, Transfer: 0, Unpaid: 0 }, food: 0, cashIn: 0, late: 0, cardIn: 0, transferIn: 0 };
  orders.forEach(function (o) {
    if (o.iso === iso) {
      if (!o.adj) f.count++; f.sales += o.total;
      if (f.by[o.payment] != null) f.by[o.payment] += o.total;
      var list = sumOf(o.items, function (it) { return it.p * it.q; });
      o.items.forEach(function (it) { if (it.c === 'Food' && list) f.food += it.p * it.q * o.total / list; });
    }
    /* cash counts on the day it is handed over, so an old tab paid today is today's cash */
    if (o.payment === 'Cash' && (o.paidIso || o.iso) === iso) { f.cashIn += o.total; if (o.iso !== iso) f.late += o.total; }
    /* card and transfer money, too, counts on the day it was taken: it is what the machine's batch and the bank should show */
    if (o.payment === 'Card' && (o.paidIso || o.iso) === iso) f.cardIn += o.total;
    if (o.payment === 'Transfer' && (o.paidIso || o.iso) === iso) f.transferIn += o.total;
  });
  f.expenses = liveExpenses().filter(function (e) { return e.iso === iso; });
  f.exTill = sumOf(f.expenses, function (e) { return e.till !== false ? e.amount : 0; });
  f.moves = more.moves.filter(function (m) { return !m.deleted && m.iso === iso; });
  f.out = sumOf(f.moves, function (m) { return m.amount < 0 ? -m.amount : 0; });
  f.put = sumOf(f.moves, function (m) { return m.amount > 0 ? m.amount : 0; });
  f.rec = dayRec(iso); f.prev = prevClose(iso);
  f.opening = f.rec && f.rec.opening != null ? num(f.rec.opening) : (f.prev ? num(f.prev.counted) : 0);
  f.expected = f.opening + f.cashIn - f.exTill - f.out + f.put;
  return f;
}
function saveDay(iso, patch) {
  var rec = dayRec(iso);
  if (!rec) { rec = { id: dayId(iso), iso: iso, u: 0 }; more.days.push(rec); }
  Object.keys(patch).forEach(function (k) { rec[k] = patch[k]; });
  stamp(rec); commit('days', rec.id);
  return rec;
}
function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function rs(n) { n = Math.round(n || 0); return (n === 0 ? '00' : n.toLocaleString('en-US')) + 'rs'; }
/* The day-end message, laid out the way the cafe already sends it. */
function dayReport(iso) {
  var f = dayFigures(iso), p = iso.split('-'), d = new Date(+p[0], +p[1] - 1, +p[2]);
  var L = [BRAND.salePrefix + ' ' + ordinal(d.getDate()) + ' ' + d.toLocaleDateString('en-US', { month: 'short' }) + '-' + String(d.getFullYear()).slice(2),
    'Total Sale ' + rs(f.sales), 'Unpaid ' + rs(f.by.Unpaid), 'Credit Card ' + rs(f.by.Card), 'Cash Sale ' + rs(f.by.Cash),
    'Online Transfer ' + rs(f.by.Transfer), 'Expense ' + rs(f.exTill), 'Cookies Sale ' + rs(f.food),
    'Cash In Hand ' + rs(Math.max(0, f.by.Cash - f.exTill)), 'Yesterday Cash ' + rs(f.opening)];
  if (f.late) L.push('Old Unpaid Received ' + rs(f.late));
  if (f.out) L.push('Cash Taken Out ' + rs(f.out));
  if (f.put) L.push('Cash Put In ' + rs(f.put));
  L.push('Total Cash In Hand ' + rs(f.expected));
  if (f.rec && f.rec.counted != null) {
    var diff = num(f.rec.counted) - f.expected;
    L.push('Cash Counted ' + rs(f.rec.counted));
    if (diff) L.push((diff > 0 ? 'Over ' : 'Short ') + rs(Math.abs(diff)));
  }
  L.push('', 'Expense Report');
  f.expenses.forEach(function (e) { L.push(e.name + ' ' + rs(e.amount) + (e.till === false ? ' (not from till)' : '')); });
  if (!f.expenses.length) L.push('00rs');
  L.push('', 'Unpaids Report');
  var per = {}, others = {}, i = 0;
  orders.forEach(function (o) {
    if (o.iso !== iso || o.payment !== 'Unpaid') return;
    var a = accountOf(o);
    if (a) per[a.id] = (per[a.id] || 0) + o.total; else others[o.customer] = (others[o.customer] || 0) + o.total;
  });
  liveAccounts().forEach(function (a) { i++; L.push(i + '. ' + a.name + ' ' + rs(per[a.id])); });
  Object.keys(others).forEach(function (n) { i++; L.push(i + '. ' + n + ' ' + rs(others[n])); });
  L.push('Total Unpaid: ' + rs(f.by.Unpaid));
  return L.join('\n');
}
function closeLine(label, v, sign, sum) {
  return '<div class="close-line' + (sum ? ' sum' : '') + '"><span>' + label + '</span><b>' + (sign || '') + n0(v) + '</b></div>';
}
/* The bank's own texts, posted by the server as a 'feed' row (kind bank, one per trading day): transfers received, as the bank says. */
function bankFeed(iso) { for (var i = 0; i < more.feed.length; i++) if (more.feed[i].kind === 'bank' && more.feed[i].day === iso) return more.feed[i]; return null; }
/* The card machine's own record (13 Oct 2026): the server posts a 'feed' row (kind card, one per trading day) from the merchant
   portal: charges approved, their total, the last one's time. When it is there, nobody types the batch total at close. */
function cardFeed(iso) { for (var i = 0; i < more.feed.length; i++) if (more.feed[i].kind === 'card' && more.feed[i].day === iso) return more.feed[i]; return null; }

/* ---- Day close draft (opening / card confirm / transfer evidence) ---- */
var closeDraft = null;
function xferSum(list) {
  return sumOf(list || [], function (x) { return num(x.amount); });
}
function lockStampHtml(label, when) {
  return '<div class="close-lock"><span>' + esc(label) + '</span><b>' + esc(when || '—') + '</b></div>';
}
function dayStampNow() {
  return bizLabel().replace(/^Trading day\s+/i, '') + ' · ' + timeNow();
}
function dayPayOrders(iso, pay) {
  return orders.filter(function (o) {
    return !o.adj && o.payment === pay && (o.paidIso || o.iso) === iso;
  }).sort(function (a, b) { return a.no - b.no; });
}
function mergePayNotes(list, savedList) {
  var saved = {};
  (list || []).forEach(function (t) { saved[String(t.id)] = t; });
  (savedList || []).forEach(function (t) {
    if (!saved[String(t.id)]) saved[String(t.id)] = copy(t);
    else saved[String(t.id)] = Object.assign({}, saved[String(t.id)], t, {
      note: saved[String(t.id)].note || t.note || '',
      url: saved[String(t.id)].url || t.url || '',
      publicId: saved[String(t.id)].publicId || t.publicId || '',
      at: saved[String(t.id)].at || t.at || ''
    });
  });
  return saved;
}
function syncCardDraft(iso) {
  var d = ensureCloseDraft();
  var rec = dayRec(iso);
  var saved = mergePayNotes(d.cards, rec && rec.cards);
  d.cards = dayPayOrders(iso, 'Card').map(function (o) {
    var prev = saved[String(o.id)] || {};
    return {
      id: o.id,
      no: o.no,
      amount: o.total,
      customer: o.customer || '',
      note: prev.note || ''
    };
  });
  return d.cards;
}
function syncTransferDraft(iso) {
  var d = ensureCloseDraft();
  var rec = dayRec(iso);
  var saved = mergePayNotes(d.transfers, rec && rec.transfers);
  d.transfers = dayPayOrders(iso, 'Transfer').map(function (o) {
    var prev = saved[String(o.id)] || {};
    return {
      id: o.id,
      no: o.no,
      amount: o.total,
      customer: o.customer || '',
      url: prev.url || '',
      publicId: prev.publicId || '',
      at: prev.at || '',
      note: prev.note || ''
    };
  });
  return d.transfers;
}
function ensureCloseDraft() {
  var iso = isoNow(), rec = dayRec(iso);
  if (!closeDraft || closeDraft.iso !== iso) {
    closeDraft = {
      iso: iso,
      opening: rec && rec.opening != null ? String(num(rec.opening)) : '',
      openingAt: (rec && rec.openingAt) || '',
      cardMeezan: rec && rec.cardMeezanCounted != null ? String(num(rec.cardMeezanCounted)) : '',
      cardFaysal: rec && rec.cardFaysalCounted != null ? String(num(rec.cardFaysalCounted)) : '',
      card: rec && rec.cardCounted != null ? String(num(rec.cardCounted)) : '',
      cardAt: (rec && rec.cardAt) || '',
      cardNote: (rec && rec.cardNote) || '',
      cards: rec && Array.isArray(rec.cards) ? copy(rec.cards) : [],
      transfers: rec && Array.isArray(rec.transfers) ? copy(rec.transfers) : [],
      transfer: rec && rec.transferCounted != null ? String(num(rec.transferCounted)) : '',
      transferAt: (rec && rec.transferAt) || '',
      transferNote: (rec && rec.transferNote) || '',
      counted: rec && rec.counted != null ? String(num(rec.counted)) : '',
      uploading: null
    };
  }
  return closeDraft;
}
function syncDraftFromDom(card) {
  if (!card || !closeDraft) return;
  var o = card.querySelector('.open-in'); if (o && document.activeElement !== o) closeDraft.opening = o.value;
  var n = card.querySelector('.count-in'); if (n && document.activeElement !== n) closeDraft.counted = n.value;
  var cm = card.querySelector('.card-meezan-in'); if (cm && document.activeElement !== cm) closeDraft.cardMeezan = cm.value;
  var cf = card.querySelector('.card-faysal-in'); if (cf && document.activeElement !== cf) closeDraft.cardFaysal = cf.value;
  var ci = card.querySelector('.card-in'); if (ci && document.activeElement !== ci) closeDraft.card = ci.value;
  var tr = card.querySelector('.transfer-in'); if (tr && document.activeElement !== tr) closeDraft.transfer = tr.value;
  var cn = card.querySelector('.card-note'); if (cn && document.activeElement !== cn) closeDraft.cardNote = cn.value;
  var tn = card.querySelector('.xfer-block-note'); if (tn && document.activeElement !== tn) closeDraft.transferNote = tn.value;
  [].forEach.call(card.querySelectorAll('.card-pay-note'), function (inp) {
    var id = inp.getAttribute('data-cid');
    if (document.activeElement === inp) return;
    closeDraft.cards.forEach(function (t) {
      if (String(t.id) === String(id)) t.note = inp.value;
    });
  });
  [].forEach.call(card.querySelectorAll('.xfer-note'), function (inp) {
    var id = inp.getAttribute('data-xid');
    if (document.activeElement === inp) return;
    closeDraft.transfers.forEach(function (t) {
      if (String(t.id) === String(id)) t.note = inp.value;
    });
  });
}
function persistCloseDraft(extra) {
  var d = ensureCloseDraft();
  var meezanV = d.cardMeezan === '' ? undefined : num(d.cardMeezan);
  var faysalV = d.cardFaysal === '' ? undefined : num(d.cardFaysal);
  var cardTotal = (meezanV != null || faysalV != null)
    ? num(meezanV) + num(faysalV)
    : (d.card === '' ? undefined : num(d.card));
  var patch = {
    opening: d.opening === '' ? undefined : num(d.opening),
    openingAt: d.openingAt || undefined,
    cardMeezanCounted: meezanV,
    cardFaysalCounted: faysalV,
    cardCounted: cardTotal,
    cardAt: d.cardAt || undefined,
    cardNote: txt(d.cardNote || '', 200) || undefined,
    cards: (d.cards || []).map(function (t) {
      return { id: t.id, no: t.no, amount: num(t.amount), customer: t.customer || '', note: txt(t.note || '', 200) };
    }),
    transfers: (d.transfers || []).map(function (t) {
      return { id: t.id, no: t.no, amount: num(t.amount), customer: t.customer || '', note: txt(t.note || '', 200) };
    }),
    transferCounted: d.transfer === '' ? undefined : num(d.transfer),
    transferAt: d.transferAt || undefined,
    transferNote: txt(d.transferNote || '', 200) || undefined
  };
  if (extra) Object.keys(extra).forEach(function (k) { patch[k] = extra[k]; });
  Object.keys(patch).forEach(function (k) { if (patch[k] === undefined) delete patch[k]; });
  saveDay(isoNow(), patch);
}
function closeStatsHtml(f, rec) {
  var sales = Math.max(0, num(f.sales));
  var open = rec && rec.opening != null ? num(rec.opening) : num(f.opening);
  var card = rec && rec.cardCounted != null ? num(rec.cardCounted) : 0;
  var trans = rec && rec.transferCounted != null ? num(rec.transferCounted) : xferSum(rec && rec.transfers);
  var cash = rec && rec.counted != null ? num(rec.counted) : 0;
  var pct = function (v) { return sales ? ((v / sales) * 100).toFixed(1) + '%' : '—'; };
  var slips = (rec && rec.transfers && rec.transfers.length) || 0;
  return '<div class="close-stats">' +
    '<div class="close-stats-h">Day stats</div>' +
    '<div class="close-stats-grid">' +
      '<div><span>Opening</span><b class="num">' + n0(open) + '</b></div>' +
      '<div><span>Cash in till</span><b class="num">' + n0(cash) + '</b><small>' + pct(cash) + ' of sales</small></div>' +
      '<div><span>Card</span><b class="num">' + n0(card) + '</b><small>' + pct(card) + ' of sales' + (rec && rec.cardAt ? ' · ' + esc(rec.cardAt) : '') + '</small></div>' +
      '<div><span>Transfer</span><b class="num">' + n0(trans) + '</b><small>' + pct(trans) + ' of sales' + (slips ? ' · ' + slips + ' slip' + (slips === 1 ? '' : 's') : '') + '</small></div>' +
    '</div></div>';
}
function resizeImageFile(file, done) {
  if (!file || !/^image\//.test(file.type || '')) { done(null, 'Pick a photo of the transfer'); return; }
  var reader = new FileReader();
  reader.onerror = function () { done(null, 'Could not read that photo'); };
  reader.onload = function () {
    var img = new Image();
    img.onerror = function () { done(null, 'That file is not a usable image'); };
    img.onload = function () {
      var max = 1280, w = img.width, h = img.height;
      if (w > max || h > max) { var s = Math.min(max / w, max / h); w = Math.round(w * s); h = Math.round(h * s); }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      try { done(canvas.toDataURL('image/jpeg', 0.82)); } catch (e) { done(null, 'Could not prepare the photo'); }
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}
function uploadCloseImage(dataUrl, done) {
  fetch('/api/v1/upload/image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, folder: 'fatman/transfers' })
  }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (x) {
      if (!x.ok || !x.j || !x.j.url) throw new Error((x.j && (x.j.message || x.j.error)) || 'Upload failed');
      done(null, x.j.url, x.j.publicId || '');
    })
    .catch(function (e) { done(e.message || 'Upload failed'); });
}
function deleteCloseImage(publicIdOrUrl, done) {
  if (!publicIdOrUrl) { done(null); return; }
  fetch('/api/v1/upload/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ publicId: publicIdOrUrl, url: publicIdOrUrl })
  }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
    .then(function (x) {
      if (!x.ok) throw new Error((x.j && (x.j.message || x.j.error)) || 'Delete failed');
      done(null);
    })
    .catch(function (e) { done(e.message || 'Delete failed'); });
}
function renderCloseCard(elId) {
  var el = $(elId); if (!el) return;
  var at = document.activeElement;
  if (at && el.contains(at) && (at.tagName === 'INPUT' || at.tagName === 'TEXTAREA') && !at.classList.contains('xfer-file')) return;
  var f = dayFigures(isoNow()), rec = f.rec, closed = rec && rec.counted != null;
  var d = ensureCloseDraft();
  if (rec && rec.opening != null && d.opening === '') d.opening = String(num(rec.opening));
  if (rec && rec.openingAt && !d.openingAt) d.openingAt = rec.openingAt;
  if (rec && rec.cardMeezanCounted != null && d.cardMeezan === '') d.cardMeezan = String(num(rec.cardMeezanCounted));
  if (rec && rec.cardFaysalCounted != null && d.cardFaysal === '') d.cardFaysal = String(num(rec.cardFaysalCounted));
  if (rec && rec.cardCounted != null && d.card === '') d.card = String(num(rec.cardCounted));
  if (rec && rec.cardAt && !d.cardAt) d.cardAt = rec.cardAt;
  if (rec && rec.cardNote && !d.cardNote) d.cardNote = rec.cardNote;
  if (rec && rec.transferAt && !d.transferAt) d.transferAt = rec.transferAt;
  if (rec && rec.transferNote && !d.transferNote) d.transferNote = rec.transferNote;
  if (rec && rec.transferCounted != null && d.transfer === '') d.transfer = String(num(rec.transferCounted));
  var cf = cardFeed(isoNow()), bf = bankFeed(isoNow());
  var h = '<h2 class="h flush">Close the day</h2>';
  var blind = isRole('till') && !closed;
  if (!f.prev && !(rec && rec.opening != null)) {
    h += '<label>Cash in the drawer when today began (asked once, then carried forward every day)</label>' +
      '<div class="close-count"><input type="number" class="open-in" inputmode="numeric" min="0" placeholder="0" aria-label="Opening cash" value="' + esc(d.opening) + '">' +
      '<button type="button" class="btn secondary" data-act="set-opening">Set opening cash</button></div>';
  }
  if (blind) h += '<p class="hint">Count the drawer and type the total. The till shows what it expected once the day is closed.</p>';
  else h += closeLine('Opening cash' + (f.prev && !(rec && rec.opening != null) ? ', counted ' + esc(dayText(f.prev)) : ''), f.opening) +
    closeLine('Cash taken in today', f.cashIn, '+') + closeLine('Expenses paid from the till', f.exTill, '\u2212') +
    (f.out ? closeLine('Cash taken out', f.out, '\u2212') : '') + (f.put ? closeLine('Cash put in', f.put, '+') : '') +
    closeLine('Should be in the drawer', f.expected, '', true);

  if (CFG.CARD_AT_CLOSE) {
    h += (cf
      ? '<p class="hint">Card machine: taken from the terminal\'s own record' + (isRole('till') && !closed ? '' : ', ' + n0(cf.total) + ' in ' + num(cf.n) + ' charges' + (cf.last ? ', last at ' + esc(cf.last) : '')) + '. Nothing to type.</p>'
      : '<label>Meezan card: tonight\'s settlement slip (0 if none)</label>' +
        '<div class="close-count"><input type="number" class="card-meezan-in" inputmode="numeric" min="0" placeholder="Meezan machine total" aria-label="Meezan card batch total" value="' + (closed && rec.cardMeezanCounted != null ? num(rec.cardMeezanCounted) : esc(d.cardMeezan)) + '"></div>' +
        '<label>Faysal card: tonight\'s settlement slip (0 if none)</label>' +
        '<div class="close-count"><input type="number" class="card-faysal-in" inputmode="numeric" min="0" placeholder="Faysal machine total" aria-label="Faysal card batch total" value="' + (closed && rec.cardFaysalCounted != null ? num(rec.cardFaysalCounted) : esc(d.cardFaysal)) + '"></div>') +
      (bf
        ? '<p class="hint">Bank transfers: taken from the bank\'s own texts' + (isRole('till') && !closed ? '' : ', ' + n0(bf.total) + ' in ' + num(bf.n) + ' so far') + '. Nothing to type.</p>'
        : '<label>Bank transfers received today, from the bank app (0 if none)</label>' +
          '<div class="close-count"><input type="number" class="transfer-in" inputmode="numeric" min="0" placeholder="From the bank, not from the till" aria-label="Bank transfers received" value="' + (closed && rec.transferCounted != null ? num(rec.transferCounted) : esc(d.transfer)) + '"></div>');
  }

  h += '<label>Cash counted in the drawer</label><div class="close-count">' +
    '<input type="number" class="count-in" inputmode="numeric" min="0" placeholder="Count it, then type the total" aria-label="Cash counted" value="' + esc(d.counted) + '">' +
    '<button type="button" class="btn primary" data-act="close-day">' + (closed ? 'Close again' : 'Close the day') + '</button></div>';

  if (closed && CFG.CARD_AT_CLOSE && rec.cardCounted != null) {
    if (rec.cardMeezanCounted != null || rec.cardFaysalCounted != null) {
      h += '<p class="hint">Card machines: Meezan ' + n0(rec.cardMeezanCounted) + ' + Faysal ' + n0(rec.cardFaysalCounted) + ' = ' + n0(rec.cardCounted) + '</p>';
    }
    [['Card', rec.cardCounted, rec.cardExpected, 'the machines settled'], ['Transfer', rec.transferCounted, rec.transferExpected, /^bank/.test(rec.transferFrom || '') ? 'the bank\'s texts (' + esc(String(rec.transferFrom).replace('bank texts, ', 'up ')) + ') show' : 'the bank shows']].forEach(function (x) {
      var gap = num(x[2]) - num(x[1]);
      h += '<div class="overshort ' + (gap === 0 ? 'ok' : 'off') + '">' + x[0] + ': the till rang ' + n0(x[2]) + ', ' + x[3] + ' ' + n0(x[1]) + '. ' +
        (gap === 0 ? 'They match.' : gap > 0 ? money(gap) + ' was rung as ' + x[0].toLowerCase() + ' but did not arrive.' : money(-gap) + ' arrived that the till did not ring.') + '</div>';
    });
  }
  if (closed) {
    var diff = num(rec.counted) - f.expected;
    h += '<div class="overshort ' + (diff === 0 ? 'ok' : 'off') + '">' + (diff === 0 ? 'Closed. The drawer matches exactly.'
      : 'Closed. The drawer is ' + (diff > 0 ? 'over' : 'short') + ' by ' + money(Math.abs(diff)) + '.') + '</div>';
  }
  h += '<button type="button" class="btn secondary" data-act="copy-report" data-iso="' + esc(f.iso) + '">Copy the day-end report</button>';
  h += '<details' + (f.moves.length ? ' open' : '') + '><summary>Cash taken out or put in</summary><div class="move-form">' +
    '<input type="number" class="move-amt" inputmode="numeric" min="0" placeholder="Amount" aria-label="Amount">' +
    '<input type="text" class="move-why" maxlength="60" placeholder="Why, for example owner took cash" aria-label="Reason">' +
    '<div class="btn-row"><button type="button" class="btn sm secondary" data-act="move-add" data-dir="-1">Taken out</button>' +
    '<button type="button" class="btn sm secondary" data-act="move-add" data-dir="1">Put in</button></div></div>';
  f.moves.forEach(function (m) {
    h += '<div class="row"><div class="row-main"><h3>' + esc(m.reason || (m.amount < 0 ? 'Cash taken out' : 'Cash put in')) + '</h3><p>' + esc(m.by || '') + ' at ' + esc(shortTime(m)) + '</p></div>' +
      '<div class="row-side"><span class="row-amt">' + (m.amount < 0 ? '\u2212' : '+') + n0(Math.abs(m.amount)) + '</span>' +
      '<button type="button" class="btn sm danger" data-act="move-del" data-id="' + num(m.id) + '">Remove</button></div></div>';
  });
  el.innerHTML = h + '</details>';
}
function renderDays() {
  renderCloseCard('closeO');
  var list = more.days.filter(function (d) { return !d.deleted && d.counted != null; }).sort(function (a, b) { return a.iso < b.iso ? 1 : -1; }), h = '';
  list.forEach(function (d) {
    var p = String(d.iso).split('-'), diff = num(d.counted) - num(d.expected);
    h += '<div class="row"><div class="row-main"><h3>' + esc(niceDay(new Date(+p[0], +p[1] - 1, +p[2]))) +
      ' <span class="badge ' + (diff === 0 ? 'Cash' : 'Unpaid') + '">' + (diff === 0 ? 'matched' : (diff > 0 ? 'over ' : 'short ') + n0(Math.abs(diff))) + '</span></h3>' +
      '<p>Should have been ' + n0(d.expected) + ', counted ' + n0(d.counted) + (d.by ? ', closed by ' + esc(d.by) : '') + '</p>' +
      (d.cardCounted != null ? '<p>Card: rung ' + n0(d.cardExpected) + ', machines ' + n0(d.cardCounted) +
        (d.cardMeezanCounted != null || d.cardFaysalCounted != null ? ' (Meezan ' + n0(d.cardMeezanCounted) + ' + Faysal ' + n0(d.cardFaysalCounted) + ')' : '') +
        (num(d.cardExpected) !== num(d.cardCounted) ? ' <span class="badge Unpaid">differs by ' + n0(Math.abs(num(d.cardExpected) - num(d.cardCounted))) + '</span>' : '') +
        '. Transfer: rung ' + n0(d.transferExpected) + ', bank ' + n0(d.transferCounted) + (num(d.transferExpected) !== num(d.transferCounted) ? ' <span class="badge Unpaid">differs by ' + n0(Math.abs(num(d.transferExpected) - num(d.transferCounted))) + '</span>' : '') + '</p>' : '') + '</div>' +
      '<div class="row-side"><button type="button" class="btn sm secondary" data-act="copy-report" data-iso="' + esc(d.iso) + '">Copy report</button></div></div>';
  });
  $('dayList').innerHTML = h || none('No day has been closed on the till yet.');
}
/* ====== STOCK: what the recipes say should be on the shelf ====== */
var rcEdit = null;
function liveStock() { return more.stock.filter(function (x) { return !x.deleted; }).sort(function (a, b) { return a.id - b.id; }); }
function stockById(id) {
  for (var i = 0; i < more.stock.length; i++) if (more.stock[i].id === id && !more.stock[i].deleted) return more.stock[i];
  return null;
}
function unitCost(it) { return num(it.pack) > 0 ? num(it.cost) / num(it.pack) : 0; }
function qty(v, unit) {
  v = num(v);
  var neg = v < 0 ? '−' : '', big = unit === 'g' ? 'kg' : unit === 'ml' ? 'L' : '';
  v = Math.abs(v);
  if (big && v >= 1000) return neg + String(Math.round(v / 10) / 100) + ' ' + big;
  return neg + (Math.round(v * 10) / 10).toLocaleString() + (unit === 'pcs' ? '' : ' ' + unit);
}
/* Owner's 15 Oct count units; stock and recipes retain their stored units. */
function countMode(sid) { return (CFG.COUNT_AS || {})[sid]; }
function countText(sid, v) {
  var mode = countMode(sid), it = stockById(sid);
  if (!mode) return qty(v, it ? it.unit : '');
  v = num(v);
  if (mode.kind === 'decimal') return String(Math.round(v * 1000000) / 1000000) + ' ' + mode.label;
  var sign = v < 0 ? '−' : '', a = Math.abs(v), packs = Math.floor(a / mode.per), loose = Math.round((a - packs * mode.per) * 1000000) / 1000000;
  return sign + packs + (mode.kind === 'packs' ? (packs === 1 ? ' packet' : ' packets') : (packs === 1 ? ' pack' : ' packs')) + (loose ? ' + ' + loose + (mode.kind === 'packs' ? (loose === 1 ? ' bun' : ' buns') : (loose === 1 ? ' slice' : ' slices')) : '');
}
function countInputs(it, id, attrs) {
  var mode = countMode(it.id);
  if (!mode) return '<input type="number" inputmode="decimal" min="0" ' + (id ? 'id="' + id + '" ' : '') + attrs + ' placeholder="' + esc(it.unit) + '" aria-label="' + esc(it.name) + ' counted">';
  function input(label, loose) {
    return '<label>' + esc(label) + '<input type="number" min="0" step="' + (mode.kind === 'decimal' ? '0.01' : '1') + '" inputmode="' + (mode.kind === 'decimal' ? 'decimal' : 'numeric') + '" ' + (loose ? 'data-loose="1" max="' + (mode.per - 1) + '" ' : attrs + ' ') + (id ? 'id="' + id + (loose ? 'Loose' : '') + '" ' : '') + 'aria-label="' + esc(label) + '"></label>';
  }
  return input(mode.kind === 'decimal' ? it.name + ', ' + mode.label : mode.packs, false) + (mode.kind === 'packs+loose' ? input(mode.loose, true) : '');
}
function readCountQuantity(it, box, looseBox) {
  var mode = countMode(it.id), raw = box.value, loose = looseBox ? looseBox.value : '';
  if (raw === '' && loose === '') return { skip: true };
  var v = Number(raw), l = Number(loose);
  if (!isFinite(v) || v < 0 || !isFinite(l) || l < 0 || (mode && mode.kind !== 'decimal' && (!Number.isInteger(v) || !Number.isInteger(l)))) {
    toast('Type a non-negative ' + (mode && mode.kind !== 'decimal' ? 'whole number' : 'quantity')); return null;
  }
  if (mode && mode.kind === 'packs+loose' && l >= mode.per) {
    toast('An open pack has at most ' + (mode.per - 1) + ' slices; count full packs as sealed'); return null;
  }
  return { q: mode && mode.kind !== 'decimal' ? v * mode.per + l : v };
}
function quantityValue(it, id) {
  return readCountQuantity(it, $(id), countMode(it.id) && countMode(it.id).kind === 'packs+loose' ? $(id + 'Loose') : null);
}
function configureQuantity(it, id) {
  var box = $(id), wrapper = $(id + 'Units');
  if (wrapper) wrapper.remove();
  box.classList.toggle('hidden', !it || !!countMode(it.id));
  if (!it) return;
  if (countMode(it.id)) box.insertAdjacentHTML('afterend', '<div id="' + id + 'Units">' + countInputs(it, id + 'Entry', '') + '</div>');
  else box.placeholder = 'How much arrived, in ' + it.unit;
}
function enteredQuantity(it, id) { return quantityValue(it, countMode(it.id) ? id + 'Entry' : id); }
function recipeOf(c, n) {
  var key = c + '|' + n;
  for (var i = 0; i < more.recipes.length; i++) if (more.recipes[i].id === key && !more.recipes[i].deleted) return more.recipes[i];
  return null;
}
function recipeCost(r) {
  return sumOf(r.lines || [], function (l) { var it = stockById(num(l.s)); return it ? unitCost(it) * num(l.q) : 0; });
}
/* The stock list and recipes from the costing sheet, in config.js. Fixed ids, so devices do not make doubles. */
function seedStock() {
  if (more.stock.length || more.recipes.length) return;
  (CFG.STOCK || []).forEach(function (it) {
    more.stock.push({ id: num(it.id), name: txt(it.name, 40), unit: txt(it.unit, 10), pack: it.pack == null ? null : num(it.pack), cost: it.cost == null ? null : num(it.cost), low: 0, u: 1 });
    if (BACKEND) outbox['stock:' + num(it.id)] = 1;
  });
  Object.keys(CFG.RECIPES || {}).forEach(function (key) {
    var r = CFG.RECIPES[key];
    more.recipes.push({ id: key, sure: !!r.sure, lines: (r.lines || []).map(function (l) { return { s: num(l[0]), q: num(l[1]) }; }), u: 1 });
    if (BACKEND) outbox['recipes:' + key] = 1;
  });
  save();
}
/* 15 Oct 2026: the owner's revised list, applied once through the stock editor's synced books. */
var STOCK_REV_KEY = '__stock_rev__', stockApplying = false;
function mayApplyStock() { return role === 'owner' || (role === 'barista' && isRole('manager')); }
function stockRevision() {
  var found = null;
  more.recipes.forEach(function (r) { if (r.id === STOCK_REV_KEY) found = r; });
  return found;
}
function stockRecipe(r) {
  return { sure: !!r.sure, lines: (r.lines || []).map(function (l) { return { s: num(l[0]), q: num(l[1]) }; }) };
}
function stockDetailsDiffer(a, b) {
  return ['i', 'pl', 'w'].some(function (k) { return a[k] !== b[k]; });
}
function stockPhoto(it) {
  return it.i ? '<img class="stock-thumb" src="/img/' + esc(it.i) + '.jpg" loading="lazy" alt="">' : '';
}
function stockPackLabel(it) {
  return it.pl ? '<small class="muted" style="display:block">' + esc(it.pl) + '</small>' : '';
}
function stockRevisionDiff() {
  var rev = stockRevision(), d = { prices: 0, added: 0, recipes: 0, details: 0, warnings: [] };
  if (!mayApplyStock() || !CFG.STOCK_REV || !more.stock.length || (rev && rev.rev >= CFG.STOCK_REV)) return null;
  (CFG.STOCK || []).forEach(function (it) {
    var old = null;
    more.stock.forEach(function (r) { if (r.id === it.id) old = r; });
    if (!old) { d.added++; return; }
    if (old.pack !== it.pack || old.cost !== it.cost) d.prices++;
    if (old.name === it.name && old.unit === it.unit && old.pack === it.pack && old.cost === it.cost && stockDetailsDiffer(old, it)) d.details++;
    if (lastCount(it.id)) {
      if (old.unit !== it.unit) d.warnings.push(it.name + ': old counts stay unchanged and will be read in ' + it.unit + ' instead of ' + old.unit + '; count it again.');
      else if (old.pack !== it.pack) d.warnings.push(it.name + ': pack size changes from ' + old.pack + ' to ' + it.pack + ' ' + it.unit + '. Old counts remain in ' + it.unit + ', not packs.');
    }
  });
  Object.keys(CFG.RECIPES || {}).forEach(function (key) {
    var old = recipeOf.apply(null, key.split('|')), r = stockRecipe(CFG.RECIPES[key]);
    if (!old || !!old.sure !== r.sure || JSON.stringify(old.lines || []) !== JSON.stringify(r.lines)) d.recipes++;
  });
  return d;
}
function stockRevisionBanner() {
  var d = stockRevisionDiff(); if (!d) return '';
  var date = new Date(CFG.STOCK_REV + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return '<div class="deal-note"><p>New stock list from ' + esc(date) + ': ' + d.prices + ' prices changed, ' + d.added + ' new items, ' + d.recipes + ' recipes updated' + (d.details ? ', ' + d.details + ' details updated' : '') + '.</p>' +
    (d.warnings.length ? '<p>' + esc(d.warnings.join(' ')) + '</p>' : '') +
    '<button type="button" class="btn primary" data-act="stock-apply"' + (stockApplying ? ' disabled' : '') + '>Apply</button></div>';
}
function applyStockRevision() {
  if (!stockRevisionDiff() || stockApplying) return;
  stockApplying = true;
  function apply(ok) {
    stockApplying = false;
    if (!ok) { toast('Connect and finish syncing before applying the stock list'); return; }
    if (!stockRevisionDiff()) { refreshAll(); return; }
    (CFG.STOCK || []).forEach(function (src) {
      var it = null;
      more.stock.forEach(function (r) { if (r.id === src.id) it = r; });
      if (!it) { it = { id: src.id, low: 0, u: 0 }; more.stock.push(it); }
      if (it.name === src.name && it.unit === src.unit && it.pack === src.pack && it.cost === src.cost && !stockDetailsDiffer(it, src)) return;
      it.name = txt(src.name, 40); it.unit = txt(src.unit, 10); it.pack = src.pack; it.cost = src.cost;
      ['i', 'pl', 'w'].forEach(function (k) { if (src[k] == null) delete it[k]; else it[k] = src[k]; });
      stamp(it); commit('stock', it.id);
    });
    Object.keys(CFG.RECIPES || {}).forEach(function (key) {
      var r = null, src = stockRecipe(CFG.RECIPES[key]);
      more.recipes.forEach(function (it) { if (it.id === key) r = it; });
      if (!r) { r = { id: key, u: 0 }; more.recipes.push(r); }
      if (!r.deleted && !!r.sure === src.sure && JSON.stringify(r.lines || []) === JSON.stringify(src.lines)) return;
      r.sure = src.sure; r.lines = src.lines; r.deleted = false;
      stamp(r); commit('recipes', r.id);
    });
    var rev = stockRevision();
    if (!rev) { rev = { id: STOCK_REV_KEY, lines: [], sure: false, u: 0 }; more.recipes.push(rev); }
    rev.rev = CFG.STOCK_REV; stamp(rev); commit('recipes', rev.id);
    refreshAll(); toast('Stock list applied');
  }
  if (BACKEND) runSync(apply); else apply(true);
}

function lastCount(sid) {
  var best = null;
  more.stockmoves.forEach(function (m) { if (!m.deleted && m.kind === 'count' && m.s === sid && (!best || m.id > best.id)) best = m; });
  return best;
}
var IMPORT_ORDER_ID_MIN = 1e14;   /* pos.import_id hashes platform references into 15-digit ids. */
/* When an order drew its stock, in ms. A till-rung order's id is the moment it was rung (its u moves with every later
   change). An imported order's id is not a time and its u is when the server imported it, so read its trading day
   and HH:MM instead; with no time, the start of that trading day. */
function orderMs(o) {
  if (o.id < IMPORT_ORDER_ID_MIN) return o.id;
  var day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(o.iso || '');
  if (!day) return num(o.u);
  var y = +day[1], m = +day[2], d = +day[3], date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return num(o.u);
  var time = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?$/i.exec(String(o.time || '').trim());
  var h = DAY_CUTOFF_HOUR, min = 0;
  if (time && +time[2] < 60 && (!time[3] || +time[3] < 60) &&
      (time[4] ? +time[1] >= 1 && +time[1] <= 12 : +time[1] < 24)) {
    h = +time[1]; min = +time[2];
    if (time[4]) h = h % 12 + (time[4].toUpperCase() === 'PM' ? 12 : 0);
  }
  return new Date(y, m - 1, d + (h < DAY_CUTOFF_HOUR ? 1 : 0), h, min).getTime();
}
/* For each stock item: the last count, what arrived since, what was wasted, and what the recipes say was used. */
function stockState() {
  var by = {}, weekAgo = isoOf(new Date(bizDate().getTime() - 7 * 86400000));
  var items = liveStock();
  items.forEach(function (it) {
    var c = lastCount(it.id);
    by[it.id] = { item: it, count: c, since: c ? c.id : Infinity, inn: 0, waste: 0, used: 0, week: 0 };
  });
  liveExpenses().forEach(function (e) { var b = by[num(e.s)]; if (b && e.id > b.since) b.inn += num(e.q); });
  more.stockmoves.forEach(function (m) {
    var b = by[m.s];
    if (b && !m.deleted && m.kind === 'waste' && m.id > b.since) b.waste += Math.abs(num(m.q));
  });
  orders.forEach(function (o) {
    var ms = orderMs(o);
    o.items.forEach(function (line) {
      if (isCancel(line)) return;   /* a cancelled line on an adjustment: the original order already drew the stock */
      var rs = [recipeOf(line.c, line.n)];
      if (hasMods(line)) line.mods.forEach(function (m) { rs.push(recipeOf(CFG.ADDON_CAT || 'Add-ons', m.n)); });
      rs.forEach(function (r) {
        if (!r) return;
        (r.lines || []).forEach(function (l) {
          var b = by[num(l.s)];
          if (!b) return;
          if (ms > b.since) b.used += num(l.q) * line.q;
          if (o.iso >= weekAgo) b.week += num(l.q) * line.q;
        });
      });
    });
  });
  return items.map(function (it) {
    var b = by[it.id];
    b.onHand = b.count ? num(b.count.q) + b.inn - b.waste - b.used : null;
    b.daysLeft = b.onHand != null && b.week > 0 ? b.onHand / (b.week / 7) : null;
    b.stale = !!(b.count && b.count.iso < minDay());
    b.low = b.onHand != null && ((num(it.low) > 0 && b.onHand <= num(it.low)) || (b.daysLeft != null && b.daysLeft < 2));
    return b;
  });
}
function renderStock() {
  var st = stockState(), h = '', value = 0, low = 0, uncounted = 0, i;
  st.forEach(function (b) {
    var it = b.item;
    if (b.onHand == null) uncounted++; else value += Math.max(0, b.onHand) * unitCost(it);
    if (b.low) low++;
    h += '<div class="row' + (b.low ? ' unpaid' : '') + '">' + stockPhoto(it) + '<div class="row-main"><h3>' + esc(it.name) +
      (b.onHand == null ? ' <span class="badge Unpaid">not counted yet</span>' : b.stale ? ' <span class="badge Unpaid">count again</span>' : b.low ? ' <span class="badge Unpaid">running low</span>' : '') + '</h3>' + stockPackLabel(it) + '<p>' +
      (b.onHand == null ? 'Count it once and the till keeps track from there. A pack is ' + countText(it.id, it.pack) + ' for ' + n0(it.cost) + '.'
        : 'Counted ' + countText(it.id, b.count.q) + ' ' + esc(dayText(b.count)) + (b.inn ? ', ' + countText(it.id, b.inn) + ' arrived' : '') + ', recipes used ' + countText(it.id, b.used) +
          (b.waste ? ', ' + countText(it.id, b.waste) + ' wasted' : '') +
          (b.daysLeft != null ? '. About ' + (b.daysLeft < 1 ? 'less than a day' : Math.floor(b.daysLeft) + (Math.floor(b.daysLeft) === 1 ? ' day' : ' days')) + ' left at this week\'s pace.' : '.')) + '</p></div>' +
      '<div class="row-side"><span class="row-amt">' + (b.onHand == null ? '—' : countText(it.id, b.onHand)) + '</span>' +
      '<button type="button" class="btn sm secondary" data-act="stock-edit" data-id="' + num(it.id) + '">Edit</button></div></div>';
  });
  $('stockList').innerHTML = stockRevisionBanner() + (h || none('No stock items yet. Add one above.'));
  setNum('stockValue', value);
  $('stockNote').textContent = !st.length ? '' : uncounted === st.length ? 'Nothing is counted yet. Tap Count the stock to start.'
    : (low ? low + (low === 1 ? ' item is' : ' items are') + ' running low. ' : 'Nothing is running low. ') + (uncounted ? uncounted + ' not counted yet.' : '');
  $('oTabLow').textContent = low; $('oTabLow').classList.toggle('hidden', !low);

  var checks = more.stockmoves.filter(function (m) { return !m.deleted && m.kind === 'count' && m.exp != null; }).sort(function (a, b) { return b.id - a.id; }).slice(0, 30);
  h = '';
  checks.forEach(function (m) {
    var it = stockById(m.s); if (!it) return;
    var gap = num(m.q) - num(m.exp), worth = Math.abs(gap) * unitCost(it), small = Math.abs(gap) <= Math.max(num(m.exp) * 0.03, 0.5);
    h += '<div class="row' + (small ? '' : ' void') + '"><div class="row-main"><h3>' + esc(it.name) + ' <span class="badge ' + (small ? 'ok' : 'Unpaid') + '">' +
      (gap === 0 ? 'matches' : (gap < 0 ? 'short ' : 'over ') + countText(it.id, Math.abs(gap))) + '</span></h3>' +
      '<p>Should have been ' + countText(it.id, m.exp) + ', counted ' + countText(it.id, m.q) + ' ' + esc(dayText(m)) + (m.by ? ' by ' + esc(m.by) : '') +
      (small && gap !== 0 ? '. Within 3%, which is normal for weighing.' : '') + '</p></div>' +
      '<div class="row-side"><span class="row-amt">' + (gap === 0 ? '' : (gap < 0 ? '\u2212' : '+') + n0(worth)) + '</span></div></div>';
  });
  $('stockChecks').innerHTML = h || none('No checks yet. The first count sets the starting point; the second count is the first check.');

  var have = 0, off = 0, menu = 0;
  h = '';
  for (i = 0; i < MENU.length; i++) {
    var m = MENU[i];
    if (m.custom) continue;
    menu++;
    var r = recipeOf(m.c, m.n), key = esc(m.c + '|' + m.n);
    if (!r) {
      h += '<div class="row"><div class="row-main"><h3>' + esc(label(m)) + ' <span class="badge Unpaid">no recipe yet</span></h3><p>Sales of this ' + esc(BRAND.thing) + ' do not move stock until it has one. The till uses ' + n0(m.k) + ' as its cost.</p></div>' +
        '<div class="row-side"><button type="button" class="btn sm secondary" data-act="rc-ask" data-key="' + key + '">Add recipe</button></div></div>';
      continue;
    }
    have++;
    var cost = recipeCost(r), differs = m.k > 0 && Math.abs(cost - m.k) / m.k > 0.1;
    if (differs) off++;
    h += '<div class="row"><div class="row-main"><h3>' + esc(label(m)) + (r.sure ? '' : ' <span class="badge Unpaid">check this recipe</span>') + '</h3><p>' +
      esc((r.lines || []).map(function (l) { var it = stockById(num(l.s)); return it ? countText(it.id, l.q) + ' ' + it.name.toLowerCase() : ''; }).filter(Boolean).join(', ')) + '</p>' +
      (differs ? '<p class="neg-note">The till uses ' + n0(m.k) + ' as this ' + esc(BRAND.thing) + '\'s cost. The recipe comes to ' + n0(cost) + '.</p>' : '') + '</div>' +
      '<div class="row-side"><span class="row-amt">' + n0(cost) + '<small>sells for ' + n0(m.p) + '</small></span>' +
      '<button type="button" class="btn sm secondary" data-act="rc-ask" data-key="' + key + '">Edit</button></div></div>';
  }
  $('recipeList').innerHTML = h;
  $('recipeNote').textContent = have + ' of ' + menu + ' ' + BRAND.things + ' have a recipe.' + (off ? ' For ' + off + ' of them the recipe cost is more than 10% away from the cost the till uses for profit.' : '');
}
function askCount() {
  var st = stockState();
  if (!st.length) { toast('Add a stock item first'); return; }
  openModal('<h2 id="modalTitle">Count the stock</h2><p>Weigh or count what is on the shelf now. Leave a box empty to skip that item.</p>' +
    '<div class="count-list" id="countList">' + st.map(function (b) {
      var it = b.item;
      if (!countMode(it.id)) return '<label><span>' + stockPhoto(it) + esc(it.name) + stockPackLabel(it) + '<small>in ' + esc(it.unit) + (b.onHand != null ? ', should be about ' + qty(b.onHand, it.unit) : ', first count') + '</small></span>' +
        countInputs(it, '', 'data-id="' + num(it.id) + '" data-exp="' + (b.onHand == null ? '' : Math.round(b.onHand * 10) / 10) + '"') + '</label>';
      return '<div><span>' + stockPhoto(it) + esc(it.name) + stockPackLabel(it) + '<small>' + (b.onHand != null ? 'should be about ' + countText(it.id, b.onHand) : 'first count') + '</small></span>' +
        countInputs(it, '', 'data-id="' + num(it.id) + '" data-exp="' + (b.onHand == null ? '' : b.onHand) + '"') + '</div>';
    }).join('') + '</div>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Cancel</button>' +
    '<button type="button" class="btn primary" data-act="count-save">Save the count</button></div>');
}
function saveCount() {
  var n = 0, worst = null;
  var entries = [], invalid = false;
  [].forEach.call($('countList').querySelectorAll('input[data-id]'), function (box) {
    var it = stockById(+box.getAttribute('data-id'));
    if (!it) return;
    var result = readCountQuantity(it, box, countMode(it.id) && countMode(it.id).kind === 'packs+loose' ? box.parentNode.parentNode.querySelector('[data-loose]') : null);
    if (!result) invalid = true;
    else if (!result.skip) entries.push({ box: box, it: it, q: result.q });
  });
  if (invalid) return;
  entries.forEach(function (entry) {
    var box = entry.box, it = entry.it, v = entry.q;
    var m = { id: newId(), iso: isoNow(), s: it.id, q: v, kind: 'count', by: whoName(), time: timeNow(), u: nowMs() };
    if (box.getAttribute('data-exp') !== '') {
      m.exp = num(box.getAttribute('data-exp'));
      var worth = Math.abs(v - m.exp) * unitCost(it);
      if (!worst || worth > worst.worth) worst = { worth: worth, it: it, gap: v - m.exp };
    }
    more.stockmoves.push(m);
    if (BACKEND) outbox['stockmoves:' + m.id] = 1;
    n++;
  });
  closeModal();
  if (!n) { toast('Nothing was typed in'); return; }
  commit(); refreshAll();
  toast(n + (n === 1 ? ' item' : ' items') + ' counted.' + (worst && worst.worth >= 1 ? ' Biggest gap: ' + worst.it.name + ' ' + (worst.gap < 0 ? 'short ' : 'over ') + countText(worst.it.id, Math.abs(worst.gap)) + '.' : ''));
}
function stockOptions(sel) {
  return liveStock().map(function (it) { return '<option value="' + num(it.id) + '"' + (it.id === sel ? ' selected' : '') + '>' + esc(it.name) + ' (' + esc(it.unit) + ')</option>'; }).join('');
}
function askWaste() {
  if (!liveStock().length) { toast('Add a stock item first'); return; }
  openModal('<h2 id="modalTitle">Record waste</h2><p>Spilled, expired, or made wrong and thrown away.</p>' +
    '<label for="wsItem">What</label><select id="wsItem">' + stockOptions(0) + '</select>' +
    '<label for="wsQty">How much, in its unit</label><input type="number" id="wsQty" inputmode="decimal" min="0" placeholder="0">' +
    '<label for="wsWhy">Why</label><input type="text" id="wsWhy" maxlength="60" placeholder="Dropped a carton, past its date">' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Cancel</button>' +
    '<button type="button" class="btn primary" data-act="waste-save">Record waste</button></div>');
  var select = $('wsItem');
  select.addEventListener('change', function () { configureQuantity(stockById(num(select.value)), 'wsQty'); });
  configureQuantity(stockById(num(select.value)), 'wsQty');
}
function askStockItem(id) {
  var it = stockById(id) || { id: 0, name: '', unit: 'g', pack: '', cost: '', low: '' };
  openModal('<h2 id="modalTitle">' + (it.id ? 'Edit ' + esc(it.name) : 'Add a stock item') + '</h2>' +
    '<label for="siName">Name</label><input type="text" id="siName" maxlength="40" value="' + esc(it.name) + '" placeholder="Matcha powder">' +
    '<label for="siUnit">Measured in</label><select id="siUnit">' + [['g', 'grams'], ['kg', 'kilograms'], ['ml', 'millilitres'], ['pcs', 'pieces'], ['bottle', 'bottles']].map(function (u) {
      return '<option value="' + u[0] + '"' + (it.unit === u[0] ? ' selected' : '') + '>' + u[1] + '</option>'; }).join('') + '</select>' +
    '<div class="split"><div><label for="siPack">Pack size</label><input type="number" id="siPack" inputmode="decimal" min="0" value="' + esc(it.pack) + '" placeholder="1000"></div>' +
    '<div><label for="siCost">A pack costs, PKR</label><input type="number" id="siCost" inputmode="decimal" min="0" value="' + esc(it.cost) + '" placeholder="0"></div></div>' +
    '<label for="siPL">Pack label</label><input type="text" id="siPL" maxlength="30" value="' + esc(it.pl || '') + '">' +
    '<label for="siW">One piece weighs, grams</label><input type="number" id="siW" min="0" step="any" inputmode="decimal" value="' + (num(it.w) || '') + '">' +
    '<label for="siLow">Warn me when it falls to (optional)</label><input type="number" id="siLow" inputmode="decimal" min="0" value="' + (num(it.low) || '') + '" placeholder="0">' +
    '<div class="modal-actions">' + (it.id ? '<button type="button" class="btn danger" data-act="stock-del" data-id="' + num(it.id) + '">Remove</button>' : '<button type="button" class="btn secondary" data-act="close-modal">Cancel</button>') +
    '<button type="button" class="btn primary" data-act="stock-save" data-id="' + num(it.id) + '">Save</button></div>');
}
function saveStockItem(id) {
  var name = $('siName').value.trim(), pack = parseFloat($('siPack').value), cost = parseFloat($('siCost').value);
  if (!name || !(pack > 0) || isNaN(cost) || cost < 0) { toast('Fill in the name, the pack size and what a pack costs'); return; }
  var weight = $('siW').value.trim();
  if (weight && (!isFinite(Number(weight)) || !(Number(weight) > 0))) { toast('Enter a positive piece weight or leave it blank'); return; }
  var it = stockById(id);
  if (!it) { it = { id: newId(), u: 0 }; more.stock.push(it); }
  it.name = txt(name, 40); it.unit = $('siUnit').value; it.pack = pack; it.cost = cost; it.low = num($('siLow').value);
  it.pl = txt($('siPL').value, 30);
  if (weight) it.w = Number(weight); else delete it.w;
  stamp(it); commit('stock', it.id); closeModal(); refreshAll(); toast(it.name + ' saved');
}
function drawRecipe() {
  openModal('<h2 id="modalTitle">Recipe: ' + esc(rcEdit.key.split('|').reverse().join(', ')) + '</h2><p>What goes into one glass.</p><div id="rcLines">' +
    rcEdit.lines.map(function (l, i) {
      return '<div class="rc-line"><select aria-label="Ingredient">' + stockOptions(num(l.s)) + '</select>' +
        '<input type="number" inputmode="decimal" min="0" value="' + (num(l.q) || '') + '" placeholder="amount" aria-label="Amount in one glass">' +
        '<button type="button" class="btn sm danger" data-act="rc-del" data-i="' + i + '">Remove</button></div>';
    }).join('') + '</div><button type="button" class="btn secondary" data-act="rc-add">Add an ingredient</button>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Cancel</button>' +
    '<button type="button" class="btn primary" data-act="rc-save">Save recipe</button></div>');
}
function readRecipe() {
  rcEdit.lines = [].map.call($('rcLines').querySelectorAll('.rc-line'), function (row) {
    return { s: num(row.querySelector('select').value), q: num(row.querySelector('input').value) };
  });
}
function askRecipe(key) {
  if (!liveStock().length) { toast('Add a stock item first'); return; }
  var r = null;
  more.recipes.forEach(function (x) { if (x.id === key && !x.deleted) r = x; });
  rcEdit = { key: key, lines: r ? copy(r.lines || []) : [{ s: liveStock()[0].id, q: 0 }] };
  drawRecipe();
}
function saveRecipe() {
  readRecipe();
  var lines = rcEdit.lines.filter(function (l) { return l.q > 0 && stockById(l.s); }), r = null;
  more.recipes.forEach(function (x) { if (x.id === rcEdit.key) r = x; });
  if (!r) { r = { id: rcEdit.key, u: 0 }; more.recipes.push(r); }
  r.lines = lines; r.sure = true; r.deleted = !lines.length;
  stamp(r); commit('recipes', r.id); closeModal(); refreshAll();
  toast(lines.length ? 'Recipe saved' : 'Recipe removed');
}

function showOTab(t) {
  ui.otab = t;
  $('ownerScreen').setAttribute('data-otab', t);
  [].forEach.call($('oTabs').querySelectorAll('button'), function (b) { b.classList.toggle('on', b.getAttribute('data-otab') === t); });
  if (t === 'pass') renderPass(); if (t === 'settings') { renderStaff(); loadLog(); }
  ['today', 'pass', 'accounts', 'days', 'stock', 'shelf', 'settings'].forEach(function (k) {
    var el = $('o' + k.charAt(0).toUpperCase() + k.slice(1)); if (el) el.classList.toggle('hidden', k !== t);
  });
  window.scrollTo(0, 0);
}

function openSheet() { $('orderPanel').classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeSheet() {
  $('orderPanel').classList.remove('open');
  if ($('chgPanel')) $('chgPanel').classList.remove('open');
  document.body.style.overflow = '';
}

function openCustom() {
  customWarned = false;
  openModal('<h2 id="modalTitle">Something not on the menu</h2>' +
    '<p>Saved for next time once used, so you only type it in once.</p>' +
    '<label for="cusName">Item name</label><input type="text" id="cusName" placeholder="Cookie, brownie" maxlength="40" autocomplete="off">' +
    '<div class="split"><div><label for="cusPrice">Selling price</label><input type="number" id="cusPrice" inputmode="numeric" min="0" placeholder="0"></div>' +
    '<div><label for="cusCost">Cost price</label><input type="number" id="cusCost" inputmode="numeric" min="0" placeholder="0"></div></div>' +
    '<div id="cusWarn" class="banner hidden"></div>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Cancel</button>' +
    '<button type="button" class="btn primary" data-act="save-custom">Add to order</button></div>');
}
function addCustom() {
  var n = $('cusName').value.trim(), pr = parseFloat($('cusPrice').value), ct = parseFloat($('cusCost').value), w = $('cusWarn');
  function warn(t) { w.textContent = t; w.classList.remove('hidden'); }
  if (!n) return warn('Give the item a name.');
  if (isNaN(pr) || pr < 0) return warn('Enter a selling price.');
  if (isNaN(ct) || ct < 0) return warn('Enter a cost price.');
  if (ct > pr && !customWarned) { customWarned = true; return warn('The cost is higher than the selling price. Tap Add to order again to add it anyway.'); }
  var m = null;
  MENU.forEach(function (x) { if (x.c === 'Food' && x.n.toLowerCase() === n.toLowerCase()) m = x; });
  if (m) { m.p = pr; m.k = ct; stamp(m); }
  else { m = { c: 'Food', n: n, p: pr, k: ct, custom: true, u: nowMs(), i: 'food' }; MENU.push(m); }
  syncCustomList();
  var found = null;
  cart.forEach(function (c) { if (c.c === 'Food' && c.n === m.n) found = c; });
  if (found) { found.q++; found.p = pr; found.k = ct; } else cart.push({ n: m.n, c: 'Food', p: pr, k: ct, q: 1 });
  commit('customItems', m.n.toLowerCase());
  closeModal(); renderCats(); renderTiles(); renderCart(true);
  toast(m.n + ' added');
}

/* ====== RECEIPTS ====== */
function doodles() {
  var defs = '<defs>' +
  '<g id="d1"><path d="M13 17h18a3 3 0 0 1 3 3v3H10v-3a3 3 0 0 1 3-3z"/><path d="M19 13h6v4h-6z"/><path d="M12 23h20l-3.5 32a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8z"/><path d="M13.5 34h17"/></g>' +
  '<g id="d2"><path d="M9 16h20v14a7 7 0 0 1-7 7h-6a7 7 0 0 1-7-7z"/><path d="M29 20h4a5 5 0 0 1 0 10h-4"/><path d="M16 11q3-3 0-6"/><path d="M23 11q3-3 0-6"/></g>' +
  '<g id="d3"><path d="M9 18h26l-1 4H10z"/><path d="M11 22h22l-4 33a2 2 0 0 1-2 1.8h-9a2 2 0 0 1-2-1.8z"/><path d="M27 18L33 4"/><path d="M15 29h7v7h-7z"/></g>' +
  '<g id="d4"><ellipse cx="20" cy="20" rx="9" ry="12.5" transform="rotate(-28 20 20)"/><path d="M20 8.5C16.5 14 16.5 26 20 31.5" transform="rotate(-28 20 20)"/></g>' +
  '<g id="d5"><path d="M20 38v-13"/><path d="M15 21h10v4H15z"/><path d="M20 21C9 16 8 9 16 3"/><path d="M20 21V3"/><path d="M20 21c11-5 12-12 4-18"/></g>' +
  '<g id="d6"><path d="M10 12h14l6 7v12H16l-6-7z"/><path d="M10 12l6 7h14M16 19v12"/></g>' +
  '<g id="d7"><path d="M15 12h10v4l4 6v18a2 2 0 0 1-2 2H13a2 2 0 0 1-2-2V22l4-6z"/><path d="M11 26h18"/></g>' +
  '<g id="d8"><ellipse cx="20" cy="12" rx="6" ry="8.5"/><path d="M20 21v17"/></g></defs>';
  var pos = [[-2,-2,'d2'],[24,4,'d4'],[44,-4,'d3'],[70,0,'d5'],[94,4,'d6'],[116,-4,'d1'],[142,1,'d8'],[162,6,'d4'],[180,-2,'d7'],[206,-4,'d3'],[232,4,'d6'],[252,-1,'d2'],[276,5,'d4'],
  [-4,34,'d3'],[22,44,'d4'],[46,38,'d2'],[74,44,'d6'],[96,36,'d1'],[122,45,'d4'],[142,38,'d5'],[168,36,'d7'],[196,40,'d8'],[216,36,'d3'],[250,40,'d6'],[272,34,'d1'],
  [-4,62,'d5'],[20,70,'d2'],[46,72,'d4'],[64,64,'d3'],[92,70,'d6'],[114,62,'d7'],[142,72,'d4'],[160,62,'d1'],[188,66,'d8'],[208,64,'d2'],[234,72,'d4'],[272,62,'d7'],
  [-2,92,'d1'],[26,98,'d6'],[48,100,'d4'],[66,94,'d2'],[92,96,'d8'],[110,92,'d3'],[136,100,'d4'],[154,94,'d5'],[178,92,'d7'],[204,98,'d6'],[226,92,'d1'],[252,100,'d4'],[270,92,'d3']];
  var uses = '';
  for (var i = 0; i < pos.length; i++) {
    var x = pos[i][0], y = pos[i][1];
    // leave the centre clear - the tagline prints there
    if (y > 28 && y < 86 && x > 52 && x < 248) continue;
    uses += '<use href="#' + pos[i][2] + '" transform="translate(' + x + ',' + y + ') scale(0.5)"/>';
  }
  return '<svg viewBox="0 0 300 132" style="width:100%;display:block">' + defs +
    '<g fill="none" stroke="#000" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">' + uses + '</g></svg>';
}
var printQueue = [];
var printing = false;
function sendToPrinter(html) {
  printQueue.push(html);
  if (!printing) runPrintQueue();
}
function runPrintQueue() {
  if (!printQueue.length) { printing = false; return; }
  printing = true;
  $('receipt').innerHTML = printQueue.shift();
  var finished = false;
  function done() {
    if (finished) return;
    finished = true;
    window.removeEventListener('afterprint', done);
    clearTimeout(fallback);
    setTimeout(runPrintQueue, 250);
  }
  window.addEventListener('afterprint', done);
  var fallback = setTimeout(done, 12000);
  setTimeout(function () { window.print(); }, 150);
}
/* The kitchen's copy: what to make, nothing about money. Prints as its own job after the customer slip. */
function kitchenHtml(o) {
  var lines = '';
  o.items.forEach(function (it) {
    lines += '<div class="l kl"><span>' + (isCancel(it) ? 'CANCEL ' : '') + esc(label(it)) + '</span><span>x' + it.q + '</span></div>';
    if (hasMods(it)) it.mods.forEach(function (m) { lines += '<div class="l kl" style="padding-left:10px;font-weight:700">+ ' + esc(m.n).toUpperCase() + '</div>'; });
    if (it.note) lines += '<div class="l kl" style="padding-left:10px;font-weight:700">&raquo; ' + esc(it.note) + '</div>';
  });
  if (o.note) lines += '<div class="rule"></div><div class="l kl" style="font-weight:700">NOTE: ' + esc(o.note) + '</div>';
  return '<div class="rc kitchen' + (paper80 ? '' : ' narrow') + '">' +
    '<div class="sub">' + (o.remake ? 'REMAKE OF #' + pad(o.remake.no) + ' &middot; ' + esc(String(o.remake.why).toUpperCase()) : o.adj ? 'CHANGE TO #' + pad(o.adj.no) + ' &middot; ' + esc(String(o.adj.why).toUpperCase()) : 'KITCHEN') + '</div>' +
    '<div style="text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:46px;font-weight:700;line-height:1.1">' + pad(o.no) + '</div>' +
    '<div class="l"><span>' + esc(o.time) + '</span><span>' + esc(String(channelLabel(o.channel)).toUpperCase()) + '</span></div>' +
    (o.svc ? '<div style="text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:20px;font-weight:800;letter-spacing:2px;margin:4px 0">' + esc(String(o.svc).toUpperCase()) + (o.table ? ' &middot; TABLE ' + num(o.table) : '') + '</div>' : '') +
    (o.customer && o.customer !== 'Walk-in' ? '<div class="l"><span>FOR</span><span>' + esc(o.customer) + '</span></div>' : '') +
    (o.waiter ? '<div class="l"><span>WAITER</span><span>' + esc(o.waiter) + '</span></div>' : '') +
    '<div class="rule"></div>' + lines + '<div class="rule"></div>' +
    '<div class="l"><span>ITEMS</span><span>' + itemCount(o) + '</span></div>' +
    '</div>';
}
function printSlip(o, withKitchen) {
  sendToPrinter(slipHtml(o));
  if (withKitchen && KITCHEN_SLIP) sendToPrinter(kitchenHtml(o));
}
function slipHtml(o) {
  var lines = '';
  o.items.forEach(function (it) {
    lines += '<div class="l"><span>' + esc(label(it)) + (it.q > 1 ? ' x' + it.q : '') + '</span><span>' + it.q + '</span></div>';
    if (hasMods(it)) it.mods.forEach(function (m) { lines += '<div class="l" style="padding-left:10px;font-size:10px">+ ' + esc(m.n) + '</div>'; });
    if (it.note) lines += '<div class="l" style="padding-left:10px;font-size:10px">' + esc(it.note) + '</div>';
  });
  if (o.note) lines += '<div class="l" style="font-size:10px">Note: ' + esc(o.note) + '</div>';
  return ('<div class="rc' + (paper80 ? '' : ' narrow') + '">' +
    '<div class="brand">' + esc(BRAND.wordmark) + '</div>' +
    '<div class="sub">ORDER SLIP &middot; NOT A RECEIPT</div>' +
    '<div class="rule"></div>' +
    '<div style="text-align:center;margin:6px 0 2px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:11px;letter-spacing:2px">ORDER NUMBER</div>' +
    '<div style="text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:46px;font-weight:700;line-height:1.1">' + pad(o.no) + '</div>' +
    '<div class="rule"></div>' + lines + '<div class="rule"></div>' +
    '<div class="tot"><span>TO PAY</span><span>' + n0(o.total) + ' PKR</span></div>' +
    '<div class="l" style="margin-top:5px"><span>TIME</span><span>' + esc(o.time) + '</span></div>' +
    (o.customer && o.customer !== 'Walk-in' ? '<div class="l"><span>NAME</span><span>' + esc(o.customer) + '</span></div>' : '') +
    (o.svc ? '<div class="l"><span>SERVICE</span><span>' + esc(String(o.svc).toUpperCase()) + '</span></div>' : '') +
    (o.waiter ? '<div class="l"><span>WAITER</span><span>' + esc(o.waiter) + '</span></div>' : '') +
    '<div class="rule"></div>' +
    '<div style="text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;font-weight:600;letter-spacing:1px;margin:8px 0 4px">PAYMENT PENDING</div>' +
    '<div style="text-align:center;font-size:10px">Please settle at the counter.<br>A full receipt follows on payment.</div>' +
    '<div style="text-align:center;font-family:Georgia,serif;font-size:15px;margin-top:10px">' + esc(BRAND.sign) + '</div>' +
    '</div>');
}
function printReceipt(o, withKitchen) {
  sendToPrinter(receiptHtml(o));
  if (withKitchen && KITCHEN_SLIP) sendToPrinter(kitchenHtml(o));
}
function printCustomerBill(o, method) {
  sendToPrinter(customerBillHtml(o, method || o.payment));
}
function customerBillHtml(o, method) {
  var unpaid = o.payment === 'Unpaid';
  var pay = method || (unpaid ? 'Cash' : o.payment);
  var disc = num(o.discount);
  if (unpaid && num(o.discountPct)) {
    var sale0 = 0; o.items.forEach(function (it) { sale0 += it.p * it.q; });
    disc = Math.round(sale0 * Math.min(100, Math.max(0, num(o.discountPct))) / 100);
  }
  var taxInfo = null, total = num(o.total), sub = num(o.sub);
  if (TAX.enabled) {
    if (unpaid) {
      taxInfo = TAX.compute(o.items, disc, pay);
      total = taxInfo.total; sub = taxInfo.sale;
    } else if (o.tax) {
      taxInfo = { rate: o.tax.rate, tax: o.tax.tax, sale: o.tax.sale != null ? o.tax.sale : sub };
    }
  }
  var taxRate = taxInfo ? Number(taxInfo.rate) : 0;
  function lineTax(amt) {
    if (!taxRate) return 0;
    var t = Math.round((Math.abs(amt) * taxRate / 100 + 0.00000001) * 100) / 100;
    return amt < 0 ? -t : t;
  }
  var lines = '';
  o.items.forEach(function (it) {
    var base = hasMods(it) ? it.bp : it.p;
    var lineAmt = it.p * it.q;
    lines += '<div class="l"><span>' + esc(label(it)) + '</span></div>';
    lines += '<div class="l" style="padding-left:10px;font-size:10px"><span>' + it.q + ' x ' + n0(base) + '</span><span>' + n0(base * it.q) + '</span></div>';
    if (hasMods(it)) it.mods.forEach(function (m) {
      lines += '<div class="l" style="padding-left:10px;font-size:10px"><span>+ ' + esc(m.n) + ' · ' + it.q + ' x ' + n0(m.p) + '</span><span>' + n0(m.p * it.q) + '</span></div>';
    });
    if (it.note) lines += '<div class="l" style="padding-left:10px;font-size:10px">' + esc(it.note) + '</div>';
    if (TAX.enabled && TAX.showLine && taxInfo) {
      lines += '<div class="l" style="padding-left:10px;font-size:10px"><span>Tax ' + esc(taxInfo.rate) + '%</span><span>' + lineTax(lineAmt).toFixed(2) + '</span></div>';
    }
  });
  if (o.note) lines += '<div class="l" style="font-size:10px">Note: ' + esc(o.note) + '</div>';
  if (TAX.enabled) lines += '<div class="l"><span>SUBTOTAL</span><span>' + n0(sub) + '</span></div>';
  if (disc > 0 || (TAX.enabled && disc < 0)) lines += '<div class="l"><span>' + (TAX.enabled ? 'DISCOUNT' + (o.deal ? ' · ' + esc(dealText(o)) : '') : (o.deal ? esc(dealText(o)) : 'Discount')) + (o.discountPct ? ' (' + o.discountPct + '%)' : '') + '</span><span>' + (disc < 0 ? '+' : '-') + n0(Math.abs(disc)) + '</span></div>';
  if (TAX.enabled && TAX.showLine && taxInfo) lines += '<div class="l"><span>TAX ' + esc(taxInfo.rate) + '%</span><span>' + Number(taxInfo.tax).toFixed(2) + '</span></div>';
  return ('<div class="rc' + (paper80 ? '' : ' narrow') + '">' +
    '<div class="brand">' + esc(BRAND.wordmark) + '</div><div class="sub">' + esc(BRAND.tagline) + '</div>' +
    '<div class="rule"></div>' +
    '<div class="l"><span>ORDER</span><span>#' + pad(o.no) + '</span></div>' +
    '<div class="l"><span>DATE</span><span>' + esc(o.date) + '</span></div>' +
    '<div class="l"><span>TIME</span><span>' + esc(o.time) + '</span></div>' +
    (o.channel !== 'Counter' ? '<div class="l"><span>CHANNEL</span><span>' + esc(String(o.channel).toUpperCase()) + '</span></div>' : '') +
    (o.svc ? '<div class="l"><span>SERVICE</span><span>' + esc(String(o.svc).toUpperCase()) + '</span></div>' : '') +
    (o.table ? '<div class="l"><span>TABLE</span><span>' + num(o.table) + '</span></div>' : '') +
    (o.customer && o.customer !== 'Walk-in' ? '<div class="l"><span>NAME</span><span>' + esc(o.customer) + '</span></div>' : '') +
    '<div class="rule"></div>' + lines + '<div class="rule"></div>' +
    '<div class="tot"><span>' + (unpaid ? 'TO PAY' : 'TOTAL') + '</span><span>' + n0(total) + ' PKR</span></div>' +
    (unpaid
      ? '<div class="l" style="margin-top:5px"><span>PAY BY</span><span>' + esc(String(pay).toUpperCase()) + '</span></div>' +
        '<div style="text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12px;font-weight:600;letter-spacing:1px;margin:8px 0 4px">PAYMENT PENDING</div>' +
        '<div style="text-align:center;font-size:10px">Please settle at the counter.</div>'
      : '<div class="l" style="margin-top:5px"><span>PAID BY</span><span>' + esc(String(o.payment).toUpperCase()) + '</span></div>') +
    (o.visit && LOYALTY ? '<div class="l" style="font-size:10px"><span>VISIT ' + o.visit + '</span><span>' + (o.reward ? 'free ' + esc(o.reward) + ' today' : (LOYALTY.every - o.visit % LOYALTY.every) + ' more to a free ' + esc(LOYALTY.item)) + '</span></div>' : '') +
    (o.waiter ? '<div class="l"><span>SERVED BY</span><span>' + esc(o.waiter) + '</span></div>' : '') +
    '<div class="foot">' + doodles() +
      '<div class="footxt"><div class="tagline">' + esc(BRAND.sign) + '</div><div class="handle">' + esc(CFG.HANDLE || '') + '</div></div>' +
    '</div></div>');
}
function receiptHtml(o) {
  return customerBillHtml(o, o.payment);
}
function findOrder(id) { for (var i = 0; i < orders.length; i++) if (orders[i].id === id) return orders[i]; return null; }
function reprint(id) { var o = findOrder(id); if (o) printReceipt(o); }
function payMethodDue(o) {
  if (!o) return 0;
  if (o.payment !== 'Unpaid') return num(o.total);
  var sale = 0; o.items.forEach(function (it) { sale += it.p * it.q; });
  var disc = num(o.discount);
  if (num(o.discountPct)) disc = Math.round(sale * Math.min(100, Math.max(0, num(o.discountPct))) / 100);
  return TAX.enabled ? TAX.compute(o.items, disc, o.deal ? 'Card' : 'Cash').total : Math.max(0, sale - disc);
}
function askPayMethod(id, mode) {
  var o = findOrder(id); if (!o) return;
  var unpaid = o.payment === 'Unpaid';
  if (mode !== 'bill' && mode !== 'pay' && mode !== 'reprint') mode = unpaid ? 'pay' : 'reprint';
  if (mode === 'pay') paidAsk = { id: id, pct: Math.min(100, Math.max(0, num(o.discountPct))) };
  var due = payMethodDue(o);
  var who = (o.customer && o.customer !== 'Walk-in') ? esc(o.customer) : 'Walk-in';
  var kick = mode === 'pay' ? 'Mark as paid' : 'Customer bill';
  var head = mode === 'pay' ? 'How was this paid?' : 'Print customer bill as';
  var hint = mode === 'pay'
    ? 'Tap a method, then choose any discount before the receipt prints'
    : (unpaid
      ? 'Tap a method to print the customer bill. Order stays unpaid.'
      : 'Tap a method to reprint the customer bill');
  openModal(
    '<div class="paid-sheet">' +
      '<div class="paid-hero">' +
        '<p class="paid-kicker">' + kick + '</p>' +
        '<h2 id="modalTitle" class="paid-title">Order <span class="num">#' + pad(o.no) + '</span></h2>' +
        '<p class="paid-meta">' + who + (o.table ? ' · Table ' + num(o.table) : '') + (o.svc ? ' · ' + esc(o.svc) : '') + '</p>' +
        '<div class="paid-sub"><span>Amount</span><b class="num">' + n0(due) + '</b></div>' +
      '</div>' +
      '<div class="paid-block">' +
        '<div class="paid-block-h">' + head + '</div>' +
        '<p class="paid-hint">' + hint + '</p>' +
        '<div class="pay-pick">' + ['Cash', 'Card', 'Transfer'].map(function (m) {
          return '<button type="button" class="pay-opt pay-opt-solo' + (mode === 'reprint' && o.payment === m ? ' on' : '') + '" data-act="pay-method" data-mode="' + mode + '" data-v="' + m + '" data-id="' + o.id + '">' +
            '<span class="pay-opt-m">' + m + '</span></button>';
        }).join('') + '</div>' +
      '</div>' +
      '<button type="button" class="btn quiet paid-cancel" data-act="close-modal">Cancel</button>' +
    '</div>',
  'paid-modal');
}
function askReprint(id) {
  var o = findOrder(id);
  askPayMethod(id, o && o.payment === 'Unpaid' ? 'bill' : 'reprint');
}
function payMethodBy(id, method, mode) {
  var o = findOrder(id); if (!o || ['Cash', 'Card', 'Transfer'].indexOf(method) < 0) return;
  /* Paid: method first, then discount modal, then print */
  if (mode === 'pay') {
    if (o.deal && method !== 'Card') { toast(o.deal.bank + ' card deal: order #' + pad(o.no) + ' can only be paid by card'); return; }
    if (!paidAsk || paidAsk.id !== id) paidAsk = { id: id, pct: Math.min(100, Math.max(0, num(o.discountPct))) };
    paidAsk.method = method;
    if (o.deal) { paidAsk.deal = copy(o.deal); paidAsk.pct = num(o.deal.pct); }
    else paidAsk.deal = null;
    openPaidDiscount();
    return;
  }
  /* Reprint: customer bill for paid or unpaid — never mark unpaid as paid */
  if (mode === 'bill' || mode === 'reprint' || o.payment === 'Unpaid') {
    closeModal();
    if (o.payment !== 'Unpaid' && o.payment !== method) {
      if (o.deal && method !== 'Card') { toast(o.deal.bank + ' card deal: order #' + pad(o.no) + ' can only be paid by card'); return; }
      o.payment = method;
      stamp(o);
      commit('orders', o.id);
      refreshAll();
    }
    printCustomerBill(o, method);
    toast(o.payment === 'Unpaid'
      ? ('Customer bill · ' + method + ' · still unpaid')
      : ('Customer bill reprinted · ' + method));
    return;
  }
  closeModal();
  printCustomerBill(o, method);
  toast('Customer bill reprinted · ' + method);
}
function reprintBy(id, method) { payMethodBy(id, method, 'reprint'); }
function reslip(id) { var o = findOrder(id); if (o) printSlip(o); }
/* ---- Changing an order after it is punched (12 Oct 2026). Every change needs a reason and is kept with who and when.
   An unpaid order is changed in place (edits[] on the order). A paid order is never rewritten: the change becomes a linked
   adjustment order (adj {of, no, why}) with the added lines at their price and the removed lines at a negative price, so the
   money, the refund or the extra charge, and the kitchen all see exactly what moved. The server's till watcher clips the
   counter camera at the moment of each change and lists it on the exceptions page. ---- */
var chg = null;
var CHANGE_WHY = ['Customer changed mind', 'Wrong item punched', 'Item not available', 'Added later', 'Other'];
var CANCEL_WHY = ['Customer changed mind', 'Wrong item punched', 'Item not available', 'Other'];
function lineKey(it) { return [it.n, it.c, (it.mods || []).map(function (m) { return m.n; }).join('+'), it.note || '', it.free ? 'free' : ''].join('|'); }
function isCancel(it) { return !!(it.cancel || it.p < 0); }
function liveAdjustments(o) { return orders.filter(function (x) { return x.adj && x.adj.of === o.id; }).sort(function (a, b) { return a.id - b.id; }); }
function effectiveItems(o) {
  /* what the customer has after every change so far: the original lines plus the adjustments' added lines, minus their cancels */
  var items = copy(o.items);
  liveAdjustments(o).forEach(function (a) {
    a.items.forEach(function (it) {
      var k = lineKey(it), cur = null; items.forEach(function (c) { if (lineKey(c) === k) cur = c; });
      if (isCancel(it)) { if (cur) { cur.q -= it.q; if (cur.q <= 0) items.splice(items.indexOf(cur), 1); } }
      else if (cur) cur.q += it.q; else { var x = copy(it); delete x.cancel; items.push(x); }
    });
  });
  return items;
}
function askChange(id) {
  var o = findOrder(id); if (!o || o.remake || o.adj) return;
  chg = { id: id, items: effectiveItems(o), pay: '', cat: 'All', cancels: {}, pendingCancel: null, cancelPick: '' };
  showTab('change');
  renderChange();
}
function closeChangePage() {
  chg = null;
  if ($('chgPanel')) $('chgPanel').classList.remove('open');
  document.body.style.overflow = '';
  showTab('orders');
}
function chgQty(m) {
  var n = 0;
  chg.items.forEach(function (c) { if (c.n === m.n && c.c === m.c) n += c.q; });
  return n;
}
function chgCancelWhyText(c) {
  if (!c) return '';
  return c.why === 'Other' ? txt(c.other || '', 60).trim() || 'Other' : c.why;
}
function chgWhySummary(d) {
  var parts = [];
  d.removed.forEach(function (it) {
    var w = chgCancelWhyText(chg.cancels[lineKey(it)]);
    parts.push(label(it) + ': ' + (w || 'Cancelled'));
  });
  if (d.added.length) parts.push('Added later');
  return parts.join('; ');
}
function askCancelWhy(i) {
  var it = chg.items[i]; if (!it) return;
  chg.pendingCancel = i;
  chg.cancelPick = '';
  openModal('<h2 id="modalTitle">Why cancel ' + esc(label(it)) + '?</h2>' +
    '<p class="deal-note">This comes off the order. Pick why for this item.</p>' +
    '<div class="chips tight" id="chgCancelWhy">' + CANCEL_WHY.map(function (w) {
      return '<button type="button" data-act="chg-cancel-why" data-v="' + w + '">' + w + '</button>';
    }).join('') + '</div>' +
    '<input type="text" id="chgCancelOther" class="hidden" maxlength="60" placeholder="Say what happened" aria-label="Other reason">' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="chg-cancel-abort">Keep item</button>' +
    '<button type="button" class="btn primary" data-act="chg-cancel-go" id="chgCancelGo" disabled>Remove</button></div>');
}
function pickCancelWhy(v) {
  if (!chg || chg.pendingCancel == null) return;
  chg.cancelPick = v;
  [].forEach.call(document.querySelectorAll('#chgCancelWhy button'), function (b) {
    b.classList.toggle('on', b.getAttribute('data-v') === v);
  });
  if ($('chgCancelOther')) {
    $('chgCancelOther').classList.toggle('hidden', v !== 'Other');
    if (v === 'Other') $('chgCancelOther').focus();
  }
  if ($('chgCancelGo')) $('chgCancelGo').disabled = false;
}
function confirmCancelWhy() {
  if (!chg || chg.pendingCancel == null || !chg.cancelPick) return;
  var why = chg.cancelPick, other = '';
  if (why === 'Other') {
    other = txt(($('chgCancelOther') && $('chgCancelOther').value) || '', 60).trim();
    if (!other) { toast('Say what happened'); return; }
  }
  applyCancelUnit(chg.pendingCancel, why, other);
}
function applyCancelUnit(i, why, other) {
  var it = chg.items[i]; if (!it) { closeModal(); return; }
  var k = lineKey(it);
  if (!chg.cancels[k]) chg.cancels[k] = { why: why, other: other || '', q: 0, n: label(it) };
  chg.cancels[k].why = why;
  chg.cancels[k].other = other || '';
  chg.cancels[k].q += 1;
  it.q -= 1;
  if (it.q <= 0) chg.items.splice(i, 1);
  chg.pendingCancel = null;
  chg.cancelPick = '';
  closeModal();
  renderChange();
}
function clearCancelCredit(it, by) {
  var k = lineKey(it), c = chg.cancels[k];
  if (!c) return;
  c.q -= by;
  if (c.q <= 0) delete chg.cancels[k];
}
function changeDiff(o) {
  var before = {}, after = {}, added = [], removed = [];
  effectiveItems(o).forEach(function (it) { before[lineKey(it)] = it; });
  chg.items.forEach(function (it) { after[lineKey(it)] = it; });
  Object.keys(after).forEach(function (k) { var a = after[k], b = before[k]; if (!b) added.push(copy(a)); else if (a.q > b.q) { var x = copy(a); x.q = a.q - b.q; added.push(x); } });
  Object.keys(before).forEach(function (k) { var b = before[k], a = after[k]; if (!a) removed.push(copy(b)); else if (b.q > a.q) { var x = copy(b); x.q = b.q - a.q; removed.push(x); } });
  var delta = 0; added.forEach(function (it) { delta += it.p * it.q; }); removed.forEach(function (it) { delta -= it.p * it.q; });
  return { added: added, removed: removed, delta: delta, text: added.map(function (it) { return '+' + it.q + ' ' + label(it); }).concat(removed.map(function (it) { return '-' + it.q + ' ' + label(it); })).join(', ') };
}
function renderChange() {
  if (!chg || !$('tabChange')) return;
  var o = findOrder(chg.id); if (!o) { closeChangePage(); return; }
  var tileScroll = $('chgTiles') ? $('chgTiles').scrollTop : 0;
  var d = changeDiff(o), paid = o.payment !== 'Unpaid', mv = Math.round(d.delta * (100 - Math.min(100, Math.max(0, num(o.discountPct)))) / 100);
  if (paid && TAX.enabled) mv = TAX.compute([{ p: d.delta, q: 1 }], Math.round(d.delta * Math.min(100, Math.max(0, num(o.discountPct))) / 100), chg.pay || (o.deal ? 'Card' : o.payment)).total;
  $('chgNoLbl').textContent = '#' + pad(o.no);
  $('chgNote').textContent = paid
    ? 'Paid order: extras and refunds ring as their own line. Removing an item asks why straight away.'
    : 'Not paid yet: this updates the order and prints a change slip. Removing an item asks why straight away.';
  var list = '', cancelKeys = Object.keys(chg.cancels || {});
  chg.items.forEach(function (it, i) {
    list += '<div class="line"><div><div class="line-name">' + esc(label(it)) + modsText(it) + '</div>' + (it.note ? '<div class="line-note">' + esc(it.note) + '</div>' : '') + '</div>' +
      '<div class="stepper"><button type="button" data-act="chg-dec" data-i="' + i + '" aria-label="One less">\u2212</button><b>' + it.q + '</b><button type="button" data-act="chg-inc" data-i="' + i + '" aria-label="One more">+</button></div>' +
      '<div class="line-total">' + n0(it.p * it.q) + '</div></div>';
  });
  if (cancelKeys.length) {
    list += '<p class="deal-tier"><b>Cancelled</b></p>';
    cancelKeys.forEach(function (k) {
      var c = chg.cancels[k];
      list += '<div class="line chg-cancel-line"><div><div class="line-name">' + esc(c.n || k) + '</div>' +
        '<div class="line-note">' + esc(chgCancelWhyText(c)) + (c.q > 1 ? ' · ×' + c.q : '') + '</div></div></div>';
    });
  }
  $('chgList').innerHTML = list || '<div class="cart-empty"><div class="scribble">nothing left on the order</div></div>';
  var cat = chg.cat || 'All', cats = '<button type="button" data-act="chg-cat" data-v="All"' + (cat === 'All' ? ' class="on"' : '') + '>All</button>';
  categories().forEach(function (c) {
    cats += '<button type="button" data-act="chg-cat" data-v="' + esc(c) + '"' + (cat === c ? ' class="on"' : '') + '>' + esc(c) + '</button>';
  });
  $('chgCats').innerHTML = cats;
  var tiles = '';
  MENU.forEach(function (m, i) {
    if (cat !== 'All' && m.c !== cat) return;
    var n = chgQty(m), out = isOut(m);
    tiles += '<button type="button" class="tile' + (out ? ' out' : '') + '" data-act="chg-add" data-i="' + i + '" aria-label="' + (out ? 'Out today: ' : 'Add ') + esc(label(m)) + ', ' + m.p + ' rupees">' +
      '<span class="tile-ph"><img src="/img/' + esc(m.i || 'food') + '.jpg" alt="" loading="lazy" width="320" height="320">' + (out ? '<i class="out-tag">Out today</i>' : '') +
      '<b class="qty' + (n ? '' : ' hidden') + '">' + n + '</b></span>' +
      '<span class="tile-name">' + esc(m.n) + '</span>' +
      '<span class="tile-meta"><span class="tile-cat">' + esc(m.c) + '</span><span class="tile-price">' + n0(m.p) + '</span></span></button>';
  });
  $('chgTiles').innerHTML = tiles;
  $('chgTiles').scrollTop = tileScroll;
  var showPay = !!(paid && mv);
  $('chgPayWrap').classList.toggle('hidden', !showPay);
  if (showPay) {
    $('chgPayLbl').innerHTML = '<b>' + (mv > 0 ? 'Collect the extra by' : 'Refund by') + '</b>';
    $('chgPay').innerHTML = ['Cash', 'Card', 'Transfer'].map(function (m) {
      return '<button type="button" data-act="chg-pay" data-v="' + m + '"' + (chg.pay === m ? ' class="on"' : '') + '>' + m + '</button>';
    }).join('');
  }
  var deltaLbl = (d.text ? d.text : 'No change yet') + (o.discountPct ? ' (at ' + o.discountPct + '% off)' : '');
  $('chgDeltaText').textContent = deltaLbl;
  $('chgDelta').textContent = (mv > 0 ? '+' : '') + n0(mv);
  $('chgApplyLbl').textContent = paid ? 'Ring the change' : 'Apply the change';
  $('chgBarText').textContent = d.text ? 'Review change' : 'Order #' + pad(o.no);
  $('chgBarDelta').textContent = (mv > 0 ? '+' : '') + n0(mv) + ' PKR';
}
function changeQty(i, by) {
  var it = chg.items[i]; if (!it) return;
  if (by < 0) { askCancelWhy(i); return; }
  it.q += by;
  clearCancelCredit(it, by);
  renderChange();
}
function changeAdd(i) {
  var m = MENU[i]; if (!m) return;
  if (isOut(m)) { toast(m.n + ' is out today'); return; }
  var kk = (!matchaLocal && m.kPrem) ? m.kPrem : m.k, found = null;
  chg.items.forEach(function (c) { if (c.n === m.n && c.c === m.c && !c.note && !hasMods(c) && !c.free) found = c; });
  if (found) { found.q++; clearCancelCredit(found, 1); }
  else chg.items.push(m.v ? { n: m.n, c: m.c, p: m.p, k: kk, q: 1, v: m.v, vi: m.vi } : { n: m.n, c: m.c, p: m.p, k: kk, q: 1 });
  renderChange();
}
function changeSlipHtml(o, d, adjNo) {
  var lines = '';
  d.added.forEach(function (it) { lines += '<div class="l kl"><span>ADD ' + esc(label(it)) + modsText(it) + '</span><span>x' + it.q + '</span></div>' + (it.note ? '<div class="l kl" style="padding-left:10px;font-weight:700">&raquo; ' + esc(it.note) + '</div>' : ''); });
  d.removed.forEach(function (it) {
    var w = chgCancelWhyText(chg.cancels[lineKey(it)]);
    lines += '<div class="l kl"><span>CANCEL ' + esc(label(it)) + modsText(it) + '</span><span>x' + it.q + '</span></div>' +
      (w ? '<div class="l kl" style="padding-left:10px;font-weight:700">&raquo; ' + esc(w) + '</div>' : '') +
      (it.note ? '<div class="l kl" style="padding-left:10px;font-weight:700">&raquo; ' + esc(it.note) + '</div>' : '');
  });
  return '<div class="rc kitchen' + (paper80 ? '' : ' narrow') + '"><div class="sub">CHANGE TO #' + pad(o.no) + (adjNo ? ' &middot; RUNG AS #' + pad(adjNo) : '') + '</div>' +
    '<div style="text-align:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:46px;font-weight:700;line-height:1.1">' + pad(o.no) + '</div>' +
    '<div class="l"><span>' + esc(timeNow()) + '</span><span>CHANGE</span></div>' +
    (o.customer && o.customer !== 'Walk-in' ? '<div class="l"><span>FOR</span><span>' + esc(o.customer) + '</span></div>' : '') +
    '<div class="rule"></div>' + lines + '<div class="rule"></div></div>';
}
function applyChange(okId) {
  var o = findOrder(chg.id); if (!o) return;
  var d = changeDiff(o), why = chgWhySummary(d);
  if (!d.added.length && !d.removed.length) { toast('Nothing has changed'); return; }
  if (d.removed.length) {
    for (var ri = 0; ri < d.removed.length; ri++) {
      var rk = lineKey(d.removed[ri]), rc = chg.cancels[rk];
      if (!rc || !chgCancelWhyText(rc) || rc.q < d.removed[ri].q) { toast('Say why for each cancelled item'); return; }
    }
  }
  if (!why) { toast('Say why'); return; }
  if (!chg.items.length && o.payment === 'Unpaid') { toast('To take everything off, void the order instead'); return; }
  var paid = o.payment !== 'Unpaid', entry = { at: nowMs(), by: whoName(), why: why, was: o.total, d: txt(d.text, 100) };
  if (!paid) {
    var sub = 0, cogs = 0, pct = num(o.discountPct);
    chg.items.forEach(function (c) { sub += c.p * c.q; cogs += (c.k + (o.channel === 'Foodpanda' ? DELIVERY_PKG : 0)) * c.q; });
    var disc = Math.round(sub * Math.min(100, Math.max(0, pct)) / 100), newTotal = Math.max(0, sub - disc);
    if (newTotal < o.total && needsOk('reduce') && !okId) {
      approve('reduce', o.id, o.total - newTotal, 'Take off #' + pad(o.no) + ': ' + txt(d.text, 50), function (k) { applyChange(k); });
      return;
    }
    if (okId) o.ok = okId;
    o.items = copy(chg.items); o.sub = sub; o.discount = disc; o.total = Math.max(0, sub - disc); o.cogs = cogs;
    applyOrderTax(o);
    entry.now = o.total; o.edits = (o.edits || []).concat([entry]).slice(-20);
    if (o.servedAt && d.added.length) { delete o.servedAt; delete o.servedBy; }   /* something new to make: back on the pass */
    stamp(o); commit('orders', o.id);
    sendToPrinter(changeSlipHtml(o, d, 0));
    closeChangePage(); refreshAll(); toast('Order #' + pad(o.no) + ' changed');
    return;
  }
  var pctNow = Math.min(100, Math.max(0, num(o.discountPct))), moves = Math.round(d.delta * (100 - pctNow) / 100);
  if (TAX.enabled) moves = TAX.compute([{ p: d.delta, q: 1 }], Math.round(d.delta * pctNow / 100), chg.pay || (o.deal ? 'Card' : o.payment)).total;
  if (moves && !chg.pay) { toast(moves > 0 ? 'How is the extra being paid?' : 'How is the refund going back?'); return; }
  if (o.deal && moves && chg.pay !== 'Card') { toast(o.deal.bank + ' card deal: the difference must go by card'); return; }
  var items = d.added.map(function (it) { var x = copy(it); delete x.free; return x; }).concat(d.removed.map(function (it) { var x = copy(it); x.p = -x.p; x.k = 0; x.cancel = true; delete x.bp; return x; }));
  var sub = 0, cogs = 0, pct = Math.min(100, Math.max(0, num(o.discountPct)));
  items.forEach(function (it) { sub += it.p * it.q; if (!isCancel(it)) cogs += (it.k + (o.channel === 'Foodpanda' ? DELIVERY_PKG : 0)) * it.q; });
  var disc = Math.round(sub * pct / 100), total = sub - disc;   /* the customer paid the original at this discount, so the difference moves at it too */
  if (TAX.enabled) total = TAX.compute(items, disc, chg.pay || (o.deal ? 'Card' : o.payment)).total;
  if (!total) chg.pay = '';
  if (isRole('waiter')) { toast('This order is paid. The till manager changes it.'); return; }
  if (total < 0 && needsOk('refund') && !okId) {
    approve('refund', o.id, -total, 'Refund ' + money(-total) + ' on #' + pad(o.no) + ': ' + why, function (k) { applyChange(k); });
    return;
  }
  seq++;
  var a = { no: seq, id: newId(), date: localeDay(), iso: isoNow(), time: timeNow(), items: items, sub: sub, discount: disc, discountPct: pct, total: total, cogs: cogs,
    channel: o.channel, payment: total ? chg.pay : (o.deal ? 'Card' : 'Cash'), customer: o.customer, adj: { of: o.id, no: o.no, why: why }, u: nowMs() };
  applyOrderTax(a);
  if (o.deal) a.deal = copy(o.deal);
  if (okId) a.ok = okId;
  if (o.table) a.table = o.table;
  if (o.waiter) a.waiter = o.waiter; if (o.phone) a.phone = o.phone; if (o.svc) a.svc = o.svc; if (who) a.by = who;
  a.paidAt = timeNow(); a.paidDate = localeDay(); a.paidIso = isoNow();
  orders.push(a); commit('orders', a.id);
  entry.now = o.total + total; entry.adjNo = a.no; o.edits = (o.edits || []).concat([entry]).slice(-20); stamp(o); commit('orders', o.id);
  sendToPrinter(changeSlipHtml(o, d, a.no) + (d.delta ? receiptHtml(a) : ''));
  closeChangePage(); refreshAll();
  toast(total > 0 ? 'Extra ' + money(total) + ' collected by ' + chg_payWord(a.payment) + ' as #' + pad(a.no) : total < 0 ? 'Refund ' + money(-total) + ' by ' + chg_payWord(a.payment) + ' as #' + pad(a.no) : 'Change rung as #' + pad(a.no));
}
function chg_payWord(m) { return String(m).toLowerCase(); }
function askRemake(id) {
  var o = findOrder(id); if (!o) return;
  openModal(
    '<div class="remake-sheet">' +
      '<h2 id="modalTitle">Remake from <span class="num">#' + pad(o.no) + '</span></h2>' +
      '<p class="deal-note">Tick what goes back to the kitchen. It is rung at zero against the original.</p>' +
      '<div class="paid-block-h">Select items</div>' +
      '<div class="pick remake-pick" id="remakeLines">' + o.items.map(function (it, i) {
        return '<label><span>' + esc(label(it)) + modsText(it) + (it.q > 1 ? ' ×' + it.q : '') + '</span>' +
          '<input type="checkbox" value="' + i + '" aria-label="' + esc(label(it)) + '"></label>';
      }).join('') + '</div>' +
      '<div class="paid-block-h">Why</div>' +
      '<div class="chips remake-why" id="remakeWhy" role="radiogroup" aria-label="Reason">' +
        ['Undercooked', 'Overcooked', 'Wrong item', 'Cold', 'Dropped', 'Customer changed mind', 'Other'].map(function (w) {
          return '<button type="button" data-chip="' + w + '" data-remake-why="1">' + w + '</button>';
        }).join('') +
      '</div>' +
      '<div class="modal-actions">' +
        '<button type="button" class="btn secondary" data-act="close-modal">Cancel</button>' +
        '<button type="button" class="btn primary" data-act="remake-send" data-id="' + o.id + '">Send to the kitchen</button>' +
      '</div>' +
    '</div>',
  'remake-modal');
}
function sendRemake(id, okId, kept) {
  var o = findOrder(id); if (!o) return;
  var picked, why;
  if (kept) { picked = kept.picked; why = kept.why; }
  else {
    picked = [].map.call(document.querySelectorAll('#remakeLines input:checked'), function (inp) { return o.items[+inp.value]; }).filter(Boolean);
    var whyB = document.querySelector('#remakeWhy button.on'); why = whyB ? whyB.getAttribute('data-chip') : '';
  }
  if (!picked.length) { toast('Select the item being remade'); return; }
  if (!why) { toast('Select why'); return; }
  var cogs = 0, items = picked.map(function (it) { var r = copy(it); r.p = 0; delete r.bp; delete r.free; delete r.cancel; cogs += r.k * r.q; return r; });
  if (needsOk('remake') && !okId) {
    approve('remake', o.id, cogs, 'Remake from #' + pad(o.no) + ': ' + why, function (k) { sendRemake(id, k, { picked: picked, why: why }); });
    return;
  }
  seq++;
  var r = { no: seq, id: newId(), date: localeDay(), iso: isoNow(), time: timeNow(), items: items, sub: 0, discount: 0, total: 0, cogs: cogs,
    channel: o.channel, payment: 'Cash', customer: o.customer, remake: { of: o.id, no: o.no, why: why }, u: nowMs() };
  applyOrderTax(r);
  if (o.waiter) r.waiter = o.waiter; if (o.phone) r.phone = o.phone; if (who) r.by = who;
  if (o.svc) r.svc = o.svc; if (o.table) r.table = o.table; if (okId) r.ok = okId;
  orders.push(r); commit('orders', r.id);
  sendToPrinter(kitchenHtml(r));
  closeModal(); refreshAll(); toast('Remake #' + pad(r.no) + ' sent to the kitchen');
}
function rekitchen(id) { var o = findOrder(id); if (o) { sendToPrinter(kitchenHtml(o)); toast('Kitchen slip for #' + pad(o.no) + ' sent again'); } }

/* ====== PAY LATER, VOID, EXPENSES ====== */
var paidAsk = null;
function askPaid(id) { askPayMethod(id, 'pay'); }
function paidAskAmount() {
  var o = findOrder(paidAsk && paidAsk.id); if (!o) return { pct: 0, disc: 0, sale: 0 };
  var sale = 0; o.items.forEach(function (it) { sale += it.p * it.q; });
  var pct = Math.min(100, Math.max(0, num(paidAsk.pct)));
  return { pct: pct, disc: Math.round(sale * pct / 100), sale: sale };
}
function renderPaidAsk() { if (paidAsk) askPayMethod(paidAsk.id, 'pay'); }
function openPaidDiscount() {
  if (!paidAsk) return;
  var o = findOrder(paidAsk.id); if (!o) return;
  var std = [0, 5, 10, 15, 20, 50];
  var pct = Math.min(100, Math.max(0, num(paidAsk.pct)));
  var deal = paidAsk.deal || null;
  var deals = '';
  if (BANK_DEALS.length) {
    deals = '<div class="deal-sheet">' + BANK_DEALS.map(function (d, di) {
      return '<section class="deal-band">' +
        '<div class="deal-band-h"><span class="deal-pct num">' + d.pct + '%</span><span class="deal-band-t"><b>' + esc(d.bank) + '</b> off when paid with</span></div>' +
        '<div class="chips cards" role="group" aria-label="' + esc(d.bank) + ' ' + d.pct + '% cards">' + d.cards.map(function (c, ci) {
          var on = deal && deal.bank === d.bank && deal.card === c;
          return '<button type="button" data-act="paid-deal" data-v="' + di + ':' + ci + '"' + (on ? ' class="on"' : '') + ' title="' + esc(c) + '">' + cardSvg(c) + '<span>' + esc(cardLabel(c)) + '</span></button>';
        }).join('') + '</div></section>';
    }).join('') +
      '<p class="deal-note">Pick the card they pay with. This order can only close as Card.</p></div>' +
      '<p class="deal-tier disc-other"><b>Other discount</b></p>';
  }
  openModal('<h2 id="modalTitle">Discount on this order</h2>' + deals +
    '<div class="disc-foot">' +
    '<div class="chips disc-pct" role="group" aria-label="Other percentage">' + std.map(function (d) {
      return '<button type="button" data-act="paid-disc" data-v="' + d + '"' + (!deal && pct === d ? ' class="on"' : '') + '>' + (d ? d + '%' : 'None') + '</button>';
    }).join('') + '</div>' +
    '<label for="discountPct">Or type another %</label>' +
    '<div class="split disc-apply"><input type="number" id="discountPct" inputmode="numeric" min="0" max="100" placeholder="0–100"' + (!deal && std.indexOf(pct) < 0 ? ' value="' + pct + '"' : '') + '>' +
    '<button type="button" class="btn primary" data-act="paid-disc-apply">Apply</button></div>' +
    '<button type="button" class="btn quiet" data-act="close-modal">Cancel</button></div>', 'disc-modal');
}
function paidDealPick(key) {
  if (!paidAsk) return;
  var k = String(key).split(':'), d = BANK_DEALS[+k[0]], c = d && d.cards[+k[1]];
  if (!d || c == null) return;
  paidAsk.deal = { bank: d.bank, card: c, pct: d.pct };
  paidAsk.pct = d.pct;
  paidAsk.method = 'Card';
  finishPaidFromDisc();
}
function paidDiscPick(pct) {
  if (!paidAsk) return;
  paidAsk.deal = null;
  paidAsk.pct = Math.min(100, Math.max(0, num(pct)));
  finishPaidFromDisc();
}
function paidDiscApplyCustom() {
  if (!paidAsk || !$('discountPct')) return;
  paidAsk.deal = null;
  paidAsk.pct = Math.min(100, Math.max(0, num($('discountPct').value)));
  finishPaidFromDisc();
}
function finishPaidFromDisc() {
  if (!paidAsk || !paidAsk.method) return;
  markPaid(paidAsk.id, paidAsk.method);
}
function markPaid(id, method) {
  var o = findOrder(id); if (!o || o.payment !== 'Unpaid' || ['Cash', 'Card', 'Transfer'].indexOf(method) < 0) return;
  if (paidAsk && paidAsk.id === id && paidAsk.deal) method = 'Card';
  if (o.deal && method !== 'Card') { toast(o.deal.bank + ' card deal: order #' + pad(o.no) + ' can only be paid by card'); return; }
  var a = (paidAsk && paidAsk.id === id) ? paidAskAmount() : { pct: num(o.discountPct), disc: num(o.discount) };
  o.discountPct = a.pct; o.discount = a.disc;
  if (paidAsk && paidAsk.id === id && paidAsk.deal) o.deal = copy(paidAsk.deal);
  else if (o.deal && a.pct !== num(o.deal.pct)) delete o.deal;
  o.payment = method; applyOrderTax(o); o.paidAt = timeNow(); o.paidDate = localeDay(); o.paidIso = isoNow(); stamp(o);
  paidAsk = null;
  commit('orders', o.id); closeModal(); refreshAll(); printReceipt(o);
  toast('Order #' + pad(o.no) + ' paid by ' + method.toLowerCase() + (a.pct ? ' · ' + a.pct + '% off' : ''));
}
function askVoid(id) {
  var o = findOrder(id); if (!o) return;
  if (o.adj) { toast('A change is already settled. Ring another change to reverse it.'); return; }
  if (liveAdjustments(o).length) { toast('This order has changes rung against it. Use Change to take the items off instead.'); return; }
  openModal('<h2 id="modalTitle">Void order #' + pad(o.no) + '?</h2>' +
    '<p>' + money(o.total) + ' comes out of the sales. The order stays on record for the owner.</p>' +
    '<label id="voidL">What happened?</label>' +
    '<div class="chips" id="voidReasons" role="group" aria-labelledby="voidL">' +
    ['Wrong items', 'Customer cancelled', 'Rung up twice', 'Other'].map(function (r) {
      return '<button type="button" data-act="void-reason" data-v="' + r + '">' + r + '</button>';
    }).join('') + '</div>' +
    '<input type="text" id="voidOther" class="hidden" placeholder="Say what happened" maxlength="60" aria-label="Reason">' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Keep order</button>' +
    '<button type="button" class="btn dark" data-act="confirm-void" data-id="' + o.id + '" id="voidGo" disabled>Void order</button></div>');
}
function voidOrder(id, okId, whyKept) {
  var o = findOrder(id); if (!o) return;
  var why = whyKept;
  if (why == null) { var on = $('voidReasons') && $('voidReasons').querySelector('.on'); why = on ? on.getAttribute('data-v') : ''; if (why === 'Other') why = $('voidOther').value.trim() || 'Other'; }
  if (rolesOn && role === 'barista' && !why) { toast('Say what happened'); return; }
  if (needsOk('void') && !okId) {
    approve('void', o.id, o.total, 'Void #' + pad(o.no) + ', ' + money(o.total) + (why ? ': ' + why : ''), function (k) { voidOrder(id, k, why); });
    return;
  }
  var r = copy(o);
  if (okId) r.ok = okId;
  r.voidedAt = timeNow(); r.voidedDate = localeDay(); r.voidedIso = isoNow();
  r.reason = why; r.voidedBy = whoName(); r.u = nowMs();
  voided.push(r);
  orders = orders.filter(function (x) { return x.id !== id; });
  if (o.phone) { var cu = customerByPhone(o.phone); if (cu) { cu.visits = Math.max(0, num(cu.visits) - 1); cu.spent = Math.max(0, num(cu.spent) - num(o.total)); stamp(cu); commit('customers', cu.id); } }
  commit('voided', r.id); closeModal(); refreshAll();
  toast('Order #' + pad(o.no) + ' voided, kept on record');
}
function expLineHtml() {
  return '<div class="exp-line">' +
    '<input type="text" class="exp-item-name" placeholder="Item name" maxlength="40" aria-label="Item name">' +
    '<input type="number" class="exp-item-amt" inputmode="numeric" min="0" placeholder="Rate" aria-label="Rate">' +
    '<button type="button" class="btn sm quiet exp-line-x" data-act="exp-line-del" aria-label="Remove item">×</button></div>';
}
function readExpLines(linesId) {
  var box = $(linesId); if (!box) return [];
  var out = [];
  [].forEach.call(box.querySelectorAll('.exp-line'), function (row) {
    var n = txt(((row.querySelector('.exp-item-name') || {}).value || '').trim(), 40);
    var a = parseFloat((row.querySelector('.exp-item-amt') || {}).value);
    if (!n && !(a > 0)) return;
    out.push({ n: n, a: isNaN(a) || a < 0 ? 0 : a });
  });
  return out;
}
function expLinesTotal(lines) { return sumOf(lines || [], function (x) { return num(x.a); }); }
function updateExpTotal(form) {
  var lines = readExpLines(form === 'o' ? 'oExpLines' : 'bExpLines');
  var el = $(form === 'o' ? 'oExpTotal' : 'bExpTotal');
  if (el) el.textContent = n0(expLinesTotal(lines));
}
function addExpLineRow(form) {
  var box = $(form === 'o' ? 'oExpLines' : 'bExpLines'); if (!box) return;
  box.insertAdjacentHTML('beforeend', expLineHtml());
  var rows = box.querySelectorAll('.exp-line');
  var last = rows[rows.length - 1], inp = last && last.querySelector('.exp-item-name');
  if (inp) inp.focus();
  updateExpTotal(form);
}
function clearExpLines(form) {
  var box = $(form === 'o' ? 'oExpLines' : 'bExpLines'); if (!box) return;
  box.innerHTML = expLineHtml();
  updateExpTotal(form);
}
function expenseItemsText(e) {
  if (!e || !Array.isArray(e.items) || !e.items.length) return '';
  return e.items.map(function (x) { return x.n + ' ' + n0(x.a); }).join(', ');
}
function addExpense(form, by, till, type) {
  var linesId = form === 'o' ? 'oExpLines' : 'bExpLines';
  var stockId = form === 'o' ? 'oExpStock' : 'bExpStock';
  var qtyId = form === 'o' ? 'oExpQty' : 'bExpQty';
  var lineSel = $(form === 'o' ? 'oExpLine' : 'bExpLine');
  var lines = readExpLines(linesId), i;
  for (i = 0; i < lines.length; i++) {
    if (!lines[i].n || !(lines[i].a > 0)) { toast('Each item needs a name and its rate'); return; }
  }
  if (!lines.length) { toast('Add at least one item and its rate'); return; }
  var a = expLinesTotal(lines), n = txt(lines.map(function (x) { return x.n; }).join(', '), 80);
  var item = stockById(num($(stockId).value)), gotResult = item ? enteredQuantity(item, qtyId) : null, got = gotResult && gotResult.q;
  if (item && !gotResult) return;
  if (item && !(got > 0)) { toast('Type how much ' + item.name + ' arrived, in ' + item.unit); return; }
  if (till && needsOk('expense') && !addExpense.ok) {
    var eid = newId();
    approve('expense', eid, a, 'Paid from the drawer: ' + n + ', ' + money(a), function (k) { addExpense.ok = k; addExpense.id = eid; addExpense(form, by, till, type); });
    return;
  }
  var e = {
    id: addExpense.id || newId(), name: n, amount: a, date: localeDay(), iso: isoNow(), time: timeNow(),
    till: till, type: type === 'run' ? 'run' : 'stock', u: nowMs(),
    items: lines.map(function (x) { return { n: x.n, a: num(x.a) }; })
  };
  if (addExpense.ok) { e.ok = addExpense.ok; addExpense.ok = addExpense.id = null; }
  if (lineSel && lineSel.value) e.line = txt(lineSel.value, 20);
  if (by) e.by = (role === 'owner') ? by : whoName();
  if (item) { e.s = item.id; e.q = got; e.type = 'stock'; }
  expenses.push(e);
  commit('expenses', e.id);
  clearExpLines(form);
  $(stockId).value = ''; $(qtyId).value = ''; $(qtyId).classList.add('hidden'); configureQuantity(null, qtyId);
  if (lineSel) lineSel.value = '';
  refreshAll(); toast(item ? 'Expense added, and ' + countText(item.id, got) + ' of ' + item.name + ' added to stock' : 'Expense added');
}
function askDelExpense(id) {
  var e = null; expenses.forEach(function (x) { if (x.id === id) e = x; });
  if (!e) return;
  openModal('<h2 id="modalTitle">Delete this expense?</h2><p>' + esc(e.name) + ', ' + money(e.amount) + '. It will be removed on every device.</p>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Keep it</button>' +
    '<button type="button" class="btn dark" data-act="confirm-del-exp" data-id="' + e.id + '">Delete expense</button></div>');
}
function delExpense(id) {
  expenses.forEach(function (e) { if (e.id === id) { e.deleted = true; stamp(e); } });
  commit('expenses', id); closeModal(); refreshAll(); toast('Expense deleted');
}
function liveExpenses() { return expenses.filter(function (e) { return !e.deleted; }); }
function unpaidAll() { return orders.filter(function (o) { return o.payment === 'Unpaid'; }); }

/* ====== BARISTA: ORDERS + TILL ====== */
function badge(p) { return '<span class="badge ' + esc(p) + '">' + esc(p === 'Unpaid' ? 'Not paid' : p) + '</span>'; }
function none(t) { return '<div class="empty-state"><p class="empty-state-t">' + esc(t) + '</p></div>'; }
function emptyLane(title, sub, kind) {
  return '<div class="empty-state' + (kind ? ' ' + kind : '') + '">' +
    '<span class="empty-state-ico" aria-hidden="true"></span>' +
    '<p class="empty-state-t">' + esc(title) + '</p>' +
    (sub ? '<p class="empty-state-s">' + esc(sub) + '</p>' : '') +
    '</div>';
}
function snCol(n) {
  return '<div class="row-sn" title="#' + n + '"><span class="row-sn-n num">' + n + '</span></div>';
}
function tableCol(o) {
  if (o.table) return '<div class="row-table" title="Table ' + num(o.table) + '"><span class="row-table-l">Table</span><b class="row-table-n num">' + num(o.table) + '</b></div>';
  return '<div class="row-table empty" title="No table"><span class="row-table-l">Table</span><b class="row-table-n">—</b></div>';
}
function unpaidRow(o, withChannel, sn) {
  return '<div class="row unpaid' + (o.bill ? ' billed' : '') + '">' + snCol(sn || 1) + tableCol(o) + '<div class="row-main"><h3><span class="num">#' + pad(o.no) + '</span> ' + esc(o.customer) +
    (o.bill ? ' <span class="badge Unpaid">Bill asked ' + Math.max(0, Math.round((nowMs() - o.bill) / 60000)) + ' min ago</span>' : '') + (o.servedAt ? ' <span class="badge Cash">Served</span>' : '') +
    (o.waiter && !isRole('waiter') ? ' <small>' + esc(o.waiter) + '</small>' : '') + '</h3>' +
    '<p>' + esc(itemsText(o)) + '</p><p>Rung ' + esc(dayText(o)) + ' at ' + esc(shortTime(o)) + (o.svc ? ', ' + esc(o.svc) : '') + (withChannel ? ', ' + esc(o.channel) : '') + '</p></div>' +
    '<div class="row-side"><span class="row-amt">' + n0(o.total) + '</span>' +
    '<button type="button" class="btn sm secondary" data-act="reslip" data-id="' + o.id + '">Print slip</button>' +
    (rolesOn && !o.servedAt ? '<button type="button" class="btn sm secondary" data-act="served" data-id="' + o.id + '">Served</button>' : '') +
    '<button type="button" class="btn sm secondary" data-act="chg-ask" data-id="' + o.id + '">Change</button>' +
    (isRole('waiter') && !o.bill ? '<button type="button" class="btn sm primary" data-act="bill-ask" data-id="' + o.id + '">Bill please</button>' : '') +
    '<button type="button" class="btn sm primary" data-act="ask-paid" data-id="' + o.id + '">Mark paid</button>' +
    (role === 'owner' ? '<button type="button" class="btn sm danger" data-act="ask-void" data-id="' + o.id + '">Void</button>' : '') + '</div></div>';
}
function orderChanMatch(o) {
  if (ui.ordersChan === 'Foodpanda') return o.channel === 'Foodpanda';
  return o.channel !== 'Foodpanda';
}
function todayOrderRow(o, sn) {
  return '<div class="row">' + snCol(sn) + tableCol(o) + '<div class="row-main"><h3><span class="num">#' + pad(o.no) + '</span>' + (o.remake ? '<span class="badge Unpaid">Remake of #' + pad(o.remake.no) + '</span>' : o.adj ? '<span class="badge Unpaid">Change to #' + pad(o.adj.no) + '</span>' + badge(o.payment) : badge(o.payment)) + (o.edits ? ' <span class="badge Unpaid">changed ' + o.edits.length + '×</span>' : '') + '</h3>' +
    '<p>' + esc(itemsText(o)) + (o.remake ? ' (' + esc(o.remake.why) + ')' : o.adj ? ' (' + esc(o.adj.why) + ')' : '') + '</p><p>' + esc(o.customer) + ', ' + esc(shortTime(o)) + (o.svc ? ', ' + esc(o.svc) : '') + (o.channel !== 'Counter' ? ', ' + esc(o.channel) : '') + '</p></div>' +
    '<div class="row-side"><span class="row-amt">' + n0(o.total) + '</span>' +
    (o.payment === 'Unpaid' && !isRole('waiter') ? '<button type="button" class="btn sm primary" data-act="ask-paid" data-id="' + o.id + '">Paid</button>' : '') +
    '<button type="button" class="btn sm secondary" data-act="reprint" data-id="' + o.id + '">Reprint</button>' +
    (KITCHEN_SLIP ? '<button type="button" class="btn sm secondary" data-act="rekitchen" data-id="' + o.id + '">Kitchen again</button>' : '') +
    (o.remake || o.adj ? '' : '<button type="button" class="btn sm secondary" data-act="remake-ask" data-id="' + o.id + '">Remake</button>' +
      (isToday(o) ? '<button type="button" class="btn sm secondary" data-act="chg-ask" data-id="' + o.id + '">Change</button>' : '')) +
    '<button type="button" class="btn sm danger" data-act="ask-void" data-id="' + o.id + '">Void</button></div></div>';
}
function renderOrdersTab() {
  var own = function (o) { return !isRole('waiter') || o.waiter === me.name || o.by === me.name; };
  var allToday = orders.filter(isToday).filter(own);
  var allUnp = unpaidAll().filter(own);
  var t = allToday.filter(orderChanMatch), u = allUnp.filter(orderChanMatch), h = '', i, sn;
  var nCounter = allToday.filter(function (o) { return o.channel !== 'Foodpanda'; }).length;
  var nPanda = allToday.filter(function (o) { return o.channel === 'Foodpanda'; }).length;
  if ($('ordChanCounter')) { $('ordChanCounter').textContent = nCounter; $('ordChanCounter').classList.toggle('hidden', !nCounter); }
  if ($('ordChanPanda')) { $('ordChanPanda').textContent = nPanda; $('ordChanPanda').classList.toggle('hidden', !nPanda); }
  if ($('ordersChanSeg')) setSeg('ordersChanSeg', ui.ordersChan);
  u = u.slice().sort(function (a, b) { return (a.bill ? 0 : 1) - (b.bill ? 0 : 1) || (a.bill || 0) - (b.bill || 0) || b.id - a.id; });
  u.forEach(function (x, ix) { h += unpaidRow(x, false, ix + 1); });
  $('bUnpaid').innerHTML = h || emptyLane('All caught up', ui.ordersChan === 'Foodpanda' ? 'No Foodpanda bills waiting' : 'Nothing waiting on Counter', 'ok');
  $('bUnpaidCount').textContent = u.length; $('bUnpaidCount').classList.toggle('hidden', !u.length);
  $('tabUnpaid').textContent = allUnp.length; $('tabUnpaid').classList.toggle('hidden', !allUnp.length);
  var cats = {}, catOrder = ui.ordersChan === 'Foodpanda' ? ['Delivery', 'Other'] : ['Dine in', 'Takeaway', 'Other'];
  t.forEach(function (o) {
    var k = o.svc || (ui.ordersChan === 'Foodpanda' ? 'Delivery' : 'Other');
    if (ui.ordersChan === 'Foodpanda' && k !== 'Delivery') k = 'Other';
    if (ui.ordersChan !== 'Foodpanda' && k !== 'Dine in' && k !== 'Takeaway') k = 'Other';
    if (!cats[k]) cats[k] = [];
    cats[k].push(o);
  });
  h = '';
  sn = 0;
  catOrder.forEach(function (cat) {
    var list = cats[cat]; if (!list || !list.length) return;
    h += '<div class="orders-cat"><div class="orders-cat-h"><h3>' + esc(cat) + '</h3></div><div class="rows orders-lane">';
    for (i = list.length - 1; i >= 0; i--) { sn++; h += todayOrderRow(list[i], sn); }
    h += '</div></div>';
  });
  if ($('bOrdersCats')) $('bOrdersCats').innerHTML = h || emptyLane('No tickets yet', ui.ordersChan === 'Foodpanda' ? 'Foodpanda orders show up here' : 'Counter orders show up here', 'idle');
  if ($('bOrders')) { $('bOrders').innerHTML = ''; $('bOrders').classList.add('hidden'); }
  if (isRole('waiter')) renderSignoffs();
  $('orderNoLbl').textContent = '#' + pad(seq + 1);
  $('bizDayB').textContent = bizLabel();
}
/* The staff view of stock: how many items, how many need counting or are running low, when the last count was. */
function renderStockBrief() {
  var el = $('bsStockNote'); if (!el) return;
  var st = stockState();
  if (!st.length) { el.textContent = 'No stock items yet. The owner adds them from Owner, Stock.'; return; }
  var low = 0, uncounted = 0, last = null;
  st.forEach(function (b) { if (b.onHand == null) uncounted++; if (b.low) low++; if (b.count && (!last || b.count.id > last.id)) last = b.count; });
  el.textContent = st.length + ' items on the list. ' + (uncounted ? uncounted + ' not counted yet. ' : '') + (low ? low + ' running low. ' : '') +
    (last ? 'Last count ' + dayText(last) + (last.by ? ' by ' + last.by : '') + '.' : 'Count once to start; after that the till keeps track and each count becomes a check.');
}
function renderTill() {
  var t = orders.filter(isToday), sales = 0, unpaid = 0, late = 0, tax = 0;
  var got = { Cash: 0, Card: 0, Transfer: 0 };
  t.forEach(function (o) { sales += o.total; if (o.payment === 'Unpaid') unpaid += o.total; else if (o.tax) tax += o.tax.tax; });
  /* money counts on the day it was actually paid */
  orders.forEach(function (o) {
    if (got[o.payment] == null || !paidToday(o)) return;
    got[o.payment] += o.total;
    if (!isToday(o)) late += o.total;
  });
  var ex = liveExpenses().filter(isToday), exTot = 0, exTill = 0;
  ex.forEach(function (e) { exTot += e.amount; if (e.till !== false) exTill += e.amount; });
  var fig = dayFigures(isoNow());
  var blindT = isRole('till') && !(fig.rec && fig.rec.counted != null);   /* the count is blind: no totals for the till manager until the day is closed */
  setNum('bsOrders', t.length); setNum('bsUnpaid', unpaid); setNum('bsExp', exTot);
  if ($('bsSalesLbl')) $('bsSalesLbl').textContent = TAX.enabled ? 'Sales (including tax)' : 'Sales';
  if ($('bsTaxRow')) $('bsTaxRow').classList.toggle('hidden', !TAX.enabled);
  if (blindT) {
    ['bsDrawer', 'bsSales', 'bsCash', 'bsCard', 'bsTrans', 'bsTax'].forEach(function (k) { if ($(k)) $(k).textContent = '\u2014'; });
    $('bsDrawerNote').textContent = 'Count the drawer, the card slip and the transfers first. The totals show once the day is closed.';
  } else {
    setNum('bsDrawer', fig.expected); setNum('bsSales', sales);
    if ($('bsTax')) setNum('bsTax', tax);
    setNum('bsCash', got.Cash); setNum('bsCard', got.Card); setNum('bsTrans', got.Transfer);
    $('bsDrawerNote').textContent = 'Opening cash ' + n0(fig.opening) + ', plus cash taken today, less expenses paid from the till' +
      (fig.out || fig.put ? ', with cash taken out or put in' : '') + '.' +
      (late ? ' Includes ' + money(late) + ' paid today for earlier unpaid orders.' : '');
  }
  renderCloseCard('closeB');
  fillStockSelect('bExpStock', 'bExpQty');
  renderStockBrief();

  var tally = {}, arr = [], h = '', max = 0;
  t.forEach(function (o) { o.items.forEach(function (it) { var k = label(it); tally[k] = (tally[k] || 0) + it.q; }); });
  Object.keys(tally).forEach(function (k) { arr.push({ n: k, q: tally[k] }); });
  arr.sort(function (a, b) { return b.q - a.q; });
  arr = arr.slice(0, 5); if (arr.length) max = arr[0].q;
  arr.forEach(function (a) {
    h += '<div class="bar"><div class="bar-top"><span>' + esc(a.n) + '</span><span>' + a.q + '</span></div>' +
      '<div class="track"><i style="width:' + Math.round(a.q / max * 100) + '%"></i></div></div>';
  });
  $('bsTop').innerHTML = h || none('Nothing sold yet today.');
  h = '';
  for (var i = ex.length - 1; i >= 0; i--) {
    var bx = expenseItemsText(ex[i]);
    h += '<div class="row"><div class="row-main"><h3>' + esc(ex[i].name) + '</h3><p>' +
      (bx && ex[i].items && ex[i].items.length > 1 ? esc(bx) + '. ' : '') +
      'Logged by ' + esc(ex[i].by || 'Owner') + ' at ' + esc(shortTime(ex[i])) +
      (ex[i].till === false ? ', not from the till' : '') + '</p></div><div class="row-side"><span class="row-amt">−' + n0(ex[i].amount) + '</span></div></div>';
  }
  $('bsExpList').innerHTML = h || none('None logged today.');
}
function fillStockSelect(selId, qtyId) {
  var sel = $(selId), items = liveStock();
  if (sel.options.length !== items.length + 1) {
    var keep = sel.value;
    sel.innerHTML = '<option value="">Does not add to a stock item</option>' + items.map(function (it) {
      return '<option value="' + num(it.id) + '">Adds to stock: ' + esc(it.name) + ' (' + esc(it.unit) + ')</option>';
    }).join('');
    sel.value = keep;
  }
  if (!sel._wired) {
    sel._wired = true;
    sel.addEventListener('change', function () {
      configureQuantity(stockById(num(sel.value)), qtyId);
    });
  }
}
function showTab(t) {
  if (t !== 'change' && chg) {
    chg = null;
    if ($('chgPanel')) $('chgPanel').classList.remove('open');
    document.body.style.overflow = '';
  }
  ui.tab = t;
  [].forEach.call($('bTabs').querySelectorAll('button'), function (b) {
    var tab = b.getAttribute('data-tab');
    b.classList.toggle('on', t === 'change' ? tab === 'orders' : tab === t);
  });
  $('tabSell').classList.toggle('hidden', t !== 'sell');
  $('tabOrders').classList.toggle('hidden', t !== 'orders');
  $('tabTill').classList.toggle('hidden', t !== 'till');
  if ($('tabKitchen')) $('tabKitchen').classList.toggle('hidden', t !== 'kitchen');
  if ($('tabChange')) $('tabChange').classList.toggle('hidden', t !== 'change');
  if (t === 'till') renderTill();
  clearInterval(kdsTimer); kdsTimer = null;
  if (t === 'kitchen') {
    renderKitchen();
    /* the pass must see new orders within seconds: pull every 10 s while this tab is open */
    kdsTimer = setInterval(function () { if (BACKEND && !syncing) runSync(); renderKitchen(); }, 10000);
  }
  window.scrollTo(0, 0);
}

/* ====== OWNER DASHBOARD ====== */
function hourLabel(h) { return (h % 12 || 12) + (h < 12 ? 'a' : 'p'); }
function drawChart(cols) {
  var max = 0, peak = -1, h = '';
  cols.forEach(function (c, i) { if (c.v > max) { max = c.v; peak = i; } });
  cols.forEach(function (c, i) {
    var pct = max ? Math.max(2, Math.round(c.v / max * 100)) : 2;
    h += '<div class="col' + (i === peak ? ' peak' : '') + (c.v ? '' : ' zero') + '" title="' + esc(c.t) + ': ' + money(c.v) + '">' +
      '<span class="col-v">' + (c.v ? (c.v >= 10000 ? (c.v / 1000).toFixed(c.v >= 100000 ? 0 : 1) + 'k' : n0(c.v)) : '') + '</span>' +
      '<span class="col-b" style="height:' + (c.v ? pct : 2) + '%"></span><span class="col-l">' + esc(c.l) + '</span></div>';
  });
  $('chart').innerHTML = h;
}
function renderChart(list) {
  var cols = [], i;
  if (period === 'today') {
    var by = {}; list.forEach(function (o) { var clock = displayClock(o); if (!clock) return; var hr = clock.h; by[hr] = (by[hr] || 0) + o.total; });
    var hrs = []; for (i = 0; i < 24; i++) hrs.push((DAY_CUTOFF_HOUR + i) % 24);
    var a = hrs.indexOf(11), b = hrs.indexOf(2);
    if (a < 0 || b < a) { a = 0; b = 23; }
    hrs.forEach(function (hr, ix) { if (by[hr]) { if (ix < a) a = ix; if (ix > b) b = ix; } });
    for (i = a; i <= b; i++) cols.push({ l: hourLabel(hrs[i]), t: hourLabel(hrs[i]) + 'm', v: by[hrs[i]] || 0 });
    $('chartTitle').textContent = 'Sales by hour';
  } else {
    var byDay = {}, days = bizDate().getDate(), ym = curMonth();
    list.forEach(function (o) { if (o.iso) byDay[o.iso] = (byDay[o.iso] || 0) + o.total; });
    for (i = 1; i <= days; i++) { var iso = ym + '-' + ('0' + i).slice(-2); cols.push({ l: String(i), t: iso, v: byDay[iso] || 0 }); }
    $('chartTitle').textContent = 'Sales by day this month';
  }
  drawChart(cols);
}
function renderVoid() {
  var list = voidAll ? voided : voided.filter(inPeriodVoid);
  if (!list.length) { $('voidList').innerHTML = none('No voided orders.'); return; }
  var lost = 0; list.forEach(function (v) { lost += v.total; });
  var h = '<div class="banner">' + list.length + ' voided, ' + money(lost) + ' removed from sales</div>';
  for (var i = list.length - 1; i >= 0; i--) {
    var v = list[i];
    h += '<div class="row void"><div class="row-main"><h3><span class="num">#' + pad(v.no) + '</span>' + money(v.total) + '</h3>' +
      '<p>' + esc(itemsText(v)) + '</p><p>' + esc(v.customer) + ', ' + esc(v.payment) + ', rung at ' + esc(shortTime(v)) + '</p>' +
      '<p>Voided ' + esc(v.voidedAt || '') + ' on ' + esc(v.voidedDate || '') + (v.voidedBy ? ' by ' + esc(v.voidedBy) : '') + (v.reason ? ': ' + esc(v.reason) : '') + '</p></div></div>';
  }
  $('voidList').innerHTML = h;
}
/* Sales by waiter (11 Oct 2026): orders, sales, average ticket and tips to the kitchen (notes) per waiter, for the chosen period. */
function renderWaiterSales(t) {
  var box = $('waiterRows'); if (!box) return;
  var by = {}, noWaiter = 0, total = 0;
  t.forEach(function (o) {
    total += o.total;
    if (!o.waiter) { if (!o.remake && !o.adj) noWaiter++; return; }
    var w = by[o.waiter] || (by[o.waiter] = { n: 0, sales: 0, items: 0, deals: 0, remakes: 0 });
    if (o.remake) { w.remakes++; return; }
    if (o.adj) { w.sales += o.total; return; }
    w.n++; w.sales += o.total; w.items += itemCount(o); if (o.deal) w.deals++;
  });
  var names = Object.keys(by).sort(function (a, b) { return by[b].sales - by[a].sales; });
  box.innerHTML = (names.length ? names.map(function (n) {
    var w = by[n];
    return '<div class="row person"><div class="row-main"><h3>' + faceHtml(n) + esc(n) + '</h3><p>' + w.n + (w.n === 1 ? ' order, ' : ' orders, ') + w.items + (w.items === 1 ? ' item' : ' items') + (w.n ? ', average ' + n0(w.sales / w.n) : '') + (w.deals ? ', ' + w.deals + ' on a card deal' : '') +
      (total ? ', ' + Math.round(w.sales * 100 / total) + '% of sales' : '') + (w.remakes ? ', <b>' + w.remakes + (w.remakes === 1 ? ' remake' : ' remakes') + '</b>' : '') + '</p></div><div class="row-side"><span class="row-amt">' + n0(w.sales) + '</span></div></div>';
  }).join('') + (noWaiter ? '<p class="hint">' + noWaiter + (noWaiter === 1 ? ' order' : ' orders') + ' rung with no waiter chosen.</p>' : '')
    : '<p class="hint">No waiter chosen on any order ' + (period === 'today' ? 'today' : 'this month') + ' yet.</p>');
}
/* Griddle camera against the till (11 Oct 2026): the server posts 'feed' rows (kind griddle, one per trading day). */
function burgersRung(list) { var n = 0; list.forEach(function (o) { o.items.forEach(function (it) { if (it.c === 'Burgers') n += isCancel(it) ? -it.q : it.q; }); }); return n; }
function renderGriddleFeed(t) {
  var box = $('griddleRows'); if (!box) return;
  var feeds = more.feed.filter(function (f) { return f.kind === 'griddle' && inPeriod({ iso: f.day }); }).sort(function (a, b) { return a.day < b.day ? 1 : -1; });
  if (!feeds.length) { box.innerHTML = '<p class="hint">No camera figures ' + (period === 'today' ? 'today' : 'this month') + ' yet. They arrive from the griddle camera every two minutes while it is on.</p>'; return; }
  var h = '', seenAll = 0, rungAll = 0, modernAll = false, excluded = 0;
  feeds.forEach(function (f) {
    var rung = burgersRung(t.filter(function (o) { return o.iso === f.day; })), seen = num(f.burgers), diff = seen - rung;
    var modern = ['patties_counter', 'patties_live', 'burgers_why', 'tickets_complete', 'ticket_burgers', 'burgers_basis'].some(function (k) { return Object.prototype.hasOwnProperty.call(f, k); });
    modernAll = modernAll || modern;
    var comparable = !modern || (f.tickets_complete !== false && !f.burgers_why);
    if (comparable) { seenAll += seen; rungAll += rung; } else excluded++;
    if (modern) {
      var why = String(f.burgers_why || ('not comparable: ' + (f.tickets_basis ? f.tickets_basis + ' tickets incomplete' : 'tickets incomplete')));
      if (!/^not comparable/i.test(why)) why = 'not comparable: ' + why;
      h += '<div class="row"><div class="row-main"><h3>' + (period === 'today' ? 'Today' : esc(dayWord(f.day))) + ': ' +
        (comparable ? 'about ' + seen + ' seen, ' + rung + ' rung' + (seen ? ' <span class="badge ' + (diff > 2 ? 'Unpaid' : 'Cash') + '">' + (diff > 0 ? diff + ' more on the griddle' : diff < 0 ? (-diff) + ' more on the till' : 'matches') + '</span>' : '') : esc(why) + ', ' + rung + ' rung') + '</h3>' +
        '<p>' + num(f.patties) + ' official patties (' + esc(f.patties_counter || 'counter unspecified') + ')' + (f.patties_why ? ': ' + esc(f.patties_why) : '') + '</p>' +
        '<p>Live patties: ' + (f.patties_live == null ? 'not available' : num(f.patties_live)) + '</p>' +
        '<p>' + num(f.doubles) + ' doubles, ' + num(f.singles) + ' singles, ' + num(f.cheese) + ' cheese' +
        (f.ticket_burgers != null ? ', ' + num(f.ticket_burgers) + ' burgers on tickets' : '') + (f.tickets_basis ? ' (' + esc(f.tickets_basis) + ')' : '') +
        (f.pass_burgers ? ', ' + num(f.pass_burgers) + ' handed out at the pass' : '') + (f.first ? ', griddle ' + esc(f.first) + ' to ' + esc(f.last) : '') +
        (num(f.bare_hands) ? ', bare hands seen ' + num(f.bare_hands) + '×' : '') + '</p>' +
        (comparable && f.burgers_basis ? '<p>' + esc(f.burgers_basis) + '</p>' : '') + '</div></div>';
      return;
    }
    h += '<div class="row"><div class="row-main"><h3>' + (period === 'today' ? 'Today' : esc(dayWord(f.day))) + ': about ' + seen + ' seen, ' + rung + ' rung' +
      (seen ? ' <span class="badge ' + (diff > 2 ? 'Unpaid' : 'Cash') + '">' + (diff > 0 ? diff + ' more on the griddle' : diff < 0 ? (-diff) + ' more on the till' : 'matches') + '</span>' : '') + '</h3>' +
      '<p>' + num(f.patties) + ' patties (' + num(f.doubles) + ' doubles, ' + num(f.singles) + ' singles), ' + num(f.cheese) + ' cheese' +
      (f.pass_burgers ? ', ' + num(f.pass_burgers) + ' handed out at the pass' : '') + (f.first ? ', griddle ' + esc(f.first) + ' to ' + esc(f.last) : '') +
      (num(f.bare_hands) ? ', bare hands seen ' + num(f.bare_hands) + '×' : '') + '</p></div></div>';
  });
  if (modernAll) {
    h = (feeds.length > 1 ? '<p class="hint">' + (feeds.length - excluded) + ' comparable days: about ' + seenAll + ' seen on the griddle, ' + rungAll + ' rung on the till' + (feeds.length > excluded ? ', difference ' + (seenAll - rungAll) : '') + '.' + (excluded ? ' ' + excluded + ' days not comparable; excluded from totals.' : '') + '</p>' : '') + h + '<p class="hint">An estimate; a gap is a reason to look, not proof of an unrung sale. The camera cannot tell who rang what.</p>';
  } else if (feeds.length > 1) h = '<p class="hint">' + feeds.length + ' days: about ' + seenAll + ' seen on the griddle, ' + rungAll + ' rung on the till, difference ' + (seenAll - rungAll) + '. Bun halves divided by two, an estimate; a gap is a reason to look, not proof.</p>' + h;
  else h += '<p class="hint">Bun halves toasted, divided by two, against lines in the Burgers category. An estimate; a gap is a reason to look, not proof of an unrung sale. The camera cannot tell who rang what.</p>';
  box.innerHTML = h;
}
/* Waiter shift sign-off (11 Oct 2026): each waiter confirms their own day's figures; 'signoffs' records. */
function waiterDay(iso) {
  var by = {};
  orders.forEach(function (o) {
    if (o.iso !== iso || !o.waiter || o.remake) return;
    var w = by[o.waiter] || (by[o.waiter] = { orders: 0, cash: 0, card: 0, transfer: 0, unpaid: 0 });
    if (o.adj) { var kk = String(o.payment).toLowerCase(); if (w[kk] != null) w[kk] += o.total; return; }
    w.orders++; var k = String(o.payment).toLowerCase(); if (w[k] != null) w[k] += o.total;
  });
  return by;
}
function signoffOf(iso, name) { for (var i = 0; i < more.signoffs.length; i++) { var x = more.signoffs[i]; if (x.iso === iso && x.name === name && !x.deleted) return x; } return null; }
function renderSignoffs() {
  var iso = isoNow(), by = waiterDay(iso), names = Object.keys(by).sort(), h = '';
  if (isRole('waiter')) names = names.filter(function (n) { return n === me.name; });
  names.forEach(function (n) {
    var w = by[n], sg = signoffOf(iso, n);
    h += '<div class="row person"><div class="row-main"><h3>' + faceHtml(n) + esc(n) + (sg ? ' <span class="badge Cash">Signed ' + esc(String(sg.at).replace(/:\d\d$/, '')) + '</span>' : '') + '</h3>' +
      '<p>' + w.orders + (w.orders === 1 ? ' order' : ' orders') + ', cash ' + n0(w.cash) + ', card ' + n0(w.card) + (w.transfer ? ', transfer ' + n0(w.transfer) : '') + (w.unpaid ? ', unpaid ' + n0(w.unpaid) : '') +
      (sg && (sg.orders !== w.orders || sg.cash !== w.cash) ? ' <span class="badge Unpaid">changed since signing</span>' : '') + '</p></div>' +
      '<div class="row-side">' + (sg || (rolesOn && role === 'barista' && !(me && me.name === n)) ? '' : '<button type="button" class="btn sm primary" data-act="sign-ask" data-v="' + esc(n) + '">Sign</button>') + '</div></div>';
  });
  ['signRows', 'signRowsO', 'signRowsW'].forEach(function (id) { if ($(id)) $(id).innerHTML = h || '<p class="hint">No orders with a waiter today yet.</p>'; });
}
function askSignoff(name) {
  var w = waiterDay(isoNow())[name]; if (!w) return;
  openModal('<h2 id="modalTitle">' + faceHtml(name, true) + '</h2><p class="deal-tier"><b>' + esc(name) + '</b>, today</p>' +
    '<div class="stats"><div class="stat"><span class="stat-l">Orders</span><b class="num">' + w.orders + '</b></div><div class="stat"><span class="stat-l">Cash taken</span><b class="num">' + n0(w.cash) + '</b></div>' +
    '<div class="stat"><span class="stat-l">Card</span><b class="num">' + n0(w.card) + '</b></div><div class="stat warn"><span class="stat-l">Unpaid</span><b class="num">' + n0(w.unpaid) + '</b></div></div>' +
    '<p class="deal-note">Signing says these are your orders and this is the cash you handed in. The owner sees who has signed.</p>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Not yet</button>' +
    '<button type="button" class="btn primary" data-act="sign-now" data-v="' + esc(name) + '">That is right, sign</button></div>');
}
function signNow(name) {
  var w = waiterDay(isoNow())[name]; if (!w || signoffOf(isoNow(), name)) { closeModal(); return; }
  var r = { id: newId(), iso: isoNow(), name: name, orders: w.orders, cash: w.cash, card: w.card, transfer: w.transfer, unpaid: w.unpaid, at: timeNow(), by: whoName(), u: 0 };
  more.signoffs.push(r); stamp(r); commit('signoffs', r.id); closeModal(); renderSignoffs(); toast(name + ' signed off');
}
function renderOwner() {
  var t = orders.filter(inPeriod), ex = liveExpenses().filter(inPeriod);
  var sales = 0, cogs = 0, disc = 0, exp = 0, i, h, sn;
  var pay = { Cash: 0, Card: 0, Transfer: 0, Unpaid: 0 }, deal = 0, dealN = 0, dealBy = {}, byWaiter = {}, remakes = 0, remakeCost = 0, remakeWhy = {}, rewards = 0, bySvc = {}, changes = 0, changeNet = 0, adjs = 0;
  t.forEach(function (o) {
    if (o.edits) o.edits.forEach(function (e) { changes++; changeNet += num(e.now) - num(e.was); });
    if (o.adj) { adjs++; }
    if (o.svc && !o.remake && !o.adj) { var sv = bySvc[o.svc] || (bySvc[o.svc] = { n: 0, sales: 0 }); sv.n++; sv.sales += o.total; }
    if (o.remake) { remakes++; remakeCost += o.cogs; remakeWhy[o.remake.why] = (remakeWhy[o.remake.why] || 0) + 1; }
    if (o.reward) rewards++;
    sales += o.total; cogs += o.cogs; disc += o.discount || 0; if (pay[o.payment] != null) pay[o.payment] += o.total;
    if (o.deal) { deal += o.discount || 0; dealN++; var k = o.deal.bank + ' ' + o.deal.pct + '%'; dealBy[k] = (dealBy[k] || 0) + 1; }
    if (o.waiter) byWaiter[o.waiter] = (byWaiter[o.waiter] || 0) + 1;
  });
  if ($('sWaiters')) {
    var wn = Object.keys(byWaiter).sort(function (a, b) { return byWaiter[b] - byWaiter[a]; });
    $('sWaiters').textContent = wn.length ? 'by waiter: ' + wn.map(function (n) { return n + ' ' + byWaiter[n]; }).join(', ') : '';
  }
  renderWaiterSales(t);
  renderGriddleFeed(t);
  if ($('sRepeat')) {
    var seen = {}, withPhone = 0, repeat = 0;
    orders.slice().sort(function (a, b) { return a.id - b.id; }).forEach(function (o) {
      if (!o.phone) return;
      if (inPeriod(o)) { withPhone++; if (seen[o.phone]) repeat++; }
      seen[o.phone] = 1;
    });
    $('sRepeat').textContent = repeat;
    $('sRepeatNote').textContent = withPhone ? 'of ' + withPhone + ' with a phone number' : 'no phone numbers taken';
  }
  var stockBought = 0;
  ex.forEach(function (e) { if (e.type === 'run') exp += e.amount; else stockBought += e.amount; });
  var gross = sales - cogs, net = gross - exp;
  var unp = unpaidAll(), unpTot = 0; unp.forEach(function (o) { unpTot += o.total; });
  var word = period === 'today' ? 'today' : 'this month';

  setNum('sNet', net); $('sNet').parentNode.classList.toggle('neg', net < 0);
  $('heroEq').textContent = 'Sales ' + n0(sales) + ', less ingredients ' + n0(cogs) + ' and running costs ' + n0(exp) + '.' +
    (stockBought ? ' Stock bought (' + n0(stockBought) + ') is not taken off again.' : '') +
    (pay.Unpaid ? ' ' + n0(pay.Unpaid) + ' of these sales is not paid yet.' : '');
  setNum('sSales', sales); setNum('sCogs', cogs); setNum('sGross', gross); setNum('sExp', exp);
  setNum('sOrders', t.length - remakes - adjs); setNum('sDisc', disc); setNum('sStock', stockBought); setNum('sUnpaid', unpTot);
  if ($('sChanges')) { setNum('sChanges', changes); $('sChangesNote').textContent = changes ? 'net ' + (changeNet >= 0 ? '+' : '') + n0(changeNet) + (adjs ? ', ' + adjs + ' rung as a separate line' : '') + '; clips on the exceptions page' : ''; }
  if ($('sService')) {
    var sk = Object.keys(bySvc).sort(function (a, b) { return bySvc[b].sales - bySvc[a].sales; });
    $('sService').textContent = sk.length ? sk.map(function (k) { return k + ' ' + bySvc[k].n; }).join(' · ') : '—';
    $('sServiceNote').textContent = sk.length ? sk.map(function (k) { return k + ' ' + n0(bySvc[k].sales); }).join(', ') : '';
  }
  if ($('sRemake')) {
    setNum('sRemake', remakes);
    var rw = Object.keys(remakeWhy).sort(function (a, b) { return remakeWhy[b] - remakeWhy[a]; });
    $('sRemakeNote').textContent = remakes ? 'cost ' + n0(remakeCost) + ', ' + rw.map(function (w) { return w.toLowerCase() + ' ' + remakeWhy[w]; }).join(', ') + (rewards ? '; ' + rewards + ' loyalty free' : '') : (rewards ? rewards + ' loyalty free item' + (rewards === 1 ? '' : 's') : '');
  }
  if ($('sDeal')) {
    setNum('sDeal', deal);
    $('sDealNote').textContent = dealN ? dealN + (dealN === 1 ? ' order' : ' orders') + Object.keys(dealBy).sort().map(function (k) { return ', ' + k + ': ' + dealBy[k]; }).join('') : 'none ' + word;
  }
  if ($('sPass')) {
    var pm = t.map(passMinutes).filter(function (x) { return x != null; });
    var avg = pm.length ? pm.reduce(function (a, b) { return a + b; }, 0) / pm.length : null;
    var slow = pm.filter(function (x) { return x >= 8; }).length;
    $('sPass').textContent = avg == null ? '—' : avg.toFixed(1);
    $('sPassNote').textContent = avg == null ? 'no served times yet' : pm.length + ' timed' + (slow ? ', ' + slow + ' over 8 min' : '');
  }
  $('periodLbl').textContent = word; $('expPeriodLbl').textContent = word;
  $('bizDayO').textContent = bizLabel();

  h = ''; var lg = '';
  ['Cash', 'Card', 'Transfer', 'Unpaid'].forEach(function (p) {
    h += '<i class="pc-' + p + '" style="flex-grow:' + (pay[p] || 0) + '"></i>';
    lg += '<span><i class="pc-' + p + '"></i>' + (p === 'Unpaid' ? 'Not paid yet' : p) + ' <b>' + n0(pay[p]) + '</b></span>';
  });
  $('payBar').innerHTML = sales ? h : ''; $('payLegend').innerHTML = lg;
  renderChart(t);

  var cats = {}, chans = {};
  t.forEach(function (o) {
    /* share the order's discount and its packaging cost across its lines, so sections add up to Sales */
    var list = 0, cost = 0;
    o.items.forEach(function (it) { list += it.p * it.q; cost += it.k * it.q; });
    var fr = list ? o.total / list : 0, fk = cost ? o.cogs / cost : 1;
    o.items.forEach(function (it) {
      if (!cats[it.c]) cats[it.c] = { q: 0, r: 0, k: 0 };
      cats[it.c].q += it.q; cats[it.c].r += it.p * it.q * fr; cats[it.c].k += it.k * it.q * fk;
    });
    if (!chans[o.channel]) chans[o.channel] = { n: 0, r: 0 };
    chans[o.channel].n++; chans[o.channel].r += o.total;
  });
  var keys = Object.keys(cats).sort(function (a, b) { return cats[b].r - cats[a].r; }), top = keys.length ? cats[keys[0]].r : 0;
  h = '';
  keys.forEach(function (kx) {
    var d = cats[kx];
    h += '<div class="bar"><div class="bar-top"><span>' + esc(kx) + ' ×' + d.q + '</span><span>' + n0(d.r) + '</span></div>' +
      '<div class="track"><i style="width:' + (top ? Math.max(3, Math.round(d.r / top * 100)) : 0) + '%"></i></div>' +
      '<div class="bar-sub"><span>cost ' + n0(d.k) + '</span><span class="good">+' + n0(d.r - d.k) + ' margin</span></div></div>';
  });
  $('catList').innerHTML = h || none('No sales ' + word + ' yet.');
  h = '';
  Object.keys(chans).forEach(function (kx) {
    h += '<div class="row"><div class="row-main"><h3>' + esc(kx === 'FatMan' ? 'FatMan counter' : kx) + '</h3><p>' + chans[kx].n + (chans[kx].n === 1 ? ' order' : ' orders') + '</p></div>' +
      '<div class="row-side"><span class="row-amt">' + n0(chans[kx].r) + '</span></div></div>';
  });
  $('chanList').innerHTML = h || none('No orders ' + word + ' yet.');

  h = '';
  for (i = ex.length - 1; i >= 0; i--) {
    var e = ex[i], bits = expenseItemsText(e);
    h += '<div class="row"><div class="row-main"><h3>' + esc(e.name) + '</h3><p>' +
      (bits && e.items && e.items.length > 1 ? esc(bits) + '. ' : '') +
      (period === 'month' ? esc(dayText(e)) + ', ' : '') + esc(shortTime(e)) + ', ' + (e.type === 'run' ? 'running cost' : 'stock') + ', logged by ' + esc(e.by || 'Owner') +
      (e.till === false ? ', not from the till' : '') + '</p></div><div class="row-side"><span class="row-amt">−' + n0(e.amount) + '</span>' +
      '<button type="button" class="btn sm danger" data-act="ask-del-exp" data-id="' + e.id + '">Delete</button></div></div>';
  }
  $('expList').innerHTML = h || none('No expenses ' + word + '.');

  h = '';
  sn = 0;
  for (i = unp.length - 1; i >= 0; i--) { sn++; h += unpaidRow(unp[i], true, sn); }
  $('oUnpaid').innerHTML = h || none('Nothing unpaid.');

  h = '';
  for (i = t.length - 1; i >= 0; i--) {
    var o = t[i];
    h += '<div class="row"><div class="row-main"><h3><span class="num">#' + pad(o.no) + '</span>' + (o.remake ? '<span class="badge Unpaid">Remake of #' + pad(o.remake.no) + ', ' + esc(o.remake.why) + '</span>' : o.adj ? '<span class="badge Unpaid">Change to #' + pad(o.adj.no) + ', ' + esc(o.adj.why) + '</span>' + badge(o.payment) : badge(o.payment)) +
      (o.edits ? o.edits.map(function (e) { return ' <span class="badge Unpaid">' + esc(e.d) + ', ' + esc(e.why) + ', ' + esc(e.by || '') + '</span>'; }).join('') : '') + '</h3>' +
      '<p>' + esc(itemsText(o)) + '</p><p>' + esc(o.customer) + ', ' + (period === 'month' ? esc(dayText(o)) + ' ' : '') + esc(shortTime(o)) + ', ' + esc(channelLabel(o.channel)) + (o.by ? ', by ' + esc(o.by) : '') + (passMinutes(o) != null ? ', to pass ' + passMinutes(o).toFixed(1) + ' min' : '') +
      (o.discount > 0 ? ', ' + (o.deal ? esc(o.deal.bank) + ' deal ' : 'discount ') + (o.discountPct ? o.discountPct + '% = ' : '') + n0(o.discount) : '') + (o.waiter ? ', waiter ' + esc(o.waiter) : '') + (o.note ? '<br>Note: ' + esc(o.note) : '') + '</p></div>' +
      '<div class="row-side"><span class="row-amt">' + n0(o.total) + '<small>+' + n0(o.total - o.cogs) + '</small></span>' +
      '<button type="button" class="btn sm secondary" data-act="reprint" data-id="' + o.id + '">Reprint</button>' +
      (KITCHEN_SLIP ? '<button type="button" class="btn sm secondary" data-act="rekitchen" data-id="' + o.id + '">Kitchen again</button>' : '') +
      (o.remake || o.adj ? '' : '<button type="button" class="btn sm secondary" data-act="remake-ask" data-id="' + o.id + '">Remake</button>' +
        (isToday(o) ? '<button type="button" class="btn sm secondary" data-act="chg-ask" data-id="' + o.id + '">Change</button>' : '')) +
      '<button type="button" class="btn sm danger" data-act="ask-void" data-id="' + o.id + '">Void</button></div></div>';
  }
  $('oOrders').innerHTML = h || none('No orders ' + word + '.');

  fillStockSelect('oExpStock', 'oExpQty');
  $('matchaMode').value = matchaLocal ? 'local' : 'prem';
  setSeg('paperSeg', paper80 ? '80' : '58');
  var kb = 0; try { kb = Math.round((localStorage.getItem(KEY) || '').length / 1024); } catch (err) {}
  $('storeInfo').textContent = BACKEND
    ? orders.length + ' recent orders on this device (about ' + kb.toLocaleString() + ' KB). The server keeps the full history; this device keeps the last ' + KEEP_DAYS + ' days.'
    : orders.length + ' orders kept on this device, using about ' + kb.toLocaleString() + ' KB of roughly 5,000.' + (kb > 4000 ? ' Nearly full: download a full backup now.' : '');
  $('pinHint').textContent = BACKEND
    ? 'Type a new PIN. It changes on the server, and every device asks for it at the next sign-in.'
    : 'PINs live in the file config.js so they are the same on every device. Type a new PIN here to get the line to paste into that file, then upload the folder to Netlify again.';
  $('pinGo').textContent = BACKEND ? 'Change PIN' : 'Make the line';
  $('pinOutRow').classList.toggle('hidden', !BACKEND);
  renderVoid();
}
function refreshAll() {
  if (role === 'barista') { renderOrdersTab(); if (ui.tab === 'till') { renderTill(); renderSignoffs(); renderOuts(); } if (ui.tab === 'kitchen') renderKitchen(); }
  else if (role === 'owner') { renderOwner(); renderAccounts(); renderDays(); renderStock(); renderPeople(); renderSignoffs(); renderOuts(); renderPass(); if (VENDORS_ON) renderShelf(); }
  if ($('vendorDelBtn')) $('vendorDelBtn').classList.toggle('hidden', !VENDORS_ON || !liveVendors().length);
}


/* ====== THE VENDOR SHELF (10 Oct 2026): other brands' products sold here on consignment ======
   A vendor has items with a shelf price they set. Whipped keeps a cut of each sale (25% unless set otherwise).
   Deliveries and returns are counted by item; sold lines carry v (vendor) and vi (item) on the order.
   Settlement is weekly, Monday to Sunday: sold at shelf price, less the cut, is what the vendor is owed. */
function liveVendors() { return (more.vendors || []).filter(function (v) { return !v.deleted; }); }
function vendorById(id) { for (var i = 0; i < (more.vendors || []).length; i++) if (more.vendors[i].id === id) return more.vendors[i]; return null; }
function vendorItems(v) { return (v && Array.isArray(v.items) ? v.items : []).filter(function (it) { return !it.deleted; }); }
function vendorItem(v, vi) { var its = v && Array.isArray(v.items) ? v.items : []; for (var i = 0; i < its.length; i++) if (its[i].id === vi) return its[i]; return null; }
function liveVendorMoves() { return (more.vendormoves || []).filter(function (m) { return !m.deleted; }); }
/* Shelf items appear on the Sell screen under "Shelf", tagged with whose they are. */
function shelfMenu() {
  if (!VENDORS_ON) return;
  for (var i = MENU.length - 1; i >= 0; i--) if (MENU[i].shelf) MENU.splice(i, 1);
  liveVendors().forEach(function (v) {
    /* the vendor's share is the cost of a shelf item, so the till's margin on it is our cut and nothing more */
    vendorItems(v).forEach(function (it) { MENU.push({ c: 'Shelf', n: it.n, p: num(it.p), k: Math.round(num(it.p) * (1 - (num(v.cut) || 0.25))), v: v.id, vi: it.id, shelf: true, i: 'food', vendor: v.name }); });
  });
}
function mondayOf(iso) { var d = new Date(iso + 'T12:00:00'); var wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return isoOf(d); }
function plusDays(iso, n) { var d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return isoOf(d); }
/* Every sold line of a vendor's items, optionally inside a day range (inclusive). */
function vendorSales(vid, from, to) {
  var out = [];
  orders.forEach(function (o) {
    if (from && (o.iso || '') < from) return; if (to && (o.iso || '') > to) return;
    (o.items || []).forEach(function (it) { if (it.v === vid) out.push({ o: o, it: it }); });
  });
  return out;
}
/* What should be on the shelf now, per item: delivered, less returned, less sold. */
function shelfStock(v) {
  var by = {};
  vendorItems(v).forEach(function (it) { by[it.id] = { it: it, delivered: 0, returned: 0, sold: 0 }; });
  liveVendorMoves().forEach(function (m) {
    if (m.v !== v.id || !Array.isArray(m.lines)) return;
    m.lines.forEach(function (l) { if (by[l.i]) { if (m.kind === 'delivery') by[l.i].delivered += num(l.q); if (m.kind === 'return') by[l.i].returned += num(l.q); } });
  });
  vendorSales(v.id).forEach(function (s) { if (by[s.it.vi]) by[s.it.vi].sold += s.it.q; });
  return Object.keys(by).map(function (k) { var b = by[k]; b.onHand = b.delivered - b.returned - b.sold; return b; });
}
function settlementFor(v, week) {
  var to = plusDays(week, 6), lines = {}, gross = 0;
  vendorSales(v.id, week, to).forEach(function (s) {
    var l = lines[s.it.vi] || (lines[s.it.vi] = { n: s.it.n, q: 0, amount: 0, p: s.it.p });
    l.q += s.it.q; l.amount += s.it.p * s.it.q; gross += s.it.p * s.it.q;
  });
  var returned = 0;
  liveVendorMoves().forEach(function (m) { if (m.v === v.id && m.kind === 'return' && m.iso >= week && m.iso <= to) (m.lines || []).forEach(function (l) { returned += num(l.q); }); });
  var cut = Math.round(gross * (num(v.cut) || 0.25)), settled = null;
  liveVendorMoves().forEach(function (m) { if (m.v === v.id && m.kind === 'settle' && m.week === week) settled = m; });
  return { week: week, to: to, lines: Object.keys(lines).map(function (k) { return lines[k]; }), gross: gross, cut: cut, due: gross - cut, returned: returned, settled: settled };
}
function vendorStatement(vid, week) {
  var v = vendorById(vid); if (!v) return '';
  var s = settlementFor(v, week), out = [BRAND.name + ' shelf statement for ' + v.name, 'Week ' + week + ' to ' + s.to, ''];
  s.lines.forEach(function (l) { out.push(l.n + ' x' + l.q + ' at ' + n0(l.p) + ' = ' + n0(l.amount)); });
  if (!s.lines.length) out.push('Nothing sold this week.');
  out.push('', 'Sold at shelf price: ' + n0(s.gross), BRAND.name + ' ' + Math.round((num(v.cut) || 0.25) * 100) + '%: ' + n0(s.cut), 'Due to ' + v.name + ': ' + n0(s.due));
  if (s.returned) out.push('Returned to you this week: ' + s.returned + ' pcs');
  var onShelf = shelfStock(v).map(function (b) { return b.it.n + ' ' + b.onHand; }).join(', ');
  if (onShelf) out.push('On the shelf now: ' + onShelf);
  out.push('', s.settled ? 'Settled ' + s.settled.iso + (s.settled.by ? ' by ' + s.settled.by : '') : 'Not settled yet');
  return out.join('\n');
}
function renderShelf() {
  var el = $('shelfList'); if (!el) return;
  var vs = liveVendors(), h = '', thisWeek = mondayOf(isoNow()), lastWeek = plusDays(thisWeek, -7);
  if (!vs.length) { el.innerHTML = none('No vendors yet. Add the first brand that puts its products on the shelf.'); $('shelfNote').textContent = ''; return; }
  var dueAll = 0;
  vs.forEach(function (v) {
    var st = shelfStock(v), tw = settlementFor(v, thisWeek), lw = settlementFor(v, lastWeek);
    if (!lw.settled) dueAll += lw.due;
    h += '<div class="card pad vendor"><div class="row-main"><h3>' + esc(v.name) + ' <small>' + Math.round((num(v.cut) || 0.25) * 100) + '% to ' + esc(BRAND.name) + (v.phone ? ' · ' + esc(v.phone) : '') + '</small></h3></div>' +
      '<div class="btn-row"><button type="button" class="btn secondary small" data-act="vendor-edit" data-id="' + v.id + '">Edit vendor</button>' +
      '<button type="button" class="btn secondary small" data-act="vitem-edit" data-id="' + v.id + '" data-vi="0">Add an item</button>' +
      '<button type="button" class="btn secondary small" data-act="vdel-ask" data-id="' + v.id + '">Delivery</button>' +
      '<button type="button" class="btn secondary small" data-act="vret-ask" data-id="' + v.id + '">Return</button></div>';
    h += '<table class="plain"><tr><th>Item</th><th>Price</th><th>Delivered</th><th>Sold</th><th>Returned</th><th>On shelf</th><th></th></tr>';
    st.forEach(function (b) {
      h += '<tr><td>' + esc(b.it.n) + '</td><td>' + n0(b.it.p) + '</td><td>' + b.delivered + '</td><td>' + b.sold + '</td><td>' + b.returned + '</td><td' + (b.onHand < 0 ? ' class="neg"' : '') + '>' + b.onHand + '</td>' +
        '<td><button type="button" class="btn link small" data-act="vitem-edit" data-id="' + v.id + '" data-vi="' + b.it.id + '">edit</button></td></tr>';
    });
    if (!st.length) h += '<tr><td colspan="7">No items yet.</td></tr>';
    h += '</table>';
    [lw, tw].forEach(function (s, k) {
      h += '<div class="settle' + (s.settled ? ' done' : '') + '"><div class="row-main"><h3>' + (k === 0 ? 'Last week' : 'This week') + ' · ' + esc(s.week.slice(5)) + ' to ' + esc(s.to.slice(5)) + '</h3>' +
        '<p>Sold ' + n0(s.gross) + ' · ' + esc(BRAND.name) + ' keeps ' + n0(s.cut) + ' · <b>due ' + n0(s.due) + '</b>' + (s.returned ? ' · ' + s.returned + ' returned' : '') +
        (s.settled ? ' · settled ' + esc(s.settled.iso) + (s.settled.by ? ' by ' + esc(s.settled.by) : '') : '') + '</p></div>' +
        '<div class="btn-row"><button type="button" class="btn secondary small" data-act="vstatement" data-id="' + v.id + '" data-week="' + s.week + '">Copy statement</button>' +
        (k === 0 && !s.settled && s.gross ? '<button type="button" class="btn primary small" data-act="vsettle" data-id="' + v.id + '" data-week="' + s.week + '">Mark settled</button>' : '') + '</div></div>';
    });
    h += '</div>';
  });
  el.innerHTML = h;
  $('shelfNote').textContent = vs.length + ' vendor' + (vs.length > 1 ? 's' : '') + (dueAll ? ' · ' + n0(dueAll) + ' owed for last week, not yet settled' : ' · last week settled');
}
function askVendor(id) {
  var v = vendorById(id) || { id: 0, name: '', phone: '', cut: 0.25 };
  openModal('<h2 id="modalTitle">' + (v.id ? 'Edit ' + esc(v.name) : 'Add a vendor') + '</h2>' +
    '<label for="vnName">Brand or vendor</label><input type="text" id="vnName" maxlength="40" value="' + esc(v.name) + '" placeholder="Baked">' +
    '<label for="vnPhone">WhatsApp number</label><input type="text" id="vnPhone" maxlength="20" inputmode="tel" value="' + esc(v.phone || '') + '" placeholder="0300 1234567">' +
    '<label for="vnCut">' + esc(BRAND.name) + ' keeps, percent of each sale</label><input type="number" id="vnCut" inputmode="decimal" min="0" max="100" value="' + Math.round((num(v.cut) || 0.25) * 100) + '">' +
    '<div class="modal-actions">' + (v.id ? '<button type="button" class="btn danger" data-act="vendor-del" data-id="' + v.id + '">Remove</button>' : '<button type="button" class="btn secondary" data-act="close-modal">Cancel</button>') +
    '<button type="button" class="btn primary" data-act="vendor-save" data-id="' + num(v.id) + '">Save</button></div>');
}
function saveVendor(id) {
  var name = $('vnName').value.trim(), cut = parseFloat($('vnCut').value);
  if (!name || isNaN(cut) || cut < 0 || cut > 100) { toast('Give the vendor a name and the percentage'); return; }
  var v = vendorById(id);
  if (!v) { v = { id: newId(), u: 0, items: [] }; more.vendors.push(v); }
  v.name = txt(name, 40); v.phone = txt($('vnPhone').value.trim(), 20); v.cut = Math.round(cut) / 100;
  stamp(v); commit('vendors', v.id); shelfMenu(); closeModal(); refreshAll(); toast(v.name + ' saved');
}
function delVendor(id) {
  var v = vendorById(id); if (!v) return;
  if (!confirm('Remove ' + v.name + ' from the shelf? Past sales and statements stay.')) return;
  v.deleted = true; stamp(v); commit('vendors', v.id); shelfMenu(); closeModal(); refreshAll();
}
function askVendorItem(vid, vi) {
  var v = vendorById(vid); if (!v) return;
  var it = vendorItem(v, vi) || { id: 0, n: '', p: '' };
  openModal('<h2 id="modalTitle">' + (it.id ? 'Edit ' + esc(it.n) : 'Add an item for ' + esc(v.name)) + '</h2>' +
    '<label for="viName">Item</label><input type="text" id="viName" maxlength="60" value="' + esc(it.n) + '" placeholder="Brownie box of 4">' +
    '<label for="viPrice">Shelf price, set by the vendor, PKR</label><input type="number" id="viPrice" inputmode="numeric" min="0" value="' + esc(it.p) + '" placeholder="0">' +
    '<div class="modal-actions">' + (it.id ? '<button type="button" class="btn danger" data-act="vitem-del" data-id="' + v.id + '" data-vi="' + it.id + '">Remove</button>' : '<button type="button" class="btn secondary" data-act="close-modal">Cancel</button>') +
    '<button type="button" class="btn primary" data-act="vitem-save" data-id="' + v.id + '" data-vi="' + num(it.id) + '">Save</button></div>');
}
function saveVendorItem(vid, vi) {
  var v = vendorById(vid); if (!v) return;
  var n = $('viName').value.trim(), p = parseFloat($('viPrice').value);
  if (!n || !(p >= 0)) { toast('Name and price, please'); return; }
  var it = vendorItem(v, vi);
  if (!it) { it = { id: newId() }; v.items = Array.isArray(v.items) ? v.items : []; v.items.push(it); }
  it.n = txt(n, 60); it.p = Math.round(p); delete it.deleted;
  stamp(v); commit('vendors', v.id); shelfMenu(); closeModal(); refreshAll(); toast(it.n + ' saved');
}
function delVendorItem(vid, vi) {
  var v = vendorById(vid), it = v && vendorItem(v, vi); if (!it) return;
  it.deleted = true; stamp(v); commit('vendors', v.id); shelfMenu(); closeModal(); refreshAll();
}
function askVendorMove(kind, vid) {
  var vs = liveVendors(); if (!vs.length) { toast('No vendors yet'); return; }
  var v = vendorById(vid) || vs[0];
  var h = '<h2 id="modalTitle">' + (kind === 'delivery' ? 'Delivery from ' : 'Return to ') + esc(v.name) + '</h2>';
  if (vs.length > 1) h += '<label for="vmVendor">Vendor</label><select id="vmVendor" onchange="askVendorMove(\'' + kind + '\', +this.value)">' + vs.map(function (x) { return '<option value="' + x.id + '"' + (x.id === v.id ? ' selected' : '') + '>' + esc(x.name) + '</option>'; }).join('') + '</select>';
  var its = vendorItems(v);
  if (!its.length) h += '<p class="hint">This vendor has no items yet. The owner adds them under Shelf.</p>';
  its.forEach(function (it) { h += '<div class="split"><div><label>' + esc(it.n) + '</label></div><div><input type="number" class="vm-q" data-i="' + it.id + '" inputmode="numeric" min="0" placeholder="0"></div></div>'; });
  h += '<label for="vmNote">Note (optional)</label><input type="text" id="vmNote" maxlength="80" placeholder="' + (kind === 'delivery' ? 'Counted with the vendor' : 'Past best-before') + '">' +
    '<p class="hint">' + (kind === 'delivery' ? 'Count the pieces with the vendor before you save. The count is what the settlement rests on.' : 'Unsold stock going back to the vendor. It leaves the shelf count.') + '</p>' +
    '<div class="modal-actions"><button type="button" class="btn secondary" data-act="close-modal">Cancel</button><button type="button" class="btn primary" data-act="vmove-save" data-kind="' + kind + '" data-id="' + v.id + '">Save</button></div>';
  openModal(h);
}
function saveVendorMove(kind, vid) {
  var v = vendorById(vid); if (!v) return;
  var lines = [];
  [].forEach.call(document.querySelectorAll('.vm-q'), function (inp) { var q = Math.floor(num(inp.value)); if (q > 0) lines.push({ i: num(inp.getAttribute('data-i')), q: q }); });
  if (!lines.length) { toast('Enter at least one quantity'); return; }
  var m = { id: newId(), v: v.id, kind: kind === 'return' ? 'return' : 'delivery', iso: isoNow(), date: localeDay(), time: timeNow(), lines: lines, note: txt($('vmNote').value.trim(), 80), u: 0 };
  if (whoName()) m.by = whoName();
  more.vendormoves.push(m); stamp(m); commit('vendormoves', m.id); closeModal(); refreshAll();
  toast((kind === 'return' ? 'Return' : 'Delivery') + ' saved for ' + v.name);
}
function markSettled(vid, week) {
  var v = vendorById(vid); if (!v) return;
  var s = settlementFor(v, week);
  if (!confirm('Mark ' + v.name + ' settled for the week of ' + week + ': ' + n0(s.due) + ' paid to them?')) return;
  var m = { id: newId(), v: v.id, kind: 'settle', iso: isoNow(), date: localeDay(), time: timeNow(), week: week, amount: s.due, gross: s.gross, cut: s.cut, u: 0 };
  if (whoName()) m.by = whoName();
  more.vendormoves.push(m); stamp(m); commit('vendormoves', m.id); refreshAll(); toast('Settled');
}

/* ====== BACKUP ====== */
function download(name, text, type) {
  var a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: type }));
  a.download = name; document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function csvCell(v) { v = String(v == null ? '' : v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; }
function exportCsv() {
  var rows = [['Order', 'Date', 'Time', 'Customer', 'Channel', 'Service', 'Payment', 'Items', 'Note', 'Waiter', 'Subtotal', 'Discount', 'Deal', 'Total', 'Ingredient cost', 'Status', 'By', 'To pass (min)']];
  var dealCol = function (o) { return o.deal ? o.deal.bank + ' ' + o.deal.pct + '% ' + o.deal.card : ''; };
  orders.forEach(function (o) { rows.push([o.no, o.iso || o.date, o.time, o.customer, o.channel, o.svc || '', o.payment, itemsText(o), o.note || '', o.waiter || '', o.sub, o.discount, dealCol(o), o.total, Math.round(o.cogs), o.remake ? 'Remake of #' + pad(o.remake.no) + ': ' + o.remake.why : o.adj ? 'Change to #' + pad(o.adj.no) + ': ' + o.adj.why : (o.edits ? 'Sold, changed ' + o.edits.length + '× (' + o.edits.map(function (e) { return e.why; }).join('; ') + ')' : o.reward ? 'Sold, free ' + o.reward : 'Sold'), o.by || '', passMinutes(o) == null ? '' : passMinutes(o).toFixed(1)]); });
  voided.forEach(function (o) { rows.push([o.no, o.iso || o.date, o.time, o.customer, o.channel, o.svc || '', o.payment, itemsText(o), o.note || '', o.waiter || '', o.sub, o.discount, dealCol(o), o.total, Math.round(o.cogs), 'Voided' + (o.reason ? ': ' + o.reason : ''), o.voidedBy || o.by || '']); });
  download(BRAND.filePrefix + '-orders-' + isoNow() + '.csv', rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n'), 'text/csv');
}
function exportJson() { download(BRAND.filePrefix + '-backup-' + isoNow() + '.json', payload(), 'application/json'); }
function makePinLine() {
  var p = $('pinNew').value.trim(), r = $('pinRole').value, out = $('pinOut'), whoRole = r === 'owner' ? 'Owner' : 'Barista';
  out.classList.remove('hidden');
  if (!new RegExp('^\\d{' + PIN_DIGITS + '}$').test(p)) { out.innerHTML = '<span class="bad">Type exactly ' + PIN_DIGITS + ' digits.</span>'; return; }
  $('pinNew').value = '';
  if (BACKEND) {
    if (!token()) { out.innerHTML = '<span class="bad">This device is not signed in to the server. Lock, sign in again with internet, then retry.</span>'; return; }
    out.innerHTML = 'Changing\u2026';
    var kick = $('pinOut').checked;
    api('pos_set_pin', { token: token(), role: r, pin: p, signOut: kick }, function (err, res) {
      if (err || !res.ok) { out.innerHTML = '<span class="bad">The PIN was not changed' + (err ? ' (' + esc(err.message) + ')' : '') + '. Try again.</span>'; return; }
      if (r === 'owner') remember('owner', p, { token: res.token || token(), pv: res.pv });
      else if (auth.roles[r]) { if (kick) delete auth.roles[r]; else auth.roles[r].ver = ''; saveAuth(); }
      $('pinOut').checked = false;
      out.innerHTML = '<span class="good">' + whoRole + ' PIN changed.</span> ' +
        (kick ? 'Every ' + whoRole.toLowerCase() + ' device is signed out and needs the new PIN, with internet, to get back in.'
              : 'Devices stay signed in and ask for the new PIN at their next unlock.');
    });
    return;
  }
  var name = r === 'owner' ? 'PIN_OWNER_HASH' : 'PIN_BARISTA_HASH';
  out.innerHTML = 'In <strong>config.js</strong>, replace the ' + name + ' line with this one, save, and upload the folder again:' +
    '<code>' + name + ": '" + pinHash(r, p) + "',</code>The old PIN keeps working until you upload.";
}

/* Camera baskets (4 November 2026): the till prices the camera's lines and claims a visit once. */
var CAMERAS = CFG.SHELF_CAMERAS === true, basketData = { open: [], left: [] }, basketBusy = false, basketPollBusy = false, basketLast = 0, basketPanel = false, basketNote = '';
function basketSession() { return token() + '|' + (me ? me.session : '') + '|' + role; }
function basketAuth() { return { token: token(), staff: me ? me.session : '', outlet: OUTLET, by: whoName() }; }
function basketLines(b) {
  var out = [], missing = [], pieces = 0, total = 0;
  (b.items || []).forEach(function (l) {
    var found = null;
    MENU.forEach(function (m) { if (l.t === 'shelf' ? m.shelf && m.v === l.v && m.vi === l.vi : !m.shelf && m.c === l.c && m.n === l.n) found = m; });
    pieces += num(l.q);
    if (!found) { missing.push(l.t === 'shelf' ? 'Shelf item ' + l.v + '/' + l.vi : l.c + ': ' + l.n); return; }
    var it = { n: found.n, c: found.c, p: found.p, k: !matchaLocal && found.kPrem ? found.kPrem : found.k, q: l.q };
    if (found.v) { it.v = found.v; it.vi = found.vi; }
    if (!l.sure) it.cameraCheck = true;
    out.push(it); total += it.p * it.q;
  });
  return { lines: out, missing: missing, pieces: pieces, total: total };
}
function basketPhoto(b) {
  return typeof b.photo === 'string' && b.photo.length <= 12000 && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.photo)
    ? '<img class="basket-photo" src="' + esc(b.photo) + '" alt="Customer for Basket ' + esc(b.no) + '">' : '';
}
function basketRow(b, left) {
  var x = basketLines(b), age = Math.max(0, Math.floor((nowMs() - Date.parse(b.seen_at)) / 60000));
  return '<article class="basket-card">' + basketPhoto(b) + '<div><h3>Basket ' + esc(b.no) + '</h3><p>' + esc({ shopping: 'Still shopping', at_till: 'At the counter', left: 'Left' }[b.state] || b.state) + ' · ' + x.pieces + ' pieces · ' + money(x.total) + '</p><p>' + age + ' min since seen · ' + esc(new Date(b.seen_at).toLocaleTimeString()) + '</p>' +
    (left ? '<p>' + esc(x.lines.map(function (it) { return it.q + '× ' + it.n; }).concat(x.missing).join(', ')) + '</p>' : '') +
    (x.missing.length ? '<p>Unmatched: ' + esc(x.missing.join(', ')) + '</p>' : '') +
    '<button type="button" class="btn primary" data-act="basket-take" data-v="' + esc(b.id) + '">' + (left ? 'Paid after all' : 'Ring it up') + '</button> ' +
    '<button type="button" class="btn secondary" data-act="' + (left ? 'basket-dismiss' : 'basket-drop') + '" data-v="' + esc(b.id) + '">' + (left ? 'Dismiss' : 'Drop') + '</button></div></article>';
}
function renderBaskets() {
  if (!CAMERAS) return;
  /* a visit with nothing picked (a coffee-only customer) is not a basket the till needs to see */
  var signed = role && token() && (!rolesOn || role === 'owner' || me),
    open = signed ? basketData.open.filter(function (b) { return b.items && b.items.length; }) : [], left = signed ? basketData.left : [];
  $('basketTools').classList.toggle('hidden', !signed);
  $('basketCount').textContent = open.filter(function (b) { return b.state === 'shopping'; }).length;
  $('basketStatus').textContent = navigator.onLine === false ? 'Offline: camera baskets are unavailable.' : '';
  $('basketCounter').innerHTML = navigator.onLine === false ? '' : open.filter(function (b) { return b.state === 'at_till'; }).map(function (b) { return basketRow(b, false); }).join('');
  $('basketLeft').classList.toggle('hidden', !signed || role !== 'owner');
  $('basketLeftTotal').textContent = (navigator.onLine === false ? 'Offline: camera baskets are unavailable. Last read: ' : '') + left.length + ' left without paying · ' + money(left.reduce(function (s, b) { return s + basketLines(b).total; }, 0));
  $('basketLeftList').innerHTML = navigator.onLine === false ? '' : left.map(function (b) { return basketRow(b, true); }).join('') || none('No customers left with items today.');
  if (basketPanel) basketShow();
}
function basketShow() {
  basketPanel = true;
  openModal('<h2 id="modalTitle">Baskets</h2>' + (navigator.onLine === false ? '<p>Offline: camera baskets are unavailable.</p>' : basketData.open.filter(function (b) { return b.items && b.items.length; }).map(function (b) { return basketRow(b, false); }).join('') || none('No customers shopping.')) + '<button type="button" class="btn secondary" data-act="basket-close">Close</button>');
}
function pollBaskets(force) {
  if (!CAMERAS || !BACKEND) return;
  if (!role || !token() || (rolesOn && role !== 'owner' && !me)) { basketData = { open: [], left: [] }; basketLast = 0; renderBaskets(); return; }
  if (navigator.onLine === false) { renderBaskets(); return; }
  var delay = !$('tabSell').classList.contains('hidden') && !$('baristaScreen').classList.contains('hidden') ? 5000 : 20000;
  if (basketPollBusy || (!force && Date.now() - basketLast < delay)) return;
  basketPollBusy = true; basketLast = Date.now(); var session = basketSession();
  api('pos_baskets', basketAuth(), function (err, res) {
    basketPollBusy = false;
    if (session !== basketSession()) return;
    if (!err && res.ok) { basketData = { open: res.open || [], left: res.left || [] }; renderBaskets(); }
    else $('basketStatus').textContent = 'Camera baskets unavailable. Try again shortly.';
  });
}
function basketAct(id, action, reason) {
  if (!CAMERAS || basketBusy) return;
  if (navigator.onLine === false) { toast('Offline: camera baskets are unavailable.'); return; }
  if (action === 'take' && cart.length) { toast('Finish or clear the current order first.'); return; }
  var b = basketData.open.concat(basketData.left).filter(function (x) { return x.id === id; })[0]; if (!b) return;
  var session = basketSession(), p = basketAuth(); p.id = id; p.action = action; if (reason) p.reason = reason;
  basketBusy = true;
  api('pos_basket_take', p, function (err, res) {
    basketBusy = false;
    if (session !== basketSession()) return;
    if (err || !res.ok) { toast(res && res.error === 'gone' ? 'This basket was already taken or dropped.' : 'Could not claim the basket. Try again.'); pollBaskets(true); return; }
    basketData.open = basketData.open.filter(function (x) { return x.id !== id; }); basketData.left = basketData.left.filter(function (x) { return x.id !== id; });
    basketPanel = false; closeModal();
    if (action === 'take') {
      b.items = res.items; var x = basketLines(b); cart = x.lines;
      ui.channel = 'Counter'; ui.payment = 'Cash'; ui.payNow = false; ui.deal = null; setDiscount(0); renderChannels();
      basketNote = 'Basket ' + res.no; if ($('orderNote')) $('orderNote').value = basketNote;
      if (role === 'owner') { $('ownerScreen').classList.add('hidden'); $('baristaScreen').classList.remove('hidden'); $('basketOwnerBack').classList.remove('hidden'); }
      showTab('sell'); renderCats(); renderTiles(); renderCart();
      if (x.missing.length) openModal('<h2 id="modalTitle">Some items were not added</h2><p>' + esc(x.missing.join(', ')) + '</p><button type="button" class="btn primary" data-act="close-modal">OK</button>');
      else toast('Basket ' + res.no + ' is on the till.');
    }
    renderBaskets(); pollBaskets(true);
  });
}
function initBaskets() {
  if (!CAMERAS) return;
  var tools = document.createElement('div'); tools.id = 'basketTools'; tools.className = 'hidden';
  tools.innerHTML = '<button type="button" class="btn secondary" data-act="basket-show">Baskets <b id="basketCount">0</b></button> <button type="button" id="basketOwnerBack" class="btn secondary hidden" data-act="basket-owner">Back to Owner</button><p id="basketStatus" role="status"></p><div id="basketCounter" class="basket-cards"></div>';
  $('tabSell').querySelector('.menu-col').insertBefore(tools, $('tabSell').querySelector('.menu-col').firstChild);
  var left = document.createElement('section'); left.id = 'basketLeft'; left.className = 'hidden';
  left.innerHTML = '<h2 class="h">Left without paying</h2><p id="basketLeftTotal"></p><div id="basketLeftList"></div>';
  $('oToday').appendChild(left);
  setInterval(function () { pollBaskets(false); }, 1000);
  window.addEventListener('focus', function () { pollBaskets(true); });
  window.addEventListener('online', function () { pollBaskets(true); });
  window.addEventListener('offline', renderBaskets);
  pollBaskets(true);
}

/* ====== WIRING ====== */
function onClick(ev) {
  lastActive = Date.now();
  if (basketBusy) { toast('Please wait for the basket.'); return; }
  var el = ev.target.closest ? ev.target.closest('[data-act],[data-cat],[data-k],[data-tab],[data-otab],[data-role],[data-d],[data-chip],[data-deal],[data-waiter]') : null;
  if (!el) { if (ev.target === $('modal')) closeModal(); return; }
  if (el.hasAttribute('data-k')) { pressKey(el.getAttribute('data-k')); return; }
  if (el.hasAttribute('data-role')) { loginRole = el.getAttribute('data-role'); pin = ''; setSeg('roleSeg', loginRole); drawDots(); if (!lockLeft()) pinMsg('Enter your PIN'); return; }
  if (el.hasAttribute('data-tab')) { showTab(el.getAttribute('data-tab')); return; }
  if (el.hasAttribute('data-otab')) { showOTab(el.getAttribute('data-otab')); return; }
  if (el.hasAttribute('data-cat')) { ui.cat = el.getAttribute('data-cat'); ui.q = ''; $('searchInput').value = ''; renderCats(); renderTiles(); return; }
  if (el.hasAttribute('data-deal')) { setDeal(el.getAttribute('data-deal')); closeModal(); return; }
  if (el.hasAttribute('data-chip')) {
    if (el.getAttribute('data-remake-why') || (el.parentNode && el.parentNode.id === 'remakeWhy')) {
      [].forEach.call((el.parentNode || document).querySelectorAll('button[data-chip]'), function (b) { b.classList.toggle('on', b === el); });
    } else {
      el.classList.toggle('on');
    }
    return;
  }
  if (el.hasAttribute('data-waiter')) { setWaiter(el.getAttribute('data-waiter')); closeModal(); return; }
  if (el.hasAttribute('data-d')) { ui.deal = null; setDiscount(el.getAttribute('data-d')); closeModal(); return; }
  var id = +el.getAttribute('data-id'), i = +el.getAttribute('data-i');
  if (blockedForMe(el.getAttribute('data-act'))) return;
  switch (el.getAttribute('data-act')) {
    case 'basket-show': basketShow(); break;
    case 'basket-close': basketPanel = false; closeModal(); break;
    case 'basket-owner':
      $('baristaScreen').classList.add('hidden'); $('ownerScreen').classList.remove('hidden'); refreshAll(); break;
    case 'basket-take': basketAct(el.getAttribute('data-v'), 'take'); break;
    case 'basket-drop': if (window.confirm('Drop this basket?')) basketAct(el.getAttribute('data-v'), 'drop'); break;
    case 'basket-dismiss':
      basketPanel = false;
      openModal('<h2 id="modalTitle">Why dismiss this basket?</h2>' + ['picked up by staff', 'put back', 'camera mistake', 'other'].map(function (why) { return '<button type="button" class="btn secondary" data-act="basket-reason" data-v="' + esc(el.getAttribute('data-v')) + '" data-why="' + why + '">' + why + '</button>'; }).join('')); break;
    case 'basket-reason': basketAct(el.getAttribute('data-v'), 'drop', el.getAttribute('data-why')); break;
    case 'basket-check': delete cart[i].cameraCheck; renderCart(); break;
    case 'add': addToCart(i, el); break;
    case 'inc': cart[i].q++; renderCart(true); break;
    case 'dec': cart[i].q--; if (cart[i].q <= 0) cart.splice(i, 1); renderCart(true); break;
    case 'clear-cart': cart = []; if (CAMERAS && $('orderNote') && $('orderNote').value === basketNote) $('orderNote').value = ''; basketNote = ''; renderCart(); break;
    case 'charge':
      var ca = channelAccount();
      if (ca) confirmOrder('Unpaid', { acct: ca.id, name: ca.name }); else confirmOrder(ui.payment);
      break;
    case 'pay-later': if (CFG.PAY_LATER_SIMPLE) confirmOrder('Unpaid'); else askAccount(); break;
    case 'pay-now': ui.payNow = true; renderCart(); break;
    case 'acct-pick':
      var pick = accountById(id); closeModal();
      if (pick) confirmOrder('Unpaid', { acct: pick.id, name: pick.name });
      break;
    case 'acct-other':
      var who = $('acctOther').value.trim(), known = accountNamed(who);
      if (!who) { toast('Type their name'); break; }
      closeModal(); confirmOrder('Unpaid', known ? { acct: known.id, name: known.name } : { name: who });
      break;
    case 'acct-receive': askReceive(el.getAttribute('data-key')); break;
    case 'acct-settle': settle(el.getAttribute('data-v')); break;
    case 'acct-statement':
      var grp = owedGroup(el.getAttribute('data-key'));
      if (grp) copyText(statementText(grp), 'Statement copied. Paste it into WhatsApp.');
      break;
    case 'acct-remove':
      var gone = accountById(id);
      if (gone) { gone.deleted = true; stamp(gone); commit('accounts', gone.id); refreshAll(); toast(gone.name + ' removed'); }
      break;
    case 'set-opening':
      var oCard = el.closest('.close-card'); syncDraftFromDom(oCard);
      var oin = oCard.querySelector('.open-in'), ov = parseFloat(oin && oin.value);
      if (isNaN(ov) || ov < 0) { toast('Type the cash the day began with'); break; }
      if (oin) oin.blur();
      saveDay(isoNow(), { opening: ov }); closeDraft = null; refreshAll(); toast('Opening cash set');
      break;
    case 'close-day':
      var closeEl = el.closest('.close-card'); syncDraftFromDom(closeEl);
      var cin = closeEl.querySelector('.count-in'), cv = parseFloat(cin && cin.value), fg = dayFigures(isoNow());
      if (isNaN(cv) || cv < 0) { toast('Count the drawer and type the total first'); break; }
      if (cin) cin.blur();
      var cardV = null, meezanV = null, faysalV = null, transV = null;
      if (CFG.CARD_AT_CLOSE) {
        var meezanEl = closeEl.querySelector('.card-meezan-in'), faysalEl = closeEl.querySelector('.card-faysal-in');
        var transEl = closeEl.querySelector('.transfer-in');
        var bf = bankFeed(isoNow()), cf = cardFeed(isoNow());
        if (cf) {
          cardV = num(cf.total);
        } else {
          meezanV = parseFloat(meezanEl ? meezanEl.value : '');
          faysalV = parseFloat(faysalEl ? faysalEl.value : '');
          if (isNaN(meezanV) || meezanV < 0) { toast('Type the Meezan card total, or 0'); if (meezanEl) meezanEl.focus(); break; }
          if (isNaN(faysalV) || faysalV < 0) { toast('Type the Faysal card total, or 0'); if (faysalEl) faysalEl.focus(); break; }
          cardV = meezanV + faysalV;
        }
        transV = bf ? num(bf.total) : parseFloat(transEl ? transEl.value : '');
        if (isNaN(transV) || transV < 0) { toast('Type the bank transfers received, or 0'); if (transEl) transEl.focus(); break; }
      }
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      var recNow = dayRec(isoNow()), shut = function (k) {
        var patch = { opening: fg.opening, expected: fg.expected, counted: cv, by: whoName(), closedAt: timeNow() }; if (k) patch.ok = k;
        if (cardV != null) {
          patch.cardCounted = cardV;
          if (meezanV != null) patch.cardMeezanCounted = meezanV;
          if (faysalV != null) patch.cardFaysalCounted = faysalV;
          patch.transferCounted = transV;
          patch.cardExpected = fg.cardIn;
          patch.transferExpected = fg.transferIn;
          patch.transferFrom = bankFeed(isoNow()) ? 'bank texts, to ' + txt(bankFeed(isoNow()).last, 5) : 'typed';
          patch.cardFrom = cardFeed(isoNow()) ? 'terminal record, to ' + txt(cardFeed(isoNow()).last, 5) : 'typed (Meezan + Faysal)';
        }
        saveDay(isoNow(), patch); closeDraft = null; refreshAll();
        toast(cv === fg.expected ? 'Day closed. The drawer matches.' : 'Day closed. The drawer is ' + (cv > fg.expected ? 'over' : 'short') + ' by ' + money(Math.abs(cv - fg.expected)));
      };
      if (recNow && recNow.counted != null && (num(recNow.counted) !== cv || (cardV != null && (num(recNow.cardCounted) !== cardV || num(recNow.transferCounted) !== transV))) && needsOk('reclose')) {
        approve('reclose', dayId(isoNow()), 0, 'Count the drawer again: was ' + money(recNow.counted) + ', now ' + money(cv), shut); break;
      }
      shut('');
      break;
    case 'copy-report': copyText(dayReport(el.getAttribute('data-iso')), 'Report copied. Paste it into WhatsApp.'); break;
    case 'move-add':
      var card = el.closest('.close-card'), amt = parseFloat(card.querySelector('.move-amt').value), why = card.querySelector('.move-why').value.trim();
      if (!amt || amt <= 0 || !why) { toast('Type the amount and the reason'); break; }
      var mv = { id: newId(), iso: isoNow(), amount: amt * (el.getAttribute('data-dir') === '1' ? 1 : -1), reason: txt(why, 60), by: whoName(), time: timeNow(), u: nowMs() };
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      var putMove = function (k) { if (k) mv.ok = k; more.moves.push(mv); commit('moves', mv.id); refreshAll(); toast(mv.amount < 0 ? 'Cash taken out recorded' : 'Cash put in recorded'); };
      if (mv.amount < 0 && needsOk('cashout')) { approve('cashout', mv.id, -mv.amount, 'Cash taken out: ' + money(-mv.amount) + ', ' + mv.reason, putMove); break; }
      putMove('');
      break;
    case 'served': markServed(id, false); break;
    case 'unserve': markServed(id, true); break;
    case 'who': if (rolesOn) askWhoAmI(false); else askWho(false); break;
    case 'who-pick': setWho(el.getAttribute('data-v')); closeModal(); toast((who || 'Nobody') + ' is on the till'); break;
    case 'count-ask': askCount(); break;
    case 'count-save': saveCount(); break;
    case 'waste-ask': askWaste(); break;
    case 'waste-save':
      var wi = stockById(num($('wsItem').value)), wr = wi ? enteredQuantity(wi, 'wsQty') : null, wq = wr && wr.q;
      if (wi && !wr) break;
      if (!wi || !(wq > 0)) { toast('Pick the item and type how much'); break; }
      var wm = { id: newId(), iso: isoNow(), s: wi.id, q: -wq, kind: 'waste', note: txt($('wsWhy').value.trim(), 60), by: whoName(), time: timeNow(), u: nowMs() };
      more.stockmoves.push(wm); commit('stockmoves', wm.id); closeModal(); refreshAll(); toast(countText(wi.id, wq) + ' of ' + wi.name + ' recorded as waste');
      break;
    case 'vendor-edit': askVendor(id); break;
    case 'vendor-save': saveVendor(id); break;
    case 'vendor-del': delVendor(id); break;
    case 'vitem-edit': askVendorItem(id, num(el.getAttribute('data-vi'))); break;
    case 'vitem-save': saveVendorItem(id, num(el.getAttribute('data-vi'))); break;
    case 'vitem-del': delVendorItem(id, num(el.getAttribute('data-vi'))); break;
    case 'vdel-ask': askVendorMove('delivery', id); break;
    case 'vret-ask': askVendorMove('return', id); break;
    case 'vmove-save': saveVendorMove(el.getAttribute('data-kind'), id); break;
    case 'vsettle': markSettled(id, el.getAttribute('data-week')); break;
    case 'vstatement': copyText(vendorStatement(id, el.getAttribute('data-week')), 'Statement copied. Paste it into WhatsApp.'); break;
    case 'stock-apply': applyStockRevision(); break;
    case 'stock-edit': askStockItem(id); break;
    case 'stock-save': saveStockItem(id); break;
    case 'stock-del':
      var sd = stockById(id);
      if (sd) { sd.deleted = true; stamp(sd); commit('stock', sd.id); closeModal(); refreshAll(); toast(sd.name + ' removed'); }
      break;
    case 'rc-ask': askRecipe(el.getAttribute('data-key')); break;
    case 'rc-add': readRecipe(); rcEdit.lines.push({ s: liveStock()[0].id, q: 0 }); drawRecipe(); break;
    case 'rc-del': readRecipe(); rcEdit.lines.splice(i, 1); drawRecipe(); break;
    case 'rc-save': saveRecipe(); break;
    case 'move-del':
      more.moves.forEach(function (m) { if (m.id === id) { m.deleted = true; stamp(m); commit('moves', m.id); } });
      refreshAll();
      break;
    case 'open-sheet': openSheet(); break;
    case 'close-sheet': closeSheet(); break;
    case 'custom': openCustom(); break;
    case 'discount': openDiscount(); break;
    case 'apply-disc': ui.deal = null; setDiscount($('discountPct').value); closeModal(); break;
    case 'line-note': openLineNote(i); break;
    case 'apply-note': setLineMods(i, modsFromModal()); setLineNote(i, noteFromModal()); closeModal(); break;
    case 'clear-note': setLineMods(i, []); setLineNote(i, ''); closeModal(); break;
    case 'rekitchen': rekitchen(id); break;
    case 'waiter': openWaiter(); break;
    case 'person-add': askPerson(0); break;
    case 'person-edit': askPerson(id); break;
    case 'person-save': savePerson(id); break;
    case 'person-del': removePerson(id); break;
    case 'outs-ask': askOuts(); break;
    case 'remake-ask': askRemake(id); break;
    case 'chg-ask': askChange(id); break;
    case 'chg-dec': changeQty(i, -1); break;
    case 'chg-inc': changeQty(i, 1); break;
    case 'chg-add': changeAdd(i); break;
    case 'chg-cat': chg.cat = el.getAttribute('data-v'); renderChange(); break;
    case 'chg-pay': chg.pay = el.getAttribute('data-v'); renderChange(); break;
    case 'chg-apply': applyChange(); break;
    case 'chg-cancel': closeChangePage(); break;
    case 'chg-open-sheet': if ($('chgPanel')) { $('chgPanel').classList.add('open'); document.body.style.overflow = 'hidden'; } break;
    case 'chg-cancel-why': pickCancelWhy(el.getAttribute('data-v')); break;
    case 'chg-cancel-go': confirmCancelWhy(); break;
    case 'chg-cancel-abort': chg.pendingCancel = null; chg.cancelPick = ''; closeModal(); break;
    case 'me-pick': askMyPin(id); break;
    case 'me-back': askWhoAmI(!me); break;
    case 'me-go': meLogin(id); break;
    case 'ap-who': apAsk.by = el.getAttribute('data-v'); [].forEach.call($('apWho').querySelectorAll('button'), function (b) { b.classList.toggle('on', b === el); }); break;
    case 'ap-go': approveGo(); break;
    case 'bill-ask': billPlease(id); break;
    case 'staff-add': askStaff(0); break;
    case 'staff-edit': askStaff(id); break;
    case 'staff-save': saveStaff(id); break;
    case 'roles-toggle': toggleRoles(); break;
    case 'cap-save': saveCap(); break;
    case 'menu-publish': publishMenu(false); break;
    case 'log-refresh': loadLog(); break;
    case 'remake-send': sendRemake(id); break;
    case 'loyal-add': addFreeItem(); break;
    case 'outs-apply': applyOuts(); break;
    case 'sign-ask': askSignoff(el.getAttribute('data-v')); break;
    case 'sign-now': signNow(el.getAttribute('data-v')); break;
    case 'apply-waiter': setWaiter($('waiterText').value); closeModal(); break;
    case 'clear-waiter': setWaiter(''); closeModal(); break;
    case 'save-custom': addCustom(); break;
    case 'close-modal': closeModal(); break;
    case 'reprint': askPayMethod(id, findOrder(id) && findOrder(id).payment === 'Unpaid' ? 'bill' : 'reprint'); break;
    case 'reprint-by':
    case 'pay-method': payMethodBy(id, el.getAttribute('data-v'), el.getAttribute('data-mode') || ''); break;
    case 'reslip': reslip(id); break;
    case 'ask-paid': askPayMethod(id, 'pay'); break;
    case 'paid-by': markPaid(id, el.getAttribute('data-v')); break;
    case 'paid-deal': paidDealPick(el.getAttribute('data-v')); break;
    case 'paid-disc': paidDiscPick(el.getAttribute('data-v')); break;
    case 'paid-disc-apply': paidDiscApplyCustom(); break;
    case 'ask-void': askVoid(id); break;
    case 'void-reason':
      [].forEach.call($('voidReasons').querySelectorAll('button'), function (b) { b.classList.toggle('on', b === el); });
      $('voidOther').classList.toggle('hidden', el.getAttribute('data-v') !== 'Other');
      $('voidGo').disabled = false;
      if (el.getAttribute('data-v') === 'Other') $('voidOther').focus();
      break;
    case 'confirm-void': voidOrder(id); break;
    case 'ask-del-exp': askDelExpense(id); break;
    case 'exp-line-add':
      addExpLineRow(el.getAttribute('data-form') === 'o' ? 'o' : 'b');
      break;
    case 'exp-line-del':
      var expRow = el.closest('.exp-line'), expBox = el.closest('.exp-lines'), expForm = expBox && expBox.getAttribute('data-form');
      if (expBox && expRow) {
        if (expBox.querySelectorAll('.exp-line').length <= 1) {
          var nm = expRow.querySelector('.exp-item-name'), am = expRow.querySelector('.exp-item-amt');
          if (nm) nm.value = ''; if (am) am.value = '';
        } else expRow.remove();
        updateExpTotal(expForm === 'o' ? 'o' : 'b');
      }
      break;
    case 'confirm-del-exp': delExpense(id); break;
    case 'sync': syncNow(); break;
    case 'test-sync': testSync(); break;
    case 'export-csv': exportCsv(); break;
    case 'export-json': exportJson(); break;
    case 'pin-line': makePinLine(); break;
    case 'logout': logout(); break;
  }
}
function bindSeg(id, fn) {
  $(id).addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    setSeg(id, b.getAttribute('data-v')); fn(b.getAttribute('data-v'));
  });
}
function init() {
  initBaskets();
  if (!VENDORS_ON && $('oTabShelfBtn')) $('oTabShelfBtn').remove();
  if (CFG.TABLES && $('custName')) $('custName').placeholder = 'Table number or name';
  load(); loadAuth();
  /* ask the browser not to clear this site's saved orders when the device runs low on space */
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {}); } catch (e) {}
  if (!storageOK) $('storageWarning').classList.remove('hidden');
  renderLogin();
  renderChannels();
  if ($('kdsTab')) $('kdsTab').classList.toggle('hidden', !KDS);
  ['bExpLine', 'oExpLine'].forEach(function (id) {
    var sel = $(id); if (!sel) return;
    sel.innerHTML = '<option value="">Which line of the books? (optional)</option>' + (CFG.EXPENSE_LINES || DEFAULT_LINES).map(function (l) {
      return '<option value="' + esc(l[0]) + '">' + esc(l[1]) + '</option>';
    }).join('');
  });
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', function (ev) {
    lastActive = Date.now();
    if (ev.key === 'Escape' && !$('modal').classList.contains('hidden')) { closeModal(); return; }
    if (ev.key === 'Enter' && ev.target.tagName === 'INPUT' && !$('modal').classList.contains('hidden')) {
      var go = $('modalCard').querySelector('.btn.primary, .btn.dark:not([disabled])'); if (go) { ev.preventDefault(); go.click(); } return;
    }
    if (role || ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (/^\d$/.test(ev.key)) {
      pressKey(ev.key);
      var k = document.querySelector('#keypad [data-k="' + ev.key + '"]'); bump(k, 'hit'); setTimeout(function () { k.classList.remove('hit'); }, 140);
    } else if (ev.key === 'Backspace') pressKey('back');
  });
  $('searchInput').addEventListener('input', function () { ui.q = this.value; renderTiles(); });
  if ($('custPhone')) $('custPhone').addEventListener('input', phoneTyped);
  if ($('tableNo')) $('tableNo').addEventListener('input', syncOrderTableLbl);
  setInterval(function () { updateLate(); if (role === 'owner') { renderPass(); if (ui.otab === 'pass' && BACKEND && !syncing) runSync(); } }, 20000);   /* the late badge and the beep work on every tab, not only the kitchen screen */
  bindSeg('chanSeg', function (v) { ui.channel = v; ui.payNow = false; if (SERVICE && $('svcSeg')) { $('svcSeg').classList.toggle('hidden', v === 'Foodpanda'); } renderCart(); });
  if ($('ordersChanSeg')) bindSeg('ordersChanSeg', function (v) { ui.ordersChan = v === 'Foodpanda' ? 'Foodpanda' : 'Counter'; renderOrdersTab(); });
  if ($('svcSeg')) { renderServiceSeg(); bindSeg('svcSeg', function (v) { setService(v); }); }
  bindSeg('paySeg', function (v) { ui.payment = v; renderCart(); });
  bindSeg('bExpType', function (v) { ui.bExpType = v; });
  bindSeg('oExpType', function (v) { ui.oExpType = v; });
  $('acctForm').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (addAccount($('acctName').value)) { $('acctName').value = ''; refreshAll(); toast('Account added'); }
  });
  document.addEventListener('change', function (ev) {
    if (!ev.target.closest || !ev.target.closest('#rcvList')) return;
    updateReceiveTotals();
  });
  document.addEventListener('input', function (ev) {
    var t = ev.target;
    if (!t || !t.classList || !(t.classList.contains('exp-item-name') || t.classList.contains('exp-item-amt'))) return;
    var box = t.closest('.exp-lines');
    updateExpTotal(box && box.getAttribute('data-form') === 'o' ? 'o' : 'b');
  });
  bindSeg('periodSeg', function (v) { period = v; renderOwner(); });
  bindSeg('voidSeg', function (v) { voidAll = v === 'all'; renderVoid(); });
  bindSeg('paperSeg', function (v) { paper80 = v === '80'; save(); toast('Receipts set to ' + v + ' mm paper'); });
  $('matchaMode').addEventListener('change', function () { matchaLocal = this.value === 'local'; save(); toast('Matcha cost updated'); });
  $('bExpForm').addEventListener('submit', function (ev) { ev.preventDefault(); addExpense('b', 'Barista', true, ui.bExpType); });
  $('oExpForm').addEventListener('submit', function (ev) { ev.preventDefault(); addExpense('o', '', $('expTill').checked, ui.oExpType); $('expTill').checked = true; });
  window.addEventListener('resize', measureTop);
  window.addEventListener('storage', function (ev) {
    if (ev.key === AUTH_KEY) { loadAuth(); return; }
    if (ev.key !== KEY || !ev.newValue) return;
    var d; try { d = JSON.parse(ev.newValue); } catch (e) { return; }
    /* another tab on this device saved: take in its orders and its upload list */
    var grew = mergeRemote(Object.assign({}, d, d.more && typeof d.more === 'object' ? d.more : {}));
    Object.keys(d.outbox && typeof d.outbox === 'object' ? d.outbox : {}).forEach(function (k) { if (recFor(k)) outbox[k] = 1; });
    if (num(d.cursor) > cursor) cursor = num(d.cursor);
    if (role) { if (grew) renderTiles(); refreshAll(); if (role === 'barista') renderCart(); }
  });
  window.addEventListener('online', function () { if (role) runSync(); });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && role) { refreshAll(); runSync(); }
  });
  setInterval(function () {
    if (!role) { $('loginDay').textContent = bizLabel(); return; }
    if (role === 'owner' && Date.now() - lastActive > OWNER_IDLE_MS) { logout('Dashboard locked after 5 minutes idle'); return; }
    if (!document.hidden) runSync();
  }, 60000);
  loadMenuFromServer();
}
init();
})();
