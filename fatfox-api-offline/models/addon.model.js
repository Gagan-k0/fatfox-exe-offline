'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('addons', {}, {
  modelName: 'addons',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'restaurant_id', unique: false },
    { fieldName: 'name', unique: false },
    { fieldName: 'displayname', unique: false },
    { fieldName: 'status', unique: false }
  ]
});