'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('tables', {}, {
  modelName: 'tables',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'area_id' },
    { fieldName: 'table_number' },
    { fieldName: 'status' },
    { fieldName: 'area_id', unique: false },
    { fieldName: 'table_number', unique: false }
  ]
});