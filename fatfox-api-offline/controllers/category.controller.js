'use strict';

const apiResponse = require('../helpers/apiResponse');
const Category = require('../models/category.model');

async function nextSlno(restaurant_id) {
  const rows = await Category.find({ restaurant_id }).sort({ slno: -1 }).limit(1);
  if (!rows || !rows.length) return 1;
  const max = Number(rows[0].slno || 0);
  return max + 1;
}

function normalizeBool(value) {
  return value === true || value === 1 || value === '1' || (typeof value === 'string' && value.toLowerCase() === 'true');
}

module.exports.create = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const {
      valuename,
      displayname,
      restricted,
      famous,
      most_selling,
      meal_times,
      display_priority,
      departments
    } = req.body || {};

    if (!valuename || !displayname) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'valuename and displayname are required' }
      ]);
    }

    const existsByValue = await Category.findOne({ restaurant_id, valuename: String(valuename) });
    if (existsByValue) return apiResponse.ErrorResponse(res, 409, 'Category already exist');

    const existsByDisplay = await Category.findOne({ restaurant_id, displayname: String(displayname) });
    if (existsByDisplay) return apiResponse.ErrorResponse(res, 409, 'Category Display Name Already Exist');

    const slno = await nextSlno(restaurant_id);

    const doc = await Category.create({
      restaurant_id,
      slno,
      valuename: String(valuename),
      displayname: String(displayname),
      restricted: normalizeBool(restricted) ? 1 : 0,
      famous: normalizeBool(famous) ? 1 : 0,
      most_selling: normalizeBool(most_selling) ? 1 : 0,
      meal_times: Array.isArray(meal_times) ? meal_times : [],
      display_priority: display_priority === undefined || display_priority === null || display_priority === ''
        ? null
        : Number(display_priority),
      departments: Array.isArray(departments) ? departments : [],
      image: '',
      status: 1
    });

    return apiResponse.successResponseWithData(res, 200, 'Category Added Successfully', { _id: doc._id });
  } catch (err) {
    console.error('[offline category.create]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.list = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    if (!restaurant_id) return apiResponse.ErrorResponse(res, 403, 'Missing restaurant');

    const page = req.query && req.query.page ? Number(req.query.page) : 1;
    const searchName = (req.query && req.query.searchName) ? String(req.query.searchName) : '';
    const regex = searchName ? new RegExp('.*' + searchName + '.*', 'i') : /.*/i;

    const query = {
      restaurant_id,
      valuename: { $regex: regex }
    };

    const result = await Category.paginate(query, {
      page,
      limit: 10,
      sort: { slno: 1, displayname: 1 }
    });

    return apiResponse.successResponseWithData(res, 200, 'categories', result);
  } catch (err) {
    console.error('[offline category.list]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.view = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const doc = await Category.findOne({ restaurant_id, _id: id });
    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');
    return apiResponse.successResponseWithData(res, 200, 'OK', doc);
  } catch (err) {
    console.error('[offline category.view]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.update = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const {
      valuename,
      displayname,
      restricted,
      famous,
      most_selling,
      meal_times,
      display_priority,
      departments
    } = req.body || {};

    const doc = await Category.findOneAndUpdate(
      { restaurant_id, _id: id },
      {
        $set: {
          valuename: valuename !== undefined ? String(valuename) : undefined,
          displayname: displayname !== undefined ? String(displayname) : undefined,
          restricted: restricted !== undefined ? (normalizeBool(restricted) ? 1 : 0) : undefined,
          famous: famous !== undefined ? (normalizeBool(famous) ? 1 : 0) : undefined,
          most_selling: most_selling !== undefined ? (normalizeBool(most_selling) ? 1 : 0) : undefined,
          meal_times: meal_times !== undefined ? (Array.isArray(meal_times) ? meal_times : []) : undefined,
          display_priority: display_priority !== undefined ? (display_priority === '' || display_priority === null ? null : Number(display_priority)) : undefined,
          departments: departments !== undefined ? (Array.isArray(departments) ? departments : []) : undefined,
        }
      },
      { new: true }
    );

    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');
    return apiResponse.successResponseWithData(res, 200, 'Updated Successfully', doc);
  } catch (err) {
    console.error('[offline category.update]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.updateStatus = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    const apiStatus = req.body && typeof req.body.status !== 'undefined' ? (Number(req.body.status) === 0 ? 0 : 1) : 1;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    const doc = await Category.findOneAndUpdate(
      { restaurant_id, _id: id },
      { $set: { status: apiStatus } },
      { new: true }
    );

    if (!doc) return apiResponse.ErrorResponse(res, 404, 'invalid_id');
    return apiResponse.successResponseWithData(res, 200, 'OK', doc);
  } catch (err) {
    console.error('[offline category.updateStatus]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};

module.exports.delete = async (req, res) => {
  try {
    const restaurant_id = req.auth && req.auth.restaurant_id;
    const id = req.params && req.params.id;
    if (!restaurant_id || !id) return apiResponse.ErrorResponse(res, 422, 'invalid');

    await Category.deleteOne({ restaurant_id, _id: id });
    return apiResponse.successResponseWithData(res, 200, 'Deleted', { _id: id });
  } catch (err) {
    console.error('[offline category.delete]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
};
