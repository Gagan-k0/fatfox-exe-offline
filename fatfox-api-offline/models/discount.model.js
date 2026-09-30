'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('discounts', {}, {
  modelName: 'discounts',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'restaurant_id', unique: false },
    { fieldName: 'title', unique: false },
    { fieldName: 'code', unique: false },
    { fieldName: 'status', unique: false }
  ]
});
