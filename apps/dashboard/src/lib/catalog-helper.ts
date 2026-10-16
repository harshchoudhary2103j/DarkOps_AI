/**
 * Deterministic helper to format clean, realistic grocery catalog names and prices.
 * Prevents raw synthetic IDs (e.g. 'sku-ord-2-1792148625903', 'ORD 12998') from leaking into the UI.
 */

const REAL_GROCERY_CATALOG = [
  { name: 'Farm Fresh Whole Milk 1L', price: 4.29, category: 'Dairy', defaultShelf: '01L-01' },
  { name: 'Grade A Large Brown Eggs (12pk)', price: 5.49, category: 'Dairy', defaultShelf: '01L-02' },
  { name: 'Organic Hass Avocados (3-Pack)', price: 4.99, category: 'Produce', defaultShelf: '01L-03' },
  { name: 'Organic Fair-Trade Bananas 1kg', price: 2.49, category: 'Produce', defaultShelf: '01L-04' },
  { name: 'Artisan Sourdough Country Loaf', price: 4.89, category: 'Bakery', defaultShelf: '01R-01' },
  { name: 'Dark Roast Arabica Coffee Beans 250g', price: 12.99, category: 'Pantry', defaultShelf: '01R-02' },
  { name: 'Greek Whole Milk Yogurt 500g', price: 3.99, category: 'Dairy', defaultShelf: '01R-03' },
  { name: 'Crisp Honeycrisp Apples 1kg', price: 5.49, category: 'Produce', defaultShelf: '01R-04' },
  { name: 'Kerrygold Pure Irish Salted Butter 250g', price: 4.79, category: 'Dairy', defaultShelf: '02L-01' },
  { name: 'Organic Baby Spinach Leaves 200g', price: 3.49, category: 'Produce', defaultShelf: '02L-02' },
  { name: 'Vine-Ripened Roma Tomatoes 500g', price: 3.29, category: 'Produce', defaultShelf: '02L-03' },
  { name: 'Cold Brew Arabica Coffee 330ml', price: 3.89, category: 'Beverages', defaultShelf: '02L-04' },
  { name: 'San Pellegrino Sparkling Water 6pk', price: 6.99, category: 'Beverages', defaultShelf: '02R-01' },
  { name: 'Belgian Dark Chocolate 72% 100g', price: 3.99, category: 'Snacks', defaultShelf: '02R-02' },
  { name: 'Sea Salt Kettle Cooked Potato Chips 150g', price: 3.79, category: 'Snacks', defaultShelf: '02R-03' },
  { name: 'Roasted & Salted California Almonds 200g', price: 6.49, category: 'Snacks', defaultShelf: '02R-04' },
  { name: 'Pure Organic Orange Juice 1L', price: 5.29, category: 'Beverages', defaultShelf: '03L-01' },
  { name: 'Barilla Penne Rigate Pasta 500g', price: 2.19, category: 'Pantry', defaultShelf: '03L-02' },
  { name: 'Extra Virgin Olive Oil 500ml', price: 11.99, category: 'Pantry', defaultShelf: '03L-03' },
  { name: 'Organic Rolled Oats 1kg', price: 4.59, category: 'Breakfast', defaultShelf: '03L-04' },
];

/**
 * Returns a clean, realistic grocery product name from a SKU or raw name.
 */
export function getRealisticProductName(skuOrRawId?: string, rawName?: string): string {
  // If a clean realistic name already exists and doesn't look like an internal test identifier
  if (rawName && !rawName.startsWith('sku-') && !rawName.startsWith('prod-') && !/^Ord\s*\d+/i.test(rawName) && rawName !== 'Item' && rawName !== 'Standard SKU' && rawName !== 'Standard Item') {
    // Strip synthetic batch suffixes like ' (Batch 3)'
    return rawName.replace(/\s*\(Batch\s*\d+\)/i, '').trim();
  }

  const str = (skuOrRawId || rawName || '').toLowerCase();

  if (str.includes('milk')) return 'Farm Fresh Whole Milk 1L';
  if (str.includes('egg')) return 'Grade A Large Brown Eggs (12pk)';
  if (str.includes('banana')) return 'Organic Fair-Trade Bananas 1kg';
  if (str.includes('avocado')) return 'Organic Hass Avocados (3-Pack)';
  if (str.includes('bread') || str.includes('sourdough')) return 'Artisan Sourdough Country Loaf';
  if (str.includes('coffee')) return 'Dark Roast Arabica Coffee Beans 250g';
  if (str.includes('yogurt')) return 'Greek Whole Milk Yogurt 500g';
  if (str.includes('apple')) return 'Crisp Honeycrisp Apples 1kg';
  if (str.includes('butter')) return 'Kerrygold Pure Irish Salted Butter 250g';
  if (str.includes('spinach')) return 'Organic Baby Spinach Leaves 200g';
  if (str.includes('tomato')) return 'Vine-Ripened Roma Tomatoes 500g';
  if (str.includes('chocolate')) return 'Belgian Dark Chocolate 72% 100g';
  if (str.includes('chips')) return 'Sea Salt Kettle Cooked Potato Chips 150g';
  if (str.includes('almond')) return 'Roasted & Salted California Almonds 200g';
  if (str.includes('orange') || str.includes('juice')) return 'Pure Organic Orange Juice 1L';

  // Deterministic hash lookup for test IDs (sku-ord-1-..., sku-concur-..., etc.)
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  const idx = hash % REAL_GROCERY_CATALOG.length;
  return REAL_GROCERY_CATALOG[idx].name;
}

/**
 * Returns a realistic grocery unit price.
 */
export function getRealisticUnitPrice(skuOrRawId?: string, rawPrice?: number): number {
  if (typeof rawPrice === 'number' && rawPrice > 0.1) {
    return rawPrice;
  }
  const name = getRealisticProductName(skuOrRawId);
  const found = REAL_GROCERY_CATALOG.find((item) => item.name === name);
  return found ? found.price : 4.49;
}

/**
 * Resolves a default shelf location for a product if the picking item hasn't been assigned one.
 */
export function getDefaultShelfForProduct(productName: string, fallbackIdx = 0): string {
  const found = REAL_GROCERY_CATALOG.find((item) => item.name === productName);
  if (found) return found.defaultShelf;
  return REAL_GROCERY_CATALOG[fallbackIdx % REAL_GROCERY_CATALOG.length].defaultShelf;
}
