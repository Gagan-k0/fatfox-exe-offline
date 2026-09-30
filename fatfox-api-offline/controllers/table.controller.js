'use strict';

const apiResponse = require('../helpers/apiResponse');
const { generateId } = require('../helpers/offline-db-adapter');
const Table = require('../models/table.model');
const TableArea = require('../models/table_area.model');

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

function parseTablePayload(body) {
  if (Array.isArray(body && body.table)) return body.table;
  if (body && body.table && typeof body.table === 'object') return [body.table];
  if (body && body.table_number) return [body];
  return [];
}

function idsEqual(a, b) {
  return String(a) === String(b);
}

function asIdList(value) {
  if (!Array.isArray(value)) return [];
  return value.map((id) => String(id)).filter(Boolean);
}

function matchesNumber(tableNumber, searchNumber) {
  if (!searchNumber) return true;
  const q = String(searchNumber).trim();
  if (!q) return true;
  return new RegExp('.*' + escapeRegExp(q) + '.*', 'i').test(String(tableNumber || ''));
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

async function areaMap(restaurant_id) {
  const areas = await TableArea.find({ restaurant_id });
  const map = new Map();
  for (const a of areas) map.set(String(a._id), a);
  return map;
}

function cartOccupancy(table) {
  const cart = table.cart_details || null;
  return {
    table_status: (cart && cart.table_status) || 'BLANK',
    dinein_type: (cart && cart.dinein_type) || '',
    cart_details: cart
  };
}

function shapeAdminTable(table, area) {
  const occ = cartOccupancy(table);
  return {
    _id: table._id,
    table_id: table._id,
    area_id: table.area_id,
    area_name: area ? area.area_name : '',
    cart_id: table.cart_id || null,
    table_number: table.table_number,
    no_of_people: Number(table.no_of_people) || 0,
    status: Number(table.status) === 0 ? 0 : 1,
    note: table.note || null,
    is_reservation_enabled: table.is_reservation_enabled !== false,
    combinable: table.combinable !== false,
    combinable_table_ids: asIdList(table.combinable_table_ids),
    table_status: occ.table_status,
    dinein_type: occ.dinein_type,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt
  };
}

function shapeFloorTable(table, area) {
  const occ = cartOccupancy(table);
  return {
    _id: table._id,
    table_id: table._id,
    area_id: table.area_id,
    cart_id: table.cart_id || null,
    table_number: table.table_number,
    no_of_people: Number(table.no_of_people) || 0,
    reorder_status: Number(table.reorder_status) || 0,
    status: Number(table.status) === 0 ? 0 : 1,
    combinable: table.combinable !== false,
    combinable_table_ids: asIdList(table.combinable_table_ids),
    table_status: occ.table_status,
    dinein_type: occ.dinein_type,
    cart_details: occ.cart_details,
    reservation: table.reservation || null,
    cartmenu: table.cartmenu || [],
    area: area ? { area_name: area.area_name, status: area.status } : null,
    createdAt: table.createdAt,
    updatedAt: table.updatedAt
  };
}

function shapeAvailableTable(table, area) {
  return {
    _id: table._id,
    table_id: table._id,
    area_id: table.area_id,
    area_name: area ? area.area_name : 'Dining Area',
    cart_id: table.cart_id || null,
    table_number: table.table_number,
    no_of_people: Number(table.no_of_people) || 0,
    note: table.note || null,
    status: Number(table.status) === 0 ? 0 : 1,
    combinable: table.combinable !== false,
    combinable_table_ids: asIdList(table.combinable_table_ids),
    createdAt: table.createdAt,
    updatedAt: table.updatedAt
  };
}

async function addSymmetricPartners(restaurant_id, tableId, partnerIds) {
  if (!partnerIds.length) return;
  const partners = await Table.find({ restaurant_id, _id: { $in: partnerIds } });
  for (const partner of partners) {
    const ids = asIdList(partner.combinable_table_ids);
    if (!ids.includes(String(tableId))) ids.push(String(tableId));
    await Table.updateOne(
      { restaurant_id, _id: partner._id },
      { $set: { combinable: true, combinable_table_ids: ids } }
    );
  }
}

async function removeSymmetricPartners(restaurant_id, tableId, exceptIds) {
  const except = new Set((exceptIds || []).map(String));
  const all = await Table.find({ restaurant_id });
  for (const other of all) {
    if (idsEqual(other._id, tableId)) continue;
    const ids = asIdList(other.combinable_table_ids);
    if (!ids.includes(String(tableId))) continue;
    if (except.has(String(other._id))) continue;
    await Table.updateOne(
      { restaurant_id, _id: other._id },
      { $set: { combinable_table_ids: ids.filter((id) => !idsEqual(id, tableId)) } }
    );
  }
}

function combinationsFor(freeTables, partySize) {
  if (!partySize || partySize <= 0) return [];
  const byArea = new Map();
  for (const t of freeTables) {
    const key = String(t.area_id);
    if (!byArea.has(key)) byArea.set(key, []);
    byArea.get(key).push(t);
  }

  const out = [];
  for (const group of byArea.values()) {
    const singles = group.filter((t) => Number(t.no_of_people) >= partySize);
    for (const t of singles) {
      out.push({
        table_ids: [String(t.table_id)],
        table_numbers: [t.table_number],
        total_seats: Number(t.no_of_people) || 0,
        tables: [{
          table_id: String(t.table_id),
          table_number: t.table_number,
          no_of_people: Number(t.no_of_people) || 0
        }],
        area_id: t.area_id,
        area_name: t.area_name
      });
    }

    const combinable = group.filter((t) => t.combinable !== false);
    for (let i = 0; i < combinable.length; i++) {
      for (let j = i + 1; j < combinable.length; j++) {
        const a = combinable[i];
        const b = combinable[j];
        const aPartners = asIdList(a.combinable_table_ids);
        const bPartners = asIdList(b.combinable_table_ids);
        const linked = aPartners.includes(String(b.table_id)) || bPartners.includes(String(a.table_id));
        if (!linked && aPartners.length + bPartners.length > 0) continue;
        const seats = (Number(a.no_of_people) || 0) + (Number(b.no_of_people) || 0);
        if (seats < partySize) continue;
        out.push({
          table_ids: [String(a.table_id), String(b.table_id)],
          table_numbers: [a.table_number, b.table_number],
          total_seats: seats,
          tables: [
            { table_id: String(a.table_id), table_number: a.table_number, no_of_people: Number(a.no_of_people) || 0 },
            { table_id: String(b.table_id), table_number: b.table_number, no_of_people: Number(b.no_of_people) || 0 }
          ],
          area_id: a.area_id,
          area_name: a.area_name
        });
      }
    }
  }
  return out;
}

module.exports.createTable = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const area_id = req.params && req.params.area_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');
    if (!area_id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const area = await TableArea.findOne({ restaurant_id, _id: area_id });
    if (!area) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    const incoming = parseTablePayload(req.body);
    if (!incoming.length) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'table is required' }
      ]);
    }

    const numbers = incoming.map((t) => String(t.table_number || '').trim());
    if (numbers.some((n) => !n)) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'table number must be specified.' }
      ]);
    }
    const seen = new Set();
    for (const n of numbers) {
      const key = n.toLowerCase();
      if (seen.has(key)) {
        return apiResponse.ErrorResponse(res, 409, 'table number already exists in this restaurant');
      }
      seen.add(key);
      const exists = await Table.findOne({ restaurant_id, table_number: n });
      if (exists) {
        return apiResponse.ErrorResponse(res, 409, 'table number already exists in this restaurant');
      }
    }

    const created = [];
    for (const t of incoming) {
      const combinable = normalizeBoolean(t.combinable, true);
      const combinable_table_ids = combinable ? asIdList(t.combinable_table_ids) : [];
      const doc = await Table.create({
        restaurant_id,
        area_id,
        table_number: String(t.table_number).trim(),
        no_of_people: Number(t.no_of_people) || 0,
        note: t.note == null || t.note === '' ? null : String(t.note).trim().slice(0, 200),
        combinable,
        combinable_table_ids,
        is_reservation_enabled: normalizeBoolean(t.is_reservation_enabled, true),
        cart_id: null,
        reorder_status: 0,
        status: Number(t.status) === 0 ? 0 : 1,
        _id: t._id ? String(t._id) : generateId()
      });
      created.push(doc);
      if (combinable && combinable_table_ids.length) {
        await addSymmetricPartners(restaurant_id, doc._id, combinable_table_ids);
      }
    }

    return apiResponse.successResponseWithData(
      res,
      200,
      'Table Added Successfully',
      created.map((d) => ({ _id: d._id, table_id: d._id }))
    );
  } catch (err) {
    console.error('[offline table.createTable]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listTable = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchNumber = req.query && req.query.searchNumber ? String(req.query.searchNumber) : '';
    const areaId = (req.query && (req.query.areaId || req.query.area_id)) || '';
    const page = req.query && req.query.page ? req.query.page : 1;

    const areas = await areaMap(restaurant_id);
    let tables = await Table.find({ restaurant_id });
    if (areaId) tables = tables.filter((t) => idsEqual(t.area_id, areaId));

    const docs = tables
      .filter((t) => matchesNumber(t.table_number, searchNumber))
      .map((t) => shapeAdminTable(t, areas.get(String(t.area_id))))
      .sort((a, b) => String(b._id).localeCompare(String(a._id)));

    return apiResponse.successResponseWithData(res, 200, 'tables list are displayed', paginateArray(docs, page, 10));
  } catch (err) {
    console.error('[offline table.listTable]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAllTable = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchNumber = req.query && req.query.searchNumber ? String(req.query.searchNumber) : '';
    const status = req.query && req.query.searchStatus ? String(req.query.searchStatus) : '';
    const areas = await areaMap(restaurant_id);
    const tables = await Table.find({ restaurant_id });

    const result = tables
      .filter((t) => Number(t.status) === 1)
      .filter((t) => {
        const area = areas.get(String(t.area_id));
        return area && Number(area.status) === 1;
      })
      .filter((t) => matchesNumber(t.table_number, searchNumber))
      .map((t) => shapeFloorTable(t, areas.get(String(t.area_id))))
      .filter((t) => {
        if (!status) return true;
        return new RegExp('.*' + escapeRegExp(status) + '.*', 'i').test(String(t.table_status || ''));
      })
      .sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true }));

    return apiResponse.successResponseWithData(res, 200, 'tables list are displayed', result);
  } catch (err) {
    console.error('[offline table.listAllTable]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAllAvaliableTable = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchNumber = req.query && req.query.searchNumber ? String(req.query.searchNumber) : '';
    const areas = await areaMap(restaurant_id);
    const tables = await Table.find({ restaurant_id });

    const result = tables
      .filter((t) => Number(t.status) === 1 && !t.cart_id)
      .filter((t) => {
        const area = areas.get(String(t.area_id));
        return area && Number(area.status) === 1;
      })
      .filter((t) => matchesNumber(t.table_number, searchNumber))
      .map((t) => shapeAvailableTable(t, areas.get(String(t.area_id))))
      .sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true }));

    return apiResponse.successResponseWithData(res, 200, 'tables list are displayed', result);
  } catch (err) {
    console.error('[offline table.listAllAvaliableTable]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAllAvaliableTableByArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const rawAreaId = req.query && req.query.areaId;
    const hasAreaId = rawAreaId && rawAreaId !== 'all' && rawAreaId !== 'null' && rawAreaId !== 'undefined';
    const searchNumber = req.query && req.query.searchNumber ? String(req.query.searchNumber) : '';
    const partySize = req.query && req.query.party_size ? parseInt(req.query.party_size, 10) : 0;

    const areas = await areaMap(restaurant_id);
    let tables = await Table.find({ restaurant_id });
    if (hasAreaId) tables = tables.filter((t) => idsEqual(t.area_id, rawAreaId));

    const result = tables
      .filter((t) => Number(t.status) === 1)
      .filter((t) => {
        const area = areas.get(String(t.area_id));
        return !area || Number(area.status) === 1;
      })
      .filter((t) => matchesNumber(t.table_number, searchNumber))
      .map((t) => {
        const shaped = shapeAvailableTable(t, areas.get(String(t.area_id)));
        shaped.status_color = t.cart_id ? 'OCCUPIED' : 'FREE';
        return shaped;
      })
      .sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true }));

    const combinations = combinationsFor(result.filter((t) => t.status_color === 'FREE'), partySize);
    return apiResponse.successResponseWithData(res, 200, 'tables list are displayed', {
      tables: result,
      combinations
    });
  } catch (err) {
    console.error('[offline table.listAllAvaliableTableByArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAllTableByArea = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const areaId = req.query && req.query.areaId;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');
    if (!areaId) return apiResponse.ErrorResponse(res, 400, 'invalid_id');

    const searchNumber = req.query && req.query.searchNumber ? String(req.query.searchNumber) : '';
    const areas = await areaMap(restaurant_id);
    const tables = await Table.find({ restaurant_id, area_id: areaId });
    const result = tables
      .filter((t) => matchesNumber(t.table_number, searchNumber))
      .filter((t) => {
        const area = areas.get(String(t.area_id));
        return area && Number(area.status) === 1;
      })
      .map((t) => shapeAvailableTable(t, areas.get(String(t.area_id))))
      .sort((a, b) => String(a.table_number).localeCompare(String(b.table_number), undefined, { numeric: true }));

    return apiResponse.successResponseWithData(res, 200, 'tables list are displayed', result);
  } catch (err) {
    console.error('[offline table.listAllTableByArea]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.viewTable = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 500, 'invalid_id');

    const table = await Table.findOne({ restaurant_id, _id: id });
    if (!table) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    return apiResponse.successResponseWithData(res, 200, 'table is displayed', {
      _id: table._id,
      table_id: table._id,
      area_id: table.area_id,
      cart_id: table.cart_id || null,
      table_number: table.table_number,
      no_of_people: Number(table.no_of_people) || 0,
      status: Number(table.status) === 0 ? 0 : 1,
      note: table.note || null,
      combinable: table.combinable !== false,
      combinable_table_ids: asIdList(table.combinable_table_ids),
      is_reservation_enabled: table.is_reservation_enabled !== false,
      createdAt: table.createdAt,
      updatedAt: table.updatedAt
    });
  } catch (err) {
    console.error('[offline table.viewTable]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.updateTable = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 500, 'invalid_id');

    const table_number = req.body && req.body.table_number != null ? String(req.body.table_number).trim() : '';
    const no_of_people = req.body && req.body.no_of_people;
    if (!table_number) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'table number must be specified.' }
      ]);
    }
    if (no_of_people === undefined || no_of_people === null || String(no_of_people).trim() === '') {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'number of people must be specified.' }
      ]);
    }

    const existing = await Table.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'Table not found');

    const conflict = await Table.findOne({ restaurant_id, table_number, _id: { $ne: id } });
    if (conflict) return apiResponse.ErrorResponse(res, 409, 'table number already exists in this restaurant');

    const seats = Number(no_of_people);
    if (!Number.isFinite(seats)) {
      return apiResponse.ErrorResponse(res, 422, 'number of people must be a number.');
    }

    const set = {
      table_number,
      no_of_people: seats,
      status: Number(req.body.status) === 0 ? 0 : 1
    };

    if (req.body.note !== undefined) {
      set.note = req.body.note == null ? null : String(req.body.note).trim().slice(0, 200);
    }

    let parsedCombinable;
    let newPartnerIds = [];
    if (req.body.combinable !== undefined) {
      parsedCombinable = normalizeBoolean(req.body.combinable, true);
      set.combinable = parsedCombinable;
      if (parsedCombinable) {
        newPartnerIds = asIdList(req.body.combinable_table_ids);
        if (!newPartnerIds.length) {
          return apiResponse.ErrorResponse(res, 422, 'Please select at least one table that this table can combine with.');
        }
        if (newPartnerIds.includes(String(id))) {
          return apiResponse.ErrorResponse(res, 422, 'Table cannot combine with itself.');
        }
        const partners = await Table.find({ restaurant_id, _id: { $in: newPartnerIds } });
        if (partners.length !== newPartnerIds.length) {
          return apiResponse.ErrorResponse(res, 422, 'One or more selected tables are invalid.');
        }
        if (partners.some((p) => !idsEqual(p.area_id, existing.area_id))) {
          return apiResponse.ErrorResponse(res, 422, 'Selected tables must be in the same area.');
        }
        set.combinable_table_ids = newPartnerIds;
      } else {
        set.combinable_table_ids = [];
      }
    }

    if (req.body.is_reservation_enabled !== undefined) {
      set.is_reservation_enabled = normalizeBoolean(req.body.is_reservation_enabled, true);
    }

    await Table.updateOne({ restaurant_id, _id: id }, { $set: set });

    if (req.body.combinable !== undefined) {
      if (parsedCombinable && newPartnerIds.length) {
        await removeSymmetricPartners(restaurant_id, id, newPartnerIds);
        await addSymmetricPartners(restaurant_id, id, newPartnerIds);
      } else {
        await removeSymmetricPartners(restaurant_id, id, []);
      }
    }

    return apiResponse.successResponse(res, 200, 'Table Updated Successfully');
  } catch (err) {
    console.error('[offline table.updateTable]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.deleteTable = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 400, 'invalid_id');

    const existing = await Table.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 409, 'Table is occupied, cannot delete');
    if (existing.cart_id) return apiResponse.ErrorResponse(res, 409, 'Table is occupied, cannot delete');

    await Table.deleteOne({ restaurant_id, _id: id });
    await removeSymmetricPartners(restaurant_id, id, []);
    return apiResponse.successResponse(res, 200, 'Table Deleted Successfully');
  } catch (err) {
    console.error('[offline table.deleteTable]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.resetReorderStatus = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 500, 'invalid_id');

    const existing = await Table.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    await Table.updateOne({ restaurant_id, _id: id }, { $set: { reorder_status: 0 } });
    return apiResponse.successResponse(res, 200, 'Reorder status reset');
  } catch (err) {
    console.error('[offline table.resetReorderStatus]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};
