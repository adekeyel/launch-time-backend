const cartModel = require('../models/cartModel');
const orderModel = require('../models/orderModel');
const vendorModel = require('../models/vendorModel');
const { ApiError, ok } = require('../utils/response');
const { sendOrderConfirmationEmail, sendOrderStatusUpdateEmail } = require('../utils/email');
const { uploadBufferToCloudinary } = require('../utils/cloudinaryUpload');
const { generateRandomToken } = require('../utils/jwt');
const settingsModel = require('../models/settingsModel');
const flutterwave = require('../utils/flutterwave');

const VALID_TRANSITIONS = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['delivered'],
  delivered: [],
  cancelled: [],
};

// POST /api/orders  { deliveryAddress, phone, notes, paymentMethod }
// Checks out the customer's ENTIRE cart, splitting into one order per vendor.
// Cash on delivery isn't offered — every order is paid into the single
// company account (transfer, confirmed manually against an uploaded
// receipt) or by card (charged via Flutterwave and verified automatically).
// Accepts multipart/form-data with an optional "receipt" file for transfer
// payments, uploaded directly to Cloudinary — the same reference + receipt
// is recorded against every order in this checkout since they're paid
// together in one sitting.
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
  if (paymentMethod && !['card', 'transfer'].includes(paymentMethod)) {
    throw new ApiError(422, 'paymentMethod must be one of: card, transfer.');
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

  // Card payments are charged once, across the whole checkout (mirroring
  // the shared payment_ref) — send the customer to Flutterwave's hosted
  // checkout, then verify + mark every order from this payment_ref paid
  // once they come back (see verifyCardPayment / flutterwaveWebhook).
  let paymentLink = null;
  if (paymentMethod === 'card') {
    const total = createdOrders.reduce((sum, o) => sum + Number(o.total), 0);
    try {
      paymentLink = await flutterwave.initializePayment({
        txRef: paymentRef,
        amount: total,
        email: req.user.email,
        name: req.user.fullname,
        phone,
        redirectUrl: `${process.env.CLIENT_URL}/checkout/callback`,
      });
    } catch (err) {
      // The orders already exist (as unpaid) — surface the failure clearly
      // rather than silently leaving the customer on a blank checkout.
      throw new ApiError(502, `Card payment could not be started: ${err.message}`);
    }
  }

  return ok(res, { orders: createdOrders, paymentLink }, 'Order(s) placed successfully.', 201);
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

  // The vendor go-ahead: payment must be verified (paid_at set — either by
  // an admin confirming a transfer receipt, or Flutterwave confirming a
  // card charge) before a vendor can start preparing the order. Admins can
  // always override this (e.g. to unblock a manually-confirmed edge case).
  if (req.user.role !== 'admin' && order.status === 'pending' && status === 'preparing' && !order.paid_at) {
    throw new ApiError(400, 'Payment for this order hasn\'t been verified yet. We\'ll notify you as soon as it is.');
  }

  const updated = await orderModel.updateStatus(order.id, status);
  const full = await orderModel.findById(order.id);

  sendOrderStatusUpdateEmail(full.customer_email, full.customer_name, full).catch(() => {});

  return ok(res, updated, 'Order status updated.');
};

// GET /api/orders/verify-payment?txRef=LT-XXXXXXXXXX  -- customer-facing,
// called from the /checkout/callback page after Flutterwave redirects back.
const verifyCardPayment = async (req, res) => {
  const { txRef } = req.query;
  if (!txRef) throw new ApiError(422, 'txRef is required.');

  const orders = await orderModel.findByPaymentRef(txRef);
  if (!orders.length) throw new ApiError(404, 'No orders found for this payment reference.');
  if (orders[0].customer_id !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError(403, 'You do not have access to this payment.');
  }

  const result = await flutterwave.verifyByReference(txRef);
  if (!result.successful) {
    return ok(res, { verified: false, orders }, 'Payment was not successful.');
  }

  const expectedTotal = orders.reduce((sum, o) => sum + Number(o.total), 0);
  if (Number(result.amount) < expectedTotal) {
    // Under-payment — do not mark as paid, this needs a human to look at it.
    throw new ApiError(409, 'The amount paid does not match the order total. Contact support.');
  }

  await orderModel.markPaid(orders.map((o) => o.id));
  const updatedOrders = await Promise.all(orders.map((o) => orderModel.findById(o.id)));

  return ok(res, { verified: true, orders: updatedOrders }, 'Payment verified.');
};

// POST /api/webhooks/flutterwave  -- server-to-server, no auth middleware.
// This is the reliable source of truth (the customer's browser redirect
// alone can be missed if they close the tab); verifyCardPayment above is
// the fast-path for when they do come back.
const flutterwaveWebhook = async (req, res) => {
  const signature = req.headers['verif-hash'];
  if (!signature || signature !== process.env.FLW_WEBHOOK_HASH) {
    return res.status(401).json({ received: false });
  }

  const event = req.body;
  const txRef = event?.data?.tx_ref;
  const status = event?.data?.status;

  if (txRef && status === 'successful') {
    try {
      const result = await flutterwave.verifyByReference(txRef);
      if (result.successful) {
        const orders = await orderModel.findByPaymentRef(txRef);
        const expectedTotal = orders.reduce((sum, o) => sum + Number(o.total), 0);
        if (Number(result.amount) >= expectedTotal) {
          await orderModel.markPaid(orders.map((o) => o.id));
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Flutterwave webhook processing failed:', err);
    }
  }

  // Always 200 so Flutterwave doesn't endlessly retry a webhook we've
  // already looked at — verifyCardPayment is a fine fallback either way.
  return res.status(200).json({ received: true });
};

module.exports = { checkout, listOrders, getOrder, updateOrderStatus, verifyCardPayment, flutterwaveWebhook };
