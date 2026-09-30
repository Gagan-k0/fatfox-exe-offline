'use strict';

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const apiResponse = require('../helpers/apiResponse');
const Restaurant = require('../models/restaurant.model');
const RestaurantStaff = require('../models/restaurant_staff.model');
const RestaurantManager = require('../models/restaurant_manager.model');
const { ensureSeed, seedRestaurant } = require('../helpers/seed');

const TOKEN_TTL = process.env.JWT_TIMEOUT_DURATION_USER || '30d';

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function signUser(userData) {
  const secret = process.env.JWT_SECRET;
  const access_token = jwt.sign(userData, secret, { expiresIn: TOKEN_TTL });
  return {
    token_type: 'Bearer',
    expires_in: TOKEN_TTL,
    access_token,
    user: userData,
    subscription: {
      status: 'active',
      offline: true,
      licence: 'bypass'
    }
  };
}

function pinMatches(user, pin) {
  if (!user) return false;
  const hash = user.pin_hash || user.password;
  if (!hash) return false;
  try {
    return bcrypt.compareSync(String(pin), hash);
  } catch (_) {
    return false;
  }
}

function invalid(res) {
  return apiResponse.ErrorResponse(res, 403, 'Invalid Credentials');
}

async function login(req, res) {
  try {
    await ensureSeed();
    const username = (req.body.username || req.body.email || '').trim();
    const password = req.body.password || req.body.pin;
    if (!username || !password) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'Username and PIN/password are required.' }
      ]);
    }

    const rows = await Restaurant.aggregate([
      {
        $match: {
          username: { $regex: new RegExp('^' + escapeRegExp(username) + '$', 'i') }
        }
      },
      { $limit: 1 }
    ]);
    if (!rows.length) return invalid(res);
    const user = rows[0];
    if (!pinMatches(user, password)) return invalid(res);
    if (user.status === 0) return apiResponse.ErrorResponse(res, 403, 'Restaurant Blocked');

    const userData = {
      _id: user._id,
      username: user.username,
      restaurant_id: user._id,
      restaurant_no: user.restaurant_no,
      usertype: 'admin'
    };
    return apiResponse.successResponseWithData(res, 200, 'Login Success', signUser(userData));
  } catch (err) {
    console.error('[login]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
}

async function staffLogin(req, res) {
  try {
    const { restaurant_no, username, password } = req.body;
    if (!restaurant_no || !username || !password) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'restaurant_no, username and password are required.' }
      ]);
    }
    const restaurants = await Restaurant.aggregate([
      { $match: { restaurant_no } },
      { $limit: 1 }
    ]);
    if (!restaurants.length) return invalid(res);

    const users = await RestaurantStaff.aggregate([
      {
        $match: {
          restaurant_no,
          username: { $regex: new RegExp('^' + escapeRegExp(username) + '$', 'i') }
        }
      },
      { $limit: 1 }
    ]);
    if (!users.length) return invalid(res);
    const user = users[0];
    if (user.status === 0) return apiResponse.ErrorResponse(res, 403, 'User Blocked');
    if (!pinMatches(user, password)) return invalid(res);
    if (restaurants[0].status === 0) return apiResponse.ErrorResponse(res, 403, 'Restaurant Blocked');

    const userData = {
      _id: user._id,
      username: user.username,
      restaurant_id: user.restaurant_id,
      restaurant_no: user.restaurant_no,
      usertype: 'subadmin',
      permissions: user.permissions || []
    };
    return apiResponse.successResponseWithData(res, 200, 'Login Success', signUser(userData));
  } catch (err) {
    console.error('[staff-login]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
}

async function managerLogin(req, res) {
  try {
    const { restaurant_no, username, password } = req.body;
    if (!restaurant_no || !username || !password) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'restaurant_no, username and password are required.' }
      ]);
    }
    const restaurants = await Restaurant.aggregate([
      { $match: { restaurant_no } },
      { $limit: 1 }
    ]);
    if (!restaurants.length) return invalid(res);

    const users = await RestaurantManager.aggregate([
      {
        $match: {
          restaurant_no,
          username: { $regex: new RegExp('^' + escapeRegExp(username) + '$', 'i') }
        }
      },
      { $limit: 1 }
    ]);
    if (!users.length) return invalid(res);
    const user = users[0];
    if (user.status === 0) return apiResponse.ErrorResponse(res, 403, 'User Blocked');
    if (!pinMatches(user, password)) return invalid(res);
    if (restaurants[0].status === 0) return apiResponse.ErrorResponse(res, 403, 'Restaurant Blocked');

    const userData = {
      _id: user._id,
      username: user.username,
      restaurant_id: user.restaurant_id,
      restaurant_no: user.restaurant_no,
      usertype: 'admin',
      permissions: user.permissions || []
    };
    return apiResponse.successResponseWithData(res, 200, 'Login Success', signUser(userData));
  } catch (err) {
    console.error('[manager-login]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
}

async function setup(req, res) {
  try {
    const count = await Restaurant.countDocuments({});
    if (count > 0) {
      return apiResponse.ErrorResponse(res, 409, 'Setup already completed');
    }
    const name = (req.body.name || '').trim();
    const pin = String(req.body.pin || '').trim();
    const username = (req.body.username || 'admin').trim();
    if (!name || pin.length < 4) {
      return apiResponse.validationErrorWithData(res, 422, 'Validation Error.', [
        { msg: 'Restaurant name and a PIN of at least 4 digits are required.' }
      ]);
    }
    const hash = bcrypt.hashSync(pin, 10);
    const restaurant = await Restaurant.create({
      restaurant_no: 'OFFLINE-001',
      name,
      owner_name: req.body.owner_name || '',
      username,
      password: hash,
      pin_hash: hash,
      status: 1,
      restaurant_type: 'NONE',
      description: req.body.description || '',
      gstin: req.body.gstin || '',
      phone: req.body.phone || '',
      address: req.body.address || { line1: '', city: '', state: '', pincode: '', country: 'India' },
      location: { type: 'Point', coordinates: [0, 0], city: (req.body.address && req.body.address.city) || '' },
      offline: true
    });
    // Seed default data for the newly created restaurant
    await seedRestaurant(restaurant._id);
    const userData = {
      _id: restaurant._id,
      username: restaurant.username,
      restaurant_id: restaurant._id,
      restaurant_no: restaurant.restaurant_no,
      usertype: 'admin'
    };
    return apiResponse.successResponseWithData(res, 200, 'Setup complete', signUser(userData));
  } catch (err) {
    console.error('[setup]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
}

async function setupStatus(req, res) {
  try {
    const count = await Restaurant.countDocuments({});
    return apiResponse.successResponseWithData(res, 200, 'Setup status', { isDone: count > 0 });
  } catch (err) {
    console.error('[setupStatus]', err);
    return apiResponse.ErrorResponse(res, 500, 'internal_server_error');
  }
}

async function me(req, res) {
  return apiResponse.successResponseWithData(res, 200, 'OK', req.auth || req.user || {});
}

module.exports = { login, staffLogin, managerLogin, setup, me };
