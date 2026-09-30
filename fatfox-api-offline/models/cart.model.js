'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('carts', {}, {
  modelName: 'carts',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'status' },
    { fieldName: 'createdAt' }
  ]
});