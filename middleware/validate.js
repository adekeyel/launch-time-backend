const { validationResult } = require('express-validator');
const { ApiError } = require('../utils/response');

// Runs after an array of express-validator checks; collects errors and
// throws a single formatted ApiError instead of letting each route handle it.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const details = errors.array().map((e) => ({ field: e.path, message: e.msg }));
    throw new ApiError(422, 'Validation failed', details);
  }
  next();
};

module.exports = validate;
