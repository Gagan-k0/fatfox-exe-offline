'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('menuItems', {}, {
  modelName: 'menuItems',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'restaurant_id', unique: false },
    { fieldName: 'status', unique: false },
    { fieldName: 'shortcode', unique: false },
    { fieldName: 'categories', unique: false }
  ]
});