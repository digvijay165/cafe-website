// First-run content: the menu and opening hours. Only inserted when the tables are empty, so staff
// edits (prices, availability) are never overwritten on restart.
const CATEGORIES = ['Coffee', 'Tea & more', 'Breakfast', 'Bakery', 'Lunch'];

const MENU = [
  ['Coffee', 'espresso', 'Espresso', 'A double shot of our house blend: cocoa, toasted almond, a little citrus.', 14000, ['vegan']],
  ['Coffee', 'flat-white', 'Flat white', 'Double espresso with silky steamed milk.', 19000, []],
  ['Coffee', 'cappuccino', 'Cappuccino', 'Espresso, steamed milk and a thick cap of foam, dusted with cocoa.', 18000, []],
  ['Coffee', 'cold-brew', 'Cold brew', 'Steeped for 18 hours, served over ice. Smooth and low in acidity.', 21000, ['vegan']],
  ['Coffee', 'filter-kaapi', 'Filter kaapi', 'South Indian filter coffee with chicory, frothed the traditional way.', 12000, []],
  ['Tea & more', 'masala-chai', 'Masala chai', 'Assam tea simmered with ginger, cardamom, clove and cinnamon.', 11000, []],
  ['Tea & more', 'matcha-latte', 'Matcha latte', 'Ceremonial-grade matcha whisked with oat milk.', 23000, ['vegan']],
  ['Tea & more', 'hot-chocolate', 'Hot chocolate', '70% dark chocolate melted into whole milk.', 20000, ['gluten-free']],
  ['Tea & more', 'fresh-lime', 'Fresh lime soda', 'Sweet, salted or both. Very cold.', 9000, ['vegan', 'gluten-free']],
  ['Breakfast', 'avocado-toast', 'Avocado toast', 'Sourdough, smashed avocado, chilli flakes, lime and a soft egg.', 32000, []],
  ['Breakfast', 'masala-omelette', 'Masala omelette', 'Three eggs with onion, tomato, green chilli and coriander, with toast.', 26000, []],
  ['Breakfast', 'granola-bowl', 'Granola bowl', 'House granola, Greek yoghurt, seasonal fruit and honey.', 28000, []],
  ['Bakery', 'butter-croissant', 'Butter croissant', 'Laminated over three days. Best before noon.', 15000, []],
  ['Bakery', 'cardamom-bun', 'Cardamom bun', 'Swedish-style knot with cardamom sugar.', 16000, []],
  ['Bakery', 'banana-bread', 'Banana bread', 'A thick slice, warmed, with salted butter.', 14000, []],
  ['Bakery', 'almond-cake', 'Orange almond cake', 'Flourless and moist, soaked in orange syrup.', 18000, ['gluten-free']],
  ['Lunch', 'paneer-sandwich', 'Grilled paneer sandwich', 'Tandoori paneer, mint chutney and pickled onion on focaccia.', 34000, []],
  ['Lunch', 'chicken-pesto', 'Chicken pesto panini', 'Roast chicken, basil pesto, mozzarella and sun-dried tomato.', 38000, []],
  ['Lunch', 'buddha-bowl', 'Garden bowl', 'Quinoa, roast vegetables, chickpeas, greens and tahini dressing.', 36000, ['vegan', 'gluten-free']],
  ['Lunch', 'tomato-soup', 'Roast tomato soup', 'With basil oil and a slice of sourdough.', 24000, ['vegan']]
];

// [day_of_week, opens, closes]; Monday is closed.
const HOURS = [
  [0, '08:00', '18:00'],
  [2, '07:30', '20:00'],
  [3, '07:30', '20:00'],
  [4, '07:30', '20:00'],
  [5, '07:30', '22:00'],
  [6, '08:00', '22:00']
];

module.exports = async function seed(db) {
  const { rows: [menu] } = await db.query('select count(*)::int as n from menu_items');
  if (menu.n === 0) {
    for (const [index, [category, slug, name, description, price, tags]] of MENU.entries()) {
      await db.query(
        'insert into menu_items (slug, category, name, description, price_cents, tags, sort_order) values ($1, $2, $3, $4, $5, $6, $7)',
        [slug, category, name, description, price, tags, CATEGORIES.indexOf(category) * 100 + index]
      );
    }
  }
  const { rows: [hours] } = await db.query('select count(*)::int as n from opening_hours');
  if (hours.n === 0) {
    for (const [day, opens, closes] of HOURS) {
      await db.query('insert into opening_hours (day_of_week, opens, closes) values ($1, $2, $3)', [day, opens, closes]);
    }
  }
};
