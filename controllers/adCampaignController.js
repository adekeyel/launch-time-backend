const adCampaignModel = require('../models/adCampaignModel');
const vendorModel = require('../models/vendorModel');
const settingsModel = require('../models/settingsModel');
const { ApiError, ok } = require('../utils/response');

const DURATION_PRICE_KEYS = { 1: 'campaign_price_1day', 3: 'campaign_price_3day', 7: 'campaign_price_7day', 30: 'campaign_price_30day' };

const CAMPAIGN_TYPES = ['homepage', 'sponsored_search', 'category', 'spotlight', 'limited_offer', 'festival'];

// POST /api/vendors/me/campaigns  { campaignType, durationDays, paymentRef? }
// Available from Tier 1 up. Same manual OffPay-reference pattern as
// subscriptions and Tier 1 verification — admin confirms payment, then the
// campaign is scheduled automatically.
const createCampaign = async (req, res) => {
  const { campaignType, durationDays, paymentRef } = req.body;

  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  if (vendor.tier < 1) {
    throw new ApiError(400, 'Advertising is available once you reach Tier 1 (verified payment account).');
  }
  if (!CAMPAIGN_TYPES.includes(campaignType)) {
    throw new ApiError(422, `campaignType must be one of: ${CAMPAIGN_TYPES.join(', ')}`);
  }
  const priceKey = DURATION_PRICE_KEYS[Number(durationDays)];
  if (!priceKey) {
    throw new ApiError(422, 'durationDays must be one of: 1, 3, 7, 30.');
  }

  const price = Number(await settingsModel.getValue(priceKey, '0'));
  const campaign = await adCampaignModel.create({
    vendorId: vendor.id,
    campaignType,
    durationDays: Number(durationDays),
    price,
    paymentRef: paymentRef || null,
  });

  return ok(res, campaign, 'Campaign created — pay via OffPay, then it will go live once confirmed.', 201);
};

// GET /api/vendors/me/campaigns
const listMyCampaigns = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  const rows = await adCampaignModel.findByVendor(vendor.id, req.query);
  return ok(res, { campaigns: rows });
};

module.exports = { createCampaign, listMyCampaigns, CAMPAIGN_TYPES };
