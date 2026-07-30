const express = require('express');
const router = express.Router();

const foodController = require('../controllers/foodController');
const { authenticate, authorize } = require('../middleware/auth');
const { loadOwnVendorOrAdmin, canModifyFood } = require('../middleware/ownership');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { foodRules, foodUpdateRules, uuidParamRules, paginationRules } = require('../middleware/validators');

router.get('/', paginationRules, validate, foodController.listFoods);
router.get('/:id', uuidParamRules('id'), validate, foodController.getFood);

// "media" is an image or short video file uploaded directly from the
// vendor's device (multipart/form-data) — never a URL.
router.post(
  '/',
  authenticate,
  authorize('vendor', 'admin'),
  loadOwnVendorOrAdmin,
  upload.single('media'),
  foodRules,
  validate,
  foodController.createFood
);

router.put(
  '/:id',
  authenticate,
  authorize('vendor', 'admin'),
  uuidParamRules('id'),
  canModifyFood,
  upload.single('media'),
  foodUpdateRules,
  validate,
  foodController.updateFood
);

router.delete(
  '/:id',
  authenticate,
  authorize('vendor', 'admin'),
  uuidParamRules('id'),
  canModifyFood,
  foodController.deleteFood
);

module.exports = router;
