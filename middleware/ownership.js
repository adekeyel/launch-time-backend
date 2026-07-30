const { query } = require('../config/db');
const { ApiError } = require('../utils/response');

/**
 * Ensures the logged-in vendor owns the vendor profile referenced by the
 * request, UNLESS the requester is an admin — admins have full control
 * over every vendor's data per the platform's admin override policy.
 * Attaches req.vendor for downstream handlers.
 */
const loadOwnVendorOrAdmin = async (req, res, next) => {
  if (req.user.role === 'admin') return next();

  if (req.user.role !== 'vendor') {
    throw new ApiError(403, 'Only vendors or admins can perform this action.');
  }

  const { rows } = await query('SELECT * FROM vendors WHERE user_id = $1', [req.user.id]);
  if (!rows[0]) {
    throw new ApiError(404, 'Vendor profile not found. Please complete your vendor setup.');
  }

  req.vendor = rows[0];
  next();
};

/**
 * For a given food item, ensures the requester is either the owning
 * vendor or an admin. Admins can edit/delete ANY vendor's products.
 */
const canModifyFood = async (req, res, next) => {
  const { rows } = await query(
    `SELECT f.*, v.user_id AS vendor_user_id
     FROM foods f JOIN vendors v ON v.id = f.vendor_id
     WHERE f.id = $1`,
    [req.params.id]
  );
  const food = rows[0];
  if (!food) {
    throw new ApiError(404, 'Food item not found.');
  }

  if (req.user.role !== 'admin' && food.vendor_user_id !== req.user.id) {
    throw new ApiError(403, 'You can only manage your own food items.');
  }

  req.food = food;
  next();
};

module.exports = { loadOwnVendorOrAdmin, canModifyFood };
