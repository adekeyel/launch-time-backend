const settlementModel = require('../models/settlementModel');
const vendorModel = require('../models/vendorModel');
const { ApiError, ok } = require('../utils/response');
const { uploadBufferToCloudinary } = require('../utils/cloudinaryUpload');

// POST /api/vendors/me/settlements  - multipart/form-data, "receipt" file required
const createSettlement = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  const { amount, paymentRef, note } = req.body;
  if (!amount || !paymentRef) {
    throw new ApiError(422, 'amount and paymentRef are required.');
  }
  if (!req.file) {
    throw new ApiError(422, 'A receipt file ("receipt") is required.');
  }

  const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'launch-time/settlements' });

  const settlement = await settlementModel.create({
    vendorId: vendor.id,
    amount: Number(amount),
    paymentRef,
    receiptUrl: uploaded.url,
    receiptPublicId: uploaded.publicId,
    note: note || null,
  });

  return ok(res, settlement, 'Settlement request submitted.', 201);
};

// GET /api/vendors/me/settlements
const listMySettlements = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  const { page = 1, limit = 20 } = req.query;
  const rows = await settlementModel.findByVendor(vendor.id, { page: Number(page), limit: Number(limit) });
  return ok(res, { settlements: rows });
};

module.exports = { createSettlement, listMySettlements };
