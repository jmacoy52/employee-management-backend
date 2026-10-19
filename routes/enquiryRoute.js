const express = require('express');
const router = express.Router();
const EnquiryController = require('../controllers/enquiryController');
const { enquiryLimiter } = require('../config/rateLimits');

// Public "Request a demo" / contact form (rate-limited, honeypot, validated)
router.post('/', enquiryLimiter, EnquiryController.create);

module.exports = router;
