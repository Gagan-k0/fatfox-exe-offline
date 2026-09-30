'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-cat-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const Category = require('../models/category.model');
const permissionsController = require('../controllers/permissions.controller');
const categoryController = require('../controllers/category.controller');

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
  await Category.deleteMany({});
});

test('category create/list/view/update/updateStatus/delete happy path', async () => {
  const restaurant_id = 'r1';

  // Create
  {
    const req = {
      auth: { restaurant_id },
      body: {
        valuename: 'veg',
        displayname: 'Veg',
        restricted: false,
        famous: true,
        most_selling: false,
        meal_times: ['breakfast'],
        display_priority: '2',
        departments: ['d1']
      }
    };
    const res = mockRes();
    await categoryController.create(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data._id);
  }

  // List
  let categoryId;
  {
    const listReq = {
      auth: { restaurant_id },
      query: { page: '1', searchName: 've' }
    };
    const res = mockRes();
    await categoryController.list(listReq, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    categoryId = res.body.data.docs[0]._id;
    assert.equal(res.body.data.docs[0].valuename, 'veg');
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: categoryId } };
    const res = mockRes();
    await categoryController.view(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, categoryId);
    assert.equal(res.body.data.displayname, 'Veg');
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: categoryId },
      body: {
        valuename: 'veg2',
        displayname: 'Veg 2',
        restricted: true,
        famous: false,
        most_selling: true,
        meal_times: ['lunch'],
        display_priority: null,
        departments: []
      }
    };
    const res = mockRes();
    await categoryController.update(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.valuename, 'veg2');
    assert.equal(res.body.data.displayname, 'Veg 2');
  }

  // Update status
  {
    const req = {
      auth: { restaurant_id },
      params: { id: categoryId },
      body: { status: 0 }
    };
    const res = mockRes();
    await categoryController.updateStatus(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.status, 0);
  }

  // Delete
  {
    const req = {
      auth: { restaurant_id },
      params: { id: categoryId }
    };
    const res = mockRes();
    await categoryController.delete(req, res);
    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, categoryId);

    const after = await Category.findOne({ restaurant_id, _id: categoryId });
    assert.equal(after, null);
  }
});

test('permissions endpoint shape', async () => {
  const req = { auth: { restaurant_id: 'r1', usertype: 'admin' } };
  const res = mockRes();
  await permissionsController.getPermission(req, res);
  assert.equal(res.body.status.code, 200);
  assert.ok(Array.isArray(res.body.data.permissions));
  assert.ok(typeof res.body.data.usertype === 'string');
});
