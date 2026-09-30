'use strict';

const apiResponse = require('../helpers/apiResponse');

async function settingsConfigs(_req, res) {
  return apiResponse.successResponseWithData(res, 200, 'OK', {
    meal_periods: ['breakfast', 'lunch', 'dinner'],
    offline: true
  });
}

module.exports = { settingsConfigs };
