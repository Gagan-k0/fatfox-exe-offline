'use strict';

const apiResponse = require('../helpers/apiResponse');
const Discount = require('../models/discount.model');

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

function normalizeDays(days) {
  // days is e.g. ['Sun','Mon',...]
  return parseJSONArray(days, []).map(String);
}

function normalizeOrderTypes(orderTypes) {
  return parseJSONArray(orderTypes, []).map(String);
}

function normalizeBoolean(v) {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'yes') return true;
    if (s === 'false' || s === '0' || s === 'no') return false;
  }
  return Boolean(v);
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesCouponSearch(discount, searchName) {
  if (!searchName) return true;
  const q = String(searchName).trim();
  if (!q) return true;
  const re = new RegExp('.*' + escapeRegExp(q) + '.*', 'i');
  const title = discount.title ? String(discount.title) : '';
  const code = discount.code ? String(discount.code) : '';
  return re.test(title) || re.test(code);
}

function computeDiscountAvailability(discount, opts) {
  const { orderType, orderAmount } = opts;
  if (Number(discount.status) !== 1) return false;

  // usage limits: usage_limit_total=0 means unlimited
  const limitTotal = Number(discount.usage_limit_total || 0);
  const used = Number(discount.total_used_count || 0);
  if (limitTotal > 0 && used >= limitTotal) return false;

  if (orderType && Array.isArray(discount.order_type)) {
    if (!discount.order_type.map(String).includes(String(orderType))) return false;
  }

  if (Number.isFinite(orderAmount)) {
    const from = Number(discount.applicableamount_from || 0);
    const to = discount.applicableamount_to == null || discount.applicableamount_to === ''
      ? Infinity
      : Number(discount.applicableamount_to);
    if (!(orderAmount >= from && orderAmount <= to)) return false;
  }

  // Date window
  const now = new Date();
  if (discount.from_date instanceof Date && !Number.isNaN(discount.from_date.getTime())) {
    if (now < discount.from_date) return false;
  }
  if (discount.to_date instanceof Date && !Number.isNaN(discount.to_date.getTime())) {
    if (now > discount.to_date) return false;
  }

  // Day window
  const days = Array.isArray(discount.days) ? discount.days.map(String) : [];
  if (days.length > 0) {
    const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][now.getDay()];
    if (!days.includes(weekday)) return false;
  }

  // Time window (HH:mm)
  const curTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const fromTime = parseTimeOrNull(discount.from_time);
  const toTime = parseTimeOrNull(discount.to_time);

  if (fromTime && curTime < fromTime) return false;
  if (toTime && curTime > toTime) return false;

  return true;
}

module.exports.create = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const {
      discount_on,
      title,
      code,
      value_type,
      set_at,
      value_amount,
      terms_conditions,
      order_type,
      applicable_on,
      applicableamount_from,
      applicableamount_to,
      max_discount,
      usage_limit_total,
      usage_limit_per_user,
      first_order_only,
      is_combinable,
      from_date,
      to_date,
      from_time,
      to_time,
      days,
      validation,
      status
    } = req.body || {};

    if (!title || !value_type || !set_at || value_amount == null || !terms_conditions || !order_type || !applicable_on || applicableamount_from == null || applicableamount_to == null) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'Missing required discount fields.' }
      ]);
    }

    const validationNum = Number(validation) || 0;
    const uppercaseCode = validationNum === 2
      ? (toStringOrNull(code) ? String(code).trim().toUpperCase() : null)
      : null;

    if (validationNum === 2 && !uppercaseCode) {
      return apiResponse.ErrorResponse(res, 422, 'Coupon code is required for coupon type.');
    }

    if (validationNum !== 2) {
      // For non-coupon discounts, ignore code.
      // (We still store null for consistency.)
    }

    const normalizedOrderType = normalizeOrderTypes(order_type);
    const normalizedDays = normalizeDays(days);

    const existsByTitle = await Discount.findOne({ restaurant_id, title: String(title) });
    if (existsByTitle) return apiResponse.ErrorResponse(res, 409, 'Discount Name Already Exist');

    if (validationNum === 2) {
      const existsByCode = await Discount.findOne({ restaurant_id, code: uppercaseCode });
      if (existsByCode) return apiResponse.ErrorResponse(res, 409, 'Coupon Code Already Exists');
    }

    const doc = await Discount.create({
      restaurant_id,
      discount_on: toStringOrNull(discount_on),
      title: String(title),
      code: uppercaseCode,
      value_type: String(value_type),
      set_at: String(set_at),
      value_amount: String(value_amount),
      terms_conditions: String(terms_conditions),
      order_type: normalizedOrderType,
      applicable_on: String(applicable_on),
      applicableamount_from: Number(applicableamount_from) || 0,
      applicableamount_to: Number(applicableamount_to) || 0,
      max_discount: Number(max_discount) || 0,
      usage_limit_total: Number(usage_limit_total) || 0,
      usage_limit_per_user: Number(usage_limit_per_user) || 0,
      total_used_count: 0,
      first_order_only: normalizeBoolean(first_order_only),
      is_combinable: normalizeBoolean(is_combinable),
      from_date: parseDateOrNull(from_date),
      to_date: parseDateOrNull(to_date),
      from_time: parseTimeOrNull(from_time),
      to_time: parseTimeOrNull(to_time),
      days: normalizedDays,
      validation: validationNum,
      status: Number(status) === 0 ? 0 : 1
    });

    return apiResponse.successResponseWithData(res, 200, 'Discount Added Successfully', { _id: doc._id });
  } catch (err) {
    console.error('[offline discount.create]', err);
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

    const result = await Discount.paginate(
      { restaurant_id, title: { $regex: regex } },
      { page, limit: 10, sort: { createdAt: -1 } }
    );

    return apiResponse.successResponseWithData(res, 200, 'discounts', result);
  } catch (err) {
    console.error('[offline discount.list]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAll = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';
    const searchType = req.query && req.query.searchType ? String(req.query.searchType) : '';

    const regexName = searchName ? new RegExp('.*' + escapeRegExp(searchName) + '.*', 'i') : /.*/i;
    const regexType = searchType ? new RegExp('.*' + escapeRegExp(searchType) + '.*', 'i') : /.*/i;

    const all = await Discount.find({ restaurant_id });

    const filtered = all
      .filter((d) => Number(d.status) === 1)
      .filter((d) => regexName.test(String(d.title || '')))
      .filter((d) => Array.isArray(d.order_type) && d.order_type.some((ot) => regexType.test(String(ot))));

    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return apiResponse.successResponseWithData(res, 200, 'discounts', filtered);
  } catch (err) {
    console.error('[offline discount.listAll]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.listAllAvaliable = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const orderType = req.query && req.query.orderType ? String(req.query.orderType) : '';
    const orderAmount = toNumberOrNull(req.query && req.query.orderAmount ? req.query.orderAmount : undefined);
    const searchName = req.query && req.query.searchName ? String(req.query.searchName) : '';

    const all = await Discount.find({ restaurant_id });

    const available = all
      .filter((d) => computeDiscountAvailability(d, { orderType, orderAmount: Number.isFinite(orderAmount) ? orderAmount : undefined }))
      .filter((d) => matchesCouponSearch(d, searchName))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return apiResponse.successResponseWithData(res, 200, 'discounts', available);
  } catch (err) {
    console.error('[offline discount.listAllAvaliable]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.view = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    const doc = await Discount.findOne({ restaurant_id, _id: id });
    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    return apiResponse.successResponseWithData(res, 200, 'discount', doc);
  } catch (err) {
    console.error('[offline discount.view]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.update = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const existing = await Discount.findOne({ restaurant_id, _id: id });
    if (!existing) return apiResponse.ErrorResponse(res, 404, 'invalid_id');

    const {
      discount_on,
      title,
      code,
      value_type,
      set_at,
      value_amount,
      terms_conditions,
      order_type,
      applicable_on,
      applicableamount_from,
      applicableamount_to,
      max_discount,
      usage_limit_total,
      usage_limit_per_user,
      first_order_only,
      is_combinable,
      from_date,
      to_date,
      from_time,
      to_time,
      days,
      validation,
      status
    } = req.body || {};

    const validationNum = Number(validation) || 0;
    const uppercaseCode = validationNum === 2
      ? (toStringOrNull(code) ? String(code).trim().toUpperCase() : null)
      : null;

    if (validationNum === 2 && !uppercaseCode) {
      return apiResponse.ErrorResponse(res, 422, 'Coupon code is required for coupon type.');
    }

    const conflictTitle = await Discount.findOne({
      restaurant_id,
      title: String(title),
      _id: { $ne: id }
    });
    if (conflictTitle) return apiResponse.ErrorResponse(res, 409, 'discount already exist');

    if (validationNum === 2) {
      const conflictCode = await Discount.findOne({ restaurant_id, code: uppercaseCode, _id: { $ne: id } });
      if (conflictCode) return apiResponse.ErrorResponse(res, 409, 'Coupon Code Already Exists');
    }

    await Discount.updateOne(
      { restaurant_id, _id: id },
      {
        $set: {
          discount_on: toStringOrNull(discount_on),
          title: String(title),
          code: uppercaseCode,
          value_type: String(value_type),
          set_at: String(set_at),
          value_amount: String(value_amount),
          terms_conditions: String(terms_conditions),
          order_type: normalizeOrderTypes(order_type),
          applicable_on: String(applicable_on),
          applicableamount_from: Number(applicableamount_from) || 0,
          applicableamount_to: Number(applicableamount_to) || 0,
          max_discount: Number(max_discount) || 0,
          usage_limit_total: Number(usage_limit_total) || 0,
          usage_limit_per_user: Number(usage_limit_per_user) || 0,
          first_order_only: normalizeBoolean(first_order_only),
          is_combinable: normalizeBoolean(is_combinable),
          from_date: parseDateOrNull(from_date),
          to_date: parseDateOrNull(to_date),
          from_time: parseTimeOrNull(from_time),
          to_time: parseTimeOrNull(to_time),
          days: normalizeDays(days),
          validation: validationNum,
          status: Number(status) === 0 ? 0 : 1
        }
      }
    );

    const updated = await Discount.findOne({ restaurant_id, _id: id });
    return apiResponse.successResponseWithData(res, 200, 'Discount Updated Successfully', updated);
  } catch (err) {
    console.error('[offline discount.update]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.delete = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid_id');

    await Discount.deleteOne({ restaurant_id, _id: id });
    return apiResponse.successResponse(res, 200, 'Discount Deleted Successfully');
  } catch (err) {
    console.error('[offline discount.delete]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};
