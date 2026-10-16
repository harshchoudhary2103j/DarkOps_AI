const http = require('http');

const BASE_URL = 'http://localhost:3000';

function request(path, options = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const headers = {
      'Content-Type': 'application/json',
      'X-Actor-Id': 'test-runner',
      'X-Actor-Role': 'ADMIN',
      ...(options.headers || {})
    };

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = body ? JSON.parse(body) : null;
            resolve({ status: res.statusCode, data });
          } catch (e) {
            resolve({ status: res.statusCode, body });
          }
        });
      }
    );

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ASSERTION FAILED: ${message}`);
    process.exit(1);
  }
}

async function main() {
  console.log('=== DarkOps AI Phase 03: Order Lifecycle End-to-End Verification ===\n');

  const runId = Date.now();
  const storeId = `store-ord-${runId}`;
  const zoneId = `zone-ord-${runId}`;
  const prodId = `prod-ord-${runId}`;
  const sku1Id = `sku-ord-1-${runId}`;
  const sku2Id = `sku-ord-2-${runId}`;

  // Polygon around Manhattan/NYC: [0,0] to [10,10]
  const serviceArea = {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
        [0, 0]
      ]
    ]
  };

  // ---------------------------------------------------------------------------
  // Step 1: Seed Catalog & Warehouse Layout
  // ---------------------------------------------------------------------------
  console.log('--- Step 1: Seeding Catalog Store, Zone, SKUs, and Warehouse Layout ---');

  const storeRes = await request('/api/v1/stores', {
    method: 'POST',
    body: {
      id: storeId,
      name: `DarkStore Manhattan ${runId}`,
      status: 'ACTIVE',
      latitude: 5.0,
      longitude: 5.0,
      service_area: serviceArea
    }
  });
  assert(storeRes.status === 201, `Failed to create store: ${JSON.stringify(storeRes)}`);

  const zoneRes = await request('/api/v1/service-zones', {
    method: 'POST',
    body: {
      id: zoneId,
      store_id: storeId,
      name: `Service Zone North ${runId}`,
      boundary: serviceArea,
      status: 'ACTIVE'
    }
  });
  assert(zoneRes.status === 201, `Failed to create service zone: ${JSON.stringify(zoneRes)}`);

  const prodRes = await request('/api/v1/products', {
    method: 'POST',
    body: {
      id: prodId,
      name: 'Organic Energy Snack',
      category: 'Snacks',
      status: 'ACTIVE'
    }
  });
  assert(prodRes.status === 201, `Failed to create product`);

  for (const sId of [sku1Id, sku2Id]) {
    const skuRes = await request('/api/v1/skus', {
      method: 'POST',
      body: {
        id: sId,
        product_id: prodId,
        sku_code: `SKU-${sId}`,
        pack_size: 1,
        shelf_life_days: 90,
        storage_temp: { min: 15, max: 25 },
        unit_price: 4.99,
        currency: 'USD',
        status: 'ACTIVE'
      }
    });
    assert(skuRes.status === 201, `Failed to create SKU ${sId}`);
  }

  // Active warehouse layout with shelf nodes
  const layoutRes = await request('/api/v1/warehouse-layouts', {
    method: 'POST',
    body: {
      id: `layout-${runId}`,
      store_id: storeId,
      name: `Primary Grid Layout ${runId}`,
      version: 1,
      status: 'ACTIVE',
      nodes: [
        { id: 'node-dispatch-1', type: 'DISPATCH_STATION', x: 0, y: 0, z: 0 },
        { id: 'node-shelf-A1', type: 'SHELF', shelf_id: 'SHELF-A1-L2', aisle_id: 'AISLE-A', x: 2, y: 5, z: 1 },
        { id: 'node-shelf-B1', type: 'SHELF', shelf_id: 'SHELF-B1-L1', aisle_id: 'AISLE-B', x: 4, y: 5, z: 1 }
      ],
      edges: [
        { from_node: 'node-dispatch-1', to_node: 'node-shelf-A1', distance: 5.4, bidirectional: true },
        { from_node: 'node-shelf-A1', to_node: 'node-shelf-B1', distance: 2.0, bidirectional: true }
      ]
    }
  });
  assert(layoutRes.status === 201, `Failed to create layout: ${JSON.stringify(layoutRes)}`);
  console.log('✔ Catalog & Warehouse layout seeded successfully.');

  // ---------------------------------------------------------------------------
  // Step 2: Seed Inventory Stock
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 2: Seeding Inventory (SKU1: 20 units, SKU2: 15 units) ---');

  for (const [sId, qty] of [[sku1Id, 20], [sku2Id, 15]]) {
    const initRes = await request('/api/v1/inventory/initialize', {
      method: 'POST',
      headers: { 'Idempotency-Key': `init-${sId}` },
      body: {
        store_id: storeId,
        sku_id: sId,
        initial_physical_on_hand: qty
      }
    });
    assert(initRes.status === 201, `Failed to initialize stock for ${sId}`);
  }
  console.log('✔ Inventory initialized.');

  // ---------------------------------------------------------------------------
  // Test Scenario 1: Full Happy Path Order Lifecycle
  // CREATED -> ALLOCATED -> PICKING -> PICKED -> READY
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Full Happy-Path Order Lifecycle ---');

  const createOrderRes = await request('/api/v1/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': `create-order-1-${runId}` },
    body: {
      customer_id: 'cust-vip-1',
      customer_latitude: 5.5, // Inside polygon
      customer_longitude: 5.5,
      delivery_zone_id: zoneId,
      lines: [
        { sku_id: sku1Id, quantity: 4 },
        { sku_id: sku2Id, quantity: 2 }
      ]
    }
  });
  assert(createOrderRes.status === 201, `Failed to create order: ${JSON.stringify(createOrderRes)}`);
  const order1 = createOrderRes.data.data;
  assert(order1.status === 'CREATED', `Expected order status CREATED, got ${order1.status}`);
  assert(order1.lines.length === 2, `Expected 2 lines`);
  console.log(`✔ Order 1 created: id=${order1.id}, status=${order1.status}`);

  // Test Idempotency on Order Creation
  const replayCreateRes = await request('/api/v1/orders', {
    method: 'POST',
    headers: { 'Idempotency-Key': `create-order-1-${runId}` },
    body: {
      customer_id: 'cust-vip-1',
      customer_latitude: 5.5,
      customer_longitude: 5.5,
      delivery_zone_id: zoneId,
      lines: [
        { sku_id: sku1Id, quantity: 4 },
        { sku_id: sku2Id, quantity: 2 }
      ]
    }
  });
  assert(replayCreateRes.status === 201, `Expected replay status 201`);
  assert(replayCreateRes.data.data.id === order1.id, `Idempotent replay returned different order ID`);
  console.log('✔ Idempotent order creation replay verified.');

  // Allocate Order
  const allocateRes = await request(`/api/v1/orders/${order1.id}/allocate`, {
    method: 'POST',
    headers: { 'Idempotency-Key': `alloc-order-1-${runId}` }
  });
  assert(allocateRes.status === 200, `Allocation failed: ${JSON.stringify(allocateRes)}`);
  const allocatedOrder = allocateRes.data.data;
  assert(allocatedOrder.status === 'ALLOCATED', `Expected status ALLOCATED, got ${allocatedOrder.status}`);
  assert(allocatedOrder.store_id === storeId, `Expected allocated store ${storeId}, got ${allocatedOrder.store_id}`);
  console.log(`✔ Order 1 allocated to store=${allocatedOrder.store_id}`);

  // Verify stock was reserved in Inventory Core
  const pos1AfterAllocRes = await request(`/api/v1/inventory/${storeId}/${sku1Id}`);
  const pos1AfterAlloc = pos1AfterAllocRes.data.data;
  assert(pos1AfterAlloc.physical_on_hand === 20, `Physical stock altered prematurely: ${JSON.stringify(pos1AfterAlloc)}`);
  assert(pos1AfterAlloc.reserved_stock === 4, `Reserved stock expected 4, got ${pos1AfterAlloc.reserved_stock}`);
  assert(pos1AfterAlloc.available_stock === 16, `Available stock expected 16, got ${pos1AfterAlloc.available_stock}`);
  console.log('✔ Inventory reservation verified: physical=20, reserved=4, available=16');

  // Verify Picking Task was auto-generated
  const tasksRes = await request(`/api/v1/picking/tasks?store_id=${storeId}`);
  assert(tasksRes.status === 200, `Failed to list tasks`);
  const task = tasksRes.data.data.find((t) => t.order_id === order1.id);
  assert(task, `Picking task for order 1 not found`);
  assert(task.status === 'PENDING', `Picking task status expected PENDING, got ${task.status}`);

  const taskDetail = await request(`/api/v1/picking/tasks/${task.id}`);
  assert(taskDetail.data.data.items.length === 2, `Expected 2 pick items`);
  const item1 = taskDetail.data.data.items.find((i) => i.sku_id === sku1Id);
  const item2 = taskDetail.data.data.items.find((i) => i.sku_id === sku2Id);
  assert(item1.shelf_location !== null, `Shelf location not mapped from layout`);
  console.log(`✔ Picking task ${task.id} created with items on shelves: ${item1.shelf_location}, ${item2.shelf_location}`);

  // Start Picking Task
  const startTaskRes = await request(`/api/v1/picking/tasks/${task.id}/start`, {
    method: 'POST',
    body: { picker_id: 'picker-alice' }
  });
  assert(startTaskRes.status === 200, `Failed to start task: ${JSON.stringify(startTaskRes)}`);
  assert(startTaskRes.data.data.status === 'IN_PROGRESS', `Task status expected IN_PROGRESS`);

  // Verify Order status transitioned to PICKING
  const orderInPicking = await request(`/api/v1/orders/${order1.id}`);
  assert(orderInPicking.data.data.status === 'PICKING', `Order status expected PICKING, got ${orderInPicking.data.data.status}`);
  console.log('✔ Picking task started and order transitioned to PICKING.');

  // Confirm Pick Item 1 (4 units)
  const confirm1Res = await request(`/api/v1/picking/tasks/${task.id}/items/${item1.id}/confirm`, {
    method: 'POST',
    body: { picked_quantity: 4 }
  });
  assert(confirm1Res.status === 200, `Confirm item 1 failed: ${JSON.stringify(confirm1Res)}`);
  assert(confirm1Res.data.data.item.status === 'PICKED', `Expected item 1 status PICKED`);

  // Confirm Pick Item 2 (2 units) -> Should auto-complete task and transition order to READY
  const confirm2Res = await request(`/api/v1/picking/tasks/${task.id}/items/${item2.id}/confirm`, {
    method: 'POST',
    body: { picked_quantity: 2 }
  });
  assert(confirm2Res.status === 200, `Confirm item 2 failed: ${JSON.stringify(confirm2Res)}`);
  assert(confirm2Res.data.data.task.status === 'COMPLETED', `Task expected COMPLETED, got ${confirm2Res.data.data.task.status}`);
  assert(confirm2Res.data.data.order.status === 'READY', `Order expected READY, got ${confirm2Res.data.data.order.status}`);
  console.log('✔ All items picked: Picking task COMPLETED, Order transitioned to READY.');

  // Verify Inventory Consumption: physical on hand decremented, reserved stock decremented
  const pos1Final = (await request(`/api/v1/inventory/${storeId}/${sku1Id}`)).data.data;
  assert(pos1Final.physical_on_hand === 16, `Physical on hand expected 16, got ${pos1Final.physical_on_hand}`);
  assert(pos1Final.reserved_stock === 0, `Reserved stock expected 0, got ${pos1Final.reserved_stock}`);
  assert(pos1Final.available_stock === 16, `Available stock expected 16, got ${pos1Final.available_stock}`);

  const pos2Final = (await request(`/api/v1/inventory/${storeId}/${sku2Id}`)).data.data;
  assert(pos2Final.physical_on_hand === 13, `Physical on hand expected 13, got ${pos2Final.physical_on_hand}`);
  assert(pos2Final.reserved_stock === 0, `Reserved stock expected 0, got ${pos2Final.reserved_stock}`);
  console.log('✔ Physical stock consumed atomically in Inventory Core (SKU1: 16 physical, SKU2: 13 physical, 0 reserved).');

  // ---------------------------------------------------------------------------
  // Test Scenario 2: Cancellation & Reservation Rollback
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Cancellation & Reservation Rollback ---');

  const createOrder2Res = await request('/api/v1/orders', {
    method: 'POST',
    body: {
      customer_id: 'cust-cancel-test',
      customer_latitude: 5.0,
      customer_longitude: 5.0,
      delivery_zone_id: zoneId,
      lines: [{ sku_id: sku1Id, quantity: 5 }]
    }
  });
  const order2 = createOrder2Res.data.data;

  // Allocate Order 2 (reserves 5 units of SKU 1: available goes 16 -> 11)
  await request(`/api/v1/orders/${order2.id}/allocate`, { method: 'POST' });

  const posBeforeCancel = (await request(`/api/v1/inventory/${storeId}/${sku1Id}`)).data.data;
  assert(posBeforeCancel.reserved_stock === 5, `Expected 5 reserved, got ${posBeforeCancel.reserved_stock}`);
  assert(posBeforeCancel.available_stock === 11, `Expected 11 available, got ${posBeforeCancel.available_stock}`);
  console.log('✔ Order 2 allocated: 5 units reserved (available: 11).');

  // Cancel Order 2
  const cancelRes = await request(`/api/v1/orders/${order2.id}/cancel`, {
    method: 'POST',
    body: { reason: 'Customer changed mind' }
  });
  assert(cancelRes.status === 200, `Cancel failed: ${JSON.stringify(cancelRes)}`);
  assert(cancelRes.data.data.status === 'CANCELLED', `Status expected CANCELLED, got ${cancelRes.data.data.status}`);

  // Verify Inventory rollback
  const posAfterCancel = (await request(`/api/v1/inventory/${storeId}/${sku1Id}`)).data.data;
  assert(posAfterCancel.reserved_stock === 0, `Reserved stock expected 0, got ${posAfterCancel.reserved_stock}`);
  assert(posAfterCancel.available_stock === 16, `Available stock restored to 16, got ${posAfterCancel.available_stock}`);
  console.log('✔ Reserved stock released completely: reserved=0, available=16.');

  // Verify picking task was also marked FAILED
  const taskOrder2 = await request(`/api/v1/picking/tasks?store_id=${storeId}`);
  const task2 = taskOrder2.data.data.find((t) => t.order_id === order2.id);
  assert(task2 && task2.status === 'FAILED', `Picking task expected FAILED upon cancellation`);
  console.log('✔ Associated picking task cancelled and marked FAILED.');

  // ---------------------------------------------------------------------------
  // Test Scenario 3: Missing/Damaged Item Exception & Partial Release
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Missing/Damaged Item Exception Handling ---');

  const createOrder3Res = await request('/api/v1/orders', {
    method: 'POST',
    body: {
      customer_id: 'cust-exception-test',
      customer_latitude: 5.0,
      customer_longitude: 5.0,
      delivery_zone_id: zoneId,
      lines: [{ sku_id: sku2Id, quantity: 4 }] // 4 units reserved (available 13 -> 9)
    }
  });
  const order3 = createOrder3Res.data.data;
  await request(`/api/v1/orders/${order3.id}/allocate`, { method: 'POST' });

  const task3Res = await request(`/api/v1/picking/tasks?store_id=${storeId}`);
  const task3 = task3Res.data.data.find((t) => t.order_id === order3.id);
  await request(`/api/v1/picking/tasks/${task3.id}/start`, { method: 'POST' });

  const task3Detail = await request(`/api/v1/picking/tasks/${task3.id}`);
  const task3Item = task3Detail.data.data.items[0];

  // Pick 3 units
  await request(`/api/v1/picking/tasks/${task3.id}/items/${task3Item.id}/confirm`, {
    method: 'POST',
    body: { picked_quantity: 3 }
  });

  // Report 1 unit MISSING -> Should release 1 reserved unit and auto-complete
  const exceptionRes = await request(`/api/v1/picking/tasks/${task3.id}/items/${task3Item.id}/report-exception`, {
    method: 'POST',
    body: {
      exception_type: 'MISSING',
      quantity: 1,
      reason: 'Empty bin on shelf'
    }
  });
  assert(exceptionRes.status === 200, `Exception reporting failed: ${JSON.stringify(exceptionRes)}`);
  assert(exceptionRes.data.data.task.status === 'COMPLETED', `Task expected COMPLETED`);
  assert(exceptionRes.data.data.order.status === 'READY', `Order expected READY with partial fulfillment`);

  // Verify Inventory: 3 units consumed, 1 unit released
  // Initial SKU2 was 13. 3 consumed -> physical = 10. Reserved = 0. Available = 10.
  const pos3Final = (await request(`/api/v1/inventory/${storeId}/${sku2Id}`)).data.data;
  assert(pos3Final.physical_on_hand === 10, `Physical expected 10, got ${pos3Final.physical_on_hand}`);
  assert(pos3Final.reserved_stock === 0, `Reserved expected 0, got ${pos3Final.reserved_stock}`);
  assert(pos3Final.available_stock === 10, `Available expected 10, got ${pos3Final.available_stock}`);
  console.log('✔ Exception handling verified: 3 units consumed, 1 unfulfilled unit released back to available.');

  // ---------------------------------------------------------------------------
  // Test Scenario 4: Concurrency Race Between Competing Orders
  // Available units = 10. Two simultaneous orders request 8 units each!
  // Only ONE order can be allocated, the other must fail with INSUFFICIENT_STOCK / ORDER_ALLOCATION_FAILED
  // ---------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Concurrency Race (2 competing orders for remaining 10 units) ---');

  const [compOrderARes, compOrderBRes] = await Promise.all([
    request('/api/v1/orders', {
      method: 'POST',
      body: {
        customer_id: 'comp-A',
        customer_latitude: 5.0,
        customer_longitude: 5.0,
        delivery_zone_id: zoneId,
        lines: [{ sku_id: sku2Id, quantity: 8 }]
      }
    }),
    request('/api/v1/orders', {
      method: 'POST',
      body: {
        customer_id: 'comp-B',
        customer_latitude: 5.0,
        customer_longitude: 5.0,
        delivery_zone_id: zoneId,
        lines: [{ sku_id: sku2Id, quantity: 8 }]
      }
    })
  ]);

  const orderA = compOrderARes.data.data;
  const orderB = compOrderBRes.data.data;

  // Dispatch both allocation requests simultaneously
  const [allocARes, allocBRes] = await Promise.all([
    request(`/api/v1/orders/${orderA.id}/allocate`, { method: 'POST' }),
    request(`/api/v1/orders/${orderB.id}/allocate`, { method: 'POST' })
  ]);

  const aSuccess = allocARes.status === 200;
  const bSuccess = allocBRes.status === 200;

  assert(
    (aSuccess && !bSuccess) || (!aSuccess && bSuccess),
    `Race condition failure: Exactly one order must succeed. A status: ${allocARes.status}, B status: ${allocBRes.status}`
  );

  const winningOrderId = aSuccess ? orderA.id : orderB.id;
  const losingOrderId = aSuccess ? orderB.id : orderA.id;
  const losingRes = aSuccess ? allocBRes : allocARes;

  assert(
    losingRes.status === 422 || losingRes.status === 409,
    `Losing order expected 422/409, got ${losingRes.status}`
  );

  const losingOrderDetails = await request(`/api/v1/orders/${losingOrderId}`);
  assert(losingOrderDetails.data.data.status === 'FAILED', `Losing order status expected FAILED`);

  const posAfterRace = (await request(`/api/v1/inventory/${storeId}/${sku2Id}`)).data.data;
  assert(posAfterRace.reserved_stock === 8, `Reserved stock expected 8, got ${posAfterRace.reserved_stock}`);
  assert(posAfterRace.available_stock === 2, `Available stock expected 2, got ${posAfterRace.available_stock}`);

  console.log(`✔ Concurrency race verified: Order ${winningOrderId.substring(0, 8)} WON, Order ${losingOrderId.substring(0, 8)} FAILED.`);
  console.log('✔ Zero oversell: physical=10, reserved=8, available=2.');

  // ---------------------------------------------------------------------------
  // Step 5: Full Ledger Reconciliation
  // ---------------------------------------------------------------------------
  console.log('\n--- Step 5: Double-Entry Ledger Reconciliation ---');
  for (const sId of [sku1Id, sku2Id]) {
    const reconRes = await request(`/api/v1/inventory/reconcile/${storeId}/${sId}`);
    assert(reconRes.status === 200, `Reconciliation request failed`);
    const report = reconRes.data.data;
    assert(report.is_balanced === true, `Ledger imbalance detected for ${sId}: ${JSON.stringify(report)}`);
    assert(report.physical_discrepancy === 0, `Physical discrepancy != 0`);
    assert(report.reserved_discrepancy === 0, `Reserved discrepancy != 0`);
    console.log(`✔ Reconciliation for SKU ${sId}: is_balanced=true, 0 discrepancies, movements=${report.movement_count}`);
  }

  console.log('\n===============================================================');
  console.log('🎉 ALL PHASE 03 ORDER LIFECYCLE ACCEPTANCE CRITERIA PASSED!');
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('Unhandled error during test execution:', err);
  process.exit(1);
});
