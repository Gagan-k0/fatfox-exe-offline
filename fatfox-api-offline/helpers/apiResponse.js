exports.successResponse = function (res, code = 0, msg) {
    var data = {
        status: {
            code: code,
            message: msg
        }
    };
    return res.status(200).json(data);
};

exports.successResponseWithData = function (res, code = 0, msg, data) {
    var resData = {
        status: {
            code: code,
            message: msg
        },
        data: data
    };
    return res.status(200).json(resData);
};

exports.ErrorResponse = function (res, code = 0, msg) {
    var data = {
        status: {
            code: code,
            message: msg
        }
    };
    return res.status(200).json(data);
};

exports.ErrorResponseWithData = function (res, code = 0, msg, data) {
    var payload = {
        status: {
            code: code,
            message: msg
        },
        data: data
    };
    return res.status(200).json(payload);
};

exports.notFoundResponse = function (res, code = 404, msg) {
    var data = {
        status: {
            code: code,
            message: msg
        }
    };
    return res.status(200).json(data);
};

exports.validationErrorWithData = function (res, code = 0, msg, data) {
    var resData = {
        status: {
            code: code,
            message: msg
        },
        data: data
    };
    return res.status(200).json(resData);
};

exports.unauthorizedResponse = function (res, code = 401, msg) {
    var data = {
        status: {
            code: code,
            message: msg
        }
    };
    return res.status(code).json(data);
};
