'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-table-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const Table = require('../models/table.model');
const TableArea = require('../models/table_area.model');
const tableController = require('../controllers/table.controller');

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
  await Table.deleteMany({});
  await TableArea.deleteMany({});
});

test.after(async () => {
  await Table.deleteMany({});
  await TableArea.deleteMany({});
});

test('table CRUD + available + combinations happy path', async () => {
  const restaurant_id = 'r1';

  // Create an area first
  let areaId;
  {
    const area = await TableArea.create({
      restaurant_id,
      area_name: 'Main Hall',
      status: 1,
      is_reservation_enabled: true,
      price_surge_type: 'percentage',
      price_surge_value: 10,
      is_ac_taxable: true
    });
    areaId = area._id;
  }

  // Create table via controller
  let tableId;
  {
    const req = {
      auth: { restaurant_id },
      params: { area_id: areaId },
      body: {
        table_number: 'T1',
        no_of_people: 4,
        status: 1,
        combinable: true,
        combinable_table_ids: []
      }
    };

    const res = mockRes();
    await tableController.createTable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data && Array.isArray(res.body.data));
    assert.ok(res.body.data[0]._id);
    tableId = res.body.data[0]._id;
  }

  // Create second table (for combinations)
  let tableId2;
  {
    const req = {
      auth: { restaurant_id },
      params: { area_id: areaId },
      body: {
        table_number: 'T2',
        no_of_people: 4,
        status: 1,
        combinable: true,
        combinable_table_ids: []
      }
    };

    const res = mockRes();
    await tableController.createTable(req, res);

    assert.equal(res.body.status.code, 200);
    tableId2 = res.body.data[0]._id;
  }

  // List (paginate)
  {
    const req = {
      auth: { restaurant_id },
      query: { page: '1', searchNumber: 'T1' }
    };
    const res = mockRes();
    await tableController.listTable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data.docs.length, 1);
    assert.equal(res.body.data.docs[0].table_number, 'T1');
  }

  // List All (with status filter)
  {
    const req = {
      auth: { restaurant_id },
      query: { searchNumber: '', searchStatus: 'BLANK' }
    };
    const res = mockRes();
    await tableController.listAllTable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 2);
  }

  // List All Available (no cart_id)
  {
    const req = {
      auth: { restaurant_id },
      query: { searchNumber: '' }
    };
    const res = mockRes();
    await tableController.listAllAvaliableTable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 2);
  }

  // List All Available By Area
  {
    const req = {
      auth: { restaurant_id },
      query: { areaId: areaId, searchNumber: '', party_size: '4' }
    };
    const res = mockRes();
    await tableController.listAllAvaliableTableByArea(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(res.body.data.tables);
    assert.equal(res.body.data.tables.length, 2);
    assert.ok(res.body.data.combinations);
    // Should have combinations for party_size 4 (two tables of 4 each can combine to 8)
    assert.ok(res.body.data.combinations.length >= 2);
  }

  // List All Table By Area
  {
    const req = {
      auth: { restaurant_id },
      query: { areaId: areaId, searchNumber: '' }
    };
    const res = mockRes();
    await tableController.listAllTableByArea(req, res);

    assert.equal(res.body.status.code, 200);
    assert.ok(Array.isArray(res.body.data));
    assert.equal(res.body.data.length, 2);
  }

  // View
  {
    const req = { auth: { restaurant_id }, params: { id: tableId } };
    const res = mockRes();
    await tableController.viewTable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.data._id, tableId);
    assert.equal(res.body.data.table_number, 'T1');
    assert.equal(res.body.data.no_of_people, 4);
    assert.equal(res.body.data.combinable, true);
  }

  // Update
  {
    const req = {
      auth: { restaurant_id },
      params: { id: tableId },
      body: {
        table_number: 'T1-UPDATED',
        no_of_people: 6,
        status: 1,
        note: 'Updated note',
        combinable: true,
        combinable_table_ids: [tableId2],
        is_reservation_enabled: false
      }
    };

    const res = mockRes();
    await tableController.updateTable(req, res);

    assert.equal(res.body.status.code, 200);

    // Verify update
    const req2 = { auth: { restaurant_id }, params: { id: tableId } };
    const res2 = mockRes();
    await tableController.viewTable(req2, res2);

    assert.equal(res2.body.status.code, 200);
    assert.equal(res2.body.data.table_number, 'T1-UPDATED');
    assert.equal(res2.body.data.no_of_people, 6);
    assert.equal(res2.body.data.note, 'Updated note');
    assert.equal(res2.body.data.is_reservation_enabled, false);
    assert.ok(res2.body.data.combinable_table_ids.includes(tableId2));
  }

  // Verify symmetric combination was added
  {
    const req = { auth: { restaurant_id }, params: { id: tableId2 } };
    const res = mockRes();
    await tableController.viewTable(req, res);

    assert.equal(res.body.status.code, 200);
    // tableId2 should now have tableId in its combinable_table_ids
    assert.ok(res.body.data.combinable_table_ids.includes(tableId));
  }

  // Delete
  {
    const req = { auth: { restaurant_id }, params: { id: tableId } };
    const res = mockRes();
    await tableController.deleteTable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'Table Deleted Successfully');

    const after = await Table.findOne({ restaurant_id, _id: tableId });
    assert.equal(after, null);
  }

  // Delete second table
  {
    const req = { auth: { restaurant_id }, params: { id: tableId2 } };
    const res = mockRes();
    await tableController.deleteTable(req, res);

    assert.equal(res.body.status.code, 200);
    assert.equal(res.body.status.message, 'Table Deleted Successfully');

    const after = await Table.findOne({ restaurant_id, _id: tableId2 });
    assert.equal(after, null);
  }
});

test('table validation errors', async () => {
  const restaurant_id = 'r1';

  // Create an area
  let areaId;
  {
    const area = await TableArea.create({
      restaurant_id,
      area_name: 'Test Area',
      status: 1
    });
    areaId = area._id;
  }

  // Missing table_number
  {
    const req = {
      auth: { restaurant_id },
      params: { area_id: areaId },
      body: { no_of_people: 4 }
    };
    const res = mockRes();
    await tableController.createTable(req, res);
    assert.equal(res.body.status.code, 422);
  }

  // Duplicate table_number
  {
    const req1 = {
      auth: { restaurant_id },
      params: { area_id: areaId },
      body: { table_number: 'DUP', no_of_people: 4 }
    };
    const res1 = mockRes();
    await tableController.createTable(req1, res1);
    assert.equal(res1.body.status.code, 200);

    const req2 = {
      auth: { restaurant_id },
      params: { area_id: areaId },
      body: { table_number: 'DUP', no_of_people: 4 }
    };
    const res2 = mockRes();
    await tableController.createTable(req2, res2);
    assert.equal(res2.body.status.code, 409);
  }

  // Update with missing table_number
  {
    const existing = await Table.findOne({ restaurant_id, table_number: 'DUP' });
    const req = {
      auth: { restaurant_id },
      params: { id: existing._id },
      body: { no_of_people: 4 }
    };
    const res = mockRes();
    await tableController.updateTable(req, res);
    assert.equal(res.body.status.code, 422);
  }

  // Update with self-combination
  {
    const existing = await Table.findOne({ restaurant_id, table_number: 'DUP' });
    const req = {
      auth: { restaurant_id },
      params: { id: existing._id },
      body: {
        table_number: 'DUP',
        no_of_people: 4,
        combinable: true,
        combinable_table_ids: [existing._id]
      }
    };
    const res = mockRes();
    await tableController.updateTable(req, res);
    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Table cannot combine with itself.');
  }

  // Update with cross-area combination
  {
    const area2 = await TableArea.create({
      restaurant_id,
      area_name: 'Area 2',
      status: 1
    });
    const tableInArea2 = await Table.create({
      restaurant_id,
      area_id: area2._id,
      table_number: 'T-AREA2',
      no_of_people: 4,
      status: 1
    });

    const existing = await Table.findOne({ restaurant_id, table_number: 'DUP' });
    const req = {
      auth: { restaurant_id },
      params: { id: existing._id },
      body: {
        table_number: 'DUP',
        no_of_people: 4,
        combinable: true,
        combinable_table_ids: [tableInArea2._id]
      }
    };
    const res = mockRes();
    await tableController.updateTable(req, res);
    assert.equal(res.body.status.code, 422);
    assert.equal(res.body.status.message, 'Selected tables must be in the same area.');
  }

  // Delete occupied table should fail
  {
    const area = await TableArea.create({
      restaurant_id,
      area_name: 'Occupied Area',
      status: 1
    });
    const occupiedTable = await Table.create({
      restaurant_id,
      area_id: area._id,
      table_number: 'OCCUPIED',
      no_of_people: 4,
      status: 1,
      cart_id: 'cart-123'
    });

    const req = { auth: { restaurant_id }, params: { id: occupiedTable._id } };
    const res = mockRes();
    await tableController.deleteTable(req, res);
    assert.equal(res.body.status.code, 409);
    assert.equal(res.body.status.message, 'Table is occupied, cannot delete');
  }
});