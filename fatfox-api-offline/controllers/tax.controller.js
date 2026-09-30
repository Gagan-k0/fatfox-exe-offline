'use strict';

const apiResponse = require('../helpers/apiResponse');
const Tax = require('../models/tax.model');

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

function normalizeAreaType(areaTypes) {
  return Array.isArray(areaTypes) ? areaTypes.map(String) : [];
}

function normalizeAreas(areas) {
  return Array.isArray(areas) ? areas.map(String) : [];
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function truthyNumber(v) {
  return typeof v === 'number' ? v : Number(v);
}

module.exports.create = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const {
      tax_type,
      title,
      display_name,
      value_type,
      value_amount,
      description,
      status
    } = req.body || {};

    const areas = normalizeAreas(parseJSONArray(req.body && req.body.areas, []));
    const area_type = normalizeAreaType(parseJSONArray(req.body && req.body.area_type, []));

    const hasAll =
      tax_type && title && display_name && value_type &&
      value_amount != null && description &&
      typeof status !== 'undefined';

    if (!hasAll) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'Missing required tax fields.' }
      ]);
    }

    const dineinSelected = area_type.includes('dinein');
    if (dineinSelected && areas.length === 0) {
      return apiResponse.ErrorResponse(res, 409, 'Select Dine-In Areas');
    }
    if (!dineinSelected && areas.length > 0) {
      return apiResponse.ErrorResponse(res, 409, 'Select Dine-In to Set Areas');
    }

    const exists = await Tax.findOne({ restaurant_id, title: String(title) });
    if (exists) return apiResponse.ErrorResponse(res, 409, 'Tax already exist');

    const doc = await Tax.create({
      restaurant_id,
      tax_type: String(tax_type),
      title: String(title),
      display_name: String(display_name),
      value_type: String(value_type),
      areas,
      value_amount: String(value_amount),
      description: String(description),
      area_type,
      status: truthyNumber(status)
    });

    return apiResponse.successResponseWithData(res, 200, 'Tax Added Successfully', { _id: doc._id });
  } catch (err) {
    console.error('[offline tax.create]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.list = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const page = req.query && req.query.page ? Number(req.query.page) : 1;
    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const regex = searchName ? new RegExp('.*' + escapeRegExp(searchName) + '.*', 'i') : /.*/i;

    const result = await Tax.paginate(
      { restaurant_id, title: { $regex: regex } },
      { page, limit: 10, sort: { createdAt: -1 } }
    );

    return apiResponse.successResponseWithData(res, 200, 'taxes', result);
  } catch (err) {
    console.error('[offline tax.list]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.view = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const doc = await Tax.findOne({ restaurant_id, _id: id });
    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    return apiResponse.successResponseWithData(res, 200, 'tax', doc);
  } catch (err) {
    console.error('[offline tax.view]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.update = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const {
      tax_type,
      title,
      display_name,
      value_type,
      value_amount,
      description,
      status
    } = req.body || {};

    const areas = normalizeAreas(parseJSONArray(req.body && req.body.areas, []));
    const area_type = normalizeAreaType(parseJSONArray(req.body && req.body.area_type, []));

    const hasAll =
      tax_type && title && display_name && value_type &&
      value_amount != null && description &&
      typeof status !== 'undefined';

    if (!hasAll) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'Missing required tax fields.' }
      ]);
    }

    const existing = await Tax.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    const dineinSelected = area_type.includes('dinein');
    if (dineinSelected && areas.length === 0) {
      return apiResponse.ErrorResponse(res, 409, 'Select Dine-In Areas');
    }
    if (!dineinSelected && areas.length > 0) {
      return apiResponse.ErrorResponse(res, 409, 'Select Dine-In to Set Areas');
    }

    const conflict = await Tax.findOne({
      restaurant_id,
      title: String(title),
      _id: { $ne: id }
    });
    if (conflict) return apiResponse.ErrorResponse(res, 409, 'Tax already exist');

    await Tax.updateOne(
      { restaurant_id, _id: id },
      {
        $set: {
          tax_type: String(tax_type),
          title: String(title),
          display_name: String(display_name),
          value_type: String(value_type),
          areas,
          value_amount: String(value_amount),
          description: String(description),
          area_type,
          status: truthyNumber(status)
        }
      }
    );

    const updated = await Tax.findOne({ restaurant_id, _id: id });
    return apiResponse.successResponseWithData(res, 200, 'Tax Updated Successfully', updated);
  } catch (err) {
    console.error('[offline tax.update]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.delete = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    await Tax.deleteOne({ restaurant_id, _id: id });
    return apiResponse.successResponseWithData(res, 200, 'Deleted', { _id: id });
  } catch (err) {
    console.error('[offline tax.delete]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

/**
 * Used by frontend cart reconciliation.
 * GET /restaurant/tax/settax?areaId=...&area_type=delivery|pickup|dinein
 */
module.exports.setTax = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const area_type = String(req.query && req.query.area_type ? req.query.area_type : '').trim();
    const areaId = String(req.query && req.query.areaId ? req.query.areaId : '').trim();

    if (!area_type) {
      return apiResponse.successResponseWithData(res, 200, 'tax', []);
    }

    const docs = await Tax.find({ restaurant_id, status: 1 }).sort({ createdAt: -1 });

    const filteredByOrderType = docs.filter((t) => Array.isArray(t.area_type) && t.area_type.includes(area_type));

    let filtered = filteredByOrderType;
    if (area_type === 'dinein' && areaId) {
      filtered = filteredByOrderType.filter((t) => {
        const areas = Array.isArray(t.areas) ? t.areas : [];
        // areas: [] means "all dine-in areas" in this offline model.
        if (areas.length === 0) return true;
        return areas.includes(areaId);
      });
    }

    const result = filtered.map((t) => ({
      _id: t._id,
      tax_type: t.tax_type,
      name: t.display_name,
      value_type: t.value_type,
      value_amount: t.value_amount,
      status: t.status
    }));

    return apiResponse.successResponseWithData(res, 200, 'tax', result);
  } catch (err) {
    console.error('[offline tax.setTax]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};
