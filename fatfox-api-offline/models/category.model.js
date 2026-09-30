'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('categories', {}, {
  modelName: 'category',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'restaurant_id', unique: false },
    { fieldName: 'valuename', unique: false },
    { fieldName: 'displayname', unique: false }
  ]
});
