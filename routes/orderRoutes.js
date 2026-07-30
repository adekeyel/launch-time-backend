const express = require('express');
const router = express.Router();

const orderController = require('../controllers/orderController');
const { authenticate, authorize } = require('../middleware/auth');
const upload = require('../middleware/upload');
const validate = require('../middleware/validate');
const { checkoutRules, orderStatusRules, uuidParamRules, paginationRules } = require('../middleware/validators');

router.use(authenticate);

// multipart/form-data — optional "receipt" file (payment screenshot/PDF),
// uploaded straight to Cloudinary.
router.post('/', authorize('customer'), upload.single('receipt'), checkoutRules, validate, orderController.checkout);
router.get('/', paginationRules, validate, orderController.listOrders);
router.get('/:id', uuidParamRules('id'), validate, orderController.getOrder);
router.put(
  '/:id',
  authorize('vendor', 'admin'),
  uuidParamRules('id'),
  orderStatusRules,
  validate,
  orderController.updateOrderStatus
);

module.exports = router;
