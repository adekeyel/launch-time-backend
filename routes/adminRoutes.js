const express = require('express');
const router = express.Router();

const adminController = require('../controllers/adminController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { uuidParamRules, paginationRules, registerRules, adCreateRules, adUpdateRules, settlementDecisionRules } = require('../middleware/validators');

// Every route below requires an authenticated admin (super admin) account.
router.use(authenticate, authorize('admin'));

// ---- Users ----
router.get('/users', paginationRules, validate, adminController.listUsers);
router.post('/users', registerRules, validate, adminController.createUser);
router.get('/users/:id', uuidParamRules('id'), validate, adminController.getUser);
router.put('/users/:id', uuidParamRules('id'), validate, adminController.updateUser);
router.put('/users/:id/role', uuidParamRules('id'), validate, adminController.changeUserRole);
router.put('/users/:id/status', uuidParamRules('id'), validate, adminController.setUserActiveStatus);
router.delete('/users/:id', uuidParamRules('id'), validate, adminController.deleteUser);

// ---- Vendors ----
router.get('/vendors', paginationRules, validate, adminController.listAllVendors);
router.post('/vendors', adminController.createVendor);
router.put('/vendors/:id', uuidParamRules('id'), validate, adminController.updateVendor);
router.put('/vendors/:id/status', uuidParamRules('id'), validate, adminController.setVendorStatus);
router.delete('/vendors/:id', uuidParamRules('id'), validate, adminController.deleteVendor);

// ---- Foods (super admin has control over EVERY vendor's products) ----
// "media" is an optional image OR short video file uploaded directly from
// the admin's device — it's streamed to Cloudinary, never taken as a URL.
router.get('/foods', paginationRules, validate, adminController.listAllFoods);
router.post('/foods', upload.single('media'), adminController.createFoodForVendor);
router.put('/foods/:id', uuidParamRules('id'), validate, upload.single('media'), adminController.updateAnyFood);
router.delete('/foods/:id', uuidParamRules('id'), validate, adminController.deleteAnyFood);

// ---- Orders (oversight) ----
router.get('/orders', paginationRules, validate, adminController.listAllOrders);
router.put('/orders/:id', uuidParamRules('id'), validate, adminController.forceUpdateOrderStatus);

// ---- Ads (top / middle / bottom placements) ----
router.get('/ads', adminController.listAllAds);
router.post('/ads', upload.single('media'), adCreateRules, validate, adminController.createAd);
router.put(
  '/ads/:id',
  uuidParamRules('id'),
  upload.single('media'),
  adUpdateRules,
  validate,
  adminController.updateAd
);
router.delete('/ads/:id', uuidParamRules('id'), validate, adminController.deleteAd);

// ---- Analytics ----
router.get('/analytics', adminController.getAnalytics);

// ---- Settlements (vendor payout review) ----
router.get('/settlements', adminController.listAllSettlements);
router.put(
  '/settlements/:id',
  uuidParamRules('id'),
  settlementDecisionRules,
  validate,
  adminController.decideSettlement
);

// ---- Settings (editable platform config, e.g. OffPay registration link) ----
router.get('/settings', adminController.listSettings);
router.put('/settings/:key', adminController.updateSetting);

// ---- Vendor tier (OffPay verification / Pro) ----
router.put('/vendors/:id/tier', uuidParamRules('id'), validate, adminController.setVendorTier);

// ---- Subscriptions (Tier 2 Pro / Enterprise — admin confirms OffPay payment) ----
router.get('/subscriptions', adminController.listAllSubscriptions);
router.put('/subscriptions/:id/activate', uuidParamRules('id'), validate, adminController.activateSubscription);
router.put('/subscriptions/:id/reject', uuidParamRules('id'), validate, adminController.rejectSubscription);
router.get('/billing', adminController.listAllBilling);

// ---- Ad campaigns (vendor self-service — admin confirms payment, campaign goes live) ----
router.get('/campaigns', adminController.listAllCampaigns);
router.put(
  '/campaigns/:id/activate',
  uuidParamRules('id'),
  validate,
  upload.single('media'),
  adminController.activateCampaign
);
router.put('/campaigns/:id/reject', uuidParamRules('id'), validate, adminController.rejectCampaign);

module.exports = router;
