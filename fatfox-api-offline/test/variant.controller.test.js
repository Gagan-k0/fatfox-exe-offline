'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-variant-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const Variant = require('../models/variant.model');
const variantController = require('../controllers/variant.controller');

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
  await Variant.deleteMany({});
});

test.after(async () => {
  await Variant.deleteMany({});
});

test('variant CRUD + group listing happy path', async () => {
  const restaurant_id = 'r1';

  // Create variant #1
  let v1Id;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        name: 'Spicy',
        group_id: 'g1'
      }
    };

    const res = mockRes();
    await variantController.create(req, res);

    assert.equal(res.body.status.code, 200);
    v1Id = res.body.data._id;
  }

  // Create variant #2 (same group)
  let v2Id;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        name: 'Mild',
        group_id: 'g1'
      }
    };

    const res = mockRes();
    await variantController.create(req, res);

    assert.equal(res.body.status.code, 200);
    v2Id = res.body.data._id;
  }

  // Create variant #3 (different group)
  let v3Id;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        name: 'Extra',
        group_id: 'g2'
      }
    };

    const res = mockRes();
    await variantController.create(req, res);

    assert.equal(res.body.status.code, 200);
    v3Id = res.body.data._id;
  }

  // List (paginate) with search
  {
    const req = {
      auth: { restaurant_id },
      query: { page: '1', searchName: 'Sp' }
    };

    const res = mockRes();
    await variantController.list(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    assert.equal(res.body.data.docs[0].name, 'Spicy');
  }

  // ListAll
  {
    const req = {
      auth: { restaurant_id },
      query: { searchName: '' }
    };

    const res = mockRes();
    await variantController.listAll(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 3);
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: v1Id } };
    const res = mockRes();
    await variantController.view(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, v1Id);
    assert.equal(res.body.data.name, 'Spicy');
    assert.equal(res.body.data.group_id, 'g1');
  }

  // Update (name + status)
  {
    const req = {
      auth: { restaurant_id },
      params: { id: v1Id },
      body: {
        name: 'Spicy-Updated',
        group_id: 'g1',
        status: 1
      }
    };

    const res = mockRes();
    await variantController.update(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.name, 'Spicy-Updated');
  }

  // updateStatus deactivate
  {
    const req = {
      auth: { restaurant_id },
      params: { id: v2Id },
      body: { status: 0 }
    };

    const res = mockRes();
    await variantController.updateStatus(req, res);

    assert.equal(res.body.status.code, 200);
  }

  // listGroup default (active only)
  {
    const req = {
      auth: { restaurant_id }
    };

    const res = mockRes();
    await variantController.listGroup(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    // groups g1 and g2; deactivated v2 should be filtered out
    const g1 = res.body.data.find(g => String(g.group_id) === 'g1');
    assert.ok(g1);
    assert.equal(g1.variants.length, 1);
    assert.equal(g1.variants[0].name, 'Spicy-Updated');
  }

  // listGroup all=true
  {
    const req = {
      auth: { restaurant_id },
      query: { all: 'true' }
    };

    const res = mockRes();
    await variantController.listGroup(req, res);

    assert.equal(res.body.status.code, 200);
    const g1 = res.body.data.find(g => String(g.group_id) === 'g1');
    assert.ok(g1);
    assert.equal(g1.variants.length, 2);
  }

  // Delete
  {
    const req = {
      auth: { restaurant_id },
      params: { group_id: 'g1', id: v3Id }
    };

    // should fail because v3 is in g2; keep test focused on success by deleting v3 properly
    // (swap to correct params below)
  }

  {
    const req = {
      auth: { restaurant_id },
      params: { group_id: 'g2', id: v3Id }
    };

    const res = mockRes();
    await variantController.delete(req, res);

    assert.equal(res.body.status.code, 200);
    const after = await Variant.findOne({ restaurant_id, _id: v3Id });
    assert.equal(after, null);
  }
});

test('variant validation errors', async () => {
  const restaurant_id = 'r1';

  // Missing fields
  {
    const req = { auth: { restaurant_id }, body: { name: 'NoGroup' } };
    const res = mockRes();
    await variantController.create(req, res);

    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Validation Error.');
  }

  // Duplicate name for same group
  {
    const v = await Variant.create({ restaurant_id, name: 'Dupe', group_id: 'g1', status: 1, createdAt: new Date(), updatedAt: new Date() });

    const req = {
      auth: { restaurant_id },
      body: { name: 'Dupe', group_id: 'g1' }
    };
    const res = mockRes();
    await variantController.create(req, res);

    assert.equal(res.body.status.code, 409);
  }
});
