'use strict';

/**
 * First-launch seed: one restaurant, one admin user, default GST brackets,
 * payment modes, kitchen department, and order counter.
 */

const bcrypt = require('bcryptjs');
const Restaurant = require('../models/restaurant.model');
const Counter = require('../models/counter.model');
const { createOfflineModel } = require('./offline-db-adapter');

const Tax = createOfflineModel('taxes', {}, { modelName: 'taxes' });
const KitchenDepartment = createOfflineModel('kitchen_departments', {}, { modelName: 'kitchen_departments' });

const DEFAULT_PIN = process.env.OFFLINE_DEFAULT_PIN || '1234';
const DEFAULT_USERNAME = process.env.OFFLINE_DEFAULT_USERNAME || 'admin';

async function seedRestaurant(restaurantId) {
  // Taxes
  const gstPercentages = [5, 12, 18, 28];
  for (const pct of gstPercentages) {
    const title = `GST ${pct}%`;
    const found = await Tax.findOne({ restaurant_id: restaurantId, title });
    if (found) continue;
    await Tax.create({
      restaurant_id: restaurantId,
      tax_type: 'FORWARD',
      title,
      display_name: title,
      value_type: 'PERCENTAGE',
      areas: [],
      value_amount: String(pct),
      description: 'Default GST component',
      area_type: ['delivery', 'pickup', 'dinein'],
      status: 1
    });
  }

  // Kitchen department
  const dept = await KitchenDepartment.findOne({ restaurant_id: restaurantId, name: 'GENERAL' });
  if (!dept) {
    await KitchenDepartment.create({
      restaurant_id: restaurantId,
      name: 'GENERAL',
      status: 1
    });
  }

  // Counters
  await Counter.findOneAndUpdate(
    { _id: `pickup:${restaurantId}` },
    { $set: { seq: 0 } },
    { upsert: true, new: true }
  );
  await Counter.findOneAndUpdate(
    { _id: `order:${restaurantId}` },
    { $set: { seq: 0 } },
    { upsert: true, new: true }
  );
}

async function ensureSeed() {
  const existing = await Restaurant.findOne(); // any restaurant
  if (existing) return { seeded: false, restaurant: existing };

  const pinHash = bcrypt.hashSync(DEFAULT_PIN, 10);
  const restaurant = await Restaurant.create({
    restaurant_no: 'OFFLINE-001',
    name: 'FatFox Offline',
    owner_name: 'Owner',
    username: DEFAULT_USERNAME,
    password: pinHash,
    pin_hash: pinHash,
    status: 1,
    restaurant_type: 'NONE',
    description: 'Local offline restaurant',
    address: {
      line1: '',
      city: '',
      state: '',
      pincode: '',
      country: 'India'
    },
    location: {
      type: 'Point',
      coordinates: [0, 0],
      city: ''
    },
    gstin: '',
    phone: '',
    offline: true
  });

  await seedRestaurant(restaurant._id);

  console.log(`[offline-api] Seeded default restaurant. Username: ${DEFAULT_USERNAME}  PIN: ${DEFAULT_PIN}`);
  return { seeded: true, restaurant };
}

module.exports = { ensureSeed, seedRestaurant, DEFAULT_PIN, DEFAULT_USERNAME };