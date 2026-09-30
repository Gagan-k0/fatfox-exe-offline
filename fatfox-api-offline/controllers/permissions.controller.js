'use strict';

const apiResponse = require('../helpers/apiResponse');

async function getPermission(req, res) {
  // Minimal permission matrix for offline UI.
  // The Angular UI expects: data.status.message.permissions and usertype.
  // We'll grant full menumgmt capabilities.
  const usertype = (req.auth && req.auth.usertype) || (req.auth && req.auth.usertype === 0 ? 'admin' : 'admin');

  return apiResponse.successResponseWithData(res, 200, 'OK', {
    usertype: usertype,
    permissions: [
      'global',
      'dashboard',
      'dinein',
      'pickup',
      'pickup_operator',
      'menumgmt',
      'menuitems',
      'categories',
      'variants',
      'addons',
      'tables',
      'taxes',
      'discounts',
      'kitchen',
      'support'
    ]
  });
}

module.exports = { getPermission };
