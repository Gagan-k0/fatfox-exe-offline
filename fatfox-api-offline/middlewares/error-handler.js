const apiResponse = require('../helpers/apiResponse');
module.exports = errorHandler;

function errorHandler(err, req, res, next) {
    if (typeof err === 'string') {
        return apiResponse.unauthorizedResponse(res, 401, err);
    }

    if (err && err.name === 'UnauthorizedError') {
        return apiResponse.unauthorizedResponse(res, 401, 'Invalid Token');
    }

    const status = 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : (err && err.message) || 'Internal server error';
    return apiResponse.ErrorResponse(res, status, message);
}
