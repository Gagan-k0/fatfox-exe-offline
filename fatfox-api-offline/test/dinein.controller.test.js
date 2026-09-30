'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-dinein-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const DineInSession = require('../models/dinein_session.model');
const Table = require('../models/table.model');
const Order = require('../models/order.model');
const OrderMenu = require('../models/order_menu.model');
const dineinController = require('../controllers/dinein.controller');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test.before(async () => {
  await DineInSession.deleteMany({});
  await Table.deleteMany({});
  await Order.deleteMany({});
  await OrderMenu.deleteMany({});
});

test.after(async () => {
  await DineInSession.deleteMany({});
  await Table.deleteMany({});
  await Order.deleteMany({});
  await OrderMenu.deleteMany({});
});

test('dinein CRUD happy path', async () => {
  const restaurant_id = 'r1';

  // First create a table for testing
  const table = await Table.create({
    restaurant_id,
    table_number: 'T1',
    status: 1,
    area_id: 'area1', // We'll assume this exists or ignore area validation for now
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Create dinein session
  let sessionId;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        table_id: table._id,
        status: 1,
        startedAt: new Date().toISOString(),
        notes: 'Test dine-in session'
      }
    };

    const res = mockRes();
    await dineinController.create(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data && res.body.data._id);
    sessionId = res.body.data._id;
  }

  // List (paginate)
  {
    const listReq = {
      auth: { restaurant_id },
      query: { page: '1', searchName: 'Test' }
    };
    const res = mockRes();
    await dineinController.list(listReq, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    assert.equal(res.body.data.docs[0].notes, 'Test dine-in session');
  }

  // ListAll
  {
    const listAllReq = {
      auth: { restaurant_id }
    };
    const res = mockRes();
    await dineinController.listAll(listAllReq, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].notes, 'Test dine-in session');
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: sessionId } };
    const res = mockRes();
    await dineinController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, sessionId);
    assert.equal(res.body.data.table_id, table._id.toString());
    assert.equal(res.body.data.status, 1);
    assert.equal(res.body.data.notes, 'Test dine-in session');
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: sessionId },
      body: {
        table_id: table._id,
        status: 0,
        notes: 'Updated session'
      }
    };

    const res = mockRes();
    await dineinController.update(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.status, 0);
    assert.equal(res.body.data.notes, 'Updated session');
  }

  // View after update to check changes
  {
    const req = { auth: { restaurant_id }, params: { id: sessionId } };
    const res = mockRes();
    await dineinController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.status, 0);
    assert.equal(res.body.data.notes, 'Updated session');
  }

  // GetAll
  {
    const req = {
      auth: { restaurant_id }
    };
    const res = mockRes();
    await dineinController.getAll(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].notes, 'Updated session');
  }

  // Create order for session
  {
    const req = {
      auth: { restaurant_id },
      params: { sessionId: sessionId },
      body: {
        order_number: 'ORD001',
        amount: 25.50,
        payment_mode: 'CASH',
        notes: 'Test order',
        items: [
          {
            menuItem_id: 'mi1',
            quantity: 2,
            price: 10.00,
            addon_ids: ['a1', 'a2'],
            variant_ids: ['v1'],
            notes: 'Extra cheese'
          },
          {
            menuItem_id: 'mi2',
            quantity: 1,
            price: 5.50,
            addon_ids: [],
            variant_ids: ['v2', 'v3'],
            notes: ''
          }
        ]
      }
    };

    const res = mockRes();
    await dineinController.createOrder(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data && res.body.data._id);
  }

  // Get orders for session
  {
    const req = {
      auth: { restaurant_id },
      params: { sessionId: sessionId }
    };
    const res = mockRes();
    await dineinController.getOrdersForSession(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].order_number, 'ORD001');
    assert.equal(res.body.data[0].amount, 25.50);
  }

  // Close session (should succeed now that we have an order, but let's test with no active orders first)
  // First, let's cancel the order to make it inactive
  const order = await Order.findOne({ restaurant_id, order_number: 'ORD001' });
  if (order) {
    await Order.updateOne({ restaurant_id, _id: order._id }, { $set: { status: 0 } }); // Cancel order
  }

  // Now close session
  {
    const req = {
      auth: { restaurant_id },
      params: { sessionId: sessionId }
    };
    const res = mockRes();
    await dineinController.closeSession(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.status, 0); // Should be closed
    assert.ok(res.body.data.endedAt); // Should have endedAt set
  }
});

test('dinein validation errors', async () => {
  const restaurant_id = 'r1';

  // Missing table_id
  {
    const req = {
      auth: { restaurant_id },
      body: {
        status: 1
      }
    };
    const res = mockRes();
    await dineinController.create(req, res);

    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
    assert.deepEqual(res.body.data, [
      { msg: 'table_id is required' }
    ]);
  }
});

test('dinein session conflict', async () => {
  const restaurant_id = 'r1';

  // Create two tables
  const table1 = await Table.create({
    restaurant_id,
    table_number: 'T1',
    status: 1,
    area_id: 'area1',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const table2 = await Table.create({
    restaurant_id,
    table_number: 'T2',
    status: 1,
    area_id: 'area1',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Create first session
  {
    const req = {
      auth: { restaurant_id },
      body: {
        table_id: table1._id,
        status: 1,
        notes: 'First session'
      }
    };
    const res = mockRes();
    await dineinController.create(req, res);
    assert.equal(res.body.status.code, 200);
  }

  // Try to create second session on same table - should fail
  {
    const req = {
      auth: { restaurant_id },
      body: {
        table_id: table1._id,
        status: 1,
        notes: 'Second session on same table'
      }
    };
    const res = mockRes();
    await dineinController.create(req, res);

    assert.equal(res.body.status.code, 409);
    assert.equal(res.body.status.message, 'Table already has an active session');
  }

  // Create session on second table - should succeed
  {
    const req = {
      auth: { restaurant_id },
      body: {
        table_id: table2._id,
        status: 1,
        notes: 'Session on second table'
      }
    };
    const res = mockRes();
    await dineinController.create(req, res);
    assert.equal(res.body.status.code, 200);
  }
});

test('dinein close session with active orders fails', async () => {
  const restaurant_id = 'r1';

  // Create table and session
  const table = await Table.create({
    restaurant_id,
    table_number: 'T1',
    status: 1,
    area_id: 'area1',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const session = await DineInSession.create({
    restaurant_id,
    table_id: table._id,
    status: 1,
    notes: 'Test session',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Create an active order
  const order = await Order.create({
    restaurant_id,
    order_number: 'ORD001',
    amount: 10.00,
    payment_mode: 'CASH',
    dinein_session_id: session._id,
    itemIn: 'dinein',
    status: 1, // Active order
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Try to close session with active order - should fail
  {
    const req = {
      auth: { restaurant_id },
      params: { sessionId: session._id }
    };
    const res = mockRes();
    await dineinController.closeSession(req, res);

    assert.equal(res.body.status.code, 409);
    assert.equal(res.body.status.message, 'Cannot close session with active orders');
  }
});