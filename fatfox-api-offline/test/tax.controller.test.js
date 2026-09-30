'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-tax-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const Tax = require('../models/tax.model');
const taxController = require('../controllers/tax.controller');

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
  await Tax.deleteMany({});
});

test('tax CRUD + setTax happy path', async () => {
  const restaurant_id = 'r1';

  // Create
  let taxId;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        tax_type: 'FORWARD',
        title: 'SGST',
        display_name: 'SGST',
        value_type: 'PERCENTAGE',
        areas: JSON.stringify(['area-1']),
        value_amount: '5',
        description: 'Tax desc',
        status: 1,
        area_type: JSON.stringify(['dinein'])
      }
    };

    const res = mockRes();
    await taxController.create(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data._id);
    taxId = res.body.data._id;
  }

  // List
  {
    const listReq = {
      auth: { restaurant_id },
      query: { page: '1', searchName: 'SG' }
    };

    const res = mockRes();
    await taxController.list(listReq, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    assert.equal(res.body.data.docs[0].title, 'SGST');
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: taxId } };
    const res = mockRes();
    await taxController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, taxId);
    assert.equal(res.body.data.display_name, 'SGST');
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: taxId },
      body: {
        tax_type: 'BACKWARD',
        title: 'SGST2',
        display_name: 'SGST2',
        value_type: 'FIXED',
        areas: JSON.stringify(['area-1']),
        value_amount: '10',
        description: 'Tax desc 2',
        status: 1,
        area_type: JSON.stringify(['dinein'])
      }
    };

    const res = mockRes();
    await taxController.update(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.title, 'SGST2');
    assert.equal(res.body.data.tax_type, 'BACKWARD');
    assert.equal(res.body.data.value_amount, '10');
  }

  // setTax
  {
    const req = {
      auth: { restaurant_id },
      query: { areaId: 'area-1', area_type: 'dinein' }
    };
    const res = mockRes();
    await taxController.setTax(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].tax_type, 'BACKWARD');
    assert.equal(res.body.data[0].name, 'SGST2');
    assert.equal(res.body.data[0].value_amount, '10');
  }

  // Delete
  {
    const req = { auth: { restaurant_id }, params: { id: taxId } };
    const res = mockRes();
    await taxController.delete(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, taxId);

    const after = await Tax.findOne({ restaurant_id, _id: taxId });
    assert.equal(after, null);
  }
});
