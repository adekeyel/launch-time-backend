const settlementModel = require('../models/settlementModel');
const vendorModel = require('../models/vendorModel');
const orderModel = require('../models/orderModel');
const { ApiError, ok } = require('../utils/response');
const { uploadBufferToCloudinary } = require('../utils/cloudinaryUpload');

// GET /api/vendors/me/settlements/eligible
// Orders that are delivered + payment-verified + at least a day past
// verification + not already claimed by an earlier settlement. This is
// what a vendor can request a settlement for right now.
const listEligibleOrders = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  const orders = await orderModel.findEligibleForSettlement(vendor.id);
  const total = orders.reduce((sum, o) => sum + Number(o.payout_amount), 0);
  return ok(res, { orders, total });
};

// POST /api/vendors/me/settlements  - multipart/form-data, "receipt" file required
// The amount is NOT supplied by the vendor — it's computed here from
// whichever orders are currently eligible, then those orders are locked to
// this settlement so they can't be claimed again. paymentRef + receipt are
// the vendor's proof that OffPay actually paid this amount out to them.
const createSettlement = async (req, res) => {
  const vendor = await vendorModel.findByUserId(req.user.id);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');

  const { paymentRef, note } = req.body;
  if (!paymentRef) {
    throw new ApiError(422, 'paymentRef is required.');
  }
  if (!req.file) {
    throw new ApiError(422, 'A receipt file ("receipt") is required.');
  }

  const eligibleOrders = await orderModel.findEligibleForSettlement(vendor.id);
  if (!eligibleOrders.length) {
    throw new ApiError(
      400,
      "No orders are eligible for settlement yet — an order becomes eligible the day after its payment is verified and it's marked delivered."
    );
  }
  const amount = eligibleOrders.reduce((sum, o) => sum + Number(o.payout_amount), 0);

  const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'launch-time/settlements' });

  const settlement = await settlementModel.create({
    vendorId: vendor.id,
    amount,
    paymentRef,
    receiptUrl: uploaded.url,
    receiptPublicId: uploaded.publicId,
    note: note || null,
  });

  await orderModel.linkOrdersToSettlement(
    eligibleOrders.map((o) => o.id),
    settlement.id
  );

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

module.exports = { listEligibleOrders, createSettlement, listMySettlements };
