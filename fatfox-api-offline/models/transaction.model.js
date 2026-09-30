'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('transactions', {}, {
  modelName: 'transactions',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'status' },
    { fieldName: 'createdAt' },
    { fieldName: 'type' },
    { fieldName: 'reference_id' }
  ]
});