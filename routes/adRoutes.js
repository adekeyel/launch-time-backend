const express = require('express');
const router = express.Router();

const adController = require('../controllers/adController');
const validate = require('../middleware/validate');
const { uuidParamRules } = require('../middleware/validators');

// GET /api/ads?placement=top&page=home
// Public — the frontend calls this once per page load per ad slot.
router.get('/', adController.getActiveAds);

// POST /api/ads/:id/track  { type: 'impression' | 'click' }
// Public — fire-and-forget, no auth (a logged-out visitor sees ads too).
router.post('/:id/track', uuidParamRules('id'), validate, adController.trackAd);

module.exports = router;
