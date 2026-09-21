const { query } = require('../config/db');

const create = async ({ userId, businessName, description, address, phone, tagline = null, categories = [], eta = null }) => {
  const { rows } = await query(
    `INSERT INTO vendors (user_id, business_name, description, address, phone, tagline, categories, eta)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [userId, businessName, description, address, phone, tagline, categories, eta]
  );
  return rows[0];
};

const findById = async (id) => {
  const { rows } = await query(
    `SELECT v.*, u.fullname AS owner_name, u.email AS owner_email, u.is_active AS owner_active
     FROM vendors v JOIN users u ON u.id = v.user_id WHERE v.id = $1`,
    [id]
  );
  return rows[0];
};

const findByUserId = async (userId) => {
  const { rows } = await query('SELECT * FROM vendors WHERE user_id = $1', [userId]);
  return rows[0];
};

const findAll = async ({ status, search, page = 1, limit = 20, includeAll = false } = {}) => {
  const offset = (page - 1) * limit;
  const conditions = [];
  const params = [];

  if (includeAll) {
    // Admin view: see every vendor regardless of status/tier, optionally
    // narrowed with an explicit status filter.
    if (status) {
      params.push(status);
      conditions.push(`v.status = $${params.length}`);
    }
  } else {
    // Public browsing: only approved AND Tier 1+ vendors are visible.
    // Tier 0 (unverified, no OffPay payment account) vendors stay hidden
    // from customers even if an admin has approved their profile.
    conditions.push(`v.status = 'approved'`);
    conditions.push(`v.tier >= 1`);
  }

  if (search) {
    params.push(`%${search}%`);
    conditions.push(`v.business_name ILIKE $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await query(
    `SELECT v.*, u.fullname AS owner_name, u.email AS owner_email
     FROM vendors v JOIN users u ON u.id = v.user_id
     ${where}
     ORDER BY v.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  const countParams = params.slice(0, params.length - 2);
  const countResult = await query(
    `SELECT COUNT(*)::int AS count FROM vendors v ${where}`,
    countParams
  );

  return { rows, total: countResult.rows[0].count };
};

// ---------------------------------------------------------------------
// RANKING ALGORITHM
//
// Public vendor listings are ordered: Sponsored (active ad campaign) >
// Pro/Enterprise (tier) > Verified (tier 1), and within each group by a
// weighted score across configurable factors (see `settings` keys
// ranking_weight_*). Weights and the minimum-orders-before-rating-counts
// safeguard are all admin-editable without a code change.
//
// Approximations, documented rather than hidden:
//  - "Customer rating" uses the vendor's customer-review average once they
//    have reviews (vendors.rating_avg); until then it falls back to the
//    average food rating.
//  - "Delivery performance" uses delivered/total orders as a proxy, since
//    per-status timestamps aren't tracked yet for real fulfillment timing.
//  - "Distance" only contributes when the caller supplies coordinates;
//    otherwise every vendor gets a neutral 0.5 for that factor.
// ---------------------------------------------------------------------
const findRanked = async ({ search, page = 1, limit = 20, customerLat, customerLng } = {}) => {
  const conditions = [`v.status = 'approved'`, `v.tier >= 1`];
  const params = [];
  if (search) {
    params.push(`%${search}%`);
    conditions.push(`v.business_name ILIKE $${params.length}`);
  }
  const where = `WHERE ${conditions.join(' AND ')}`;

  // Cap the candidate pool for cost control; fine at this platform's scale.
  const { rows: candidates } = await query(
    `SELECT v.*, u.fullname AS owner_name, u.email AS owner_email
     FROM vendors v JOIN users u ON u.id = v.user_id
     ${where} ORDER BY v.created_at DESC LIMIT 500`,
    params
  );
  if (candidates.length === 0) return { rows: [], total: 0 };

  const ids = candidates.map((v) => v.id);
  const { rows: metricsRows } = await query(
    `SELECT
       v.id AS vendor_id,
       COALESCE(AVG(f.rating), 0)::float AS avg_rating,
       COUNT(DISTINCT f.id) FILTER (WHERE f.rating IS NOT NULL) AS rated_food_count,
       COUNT(o.id) FILTER (WHERE o.status = 'delivered') AS completed_orders,
       COUNT(o.id) AS total_orders,
       COUNT(o.id) FILTER (WHERE o.status = 'cancelled') AS cancelled_orders,
       GREATEST(v.updated_at, COALESCE(MAX(f.updated_at), v.updated_at), COALESCE(MAX(o.created_at), v.updated_at)) AS last_activity
     FROM vendors v
     LEFT JOIN foods f ON f.vendor_id = v.id
     LEFT JOIN orders o ON o.vendor_id = v.id
     WHERE v.id = ANY($1::uuid[])
     GROUP BY v.id`,
    [ids]
  );
  const metricsByVendor = Object.fromEntries(metricsRows.map((m) => [m.vendor_id, m]));

  const settingsModel = require('./settingsModel');
  const adCampaignModel = require('./adCampaignModel');
  const [weights, sponsoredIds] = await Promise.all([
    (async () => {
      const keys = ['rating', 'orders', 'acceptance', 'delivery', 'distance', 'activity'];
      const values = await Promise.all(keys.map((k) => settingsModel.getValue(`ranking_weight_${k}`, '0')));
      return Object.fromEntries(keys.map((k, i) => [k, Number(values[i])]));
    })(),
    adCampaignModel.findActiveVendorIds(),
  ]);
  const minOrdersForRating = Number(await settingsModel.getValue('ranking_min_orders_for_rating', '5'));
  const sponsoredSet = new Set(sponsoredIds);

  const now = Date.now();
  const scored = candidates.map((v) => {
    const m = metricsByVendor[v.id] || {};
    const totalOrders = Number(m.total_orders || 0);
    const completedOrders = Number(m.completed_orders || 0);
    const cancelledOrders = Number(m.cancelled_orders || 0);

    // Rating: damped toward neutral (0.5) until the vendor has enough
    // completed orders, so a handful of 5-star ratings can't game ranking.
    const reviewRating = Number(v.rating_count) > 0 && v.rating_avg != null ? Number(v.rating_avg) : null;
    const ratingRaw = (reviewRating ?? Number(m.avg_rating || 0)) / 5;
    const ratingConfidence = Math.min(completedOrders / Math.max(minOrdersForRating, 1), 1);
    const ratingScore = totalOrders === 0 ? 0.5 : ratingRaw * ratingConfidence + 0.5 * (1 - ratingConfidence);

    const ordersScore = Math.min(completedOrders / 50, 1); // 50+ completed orders = max score
    const acceptanceScore = totalOrders === 0 ? 0.5 : 1 - cancelledOrders / totalOrders;
    const deliveryScore = totalOrders === 0 ? 0.5 : completedOrders / totalOrders;

    let distanceScore = 0.5;
    if (customerLat != null && customerLng != null && v.latitude != null && v.longitude != null) {
      const dKm = haversineKm(customerLat, customerLng, v.latitude, v.longitude);
      distanceScore = Math.max(0, 1 - dKm / 20); // linear falloff to 0 at 20km
    }

    const daysSinceActivity = m.last_activity ? (now - new Date(m.last_activity).getTime()) / 86400000 : 999;
    const activityScore = Math.max(0, 1 - daysSinceActivity / 30); // fresh within 30 days = high score

    const score =
      ratingScore * weights.rating +
      ordersScore * weights.orders +
      acceptanceScore * weights.acceptance +
      deliveryScore * weights.delivery +
      distanceScore * weights.distance +
      activityScore * weights.activity;

    return { ...v, _sponsored: sponsoredSet.has(v.id), _score: score };
  });

  scored.sort((a, b) => {
    if (a._sponsored !== b._sponsored) return a._sponsored ? -1 : 1;
    if (a.tier !== b.tier) return b.tier - a.tier;
    return b._score - a._score;
  });

  const total = scored.length;
  const offset = (page - 1) * limit;
  const rows = scored.slice(offset, offset + limit).map(({ _sponsored, _score, ...v }) => v);
  return { rows, total };
};

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const update = async (id, fields) => {
  const allowed = [
    'business_name',
    'description',
    'tagline',
    'categories',
    'eta',
    'address',
    'latitude',
    'longitude',
    'phone',
    'logo_url',
    'logo_public_id',
    'banner_url',
    'banner_public_id',
    'banner_media_type',
    'tier',
    'offpay_merchant_ref',
    'payment_verified_at',
    'pro_since',
    'opening_hours',
    'orders_paused',
    'delivery_fee',
    'free_delivery_above',
  ];
  const sets = [];
  const params = [];

  allowed.forEach((key) => {
    if (fields[key] !== undefined) {
      // JSONB column: send an explicit JSON string (or NULL to clear).
      const value = key === 'opening_hours' && fields[key] !== null ? JSON.stringify(fields[key]) : fields[key];
      params.push(value);
      sets.push(`${key} = $${params.length}`);
    }
  });

  if (!sets.length) return findById(id);

  params.push(id);
  const { rows } = await query(
    `UPDATE vendors SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
    params
  );
  return rows[0];
};

const setStatus = async (id, status) => {
  const { rows } = await query(
    'UPDATE vendors SET status = $1 WHERE id = $2 RETURNING *',
    [status, id]
  );
  return rows[0];
};

const remove = async (id) => {
  await query('DELETE FROM vendors WHERE id = $1', [id]);
};

module.exports = { create, findById, findByUserId, findAll, findRanked, update, setStatus, remove };
