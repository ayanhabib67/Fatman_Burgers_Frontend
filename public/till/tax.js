/* WP113: Blink's exclusive tax is on the subtotal BEFORE discount. No POS fee.
   The live shared till calls its config WHIPPED_CONFIG; CONFIG is also accepted. */
(function (window) {
'use strict';
var cfg = (window.CONFIG || window.WHIPPED_CONFIG || {}).TAX || {};
var enabled = cfg.enabled === true;
function round2(n) {
  /* Round refunds the same way as sales, with the opposite sign. */
  return (n < 0 ? -1 : 1) * Math.round((Math.abs(n) + 0.00000001) * 100) / 100;
}
function rateFor(payment) {
  var rate = Number((cfg.rates || {})[payment]);
  return enabled && ['Cash', 'Card', 'Transfer'].indexOf(payment) >= 0 && isFinite(rate) && rate > 0 ? rate : 0;
}
function compute(items, discount, payment) {
  var sale = 0, rate = rateFor(payment);
  /* p already includes priced add-ons; signed prices are used by adjustments. */
  items.forEach(function (it) { sale += it.p * it.q; });
  var tax = round2(sale * rate / 100), total = sale - (Number(discount) || 0) + tax;
  return { sale: sale, rate: rate, tax: tax, total: enabled ? round2(total) : total };
}
window.TAX = { enabled: enabled, showLine: cfg.showLine !== false, rateFor: rateFor, compute: compute };
})(window);
