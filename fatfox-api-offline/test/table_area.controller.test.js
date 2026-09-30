'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-table-area-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const TableArea = require('../models/table_area.model');
const Table = require('../models/table.model');
const tableAreaController = require('../controllers/table_area.controller');

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
  await TableArea.deleteMany({});
  await Table.deleteMany({});
});

test.after(async () => {
  await TableArea.deleteMany({});
  await Table.deleteMany({});
});

test('table area CRUD + available happy path', async () => {
  const restaurant_id = 'r1';

  // Create
  let areaId;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        area_name: 'Main Hall',
        status: 1,
        is_reservation_enabled: true,
        price_surge_type: 'percentage',
        price_surge_value: 10,
        is_ac_taxable: true
      }
    };

    const res = mockRes();
    await tableAreaController.createArea(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data && Array.isArray(res.body.data));
    assert.ok(res.body.data[0]._id);
    areaId = res.body.data[0]._id;
  }

  // List (paginate)
  {
    const req = {
      auth: { restaurant_id },
      query: { page: '1', searchName: 'Main' }
    };
    const res = mockRes();
    await tableAreaController.listArea(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    assert.equal(res.body.data.docs[0].area_name, 'Main Hall');
  }

  // List All (no pagination)
  {
    const req = {
      auth: { restaurant_id },
      query: { searchName: '' }
    };
    const res = mockRes();
    await tableAreaController.listAllArea(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
  }

  // List All Available (status = 1)
  {
    const req = {
      auth: { restaurant_id },
      query: { searchName: '' }
    };
    const res = mockRes();
    await tableAreaController.listAllAvaliableArea(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].status, 1);
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: areaId } };
    const res = mockRes();
    await tableAreaController.viewArea(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data && Array.isArray(res.body.data));
    assert.equal(res.body.data[0]._id, areaId);
    assert.equal(res.body.data[0].area_name, 'Main Hall');
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: areaId },
      body: {
        area_name: 'Updated Hall',
        status: 1,
        price_surge_type: 'flat',
        price_surge_value: 15,
        is_ac_taxable: false,
        is_reservation_enabled: false
      }
    };

    const res = mockRes();
    await tableAreaController.updateArea(req, res);

    assert.equal(res.body.status.code, 200);

    // Verify update
    const req2 = { auth: { restaurant_id }, params: { id: areaId } };
    const res2 = mockRes();
    await tableAreaController.viewArea(req2, res2);

    assert.equal(res2.body.status.code, 200);
    assert.equal(res2.body.data[0].area_name, 'Updated Hall');
    assert.equal(res2.body.data[0].price_surge_type, 'flat');
    assert.equal(res2.body.data[0].price_surge_value, 15);
    assert.equal(res2.body.data[0].is_ac_taxable, false);
    assert.equal(res2.body.data[0].is_reservation_enabled, false);
  }

  // Create second area for listTablesForAllTheAreas
  let areaId2;
  {
    const req = {
      auth: { restaurant_id },
      body: {
        area_name: 'VIP Lounge',
        status: 1,
        is_reservation_enabled: true,
        price_surge_type: 'percentage',
        price_surge_value: 20,
        is_ac_taxable: true
      }
    };

    const res = mockRes();
    await tableAreaController.createArea(req, res);

    assert.equal(res.body.status.code, 200);
    areaId2 = res.body.data[0]._id;
  }

  // Create tables for the areas
  let tableId1, tableId2;
  {
    // Create table in area 1
    const req1 = {
      auth: { restaurant_id },
      body: {
        table_number: 'T1',
        no_of_people: 4,
        status: 1,
        combinable: true,
        combinable_table_ids: []
      }
    };
    // Manually create via model since controller requires area_id param
    const t1 = await Table.create({
      restaurant_id,
      area_id: areaId,
      table_number: 'T1',
      no_of_people: 4,
      status: 1,
      combinable: true,
      combinable_table_ids: [],
      cart_id: null,
      reorder_status: 0
    });
    tableId1 = t1._id;

    // Create table in area 2
    const t2 = await Table.create({
      restaurant_id,
      area_id: areaId2,
      table_number: 'T2',
      no_of_people: 2,
      status: 1,
      combinable: false,
      combinable_table_ids: [],
      cart_id: null,
      reorder_status: 0
    });
    tableId2 = t2._id;
  }

  // List tables for the area
  {
    const req = { auth: { restaurant_id }, params: { id: areaId } };
    const res = mockRes();
    await tableAreaController.listTablesForTheArea(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].table_number, 'T1');
  }

  // List tables for all areas
  {
    const req = { auth: { restaurant_id }, query: { page: '1', searchName: '' } };
    const res = mockRes();
    await tableAreaController.listTablesForAllTheAreas(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data.docs);
    assert.equal(res.body.data.docs.length, 2);
    assert.ok(res.body.data.docs[0].tablesData);
    assert.ok(res.body.data.docs[1].tablesData);
  }

  // Delete area with tables should fail
  {
    const req = { auth: { restaurant_id }, params: { id: areaId } };
    const res = mockRes();
    await tableAreaController.deleteArea(req, res);

    assert.equal(res.body.status.code, 409);
    assert.equal(res.body.status.message, 'Area can not be deleted because table exists');
  }

  // Delete table first, then delete area
  {
    await Table.deleteOne({ restaurant_id, _id: tableId1 });

    const req = { auth: { restaurant_id }, params: { id: areaId } };
    const res = mockRes();
    await tableAreaController.deleteArea(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'Area Deleted Successfully');

    const after = await TableArea.findOne({ restaurant_id, _id: areaId });
    assert.equal(after, null);
  }
});