'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('restaurant_staff', {}, {
  modelName: 'restaurantStaff',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'username' }
  ]
});
