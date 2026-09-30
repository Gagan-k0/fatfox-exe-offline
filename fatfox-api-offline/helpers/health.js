'use strict';

const apiResponse = require('./apiResponse');

const HEALTH_PATH = '/api/v1/health';
const HEALTH_SERVICE_ID = 'fatfox-api';

function healthPayload(dbUp, now) {
    return {
        service: HEALTH_SERVICE_ID,
        health: 'ok',
        db: dbUp ? 'up' : 'down',
        mode: 'offline',
        time: (now || new Date()).toISOString()
    };
}

function healthHandler(req, res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.set('Access-Control-Max-Age', '600');
        return res.status(204).end();
    }
    return apiResponse.successResponseWithData(
        res,
        0,
        'OK',
        healthPayload(true)
    );
}

module.exports = { HEALTH_PATH, HEALTH_SERVICE_ID, healthPayload, healthHandler };
