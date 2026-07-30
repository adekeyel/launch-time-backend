const vendorModel = require('../models/vendorModel');
const { ApiError, ok } = require('../utils/response');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');

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
  return ok(res, { vendors: rows, total, page: Number(page), limit: Number(limit) });
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
  return ok(res, vendor);
};

// GET /api/vendors/me  (vendor - own profile)
const getMyVendorProfile = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  return ok(res, vendor);
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
  ];
  const fields = {};
  for (const key of SELF_EDITABLE) {
    if (req.body[key] !== undefined) fields[key] = req.body[key];
  }

  const updated = await vendorModel.update(vendor.id, fields);
  return ok(res, updated, 'Vendor profile updated.');
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
  return ok(res, updated, 'Logo updated.');
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
  return ok(res, updated, 'Banner updated.');
};

module.exports = {
  listVendors,
  getVendor,
  getMyVendorProfile,
  updateMyVendorProfile,
  uploadMyLogo,
  uploadMyBanner,
};
