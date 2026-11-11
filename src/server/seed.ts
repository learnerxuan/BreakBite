import type { Allergen, Diet, FoodInfo, Spice } from '../shared/features.js';
import type { Actor, MenuItem, VendorState } from '../shared/model.js';

/** Supplied campus photos and demo menu data. Operators must review before serving. */
export const VENDOR_IDS = ['asian-cuisine', 'bobanika', 'chinese-kitchen', 'japanese-kitchen', 'korean-kitchen', 'lets-kopitiam', 'nelson', 'subway', 'western-kitchen'] as const;
export const LEGACY_VENDOR_IDS = ['bowl-lab', 'noodle-co'] as const;
export const ALL_VENDOR_IDS = [...VENDOR_IDS, ...LEGACY_VENDOR_IDS] as const;

export const DEMO_IDENTITIES: Actor[] = [
    { id: 'student-alex', role: 'student', name: 'Alex · student' },
    { id: 'student-sam', role: 'student', name: 'Sam · student' },
    { id: 'vendor-bowl', role: 'vendor', name: 'Bowl Lab · operator', vendorId: 'bowl-lab' },
    { id: 'vendor-noodle', role: 'vendor', name: 'Noodle & Co. · operator', vendorId: 'noodle-co' },
];

type MenuSeed = Omit<MenuItem, 'vendorId' | 'stock' | 'enabled' | 'photoPath' | 'photoCredit'>;
type KitchenSeed = { name: string; description: string; location: string; restaurantPhoto: string | null; items: MenuSeed[]; };
type SampleSpice = 'none' | 'mild' | 'medium' | 'spicy' | 'extra-spicy';
const allergenAliases: Record<string, Allergen> = { dairy: 'milk', egg: 'eggs', peanuts: 'peanuts', 'tree nuts': 'tree_nuts', soy: 'soy', sesame: 'sesame', fish: 'fish', shellfish: 'shellfish', gluten: 'gluten', wheat: 'wheat' };
const dietAliases: Record<string, Diet> = { Vegetarian: 'vegetarian', Vegan: 'vegan', Pescatarian: 'pescatarian' };
const spiceAliases: Record<SampleSpice, Spice> = { none: 'non_spicy', mild: 'mild', medium: 'medium', spicy: 'spicy', 'extra-spicy': 'extra_spicy' };
const legacyFood = (id: string, name: string, description: string, category: MenuItem['category'], priceSen: number, prepMinutes: number, prepUnits: number, art: MenuItem['art'], tags: string[]): MenuSeed =>
    ({ id, name, description, category, priceSen, prepMinutes, prepUnits, art, tags, allergens: null });
const food = (id: string, name: string, description: string, category: MenuItem['category'], priceSen: number, prepMinutes: number, prepUnits: number, art: MenuItem['art'], ingredients: string[] | null, dietaryTags: string[] | null, allergenNames: string[] | null, spiceLevel: SampleSpice = 'none'): MenuSeed => {
    const allergens = (allergenNames ?? []).flatMap(value => allergenAliases[value] ? [allergenAliases[value]!] : []);
    const diets = (dietaryTags ?? []).flatMap(value => dietAliases[value] ? [dietAliases[value]!] : []);
    const foodInfo: FoodInfo = { ingredients: ingredients?.join(', ') ?? '', allergens, mayContain: [], allergensKnown: allergenNames !== null, diets, spice: spiceAliases[spiceLevel], reviewedAt: '2026-11-10T00:00:00.000Z', reviewedBy: 'sample-seed' };
    return { id, name, description, category, priceSen, prepMinutes, prepUnits, art, tags: ['Sample menu', ...diets], allergens: foodInfo.allergensKnown ? allergens : null, foodInfo };
};

const kitchens: Record<string, KitchenSeed> = {
    'bowl-lab': { name: 'Bowl Lab', description: 'Good bowls. Better breaks.', location: 'Food court · Counter A', restaurantPhoto: null, items: [
        legacyFood('chicken-rice', 'Golden chicken rice', 'Ginger rice, roasted chicken and crisp cucumber.', 'Rice', 950, 5, 2, 'rice', ['Campus favourite']),
        legacyFood('tofu-bowl', 'Sesame tofu bowl', 'Tofu, seasonal greens and fragrant sesame rice.', 'Rice', 850, 3, 1, 'salad', ['Quick pick']),
        legacyFood('egg-toast', 'Egg & toast box', 'Soft egg, toasted bread and a side of greens.', 'Light bites', 650, 3, 1, 'toast', ['Light lunch']),
        legacyFood('veggie-rice', 'Garden rice bowl', 'Colourful vegetables with rice and a tangy dressing.', 'Rice', 800, 4, 1, 'salad', ['Fresh pick']),
        legacyFood('lime-tea', 'Iced lime tea', 'Freshly brewed tea with a citrus finish.', 'Drinks', 300, 1, 1, 'drink', ['Refreshing']),
    ] },
    'noodle-co': { name: 'Noodle & Co.', description: 'A little comfort between classes.', location: 'Food court · Counter B', restaurantPhoto: null, items: [
        legacyFood('mee-goreng', 'Wok-fried mee', 'Springy noodles, vegetables and a savoury wok sauce.', 'Noodles', 1000, 8, 3, 'noodles', ['Made to order']),
        legacyFood('soup-noodles', 'Comfort noodle soup', 'Warm broth, noodles and crunchy greens.', 'Noodles', 900, 6, 2, 'noodles', ['Comfort food']),
        legacyFood('cold-noodles', 'Sesame noodle box', 'Chilled noodles with sesame dressing and cucumber.', 'Noodles', 750, 3, 1, 'noodles', ['Quick pick']),
        legacyFood('toast-pocket', 'Crunchy toast pocket', 'A toasted pocket filled with vegetables.', 'Light bites', 600, 3, 1, 'toast', ['Light lunch']),
        legacyFood('lemon-water', 'Sparkling lemon', 'A bright, citrusy refreshment.', 'Drinks', 300, 1, 1, 'drink', ['Refreshing']),
    ] },
    'asian-cuisine': { name: 'Asian Cuisine', description: 'Everyday Asian favourites for a quick campus meal.', location: 'Cafeteria (Level 3)', restaurantPhoto: '/images/cafeterias/asian-cuisine.jpg', items: [
        food('nasi-lemak', 'Nasi lemak ayam', 'Coconut rice with sambal, egg and fried chicken.', 'Rice', 1050, 8, 3, 'rice', ['coconut rice', 'chicken', 'egg', 'sambal', 'peanuts'], null, ['egg', 'peanuts'], 'medium'),
        food('asian-chicken-rice', 'Hainanese chicken rice', 'Poached chicken with fragrant rice and cucumber.', 'Rice', 950, 6, 2, 'rice', ['chicken', 'rice', 'ginger', 'cucumber'], null, null, 'none'),
        food('char-kuey-teow', 'Char kuey teow', 'Wok-fried flat noodles with egg and vegetables.', 'Noodles', 900, 8, 3, 'noodles', ['rice noodles', 'egg', 'soy sauce', 'bean sprouts'], null, ['egg', 'soy'], 'medium'),
        food('vegetable-fried-rice', 'Vegetable fried rice', 'Wok-fried rice with mixed vegetables.', 'Rice', 750, 6, 2, 'rice', ['rice', 'mixed vegetables', 'soy sauce'], ['Vegetarian'], ['soy'], 'mild'),
        food('teh-o-ais', 'Iced tea', 'Chilled black tea with a light sweetness.', 'Drinks', 280, 1, 1, 'drink', ['black tea', 'sugar'], ['Vegan'], null, 'none'),
    ] },
    bobanika: { name: 'Bobanika', description: 'Milk tea, fruit tea and quick sweet treats.', location: 'Above Centre Point (Level 5)', restaurantPhoto: '/images/cafeterias/bobanika.jpg', items: [
        food('brown-sugar-milk-tea', 'Brown sugar milk tea', 'Milk tea with brown sugar pearls.', 'Drinks', 850, 3, 1, 'drink', ['black tea', 'milk', 'brown sugar', 'tapioca pearls'], ['Vegetarian'], ['dairy'], 'none'),
        food('mango-fruit-tea', 'Mango fruit tea', 'Mango tea with fruit pieces.', 'Drinks', 780, 2, 1, 'drink', ['tea', 'mango', 'sugar'], ['Vegan'], null, 'none'),
        food('matcha-latte', 'Matcha latte', 'Creamy matcha green tea latte.', 'Drinks', 850, 3, 1, 'drink', ['matcha', 'milk', 'sugar'], ['Vegetarian'], ['dairy'], 'none'),
        food('chocolate-waffle', 'Chocolate waffle', 'Crisp waffle with chocolate drizzle.', 'Light bites', 700, 5, 2, 'toast', ['wheat flour', 'egg', 'milk', 'chocolate'], ['Vegetarian'], ['gluten', 'egg', 'dairy'], 'none'),
        food('lemon-tea', 'Honey lemon tea', 'Hot lemon tea with honey.', 'Drinks', 600, 2, 1, 'drink', ['tea', 'lemon', 'honey'], ['Vegetarian'], null, 'none'),
    ] },
    'chinese-kitchen': { name: 'Chinese Kitchen', description: 'Comforting rice and noodle dishes made to order.', location: 'Cafeteria (Level 3)', restaurantPhoto: '/images/cafeterias/chinese.jpg', items: [
        food('claypot-chicken-rice', 'Claypot chicken rice', 'Chicken, mushrooms and rice in a savoury sauce.', 'Rice', 1150, 10, 4, 'rice', ['rice', 'chicken', 'mushrooms', 'soy sauce'], null, ['soy'], 'mild'),
        food('beef-hor-fun', 'Beef hor fun', 'Flat rice noodles with beef and greens.', 'Noodles', 1100, 9, 3, 'noodles', ['rice noodles', 'beef', 'vegetables', 'soy sauce'], null, ['soy'], 'mild'),
        food('mapo-tofu-rice', 'Mapo tofu rice', 'Silken tofu with a warming chilli sauce and rice.', 'Rice', 900, 7, 3, 'rice', ['tofu', 'rice', 'chilli', 'soy sauce'], ['Vegetarian'], ['soy'], 'spicy'),
        food('vegetable-noodles', 'Vegetable noodle soup', 'Noodles in a light vegetable broth.', 'Noodles', 850, 6, 2, 'noodles', ['wheat noodles', 'vegetables', 'broth'], ['Vegetarian'], ['gluten'], 'none'),
        food('barley-drink', 'Iced barley', 'Lightly sweetened chilled barley drink.', 'Drinks', 300, 1, 1, 'drink', ['barley', 'sugar'], ['Vegan'], ['gluten'], 'none'),
    ] },
    'japanese-kitchen': { name: 'Japanese Kitchen', description: 'Japanese-inspired rice bowls, noodles and bites.', location: 'Cafeteria (Level 3)', restaurantPhoto: '/images/cafeterias/japanese.jpg', items: [
        food('teriyaki-chicken-don', 'Teriyaki chicken don', 'Grilled chicken with teriyaki sauce over rice.', 'Rice', 1200, 8, 3, 'rice', ['chicken', 'rice', 'soy sauce', 'sesame'], null, ['soy', 'sesame'], 'none'),
        food('beef-yakiniku-don', 'Beef yakiniku don', 'Sliced beef with a savoury sauce and rice.', 'Rice', 1350, 9, 4, 'rice', ['beef', 'rice', 'soy sauce', 'sesame'], null, ['soy', 'sesame'], 'none'),
        food('vegetable-udon', 'Vegetable udon', 'Udon noodles with vegetables in a light broth.', 'Noodles', 950, 6, 2, 'noodles', ['wheat noodles', 'vegetables', 'soy sauce'], ['Vegetarian'], ['gluten', 'soy'], 'none'),
        food('takoyaki', 'Takoyaki bites', 'Octopus-filled savoury batter bites.', 'Light bites', 800, 5, 2, 'toast', ['wheat flour', 'octopus', 'egg', 'mayonnaise'], null, ['gluten', 'shellfish', 'egg'], 'none'),
        food('green-tea', 'Iced green tea', 'Unsweetened chilled green tea.', 'Drinks', 350, 1, 1, 'drink', ['green tea'], ['Vegan'], null, 'none'),
    ] },
    'korean-kitchen': { name: 'Korean Kitchen', description: 'Korean comfort food with your chosen heat level.', location: 'Cafeteria (Level 3)', restaurantPhoto: '/images/cafeterias/korean.jpg', items: [
        food('chicken-bibimbap', 'Chicken bibimbap', 'Rice bowl with chicken, vegetables and chilli paste.', 'Rice', 1200, 8, 3, 'rice', ['rice', 'chicken', 'vegetables', 'egg', 'gochujang'], null, ['egg', 'soy'], 'medium'),
        food('kimchi-fried-rice', 'Kimchi fried rice', 'Fried rice with kimchi and vegetables.', 'Rice', 950, 7, 3, 'rice', ['rice', 'kimchi', 'vegetables', 'soy sauce'], ['Vegetarian'], ['soy'], 'spicy'),
        food('ramyeon', 'Korean ramyeon', 'Instant-style noodle soup with vegetables.', 'Noodles', 800, 5, 2, 'noodles', ['wheat noodles', 'broth', 'vegetables'], null, ['gluten'], 'spicy'),
        food('tteokbokki', 'Tteokbokki', 'Chewy rice cakes in a sweet and spicy sauce.', 'Light bites', 750, 6, 2, 'toast', ['rice cakes', 'chilli paste', 'soy sauce'], ['Vegan'], ['soy'], 'spicy'),
        food('yuzu-ade', 'Yuzu ade', 'Sparkling citrus drink.', 'Drinks', 500, 1, 1, 'drink', ['yuzu', 'sparkling water', 'sugar'], ['Vegan'], null, 'none'),
    ] },
    'lets-kopitiam': { name: "Let's Kopitiam", description: 'Classic Malaysian breakfast and comfort food.', location: 'Cafeteria (Level 3)', restaurantPhoto: '/images/cafeterias/lets-kopitiam.jpg', items: [
        food('kaya-toast-set', 'Kaya toast set', 'Toast with kaya, butter and soft-boiled eggs.', 'Light bites', 650, 4, 1, 'toast', ['bread', 'coconut jam', 'butter', 'egg'], ['Vegetarian'], ['gluten', 'dairy', 'egg'], 'none'),
        food('nasi-lemak-kopitiam', 'Nasi lemak', 'Coconut rice with sambal, egg and anchovies.', 'Rice', 750, 5, 2, 'rice', ['coconut rice', 'egg', 'anchovies', 'peanuts', 'sambal'], null, ['egg', 'fish', 'peanuts'], 'medium'),
        food('curry-noodles', 'Curry noodles', 'Noodles in a fragrant curry broth.', 'Noodles', 900, 7, 3, 'noodles', ['wheat noodles', 'curry broth', 'tofu', 'vegetables'], null, ['gluten', 'soy'], 'medium'),
        food('half-boiled-eggs', 'Half-boiled eggs', 'Two soft-boiled eggs with soy and pepper.', 'Light bites', 400, 3, 1, 'toast', ['eggs', 'soy sauce', 'pepper'], ['Vegetarian'], ['egg', 'soy'], 'none'),
        food('kopi-o-ais', 'Iced black coffee', 'Chilled local black coffee.', 'Drinks', 300, 1, 1, 'drink', ['coffee', 'sugar'], ['Vegan'], null, 'none'),
    ] },
    nelson: { name: 'Nelson', description: 'Snackable corn, waffles and drinks between classes.', location: 'Atrium (Level 3)', restaurantPhoto: '/images/cafeterias/nelson.jpg', items: [
        food('sweet-corn-cup', 'Sweet corn cup', 'Warm sweet corn with butter option.', 'Light bites', 450, 2, 1, 'salad', ['sweet corn', 'butter'], ['Vegetarian'], ['dairy'], 'none'),
        food('chicken-sausage', 'Chicken sausage', 'Grilled chicken sausage on a stick.', 'Light bites', 450, 3, 1, 'toast', ['chicken sausage'], null, null, 'none'),
        food('cheese-waffle', 'Cheese waffle', 'Fresh waffle with melted cheese.', 'Light bites', 650, 5, 2, 'toast', ['wheat flour', 'egg', 'milk', 'cheese'], ['Vegetarian'], ['gluten', 'egg', 'dairy'], 'none'),
        food('corn-in-cup-spicy', 'Spicy corn cup', 'Sweet corn tossed with chilli seasoning.', 'Light bites', 450, 2, 1, 'salad', ['sweet corn', 'chilli seasoning'], ['Vegan'], null, 'medium'),
        food('iced-milo', 'Iced Milo', 'Chocolate malt drink served cold.', 'Drinks', 400, 1, 1, 'drink', ['malted chocolate drink', 'milk'], ['Vegetarian'], ['dairy'], 'none'),
    ] },
    subway: { name: 'Subway', description: 'Customisable subs, wraps and quick drinks.', location: 'Above Centre Point (Level 5)', restaurantPhoto: '/images/cafeterias/subway.jpg', items: [
        food('chicken-teriyaki-sub', 'Chicken teriyaki sub', 'Chicken teriyaki with salad in a bread roll.', 'Light bites', 1250, 6, 3, 'toast', ['wheat bread', 'chicken', 'teriyaki sauce', 'salad'], null, ['gluten', 'soy'], 'none'),
        food('veggie-delite-sub', 'Veggie Delite sub', 'Fresh salad vegetables in a bread roll.', 'Light bites', 950, 4, 2, 'toast', ['wheat bread', 'lettuce', 'tomato', 'cucumber', 'onion'], ['Vegetarian', 'Vegan'], ['gluten'], 'none'),
        food('tuna-sub', 'Tuna sub', 'Tuna mayonnaise with fresh salad.', 'Light bites', 1150, 5, 2, 'toast', ['wheat bread', 'tuna', 'mayonnaise', 'salad'], null, ['gluten', 'fish', 'egg'], 'none'),
        food('chicken-wrap', 'Chicken wrap', 'Grilled chicken and salad in a tortilla wrap.', 'Light bites', 1200, 5, 2, 'toast', ['wheat tortilla', 'chicken', 'salad'], null, ['gluten'], 'none'),
        food('bottled-water', 'Bottled water', 'Still drinking water.', 'Drinks', 250, 1, 1, 'drink', ['water'], ['Vegan'], null, 'none'),
    ] },
    'western-kitchen': { name: 'Western Kitchen', description: 'Hearty grilled meals and pasta for a longer break.', location: 'Cafeteria (Level 3)', restaurantPhoto: '/images/cafeterias/western.jpg', items: [
        food('grilled-chicken-chop', 'Grilled chicken chop', 'Grilled chicken with fries and coleslaw.', 'Rice', 1450, 10, 4, 'rice', ['chicken', 'potato', 'cabbage', 'mayonnaise'], null, ['egg'], 'none'),
        food('black-pepper-beef', 'Black pepper beef rice', 'Beef strips with black pepper sauce and rice.', 'Rice', 1350, 9, 4, 'rice', ['beef', 'rice', 'black pepper sauce', 'soy sauce'], null, ['soy'], 'mild'),
        food('mushroom-pasta', 'Creamy mushroom pasta', 'Pasta with mushroom cream sauce.', 'Noodles', 1200, 9, 3, 'noodles', ['wheat pasta', 'mushrooms', 'milk', 'cheese'], ['Vegetarian'], ['gluten', 'dairy'], 'none'),
        food('garden-salad', 'Garden salad', 'Fresh greens, tomato and cucumber.', 'Light bites', 750, 3, 1, 'salad', ['lettuce', 'tomato', 'cucumber', 'dressing'], ['Vegan'], null, 'none'),
        food('lemon-soda', 'Lemon soda', 'Sparkling lemon drink.', 'Drinks', 350, 1, 1, 'drink', ['lemon', 'sparkling water', 'sugar'], ['Vegan'], null, 'none'),
    ] },
};

export function seedVendor(id: string, now = Date.now()): VendorState {
    const kitchen = kitchens[id];
    if (!kitchen) throw new Error(`Unknown seed kitchen: ${id}`);
    const start = Math.ceil((now + 10 * 60000) / 300000) * 300000;
    return {
        schemaVersion: 1, revision: 0,
        vendor: { id, name: kitchen.name, description: kitchen.description, location: kitchen.location, open: true, synthetic: true },
        items: kitchen.items.map(item => ({
            ...item,
            vendorId: id,
            ...(kitchen.restaurantPhoto ? { photoPath: `/images/menu/${item.id}.jpg`, photoCredit: 'AI-generated illustrative sample; actual kitchen item may differ.' } : {}),
            stock: 20,
            enabled: true,
        })),
        slots: Array.from({ length: 36 }, (_, i) => ({ id: `${id}-${start + i * 300000}`, startAt: new Date(start + i * 300000).toISOString(), endAt: new Date(start + i * 300000 + 180000).toISOString(), kitchenCapacity: 8, reservedUnits: 0, pickupCapacity: 4, reservedHandovers: 0 })),
        orders: [], incidents: [], proposals: [], audit: [], requests: {},
    };
}
