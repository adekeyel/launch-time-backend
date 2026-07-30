const express = require('express');
const router = express.Router();

const adController = require('../controllers/adController');

// GET /api/ads?placement=top&page=home
// Public — the frontend calls this once per page load per ad slot.
router.get('/', adController.getActiveAds);

module.exports = router;
