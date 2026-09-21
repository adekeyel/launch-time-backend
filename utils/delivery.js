// Delivery fee rules. A vendor sets a flat fee and, optionally, an order
// value above which delivery is free. The fee is always computed on the
// server from the vendor's saved settings — never taken from the client.

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const toNumberOrNull = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Fee to charge for a vendor's order with the given food subtotal.
const computeDeliveryFee = (vendor, subtotal) => {
  const fee = Number(vendor?.delivery_fee || 0);
  if (!(fee > 0)) return 0;
  const threshold = toNumberOrNull(vendor.free_delivery_above);
  if (threshold !== null && threshold > 0 && Number(subtotal) >= threshold) return 0;
  return round2(fee);
};

// How much more the customer would need to add to get free delivery, or null
// when delivery is already free / there is no free-delivery threshold.
const amountToFreeDelivery = (vendor, subtotal) => {
  const fee = Number(vendor?.delivery_fee || 0);
  const threshold = toNumberOrNull(vendor?.free_delivery_above);
  if (!(fee > 0) || threshold === null || !(threshold > 0)) return null;
  const remaining = threshold - Number(subtotal);
  return remaining > 0 ? round2(remaining) : null;
};

// Validates a money value coming from a form. Empty -> null (or 0 when
// allowNull is false). Throws a friendly 422 otherwise.
const parseMoneyInput = (ApiError, value, label, { allowNull = true, max = 1000000 } = {}) => {
  if (value === null || value === undefined || value === '') return allowNull ? null : 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) {
    throw new ApiError(422, `${label} must be an amount between 0 and ${max.toLocaleString('en-NG')}.`);
  }
  return round2(n);
};

module.exports = { round2, computeDeliveryFee, amountToFreeDelivery, parseMoneyInput };
