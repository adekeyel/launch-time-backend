const { body, param, query } = require('express-validator');

const registerRules = [
  body('fullname').trim().notEmpty().withMessage('Full name is required').isLength({ max: 150 }),
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
  body('phone').optional().trim().isLength({ max: 30 }),
  body('role').optional().isIn(['customer', 'vendor']),
  body('businessName').if(body('role').equals('vendor')).notEmpty().withMessage('businessName is required for vendors'),
];

const loginRules = [
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

const forgotPasswordRules = [
  body('email').trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
];

const resetPasswordRules = [
  body('token').notEmpty().withMessage('Reset token is required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/\d/)
    .withMessage('Password must contain at least one number'),
];

const foodRules = [
  body('name').trim().notEmpty().withMessage('Food name is required').isLength({ max: 150 }),
  body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number'),
  body('description').optional().trim(),
  body('category').optional().trim().isLength({ max: 80 }),
];

const foodUpdateRules = [
  body('name').optional().trim().isLength({ max: 150 }),
  body('price').optional().isFloat({ min: 0 }),
  body('is_available').optional().isBoolean(),
  body('popular').optional().isBoolean(),
  body('rating').optional().isFloat({ min: 0, max: 5 }),
];

const cartAddRules = [
  body('foodId').isUUID().withMessage('Valid foodId is required'),
  body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1'),
];

const cartUpdateRules = [
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be 0 or greater'),
];

const checkoutRules = [
  body('deliveryAddress').trim().notEmpty().withMessage('Delivery address is required'),
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('notes').optional().trim(),
];

const orderStatusRules = [
  body('status')
    .isIn(['pending', 'preparing', 'ready', 'delivered', 'cancelled'])
    .withMessage('Invalid order status'),
];

const adCreateRules = [
  body('title').trim().notEmpty().withMessage('Ad title is required').isLength({ max: 150 }),
  body('placement').isIn(['top', 'middle', 'bottom']).withMessage('placement must be top, middle, or bottom'),
  body('page').optional().trim().isLength({ max: 50 }),
  body('linkUrl').optional({ checkFalsy: true }).isURL().withMessage('linkUrl must be a valid URL'),
  body('displayOrder').optional().isInt(),
];

const adUpdateRules = [
  body('title').optional().trim().isLength({ max: 150 }),
  body('placement').optional().isIn(['top', 'middle', 'bottom']),
  body('page').optional().trim().isLength({ max: 50 }),
  body('link_url').optional({ checkFalsy: true }).isURL().withMessage('link_url must be a valid URL'),
  body('is_active').optional().isBoolean(),
  body('display_order').optional().isInt(),
];

const settlementCreateRules = [
  body('amount').isFloat({ min: 0 }).withMessage('amount must be a positive number'),
  body('paymentRef').trim().notEmpty().withMessage('paymentRef is required').isLength({ max: 100 }),
  body('note').optional().trim(),
];

const settlementDecisionRules = [
  body('status').isIn(['approved', 'rejected']).withMessage('status must be approved or rejected'),
];

const uuidParamRules = (name = 'id') => [param(name).isUUID().withMessage(`Invalid ${name}`)];

const paginationRules = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 100 }),
];

module.exports = {
  registerRules,
  loginRules,
  forgotPasswordRules,
  resetPasswordRules,
  foodRules,
  foodUpdateRules,
  cartAddRules,
  cartUpdateRules,
  checkoutRules,
  orderStatusRules,
  adCreateRules,
  adUpdateRules,
  settlementCreateRules,
  settlementDecisionRules,
  uuidParamRules,
  paginationRules,
};
