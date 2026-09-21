const { getOpenStatus } = require('./hours');

// Turns database rows into the shapes the API returns: numbers as numbers
// (Postgres NUMERIC arrives as a string), open/closed status computed for
// "right now", and private owner details removed from public responses.

const numOrNull = (v) => (v === null || v === undefined ? null : Number(v));

const PRIVATE_VENDOR_FIELDS = ['owner_name', 'owner_email', 'owner_active', 'offpay_merchant_ref', 'user_id'];

const presentVendor = (vendor, { isPublic = false, now = new Date() } = {}) => {
  if (!vendor) return vendor;
  const open = getOpenStatus(vendor, now);
  const out = {
    ...vendor,
    delivery_fee: Number(vendor.delivery_fee || 0),
    free_delivery_above: numOrNull(vendor.free_delivery_above),
    rating_avg: numOrNull(vendor.rating_avg),
    rating_count: Number(vendor.rating_count || 0),
    open_now: open.is_open,
    open_status: open.status,
    open_label: open.label,
  };
  if (isPublic) PRIVATE_VENDOR_FIELDS.forEach((key) => delete out[key]);
  return out;
};

// Foods carry their vendor's open status so a dish card can say "Closed".
const presentFood = (food, now = new Date()) => {
  if (!food) return food;
  const { vendor_opening_hours, vendor_orders_paused, ...rest } = food;
  const open = getOpenStatus({ opening_hours: vendor_opening_hours, orders_paused: vendor_orders_paused }, now);
  return { ...rest, vendor_is_open: open.is_open, vendor_open_label: open.label };
};

// "Ada Obi" -> "Ada O." — reviews are public, full names aren't.
const displayName = (fullname) => {
  const parts = String(fullname || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Customer';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
};

const presentReview = (row) => ({
  id: row.id,
  rating: Number(row.rating),
  comment: row.comment || null,
  created_at: row.created_at,
  customer_name: displayName(row.customer_name),
});

module.exports = { presentVendor, presentFood, presentReview, displayName, numOrNull };
