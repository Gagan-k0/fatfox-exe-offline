'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('orders', {}, {
  modelName: 'orders',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'status' },
    { fieldName: 'table_id' },
    { fieldName: 'dinein_session_id' },
    { fieldName: 'createdAt' },
    { fieldName: 'order_number' }
  ]
});