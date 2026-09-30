'use strict';

const { expressjwt: jwt } = require('express-jwt');

function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET is missing or too weak');
  }
  return secret;
}

const authenticate = jwt({
  secret: getSecret,
  algorithms: ['HS256']
});

module.exports = authenticate;
