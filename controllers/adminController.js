const bcrypt = require('bcryptjs');
const userModel = require('../models/userModel');
const vendorModel = require('../models/vendorModel');
const foodModel = require('../models/foodModel');
const orderModel = require('../models/orderModel');
const adModel = require('../models/adModel');
const settlementModel = require('../models/settlementModel');
const settingsModel = require('../models/settingsModel');
const subscriptionModel = require('../models/subscriptionModel');
const billingRecordModel = require('../models/billingRecordModel');
const adCampaignModel = require('../models/adCampaignModel');
const { sweepExpiredSubscriptions } = require('./subscriptionController');
const { query } = require('../config/db');
const { ApiError, ok } = require('../utils/response');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');

// ---------------- USERS ----------------

// GET /api/admin/users
const listUsers = async (req, res) => {
  const { role, page = 1, limit = 20 } = req.query;
  const { rows, total } = await userModel.findAll({ role, page: Number(page), limit: Number(limit) });
  return ok(res, { users: rows, total, page: Number(page), limit: Number(limit) });
};

// GET /api/admin/users/:id
const getUser = async (req, res) => {
  const user = await userModel.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found.');
  return ok(res, user);
};

// POST /api/admin/users  - admin can directly create any user, including other admins
const createUser = async (req, res) => {
  const { fullname, email, password, role = 'customer', phone } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) throw new ApiError(409, 'A user with this email already exists.');

  const hashed = await bcrypt.hash(password, 12);
  const user = await userModel.create({ fullname, email, password: hashed, role, phone });
  return ok(res, user, 'User created.', 201);
};

// PUT /api/admin/users/:id  - update profile fields
const updateUser = async (req, res) => {
  const { fullname, phone } = req.body;
  const updated = await userModel.updateProfile(req.params.id, { fullname, phone });
  if (!updated) throw new ApiError(404, 'User not found.');
  return ok(res, updated, 'User updated.');
};

// PUT /api/admin/users/:id/role  { role }
const changeUserRole = async (req, res) => {
  const { role } = req.body;
  if (!['customer', 'vendor', 'admin'].includes(role)) {
    throw new ApiError(422, 'Invalid role.');
  }
  const updated = await userModel.setRole(req.params.id, role);
  if (!updated) throw new ApiError(404, 'User not found.');
  return ok(res, updated, 'User role updated.');
};

// PUT /api/admin/users/:id/status  { isActive }
const setUserActiveStatus = async (req, res) => {
  const { isActive } = req.body;
  const updated = await userModel.setActiveStatus(req.params.id, Boolean(isActive));
  if (!updated) throw new ApiError(404, 'User not found.');
  return ok(res, updated, `User ${isActive ? 'activated' : 'deactivated'}.`);
};

// DELETE /api/admin/users/:id
const deleteUser = async (req, res) => {
  if (req.params.id === req.user.id) {
    throw new ApiError(400, 'You cannot delete your own admin account.');
  }
  await userModel.remove(req.params.id);
  return ok(res, null, 'User deleted.');
};

// ---------------- VENDORS ----------------

// GET /api/admin/vendors  (all statuses and tiers, unlike public browsing)
const listAllVendors = async (req, res) => {
  const { status, search, page = 1, limit = 20 } = req.query;
  const { rows, total } = await vendorModel.findAll({
    status,
    search,
    page: Number(page),
    limit: Number(limit),
    includeAll: true,
  });
  return ok(res, { vendors: rows, total, page: Number(page), limit: Number(limit) });
};

// POST /api/admin/vendors  - admin manually onboards a vendor + owner account
const createVendor = async (req, res) => {
  const { fullname, email, password, phone, businessName, address, description } = req.body;

  const existing = await userModel.findByEmail(email);
  if (existing) throw new ApiError(409, 'A user with this email already exists.');

  const hashed = await bcrypt.hash(password, 12);
  const user = await userModel.create({ fullname, email, password: hashed, role: 'vendor', phone });
  const vendor = await vendorModel.create({ userId: user.id, businessName, address, phone, description });
  const approved = await vendorModel.setStatus(vendor.id, 'approved');

  return ok(res, { user, vendor: approved }, 'Vendor created and approved.', 201);
};

// PUT /api/admin/vendors/:id
const updateVendor = async (req, res) => {
  const updated = await vendorModel.update(req.params.id, req.body);
  if (!updated) throw new ApiError(404, 'Vendor not found.');
  return ok(res, updated, 'Vendor updated.');
};

// PUT /api/admin/vendors/:id/status  { status: pending|approved|suspended|rejected }
const setVendorStatus = async (req, res) => {
  const { status } = req.body;
  if (!['pending', 'approved', 'suspended', 'rejected'].includes(status)) {
    throw new ApiError(422, 'Invalid vendor status.');
  }
  const updated = await vendorModel.setStatus(req.params.id, status);
  if (!updated) throw new ApiError(404, 'Vendor not found.');
  return ok(res, updated, `Vendor status set to ${status}.`);
};

// DELETE /api/admin/vendors/:id
const deleteVendor = async (req, res) => {
  await vendorModel.remove(req.params.id);
  return ok(res, null, 'Vendor deleted.');
};

// ---------------- FOODS (full control over every vendor's products) ----------------

// GET /api/admin/foods
const listAllFoods = async (req, res) => {
  const { search, category, vendorId, page = 1, limit = 20 } = req.query;
  const { rows, total } = await foodModel.findAll({
    search,
    category,
    vendorId,
    page: Number(page),
    limit: Number(limit),
    includeUnavailable: true,
    includeAll: true,
  });
  return ok(res, { foods: rows, total, page: Number(page), limit: Number(limit) });
};

// POST /api/admin/foods  { vendorId, ... }  - admin creates food on behalf of any vendor
// Accepts multipart/form-data with a "media" file (image or short video),
// uploaded directly from the admin's device to Cloudinary.
const createFoodForVendor = async (req, res) => {
  const { vendorId, name, description, price, category } = req.body;
  if (!vendorId) throw new ApiError(422, 'vendorId is required.');

  const vendor = await vendorModel.findById(vendorId);
  if (!vendor) throw new ApiError(404, 'Vendor not found.');

  let image = null;
  let imagePublicId = null;
  let mediaType = 'image';
  if (req.file) {
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'launch-time/foods',
      maxDuration: 60,
    });
    image = uploaded.url;
    imagePublicId = uploaded.publicId;
    mediaType = uploaded.resourceType;
  }

  const food = await foodModel.create({
    vendorId,
    name,
    description,
    price,
    category,
    image,
    imagePublicId,
    mediaType,
  });
  return ok(res, food, 'Food item created for vendor.', 201);
};

// PUT /api/admin/foods/:id  - admin can edit ANY vendor's food
const updateAnyFood = async (req, res) => {
  const fields = { ...req.body };

  if (req.file) {
    const existing = await foodModel.findById(req.params.id);
    if (!existing) throw new ApiError(404, 'Food item not found.');

    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'launch-time/foods',
      maxDuration: 60,
    });
    fields.image = uploaded.url;
    fields.image_public_id = uploaded.publicId;
    fields.media_type = uploaded.resourceType;

    if (existing.image_public_id) {
      deleteFromCloudinary(existing.image_public_id, existing.media_type);
    }
  }

  const updated = await foodModel.update(req.params.id, fields);
  if (!updated) throw new ApiError(404, 'Food item not found.');
  return ok(res, updated, 'Food item updated.');
};

// DELETE /api/admin/foods/:id  - admin can delete ANY vendor's food
const deleteAnyFood = async (req, res) => {
  await foodModel.remove(req.params.id);
  return ok(res, null, 'Food item deleted.');
};

// ---------------- ORDERS (oversight) ----------------

// GET /api/admin/orders
const listAllOrders = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const { rows, total } = await orderModel.findAllAdmin({ status, page: Number(page), limit: Number(limit) });
  return ok(res, { orders: rows, total, page: Number(page), limit: Number(limit) });
};

// PUT /api/admin/orders/:id  { status } - admin can force any transition
const forceUpdateOrderStatus = async (req, res) => {
  const { status } = req.body;
  const updated = await orderModel.updateStatus(req.params.id, status);
  if (!updated) throw new ApiError(404, 'Order not found.');
  return ok(res, updated, 'Order status updated by admin.');
};

// PUT /api/admin/orders/:id/verify-payment
// Marks a single order's transfer payment as verified (paid_at), unblocking
// the vendor's own "start preparing" action. Card payments are verified
// automatically via Flutterwave and don't need this — it's here for the
// manual bank-transfer path.
const verifyOrderPayment = async (req, res) => {
  const [updated] = await orderModel.markPaid([req.params.id]);
  if (!updated) {
    // Either the order doesn't exist, or it was already marked paid —
    // check which, so the admin gets an accurate message either way.
    const existing = await orderModel.findById(req.params.id);
    if (!existing) throw new ApiError(404, 'Order not found.');
    return ok(res, existing, 'Payment was already verified for this order.');
  }
  return ok(res, updated, 'Payment verified — the vendor can now start preparing this order.');
};

// ---------------- ANALYTICS ----------------

// GET /api/admin/analytics
const getAnalytics = async (req, res) => {
  const [{ rows: userStats }, { rows: vendorStats }, { rows: orderStats }, { rows: revenueStats }] =
    await Promise.all([
      query(`SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`),
      query(`SELECT status, COUNT(*)::int AS count FROM vendors GROUP BY status`),
      query(`SELECT status, COUNT(*)::int AS count FROM orders GROUP BY status`),
      query(
        `SELECT COALESCE(SUM(COALESCE(subtotal, total)), 0)::float AS total_revenue, COUNT(*)::int AS total_orders
         FROM orders WHERE status != 'cancelled'`
      ),
    ]);

  return ok(res, {
    usersByRole: userStats,
    vendorsByStatus: vendorStats,
    ordersByStatus: orderStats,
    revenue: revenueStats[0],
  });
};

// ---------------- ADS ----------------

// GET /api/admin/ads
const listAllAds = async (req, res) => {
  const { placement, page, isActive, pageNum = 1, limit = 50 } = req.query;
  const { rows, total } = await adModel.findAll({
    placement,
    page,
    isActive: isActive === undefined ? undefined : isActive === 'true',
    pageNum: Number(pageNum),
    limit: Number(limit),
  });
  return ok(res, { ads: rows, total });
};

// POST /api/admin/ads  - multipart/form-data, "media" file (image or short video)
const AD_PLACEMENTS = ['top', 'middle', 'bottom', 'hero', 'tile'];

const createAd = async (req, res) => {
  const { title, linkUrl, placement, page = 'all', displayOrder = 0, startsAt, endsAt } = req.body;

  if (!req.file) throw new ApiError(422, 'An image or video file ("media") is required for the ad.');
  if (!AD_PLACEMENTS.includes(placement)) {
    throw new ApiError(422, `placement must be one of: ${AD_PLACEMENTS.join(', ')}.`);
  }

  const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
    folder: 'launch-time/ads',
    maxDuration: 30,
  });

  const ad = await adModel.create({
    title,
    mediaUrl: uploaded.url,
    mediaPublicId: uploaded.publicId,
    mediaType: uploaded.resourceType,
    linkUrl,
    placement,
    page,
    displayOrder: Number(displayOrder) || 0,
    startsAt: startsAt || null,
    endsAt: endsAt || null,
  });

  return ok(res, ad, 'Ad created.', 201);
};

// PUT /api/admin/ads/:id  - optionally replace media
const updateAd = async (req, res) => {
  const existing = await adModel.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Ad not found.');

  const fields = { ...req.body };
  if (fields.placement !== undefined && !AD_PLACEMENTS.includes(fields.placement)) {
    throw new ApiError(422, `placement must be one of: ${AD_PLACEMENTS.join(', ')}.`);
  }
  if (fields.display_order !== undefined) fields.display_order = Number(fields.display_order);
  if (fields.is_active !== undefined) fields.is_active = fields.is_active === true || fields.is_active === 'true';

  if (req.file) {
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'launch-time/ads',
      maxDuration: 30,
    });
    fields.media_url = uploaded.url;
    fields.media_public_id = uploaded.publicId;
    fields.media_type = uploaded.resourceType;
    deleteFromCloudinary(existing.media_public_id, existing.media_type);
  }

  const updated = await adModel.update(req.params.id, fields);
  return ok(res, updated, 'Ad updated.');
};

// DELETE /api/admin/ads/:id
const deleteAd = async (req, res) => {
  const existing = await adModel.findById(req.params.id);
  if (!existing) throw new ApiError(404, 'Ad not found.');

  await adModel.remove(req.params.id);
  deleteFromCloudinary(existing.media_public_id, existing.media_type);
  return ok(res, null, 'Ad deleted.');
};

// ---------------- SETTLEMENTS (vendor payout review) ----------------

// GET /api/admin/settlements
const listAllSettlements = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const { rows, total } = await settlementModel.findAll({ status, page: Number(page), limit: Number(limit) });
  return ok(res, { settlements: rows, total });
};

// PUT /api/admin/settlements/:id  { status: approved|rejected }
const decideSettlement = async (req, res) => {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    throw new ApiError(422, 'status must be "approved" or "rejected".');
  }
  const updated = await settlementModel.updateStatus(req.params.id, status);
  if (!updated) throw new ApiError(404, 'Settlement not found.');

  // A rejected settlement frees up the orders it had claimed, so the
  // vendor can include them in a future request instead of them being
  // stuck in limbo forever.
  if (status === 'rejected') {
    await orderModel.unlinkSettlement(req.params.id);
  }

  return ok(res, updated, `Settlement ${status}.`);
};

// ---------------- SETTINGS (editable platform config) ----------------

// GET /api/admin/settings
const listSettings = async (req, res) => {
  const rows = await settingsModel.findAll();
  return ok(res, rows);
};

// PUT /api/admin/settings/:key  { value, isPublic? }
const updateSetting = async (req, res) => {
  const { value, isPublic } = req.body;
  if (value === undefined || value === null || value === '') {
    throw new ApiError(422, 'value is required.');
  }
  const updated = await settingsModel.setValue(req.params.key, String(value), isPublic);
  return ok(res, updated, 'Setting updated.');
};

// ---------------- VENDOR TIER (OffPay verification, Pro) ----------------

// PUT /api/admin/vendors/:id/tier  { tier: 0|1|2, offpayMerchantRef? }
// Tier upgrades happen here because OffPay confirmation isn't automated yet
// (no webhook/API access) — an admin verifies the vendor completed OffPay
// registration and upgrades them to Tier 1 manually. Tier 2 (Pro) will move
// to a real subscription/payment flow once that's built.
const setVendorTier = async (req, res) => {
  const { tier, offpayMerchantRef } = req.body;
  if (![0, 1, 2].includes(Number(tier))) {
    throw new ApiError(422, 'tier must be 0, 1, or 2.');
  }

  const fields = { tier: Number(tier) };
  if (Number(tier) >= 1) {
    fields.payment_verified_at = new Date();
    if (offpayMerchantRef) fields.offpay_merchant_ref = offpayMerchantRef;
  }
  if (Number(tier) >= 2) {
    fields.pro_since = new Date();
  }

  const before = await vendorModel.findById(req.params.id);
  if (!before) throw new ApiError(404, 'Vendor not found.');

  const updated = await vendorModel.update(req.params.id, fields);
  if (!updated) throw new ApiError(404, 'Vendor not found.');

  // First-time verification (Tier 0 -> 1+): everything the vendor saved while
  // unverified was forced to draft, so publish it now. Otherwise the shop would
  // be visible but its menu would still be empty.
  let published = 0;
  if (Number(before.tier) < 1 && Number(tier) >= 1) {
    published = await foodModel.publishAllForVendor(updated.id);
  }
  return ok(
    res,
    updated,
    published > 0
      ? `Vendor set to Tier ${tier}. ${published} draft menu item${published === 1 ? '' : 's'} published.`
      : `Vendor set to Tier ${tier}.`
  );
};

// ---------------- SUBSCRIPTIONS (Pro / Enterprise payment confirmation) ----------------

// GET /api/admin/subscriptions
const listAllSubscriptions = async (req, res) => {
  await sweepExpiredSubscriptions();
  const { status, plan, page = 1, limit = 20 } = req.query;
  const { rows, total } = await subscriptionModel.findAll({ status, plan, page: Number(page), limit: Number(limit) });
  return ok(res, { subscriptions: rows, total });
};

// PUT /api/admin/subscriptions/:id/activate
// Confirms OffPay payment was received and activates the subscription for
// one billing period; upgrades the vendor's tier (Pro=2, Enterprise=3).
const activateSubscription = async (req, res) => {
  const sub = await subscriptionModel.findById(req.params.id);
  if (!sub) throw new ApiError(404, 'Subscription not found.');

  const activated = await subscriptionModel.activate(req.params.id);
  await billingRecordModel.create({
    subscriptionId: activated.id,
    vendorId: activated.vendor_id,
    amount: activated.amount,
    billingCycle: activated.billing_cycle,
    paymentRef: activated.payment_ref,
    status: 'paid',
    periodStart: activated.current_period_start,
    periodEnd: activated.current_period_end,
  });

  const tier = activated.plan === 'enterprise' ? 3 : 2;
  const fields = { tier };
  if (tier === 2) fields.pro_since = new Date();
  await vendorModel.update(activated.vendor_id, fields);

  return ok(res, activated, `Subscription activated — vendor upgraded to ${activated.plan === 'enterprise' ? 'Enterprise' : 'Pro'}.`);
};

// PUT /api/admin/subscriptions/:id/reject
const rejectSubscription = async (req, res) => {
  const sub = await subscriptionModel.findById(req.params.id);
  if (!sub) throw new ApiError(404, 'Subscription not found.');
  const updated = await subscriptionModel.expire(req.params.id);
  return ok(res, updated, 'Subscription request rejected.');
};

// GET /api/admin/billing
const listAllBilling = async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const { rows, total } = await billingRecordModel.findAll({ page: Number(page), limit: Number(limit) });
  return ok(res, { records: rows, total });
};

// ---------------- AD CAMPAIGNS (vendor self-service, admin confirms payment) ----------------

// GET /api/admin/campaigns
const listAllCampaigns = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const { rows, total } = await adCampaignModel.findAll({ status, page: Number(page), limit: Number(limit) });
  return ok(res, { campaigns: rows, total });
};

// PUT /api/admin/campaigns/:id/activate
// Confirms payment, creates the linked `ads` row (reusing the same
// Cloudinary upload as manually-created ads) and schedules the campaign.
const activateCampaign = async (req, res) => {
  const campaign = await adCampaignModel.findById(req.params.id);
  if (!campaign) throw new ApiError(404, 'Campaign not found.');
  if (campaign.status !== 'pending_payment') throw new ApiError(400, 'Campaign is not awaiting activation.');

  const vendor = await vendorModel.findById(campaign.vendor_id);

  // Use the banner the vendor uploaded with their request by default. An admin
  // can still swap in a different file here (e.g. the vendor sent a fix by
  // email) without the vendor needing to submit a new campaign.
  let mediaUrl = campaign.media_url || vendor.banner_url || vendor.logo_url;
  let mediaPublicId = campaign.media_public_id || null;
  let mediaType = campaign.media_type || 'image';
  if (req.file) {
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'launch-time/campaigns', maxDuration: 30 });
    mediaUrl = uploaded.url;
    mediaPublicId = uploaded.publicId;
    mediaType = uploaded.resourceType;
  }
  if (!mediaUrl) {
    throw new ApiError(400, 'This campaign has no banner to use — upload one to activate it.');
  }

  // campaign_type is already one of ads.placement's values (hero/tile/top/middle/bottom),
  // so this campaign becomes exactly the ad space the vendor paid for — no guessing.
  const ad = await adModel.create({
    title: `${vendor.business_name} — ${campaign.campaign_type}`,
    mediaUrl,
    mediaPublicId,
    mediaType,
    linkUrl: `/vendors/${vendor.id}`,
    placement: campaign.campaign_type,
    page: 'all',
    displayOrder: 0,
  });

  const activated = await adCampaignModel.activate(campaign.id, ad.id);
  return ok(res, activated, 'Campaign activated and scheduled.');
};

// PUT /api/admin/campaigns/:id/reject
const rejectCampaign = async (req, res) => {
  const campaign = await adCampaignModel.findById(req.params.id);
  if (!campaign) throw new ApiError(404, 'Campaign not found.');
  const updated = await adCampaignModel.expire(req.params.id);
  return ok(res, updated, 'Campaign rejected.');
};

module.exports = {
  listUsers,
  getUser,
  createUser,
  updateUser,
  changeUserRole,
  setUserActiveStatus,
  deleteUser,
  listAllVendors,
  createVendor,
  updateVendor,
  setVendorStatus,
  deleteVendor,
  listAllFoods,
  createFoodForVendor,
  updateAnyFood,
  deleteAnyFood,
  listAllOrders,
  forceUpdateOrderStatus,
  verifyOrderPayment,
  getAnalytics,
  listAllAds,
  createAd,
  updateAd,
  deleteAd,
  listAllSettlements,
  decideSettlement,
  listSettings,
  updateSetting,
  setVendorTier,
  listAllSubscriptions,
  activateSubscription,
  rejectSubscription,
  listAllBilling,
  listAllCampaigns,
  activateCampaign,
  rejectCampaign,
};
