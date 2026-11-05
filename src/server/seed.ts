import type { Actor, MenuItem, VendorState } from '../shared/model.js';
export const VENDOR_IDS = ['bowl-lab', 'noodle-co'] as const;
export const DEMO_IDENTITIES: Actor[] = [
    { id: 'student-alex', role: 'student', name: 'Alex · student' },
    { id: 'student-sam', role: 'student', name: 'Sam · student' },
    { id: 'vendor-bowl', role: 'vendor', name: 'Bowl Lab · operator', vendorId: 'bowl-lab' },
    { id: 'vendor-noodle', role: 'vendor', name: 'Noodle & Co. · operator', vendorId: 'noodle-co' },
];
export function seedVendor(id: string, now = Date.now()): VendorState {
    const bowl = id === 'bowl-lab';
    const rows: [
        string,
        string,
        string,
        MenuItem['category'],
        number,
        number,
        number,
        MenuItem['art'],
        string[]
    ][] = bowl ? [
        ['chicken-rice', 'Golden chicken rice', 'Ginger rice, roasted chicken and crisp cucumber.', 'Rice', 950, 5, 2, 'rice', ['Campus favourite']],
        ['tofu-bowl', 'Sesame tofu bowl', 'Tofu, seasonal greens and fragrant sesame rice.', 'Rice', 850, 3, 1, 'salad', ['Quick pick']],
        ['egg-toast', 'Egg & toast box', 'Soft egg, toasted bread and a side of greens.', 'Light bites', 650, 3, 1, 'toast', ['Light lunch']],
        ['veggie-rice', 'Garden rice bowl', 'Colourful vegetables with rice and a tangy dressing.', 'Rice', 800, 4, 1, 'salad', ['Fresh pick']],
        ['lime-tea', 'Iced lime tea', 'Freshly brewed tea with a citrus finish.', 'Drinks', 300, 1, 1, 'drink', ['Refreshing']],
    ] : [
        ['mee-goreng', 'Wok-fried mee', 'Springy noodles, vegetables and a savoury wok sauce.', 'Noodles', 1000, 8, 3, 'noodles', ['Made to order']],
        ['soup-noodles', 'Comfort noodle soup', 'Warm broth, noodles and crunchy greens.', 'Noodles', 900, 6, 2, 'noodles', ['Comfort food']],
        ['cold-noodles', 'Sesame noodle box', 'Chilled noodles with sesame dressing and cucumber.', 'Noodles', 750, 3, 1, 'noodles', ['Quick pick']],
        ['toast-pocket', 'Crunchy toast pocket', 'A toasted pocket filled with vegetables.', 'Light bites', 600, 3, 1, 'toast', ['Light lunch']],
        ['lemon-water', 'Sparkling lemon', 'A bright, citrusy refreshment.', 'Drinks', 300, 1, 1, 'drink', ['Refreshing']],
    ];
    const start = Math.ceil((now + 10 * 60000) / 300000) * 300000;
    return {
        schemaVersion: 1, revision: 0,
        vendor: { id, name: bowl ? 'Bowl Lab' : 'Noodle & Co.', description: bowl ? 'Good bowls. Better breaks.' : 'A little comfort between classes.', location: bowl ? 'Food court · Counter A' : 'Food court · Counter B', open: true, synthetic: true },
        items: rows.map(([itemId, name, description, category, priceSen, prepMinutes, prepUnits, art, tags]) => ({ id: itemId, vendorId: id, name, description, category, priceSen, prepMinutes, prepUnits, art, tags, stock: 20, enabled: true, allergens: null })),
        slots: Array.from({ length: 36 }, (_, i) => ({ id: `${id}-${start + i * 300000}`, startAt: new Date(start + i * 300000).toISOString(), endAt: new Date(start + i * 300000 + 180000).toISOString(), kitchenCapacity: 8, reservedUnits: 0, pickupCapacity: 4, reservedHandovers: 0 })),
        orders: [], incidents: [], proposals: [], audit: [], requests: {},
    };
}
