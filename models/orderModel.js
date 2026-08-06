const { query, getClient } = require('../config/db');

/**
 * Creates an order + its order_items atomically inside a transaction,
 * and clears the relevant cart items for that vendor.
 *
 * IMPORTANT: paid_at is always NULL here, even when a paymentRef is
 * already assigned (paymentRef is just the reference the customer is
 * expected to pay against / that a card charge is tied to — it is not
 * proof of payment). paid_at is only ever set later, by an admin
 * explicitly confirming a bank transfer, or by Flutterwave verification
 * succeeding for a card payment. This is what the vendor go-ahead gate
 * (see orderController.updateOrderStatus) actually checks against.
 */
const createOrderFromCart = async ({
  customerId,
  vendorId,
  items,
  deliveryAddress,
  phone,
  notes,
  paymentMethod = null,
  paymentRef = null,
  receiptUrl = null,
  receiptPublicId = null,
  commissionRate = 0.05,
}) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const total = items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
    const commissionAmount = Math.round(total * commissionRate * 100) / 100;
    const payoutAmount = Math.round((total - commissionAmount) * 100) / 100;

    const orderResult = await client.query(
      `INSERT INTO orders (customer_id, vendor_id, total, delivery_address, phone, notes, payment_method, payment_ref, receipt_url, receipt_public_id, paid_at, commission_rate, commission_amount, payout_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NULL, $11, $12, $13) RETURNING *`,
      [
        customerId,
        vendorId,
        total,
        deliveryAddress,
        phone,
        notes,
        paymentMethod,
        paymentRef,
        receiptUrl,
        receiptPublicId,
        commissionRate,
        commissionAmount,
        payoutAmount,
      ]
    );
    const order = orderResult.rows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO order_items (order_id, food_id, food_name, quantity, price)
         VALUES ($1, $2, $3, $4, $5)`,
        [order.id, item.food_id, item.name, item.quantity, item.price]
      );
      await client.query('DELETE FROM cart_items WHERE customer_id = $1 AND food_id = $2', [
        customerId,
        item.food_id,
      ]);
    }

    await client.query('COMMIT');
    return order;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT o.*, v.business_name, v.user_id AS vendor_user_id, u.fullname AS customer_name, u.email AS customer_email
     FROM orders o
     JOIN vendors v ON v.id = o.vendor_id
     JOIN users u ON u.id = o.customer_id
     WHERE o.id = $1`,
    [id]
  );
  const order = rows[0];
  if (!order) return null;

  const itemsResult = await query('SELECT * FROM order_items WHERE order_id = $1', [id]);
  order.items = itemsResult.rows;
  return order;
};

const findByCustomer = async (customerId, { page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT o.*, v.business_name FROM orders o JOIN vendors v ON v.id = o.vendor_id
     WHERE o.customer_id = $1 ORDER BY o.created_at DESC LIMIT $2 OFFSET $3`,
    [customerId, limit, offset]
  );
  return rows;
};

const findByVendor = async (vendorId, { status, page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const params = [vendorId];
  let where = 'WHERE o.vendor_id = $1';
  if (status) {
    params.push(status);
    where += ` AND o.status = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT o.*, u.fullname AS customer_name, u.phone AS customer_phone FROM orders o
     JOIN users u ON u.id = o.customer_id
     ${where} ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
};

const findAllAdmin = async ({ status, page = 1, limit = 20 } = {}) => {
  const offset = (page - 1) * limit;
  const params = [];
  let where = '';
  if (status) {
    params.push(status);
    where = `WHERE o.status = $${params.length}`;
  }
  params.push(limit, offset);
  const { rows } = await query(
    `SELECT o.*, v.business_name, u.fullname AS customer_name FROM orders o
     JOIN vendors v ON v.id = o.vendor_id
     JOIN users u ON u.id = o.customer_id
     ${where} ORDER BY o.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  const countResult = await query(`SELECT COUNT(*)::int AS count FROM orders o ${where}`, status ? [status] : []);
  return { rows, total: countResult.rows[0].count };
};

const updateStatus = async (id, status) => {
  const { rows } = await query(
    'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
    [status, id]
  );
  return rows[0];
};

// All orders created together in one checkout share the same payment_ref
// (see orderController.checkout) — used to confirm every one of them at
// once, whether that's an admin confirming a transfer or Flutterwave
// verification succeeding for a card charge.
const findByPaymentRef = async (paymentRef) => {
  const { rows } = await query('SELECT * FROM orders WHERE payment_ref = $1', [paymentRef]);
  return rows;
};

// Marks the given orders paid (idempotent — only touches ones not already
// marked). Returns the orders that were actually just marked.
const markPaid = async (orderIds) => {
  if (!orderIds.length) return [];
  const { rows } = await query(
    `UPDATE orders SET paid_at = NOW()
     WHERE id = ANY($1::uuid[]) AND paid_at IS NULL
     RETURNING *`,
    [orderIds]
  );
  return rows;
};

// Delivered, payment-verified, at least a day past verification, and not
// already claimed by an earlier settlement request.
const findEligibleForSettlement = async (vendorId) => {
  const { rows } = await query(
    `SELECT * FROM orders
     WHERE vendor_id = $1
       AND status = 'delivered'
       AND paid_at IS NOT NULL
       AND paid_at <= NOW() - INTERVAL '1 day'
       AND settlement_id IS NULL
     ORDER BY paid_at ASC`,
    [vendorId]
  );
  return rows;
};

const linkOrdersToSettlement = async (orderIds, settlementId) => {
  if (!orderIds.length) return;
  await query('UPDATE orders SET settlement_id = $1 WHERE id = ANY($2::uuid[])', [settlementId, orderIds]);
};

// Frees up an order (back to "eligible") if its settlement gets rejected.
const unlinkSettlement = async (settlementId) => {
  await query('UPDATE orders SET settlement_id = NULL WHERE settlement_id = $1', [settlementId]);
};

const getItemsForFoodIds = async (foodIds) => {
  const { rows } = await query(
    `SELECT f.id AS food_id, f.name, f.price, f.is_available, f.vendor_id
     FROM foods f WHERE f.id = ANY($1::uuid[])`,
    [foodIds]
  );
  return rows;
};

module.exports = {
  createOrderFromCart,
  findById,
  findByCustomer,
  findByVendor,
  findAllAdmin,
  updateStatus,
  findByPaymentRef,
  markPaid,
  findEligibleForSettlement,
  linkOrdersToSettlement,
  unlinkSettlement,
  getItemsForFoodIds,
};
