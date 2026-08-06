const express = require('express');
const router = express.Router();

const vendorController = require('../controllers/vendorController');
const settlementController = require('../controllers/settlementController');
const foodController = require('../controllers/foodController');
const subscriptionController = require('../controllers/subscriptionController');
const adCampaignController = require('../controllers/adCampaignController');
const branchController = require('../controllers/branchController');
const vendorStaffController = require('../controllers/vendorStaffController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { uuidParamRules, paginationRules, settlementCreateRules } = require('../middleware/validators');

router.get('/', paginationRules, validate, vendorController.listVendors);
router.get('/me', authenticate, authorize('vendor'), vendorController.getMyVendorProfile);
router.put('/me', authenticate, authorize('vendor'), vendorController.updateMyVendorProfile);
router.get('/me/foods', authenticate, authorize('vendor'), foodController.listMyFoods);

// Direct-from-device uploads (multipart "media" field) — streamed to Cloudinary.
router.put(
  '/me/logo',
  authenticate,
  authorize('vendor'),
  upload.single('media'),
  vendorController.uploadMyLogo
);
router.put(
  '/me/banner',
  authenticate,
  authorize('vendor'),
  upload.single('media'),
  vendorController.uploadMyBanner
);

// Settlement (payout) requests — vendor submits a receipt, admin reviews.
router.get('/me/settlements/eligible', authenticate, authorize('vendor'), settlementController.listEligibleOrders);
router.post(
  '/me/settlements',
  authenticate,
  authorize('vendor'),
  upload.single('receipt'),
  settlementCreateRules,
  validate,
  settlementController.createSettlement
);
router.get('/me/settlements', authenticate, authorize('vendor'), settlementController.listMySettlements);

// Tier 2 Pro / Enterprise subscriptions (payment confirmed by admin — see admin routes).
router.use('/me/subscriptions', authenticate, authorize('vendor'));
router.post('/me/subscriptions', subscriptionController.subscribe);
router.get('/me/subscriptions', subscriptionController.listMySubscriptions);
router.put('/me/subscriptions/:id/payment-ref', uuidParamRules('id'), validate, subscriptionController.attachPaymentRef);
router.put('/me/subscriptions/:id/cancel', uuidParamRules('id'), validate, subscriptionController.cancelMySubscription);

router.get('/me/billing', authenticate, authorize('vendor'), subscriptionController.listMyBilling);

// Self-service advertising campaigns (Tier 1+).
router.use('/me/campaigns', authenticate, authorize('vendor'));
router.post('/me/campaigns', adCampaignController.createCampaign);
router.get('/me/campaigns', adCampaignController.listMyCampaigns);

// Enterprise: branches (multi-branch management).
router.use('/me/branches', authenticate, authorize('vendor'));
router.get('/me/branches', branchController.listMyBranches);
router.post('/me/branches', branchController.createBranch);
router.put('/me/branches/:id', uuidParamRules('id'), validate, branchController.updateBranch);
router.delete('/me/branches/:id', uuidParamRules('id'), validate, branchController.deleteBranch);

// Enterprise: staff accounts (RBAC).
router.use('/me/staff', authenticate, authorize('vendor'));
router.get('/me/staff', vendorStaffController.listMyStaff);
router.post('/me/staff', vendorStaffController.createStaff);
router.put('/me/staff/:id', uuidParamRules('id'), validate, vendorStaffController.updateStaff);
router.delete('/me/staff/:id', uuidParamRules('id'), validate, vendorStaffController.deleteStaff);

router.get('/:id', uuidParamRules('id'), validate, vendorController.getVendor);

module.exports = router;
