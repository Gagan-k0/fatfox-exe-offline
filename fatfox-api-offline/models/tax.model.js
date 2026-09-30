'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('taxes', {}, {
  modelName: 'taxes',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'title' },
    { fieldName: 'display_name' },
    { fieldName: 'status' }
  ]
});
