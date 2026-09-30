'use strict';

const apiResponse = require('../helpers/apiResponse');
const { generateId } = require('../helpers/offline-db-adapter');
const Addon = require('../models/addon.model');

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeBoolean(v, fallback = true) {
  if (v === undefined || v === null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  return Boolean(v);
}

function toStringOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toNumberOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseJSONArray(value, fallback = []) {
  if (Array.isArray(value)) return value;
  if (value == null) return fallback;
  const str = String(value);
  if (str.trim() === '') return fallback;
  try {
    const parsed = JSON.parse(str);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function matchesSearch(name, searchName) {
  if (!searchName) return true;
  const q = String(searchName).trim();
  if (!q) return true;
  return new RegExp('.*' + escapeRegExp(q) + '.*', 'i').test(String(name || ''));
}

module.exports.create = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const {
      name,
      display_name,
      status,
      showPrice,
      showAttribute,
      limit_type,
      min,
      max,
      values
    } = req.body || {};

    if (!name || !display_name) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'name and display_name are required' }
      ]);
    }

    // Validate limit_type, min, max if provided
    if (limit_type !== undefined && limit_type !== '') {
      if (!['fixed', 'range'].includes(limit_type)) {
        return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
          { msg: 'limit_type must be either fixed or range' }
        ]);
      }
    }

    if (limit_type === 'range') {
      if (min === undefined || min === '' || max === undefined || max === '') {
        return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
          { msg: 'min and max are required for range limit type' }
        ]);
      }
      const minNum = toNumberOrNull(min);
      const maxNum = toNumberOrNull(max);
      if (minNum === null || maxNum === null || minNum < 0 || maxNum < 0 || minNum > maxNum) {
        return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
          { msg: 'min and max must be valid numbers with min <= max' }
        ]);
      }
    }

    const exists = await Addon.findOne({ restaurant_id, name: String(name) });
    if (exists) return apiResponse.ErrorResponse(res, 409, 'Addon Name Already Exist');

    const doc = await Addon.create({
      restaurant_id,
      name: String(name),
      displayname: String(display_name),
      status: Number(status) === 0 ? 0 : 1,
      showPrice: normalizeBoolean(showPrice, false),
      showAttribute: normalizeBoolean(showAttribute, false),
      limit_type: limit_type || '',
      min: toNumberOrNull(min) || 0,
      max: toNumberOrNull(max) || 0,
      values: parseJSONArray(values, []),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return apiResponse.successResponseWithData(res, 200, 'Addon Added Successfully', { _id: doc._id });
  } catch (err) {
    console.error('[offline addon.create]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.list = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const page = req.query && req.query.page ? Number(req.query.page) : 1;
    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const limit = 10;

    const query = {
      restaurant_id,
      name: { $regex: new RegExp('.*' + escapeRegExp(searchName) + '.*', 'i') }
    };

    const result = await Addon.paginate(query, { page, limit, sort: { createdAt: -1 } });

    return apiResponse.successResponseWithData(res, 200, 'addons', result);
  } catch (err) {
    console.error('[offline addon.list]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAll = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';

    const all = await Addon.find({ restaurant_id });
    const filtered = all
      .filter(a => matchesSearch(a.name, searchName))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return apiResponse.successResponseWithData(res, 200, 'addons', filtered);
  } catch (err) {
    console.error('[offline addon.listAll]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.view = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const doc = await Addon.findOne({ restaurant_id, _id: id });
    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    return apiResponse.successResponseWithData(res, 200, 'addon', doc);
  } catch (err) {
    console.error('[offline addon.view]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.update = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const {
      name,
      display_name,
      status,
      showPrice,
      showAttribute,
      limit_type,
      min,
      max,
      values
    } = req.body || {};

    const existing = await Addon.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'Addon not found');

    // Validate limit_type, min, max if provided
    if (limit_type !== undefined && limit_type !== '') {
      if (!['fixed', 'range'].includes(limit_type)) {
        return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
          { msg: 'limit_type must be either fixed or range' }
        ]);
      }
    }

    if (limit_type === 'range') {
      const effectiveMin = min !== undefined ? min : existing.min;
      const effectiveMax = max !== undefined ? max : existing.max;
      if (effectiveMin === undefined || effectiveMin === '' || effectiveMax === undefined || effectiveMax === '') {
        return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
          { msg: 'min and max are required for range limit type' }
        ]);
      }
      const minNum = toNumberOrNull(effectiveMin);
      const maxNum = toNumberOrNull(effectiveMax);
      if (minNum === null || maxNum === null || minNum < 0 || maxNum < 0 || minNum > maxNum) {
        return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
          { msg: 'min and max must be valid numbers with min <= max' }
        ]);
      }
    }

    // Check for name conflict if name is being changed
    if (name && String(name) !== existing.name) {
      const nameConflict = await Addon.findOne({ restaurant_id, name: String(name), _id: { $ne: id } });
      if (nameConflict) return apiResponse.ErrorResponse(res, 409, 'Addon Name Already Exist');
    }

    const update = {};
    if (name !== undefined) update.name = String(name);
    if (display_name !== undefined) update.displayname = String(display_name);
    if (status !== undefined) update.status = Number(status) === 0 ? 0 : 1;
    if (showPrice !== undefined) update.showPrice = normalizeBoolean(showPrice, false);
    if (showAttribute !== undefined) update.showAttribute = normalizeBoolean(showAttribute, false);
    if (limit_type !== undefined) update.limit_type = limit_type;
    if (min !== undefined) update.min = toNumberOrNull(min) || 0;
    if (max !== undefined) update.max = toNumberOrNull(max) || 0;
    if (values !== undefined) update.values = parseJSONArray(values, []);
    update.updatedAt = new Date();

    await Addon.updateOne({ restaurant_id, _id: id }, { $set: update });

    const updated = await Addon.findOne({ restaurant_id, _id: id });
    return apiResponse.successResponseWithData(res, 200, 'Addon Updated Successfully', updated);
  } catch (err) {
    console.error('[offline addon.update]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.delete = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    await Addon.deleteOne({ restaurant_id, _id: id });
    return apiResponse.successResponse(res, 200, 'Addon Deleted Successfully');
  } catch (err) {
    console.error('[offline addon.delete]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.updateStatus = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const status = req.body && req.body.status !== undefined ? (Number(req.body.status) === 0 ? 0 : 1) : 1;

    await Addon.updateOne({ restaurant_id, _id: id }, { $set: { status: status, updatedAt: new Date() } });

    return apiResponse.successResponse(res, 200, 'Addon Status Updated Successfully');
  } catch (err) {
    console.error('[offline addon.updateStatus]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

// Additional methods for addons

module.exports.getAll = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';

    const all = await Addon.find({ restaurant_id });
    const result = all
      .filter(a => matchesSearch(a.name, searchName))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return apiResponse.successResponseWithData(res, 200, 'addons', result);
  } catch (err) {
    console.error('[offline addon.getAll]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.getAvailable = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';

    const all = await Addon.find({ restaurant_id });
    const result = all
      .filter(a => Number(a.status) === 1)
      .filter(a => matchesSearch(a.name, searchName))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return apiResponse.successResponseWithData(res, 200, 'available addons', result);
  } catch (err) {
    console.error('[offline addon.getAvailable]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};