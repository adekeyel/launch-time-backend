const express = require('express');
const router = express.Router();

const orderController = require('../controllers/orderController');

// No `authenticate` here — this is called by Flutterwave's servers, not a
// logged-in user. Authenticity is checked inside the controller via the
// `verif-hash` header against FLW_WEBHOOK_HASH.
router.post('/flutterwave', orderController.flutterwaveWebhook);

module.exports = router;
