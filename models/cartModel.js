const { query } = require('../config/db');

const upsertItem = async (customerId, foodId, quantity) => {
  const { rows } = await query(
    `INSERT INTO cart_items (customer_id, food_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (customer_id, food_id)
     DO UPDATE SET quantity = $3, updated_at = NOW()
     RETURNING *`,
    [customerId, foodId, quantity]
  );
  return rows[0];
};

const incrementItem = async (customerId, foodId, quantity) => {
  const { rows } = await query(
    `INSERT INTO cart_items (customer_id, food_id, quantity)
     VALUES ($1, $2, $3)
     ON CONFLICT (customer_id, food_id)
     DO UPDATE SET quantity = cart_items.quantity + $3, updated_at = NOW()
     RETURNING *`,
    [customerId, foodId, quantity]
  );
  return rows[0];
};

const findByCustomer = async (customerId) => {
  const { rows } = await query(
    `SELECT c.id, c.quantity, f.id AS food_id, f.name, f.price, f.image, f.is_available,
            v.id AS vendor_id, v.business_name
     FROM cart_items c
     JOIN foods f ON f.id = c.food_id
     JOIN vendors v ON v.id = f.vendor_id
     WHERE c.customer_id = $1
     ORDER BY c.created_at DESC`,
    [customerId]
  );
  return rows;
};

const findOwnedItem = async (customerId, cartItemId) => {
  const { rows } = await query(
    'SELECT * FROM cart_items WHERE id = $1 AND customer_id = $2',
    [cartItemId, customerId]
  );
  return rows[0];
};

const removeItem = async (customerId, cartItemId) => {
  await query('DELETE FROM cart_items WHERE id = $1 AND customer_id = $2', [
    cartItemId,
    customerId,
  ]);
};

const clearCart = async (customerId) => {
  await query('DELETE FROM cart_items WHERE customer_id = $1', [customerId]);
};

module.exports = { upsertItem, incrementItem, findByCustomer, findOwnedItem, removeItem, clearCart };
