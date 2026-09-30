'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('restaurant_managers', {}, {
  modelName: 'restaurantManager',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'username' }
  ]
});
