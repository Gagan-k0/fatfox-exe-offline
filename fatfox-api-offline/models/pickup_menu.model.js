'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('pickup_menus', {}, {
  modelName: 'pickup_menus',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'pickup_id' },
    { fieldName: 'menuItem_id' }
  ]
});