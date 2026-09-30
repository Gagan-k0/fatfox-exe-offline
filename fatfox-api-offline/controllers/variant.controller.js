'use strict';

const apiResponse = require('../helpers/apiResponse');
const { generateId } = require('../helpers/offline-db-adapter');
const Variant = require('../models/variant.model');

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

    const { name, group_id } = req.body || {};

    if (!name || !group_id) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'name and group_id are required' }
      ]);
    }

    const exists = await Variant.findOne({ restaurant_id, name: String(name), group_id: String(group_id) });
    if (exists) return apiResponse.ErrorResponse(res, 409, 'Variant already exists for this group');

    const doc = await Variant.create({
      restaurant_id,
      name: String(name),
      group_id: String(group_id),
      status: 1
    });

    return apiResponse.successResponseWithData(res, 200, 'Variant Added Successfully', { _id: doc._id });
  } catch (err) {
    console.error('[offline variant.create]', err);
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

    const result = await Variant.paginate(query, { page, limit, sort: { createdAt: -1 } });

    return apiResponse.successResponseWithData(res, 200, 'variants', result);
  } catch (err) {
    console.error('[offline variant.list]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAll = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';

    const all = await Variant.find({ restaurant_id });
    const filtered = all
      .filter(v => matchesSearch(v.name, searchName))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return apiResponse.successResponseWithData(res, 200, 'variants', filtered);
  } catch (err) {
    console.error('[offline variant.listAll]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.view = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const doc = await Variant.findOne({ restaurant_id, _id: id });
    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    return apiResponse.successResponseWithData(res, 200, 'variant', doc);
  } catch (err) {
    console.error('[offline variant.view]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.update = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const { name, group_id, status } = req.body || {};

    const existing = await Variant.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'Variant not found');

    // Check for duplicate name in same group if name or group_id is changing
    const newName = name !== undefined ? String(name) : existing.name;
    const newGroupId = group_id !== undefined ? String(group_id) : existing.group_id;
    if ((name !== undefined && String(name) !== existing.name) ||
        (group_id !== undefined && String(group_id) !== existing.group_id)) {
      const duplicate = await Variant.findOne({
        restaurant_id,
        name: newName,
        group_id: newGroupId,
        _id: { $ne: id }
      });
      if (duplicate) return apiResponse.ErrorResponse(res, 409, 'Variant already exists for this group');
    }

    const update = {};
    if (name !== undefined) update.name = String(name);
    if (group_id !== undefined) update.group_id = String(group_id);
    if (status !== undefined) update.status = Number(status) === 0 ? 0 : 1;
    update.updatedAt = new Date();

    await Variant.updateOne({ restaurant_id, _id: id }, { $set: update });

    const updated = await Variant.findOne({ restaurant_id, _id: id });
    return apiResponse.successResponseWithData(res, 200, 'Variant Updated Successfully', updated);
  } catch (err) {
    console.error('[offline variant.update]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.delete = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const group_id = req.params && req.params.group_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !group_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const existing = await Variant.findOne({ restaurant_id, _id: id, group_id: String(group_id) });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'Variant not found');

    await Variant.deleteOne({ restaurant_id, _id: id });
    return apiResponse.successResponse(res, 200, 'Variant Deleted Successfully');
  } catch (err) {
    console.error('[offline variant.delete]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.updateStatus = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const status = req.body && req.body.status !== undefined ? (Number(req.body.status) === 0 ? 0 : 1) : 1;

    await Variant.updateOne({ restaurant_id, _id: id }, { $set: { status: status, updatedAt: new Date() } });

    return apiResponse.successResponse(res, 200, 'Variant Status Updated Successfully');
  } catch (err) {
    console.error('[offline variant.updateStatus]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

// For variant group listing
module.exports.listGroup = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const all = req.query && req.query.all === 'true';

    const match = { restaurant_id };
    if (!all) {
      match.status = 1;
    }

    const variants = await Variant.find(match);
    const groupsMap = new Map();
    for (const v of variants) {
      const gid = String(v.group_id);
      if (!groupsMap.has(gid)) {
        groupsMap.set(gid, {
          group_id: gid,
          variants: []
        });
      }
      groupsMap.get(gid).variants.push({
        _id: v._id,
        name: v.name,
        status: v.status
      });
    }

    const groups = Array.from(groupsMap.values()).sort((a, b) =>
      String(a.group_id).localeCompare(String(b.group_id))
    );

    return apiResponse.successResponseWithData(res, 200, 'variant groups', groups);
  } catch (err) {
    console.error('[offline variant.listGroup]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};