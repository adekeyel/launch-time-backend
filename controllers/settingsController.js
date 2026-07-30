const settingsModel = require('../models/settingsModel');
const { ok } = require('../utils/response');

// GET /api/settings — public, whitelisted keys only (e.g. offpay_registration_url).
// Returned as a flat { key: value } map so the frontend can do settings.offpay_registration_url.
const getPublicSettings = async (req, res) => {
  const rows = await settingsModel.findPublic();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return ok(res, map);
};

module.exports = { getPublicSettings };
