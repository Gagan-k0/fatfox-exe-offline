'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-kds-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const KitchenItem = require('../models/kitchen_item.model');
const Order = require('../models/order.model');
const OrderMenu = require('../models/order_menu.model');
const kdsController = require('../controllers/kds.controller');

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
  await KitchenItem.deleteMany({});
  await Order.deleteMany({});
  await OrderMenu.deleteMany({});
});

test.after(async () => {
  await KitchenItem.deleteMany({});
  await Order.deleteMany({});
  await OrderMenu.deleteMany({});
});

test('kds CRUD happy path', async () => {
  const restaurant_id = 'r1';

  // First create an order and order menu items for testing
  const order = await Order.create({
    restaurant_id,
    order_number: 'ORD001',
    amount: 25.50,
    payment_mode: 'CASH',
    notes: 'Test order',
    itemIn: 'dinein', // or 'pickup'
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const orderMenu = await OrderMenu.create({
    restaurant_id,
    order_id: order._id,
    menuItem_id: 'mi1',
    quantity: 2,
    price: 10.00,
    addon_ids: ['a1', 'a2'],
    variant_ids: ['v1'],
    notes: 'Extra cheese',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Create kitchen item
  let kitchenItemId;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        menuItem_id: orderMenu.menuItem_id,
        order_id: order._id,
        quantity: orderMenu.quantity,
        status: 'PENDING',
        notes: orderMenu.notes
      }
    };

    const res = mockRes();
    await kdsController.createFromOrder(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    kitchenItemId = res.body.data[0]._id;
  }

  // List (paginate)
  {
    const listReq = {
      auth: { restaurant_id },
      query: { page: '1', searchName: '', status: 'PENDING' }
    };
    const res = mockRes();
    await kdsController.list(listReq, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    assert.equal(res.body.data.docs[0].status, 'PENDING');
  }

  // ListAll
  {
    const listAllReq = {
      auth: { restaurant_id },
      query: { status: 'PENDING' }
    };
    const res = mockRes();
    await kdsController.listAll(listAllReq, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].status, 'PENDING');
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: kitchenItemId } };
    const res = mockRes();
    await kdsController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, kitchenItemId);
    assert.equal(res.body.data.order_id, order._id.toString());
    assert.equal(res.body.data.menuItem_id, orderMenu.menuItem_id.toString());
    assert.equal(res.body.data.quantity, orderMenu.quantity);
    assert.equal(res.body.data.status, 'PENDING');
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: kitchenItemId },
      body: {
        menuItem_id: orderMenu.menuItem_id,
        order_id: order._id,
        quantity: orderMenu.quantity,
        status: 'PREPARED',
        notes: orderMenu.notes
      }
    };

    const res = mockRes();
    await kdsController.update(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.status, 'PREPARED');
  }

  // View after update to check changes
  {
    const req = { auth: { restaurant_id }, params: { id: kitchenItemId } };
    const res = mockRes();
    await kdsController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.status, 'PREPARED');
  }

  // GetByOrderId
  {
    const req = {
      auth: { restaurant_id },
      params: { orderId: order._id }
    };
    const res = mockRes();
    await kdsController.getByOrderId(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0]._id, kitchenItemId);
  }

  // UpdateStatus
  {
    const req = {
      auth: { restaurant_id },
      params: { id: kitchenItemId },
      body: { status: 'SERVED' }
    };

    const res = mockRes();
    await kdsController.updateStatus(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'Kitchen item status updated successfully');
  }

  // Delete
  {
    const req = { auth: { restaurant_id }, params: { id: kitchenItemId } };
    const res = mockRes();
    await kdsController.delete(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'Kitchen item deleted successfully');

    const after = await KitchenItem.findOne({ restaurant_id, _id: kitchenItemId });
    assert.equal(after, null);
  }
});

test('kds validation errors', async () => {
  const restaurant_id = 'r1';

  // Missing required fields in createFromOrder? Actually createFromOrder doesn't take body, it takes orderId.
  // We'll test the update method instead.

  // Updating with invalid ID
  {
    const req = {
      auth: { restaurant_id },
      params: { id: 'invalid' },
      body: {
        status: 'PREPARED'
      }
    };
    const res = mockRes();
    await kdsController.update(req, res);

    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'invalid');
  }
});

test('kds createFromOrder with missing order', async () => {
  const restaurant_id = 'r1';

  {
    const req = {
      auth: { restaurant_id },
      params: { orderId: 'nonexistent' }
    };
    const res = mockRes();
    await kdsController.createFromOrder(req, res);

    assert.equal(res.body.status.code, 404);
    assert.equal(res.body.status.message, 'Order not found');
  }
});

test('kds getByOrderId with no kitchen items', async () => {
  const restaurant_id = 'r1';

  // Create an order with no order menu items? Actually we need at least one to create kitchen items.
  // Let's create an order and then try to get kitchen items for it without creating any.
  const order = await Order.create({
    restaurant_id,
    order_number: 'ORD002',
    amount: 0,
    payment_mode: '',
    notes: 'Test order with no items',
    itemIn: 'dinein',
    status: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  {
    const req = {
      auth: { restaurant_id },
      params: { orderId: order._id }
    };
    const res = mockRes();
    await kdsController.getByOrderId(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 0);
  }
});