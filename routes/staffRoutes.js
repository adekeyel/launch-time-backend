const express = require('express');
const router = express.Router();

const vendorStaffController = require('../controllers/vendorStaffController');
const { authenticate, authorize } = require('../middleware/auth');

router.get('/me', authenticate, authorize('staff'), vendorStaffController.getMyStaffProfile);

module.exports = router;
