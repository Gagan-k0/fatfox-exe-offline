'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-pickup-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const Order = require('../models/order.model');
const OrderMenu = require('../models/order_menu.model');
const Transaction = require('../models/transaction.model');
const pickupController = require('../controllers/pickup.controller');

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
  await Order.deleteMany({});
  await OrderMenu.deleteMany({});
  await Transaction.deleteMany({});
});

test.after(async () => {
  await Order.deleteMany({});
  await OrderMenu.deleteMany({});
  await Transaction.deleteMany({});
});

test('pickup CRUD + additional methods happy path', async () => {
  const restaurant_id = 'r1';

  // Create pickup with items
  let pickupId;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        customer_name: 'John Doe',
        customer_phone: '1234567890',
        pickup_number: 'PU001',
        status: 1,
        order_number: 'ORD001',
        amount: 25.50,
        payment_mode: 'CASH',
        notes: 'Test pickup',
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
    await pickupController.create(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data && res.body.data._id);
    pickupId = res.body.data._id;
  }

  // List (paginate)
  {
    const listReq = {
      auth: { restaurant_id },
      query: { page: '1', searchName: 'John' }
    };
    const res = mockRes();
    await pickupController.list(listReq, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    assert.equal(res.body.data.docs[0].customer_name, 'John Doe');
  }

  // ListAll
  {
    const listAllReq = {
      auth: { restaurant_id }
    };
    const res = mockRes();
    await pickupController.listAll(listAllReq, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].customer_name, 'John Doe');
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: pickupId } };
    const res = mockRes();
    await pickupController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, pickupId);
    assert.equal(res.body.data.customer_name, 'John Doe');
    assert.equal(res.body.data.customer_phone, '1234567890');
    assert.equal(res.body.data.pickup_number, 'PU001');
    assert.equal(res.body.data.status, 1);
    assert.equal(res.body.data.order_number, 'ORD001');
    assert.equal(res.body.data.amount, 25.50);
    assert.equal(res.body.data.payment_mode, 'CASH');
    assert.equal(res.body.data.notes, 'Test pickup');
    assert.equal(res.body.data.itemIn, 'pickup');
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: pickupId },
      body: {
        customer_name: 'Jane Doe',
        customer_phone: '0987654321',
        pickup_number: 'PU002',
        status: 1,
        order_number: 'ORD002',
        amount: 30.00,
        payment_mode: 'CARD',
        notes: 'Updated pickup'
      }
    };

    const res = mockRes();
    await pickupController.update(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.customer_name, 'Jane Doe');
    assert.equal(res.body.data.customer_phone, '0987654321');
    assert.equal(res.body.data.pickup_number, 'PU002');
    assert.equal(res.body.data.status, 1);
    assert.equal(res.body.data.order_number, 'ORD002');
    assert.equal(res.body.data.amount, 30.00);
    assert.equal(res.body.data.payment_mode, 'CARD');
    assert.equal(res.body.data.notes, 'Updated pickup');
  }

  // View after update to check changes
  {
    const req = { auth: { restaurant_id }, params: { id: pickupId } };
    const res = mockRes();
    await pickupController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.customer_name, 'Jane Doe');
    assert.equal(res.body.data.customer_phone, '0987654321');
    assert.equal(res.body.data.pickup_number, 'PU002');
    assert.equal(res.body.data.status, 1);
    assert.equal(res.body.data.order_number, 'ORD002');
    assert.equal(res.body.data.amount, 30.00);
    assert.equal(res.body.data.payment_mode, 'CARD');
    assert.equal(res.body.data.notes, 'Updated pickup');
  }

  // GetAll
  {
    const req = {
      auth: { restaurant_id }
    };
    const res = mockRes();
    await pickupController.getAll(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].customer_name, 'Jane Doe');
  }

  // GetByTransactionId
  {
    // First create a transaction and pickup with transaction
    let transactionId;
    let pickupWithTransId;
    {
      const transactionData = {
        amount: 15.75,
        status: 'SETTLED',
        type: 'PICKUP',
        reference_id: 'REF001'
      };

      const req = {
        auth: { restaurant_id },
        body: {
          pickupData: {
            customer_name: 'Trans User',
            customer_phone: '5555555555',
            pickup_number: 'PUT001',
            status: 1,
            order_number: 'ORDT001',
            amount: 15.75,
            payment_mode: 'CARD',
            notes: 'Pickup with transaction'
          },
          transactionData: transactionData
        }
      };

      const res = mockRes();
      await pickupController.createWithTransaction(req, res);

      assert.equal(res.body.status.code, 200);
      transactionId = res.body.data.transactionId;
      pickupWithTransId = res.body.data.pickupId;
    }

    // Now test getting by transaction ID
    const req = {
      auth: { restaurant_id },
      params: { transactionId: transactionId }
    };
    const res = mockRes();
    await pickupController.getByTransactionId(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, pickupWithTransId);
    assert.equal(res.body.data.customer_name, 'Trans User');
  }

  // UpdateStatus
  {
    const req = {
      auth: { restaurant_id },
      params: { id: pickupId },
      body: { status: 0 }
    };
    const res = mockRes();
    await pickupController.updateStatus(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'Pickup Status Updated Successfully');
  }

  // Delete
  {
    const req = { auth: { restaurant_id }, params: { id: pickupId } };
    const res = mockRes();
    await pickupController.delete(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'Pickup Deleted Successfully');

    const after = await Order.findOne({ restaurant_id, _id: pickupId, itemIn: 'pickup' });
    assert.equal(after, null);
  }
});

test('pickup validation errors', async () => {
  const restaurant_id = 'r1';

  // Missing customer_name, customer_phone, pickup_number
  {
    const req = {
      auth: { restaurant_id },
      body: {
        status: 1
      }
    };
    const res = mockRes();
    await pickupController.create(req, res);

    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
    assert.deepEqual(res.body.data, [
      { msg: 'customer_name, customer_phone, and pickup_number are required' }
    ]);
  }

  // Duplicate pickup_number
  {
    // First create a pickup
    const pickup1 = await Order.create({
      restaurant_id,
      customer_name: 'Duplicate',
      customer_phone: '1111111111',
      pickup_number: 'DUP001',
      status: 1,
      order_number: 'ORDDUP001',
      amount: 0,
      payment_mode: '',
      notes: '',
      itemIn: 'pickup',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const req = {
      auth: { restaurant_id },
      body: {
        customer_name: 'Another',
        customer_phone: '2222222222',
        pickup_number: 'DUP001',
        status: 1,
        order_number: 'ORDDUP002',
        amount: 0,
        payment_mode: '',
        notes: ''
      }
    };
    const res = mockRes();
    await pickupController.create(req, res);

    assert.equal(res.body.status.code, 409);
    assert.equal(res.body.status.message, 'Pickup Number Already Exist');
  }
});

test('pickup createWithTransaction validation errors', async () => {
  const restaurant_id = 'r1';

  // Missing pickupData or transactionData
  {
    const req = {
      auth: { restaurant_id },
      body: {
        pickupData: {
          customer_name: 'Test',
          customer_phone: '1234567890',
          pickup_number: 'TC001',
          status: 1,
          order_number: 'ORDTC001',
          amount: 10.00,
          payment_mode: 'CASH'
          // Missing transactionData
        }
      }
    };
    const res = mockRes();
    await pickupController.createWithTransaction(req, res);

    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
    assert.deepEqual(res.body.data, [
      { msg: 'pickupData and transactionData are required' }
    ]);
  }
});