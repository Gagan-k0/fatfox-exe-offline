'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('kitchen_items', {}, {
  modelName: 'kitchen_items',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'order_id' },
    { fieldName: 'status' },
    { fieldName: 'preparedAt' },
    { fieldName: 'createdAt' }
  ]
});