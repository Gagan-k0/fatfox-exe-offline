'use strict';

function safeString(v) {
  if (v === undefined || v === null) return '';
  return String(v);
}

module.exports = { safeString };
