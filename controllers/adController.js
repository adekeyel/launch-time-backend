const adModel = require('../models/adModel');
const { ok } = require('../utils/response');

// GET /api/ads?placement=top&page=home
const getActiveAds = async (req, res) => {
  const { placement, page } = req.query;
  const ads = await adModel.findActive({ placement, page });
  return ok(res, ads);
};

module.exports = { getActiveAds };
