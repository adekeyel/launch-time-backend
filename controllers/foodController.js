const foodModel = require('../models/foodModel');
const vendorModel = require('../models/vendorModel');
const { ApiError, ok } = require('../utils/response');
const { uploadBufferToCloudinary, deleteFromCloudinary } = require('../utils/cloudinaryUpload');

// GET /api/foods  (public)
const listFoods = async (req, res) => {
  const { search, category, vendorId, page = 1, limit = 20 } = req.query;
  const { rows, total } = await foodModel.findAll({
    search,
    category,
    vendorId,
    page: Number(page),
    limit: Number(limit),
  });
  return ok(res, { foods: rows, total, page: Number(page), limit: Number(limit) });
};

// GET /api/vendors/me/foods  (vendor only — sees every item they own,
// including unavailable ones, regardless of their approval status)
const listMyFoods = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  const { page = 1, limit = 50 } = req.query;
  const { rows, total } = await foodModel.findAllByOwner(vendor.id, { page: Number(page), limit: Number(limit) });
  return ok(res, { foods: rows, total });
};

// GET /api/foods/:id  (public)
const getFood = async (req, res) => {
  const food = await foodModel.findById(req.params.id);
  if (!food) throw new ApiError(404, 'Food item not found.');
  return ok(res, food);
};

// POST /api/foods  (vendor only, uses req.vendor from ownership middleware)
// Accepts multipart/form-data with an optional "media" file (image or short
// video, max ~60s) uploaded straight from the vendor's device to Cloudinary.
const createFood = async (req, res) => {
  if (!req.vendor) {
    throw new ApiError(403, 'Admins must specify a vendorId to create food on behalf of a vendor.');
  }
  const { name, description, price, category } = req.body;

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
    vendorId: req.vendor.id,
    name,
    description,
    price,
    category,
    image,
    imagePublicId,
    mediaType,
  });

  // Tier 0 (unverified — no OffPay payment account yet) vendors can only
  // ever save drafts; publishing requires Tier 1+.
  if (req.vendor.tier < 1 && food.is_available) {
    const draft = await foodModel.update(food.id, { is_available: false });
    return ok(res, draft, 'Saved as draft — verify your payment account (Tier 1) to publish it.', 201);
  }

  return ok(res, food, 'Food item created.', 201);
};

// PUT /api/foods/:id  (owning vendor or admin - via canModifyFood middleware)
const updateFood = async (req, res) => {
  const fields = { ...req.body };

  // Tier 0 vendors (not admins) can't flip a draft to available.
  if (req.user.role === 'vendor' && fields.is_available !== undefined) {
    const vendor = await vendorModel.findByUserId(req.user.id);
    if (vendor && vendor.tier < 1) {
      fields.is_available = false;
    }
  }

  if (req.file) {
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, {
      folder: 'launch-time/foods',
      maxDuration: 60,
    });
    fields.image = uploaded.url;
    fields.image_public_id = uploaded.publicId;
    fields.media_type = uploaded.resourceType;

    // req.food is attached by the canModifyFood ownership middleware
    if (req.food?.image_public_id) {
      deleteFromCloudinary(req.food.image_public_id, req.food.media_type);
    }
  }

  const updated = await foodModel.update(req.params.id, fields);
  return ok(res, updated, 'Food item updated.');
};

// DELETE /api/foods/:id  (owning vendor or admin)
const deleteFood = async (req, res) => {
  await foodModel.remove(req.params.id);
  if (req.food?.image_public_id) {
    deleteFromCloudinary(req.food.image_public_id, req.food.media_type);
  }
  return ok(res, null, 'Food item deleted.');
};

module.exports = { listFoods, listMyFoods, getFood, createFood, updateFood, deleteFood };
