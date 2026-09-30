'use strict';

const apiResponse = require('../helpers/apiResponse');
const { generateId } = require('../helpers/offline-db-adapter');
const DineInSession = require('../models/dinein_session.model');
const Table = require('../models/table.model');
const Order = require('../models/order.model');
const OrderMenu = require('../models/order_menu.model');
const { emitKdsWorkChanged } = require('../helpers/offline-socket');

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

function parseDateOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  // Treat YYYY-MM-DD as UTC day boundaries to mimic online behavior.
  // Angular sends plain date without timezone.
  const date = s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00Z');
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseTimeOrNull(v) {
  const s = toStringOrNull(v);
  if (!s) return null;
  // Keep HH:mm as-is; our comparisons are lexicographic.
  return s;
}

module.exports.create = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const { table_id, status, startedAt, endedAt, notes } = req.body || {};

    if (!table_id) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'table_id is required' }
      ]);
    }

    // Check if table exists and is available (status 1 for active)
    const table = await Table.findOne({ restaurant_id, _id: table_id });
    if (!table) return apiResponse.ErrorResponse(res, 404, 'Table not found');

    // Check if there's already an active session for this table
    const activeSession = await DineInSession.findOne({ restaurant_id, table_id, status: 1 });
    if (activeSession) return apiResponse.ErrorResponse(res, 409, 'Table already has an active session');

    // Create the dining session
    const session = await DineInSession.create({
      restaurant_id,
      table_id: String(table_id),
      status: Number(status) === 0 ? 0 : 1,
      startedAt: startedAt ? new Date(startedAt) : new Date(),
      endedAt: endedAt ? new Date(endedAt) : null,
      notes: toStringOrNull(notes),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Update table status to occupied (if needed) - we can leave this to the frontend or handle here
    // For now, we'll just create the session and let the frontend manage table status via cart

    // Emit KDS event for new dine-in session
    if (restaurant_id) {
      emitKdsWorkChanged(restaurant_id, {
        source: 'dinein.create'
      });
    }

    return apiResponse.successResponseWithData(res, 200, 'Dine-in session started successfully', session);
  } catch (err) {
    console.error('[offline dinein.create]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.list = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const page = req.query && req.query.page ? Number(req.query.page) : 1;
    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const status = req.query && req.query.searchStatus ? String(req.query.searchStatus) : '';
    const regex = searchName ? new RegExp('.*' + escapeRegExp(searchName) + '.*', 'i') : /.*/i;

    // We'll search by table number via joining, but for simplicity we'll filter in-memory after fetching
    // In a real scenario, we might want to use $lookup or denormalize table_number in session
    const result = await DineInSession.paginate(
      { restaurant_id, status: status ? Number(status) : { $exists: true } },
      { page, limit: 10, sort: { startedAt: -1 } }
    );

    // Apply table number search if needed (requires joining with table)
    // For now, we'll skip complex filtering and note that we can enhance later
    // We'll just return the paginated result

    return apiResponse.successResponseWithData(res, 200, 'dinein sessions', result);
  } catch (err) {
    console.error('[offline dinein.list]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAll = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    // Note: DineInSession doesn't have a name field, so we ignore searchName for now
    // In a real implementation, we might want to join with table to search by table number
    const regex = searchName ? new RegExp('.*' + escapeRegExp(searchName) + '.*', 'i') : /.*/i;

    const all = await DineInSession.find({ restaurant_id });
    // Since we don't have a meaningful name field in DineInSession, we'll just return all sessions
    // sorted by startedAt descending (most recent first)
    const result = all
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());

    return apiResponse.successResponseWithData(res, 200, 'dinein sessions', result);
  } catch (err) {
    console.error('[offline dinein.listAll]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.view = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const doc = await DineInSession.findOne({ restaurant_id, _id: id });
    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    return apiResponse.successResponseWithData(res, 200, 'dinein session', doc);
  } catch (err) {
    console.error('[offline dinein.view]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.update = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const { table_id, status, startedAt, endedAt, notes } = req.body || {};

    const existing = await DineInSession.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'Dine-in session not found');

    // Check for table_id conflict if table_id is being changed
    if (table_id && String(table_id) !== existing.table_id) {
      const table = await Table.findOne({ restaurant_id, _id: table_id });
      if (!table) return apiResponse.ErrorResponse(res, 404, 'Table not found');

      // Check if the new table already has an active session (excluding current)
      const tableConflict = await DineInSession.findOne({
        restaurant_id,
        table_id: String(table_id),
        _id: { $ne: id },
        status: 1
      });
      if (tableConflict) return apiResponse.ErrorResponse(res, 409, 'Table already has an active session');
    }

    const update = {};
    if (table_id !== undefined) update.table_id = String(table_id);
    if (status !== undefined) update.status = Number(status) === 0 ? 0 : 1;
    if (startedAt !== undefined) update.startedAt = startedAt ? new Date(startedAt) : null;
    if (endedAt !== undefined) update.endedAt = endedAt ? new Date(endedAt) : null;
    if (notes !== undefined) update.notes = toStringOrNull(notes);
    update.updatedAt = new Date();

    await DineInSession.updateOne({ restaurant_id, _id: id }, { $set: update });

    const updated = await DineInSession.findOne({ restaurant_id, _id: id });
    return apiResponse.successResponseWithData(res, 200, 'Dine-in session updated successfully', updated);
  } catch (err) {
    console.error('[offline dinein.update]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.delete = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    // Check if there are any active orders for this session
    const activeOrders = await Order.countDocuments({
      restaurant_id,
      dinein_session_id: id,
      itemIn: 'dinein',
      status: 1
    });
    if (activeOrders > 0) {
      return apiResponse.ErrorResponse(res, 409, 'Cannot delete session with active orders');
    }

    await DineInSession.deleteOne({ restaurant_id, _id: id });
    return apiResponse.successResponse(res, 200, 'Dine-in session deleted successfully');
  } catch (err) {
    console.error('[offline dinein.delete]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.updateStatus = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const status = req.body && req.body.status !== undefined ? (Number(req.body.status) === 0 ? 0 : 1) : 1;

    await DineInSession.updateOne({ restaurant_id, _id: id }, { $set: { status: status, updatedAt: new Date() } });

    return apiResponse.successResponse(res, 200, 'Dine-in session status updated successfully');
  } catch (err) {
    console.error('[offline dinein.updateStatus]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

// Additional methods for dinein sessions

module.exports.createOrder = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const sessionId = req.params && req.params.sessionId;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');
    if (!sessionId) return apiResponse.ErrorResponse(res, 422, 'Invalid session id');

    // Verify session exists and is active
    const session = await DineInSession.findOne({ restaurant_id, _id: sessionId, status: 1 });
    if (!session) return apiResponse.ErrorResponse(res, 404, 'Active dine-in session not found');

    const {
      order_number,
      amount,
      payment_mode,
      notes,
      items // Array of menu items with options
    } = req.body || {};

    // Create the order
    const order = await Order.create({
      restaurant_id,
      order_number: toStringOrNull(order_number) || null,
      amount: toNumberOrNull(amount) || 0,
      payment_mode: toStringOrNull(payment_mode) || '',
      notes: toStringOrNull(notes),
      dinein_session_id: sessionId,
      itemIn: 'dinein', // Mark as dine-in order
      status: 1, // Active by default
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Create order menu items if provided
    if (items && Array.isArray(items)) {
      for (const itemData of items) {
        await OrderMenu.create({
          restaurant_id,
          order_id: order._id,
          menuItem_id: toStringOrNull(itemData.menuItem_id) || null,
          quantity: Number(itemData.quantity) || 1,
          price: toNumberOrNull(itemData.price) || 0,
          addon_ids: parseJSONArray(itemData.addon_ids, []),
          variant_ids: parseJSONArray(itemData.variant_ids, []),
          notes: toStringOrNull(itemData.notes),
          createdAt: new Date(),
          updatedAt: new Date()
        });
      }
    }

    // Emit KDS event for new dine-in order
    if (restaurant_id) {
      emitKdsWorkChanged(restaurant_id, {
        orderId: order._id,
        source: 'dinein.createOrder'
      });
    }

    return apiResponse.successResponseWithData(res, 200, 'Order created for dine-in session', { _id: order._id });
  } catch (err) {
    console.error('[offline dinein.createOrder]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.getOrdersForSession = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const sessionId = req.params && req.params.sessionId;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');
    if (!sessionId) return apiResponse.ErrorResponse(res, 422, 'Invalid session id');

    // Verify session exists
    const session = await DineInSession.findOne({ restaurant_id, _id: sessionId });
    if (!session) return apiResponse.ErrorResponse(res, 404, 'Dine-in session not found');

    const orders = await Order.find({ restaurant_id, dinein_session_id: sessionId, itemIn: 'dinein' }).sort({ createdAt: -1 });

    return apiResponse.successResponseWithData(res, 200, 'orders for session', orders);
  } catch (err) {
    console.error('[offline dinein.getOrdersForSession]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.closeSession = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const sessionId = req.params && req.params.sessionId;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');
    if (!sessionId) return apiResponse.ErrorResponse(res, 422, 'Invalid session id');

    // Verify session exists and is active
    const session = await DineInSession.findOne({ restaurant_id, _id: sessionId, status: 1 });
    if (!session) return apiResponse.ErrorResponse(res, 404, 'Active dine-in session not found');

    // Check if there are any active orders (status 1) for this session
    const activeOrders = await Order.countDocuments({
      restaurant_id,
      dinein_session_id: sessionId,
      itemIn: 'dinein',
      status: 1
    });
    if (activeOrders > 0) {
      return apiResponse.ErrorResponse(res, 409, 'Cannot close session with active orders');
    }

    // Calculate total from orders (optional, we can store it in session)
    // For now, we'll just end the session
    const endedAt = new Date();

    await DineInSession.updateOne(
      { restaurant_id, _id: sessionId },
      { $set: { status: 0, endedAt: endedAt, updatedAt: endedAt } }
    );

    // Optionally, update table status to free (via cart or direct update)
    // We'll leave table management to the frontend/cart for simplicity

    const updated = await DineInSession.findOne({ restaurant_id, _id: sessionId });
    return apiResponse.successResponseWithData(res, 200, 'Dine-in session closed successfully', updated);
  } catch (err) {
    console.error('[offline dinein.closeSession]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};