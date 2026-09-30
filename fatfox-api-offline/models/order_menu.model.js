'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('order_menus', {}, {
  modelName: 'order_menus',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'order_id' },
    { fieldName: 'menuItem_id' }
  ]
});