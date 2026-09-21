const express = require('express');
const router = express.Router();

const settingsController = require('../controllers/settingsController');
const contentController = require('../controllers/contentController');

// GET /api/settings — public, whitelisted config only (e.g. offpay_registration_url)
router.get('/', settingsController.getPublicSettings);

// GET /api/settings/content — public: the editable website content (headings,
// banner slides, footer, ...) with defaults filled in. Edited in Admin > Site content.
router.get('/content', contentController.getContent);

module.exports = router;
