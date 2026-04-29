/* eslint-disable */
// Seed script for "Restro Bar" tenant — full sample catalogue.
// Run from services/catalogue-service:  node prisma/seed-restro-bar.js

const { PrismaClient } = require('../src/generated/prisma');
const prisma = new PrismaClient();

const TENANT_ID = 'cmo1e5ix70000140y17yj65sy';
const BRANCH_ID = 'cmo1e5iya0001140y44ko2zmx';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const img = (url) => [{ url, isPrimary: true }];
const STOCK_PIC = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=800&q=70`;

// ─── Sections (12) ────────────────────────────────────────────────────────────

const SECTIONS = [
  { name: 'Tandoor Starters',     description: 'Smoky, charred, straight from the clay oven' },
  { name: 'Kebabs & Skewers',     description: 'Hand-skewered, slow grilled' },
  { name: 'Soups & Salads',       description: 'Light bites & fresh greens' },
  { name: 'Curries & Mains',      description: 'Slow-cooked, deeply spiced' },
  { name: 'Biryani & Rice',       description: 'Dum-cooked, basmati, layered' },
  { name: 'Indian Breads',        description: 'Hot from the tandoor' },
  { name: 'Chinese & Indo-Chi',   description: 'Wok-tossed favourites' },
  { name: 'Continental',          description: 'Pasta, pizza, sizzlers' },
  { name: 'Desserts',             description: 'Sweet endings' },
  { name: 'Mocktails & Coolers',  description: 'Refreshers without the buzz' },
  { name: 'Beer',                 description: 'Chilled, on tap & by the bottle' },
  { name: 'Cocktails & Spirits',  description: 'Crafted bar classics' },
];

// ─── Items per section ─────────────────────────────────────────────────────────
// All prices in paise. Allergens follow root CLAUDE.md taxonomy.

const ITEMS = {
  'Tandoor Starters': [
    { name: 'Paneer Tikka',         price: 32000, mrp: 36000, veg_type: 'veg',     prep_time_mins: 18, calories: 320, rating: 4.6, rating_count: 142, course: 'starter', allergens: ['dairy'],          desc: 'Hung-curd marinated paneer cubes, char-grilled with capsicum & onion.' },
    { name: 'Tandoori Chicken',     price: 42000, mrp: 48000, veg_type: 'non_veg', prep_time_mins: 25, calories: 410, rating: 4.7, rating_count: 218, course: 'starter', allergens: ['dairy'],          desc: 'Half spring chicken in red masala, slow-cooked tandoor style.' },
    { name: 'Hariyali Kebab',       price: 28000,             veg_type: 'veg',     prep_time_mins: 15, calories: 280, rating: 4.4, rating_count: 88,  course: 'starter', allergens: ['dairy', 'nuts'],   desc: 'Spinach-mint paneer kebabs with cashew paste.' },
    { name: 'Tandoori Mushroom',    price: 26000,             veg_type: 'veg',     prep_time_mins: 14, calories: 220, rating: 4.3, rating_count: 64,  course: 'starter', allergens: ['dairy'],          desc: 'Button mushrooms in achari marinade.' },
  ],
  'Kebabs & Skewers': [
    { name: 'Galouti Kebab',        price: 38000,             veg_type: 'non_veg', prep_time_mins: 18, calories: 380, rating: 4.8, rating_count: 195, course: 'starter', allergens: ['dairy', 'nuts'],   desc: 'Lucknowi melt-in-mouth mutton kebabs, served on warqi paratha.' },
    { name: 'Seekh Kebab',          price: 36000,             veg_type: 'non_veg', prep_time_mins: 16, calories: 360, rating: 4.5, rating_count: 132, course: 'starter', allergens: ['dairy'],          desc: 'Minced mutton on iron skewer, charcoal grilled.' },
    { name: 'Reshmi Chicken Kebab', price: 34000,             veg_type: 'non_veg', prep_time_mins: 15, calories: 340, rating: 4.6, rating_count: 110, course: 'starter', allergens: ['dairy', 'eggs', 'nuts'], desc: 'Cream-cheese-cashew marinated chicken on skewer.' },
    { name: 'Veg Sheekh Kebab',     price: 26000,             veg_type: 'veg',     prep_time_mins: 14, calories: 290, rating: 4.2, rating_count: 56,  course: 'starter', allergens: ['gluten', 'dairy'], desc: 'Mixed-veg & cottage-cheese skewers.' },
  ],
  'Soups & Salads': [
    { name: 'Tom Yum Soup',         price: 22000,             veg_type: 'non_veg', prep_time_mins: 10, calories: 140, rating: 4.4, rating_count: 78,  course: 'starter', allergens: ['shellfish', 'fish'], desc: 'Classic Thai hot & sour with prawns and lemongrass.' },
    { name: 'Sweet Corn Soup',      price: 16000,             veg_type: 'veg',     prep_time_mins: 8,  calories: 160, rating: 4.1, rating_count: 44,  course: 'starter', allergens: [],                  desc: 'Comfort classic with tender corn niblets.' },
    { name: 'Greek Salad',          price: 24000,             veg_type: 'veg',     prep_time_mins: 6,  calories: 210, rating: 4.3, rating_count: 52,  course: 'starter', allergens: ['dairy'],          desc: 'Cucumber, tomato, olives, feta with olive-oil & oregano.' },
    { name: 'Caesar Salad',         price: 26000,             veg_type: 'egg',     prep_time_mins: 7,  calories: 290, rating: 4.5, rating_count: 87,  course: 'starter', allergens: ['eggs', 'dairy', 'gluten', 'fish'], desc: 'Romaine, parmesan, croutons, classic anchovy dressing.' },
  ],
  'Curries & Mains': [
    { name: 'Butter Chicken',       price: 42000, mrp: 46000, veg_type: 'non_veg', prep_time_mins: 22, calories: 520, rating: 4.8, rating_count: 312, course: 'main',    allergens: ['dairy', 'nuts'],   desc: 'Tomato-cream gravy, fenugreek-finished, the bar-and-restaurant signature.' },
    { name: 'Paneer Butter Masala', price: 36000,             veg_type: 'veg',     prep_time_mins: 18, calories: 480, rating: 4.6, rating_count: 198, course: 'main',    allergens: ['dairy', 'nuts'],   desc: 'Cottage cheese in rich tomato-cashew gravy.' },
    { name: 'Dal Makhani',          price: 28000,             veg_type: 'veg',     prep_time_mins: 20, calories: 380, rating: 4.7, rating_count: 220, course: 'main',    allergens: ['dairy'],          desc: 'Black urad simmered overnight, finished with cream & butter.' },
    { name: 'Rogan Josh',           price: 44000,             veg_type: 'non_veg', prep_time_mins: 28, calories: 540, rating: 4.6, rating_count: 134, course: 'main',    allergens: ['dairy'],          desc: 'Kashmiri lamb curry with whole spices.' },
    { name: 'Kadhai Veg',           price: 26000,             veg_type: 'veg',     prep_time_mins: 16, calories: 320, rating: 4.2, rating_count: 67,  course: 'main',    allergens: [],                  desc: 'Mixed vegetables in roasted kadhai masala.' },
  ],
  'Biryani & Rice': [
    { name: 'Hyderabadi Chicken Biryani', price: 38000, mrp: 42000, veg_type: 'non_veg', prep_time_mins: 25, calories: 620, rating: 4.9, rating_count: 410, course: 'main', allergens: ['dairy', 'nuts'], desc: 'Layered dum biryani with basmati, chicken on the bone, fried onion, mint.' },
    { name: 'Mutton Biryani',             price: 46000,             veg_type: 'non_veg', prep_time_mins: 28, calories: 720, rating: 4.8, rating_count: 240, course: 'main', allergens: ['dairy', 'nuts'], desc: 'Slow-cooked mutton biryani with saffron rice.' },
    { name: 'Veg Dum Biryani',            price: 28000,             veg_type: 'veg',     prep_time_mins: 22, calories: 540, rating: 4.4, rating_count: 156, course: 'main', allergens: ['dairy'],         desc: 'Mixed veg layered dum biryani with raita.' },
    { name: 'Jeera Rice',                 price: 16000,             veg_type: 'veg',     prep_time_mins: 10, calories: 280, rating: 4.2, rating_count: 70,  course: 'sides', allergens: [],               desc: 'Basmati rice tempered with cumin & ghee.' },
  ],
  'Indian Breads': [
    { name: 'Butter Naan',          price: 6000,              veg_type: 'veg', prep_time_mins: 6,  calories: 220, rating: 4.5, rating_count: 188, course: 'sides', allergens: ['gluten', 'dairy'], desc: 'Soft tandoor naan brushed with butter.' },
    { name: 'Garlic Naan',          price: 8000,              veg_type: 'veg', prep_time_mins: 7,  calories: 240, rating: 4.6, rating_count: 165, course: 'sides', allergens: ['gluten', 'dairy'], desc: 'Naan with fresh garlic & coriander.' },
    { name: 'Tandoori Roti',        price: 4000,              veg_type: 'veg', prep_time_mins: 5,  calories: 160, rating: 4.3, rating_count: 102, course: 'sides', allergens: ['gluten'],         desc: 'Whole-wheat roti from clay oven.' },
    { name: 'Laccha Paratha',       price: 7000,              veg_type: 'veg', prep_time_mins: 8,  calories: 280, rating: 4.4, rating_count: 88,  course: 'sides', allergens: ['gluten', 'dairy'], desc: 'Layered crispy paratha.' },
  ],
  'Chinese & Indo-Chi': [
    { name: 'Chilli Chicken (Dry)', price: 32000,             veg_type: 'non_veg', prep_time_mins: 14, calories: 420, rating: 4.5, rating_count: 142, course: 'starter', allergens: ['gluten', 'soy'], desc: 'Bar-style dry chilli chicken, perfect with beer.' },
    { name: 'Schezwan Fried Rice',  price: 22000,             veg_type: 'veg',     prep_time_mins: 12, calories: 480, rating: 4.3, rating_count: 110, course: 'main',    allergens: ['gluten', 'soy'], desc: 'Wok-tossed rice with hot Schezwan paste.' },
    { name: 'Chicken Hakka Noodles',price: 24000,             veg_type: 'non_veg', prep_time_mins: 12, calories: 520, rating: 4.4, rating_count: 132, course: 'main',    allergens: ['gluten', 'soy', 'eggs'], desc: 'Stir-fried noodles, crunchy veg, soy.' },
    { name: 'Veg Manchurian',       price: 22000,             veg_type: 'veg',     prep_time_mins: 13, calories: 380, rating: 4.2, rating_count: 78,  course: 'starter', allergens: ['gluten', 'soy'], desc: 'Crispy veg balls in tangy Manchurian gravy.' },
  ],
  'Continental': [
    { name: 'Margherita Pizza',     price: 32000,             veg_type: 'veg',     prep_time_mins: 14, calories: 540, rating: 4.4, rating_count: 144, course: 'main', allergens: ['gluten', 'dairy'],         desc: 'San Marzano, mozzarella, basil, EVOO.' },
    { name: 'Penne Arrabbiata',     price: 28000,             veg_type: 'veg',     prep_time_mins: 12, calories: 520, rating: 4.3, rating_count: 88,  course: 'main', allergens: ['gluten'],                  desc: 'Penne in spicy tomato-garlic-chilli sauce.' },
    { name: 'Chicken Sizzler',      price: 44000,             veg_type: 'non_veg', prep_time_mins: 20, calories: 760, rating: 4.6, rating_count: 122, course: 'main', allergens: ['gluten', 'dairy', 'soy'],  desc: 'Grilled chicken steak, fries, sautéed veg, brown sauce.' },
  ],
  'Desserts': [
    { name: 'Gulab Jamun (2 pc)',   price: 12000,             veg_type: 'veg', prep_time_mins: 4, calories: 320, rating: 4.5, rating_count: 110, course: 'dessert', allergens: ['dairy', 'gluten'], desc: 'Warm milk-solid dumplings in cardamom syrup.' },
    { name: 'Choco Lava Cake',      price: 18000,             veg_type: 'egg', prep_time_mins: 8, calories: 460, rating: 4.7, rating_count: 168, course: 'dessert', allergens: ['gluten', 'dairy', 'eggs'], desc: 'Molten centre, served with vanilla ice-cream.' },
    { name: 'Kulfi Falooda',        price: 14000,             veg_type: 'veg', prep_time_mins: 5, calories: 380, rating: 4.4, rating_count: 78,  course: 'dessert', allergens: ['dairy', 'nuts', 'gluten'], desc: 'Saffron kulfi over rose falooda noodles.' },
  ],
  'Mocktails & Coolers': [
    { name: 'Virgin Mojito',        price: 16000, veg_type: 'veg', prep_time_mins: 4, calories: 110, rating: 4.5, rating_count: 142, course: 'beverages', item_type: 'beverage', allergens: [], desc: 'Lime, mint, soda, sugar.' },
    { name: 'Watermelon Cooler',    price: 14000, veg_type: 'veg', prep_time_mins: 4, calories: 130, rating: 4.3, rating_count: 76,  course: 'beverages', item_type: 'beverage', allergens: [], desc: 'Fresh watermelon, lime, mint.' },
    { name: 'Iced Lemon Tea',       price: 12000, veg_type: 'veg', prep_time_mins: 3, calories: 90,  rating: 4.2, rating_count: 88,  course: 'beverages', item_type: 'beverage', allergens: [], desc: 'House-brewed black tea, lemon, ice.' },
  ],
  'Beer': [
    { name: 'Kingfisher Premium (650ml)', price: 22000, veg_type: 'veg', prep_time_mins: 1, calories: 220, rating: 4.2, rating_count: 96,  course: 'beverages', item_type: 'beverage', allergens: ['gluten'], desc: 'Crisp Indian lager, ice-cold.' },
    { name: 'Bira White (330ml)',         price: 24000, veg_type: 'veg', prep_time_mins: 1, calories: 160, rating: 4.5, rating_count: 132, course: 'beverages', item_type: 'beverage', allergens: ['gluten'], desc: 'Wheat beer with coriander & orange peel.' },
    { name: 'Heineken (330ml)',           price: 28000, veg_type: 'veg', prep_time_mins: 1, calories: 150, rating: 4.4, rating_count: 110, course: 'beverages', item_type: 'beverage', allergens: ['gluten'], desc: 'Imported pale lager.' },
    { name: 'Draft Beer (Pint)',          price: 18000, veg_type: 'veg', prep_time_mins: 2, calories: 180, rating: 4.6, rating_count: 158, course: 'beverages', item_type: 'beverage', allergens: ['gluten'], desc: 'Chilled lager on tap.' },
  ],
  'Cocktails & Spirits': [
    { name: 'Old Fashioned',        price: 38000, veg_type: 'veg', prep_time_mins: 5, calories: 220, rating: 4.7, rating_count: 122, course: 'beverages', item_type: 'beverage', allergens: [], desc: 'Bourbon, sugar cube, bitters, orange peel.' },
    { name: 'Long Island Iced Tea', price: 42000, veg_type: 'veg', prep_time_mins: 5, calories: 280, rating: 4.5, rating_count: 96,  course: 'beverages', item_type: 'beverage', allergens: ['gluten'], desc: 'Five-spirit classic with cola top.' },
    { name: 'Whiskey Sour',         price: 36000, veg_type: 'egg', prep_time_mins: 4, calories: 200, rating: 4.4, rating_count: 78,  course: 'beverages', item_type: 'beverage', allergens: ['eggs'], desc: 'Bourbon, lemon, sugar, egg-white foam.' },
    { name: 'Espresso Martini',     price: 38000, veg_type: 'veg', prep_time_mins: 4, calories: 180, rating: 4.6, rating_count: 102, course: 'beverages', item_type: 'beverage', allergens: ['dairy'], desc: 'Vodka, fresh espresso, coffee liqueur.' },
  ],
};

// Stock photo IDs (Unsplash) — repeat where appropriate, just for visual demo
const PHOTOS = {
  'Paneer Tikka':         '1599487488170-d11ec9c172f0',
  'Tandoori Chicken':     '1599487488170-d11ec9c172f0',
  'Hariyali Kebab':       '1599487488170-d11ec9c172f0',
  'Tandoori Mushroom':    '1599487488170-d11ec9c172f0',
  'Galouti Kebab':        '1565895405137-61d31e7c0f78',
  'Seekh Kebab':          '1565895405137-61d31e7c0f78',
  'Reshmi Chicken Kebab': '1565895405137-61d31e7c0f78',
  'Veg Sheekh Kebab':     '1565895405137-61d31e7c0f78',
  'Tom Yum Soup':         '1547592180-85f173990554',
  'Sweet Corn Soup':      '1547592180-85f173990554',
  'Greek Salad':          '1540420773420-3366772f4999',
  'Caesar Salad':         '1540420773420-3366772f4999',
  'Butter Chicken':       '1603894584373-5ac82b2ae398',
  'Paneer Butter Masala': '1603894584373-5ac82b2ae398',
  'Dal Makhani':          '1626500155436-78cdf3ef0e30',
  'Rogan Josh':           '1626500155436-78cdf3ef0e30',
  'Kadhai Veg':           '1626500155436-78cdf3ef0e30',
  'Hyderabadi Chicken Biryani': '1589302168068-964664d93dc0',
  'Mutton Biryani':       '1589302168068-964664d93dc0',
  'Veg Dum Biryani':      '1589302168068-964664d93dc0',
  'Jeera Rice':           '1589302168068-964664d93dc0',
  'Butter Naan':          '1601050690597-df0568f70950',
  'Garlic Naan':          '1601050690597-df0568f70950',
  'Tandoori Roti':        '1601050690597-df0568f70950',
  'Laccha Paratha':       '1601050690597-df0568f70950',
  'Chilli Chicken (Dry)': '1582719478250-c89cae4dc85b',
  'Schezwan Fried Rice':  '1582719478250-c89cae4dc85b',
  'Chicken Hakka Noodles':'1582719478250-c89cae4dc85b',
  'Veg Manchurian':       '1582719478250-c89cae4dc85b',
  'Margherita Pizza':     '1565299624946-b28f40a0ae38',
  'Penne Arrabbiata':     '1551183053-bf91a1d81141',
  'Chicken Sizzler':      '1546833999-b9f581a1996d',
  'Gulab Jamun (2 pc)':   '1606471191009-63994c53433b',
  'Choco Lava Cake':      '1606471191009-63994c53433b',
  'Kulfi Falooda':        '1606471191009-63994c53433b',
  'Virgin Mojito':        '1551024601-bec78aea704b',
  'Watermelon Cooler':    '1551024601-bec78aea704b',
  'Iced Lemon Tea':       '1551024601-bec78aea704b',
  'Kingfisher Premium (650ml)': '1568644396922-5c3bfae12521',
  'Bira White (330ml)':   '1568644396922-5c3bfae12521',
  'Heineken (330ml)':     '1568644396922-5c3bfae12521',
  'Draft Beer (Pint)':    '1568644396922-5c3bfae12521',
  'Old Fashioned':        '1514362545857-3bc16c4c7d1b',
  'Long Island Iced Tea': '1514362545857-3bc16c4c7d1b',
  'Whiskey Sour':         '1514362545857-3bc16c4c7d1b',
  'Espresso Martini':     '1514362545857-3bc16c4c7d1b',
};

// Per-item recipe ingredients (kept short — 2-4 per item for demo)
const INGREDIENTS_BY_ITEM = {
  'Paneer Tikka':         [{ name: 'Paneer',        allergens: ['dairy'], calories: 220, is_critical: true  }, { name: 'Hung Curd', allergens: ['dairy'], calories: 60, is_critical: false }],
  'Tandoori Chicken':     [{ name: 'Chicken',       allergens: [],        calories: 280, is_critical: true  }, { name: 'Yogurt',     allergens: ['dairy'], calories: 50, is_critical: false }],
  'Galouti Kebab':        [{ name: 'Mutton Mince',  allergens: [],        calories: 240, is_critical: true  }, { name: 'Cashew Paste', allergens: ['nuts'], calories: 80, is_critical: false }, { name: 'Warqi Paratha', allergens: ['gluten', 'dairy'], calories: 90, is_critical: false }],
  'Butter Chicken':       [{ name: 'Chicken',       allergens: [],        calories: 280, is_critical: true  }, { name: 'Tomato Gravy', allergens: ['nuts'], calories: 120, is_critical: false }, { name: 'Cream', allergens: ['dairy'], calories: 110, is_critical: false }],
  'Paneer Butter Masala': [{ name: 'Paneer',        allergens: ['dairy'], calories: 220, is_critical: true  }, { name: 'Tomato-Cashew Gravy', allergens: ['nuts'], calories: 180, is_critical: false }],
  'Dal Makhani':          [{ name: 'Black Urad',    allergens: [],        calories: 200, is_critical: true  }, { name: 'Cream', allergens: ['dairy'], calories: 110, is_critical: false }],
  'Hyderabadi Chicken Biryani': [{ name: 'Basmati Rice', allergens: [], calories: 260, is_critical: true }, { name: 'Chicken', allergens: [], calories: 220, is_critical: true }, { name: 'Saffron', allergens: [], calories: 5, is_critical: false }, { name: 'Fried Onion', allergens: [], calories: 80, is_critical: false }],
  'Mutton Biryani':       [{ name: 'Basmati Rice',  allergens: [],        calories: 260, is_critical: true  }, { name: 'Mutton', allergens: [], calories: 320, is_critical: true }, { name: 'Yogurt Marinade', allergens: ['dairy'], calories: 80, is_critical: false }],
  'Veg Dum Biryani':      [{ name: 'Basmati Rice',  allergens: [],        calories: 260, is_critical: true  }, { name: 'Mixed Veg', allergens: [], calories: 100, is_critical: true }, { name: 'Saffron', allergens: [], calories: 5, is_critical: false }],
  'Butter Naan':          [{ name: 'Refined Flour', allergens: ['gluten'],calories: 140, is_critical: true  }, { name: 'Butter', allergens: ['dairy'], calories: 80, is_critical: false }],
  'Margherita Pizza':     [{ name: 'Pizza Dough',   allergens: ['gluten'],calories: 240, is_critical: true  }, { name: 'Mozzarella', allergens: ['dairy'], calories: 180, is_critical: true }, { name: 'Tomato Sauce', allergens: [], calories: 60, is_critical: false }],
  'Chicken Sizzler':      [{ name: 'Chicken Steak', allergens: [],        calories: 320, is_critical: true  }, { name: 'Brown Sauce', allergens: ['gluten', 'soy'], calories: 140, is_critical: false }, { name: 'Fries', allergens: [], calories: 220, is_critical: false }],
  'Choco Lava Cake':      [{ name: 'Cake Batter',   allergens: ['gluten', 'eggs', 'dairy'], calories: 320, is_critical: true }, { name: 'Dark Chocolate', allergens: ['dairy'], calories: 140, is_critical: true }],
  'Old Fashioned':        [{ name: 'Bourbon',       allergens: [],        calories: 140, is_critical: true  }, { name: 'Sugar Cube', allergens: [], calories: 20, is_critical: false }, { name: 'Bitters', allergens: [], calories: 5, is_critical: false }],
  'Espresso Martini':     [{ name: 'Vodka',         allergens: [],        calories: 90,  is_critical: true  }, { name: 'Espresso', allergens: [], calories: 5, is_critical: false }, { name: 'Coffee Liqueur', allergens: [], calories: 80, is_critical: false }],
  'Kingfisher Premium (650ml)': [{ name: 'Kingfisher Bottle 650ml', allergens: ['gluten'], calories: 220, is_critical: true }],
  'Bira White (330ml)':         [{ name: 'Bira White Bottle 330ml', allergens: ['gluten'], calories: 160, is_critical: true }],
  'Heineken (330ml)':           [{ name: 'Heineken Bottle 330ml',   allergens: ['gluten'], calories: 150, is_critical: true }],
  'Draft Beer (Pint)':          [{ name: 'Draft Beer Keg',          allergens: ['gluten'], calories: 180, is_critical: true }],
};

// ─── Combos ───────────────────────────────────────────────────────────────────

const COMBOS = [
  {
    name:        'Date Night for Two',
    description: 'Butter Chicken + Garlic Naan x2 + Paneer Tikka + 2 Mocktails',
    image_url:   STOCK_PIC('1603894584373-5ac82b2ae398'),
    price:       119000,  // ₹1190 (vs ₹1300+ separately)
    mrp:         132000,
    items: [
      { name: 'Butter Chicken',  qty: 1 },
      { name: 'Garlic Naan',     qty: 2 },
      { name: 'Paneer Tikka',    qty: 1 },
      { name: 'Virgin Mojito',   qty: 2 },
    ],
  },
  {
    name:        'Biryani + Beer Combo',
    description: 'Hyderabadi Chicken Biryani + Kingfisher Premium 650ml',
    image_url:   STOCK_PIC('1589302168068-964664d93dc0'),
    price:       54000,
    mrp:         60000,
    items: [
      { name: 'Hyderabadi Chicken Biryani', qty: 1 },
      { name: 'Kingfisher Premium (650ml)', qty: 1 },
    ],
  },
  {
    name:        'Beer Bucket (4 pints)',
    description: 'Four chilled draft beer pints — for the table',
    image_url:   STOCK_PIC('1568644396922-5c3bfae12521'),
    price:       64000,
    mrp:         72000,
    items: [
      { name: 'Draft Beer (Pint)', qty: 4 },
    ],
  },
  {
    name:        'Veg Family Feast',
    description: 'Paneer Butter Masala + Dal Makhani + Veg Dum Biryani + Naan x4',
    image_url:   STOCK_PIC('1626500155436-78cdf3ef0e30'),
    price:       108000,
    mrp:         124000,
    items: [
      { name: 'Paneer Butter Masala', qty: 1 },
      { name: 'Dal Makhani',          qty: 1 },
      { name: 'Veg Dum Biryani',      qty: 1 },
      { name: 'Butter Naan',          qty: 4 },
    ],
  },
];

// ─── Seeder ───────────────────────────────────────────────────────────────────

async function wipeRestroBar() {
  console.log('  Wiping existing Restro Bar catalogue...');
  await prisma.comboItem.deleteMany({ where: { combo: { tenant_id: TENANT_ID } } });
  await prisma.combo.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.itemIngredient.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.itemAddonGroup.deleteMany({ where: { item: { tenant_id: TENANT_ID } } });
  await prisma.itemOptionChoice.deleteMany({ where: { option_group: { tenant_id: TENANT_ID } } });
  await prisma.itemOptionGroup.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.catalogueItem.deleteMany({ where: { tenant_id: TENANT_ID } });
  await prisma.catalogueSection.deleteMany({ where: { tenant_id: TENANT_ID } });
  console.log('  Wipe complete.');
}

async function seedSections() {
  const created = {};
  for (let i = 0; i < SECTIONS.length; i++) {
    const s = SECTIONS[i];
    const row = await prisma.catalogueSection.create({
      data: {
        tenant_id:    TENANT_ID,
        branch_id:    BRANCH_ID,
        name:         s.name,
        description:  s.description,
        position:     i,
        is_available: true,
      },
    });
    created[s.name] = row.id;
  }
  console.log(`  Sections: ${Object.keys(created).length}`);
  return created;
}

async function seedItems(sectionIds) {
  const itemNameToId = {};
  let sortBase = 0;
  let total = 0;

  for (const sectionName of Object.keys(ITEMS)) {
    const section_id = sectionIds[sectionName];
    if (!section_id) continue;

    const list = ITEMS[sectionName];
    for (let i = 0; i < list.length; i++) {
      const it = list[i];
      const photoId = PHOTOS[it.name];
      const images = photoId ? img(STOCK_PIC(photoId)) : [];

      const row = await prisma.catalogueItem.create({
        data: {
          tenant_id:      TENANT_ID,
          branch_id:      BRANCH_ID,
          section:        { connect: { id: section_id } },
          name:           it.name,
          description:    it.desc,
          images,
          price:          it.price,
          mrp:            it.mrp ?? it.price,
          unit:           'plate',
          veg_type:       it.veg_type,
          meal_type:      'all_day',
          item_type:      it.item_type || 'food',
          course:         it.course,
          prep_time_mins: it.prep_time_mins,
          calories:       it.calories,
          rating:         it.rating,
          rating_count:   it.rating_count || 0,
          is_food:        (it.item_type || 'food') === 'food',
          is_available:   true,
          sort_order:     sortBase + i,
          attributes:     [],
          variants:       [],
        },
      });

      // allergens column exists on table but client is stale — update via raw SQL
      if (it.allergens && it.allergens.length) {
        await prisma.$executeRawUnsafe(
          `UPDATE catalogue.catalogue_items SET allergens = $1::text[] WHERE id = $2`,
          it.allergens, row.id
        );
      }

      itemNameToId[it.name] = row.id;
      total++;

      // Ingredients (recipe + allergen reference)
      const recipe = INGREDIENTS_BY_ITEM[it.name];
      if (recipe && recipe.length) {
        await prisma.itemIngredient.createMany({
          data: recipe.map((r) => ({
            tenant_id:   TENANT_ID,
            item_id:     row.id,
            name:        r.name,
            calories:    r.calories,
            allergens:   r.allergens || [],
            is_critical: !!r.is_critical,
          })),
        });
      }
    }
    sortBase += list.length;
  }

  console.log(`  Items: ${total}`);
  return itemNameToId;
}

async function seedCombos(itemNameToId) {
  let sortBase = 0;
  let total = 0;
  for (const c of COMBOS) {
    const combo = await prisma.combo.create({
      data: {
        tenant_id:    TENANT_ID,
        branch_id:    BRANCH_ID,
        name:         c.name,
        description:  c.description,
        image_url:    Array.isArray(c.image_url) ? c.image_url[0].url : c.image_url,
        price:        c.price,
        mrp:          c.mrp,
        is_available: true,
        sort_order:   sortBase++,
      },
    });

    for (const ci of c.items) {
      const item_id = itemNameToId[ci.name];
      if (!item_id) {
        console.warn(`    ! combo "${c.name}" missing item: ${ci.name}`);
        continue;
      }
      await prisma.comboItem.create({
        data: {
          combo_id: combo.id,
          item_id,
          quantity: ci.qty,
        },
      });
    }
    total++;
  }
  console.log(`  Combos: ${total}`);
}

async function main() {
  console.log(`Seeding Restro Bar (tenant=${TENANT_ID}, branch=${BRANCH_ID})`);
  await wipeRestroBar();
  const sectionIds = await seedSections();
  const itemNameToId = await seedItems(sectionIds);
  await seedCombos(itemNameToId);
  console.log('Done.');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
