const cartModel = require('../models/cartModel');
const foodModel = require('../models/foodModel');
const { ApiError, ok } = require('../utils/response');

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
const getCart = async (req, res) => {
  const items = await cartModel.findByCustomer(req.user.id);
  const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
  return ok(res, { items, total });
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
