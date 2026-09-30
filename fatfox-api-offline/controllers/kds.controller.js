'use strict';

const apiResponse = require('../helpers/apiResponse');
const KitchenItem = require('../models/kitchen_item.model');
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

module.exports.list = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const page = req.query && req.query.page ? Number(req.query.page) : 1;
    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const status = req.query && req.query.searchStatus ? String(req.query.searchStatus) : '';
    const orderId = req.query && req.query.orderId ? String(req.query.orderId) : '';
    const regex = searchName ? new RegExp('.*' + escapeRegExp(searchName) + '.*', 'i') : /.*/i;

    // We'll need to join with order_menu to get menu item details?
    // For simplicity, we'll just filter kitchen items directly.
    // In a real scenario, we might want to denormalize menu item name or id in kitchen_item.
    // But for now, we'll filter by status and orderId if provided.
    const filter = { restaurant_id };
    if (status) filter.status = status;
    if (orderId) filter.order_id = orderId;

    // Note: We don't have a name field in kitchen_item, so we ignore searchName for now.
    // We could join with order_menu and then menu item to get the name, but let's keep it simple.
    const result = await KitchenItem.paginate(
      filter,
      { page, limit: 10, sort: { createdAt: 1 } } // oldest first for FIFO
    );

    return apiResponse.successResponseWithData(res, 200, 'kitchen items', result);
  } catch (err) {
    console.error('[offline kds.list]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAll = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const status = req.query && req.query.searchStatus ? String(req.query.searchStatus) : '';
    const orderId = req.query && req.query.orderId ? String(req.query.orderId) : '';
    const regex = searchName ? new RegExp('.*' + escapeRegExp(searchName) + '.*', 'i') : /.*/i;

    const filter = { restaurant_id };
    if (status) filter.status = status;
    if (orderId) filter.order_id = orderId;

    const all = await KitchenItem.find(filter);
    // Since we don't have a name field, we just sort by createdAt ascending (oldest first)
    const result = all.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

    return apiResponse.successResponseWithData(res, 200, 'kitchen items', result);
  } catch (err) {
    console.error('[offline kds.listAll]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.view = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const doc = await KitchenItem.findOne({ restaurant_id, _id: id });
    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    return apiResponse.successResponseWithData(res, 200, 'kitchen item', doc);
  } catch (err) {
    console.error('[offline kds.view]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.update = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const { menuItem_id, order_id, quantity, status, notes, preparedAt } = req.body || {};

    const existing = await KitchenItem.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'Kitchen item not found');

    const update = {};
    if (menuItem_id !== undefined) update.menuItem_id = toStringOrNull(menuItem_id);
    if (order_id !== undefined) update.order_id = toStringOrNull(order_id);
    if (quantity !== undefined) update.quantity = toNumberOrNull(quantity);
    if (status !== undefined) update.status = status;
    if (notes !== undefined) update.notes = toStringOrNull(notes);
    if (preparedAt !== undefined) update.preparedAt = preparedAt ? new Date(preparedAt) : null;
    update.updatedAt = new Date();

    await KitchenItem.updateOne({ restaurant_id, _id: id }, { $set: update });

    const updated = await KitchenItem.findOne({ restaurant_id, _id: id });
    // Emit KDS event for kitchen item update
    if (restaurant_id) {
      emitKdsWorkChanged(restaurant_id, {
        orderId: updated.order_id,
        source: 'kds.update'
      });
    }

    return apiResponse.successResponseWithData(res, 200, 'Kitchen item updated successfully', updated);
  } catch (err) {
    console.error('[offline kds.update]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.delete = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    await KitchenItem.deleteOne({ restaurant_id, _id: id });
    // Emit KDS event for kitchen item deletion
    if (restaurant_id) {
      emitKdsWorkChanged(restaurant_id, {
        orderId: id, // approximate, but indicates activity
        source: 'kds.delete'
      });
    }
    return apiResponse.successResponse(res, 200, 'Kitchen item deleted successfully');
  } catch (err) {
    console.error('[offline kds.delete]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.updateStatus = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const status = req.body && req.body.status !== undefined ? req.body.status : 'PREPARED';

    await KitchenItem.updateOne({ restaurant_id, _id: id }, { $set: { status: status, updatedAt: new Date() } });

    const updated = await KitchenItem.findOne({ restaurant_id, _id: id });
    if (restaurant_id) {
      emitKdsWorkChanged(restaurant_id, {
        orderId: updated && updated.order_id ? updated.order_id : id,
        source: 'kds.updateStatus'
      });
    }

    return apiResponse.successResponse(res, 200, 'Kitchen item status updated successfully');
  } catch (err) {
    console.error('[offline kds.updateStatus]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

// Additional methods for kitchen items

module.exports.createFromOrder = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const orderId = req.params && req.params.orderId;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');
    if (!orderId) return apiResponse.ErrorResponse(res, 422, 'Invalid order id');

    // Verify order exists and is active (status 1 for active? We'll assume any order)
    const order = await Order.findOne({ restaurant_id, _id: orderId });
    if (!order) return apiResponse.ErrorResponse(res, 404, 'Order not found');

    // Get order menu items for this order
    const orderMenuItems = await OrderMenu.find({ restaurant_id, order_id: orderId });

    // Create kitchen items for each order menu item
    const kitchenItems = [];
    for (const om of orderMenuItems) {
      const kitchenItem = await KitchenItem.create({
        restaurant_id,
        order_id: order._id,
        menuItem_id: om.menuItem_id,
        quantity: om.quantity,
        status: 'PENDING', // Default status
        notes: om.notes,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      kitchenItems.push(kitchenItem);
    }
    // Emit KDS event for new kitchen items from order
    if (restaurant_id) {
      emitKdsWorkChanged(restaurant_id, {
        orderId: order._id,
        source: 'createFromOrder'
      });
    }

    return apiResponse.successResponseWithData(res, 200, 'Kitchen items created from order', kitchenItems);
  } catch (err) {
    console.error('[offline kds.createFromOrder]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.getByOrderId = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const orderId = req.params && req.params.orderId;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');
    if (!orderId) return apiResponse.ErrorResponse(res, 422, 'Invalid order id');

    const kitchenItems = await KitchenItem.find({ restaurant_id, order_id: orderId }).sort({ createdAt: 1 });

    return apiResponse.successResponseWithData(res, 200, 'kitchen items for order', kitchenItems);
  } catch (err) {
    console.error('[offline kds.getByOrderId]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};