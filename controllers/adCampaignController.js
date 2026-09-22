const adCampaignModel = require('../models/adCampaignModel');
const vendorModel = require('../models/vendorModel');
const settingsModel = require('../models/settingsModel');
const { ApiError, ok } = require('../utils/response');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');
const { AD_SPACES, DURATIONS, PLACEMENT_KEYS, priceKey, mediaKind } = require('../utils/adSpaces');

// Checks an uploaded file against one ad space's rules. Returns an error string, or null if it's fine.
const checkBanner = (file, space) => {
  if (!file) return 'Please upload your banner.';
  if (!space.mimeTypes.includes(file.mimetype)) return `This space only accepts: ${space.note}`;
  if (file.size > space.maxMb * 1024 * 1024) return `The banner is too large. The limit for this space is ${space.maxMb} MB.`;
  return null;
};

// GET /api/vendors/me/ad-spaces  — sizes/notes + current prices, for the "Advertise" form.
const getAdSpaces = async (req, res) => {
  const spaces = await Promise.all(
    PLACEMENT_KEYS.map(async (key) => {
      const space = AD_SPACES[key];
      const prices = {};
      for (const d of DURATIONS) prices[d] = Number(await settingsModel.getValue(priceKey(key, d), '0'));
      return { ...space, prices };
    })
  );
  return ok(res, { spaces, durations: DURATIONS });
};

// POST /api/vendors/me/campaigns  (multipart: banner)  { placement, durationDays, paymentRef }
// Available from Tier 1 up. Same manual OffPay-reference pattern as
// subscriptions — admin confirms payment, then the campaign is scheduled
// automatically using the exact banner the vendor uploaded here.
const createCampaign = async (req, res) => {
  const { durationDays } = req.body;
  const placement = req.body.placement || req.body.campaignType; // campaignType kept for older clients
  const paymentRef = String(req.body.paymentRef || '').trim();

  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  if (vendor.status !== 'approved') throw new ApiError(403, 'Your kitchen must be approved before you can advertise.');
  if (vendor.tier < 1) {
    throw new ApiError(400, 'Advertising is available once you reach Tier 1 (verified payment account).');
  }
  const space = AD_SPACES[placement];
  if (!space) throw new ApiError(422, `placement must be one of: ${PLACEMENT_KEYS.join(', ')}`);
  if (!DURATIONS.includes(Number(durationDays))) {
    throw new ApiError(422, `durationDays must be one of: ${DURATIONS.join(', ')}.`);
  }
  // Required so the admin has something to check against the OffPay account before activating.
  // (When automatic OffPay billing is wired in, this becomes optional/unused — payment
  // confirmation will come from OffPay's callback instead of a reference the vendor types in.)
  if (paymentRef.length < 4 || paymentRef.length > 100) {
    throw new ApiError(422, 'Enter your OffPay payment reference (4–100 characters).');
  }
  const bannerError = checkBanner(req.file, space);
  if (bannerError) throw new ApiError(422, bannerError);

  const price = Number(await settingsModel.getValue(priceKey(placement, Number(durationDays)), '0'));

  let uploaded;
  try {
    uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'launch-time/campaigns', maxDuration: 30 });
  } catch (err) {
    throw new ApiError(502, "Couldn't upload your banner. Please try again.");
  }

  try {
    const campaign = await adCampaignModel.create({
      vendorId: vendor.id,
      campaignType: placement,
      durationDays: Number(durationDays),
      price,
      paymentRef,
      mediaUrl: uploaded.url,
      mediaPublicId: uploaded.publicId,
      mediaType: uploaded.resourceType || mediaKind(req.file.mimetype),
    });
    return ok(res, campaign, 'Campaign created — pay via OffPay, then it will go live once confirmed.', 201);
  } catch (err) {
    deleteFromCloudinary(uploaded.publicId, uploaded.resourceType);
    throw err;
  }
};

// GET /api/vendors/me/campaigns
const listMyCampaigns = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  const rows = await adCampaignModel.findByVendor(vendor.id, req.query);
  return ok(res, { campaigns: rows });
};

module.exports = { getAdSpaces, createCampaign, listMyCampaigns, PLACEMENT_KEYS };
