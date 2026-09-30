'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('variants', {}, {
  modelName: 'variants',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'restaurant_id', unique: false },
    { fieldName: 'group_id', unique: false },
    { fieldName: 'name', unique: false },
    { fieldName: 'status', unique: false }
  ]
});