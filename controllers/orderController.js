const cartModel = require('../models/cartModel');
const orderModel = require('../models/orderModel');
const vendorModel = require('../models/vendorModel');
const { ApiError, ok } = require('../utils/response');
const { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } = require('../utils/email');
const { uploadBufferToCloudinary } = require('../utils/cloudinaryUpload');
const { generateRandomToken } = require('../utils/jwt');
const settingsModel = require('../models/settingsModel');

const VALID_TRANSITIONS = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered'],
  delivered: [],
  cancelled: [],
};

// POST /api/orders  { deliveryAddress, phone, notes, paymentMethod }
// Checks out the customer's ENTIRE cart, splitting into one order per vendor.
// Accepts multipart/form-data with an optional "receipt" file (a payment
// screenshot/PDF for transfer payments) uploaded directly to Cloudinary —
// the same reference + receipt is recorded against every order in this
// checkout since they're paid together in one sitting.
const checkout = async (req, res) => {
  const { deliveryAddress, phone, notes, paymentMethod } = req.body;
  const cartItems = await cartModel.findByCustomer(req.user.id);

  if (!cartItems.length) {
    throw new ApiError(400, 'Your cart is empty.');
  }

  const unavailable = cartItems.filter((i) => !i.is_available);
  if (unavailable.length) {
    throw new ApiError(400, `Some items are no longer available: ${unavailable.map((i) => i.name).join(', ')}`);
  }

  if (!deliveryAddress || !phone) {
    throw new ApiError(422, 'deliveryAddress and phone are required for checkout.');
  }
  if (paymentMethod && !['card', 'transfer', 'cash'].includes(paymentMethod)) {
    throw new ApiError(422, 'paymentMethod must be one of: card, transfer, cash.');
  }

  let receiptUrl = null;
  let receiptPublicId = null;
  if (req.file) {
    const uploaded = await uploadBufferToCloudinary(req.file.buffer, { folder: 'launch-time/receipts' });
    receiptUrl = uploaded.url;
    receiptPublicId = uploaded.publicId;
  }
  const paymentRef = paymentMethod ? `LT-${generateRandomToken().slice(0, 10).toUpperCase()}` : null;

  // Defensive re-check: a cart item's vendor could have lost Tier 1+ status
  // (or been suspended) between browsing and checkout.
  const vendorIds = [...new Set(cartItems.map((i) => i.vendor_id))];
  for (const vendorId of vendorIds) {
    const vendor = await vendorModel.findById(vendorId);
    if (!vendor || vendor.status !== 'approved' || vendor.tier < 1) {
      throw new ApiError(400, `${vendor?.business_name ?? 'A vendor'} in your cart is not currently accepting orders.`);
    }
  }

  const commissionRate = Number(await settingsModel.getValue('commission_rate', '0.05'));

  const byVendor = cartItems.reduce((acc, item) => {
    acc[item.vendor_id] = acc[item.vendor_id] || [];
    acc[item.vendor_id].push(item);
    return acc;
  }, {});

  const createdOrders = [];
  for (const vendorId of Object.keys(byVendor)) {
    const order = await orderModel.createOrderFromCart({
      customerId: req.user.id,
      vendorId,
      items: byVendor[vendorId],
      deliveryAddress,
      phone,
      notes,
      paymentMethod: paymentMethod || null,
      paymentRef,
      receiptUrl,
      receiptPublicId,
      commissionRate,
    });
    const full = await orderModel.findById(order.id);
    createdOrders.push(full);

    sendOrderConfirmationEmail(req.user.email, req.user.fullname, full).catch(() => {});
  }

  return ok(res, createdOrders, 'Order(s) placed successfully.', 201);
};

// GET /api/orders  (role-aware: customer sees own, vendor sees own vendor's, admin sees all)
const listOrders = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;

  if (req.user.role === 'customer') {
    const rows = await orderModel.findByCustomer(req.user.id, { page: Number(page), limit: Number(limit) });
    return ok(res, { orders: rows });
  }

  if (req.user.role === 'vendor') {
    const vendor = await vendorModel.findByUserId(req.user.id);
    if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
    const rows = await orderModel.findByVendor(vendor.id, { status, page: Number(page), limit: Number(limit) });
    return ok(res, { orders: rows });
  }

  // admin
  const { rows, total } = await orderModel.findAllAdmin({ status, page: Number(page), limit: Number(limit) });
  return ok(res, { orders: rows, total, page: Number(page), limit: Number(limit) });
};

// GET /api/orders/:id
const getOrder = async (req, res) => {
  const order = await orderModel.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found.');

  const isOwner = order.customer_id === req.user.id;
  const isVendorOwner = order.vendor_user_id === req.user.id;
  if (req.user.role !== 'admin' && !isOwner && !isVendorOwner) {
    throw new ApiError(403, 'You do not have access to this order.');
  }

  return ok(res, order);
};

// PUT /api/orders/:id  { status }  -- vendor (own orders) or admin
const updateOrderStatus = async (req, res) => {
  const { status } = req.body;
  const order = await orderModel.findById(req.params.id);
  if (!order) throw new ApiError(404, 'Order not found.');

  const isVendorOwner = order.vendor_user_id === req.user.id;
  if (req.user.role !== 'admin' && !isVendorOwner) {
    throw new ApiError(403, 'Only the owning vendor or an admin can update this order.');
  }

  const allowedNext = VALID_TRANSITIONS[order.status] || [];
  if (req.user.role !== 'admin' && !allowedNext.includes(status)) {
    throw new ApiError(400, `Cannot move order from "${order.status}" to "${status}".`);
  }

  const updated = await orderModel.updateStatus(order.id, status);
  const full = await orderModel.findById(order.id);

  sendOrderStatusUpdateEmail(full.customer_email, full.customer_name, full).catch(() => {});

  return ok(res, updated, 'Order status updated.');
};

module.exports = { checkout, listOrders, getOrder, updateOrderStatus };
