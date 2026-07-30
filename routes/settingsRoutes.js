const express = require('express');
const router = express.Router();

const settingsController = require('../controllers/settingsController');

// GET /api/settings — public, whitelisted config only (e.g. offpay_registration_url)
router.get('/', settingsController.getPublicSettings);

module.exports = router;
