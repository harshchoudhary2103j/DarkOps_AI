const { Pool } = require('pg');

async function seedViaApi(apiUrl) {
  const base = apiUrl.replace(/\/+$/, '');
  console.log(`Seeding realistic orders via Operational API at ${base}...`);

  const order1Payload = {
    customer_id: 'cust-sarah-m',
    customer_latitude: 40.7580,
    customer_longitude: -73.9855,
    lines: [
      { sku_id: 'sku-manhattan-demo-006', quantity: 2 },
      { sku_id: 'sku-manhattan-demo-013', quantity: 2 },
      { sku_id: 'sku-manhattan-demo-001', quantity: 1 }
    ]
  };

  const order2Payload = {
    customer_id: 'cust-david-k',
    customer_latitude: 40.7610,
    customer_longitude: -73.9790,
    lines: [
      { sku_id: 'sku-manhattan-demo-001', quantity: 2 },
      { sku_id: 'sku-manhattan-demo-003', quantity: 1 },
      { sku_id: 'sku-manhattan-demo-004', quantity: 3 }
    ]
  };

  for (const payload of [order1Payload, order2Payload]) {
    try {
      const res = await fetch(`${base}/api/v1/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'seed-script' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const json = await res.json();
        console.log(`Created order ${json.data.id} via API.`);
        const allocRes = await fetch(`${base}/api/v1/orders/${json.data.id}/allocate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Actor-Id': 'seed-script' }
        });
        if (allocRes.ok) {
          console.log(`Allocated order ${json.data.id}.`);
        }
      } else {
        console.warn(`Order creation returned ${res.status}: ${await res.text()}`);
      }
    } catch (e) {
      console.warn(`Failed to seed order via API: ${e.message}`);
    }
  }
}

async function main() {
  if (process.env.API_URL) {
    await seedViaApi(process.env.API_URL);
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://darkops_user:darkops_password@localhost:5432/darkops_db'
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const storeId = 'store-manhattan-demo-02';

    // Order 1: Multi-item Grocery Basket (6 products)
    const order1Id = 'ord-manhattan-8921';
    await client.query(`
      INSERT INTO orders (id, customer_id, customer_latitude, customer_longitude, store_id, status, line_count, total_requested_units, created_at, allocated_at, updated_at)
      VALUES ($1, 'cust-sarah-m', 40.7580, -73.9855, $2, 'ALLOCATED', 6, 9, NOW() - INTERVAL '12 minutes', NOW() - INTERVAL '8 minutes', NOW())
      ON CONFLICT (id) DO UPDATE SET status = 'ALLOCATED', updated_at = NOW();
    `, [order1Id, storeId]);

    const order1Lines = [
      { id: 'line-8921-1', sku: 'sku-manhattan-demo-006', shelf: 'SHELF-01L-01', qty: 2 }, // Whole Milk 1L
      { id: 'line-8921-2', sku: 'sku-manhattan-demo-013', shelf: 'SHELF-01L-03', qty: 2 }, // Honeycrisp Apples 1kg
      { id: 'line-8921-3', sku: 'sku-manhattan-demo-001', shelf: 'SHELF-01R-02', qty: 1 }, // Organic Bananas 1kg
      { id: 'line-8921-4', sku: 'sku-manhattan-demo-005', shelf: 'SHELF-02L-01', qty: 1 }, // Roma Tomatoes 500g
      { id: 'line-8921-5', sku: 'sku-manhattan-demo-007', shelf: 'SHELF-02R-03', qty: 2 }, // Cold Brew Coffee 330ml
      { id: 'line-8921-6', sku: 'sku-manhattan-demo-008', shelf: 'SHELF-03L-02', qty: 1 }, // Dark Chocolate 100g
    ];

    for (const l of order1Lines) {
      await client.query(`
        INSERT INTO order_lines (id, order_id, sku_id, requested_quantity, reserved_quantity, picked_quantity, missing_quantity, damaged_quantity, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $4, 0, 0, 0, 'PENDING', NOW() - INTERVAL '12 minutes', NOW())
        ON CONFLICT (id) DO UPDATE SET requested_quantity = $4, reserved_quantity = $4;
      `, [l.id, order1Id, l.sku, l.qty]);
    }

    const task1Id = 'task-pick-8921';
    await client.query(`
      INSERT INTO picking_tasks (id, order_id, store_id, status, assigned_picker_id, version, created_at, started_at, updated_at)
      VALUES ($1, $2, $3, 'PENDING', 'picker-alex', 1, NOW() - INTERVAL '8 minutes', NOW() - INTERVAL '4 minutes', NOW())
      ON CONFLICT (id) DO UPDATE SET status = 'PENDING';
    `, [task1Id, order1Id, storeId]);

    for (let i = 0; i < order1Lines.length; i++) {
      const l = order1Lines[i];
      await client.query(`
        INSERT INTO pick_items (id, picking_task_id, order_line_id, sku_id, shelf_location, requested_quantity, confirmed_picked_quantity, missing_quantity, damaged_quantity, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 'PENDING', NOW() - INTERVAL '8 minutes', NOW())
        ON CONFLICT (id) DO UPDATE SET shelf_location = $5, requested_quantity = $6;
      `, [`item-8921-${i+1}`, task1Id, l.id, l.sku, l.shelf, l.qty]);
    }

    // Order 2: Morning Breakfast Basket (4 products)
    const order2Id = 'ord-manhattan-9403';
    await client.query(`
      INSERT INTO orders (id, customer_id, customer_latitude, customer_longitude, store_id, status, line_count, total_requested_units, created_at, allocated_at, updated_at)
      VALUES ($1, 'cust-david-k', 40.7610, -73.9790, $2, 'PICKING', 4, 8, NOW() - INTERVAL '6 minutes', NOW() - INTERVAL '3 minutes', NOW())
      ON CONFLICT (id) DO UPDATE SET status = 'PICKING', updated_at = NOW();
    `, [order2Id, storeId]);

    const order2Lines = [
      { id: 'line-9403-1', sku: 'sku-manhattan-demo-001', shelf: 'SHELF-01L-02', qty: 2 }, // Organic Bananas 1kg
      { id: 'line-9403-2', sku: 'sku-manhattan-demo-003', shelf: 'SHELF-02L-04', qty: 1 }, // Orange Juice 1L
      { id: 'line-9403-3', sku: 'sku-manhattan-demo-004', shelf: 'SHELF-03L-01', qty: 3 }, // Granola Energy Bar 4pk
      { id: 'line-9403-4', sku: 'sku-manhattan-demo-010', shelf: 'SHELF-03R-03', qty: 2 }, // Organic Oat Milk 1L
    ];

    for (const l of order2Lines) {
      await client.query(`
        INSERT INTO order_lines (id, order_id, sku_id, requested_quantity, reserved_quantity, picked_quantity, missing_quantity, damaged_quantity, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $4, 0, 0, 0, 'PENDING', NOW() - INTERVAL '6 minutes', NOW())
        ON CONFLICT (id) DO UPDATE SET requested_quantity = $4, reserved_quantity = $4;
      `, [l.id, order2Id, l.sku, l.qty]);
    }

    const task2Id = 'task-pick-9403';
    await client.query(`
      INSERT INTO picking_tasks (id, order_id, store_id, status, assigned_picker_id, version, created_at, started_at, updated_at)
      VALUES ($1, $2, $3, 'IN_PROGRESS', 'picker-elena', 2, NOW() - INTERVAL '3 minutes', NOW() - INTERVAL '1 minute', NOW())
      ON CONFLICT (id) DO UPDATE SET status = 'IN_PROGRESS';
    `, [task2Id, order2Id, storeId]);

    for (let i = 0; i < order2Lines.length; i++) {
      const l = order2Lines[i];
      await client.query(`
        INSERT INTO pick_items (id, picking_task_id, order_line_id, sku_id, shelf_location, requested_quantity, confirmed_picked_quantity, missing_quantity, damaged_quantity, status, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, 0, 0, 0, 'PENDING', NOW() - INTERVAL '3 minutes', NOW())
        ON CONFLICT (id) DO UPDATE SET shelf_location = $5, requested_quantity = $6;
      `, [`item-9403-${i+1}`, task2Id, l.id, l.sku, l.shelf, l.qty]);
    }

    await client.query('COMMIT');
    console.log('Successfully seeded realistic dark store grocery orders and picking tasks!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error seeding orders:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
