const { query, getClient } = require('../config/db');

// One review per delivered order (reviews.order_id is UNIQUE). The vendor's
// rating_avg / rating_count are kept up to date in the same transaction, so
// vendor listings (which select v.*) carry them without extra queries.
const create = async ({ orderId, customerId, vendorId, rating, comment }) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const inserted = await client.query(
      `INSERT INTO reviews (order_id, customer_id, vendor_id, rating, comment)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [orderId, customerId, vendorId, rating, comment]
    );

    await client.query(
      `UPDATE vendors
       SET rating_avg = s.avg_rating, rating_count = s.review_count
       FROM (
         SELECT ROUND(AVG(rating)::numeric, 1) AS avg_rating, COUNT(*)::int AS review_count
         FROM reviews WHERE vendor_id = $1
       ) s
       WHERE vendors.id = $1`,
      [vendorId]
    );

    await client.query('COMMIT');
    return inserted.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

const findByOrder = async (orderId) => {
  const { rows } = await query('SELECT * FROM reviews WHERE order_id = $1', [orderId]);
  return rows[0];
};

const findByVendor = async (vendorId, { page = 1, limit = 10 } = {}) => {
  const offset = (page - 1) * limit;
  const { rows } = await query(
    `SELECT r.id, r.rating, r.comment, r.created_at, u.fullname AS customer_name
     FROM reviews r JOIN users u ON u.id = r.customer_id
     WHERE r.vendor_id = $1
     ORDER BY r.created_at DESC
     LIMIT $2 OFFSET $3`,
    [vendorId, limit, offset]
  );
  const countResult = await query('SELECT COUNT(*)::int AS count FROM reviews WHERE vendor_id = $1', [vendorId]);
  return { rows, total: countResult.rows[0].count };
};

module.exports = { create, findByOrder, findByVendor };
