const adModel = require('../models/adModel');
const { ApiError, ok } = require('../utils/response');

// GET /api/ads?placement=top&page=home
const getActiveAds = async (req, res) => {
  const { placement, page } = req.query;
  const ads = await adModel.findActive({ placement, page });
  return ok(res, ads);
};

// POST /api/ads/:id/track  { type: 'impression' | 'click' }
// Public, fire-and-forget hit counter — the frontend calls this once per
// ad shown (impression) and once per click.
const trackAd = async (req, res) => {
  const { type } = req.body;
  if (!['impression', 'click'].includes(type)) {
    throw new ApiError(422, 'type must be "impression" or "click".');
  }
  const updated = await adModel.trackHit(req.params.id, type);
  if (!updated) throw new ApiError(404, 'Ad not found.');
  return ok(res, { impressions: updated.impressions, clicks: updated.clicks });
};

module.exports = { getActiveAds, trackAd };
