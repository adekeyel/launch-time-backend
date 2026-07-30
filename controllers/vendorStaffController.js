const bcrypt = require('bcryptjs');
const vendorStaffModel = require('../models/vendorStaffModel');
const userModel = require('../models/userModel');
const branchModel = require('../models/branchModel');
const settingsModel = require('../models/settingsModel');
const { ApiError, ok } = require('../utils/response');
const { requireEnterpriseVendor } = require('./branchController');

// GET /api/vendors/me/staff
const listMyStaff = async (req, res) => {
  const vendor = await requireEnterpriseVendor(req.user.id);
  const rows = await vendorStaffModel.findByVendor(vendor.id);
  return ok(res, { staff: rows, availablePermissions: vendorStaffModel.AVAILABLE_PERMISSIONS });
};

// POST /api/vendors/me/staff  { fullname, email, password, branchId?, staffRole, permissions? }
// Creates a real login-capable account (role='staff') scoped to this vendor.
const createStaff = async (req, res) => {
  const vendor = await requireEnterpriseVendor(req.user.id);
  const { fullname, email, password, branchId, staffRole = 'staff', permissions } = req.body;

  if (!fullname || !email || !password) {
    throw new ApiError(422, 'fullname, email, and password are required.');
  }
  if (!['manager', 'staff'].includes(staffRole)) {
    throw new ApiError(422, 'staffRole must be "manager" or "staff".');
  }
  if (permissions && !permissions.every((p) => vendorStaffModel.AVAILABLE_PERMISSIONS.includes(p))) {
    throw new ApiError(422, 'One or more permissions are invalid.');
  }

  const maxStaff = Number(await settingsModel.getValue('enterprise_max_staff', '20'));
  const current = await vendorStaffModel.countByVendor(vendor.id);
  if (current >= maxStaff) {
    throw new ApiError(400, `You've reached your plan's limit of ${maxStaff} staff accounts.`);
  }

  if (branchId) {
    const branch = await branchModel.findById(branchId);
    if (!branch || branch.vendor_id !== vendor.id) throw new ApiError(404, 'Branch not found.');
  }

  const existing = await userModel.findByEmail(email);
  if (existing) throw new ApiError(409, 'A user with this email already exists.');

  const hashed = await bcrypt.hash(password, 12);
  const user = await userModel.create({ fullname, email, password: hashed, role: 'staff', phone: null });
  const staff = await vendorStaffModel.create({ userId: user.id, vendorId: vendor.id, branchId, staffRole, permissions });

  return ok(res, { user, staff }, 'Staff account created — they can log in with the email/password you set.', 201);
};

// PUT /api/vendors/me/staff/:id  { branchId?, staffRole?, permissions?, isActive? }
const updateStaff = async (req, res) => {
  const vendor = await requireEnterpriseVendor(req.user.id);
  const staff = await vendorStaffModel.findById(req.params.id);
  if (!staff || staff.vendor_id !== vendor.id) throw new ApiError(404, 'Staff account not found.');

  const { branchId, staffRole, permissions, isActive } = req.body;
  if (permissions && !permissions.every((p) => vendorStaffModel.AVAILABLE_PERMISSIONS.includes(p))) {
    throw new ApiError(422, 'One or more permissions are invalid.');
  }

  const updated = await vendorStaffModel.update(req.params.id, { branchId, staffRole, permissions, isActive });

  // Keep the login itself in sync with the account being disabled.
  if (isActive === false) {
    await userModel.setActiveStatus(staff.user_id, false);
  } else if (isActive === true) {
    await userModel.setActiveStatus(staff.user_id, true);
  }

  return ok(res, updated, 'Staff account updated.');
};

// DELETE /api/vendors/me/staff/:id
const deleteStaff = async (req, res) => {
  const vendor = await requireEnterpriseVendor(req.user.id);
  const staff = await vendorStaffModel.findById(req.params.id);
  if (!staff || staff.vendor_id !== vendor.id) throw new ApiError(404, 'Staff account not found.');

  await vendorStaffModel.remove(req.params.id);
  await userModel.setActiveStatus(staff.user_id, false);
  return ok(res, null, 'Staff account removed.');
};

// GET /api/staff/me — a logged-in staff member's own scope/permissions
const getMyStaffProfile = async (req, res) => {
  const staff = await vendorStaffModel.findByUserId(req.user.id);
  if (!staff) throw new ApiError(404, 'No staff profile found for this account.');
  return ok(res, staff);
};

module.exports = { listMyStaff, createStaff, updateStaff, deleteStaff, getMyStaffProfile };
