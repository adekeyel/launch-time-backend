const vendorModel = require('../models/vendorModel');
const reviewModel = require('../models/reviewModel');
const { ApiError, ok } = require('../utils/response');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');
const { validateOpeningHours } = require('../utils/hours');
const { parseMoneyInput } = require('../utils/delivery');
const { presentVendor, presentReview } = require('../utils/presenters');

// GET /api/vendors  (public - browse approved, Tier 1+ vendors, ranked)
const listVendors = async (req, res) => {
  const { search, page = 1, limit = 20, lat, lng } = req.query;
  const parsedLat = lat !== undefined ? Number(lat) : undefined;
  const parsedLng = lng !== undefined ? Number(lng) : undefined;
  const { rows, total } = await vendorModel.findRanked({
    search,
    page: Number(page),
    limit: Number(limit),
    customerLat: Number.isFinite(parsedLat) ? parsedLat : undefined,
    customerLng: Number.isFinite(parsedLng) ? parsedLng : undefined,
  });
  // Public listing: owner email/name and payment references are not exposed.
  return ok(res, {
    vendors: rows.map((v) => presentVendor(v, { isPublic: true })),
    total,
    page: Number(page),
    limit: Number(limit),
  });
};

// GET /api/vendors/:id  (public)
const getVendor = async (req, res) => {
  const vendor = await vendorModel.findById(req.params.id);
  const isOwner = req.user?.id === vendor?.user_id;
  const isAdmin = req.user?.role === 'admin';

  if (!vendor) throw new ApiError(404, 'Vendor not found.');
  if (!isAdmin && !isOwner && (vendor.status !== 'approved' || vendor.tier < 1)) {
    throw new ApiError(404, 'Vendor not found.');
  }
  return ok(res, presentVendor(vendor, { isPublic: !isAdmin && !isOwner }));
};

// GET /api/vendors/me  (vendor - own profile)
const getMyVendorProfile = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  return ok(res, presentVendor(vendor));
};

// PUT /api/vendors/me  (vendor updates own profile — text/marketing fields only;
// tier, payment_verified_at, pro_since, and media public_ids are admin/system-set)
const updateMyVendorProfile = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  const SELF_EDITABLE = [
    'business_name',
    'description',
    'tagline',
    'categories',
    'eta',
    'address',
    'latitude',
    'longitude',
    'phone',
    'offpay_merchant_ref',
    'opening_hours',
    'orders_paused',
    'delivery_fee',
    'free_delivery_above',
  ];
  const fields = {};
  for (const key of SELF_EDITABLE) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }

  // Opening hours, pausing and delivery fee are validated here — the model
  // trusts what it's given.
  if (fields.opening_hours !== undefined) {
    fields.opening_hours = validateOpeningHours(fields.opening_hours);
  }
  if (fields.orders_paused !== undefined && typeof fields.orders_paused !== 'boolean') {
    throw new ApiError(422, 'orders_paused must be true or false.');
  }
  if (fields.delivery_fee !== undefined) {
    fields.delivery_fee = parseMoneyInput(ApiError, fields.delivery_fee, 'Delivery fee', { allowNull: false });
  }
  if (fields.free_delivery_above !== undefined) {
    const threshold = parseMoneyInput(ApiError, fields.free_delivery_above, 'Free-delivery amount');
    fields.free_delivery_above = threshold === 0 ? null : threshold;
  }

  const updated = await vendorModel.update(vendor.id, fields);
  return ok(res, presentVendor(updated), 'Vendor profile updated.');
};

// GET /api/vendors/:id/reviews  (public)
const listVendorReviews = async (req, res) => {
  const vendor = await vendorModel.findById(req.params.id);
  if (!vendor || vendor.status !== 'approved') throw new ApiError(404, 'Vendor not found.');

  const page = Math.max(Number(req.query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);
  const { rows, total } = await reviewModel.findByVendor(vendor.id, { page, limit });

  return ok(res, {
    reviews: rows.map(presentReview),
    total,
    page,
    limit,
    rating_avg: vendor.rating_avg === null || vendor.rating_avg === undefined ? null : Number(vendor.rating_avg),
    rating_count: Number(vendor.rating_count || 0),
  });
};

// PUT /api/vendors/me/logo  (multipart, field "media" - image only)
const uploadMyLogo = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  if (!req.file) throw new ApiError(422, 'A "media" image file is required.');

  const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'launch-time/vendor-logos' });
  if (uploaded.resourceType !== 'image') {
    deleteFromCloudinary(uploaded.publicId, uploaded.resourceType);
    throw new ApiError(400, 'Logo must be an image, not a video.');
  }

  if (vendor.logo_public_id) deleteFromCloudinary(vendor.logo_public_id, 'image');

  const updated = await vendorModel.update(vendor.id, {
    logo_url: uploaded.url,
    logo_public_id: uploaded.publicId,
  });
  return ok(res, presentVendor(updated), 'Logo updated.');
};

// PUT /api/vendors/me/banner  (multipart, field "media" - image or short video)
const uploadMyBanner = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  if (!req.file) throw new ApiError(422, 'A "media" image or video file is required.');

  const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
    folder: 'launch-time/vendor-banners',
    maxDuration: 30,
  });

  if (vendor.banner_public_id) deleteFromCloudinary(vendor.banner_public_id, vendor.banner_media_type);

  const updated = await vendorModel.update(vendor.id, {
    banner_url: uploaded.url,
    banner_public_id: uploaded.publicId,
    banner_media_type: uploaded.resourceType,
  });
  return ok(res, presentVendor(updated), 'Banner updated.');
};

module.exports = {
  listVendors,
  getVendor,
  getMyVendorProfile,
  updateMyVendorProfile,
  listVendorReviews,
  uploadMyLogo,
  uploadMyBanner,
};
