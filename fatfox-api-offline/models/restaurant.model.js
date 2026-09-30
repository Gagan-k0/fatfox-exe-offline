'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('restaurants', {}, {
  modelName: 'restaurants',
  indexes: [
    { fieldName: 'username', unique: true, sparse: true },
    { fieldName: 'restaurant_no', unique: true, sparse: true },
    { fieldName: 'status' }
  ]
});
