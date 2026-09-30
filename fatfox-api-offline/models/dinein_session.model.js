'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('dinein_sessions', {}, {
  modelName: 'dinein_sessions',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'table_id' },
    { fieldName: 'status' },
    { fieldName: 'startedAt' },
    { fieldName: 'endedAt' }
  ]
});