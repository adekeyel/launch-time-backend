const branchModel = require('../models/branchModel');
const vendorModel = require('../models/vendorModel');
const settingsModel = require('../models/settingsModel');
const { ApiError, ok } = require('../utils/response');

// Shared guard: Enterprise must be globally enabled AND this vendor must
// actually be on the Enterprise tier (set by admin after confirming an
// Enterprise subscription payment — see subscriptionController).
async function requireEnterpriseVendor(userId) {
  const enabled = await settingsModel.getValue('enterprise_enabled', 'false');
  if (enabled !== 'true') {
    throw new ApiError(403, 'Enterprise is not currently available.');
  }
  const vendor = await vendorModel.findByUserId(userId);
  if (!vendor) throw new ApiError(404, 'Vendor profile not found.');
  if (vendor.tier < 3) {
    throw new ApiError(403, 'This feature requires an active Enterprise subscription.');
  }
  return vendor;
}

// GET /api/vendors/me/branches
const listMyBranches = async (req, res) => {
  const vendor = await requireEnterpriseVendor(req.user.id);
  const rows = await branchModel.findByVendor(vendor.id);
  return ok(res, { branches: rows });
};

// POST /api/vendors/me/branches  { name, address, phone }
const createBranch = async (req, res) => {
  const vendor = await requireEnterpriseVendor(req.user.id);
  const { name, address, phone } = req.body;
  if (!name) throw new ApiError(422, 'name is required.');

  const maxBranches = Number(await settingsModel.getValue('enterprise_max_branches', '5'));
  const current = await branchModel.countByVendor(vendor.id);
  if (current >= maxBranches) {
    throw new ApiError(400, `You've reached your plan's limit of ${maxBranches} branches.`);
  }

  const branch = await branchModel.create({ vendorId: vendor.id, name, address, phone });
  return ok(res, branch, 'Branch created.', 201);
};

// PUT /api/vendors/me/branches/:id
const updateBranch = async (req, res) => {
  const vendor = await requireEnterpriseVendor(req.user.id);
  const branch = await branchModel.findById(req.params.id);
  if (!branch || branch.vendor_id !== vendor.id) throw new ApiError(404, 'Branch not found.');

  const { name, address, phone, isActive } = req.body;
  const updated = await branchModel.update(req.params.id, { name, address, phone, isActive });
  return ok(res, updated, 'Branch updated.');
};

// DELETE /api/vendors/me/branches/:id
const deleteBranch = async (req, res) => {
  const vendor = await requireEnterpriseVendor(req.user.id);
  const branch = await branchModel.findById(req.params.id);
  if (!branch || branch.vendor_id !== vendor.id) throw new ApiError(404, 'Branch not found.');

  await branchModel.remove(req.params.id);
  return ok(res, null, 'Branch deleted.');
};

module.exports = { listMyBranches, createBranch, updateBranch, deleteBranch, requireEnterpriseVendor };
