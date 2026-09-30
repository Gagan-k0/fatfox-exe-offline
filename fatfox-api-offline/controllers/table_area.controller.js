'use strict';

const apiResponse = require('../helpers/apiResponse');
const TableArea = require('../models/table_area.model');
const Table = require('../models/table.model');

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function toStringOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
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

function parseAreaPayload(body) {
  if (Array.isArray(body && body.area)) return body.area;
  if (body && body.area && typeof body.area === 'object') return [body.area];
  if (body && body.area_name) return [body];
  return [];
}

function shapeArea(doc) {
  if (!doc) return null;
  return {
    _id: doc._id,
    area_name: doc.area_name,
    status: Number(doc.status) === 0 ? 0 : 1,
    is_reservation_enabled: doc.is_reservation_enabled !== false,
    price_surge_type: doc.price_surge_type || 'percentage',
    price_surge_value: Number(doc.price_surge_value) || 0,
    is_ac_taxable: doc.is_ac_taxable !== false,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt
  };
}

function paginateArray(items, page, limit) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.max(1, Number(limit) || 10);
  const totalDocs = items.length;
  const totalPages = Math.ceil(totalDocs / l) || 1;
  const skip = (p - 1) * l;
  const docs = items.slice(skip, skip + l);
  return {
    docs,
    totalDocs,
    limit: l,
    page: p,
    totalPages,
    hasNextPage: p < totalPages,
    hasPrevPage: p > 1,
    nextPage: p < totalPages ? p + 1 : null,
    prevPage: p > 1 ? p - 1 : null,
    pagingCounter: totalDocs === 0 ? 0 : skip + 1
  };
}

function matchesSearch(name, searchName) {
  if (!searchName) return true;
  const q = String(searchName).trim();
  if (!q) return true;
  return new RegExp('.*' + escapeRegExp(q) + '.*', 'i').test(String(name || ''));
}

module.exports.createArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const areas = parseAreaPayload(req.body);
    if (!areas.length) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'area is required' }
      ]);
    }

    const names = areas.map((a) => String(a.area_name || '').trim());
    if (names.some((n) => !n)) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'area_name must be specified.' }
      ]);
    }

    const seen = new Set();
    for (const name of names) {
      const key = name.toLowerCase();
      if (seen.has(key)) {
        return apiResponse.ErrorResponse(res, 409, 'area already exists in this restaurant');
      }
      seen.add(key);
      const exists = await TableArea.findOne({ restaurant_id, area_name: name });
      if (exists) {
        return apiResponse.ErrorResponse(res, 409, 'Area Name Already Exists In This Restaurant');
      }
    }

    const created = [];
    for (const area of areas) {
      const doc = await TableArea.create({
        restaurant_id,
        area_name: String(area.area_name).trim(),
        status: Number(area.status) === 0 ? 0 : 1,
        is_reservation_enabled: normalizeBoolean(area.is_reservation_enabled, true),
        price_surge_type: area.price_surge_type === 'flat' ? 'flat' : 'percentage',
        price_surge_value: Number(area.price_surge_value) || 0,
        is_ac_taxable: normalizeBoolean(area.is_ac_taxable, true)
      });
      created.push(shapeArea(doc));
    }

    return apiResponse.successResponseWithData(res, 200, 'Area Added Successfully', created);
  } catch (err) {
    console.error('[offline table_area.createArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const page = req.query && req.query.page ? req.query.page : 1;

    const all = await TableArea.find({ restaurant_id });
    const filtered = all
      .map(shapeArea)
      .filter((a) => a.status === 1 && matchesSearch(a.area_name, searchName))
      .sort((a, b) => String(b._id).localeCompare(String(a._id)));

    return apiResponse.successResponseWithData(res, 200, 'areas list displayed', paginateArray(filtered, page, 10));
  } catch (err) {
    console.error('[offline table_area.listArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAllAvaliableArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const all = await TableArea.find({ restaurant_id });
    const result = all
      .map(shapeArea)
      .filter((a) => a.status === 1 && matchesSearch(a.area_name, searchName))
      .sort((a, b) => String(a.area_name).localeCompare(String(b.area_name)));

    return apiResponse.successResponseWithData(res, 200, 'areas list displayed', result);
  } catch (err) {
    console.error('[offline table_area.listAllAvaliableArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAllArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const all = await TableArea.find({ restaurant_id });
    const result = all
      .map(shapeArea)
      .filter((a) => matchesSearch(a.area_name, searchName))
      .sort((a, b) => String(a.area_name).localeCompare(String(b.area_name)));

    return apiResponse.successResponseWithData(res, 200, 'areas list displayed', result);
  } catch (err) {
    console.error('[offline table_area.listAllArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.viewArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 500, 'invalid_id');

    const doc = await TableArea.findOne({ restaurant_id, _id: id });
    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    return apiResponse.successResponseWithData(res, 200, 'table area is displayed', [shapeArea(doc)]);
  } catch (err) {
    console.error('[offline table_area.viewArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.updateArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 500, 'invalid_id');

    const area_name = toStringOrNull(req.body && req.body.area_name);
    if (!area_name) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'table area name must be specified.' }
      ]);
    }

    const existing = await TableArea.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    const conflict = await TableArea.findOne({ restaurant_id, area_name, _id: { $ne: id } });
    if (conflict) return apiResponse.ErrorResponse(res, 409, 'Area Name Already Exists In This Restaurant');

    const set = {
      area_name,
      status: Number(req.body.status) === 0 ? 0 : 1
    };
    if (req.body.price_surge_type !== undefined) {
      set.price_surge_type = req.body.price_surge_type === 'flat' ? 'flat' : 'percentage';
    }
    if (req.body.price_surge_value !== undefined) {
      set.price_surge_value = Number(req.body.price_surge_value) || 0;
    }
    if (req.body.is_ac_taxable !== undefined) {
      set.is_ac_taxable = normalizeBoolean(req.body.is_ac_taxable, true);
    }
    if (req.body.is_reservation_enabled !== undefined) {
      set.is_reservation_enabled = normalizeBoolean(req.body.is_reservation_enabled, true);
    }

    await TableArea.updateOne({ restaurant_id, _id: id }, { $set: set });
    return apiResponse.successResponse(res, 200, 'Area Updated Successfully');
  } catch (err) {
    console.error('[offline table_area.updateArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.deleteArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 400, 'invalid_id');

    const tables = await Table.find({ restaurant_id, area_id: id });
    if (tables && tables.length > 0) {
      return apiResponse.ErrorResponse(res, 409, 'Area can not be deleted because table exists');
    }

    const existing = await TableArea.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 409, 'table area does not exist');

    await TableArea.deleteOne({ restaurant_id, _id: id });
    return apiResponse.successResponse(res, 200, 'Area Deleted Successfully');
  } catch (err) {
    console.error('[offline table_area.deleteArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

function shapeTableForArea(table, area) {
  const cart = table.cart_details || null;
  return {
    _id: table._id,
    table_id: table._id,
    area_id: table.area_id,
    cart_id: table.cart_id || null,
    table_number: table.table_number,
    no_of_people: Number(table.no_of_people) || 0,
    status: Number(table.status) === 0 ? 0 : 1,
    table_status: (cart && cart.table_status) || 'BLANK',
    reorder_status: Number(table.reorder_status) || 0,
    combinable: table.combinable !== false,
    combinable_table_ids: Array.isArray(table.combinable_table_ids) ? table.combinable_table_ids : [],
    dinein_type: (cart && cart.dinein_type) || '',
    cart_details: cart,
    cartmenu: table.cartmenu || [],
    area: area ? { area_name: area.area_name, status: area.status } : null,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt
  };
}

module.exports.listTablesForTheArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 400, 'invalid_id');

    const area = await TableArea.findOne({ restaurant_id, _id: id });
    if (!area) return apiResponse.ErrorResponse(res, 500, 'plz enter a valid id');

    const status = req.query && req.query.searchStatus ? String(req.query.searchStatus) : '';
    const tables = await Table.find({ restaurant_id, area_id: id });
    const shaped = tables
      .filter((t) => Number(t.status) !== 0)
      .map((t) => shapeTableForArea(t, area))
      .filter((t) => {
        if (!status) return true;
        return new RegExp('.*' + escapeRegExp(status) + '.*', 'i').test(String(t.table_status || ''));
      })
      .sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true }));

    return apiResponse.successResponseWithData(res, 200, 'tables for the given area', shaped);
  } catch (err) {
    console.error('[offline table_area.listTablesForTheArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listTablesForAllTheAreas = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const page = req.query && req.query.page ? req.query.page : 1;

    const areas = await TableArea.find({ restaurant_id });
    const tables = await Table.find({ restaurant_id });
    const tablesByArea = new Map();
    for (const t of tables) {
      const key = String(t.area_id);
      if (!tablesByArea.has(key)) tablesByArea.set(key, []);
      tablesByArea.get(key).push({
        _id: t._id,
        area_id: t.area_id,
        table: [{
          _id: t._id,
          table_number: t.table_number,
          no_of_people: t.no_of_people,
          status: t.status,
          combinable: t.combinable !== false,
          combinable_table_ids: t.combinable_table_ids || [],
          cart_id: t.cart_id || null
        }]
      });
    }

    const docs = areas
      .map(shapeArea)
      .filter((a) => matchesSearch(a.area_name, searchName))
      .sort((a, b) => String(b._id).localeCompare(String(a._id)))
      .map((a) => ({
        ...a,
        tablesData: tablesByArea.get(String(a._id)) || []
      }));

    return apiResponse.successResponseWithData(
      res,
      200,
      'tables list for all the areas are displayed',
      paginateArray(docs, page, 10)
    );
  } catch (err) {
    console.error('[offline table_area.listTablesForAllTheAreas]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};
