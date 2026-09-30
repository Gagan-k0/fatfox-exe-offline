'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fatfox-nedb-'));
process.env.NEDB_DATA_DIR = tmp;
process.env.OFFLINE_MODE = 'true';

const { createOfflineModel, generateId } = require('../helpers/offline-db-adapter');

const Menus = createOfflineModel('menus_test', {}, {
  indexes: [{ fieldName: 'restaurant_id' }]
});

before(async () => {
  await Menus.deleteMany({});
});

test('create + findById round trip', async () => {
  const created = await Menus.create({ name: 'Masala Dosa', restaurant_id: 'r1', status: 1, price: 80 });
  assert.ok(created._id);
  assert.equal(created._id.length, 24);
  const found = await Menus.findById(created._id);
  assert.equal(found.name, 'Masala Dosa');
});

test('find with sort/limit', async () => {
  await Menus.deleteMany({});
  await Menus.insertMany([
    { name: 'A', restaurant_id: 'r1', status: 1, price: 10 },
    { name: 'B', restaurant_id: 'r1', status: 1, price: 20 },
    { name: 'C', restaurant_id: 'r2', status: 1, price: 30 }
  ]);
  const rows = await Menus.find({ restaurant_id: 'r1', status: 1 }).sort({ price: -1 }).limit(1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'B');
});

test('$inc via findOneAndUpdate', async () => {
  const doc = await Menus.create({ name: 'Counter', restaurant_id: 'r1', seq: 0 });
  const updated = await Menus.findOneAndUpdate({ _id: doc._id }, { $inc: { seq: 1 } }, { new: true });
  assert.equal(updated.seq, 1);
});

test('aggregate $match + $group + $sum', async () => {
  await Menus.deleteMany({});
  await Menus.insertMany([
    { restaurant_id: 'r1', amount: 100, status: 1 },
    { restaurant_id: 'r1', amount: 50, status: 1 },
    { restaurant_id: 'r1', amount: 9, status: 0 }
  ]);
  const rows = await Menus.aggregate([
    { $match: { restaurant_id: 'r1', status: 1 } },
    { $group: { _id: '$restaurant_id', total: { $sum: '$amount' }, count: { $sum: 1 } } }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total, 150);
  assert.equal(rows[0].count, 2);
});

test('generateId is 24 hex chars', () => {
  const id = generateId();
  assert.match(id, /^[a-f0-9]{24}$/);
});
