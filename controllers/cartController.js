const cartModel = require('../models/cartModel');
const foodModel = require('../models/foodModel');
const { ApiError, ok } = require('../utils/response');
const { getOpenStatus } = require('../utils/hours');
const { computeDeliveryFee, amountToFreeDelivery, round2 } = require('../utils/delivery');

// POST /api/cart  { foodId, quantity }
const addToCart = async (req, res) => {
  const { foodId, quantity = 1 } = req.body;

  const food = await foodModel.findById(foodId);
  if (!food || !food.is_available) {
    throw new ApiError(404, 'Food item not available.');
  }

  const item = await cartModel.incrementItem(req.user.id, foodId, Number(quantity));
  return ok(res, item, 'Item added to cart.', 201);
};

// GET /api/cart
// Besides the items, returns a per-vendor breakdown (checkout splits the cart
// into one order per vendor, each with its own delivery fee and open/closed
// state). `total` is the food subtotal, as before; `grand_total` adds delivery.
const getCart = async (req, res) => {
  const rows = await cartModel.findByCustomer(req.user.id);

  const byVendor = new Map();
  const items = rows.map((row) => {
    const {
      vendor_delivery_fee: deliveryFee,
      vendor_free_delivery_above: freeAbove,
      vendor_opening_hours: openingHours,
      vendor_orders_paused: paused,
      ...item
    } = row;

    if (!byVendor.has(item.vendor_id)) {
      byVendor.set(item.vendor_id, {
        vendor_id: item.vendor_id,
        business_name: item.business_name,
        delivery_fee: deliveryFee,
        free_delivery_above: freeAbove,
        opening_hours: openingHours,
        orders_paused: paused,
        subtotal: 0,
      });
    }
    byVendor.get(item.vendor_id).subtotal += Number(item.price) * item.quantity;
    return item;
  });

  const vendors = [...byVendor.values()].map((v) => {
    const open = getOpenStatus(v);
    return {
      vendor_id: v.vendor_id,
      business_name: v.business_name,
      subtotal: round2(v.subtotal),
      delivery_fee: computeDeliveryFee(v, v.subtotal),
      free_delivery_above: v.free_delivery_above === null || v.free_delivery_above === undefined ? null : Number(v.free_delivery_above),
      amount_to_free_delivery: amountToFreeDelivery(v, v.subtotal),
      is_open: open.is_open,
      open_status: open.status,
      open_label: open.label,
    };
  });

  const subtotal = round2(vendors.reduce((sum, v) => sum + v.subtotal, 0));
  const deliveryTotal = round2(vendors.reduce((sum, v) => sum + v.delivery_fee, 0));

  return ok(res, {
    items,
    total: subtotal,
    subtotal,
    delivery_total: deliveryTotal,
    grand_total: round2(subtotal + deliveryTotal),
    vendors,
    has_closed_vendor: vendors.some((v) => !v.is_open),
  });
};

// PUT /api/cart/:id  { quantity }
const updateCartItem = async (req, res) => {
  const { quantity } = req.body;
  const owned = await cartModel.findOwnedItem(req.user.id, req.params.id);
  if (!owned) throw new ApiError(404, 'Cart item not found.');

  if (Number(quantity) <= 0) {
    await cartModel.removeItem(req.user.id, req.params.id);
    return ok(res, null, 'Item removed from cart.');
  }

  const updated = await cartModel.upsertItem(req.user.id, owned.food_id, Number(quantity));
  return ok(res, updated, 'Cart item updated.');
};

// DELETE /api/cart/:id
const removeCartItem = async (req, res) => {
  const owned = await cartModel.findOwnedItem(req.user.id, req.params.id);
  if (!owned) throw new ApiError(404, 'Cart item not found.');

  await cartModel.removeItem(req.user.id, req.params.id);
  return ok(res, null, 'Item removed from cart.');
};

module.exports = { addToCart, getCart, updateCartItem, removeCartItem };
