'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-discount-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const Discount = require('../models/discount.model');
const discountController = require('../controllers/discount.controller');

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
  await Discount.deleteMany({});
});

test('discount CRUD + available happy path', async () => {
  const restaurant_id = 'r1';

  // Create
  let discountId;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        discount_on: 'idk',
        title: 'SAVE10',
        code: '',
        validation: 0,
        value_type: 'PERCENTAGE',
        set_at: 'CORE',
        value_amount: '10',
        terms_conditions: 'any',
        order_type: JSON.stringify(['pickup']),
        applicable_on: 'ALL',
        applicableamount_from: 100,
        applicableamount_to: 500,
        max_discount: 50,
        usage_limit_total: 10,
        usage_limit_per_user: 2,
        first_order_only: false,
        is_combinable: false,
        from_date: '',
        to_date: '',
        from_time: '',
        to_time: '',
        days: JSON.stringify([]),
        status: 1
      }
    };

    const res = mockRes();
    await discountController.create(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data && res.body.data._id);
    discountId = res.body.data._id;
  }

  // List (paginate)
  {
    const listReq = {
      auth: { restaurant_id },
      query: { page: '1', searchName: 'SAVE' }
    };
    const res = mockRes();
    await discountController.list(listReq, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    assert.equal(res.body.data.docs[0].title, 'SAVE10');
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: discountId } };
    const res = mockRes();
    await discountController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, discountId);
    assert.equal(res.body.data.title, 'SAVE10');
    assert.equal(res.body.data.value_amount, '10');
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: discountId },
      body: {
        discount_on: 'idk',
        title: 'SAVE20',
        code: '',
        validation: 0,
        value_type: 'PERCENTAGE',
        set_at: 'CORE',
        value_amount: '20',
        terms_conditions: 'any',
        order_type: JSON.stringify(['pickup']),
        applicable_on: 'ALL',
        applicableamount_from: 100,
        applicableamount_to: 500,
        max_discount: 50,
        usage_limit_total: 10,
        usage_limit_per_user: 2,
        first_order_only: false,
        is_combinable: true,
        from_date: '',
        to_date: '',
        from_time: '',
        to_time: '',
        days: JSON.stringify([]),
        status: 1
      }
    };

    const res = mockRes();
    await discountController.update(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.title, 'SAVE20');
    assert.equal(res.body.data.is_combinable, true);
  }

  // Available
  {
    const req = {
      auth: { restaurant_id },
      query: { orderType: 'pickup', orderAmount: '200', searchName: 'SAVE' }
    };

    const res = mockRes();
    await discountController.listAllAvaliable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].title, 'SAVE20');
  }

  // Delete
  {
    const req = { auth: { restaurant_id }, params: { id: discountId } };
    const res = mockRes();
    await discountController.delete(req, res);

    assert.equal(res.body.status.code, 200);

    const after = await Discount.findOne({ restaurant_id, _id: discountId });
    assert.equal(after, null);
  }
});
