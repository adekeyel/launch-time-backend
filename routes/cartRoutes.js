const express = require('express');
const router = express.Router();

const cartController = require('../controllers/cartController');
const { authenticate, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { cartAddRules, cartUpdateRules, uuidParamRules } = require('../middleware/validators');

router.use(authenticate, authorize('customer'));

router.post('/', cartAddRules, validate, cartController.addToCart);
router.get('/', cartController.getCart);
router.put('/:id', uuidParamRules('id'), cartUpdateRules, validate, cartController.updateCartItem);
router.delete('/:id', uuidParamRules('id'), validate, cartController.removeCartItem);

module.exports = router;
