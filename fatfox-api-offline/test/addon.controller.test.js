'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-addon-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const Addon = require('../models/addon.model');
const addonController = require('../controllers/addon.controller');

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
  await Addon.deleteMany({});
});

test.after(async () => {
  await Addon.deleteMany({});
});

test('addon CRUD + getAll + getAvailable happy path', async () => {
  const restaurant_id = 'r1';

  // Create
  let addonId;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        name: 'Extra Cheese',
        display_name: 'Extra Cheese',
        status: 1,
        showPrice: true,
        showAttribute: false,
        limit_type: 'fixed',
        min: 1,
        max: 5,
        values: JSON.stringify(['Regular', 'Double'])
      }
    };

    const res = mockRes();
    await addonController.create(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data && res.body.data._id);
    addonId = res.body.data._id;
  }

  // List (paginate)
  {
    const listReq = {
      auth: { restaurant_id },
      query: { page: '1', searchName: 'Cheese' }
    };
    const res = mockRes();
    await addonController.list(listReq, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    assert.equal(res.body.data.docs[0].name, 'Extra Cheese');
  }

  // ListAll
  {
    const listAllReq = {
      auth: { restaurant_id },
      query: { searchName: 'Cheese' }
    };
    const res = mockRes();
    await addonController.listAll(listAllReq, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, 'Extra Cheese');
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: addonId } };
    const res = mockRes();
    await addonController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, addonId);
    assert.equal(res.body.data.name, 'Extra Cheese');
    assert.equal(res.body.data.displayname, 'Extra Cheese');
    assert.equal(res.body.data.status, 1);
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: addonId },
      body: {
        name: 'Extra Cheese Updated',
        display_name: 'Extra Cheese Updated',
        status: 1,
        showPrice: false,
        showAttribute: true,
        limit_type: 'range',
        min: 1,
        max: 3,
        values: JSON.stringify(['Regular'])
      }
    };

    const res = mockRes();
    await addonController.update(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.name, 'Extra Cheese Updated');
    assert.equal(res.body.data.showPrice, false);
    assert.equal(res.body.data.showAttribute, true);
    assert.equal(res.body.data.limit_type, 'range');
    assert.equal(res.body.data.min, 1);
    assert.equal(res.body.data.max, 3);
  }

  // GetAvailable (only active addons)
  {
    const req = {
      auth: { restaurant_id },
      query: { searchName: 'Cheese' }
    };
    const res = mockRes();
    await addonController.getAvailable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].name, 'Extra Cheese Updated');
  }

  // Deactivate addon
  {
    const req = {
      auth: { restaurant_id },
      params: { id: addonId },
      body: { status: 0 }
    };
    const res = mockRes();
    await addonController.updateStatus(req, res);

    assert.equal(res.body.status.code, 200);
  }

  // GetAvailable after deactivation should return empty
  {
    const req = {
      auth: { restaurant_id },
      query: { searchName: 'Cheese' }
    };
    const res = mockRes();
    await addonController.getAvailable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 0);
  }

  // Delete
  {
    const req = { auth: { restaurant_id }, params: { id: addonId } };
    const res = mockRes();
    await addonController.delete(req, res);

    assert.equal(res.body.status.code, 200);

    const after = await Addon.findOne({ restaurant_id, _id: addonId });
    assert.equal(after, null);
  }
});

test('addon validation errors', async () => {
  const restaurant_id = 'r1';

  // Missing name and display_name
  {
    const req = {
      auth: { restaurant_id },
      body: {
        status: 1
      }
    };
    const res = mockRes();
    await addonController.create(req, res);

    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
    assert.deepEqual(res.body.data, [{ msg: 'name and display_name are required' }]);
  }

  // Duplicate name
  {
    // First create an addon
    const addon1 = await Addon.create({
      restaurant_id,
      name: 'Duplicate',
      displayname: 'Duplicate Display',
      status: 1,
      showPrice: false,
      showAttribute: false,
      limit_type: '',
      min: 0,
      max: 0,
      values: [],
      createdAt: new Date(),
      updatedAt: new Date()
    });

    const req = {
      auth: { restaurant_id },
      body: {
        name: 'Duplicate',
        display_name: 'Another Display',
        status: 1,
        showPrice: false,
        showAttribute: false,
        limit_type: '',
        min: 0,
        max: 0,
        values: []
      }
    };
    const res = mockRes();
    await addonController.create(req, res);

    assert.equal(res.body.status.code, 409);
    assert.equal(res.body.status.message, 'Addon Name Already Exist');
  }

  // Invalid limit_type
  {
    const req = {
      auth: { restaurant_id },
      body: {
        name: 'Test',
        display_name: 'Test',
        status: 1,
        showPrice: false,
        showAttribute: false,
        limit_type: 'invalid',
        min: 0,
        max: 0,
        values: []
      }
    };
    const res = mockRes();
    await addonController.create(req, res);

    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
    assert.deepEqual(res.body.data, [{ msg: 'limit_type must be either fixed or range' }]);
  }

  // Range limit_type without min/max
  {
    const req = {
      auth: { restaurant_id },
      body: {
        name: 'Test2',
        display_name: 'Test2',
        status: 1,
        showPrice: false,
        showAttribute: false,
        limit_type: 'range',
        min: '',
        max: '',
        values: []
      }
    };
    const res = mockRes();
    await addonController.create(req, res);

    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
    assert.deepEqual(res.body.data, [{ msg: 'min and max are required for range limit type' }]);
  }

  // Invalid min/max for range
  {
    const req = {
      auth: { restaurant_id },
      body: {
        name: 'Test3',
        display_name: 'Test3',
        status: 1,
        showPrice: false,
        showAttribute: false,
        limit_type: 'range',
        min: 5,
        max: 3,
        values: []
      }
    };
    const res = mockRes();
    await addonController.create(req, res);

    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
    assert.deepEqual(res.body.data, [{ msg: 'min and max must be valid numbers with min <= max' }]);
  }
});