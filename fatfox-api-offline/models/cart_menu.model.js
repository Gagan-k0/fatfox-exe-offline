'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('cart_menus', {}, {
  modelName: 'cart_menus',
  indexes: [
    { fieldName: 'cart_id' },
    { fieldName: 'menuItem_id' },
    { fieldName: 'addon_ids' },
    { fieldName: 'variant_ids' }
  ]
});