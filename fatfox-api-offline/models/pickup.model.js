'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('pickups', {}, {
  modelName: 'pickups',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'status' },
    { fieldName: 'createdAt' },
    { fieldName: 'customer_name' },
    { fieldName: 'pickup_number' }
  ]
});