/**
 * DarkOps AI — Concurrency Acceptance Test (50 vs 10 Race Verification)
 * Issues 50 simultaneous parallel reservation requests against 10 available units
 * over HTTP to verify that row-level locking (SELECT FOR UPDATE) prevents overselling.
 */

async function run() {
  const baseUrl = process.env.API_URL || 'http://localhost:3000';
  const timestamp = Date.now();
  const storeId = `store-concur-${timestamp}`;
  const prodId = `prod-concur-${timestamp}`;
  const skuId = `sku-concur-${timestamp}`;

  console.log('--- Step 1: Seeding Catalog Entities for Concurrency Test ---');
  // 1. Create Store
  const storeRes = await fetch(`${baseUrl}/api/v1/stores`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'admin-tester' },
    body: JSON.stringify({
      id: storeId,
      name: 'High Concurrency Race Test Store',
      status: 'ACTIVE',
      latitude: 40.7128,
      longitude: -74.006,
      service_area: {
        type: 'Polygon',
        coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]
      }
    })
  });
  if (!storeRes.ok) throw new Error(`Store creation failed: ${await storeRes.text()}`);

  // 2. Create Product
  const prodRes = await fetch(`${baseUrl}/api/v1/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'admin-tester' },
    body: JSON.stringify({
      id: prodId,
      name: 'Limited Flash Drop Soda',
      category: 'Beverages',
      status: 'ACTIVE'
    })
  });
  if (!prodRes.ok) throw new Error(`Product creation failed: ${await prodRes.text()}`);

  // 3. Create SKU
  const skuRes = await fetch(`${baseUrl}/api/v1/skus`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'admin-tester' },
    body: JSON.stringify({
      id: skuId,
      product_id: prodId,
      sku_code: `SODA-FLASH-${timestamp}`,
      pack_size: 1,
      shelf_life_days: 90,
      storage_temp: { unit: 'CELSIUS', min: 2, max: 20 },
      unit_price: 3.50,
      currency: 'USD',
      status: 'ACTIVE'
    })
  });
  if (!skuRes.ok) throw new Error(`SKU creation failed: ${await skuRes.text()}`);

  console.log('--- Step 2: Initializing Position with EXACTLY 10 Units ---');
  const initRes = await fetch(`${baseUrl}/api/v1/inventory/initialize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Actor-Id': 'admin-tester',
      'Idempotency-Key': `idem-init-${timestamp}`
    },
    body: JSON.stringify({
      store_id: storeId,
      sku_id: skuId,
      initial_physical_on_hand: 10,
      initial_reserved_stock: 0,
      initial_incoming_units: 0
    })
  });
  if (!initRes.ok) throw new Error(`Inventory init failed: ${await initRes.text()}`);

  const initData = await initRes.json();
  console.log('Initial Position:', initData.data);

  console.log('--- Step 3: Launching 50 Concurrent Reservation Requests ---');
  const totalRequests = 50;
  const startTime = Date.now();

  const promises = [];
  for (let i = 0; i < totalRequests; i++) {
    const p = (async () => {
      const res = await fetch(`${baseUrl}/api/v1/inventory/reserve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Actor-Id': `shopper-${i + 1}`,
          'Idempotency-Key': `idem-concur-race-${timestamp}-${i + 1}`
        },
        body: JSON.stringify({
          store_id: storeId,
          sku_id: skuId,
          quantity: 1,
          external_reference: `ORDER-RACE-${i + 1}`
        })
      });
      const body = await res.json();
      return { status: res.status, body };
    })();
    promises.push(p);
  }

  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  console.log(`Executed 50 concurrent requests in ${duration}ms`);

  const successes = results.filter(r => r.status === 201);
  const failures = results.filter(r => r.status === 409 && r.body?.error?.code === 'INSUFFICIENT_STOCK');
  const otherResponses = results.filter(r => r.status !== 201 && !(r.status === 409 && r.body?.error?.code === 'INSUFFICIENT_STOCK'));

  console.log(`Successes (HTTP 201): ${successes.length}`);
  console.log(`Insufficient Stock Failures (HTTP 409): ${failures.length}`);
  console.log(`Other/Unexpected Responses: ${otherResponses.length}`);

  if (otherResponses.length > 0) {
    console.error('Unexpected responses detected:', otherResponses);
  }

  console.log('--- Step 4: Verifying Final Balances & Invariants ---');
  const posRes = await fetch(`${baseUrl}/api/v1/inventory/${storeId}/${skuId}`);
  const posData = await posRes.json();
  console.log('Final Position:', posData.data);

  console.log('--- Step 5: Verifying Ledger Reconciliation ---');
  const recRes = await fetch(`${baseUrl}/api/v1/inventory/reconcile/${storeId}/${skuId}`);
  const recData = await recRes.json();
  console.log('Reconciliation Report:', recData.data);

  // Assertions
  let passed = true;
  if (successes.length !== 10) {
    console.error(`FAIL: Expected exactly 10 successes, got ${successes.length}`);
    passed = false;
  }
  if (failures.length !== 40) {
    console.error(`FAIL: Expected exactly 40 failures, got ${failures.length}`);
    passed = false;
  }
  if (posData.data.physical_on_hand !== 10) {
    console.error(`FAIL: Expected physical_on_hand = 10, got ${posData.data.physical_on_hand}`);
    passed = false;
  }
  if (posData.data.reserved_stock !== 10) {
    console.error(`FAIL: Expected reserved_stock = 10, got ${posData.data.reserved_stock}`);
    passed = false;
  }
  if (posData.data.available_stock !== 0) {
    console.error(`FAIL: Expected available_stock = 0, got ${posData.data.available_stock}`);
    passed = false;
  }
  if (!recData.data.is_balanced) {
    console.error('FAIL: Reconciliation report is NOT balanced');
    passed = false;
  }
  if (recData.data.physical_discrepancy !== 0 || recData.data.reserved_discrepancy !== 0) {
    console.error('FAIL: Non-zero discrepancies detected');
    passed = false;
  }

  if (passed) {
    console.log('\n=======================================================');
    console.log('SUCCESS: All 50-vs-10 Concurrency Acceptance Criteria PASSED!');
    console.log('=======================================================');
    process.exit(0);
  } else {
    console.error('\nFAILED: Concurrency verification failed.');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
