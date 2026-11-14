/* ============================================================
   FATMAN POS — settings
   The FatMan till is the Whipped till with its own shop name, menu and look.
   app.js is shared: copy it from whipped-pos/ whenever that changes.
   Change a value here, save, then upload the whole folder to Netlify again.
   ============================================================ */
var SHAKE_COST = 250; // Naveed to confirm

window.WHIPPED_CONFIG = {

  VERSION: 'v24-fatman-21',
  /* Owner's 15 Oct 2026 choice for counts, waste and received stock. */
  COUNT_AS: {202: {kind: 'decimal', label: 'kg'},
             203: {kind: 'packs+loose', per: 24, packs: 'Sealed packs (24)', loose: 'Loose slices in the open pack'},
             201: {kind: 'packs', per: 2, packs: 'Packets (2 buns)'}},
  STOCK_REV: '2026-10-23',

  /* ---- Which shop this till belongs to ----
     The database keeps each outlet's orders, PINs and devices apart. */
  OUTLET: 'fatman',
  /* One-shot: next till load clears local orders (DB already wiped). Change token to wipe again. */
  WIPE_ORDERS_TOKEN: '2026-11-14-clear-till-11',

  /* Cash and Transfer at 15%; Card at 8%. */
  TAX: { enabled: true, rates: { Cash: 15, Card: 8, Transfer: 15 }, inclusive: false, showLine: true },

  /* ---- Server (Supabase), the same project as Whipped ---- */
  API_RPC_BASE: '/api/v1/rpc',
  SUPABASE_URL: '',
  SUPABASE_KEY: '',

  KEEP_DAYS: 45,
  PIN_DIGITS: 4,

  /* Trading day: open 12pm, close late. Anything before 4am counts as the previous day. */
  DAY_CUTOFF_HOUR: 4,

  /* Extra packaging cost per item on Foodpanda orders (PKR). */
  DELIVERY_PKG: 15,

  HANDLE: '@thefatmanburgers',

  /* ---- Words and names on screen and on paper ---- */
  BRAND: {
    name: 'FatMan', wordmark: 'FATMAN', app: 'FatMan POS',
    tagline: 'SMASHED FRESH. DHA PHASE 6.',
    sign: 'see you at the pass',
    thing: 'item', things: 'items', start: 'tap an item to start',
    statement: 'FatMan Burger', salePrefix: 'FatMan Sale', filePrefix: 'fatman', staff: 'Counter'
  },

  /* ---- Where orders come from ----
     A channel with an account goes on that account unless the customer pays now. */
  CHANNELS: [
    { v: 'Counter', l: 'Counter' },
    { v: 'Foodpanda', l: 'Foodpanda', acct: 'Foodpanda' }
  ],

  /* ---- Staff ----
     Whoever unlocks the till picks their name; it goes on every order, void, expense, count and waste.
     Same names as the attendance list. Add or remove here; an empty list switches the question off. */
  STAFF: ["Atif", "Arman", "Yaqoob"],

  /* A kitchen slip prints with every new order: number, time, items large, no prices. */
  KITCHEN_SLIP: true,

  /* A Kitchen tab for the tablet at the pass: open orders oldest first, Served stamps the time. */
  KITCHEN_DISPLAY: true,
  VENDORS: false,
  /* Pay at the end: orders are rung by table number, paid when the table settles. */
  TABLES: false,   /* 11 Oct 2026: FatMan rings orders by the customer's name against the waiter, not by table */

  /* ---- Waiters and kitchen notes (11 October) ----
     WAITERS: the names offered when an order is rung; any name typed on a till is remembered there too.
     NOTE_CHIPS: the one-tap notes offered on a line; staff can always type another. */
  WAITERS: [],
  /* ADDON_FOR: categories whose lines can take the priced add-ons from the ADDON_CAT category (Extra Patty +350 and so on). */
  ADDON_FOR: ['Burgers', 'Chicken'],
  ADDON_CAT: 'Add-ons',
  /* LOYALTY: every nth visit (by phone number) the named menu item is free; the till offers it, the receipt counts visits. */
  LOYALTY: { every: 10, item: 'Salted Fries' },
  EMPTY_ART: '/img/empty.png',   /* the mascot shown when the order is empty (Bloom, 12 Oct 2026) */
  /* Dine in or takeaway on every order (12 Oct 2026): the first is the evening default (seating opens 19:00), the last the daytime default. */
  SERVICE: ['Dine in', 'Takeaway'],
  SERVICE_EVENING_FROM: 19,
  /* Pay at the end: the order goes to the kitchen as Unpaid straight away; 'Mark paid' is on the Orders tab. */
  PAY_LATER_SIMPLE: true,
  /* A table number on every dine-in order: it is how the table cameras are matched to the order. */
  TABLE_NO: true,
  /* At day close the card machine's batch total and the bank transfers received are typed in and set against what the till rang. */
  CARD_AT_CLOSE: true,
  NOTE_CHIPS: ['No onions', 'No pickles', 'No jalapeños', 'No tomato', 'No sauce', 'Extra cheese', 'Extra sauce', 'Well done', 'Spicy', 'Cut in half', 'Pack separately'],

  /* ---- Bank card deals (11 October) ----
     From the HBL poster: the discount the customer gets when paying with a listed card. Staff tap Discount, then the
     card; the order carries the deal, the receipt names it, the owner's day shows deals apart from other discounts,
     and a deal order can only be closed as Card. Edit this list when HBL changes it. */
  BANK_DEALS: [
    { bank: 'HBL', pct: 30, cards: [
      'World Elite Debit', 'World Elite Debit Visa Platinum Dubai',
      'MasterCard World Elite Debit, HBL Pay', 'MasterCard World Debit, HBL Pay'] },
    { bank: 'HBL', pct: 25, cards: [
      'VISA Platinum Credit', 'MasterCard World Debit', 'VISA Platinum Credit, HBL Pay',
      'World Islamic Business Debit', 'World Conventional Business Debit', 'World Conventional Business Debit, Advances'] }
  ],

  /* ---- Accounts ----
     Used once, to start the list. After that, add or remove accounts from the Owner screen. */
  ACCOUNTS: ['Foodpanda', 'Whipped', 'Greenwich', 'Naveed Bhai', 'Munib Bhai', 'Omair Bhai'],

  /* ---- Stock and recipes ----
     15 Oct 2026: from the owner's reviewed inventory and recipe list. */
  STOCK: [
  {"id": 201, "name": "Brioche buns", "unit": "pcs", "pack": 2, "cost": 160, "pl": "packet of 2 (Hobnob)", "i": "stock-201"},
  {"id": 202, "name": "Beef mince", "unit": "kg", "pack": 1, "cost": 1830, "pl": "1 kg (Punjab meats)", "i": "stock-202"},
  {"id": 203, "name": "Cheese slices", "unit": "pcs", "pack": 24, "cost": 2060, "pl": "24 slices (Happy Cow)", "i": "stock-203"},
  {"id": 204, "name": "House sauce", "unit": "ml", "pack": 1000, "cost": 1000, "pl": "1 L made in house"},
  {"id": 205, "name": "Onions", "unit": "g", "pack": 1000, "cost": 180, "pl": "1 kg"},
  {"id": 206, "name": "Tomatoes", "unit": "g", "pack": 1000, "cost": 180, "pl": "1 kg"},
  {"id": 207, "name": "Pickles", "unit": "g", "pack": 980, "cost": 1280, "pl": "980 g jar (Best Day)", "i": "stock-207"},
  {"id": 208, "name": "Mushroom sauce", "unit": "ml", "pack": 1000, "cost": 1600, "pl": "1 L made in house"},
  {"id": 209, "name": "Potatoes", "unit": "g", "pack": 1000, "cost": 85, "pl": "1 kg"},
  {"id": 210, "name": "Frying oil", "unit": "ml", "pack": 16000, "cost": 8800, "pl": "16 L tin (Dalda)", "i": "stock-210"},
  {"id": 211, "name": "Burger boxes", "unit": "pcs", "pack": 1, "cost": 10, "pl": "per piece"},
  {"id": 212, "name": "Fries cups", "unit": "pcs", "pack": 1, "cost": 8, "pl": "per piece"},
  {"id": 213, "name": "Chicken strips, raw", "unit": "pcs", "pack": 20, "cost": 965, "pl": "box of 20 (Sabroso)", "i": "stock-213"},
  {"id": 214, "name": "Masala seasoning", "unit": "g", "pack": 500, "cost": 900, "pl": "500 g"},
  {"id": 215, "name": "Peri peri sauce", "unit": "ml", "pack": 1000, "cost": 1400, "pl": "1 L"},
  {"id": 216, "name": "Cheese sauce", "unit": "ml", "pack": 1000, "cost": 1800, "pl": "1 L"},
  {"id": 217, "name": "Jalapenos", "unit": "g", "pack": 460, "cost": 420, "pl": "460 g jar (Italiano)", "i": "stock-217"},
  {"id": 218, "name": "Beef bacon", "unit": "pcs", "pack": 1, "cost": 45, "pl": "per rasher", "i": "stock-218"},
  {"id": 219, "name": "Soft drink cans", "unit": "pcs", "pack": 1, "cost": 90, "pl": "345 ml can", "i": "drink-soft"},
  {"id": 220, "name": "Water bottles", "unit": "pcs", "pack": 1, "cost": 40, "pl": "bottle", "i": "drink-water"},
  {"id": 221, "name": "Slush syrup", "unit": "ml", "pack": 1000, "cost": 900, "pl": "1 L", "i": "drink-slush"},
  {"id": 222, "name": "Cheesecake slices", "unit": "pcs", "pack": 1, "cost": 450, "pl": "per slice", "i": "dessert-cheesecake"},
  {"id": 223, "name": "Brownies", "unit": "pcs", "pack": 1, "cost": 250, "pl": "per piece", "i": "dessert-brownie"},
  {"id": 224, "name": "cream", "unit": "g", "pack": 200, "cost": 227, "pl": "200 g pack (Milkpak)", "i": "stock-224"},
  {"id": 225, "name": "butter", "unit": "g", "pack": 180, "cost": 300, "pl": "180 g (Blue Band)", "i": "stock-225"},
  {"id": 226, "name": "mayonnaise", "unit": "g", "pack": 4000, "cost": 2150, "pl": "4 kg tub (Dippit)", "i": "stock-226"},
  {"id": 227, "name": "ketchup", "unit": "g", "pack": 4000, "cost": 1550, "pl": "4 kg (Dippit)", "i": "stock-227"},
  {"id": 228, "name": "hot sauce", "unit": "g", "pack": 3900, "cost": 2150, "pl": "3.9 kg (Dippit)", "i": "stock-228"},
  {"id": 229, "name": "chipotle", "unit": "g", "pack": 3900, "cost": 3800, "pl": "3.9 kg (Dippit)", "i": "stock-229"},
  {"id": 230, "name": "salt", "unit": "g", "pack": 800, "cost": 60, "pl": "800 g (Shan)"},
  {"id": 231, "name": "cayenne pepper", "unit": "g", "pack": 70, "cost": 530, "pl": "70 g (Italiano)"},
  {"id": 232, "name": "black pepper", "unit": "g", "pack": 100, "cost": 289, "pl": "100 g (Poonam)"},
  {"id": 233, "name": "garlic powder", "unit": "g", "pack": 70, "cost": 320, "pl": "70 g (Falak)"},
  {"id": 234, "name": "garlic paste", "unit": "g", "pack": 750, "cost": 800, "pl": "750 g (Mehran)"},
  {"id": 235, "name": "chaat masala", "unit": "g", "pack": 180, "cost": 200, "pl": "180 g (Poonam)"},
  {"id": 236, "name": "peri masala", "unit": "g", "pack": 70, "cost": 350, "pl": "70 g (Falak)"},
  {"id": 237, "name": "cornflour", "unit": "g", "pack": 1000, "cost": 229, "pl": "1 kg (Poonam)"},
  {"id": 238, "name": "ketchup/chilli garlic sachet", "unit": "pcs", "pack": 1000, "cost": 9100, "pl": "1000 pieces (Dippit)"},
  {"id": 239, "name": "lettuce", "unit": "g", "pack": 1000, "cost": 420, "pl": "1 kg"},
  {"id": 240, "name": "mushroom", "unit": "g", "pack": 254, "cost": 380, "pl": "254 g"},
  {"id": 241, "name": "garlic", "unit": "g", "pack": 1000, "cost": 550, "pl": "1 kg"},
  {"id": 242, "name": "f1 box", "unit": "pcs", "pack": 1000, "cost": 6480, "pl": "1000 pcs (Papermarket)", "i": "stock-242"},
  {"id": 243, "name": "f2 box", "unit": "pcs", "pack": 1000, "cost": 11700, "pl": "1000 pcs (Papermarket)", "i": "stock-243"},
  {"id": 244, "name": "napkin", "unit": "pcs", "pack": 50, "cost": 200, "pl": "50 pcs"},
  {"id": 245, "name": "fork", "unit": "pcs", "pack": 50, "cost": 150, "pl": "50 pcs"},
  {"id": 246, "name": "spoon", "unit": "pcs", "pack": 50, "cost": 150, "pl": "50 pcs"},
  {"id": 247, "name": "butter paper", "unit": "pcs", "pack": null, "cost": null},
  {"id": 248, "name": "cling foil", "unit": "pcs", "pack": 1, "cost": 380, "pl": "1 roll"},
  {"id": 249, "name": "gloves", "unit": "pcs", "pack": 100, "cost": 1000, "pl": "100 pcs"},
  {"id": 250, "name": "straw", "unit": "pcs", "pack": 1000, "cost": 1000, "pl": "1000 pcs"},
  {"id": 251, "name": "glass", "unit": "pcs", "pack": 50, "cost": 900, "pl": "50 pcs"},
  {"id": 252, "name": "stapler pin", "unit": "box", "pack": 1, "cost": 60, "pl": "box"},
  {"id": 253, "name": "printer roll", "unit": "roll", "pack": null, "cost": null},
  {"id": 254, "name": "garbage bag", "unit": "pack", "pack": 1, "cost": 170, "pl": "pack"},
  {"id": 255, "name": "duster", "unit": "g", "pack": 5000, "cost": 1150, "pl": "5 kg"},
  {"id": 256, "name": "coil mosquito", "unit": "box", "pack": 1, "cost": 250, "pl": "box"},
  {"id": 257, "name": "notebook", "unit": "pcs", "pack": 12, "cost": 600, "pl": "12 pcs"},
  {"id": 258, "name": "sanitizer", "unit": "g", "pack": 5000, "cost": 1900, "pl": "5 kg"},
  {"id": 259, "name": "lemon max", "unit": "bottle", "pack": 1, "cost": 700, "pl": "bottle"},
  {"id": 260, "name": "phenyl", "unit": "bottle", "pack": 1, "cost": 400, "pl": "bottle"},
  {"id": 261, "name": "harpic", "unit": "bottle", "pack": 2, "cost": 580, "pl": "2 bottles"},
  {"id": 262, "name": "brush", "unit": "pcs", "pack": 1, "cost": 340, "pl": "piece"},
  {"id": 263, "name": "sponge", "unit": "pcs", "pack": 10, "cost": 700, "pl": "10 pcs"},
  {"id": 264, "name": "mop", "unit": "pcs", "pack": 4, "cost": 580, "pl": "4 pcs"},
  {"id": 265, "name": "gas", "unit": "g", "pack": 35000, "cost": 18800, "pl": "35 kg cylinder"},
  {"id": 266, "name": "lighter", "unit": "pcs", "pack": 1, "cost": 170, "pl": "piece"},
  {"id": 267, "name": "surf", "unit": "g", "pack": 1000, "cost": 620, "pl": "1 kg"},
  {"id": 268, "name": "hair net", "unit": "pcs", "pack": 50, "cost": 200, "pl": "50 pcs"},
  {"id": 269, "name": "tape", "unit": "pcs", "pack": 1, "cost": 150, "pl": "piece"},
  {"id": 270, "name": "tray paper", "unit": "pcs", "pack": 1, "cost": 5, "pl": "piece (Ahsan)"},
  {"id": 271, "name": "burger bag (big)", "unit": "pcs", "pack": 1, "cost": 22, "pl": "piece (Ahsan)", "i": "stock-271"},
  {"id": 272, "name": "fries bag (small)", "unit": "pcs", "pack": 1, "cost": 7, "pl": "piece (Ahsan)", "i": "stock-272"},
  {"id": 273, "name": "box", "unit": "pcs", "pack": 1, "cost": 20, "pl": "piece (Ahsan)", "i": "stock-273"},
  /* Drinks: count individual bottles; pack defaults are editable. */
  {"id": 274, "name": "Pepsi 345 ml", "unit": "bottle", "pack": 24, "cost": null, "pl": "24 bottles (default)", "i": "stock-274"},
  {"id": 275, "name": "7up 345 ml", "unit": "bottle", "pack": 24, "cost": null, "pl": "24 bottles (default)", "i": "stock-275"},
  {"id": 276, "name": "Dew 345 ml", "unit": "bottle", "pack": 24, "cost": null, "pl": "24 bottles (default)", "i": "stock-276"},
  {"id": 277, "name": "Mirinda 345 ml", "unit": "bottle", "pack": 24, "cost": null, "pl": "24 bottles (default)", "i": "stock-277"},
  {"id": 278, "name": "Coke 345 ml", "unit": "bottle", "pack": 24, "cost": null, "pl": "24 bottles (default)", "i": "stock-278"},
  {"id": 279, "name": "Water (fridge)", "unit": "bottle", "pack": 12, "cost": null, "pl": "12 bottles (default)", "i": "stock-279"},
],
RECIPES: {
  "Burgers|OG Smash Single": {"sure": false, "lines": [[201, 1], [202, 0.1], [203, 1], [204, 50], [205, 30], [206, 30], [207, 15], [211, 1]]},
  "Burgers|OG Smash Double": {"sure": false, "lines": [[201, 1], [202, 0.2], [203, 2], [204, 50], [205, 30], [206, 30], [207, 15], [211, 1]]},
  "Burgers|Oklahoma Smash Single": {"sure": false, "lines": [[201, 1], [202, 0.1], [203, 1], [204, 50], [205, 60], [211, 1]]},
  "Burgers|Oklahoma Smash Double": {"sure": false, "lines": [[201, 1], [202, 0.2], [203, 2], [204, 50], [205, 60], [211, 1]]},
  "Burgers|FatMan Special Single": {"sure": false, "lines": [[201, 1], [202, 0.1], [203, 1], [204, 40], [205, 40], [208, 40], [211, 1]]},
  "Burgers|FatMan Special Double": {"sure": false, "lines": [[201, 1], [202, 0.2], [203, 2], [204, 40], [205, 40], [208, 40], [211, 1]]},
  "Fries|Salted Fries": {"sure": false, "lines": [[209, 150], [210, 20], [212, 1]]},
  "Fries|Masala Fries": {"sure": false, "lines": [[209, 150], [210, 20], [214, 8], [212, 1]]},
  "Fries|Peri Peri Fries": {"sure": false, "lines": [[209, 150], [210, 20], [215, 20], [212, 1]]},
  "Fries|FatMan Loaded Fries": {"sure": false, "lines": [[209, 200], [210, 25], [216, 60], [202, 0.04], [217, 15], [204, 20], [211, 1]]},
  "Chicken|Chicken Strips, 4 pcs + fries": {"sure": false, "lines": [[213, 4], [210, 30], [209, 100], [212, 1], [211, 1]]},
  "Add-ons|Pickles": {"sure": false, "lines": [[207, 15]]},
  "Add-ons|Extra Patty": {"sure": false, "lines": [[202, 0.1], [203, 1]]},
  "Add-ons|Beef Bacon": {"sure": false, "lines": [[218, 2]]},
  "Add-ons|Cheese Slice": {"sure": true, "lines": [[203, 1]]},
  "Add-ons|Jalapeno": {"sure": false, "lines": [[217, 15]]},
  "Drinks|Soft Drink": {"sure": true, "lines": [[219, 1]]},
  "Drinks|Water": {"sure": true, "lines": [[220, 1]]},
  "Drinks|Slush": {"sure": false, "lines": [[221, 60]]},
  "Dessert|Cheesecake": {"sure": true, "lines": [[222, 1]]},
  "Dessert|Brownie": {"sure": true, "lines": [[223, 1]]},
},

  /* ---- Menu (offline fallback only) ----
     Live till loads menu from Mongo via GET /api/v1/menu?outlet=fatman.
     This list is used only if the API is unreachable. Edit DB (seed-menu / upsert) for real prices.
     c = category, n = name, p = selling price, k = making cost, i = photo key. */
  MENU: [
    {c:'Burgers', n:'OG Smash Single', p:1250, k:529, i:'og-single'},
    {c:'Burgers', n:'OG Smash Double', p:1649, k:829, i:'og-double'},
    {c:'Burgers', n:'Oklahoma Smash Single', p:1190, k:529, i:'ok-single'},
    {c:'Burgers', n:'Oklahoma Smash Double', p:1600, k:829, i:'ok-double'},
    {c:'Burgers', n:'FatMan Special Single', p:1325, k:579, i:'sp-single'},
    {c:'Burgers', n:'FatMan Special Double', p:1719, k:879, i:'sp-double'},
    {c:'Fries', n:'Salted Fries', p:450, k:140, i:'fries-salted'},
    {c:'Fries', n:'Masala Fries', p:450, k:150, i:'fries-masala'},
    {c:'Fries', n:'Peri Peri Fries', p:450, k:150, i:'fries-peri'},
    {c:'Fries', n:'FatMan Loaded Fries', p:950, k:380, i:'fries-loaded'},
    {c:'Chicken', n:'Chicken Strips, 4 pcs + fries', p:965, k:420, i:'chicken-strips'},
    {c:'Add-ons', n:'Pickles', p:100, k:20, i:'addon-pickles'},
    {c:'Add-ons', n:'Extra Patty', p:350, k:170, i:'addon-patty'},
    {c:'Add-ons', n:'Beef Bacon', p:300, k:140, i:'addon-bacon'},
    {c:'Add-ons', n:'Cheese Slice', p:125, k:65, i:'addon-cheese'},
    {c:'Add-ons', n:'Jalapeno', p:100, k:20, i:'addon-jalapeno'},
    {c:'Drinks', n:'Soft Drink', p:200, k:90, i:'drink-soft'},
    {c:'Drinks', n:'Water', p:100, k:40, i:'drink-water'},
    {c:'Drinks', n:'Slush', p:400, k:120, i:'drink-slush'},
    {c:'Drinks', n:'Creamy Vanilla Shake', p:700, k:SHAKE_COST, i:''},
    {c:'Drinks', n:'Chocolate Shake', p:700, k:SHAKE_COST, i:''},
    {c:'Drinks', n:'Strawberry Shake', p:700, k:SHAKE_COST, i:''},
    {c:'Dessert', n:'Cheesecake', p:850, k:450, i:'dessert-cheesecake'},
    {c:'Dessert', n:'Brownie', p:500, k:250, i:'dessert-brownie'}
  ]
};
