'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-finance-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const Transaction = require('../models/transaction.model');
const Order = require('../models/order.model');
const OrderMenu = require('../models/order_menu.model');
const MenuItem = require('../models/menuItems.model');
const financeController = require('../controllers/finance.controller');

function mockRes() {
  return {
    statusCode: null,
    body: null,
    setHeader() {},
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
  await Transaction.deleteMany({});
  await Order.deleteMany({});
  await OrderMenu.deleteMany({});
  await MenuItem.deleteMany({});
});

test.after(async () => {
  await Transaction.deleteMany({});
  await Order.deleteMany({});
  await OrderMenu.deleteMany({});
  await MenuItem.deleteMany({});
});

test('finance createTransaction happy path', async () => {
  const restaurant_id = 'r1';

  const req = {
    auth: { restaurant_id },
    body: {
      amount: 100.50,
      status: 1,
      type: 'CASH',
      reference_id: 'ref123',
      notes: 'Test transaction'
    }
  };

  const res = mockRes();
  await financeController.createTransaction(req, res);

  assert.equal(res.body.status.code, 200);
  assert.equal(res.body.status.message, 'Transaction created successfully');
  assert.ok(res.body.data);
  assert.equal(res.body.data.amount, 100.50);
  assert.equal(res.body.data.status, 1);
  assert.equal(res.body.data.type, 'CASH');
  assert.equal(res.body.data.reference_id, 'ref123');
  assert.equal(res.body.data.notes, 'Test transaction');
});

test('finance createTransaction validation errors', async () => {
  const restaurant_id = 'r1';

  // Missing amount
  {
    const req = {
      auth: { restaurant_id },
      body: {
        status: 1,
        type: 'CASH'
      }
    };
    const res = mockRes();
    await financeController.createTransaction(req, res);
    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
    assert.deepEqual(res.body.data, [{ msg: 'amount is required' }]);
  }

  // Missing type
  {
    const req = {
      auth: { restaurant_id },
      body: {
        amount: 50
      }
    };
    const res = mockRes();
    await financeController.createTransaction(req, res);
    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
    assert.deepEqual(res.body.data, [{ msg: 'type is required' }]);
  }
});

test('finance list and listAll', async () => {
  const restaurant_id = 'r1';

  // Create a few transactions
  await Transaction.create({
    restaurant_id,
    amount: 100,
    status: 1,
    type: 'CASH',
    createdAt: new Date('2026-09-01')
  });
  await Transaction.create({
    restaurant_id,
    amount: 200,
    status: 0,
    type: 'CARD',
    createdAt: new Date('2026-09-02')
  });

  // List with pagination
  {
    const req = {
      auth: { restaurant_id },
      query: { page: '1' }
    };
    const res = mockRes();
    await financeController.list(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'transactions');
    assert.ok(res.body.data);
    assert.equal(res.body.data.docs.length, 2); // page 1, limit 10, we have 2

    // Should be sorted by createdAt descending, so the Sept 2 transaction first
    assert.equal(res.body.data.docs[0].amount, 200);
    assert.equal(res.body.data.docs[1].amount, 100);
  }

  // ListAll
  {
    const req = {
      auth: { restaurant_id }
    };
    const res = mockRes();
    await financeController.listAll(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'transactions');
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 2);
  }
});

test('finance view, update, delete', async () => {
  const restaurant_id = 'r1';

  // Create a transaction
  const transaction = await Transaction.create({
    restaurant_id,
    amount: 150,
    status: 1,
    type: 'UPI',
    reference_id: 'ref456',
    notes: 'Initial notes'
  });

  // View
  {
    const req = {
      auth: { restaurant_id },
      params: { id: transaction._id }
    };
    const res = mockRes();
    await financeController.view(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'transaction');
    assert.equal(res.body.data._id, transaction._id.toString());
    assert.equal(res.body.data.amount, 150);
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: transaction._id },
      body: {
        amount: 300,
        status: 0,
        type: 'CASH',
        reference_id: 'ref789',
        notes: 'Updated notes'
      }
    };
    const res = mockRes();
    await financeController.update(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'Transaction updated successfully');
    assert.equal(res.body.data.amount, 300);
    assert.equal(res.body.data.status, 0);
    assert.equal(res.body.data.type, 'CASH');
    assert.equal(res.body.data.reference_id, 'ref789');
    assert.equal(res.body.data.notes, 'Updated notes');
  }

  // Delete
  {
    const req = {
      auth: { restaurant_id },
      params: { id: transaction._id }
    };
    const res = mockRes();
    await financeController.delete(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'Transaction deleted successfully');

    // Verify deletion
    const deleted = await Transaction.findOne({ _id: transaction._id, restaurant_id });
    assert.equal(deleted, null);
  }
});

test('finance dailySalesReport', async () => {
  const restaurant_id = 'r1';

  // Create orders for today and yesterday
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  // Today: two orders, one pickup, one dinein
  await Order.create({
    restaurant_id,
    order_number: 'ORD001',
    amount: 50,
    payment_mode: 'CASH',
    notes: 'Today pickup',
    itemIn: 'pickup',
    status: 1,
    createdAt: today
  });
  await Order.create({
    restaurant_id,
    order_number: 'ORD002',
    amount: 30,
    payment_mode: 'CARD',
    notes: 'Today dinein',
    itemIn: 'dinein',
    status: 1,
    createdAt: today
  });

  // Yesterday: one order
  await Order.create({
    restaurant_id,
    order_number: 'ORD003',
    amount: 20,
    payment_mode: 'CASH',
    notes: 'Yesterday pickup',
    itemIn: 'pickup',
    status: 1,
    createdAt: yesterday
  });

  // Test daily sales report for today (without date query, should default to today)
  {
    const req = {
      auth: { restaurant_id }
    };
    const res = mockRes();
    await financeController.dailySalesReport(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'daily sales report');

    assert.ok(res.body.data);
    // Today: totalSales = 50 + 30 = 80, totalOrders = 2, totalPickup = 1, totalDinein = 1
    assert.equal(res.body.data.totalSales, 80);
    assert.equal(res.body.data.totalOrders, 2);
    assert.equal(res.body.data.totalPickup, 1);
    assert.equal(res.body.data.totalDinein, 1);
  }

  // Test daily sales report for yesterday
  {
    const req = {
      auth: { restaurant_id },
      query: { date: yesterday.toISOString().split('T')[0] }
    };
    const res = mockRes();
    await financeController.dailySalesReport(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'daily sales report');

    assert.ok(res.body.data);
    // Yesterday: totalSales = 20, totalOrders = 1, totalPickup = 1, totalDinein = 0
    assert.equal(res.body.data.totalSales, 20);
    assert.equal(res.body.data.totalOrders, 1);
    assert.equal(res.body.data.totalPickup, 1);
    assert.equal(res.body.data.totalDinein, 0);
  }
});

test('finance monthlySalesReport', async () => {
  const restaurant_id = 'r1';

  // Create orders for this month and last month
  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  // This month: one order
  await Order.create({
    restaurant_id,
    order_number: 'ORD004',
    amount: 100,
    payment_mode: 'CASH',
    notes: 'This month',
    itemIn: 'pickup',
    status: 1,
    createdAt: thisMonthStart
  });

  // Last month: one order
  await Order.create({
    restaurant_id,
    order_number: 'ORD005',
    amount: 50,
    payment_mode: 'CASH',
    notes: 'Last month',
    itemIn: 'dinein',
    status: 1,
    createdAt: lastMonthStart
  });

  // Test monthly sales report without month param (should default to current month)
  {
    const req = {
      auth: { restaurant_id }
    };
    const res = mockRes();
    await financeController.monthlySalesReport(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'monthly sales report');
    assert.ok(res.body.data);

    // This month: totalSales = 100, totalOrders = 1, totalPickup = 1, totalDinein = 0
    assert.equal(res.body.data.totalSales, 100);
    assert.equal(res.body.data.totalOrders, 1);
    assert.equal(res.body.data.totalPickup, 1);
    assert.equal(res.body.data.totalDinein, 0);

    const expectedMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    assert.equal(res.body.data.month, expectedMonth);
  }

  // Test monthly sales report for last month
  {
    const req = {
      auth: { restaurant_id },
      query: {
        month: `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, '0')}`
      }
    };
    const res = mockRes();
    await financeController.monthlySalesReport(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'monthly sales report');
    assert.ok(res.body.data);

    assert.equal(res.body.data.totalSales, 50);
    assert.equal(res.body.data.totalOrders, 1);
    assert.equal(res.body.data.totalPickup, 0);
    assert.equal(res.body.data.totalDinein, 1);
    assert.equal(
      res.body.data.month,
      `${lastMonthStart.getFullYear()}-${String(lastMonthStart.getMonth() + 1).padStart(2, '0')}`
    );
  }
});

test('finance exportCsv', async () => {
  const restaurant_id = 'r1';

  // Create a couple transactions
  await Transaction.create({
    restaurant_id,
    amount: 100.5,
    status: 1,
    type: 'CASH',
    reference_id: 'ref1',
    notes: 'First'
  });
  await Transaction.create({
    restaurant_id,
    amount: 200,
    status: 0,
    type: 'CARD',
    reference_id: 'ref2',
    notes: 'Second'
  });

  const req = {
    auth: { restaurant_id }
  };

  const res = mockRes();
  const writeChunks = [];
  res.write = (chunk) => {
    writeChunks.push(chunk);
  };
  res.end = () => {};

  await financeController.exportCsv(req, res);

  const csv = writeChunks.join('');
  assert.ok(csv.length > 0);

  const lines = csv.trim().split('\n');
  assert.equal(lines.length, 3); // header + 2 data rows

  assert.ok(lines[0].includes('createdAt'));
  assert.ok(lines[0].includes('amount'));
  assert.ok(lines[0].includes('status'));
});

test('finance itemSales', async () => {
  const restaurant_id = 'r1';

  // Create a menu item
  const menuItem = await MenuItem.create({
    name: 'Test Item',
    price: 10,
    status: 1
  });

  // Create an order with two order menu items (same menu item, quantity 2)
  const orderCreatedAt = new Date();
  const order = await Order.create({
    restaurant_id,
    order_number: 'ORD006',
    amount: 0,
    payment_mode: 'CASH',
    notes: 'Test order for itemSales',
    itemIn: 'dinein',
    status: 1,
    createdAt: orderCreatedAt
  });

  await OrderMenu.create({
    restaurant_id,
    order_id: order._id,
    menuItem_id: menuItem._id,
    quantity: 2,
    price: 10,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const expectedDateStr = orderCreatedAt.toISOString().split('T')[0];

  // Test itemSales for current day (no from/to to avoid timezone edge cases)
  {
    const req = {
      auth: { restaurant_id },
      query: {}
    };
    const res = mockRes();
    await financeController.itemSales(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'item sales report');
    assert.ok(res.body.data);

    assert.equal(res.body.data.summary.totalRevenueNet, 20);
    assert.equal(res.body.data.summary.totalItemSalesGross, 20);
    assert.equal(res.body.data.summary.totalQtySold, 2);
    assert.equal(res.body.data.summary.totalOrders, 1);
    assert.equal(res.body.data.summary.totalItems, 1);

    assert.ok(res.body.data.summary.topSellingItem);
    assert.equal(res.body.data.summary.topSellingItem.name, 'Test Item');
    assert.equal(res.body.data.summary.topSellingItem.quantity, 2);

    assert.ok(res.body.data.summary.highestRevenueItem);
    assert.equal(res.body.data.summary.highestRevenueItem.name, 'Test Item');
    assert.equal(res.body.data.summary.highestRevenueItem.revenue, 20);

    assert.ok(Array.isArray(res.body.data.items));
    assert.equal(res.body.data.items.length, 1);

    const item = res.body.data.items[0];
    assert.equal(item.menuId, menuItem._id.toString());
    assert.equal(item.name, 'Test Item');
    assert.equal(item.qtySold, 2);
    assert.equal(item.revenue, 20);
    assert.equal(item.orders, 0);
    assert.equal(item.avgPrice, 10);
    assert.equal(item.contributionPct, 100);

    assert.ok(Array.isArray(res.body.data.dailyTrend));
    assert.equal(res.body.data.dailyTrend.length, 1);

    const trend = res.body.data.dailyTrend[0];
    assert.equal(trend.date, expectedDateStr);
    assert.equal(trend.revenue, 20);
    assert.equal(trend.orders, 1);
  }
});
