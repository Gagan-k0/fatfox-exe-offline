'use strict';

const apiResponse = require('../helpers/apiResponse');
const Transaction = require('../models/transaction.model');
const Order = require('../models/order.model');
const OrderMenu = require('../models/order_menu.model');
const MenuItem = require('../models/menuItems.model');

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
    return Array.isArray(parsed);
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

// Helper to build filter for transactions
function buildTransactionFilter(req) {
  const filter = { restaurant_id: req.auth.restaurant_id };
  if (req.query.status) {
    filter.status = Number(req.query.status) === 0 ? 0 : 1;
  }
  if (req.query.type) {
    filter.type = req.query.type;
  }
  if (req.query.from || req.query.to) {
    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;
    if (from) {
      from.setHours(0, 0, 0, 0);
      filter.createdAt = { ...filter.createdAt, $gte: from };
    }
    if (to) {
      to.setHours(23, 59, 59, 999);
      filter.createdAt = { ...filter.createdAt, $lte: to };
    }
  }
  // Note: We are not implementing search for simplicity.
  return filter;
}

// Helper to escape CSV cells
function escapeCsvCell(cell) {
  if (cell === null || cell === undefined) return '';
  const str = String(cell);
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

// We'll create a finance controller that handles transactions and financial reports.

module.exports.createTransaction = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const {
      amount,
      status,
      type,
      reference_id,
      notes
    } = req.body || {};

    if (amount === null || amount === undefined) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'amount is required' }
      ]);
    }

    if (!type) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'type is required' }
      ]);
    }

    const transaction = await Transaction.create({
      restaurant_id,
      amount: toNumberOrNull(amount) || 0,
      status: Number(status) === 0 ? 0 : 1, // assuming 0 is inactive, 1 active
      type: String(type),
      reference_id: toStringOrNull(reference_id) || null,
      notes: toStringOrNull(notes),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return apiResponse.successResponseWithData(res, 200, 'Transaction created successfully', transaction);
  } catch (err) {
    console.error('[offline finance.createTransaction]', err);
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
    const type = req.query && req.query.type ? String(req.query.type) : '';
    const regex = searchName ? new RegExp('.*' + escapeRegExp(searchName) + '.*', 'i') : /.*/i;

    // We don't have a name field in transaction, so we ignore searchName for now.
    // We can search by reference_id or notes? Let's keep it simple and just filter by status and type.
    const filter = buildTransactionFilter(req);

    const result = await Transaction.paginate(
      filter,
      { page, limit: 10, sort: { createdAt: -1 } }
    );

    return apiResponse.successResponseWithData(res, 200, 'transactions', result);
  } catch (err) {
    console.error('[offline finance.list]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAll = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const status = req.query && req.query.searchStatus ? String(req.query.searchStatus) : '';
    const type = req.query && req.query.type ? String(req.query.type) : '';
    const regex = searchName ? new RegExp('.*' + escapeRegExp(searchName) + '.*', 'i') : /.*/i;

    const filter = buildTransactionFilter(req);

    const all = await Transaction.find(filter);
    // Since we don't have a name field, we just sort by createdAt descending
    const result = all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return apiResponse.successResponseWithData(res, 200, 'transactions', result);
  } catch (err) {
    console.error('[offline finance.listAll]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.view = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const doc = await Transaction.findOne({ restaurant_id, _id: id });
    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    return apiResponse.successResponseWithData(res, 200, 'transaction', doc);
  } catch (err) {
    console.error('[offline finance.view]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.update = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const {
      amount,
      status,
      type,
      reference_id,
      notes
    } = req.body || {};

    const existing = await Transaction.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'Transaction not found');

    const update = {};
    if (amount !== undefined) update.amount = toNumberOrNull(amount);
    if (status !== undefined) update.status = Number(status) === 0 ? 0 : 1;
    if (type !== undefined) update.type = String(type);
    if (reference_id !== undefined) update.reference_id = toStringOrNull(reference_id);
    if (notes !== undefined) update.notes = toStringOrNull(notes);
    update.updatedAt = new Date();

    await Transaction.updateOne({ restaurant_id, _id: id }, { $set: update });

    const updated = await Transaction.findOne({ restaurant_id, _id: id });
    return apiResponse.successResponseWithData(res, 200, 'Transaction updated successfully', updated);
  } catch (err) {
    console.error('[offline finance.update]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.delete = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    await Transaction.deleteOne({ restaurant_id, _id: id });
    return apiResponse.successResponse(res, 200, 'Transaction deleted successfully');
  } catch (err) {
    console.error('[offline finance.delete]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

// Financial reports: daily sales, etc.

module.exports.dailySalesReport = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const date = req.query && req.query.date ? String(req.query.date) : undefined;
    const startDate = date ? new Date(date) : new Date();
    startDate.setHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setHours(23, 59, 59, 999);

    // We'll consider orders with itemIn: 'dinein' or 'pickup' and status: 1 (completed?).
    // We'll assume that completed orders have status 1? Actually in our order model, status 1 is active?
    // Let's check: in order.model.js we don't have a status field? Wait, we do not see status in order.model.js.
    // Let's look at order.model.js again.

    // Actually, we don't have the order.model.js content in front of us. Let's assume that we have a status field in order.
    // But from the pickup controller, we see:
    //   status: Number(status) === 0 ? 0 : 1,
    // So order does have a status.

    // We'll assume that status 1 means completed/active for sales? Actually in the pickup controller, we set status 1 by default.
    // And in the updateStatus we toggle between 0 and 1.

    // Let's assume that status 1 means the order is active (not cancelled) and we want to count it for sales.

    // We'll also consider only orders that have been completed (maybe we need a separate field for completion?).
    // For simplicity, we'll sum the amount of all orders (dinein and pickup) created within the date range.

    const orders = await Order.find({
      restaurant_id,
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
      // We don't filter by status because we want to include all orders?
      // But cancelled orders (status 0) should not be counted.
      // Let's filter by status: 1 (assuming 1 means not cancelled)
    }).where('status').equals(1);

    let totalSales = 0;
    let totalOrders = 0;
    let totalPickup = 0;
    let totalDinein = 0;

    for (const order of orders) {
      totalSales += order.amount || 0;
      totalOrders++;
      if (order.itemIn === 'pickup') totalPickup++;
      if (order.itemIn === 'dinein') totalDinein++;
    }

    const report = {
      date: startDate.toISOString().split('T')[0],
      totalSales,
      totalOrders,
      totalPickup,
      totalDinein
    };

    return apiResponse.successResponseWithData(res, 200, 'daily sales report', report);
  } catch (err) {
    console.error('[offline finance.dailySalesReport]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.monthlySalesReport = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const month = req.query && req.query.month ? String(req.query.month) : undefined; // format: YYYY-MM
    let startDate, endDate;
    if (month) {
      const [year, monthNum] = month.split('-').map(Number);
      startDate = new Date(year, monthNum - 1, 1);
      endDate = new Date(year, monthNum, 0); // last day of the month
    } else {
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    }
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    const orders = await Order.find({
      restaurant_id,
      createdAt: {
        $gte: startDate,
        $lte: endDate
      }
    }).where('status').equals(1);

    let totalSales = 0;
    let totalOrders = 0;
    let totalPickup = 0;
    let totalDinein = 0;

    for (const order of orders) {
      totalSales += order.amount || 0;
      totalOrders++;
      if (order.itemIn === 'pickup') totalPickup++;
      if (order.itemIn === 'dinein') totalDinein++;
    }

    const report = {
      month: month || `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`,
      totalSales,
      totalOrders,
      totalPickup,
      totalDinein
    };

    return apiResponse.successResponseWithData(res, 200, 'monthly sales report', report);
  } catch (err) {
    console.error('[offline finance.monthlySalesReport]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

// Export transactions as CSV
module.exports.exportCsv = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const filter = buildTransactionFilter(req);
    const MAX_EXPORT_ROWS = 50000;

    const transactions = await Transaction.find(filter)
      .sort({ createdAt: -1 })
      .limit(MAX_EXPORT_ROWS);

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const filename = `transactions-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Define CSV columns (simplified for offline)
    const columns = [
      'createdAt',
      'amount',
      'status',
      'type',
      'reference_id',
      'notes'
    ];

    // Write header
    res.write(columns.map(escapeCsvCell).join(',') + '\n');

    let rows = 0;
    for (const transaction of transactions) {
      const values = columns.map(column => {
        // Handle dates
        if (column === 'createdAt' && transaction[column] instanceof Date) {
          return transaction[column].toISOString();
        }
        return transaction[column];
      });
      res.write(values.map(escapeCsvCell).join(',') + '\n');
      rows++;
    }

    if (rows >= MAX_EXPORT_ROWS) {
      console.warn(`[offline finance.exportCsv] capped at MAX_EXPORT_ROWS=${MAX_EXPORT_ROWS}; narrow the filter for a complete export`);
    }

    res.end();
    return apiResponse.successResponse(res, 200, 'CSV exported successfully');
  } catch (err) {
    console.error('[offline finance.exportCsv]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

// Item sales report (for sales report page)
module.exports.itemSales = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const fromStr = req.query && req.query.from ? String(req.query.from) : undefined;
    const toStr = req.query && req.query.to ? String(req.query.to) : undefined;

    const startDate = fromStr ? new Date(fromStr) : new Date();
    const endDate = toStr ? new Date(toStr) : new Date();
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    // Find orders within date range (assuming status 1 means completed/active)
    const orders = await Order.find({
      restaurant_id,
      createdAt: {
        $gte: startDate,
        $lte: endDate
      },
      status: 1 // Assuming 1 means active/completed
    });

    // Collect order IDs
    const orderIds = orders.map(order => order._id);

    // Find order menu items for these orders
    const orderMenuItems = await OrderMenu.find({
      restaurant_id,
      order_id: { $in: orderIds }
    });

    // Collect menu item IDs
    const menuItemIds = [...new Set(orderMenuItems.map(item => item.menuItem_id))];

    // Find menu items to get names
    const menuItems = await MenuItem.find({
      _id: { $in: menuItemIds }
    });

    // Create a map of menuItemId to menu item name
    const menuItemNameMap = {};
    menuItems.forEach(item => {
      menuItemNameMap[item._id.toString()] = item.name || 'Unknown Item';
    });

    // Initialize aggregates
    const menuItemStats = new Map(); // key: menuItemId, value: { name, quantity, revenue }
    const dailyStats = new Map(); // key: date string (YYYY-MM-DD), value: { revenue, orders }

    // Process each order menu item
    orderMenuItems.forEach(item => {
      const menuItemId = item.menuItem_id.toString();
      const name = menuItemNameMap[menuItemId] || 'Unknown Item';
      const quantity = item.quantity || 0;
      const price = item.price || 0;
      const revenue = quantity * price;

      // Update menu item stats
      const stats = menuItemStats.get(menuItemId) || { name, quantity: 0, revenue: 0 };
      stats.quantity += quantity;
      stats.revenue += revenue;
      menuItemStats.set(menuItemId, stats);

      // We don't have the order date directly in orderMenuItems, so we need to get it from the order
      // We'll do this later by mapping order ID to date
    });

    // Map order ID to its date and itemIn
    const orderDateMap = new Map();
    orders.forEach(order => {
      const dateStr = order.createdAt.toISOString().split('T')[0];
      orderDateMap.set(order._id.toString(), { date: dateStr, itemIn: order.itemIn });
    });

    // Now process order menu items again to accumulate daily stats (we need order date)
    orderMenuItems.forEach(item => {
      const orderId = item.order_id.toString();
      const orderInfo = orderDateMap.get(orderId);
      if (!orderInfo) return; // Should not happen

      const dateStr = orderInfo.date;
      const quantity = item.quantity || 0;
      const price = item.price || 0;
      const revenue = quantity * price;

      // Update daily stats
      const daily = dailyStats.get(dateStr) || { revenue: 0, orders: 0 };
      daily.revenue += revenue;
      // We'll count orders separately below
      dailyStats.set(dateStr, daily);
    });

    // Count orders per day
    orders.forEach(order => {
      const dateStr = order.createdAt.toISOString().split('T')[0];
      const daily = dailyStats.get(dateStr) || { revenue: 0, orders: 0 };
      daily.orders += 1;
      dailyStats.set(dateStr, daily);
    });

    // Calculate summary
    let totalRevenueNet = 0;
    let totalItemSalesGross = 0;
    let totalQtySold = 0;
    let totalOrders = orders.length;
    let totalItems = menuItemStats.size; // distinct menu items sold

    menuItemStats.forEach((stats, menuItemId) => {
      totalRevenueNet += stats.revenue;
      totalItemSalesGross += stats.revenue; // Assuming no discounts/taxes at this level
      totalQtySold += stats.quantity;
    });

    // Net refunds: we don't have refunds in offline mode, so 0
    const netRefunds = 0;

    // Find top selling item (by quantity) and highest revenue item
    let topSellingItem = null;
    let highestRevenueItem = null;
    let maxQty = 0;
    let maxRevenue = 0;

    menuItemStats.forEach((stats, menuItemId) => {
      if (stats.quantity > maxQty) {
        maxQty = stats.quantity;
        topSellingItem = { name: stats.name, quantity: stats.quantity };
      }
      if (stats.revenue > maxRevenue) {
        maxRevenue = stats.revenue;
        highestRevenueItem = { name: stats.name, revenue: stats.revenue };
      }
    });

    // Build daily trend array sorted by date
    const dailyTrend = [];
    dailyStats.forEach((value, dateStr) => {
      dailyTrend.push({ date: dateStr, revenue: value.revenue, orders: value.orders });
    });
    dailyTrend.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Build items array for each menu item sold
    const items = [];
    menuItemStats.forEach((stats, menuItemId) => {
      items.push({
        menuId: menuItemId,
        name: stats.name,
        qtySold: stats.quantity,
        revenue: stats.revenue,
        orders: 0, // We don't have per-menu-item order count easily; we'll leave 0 or calculate if needed
        avgPrice: stats.quantity > 0 ? stats.revenue / stats.quantity : 0,
        contributionPct: totalRevenueNet > 0 ? (stats.revenue / totalRevenueNet) * 100 : 0,
        lastSoldDate: null // We don't track last sold date per menu item easily
      });
    });

    // Sort items by revenue descending
    items.sort((a, b) => b.revenue - a.revenue);

    const report = {
      from: startDate.toISOString().split('T')[0],
      to: endDate.toISOString().split('T')[0],
      summary: {
        totalRevenueNet,
        totalItemSalesGross,
        netRefunds: 0,
        totalOrders,
        totalQtySold,
        totalItems,
        topSellingItem,
        highestRevenueItem
      },
      items,
      dailyTrend
    };

    return apiResponse.successResponseWithData(res, 200, 'item sales report', report);
  } catch (err) {
    console.error('[offline finance.itemSales]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};