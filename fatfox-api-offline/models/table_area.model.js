'use strict';

const { createOfflineModel } = require('../helpers/offline-db-adapter');

module.exports = createOfflineModel('tableareas', {}, {
  modelName: 'tableareas',
  indexes: [
    { fieldName: 'restaurant_id' },
    { fieldName: 'area_name' },
    { fieldName: 'status' }
  ]
});
