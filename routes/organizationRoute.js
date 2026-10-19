const express = require('express');
const router = express.Router();
const OrganizationController = require('../controllers/organizationController');
const { orgSignupLimiter } = require('../config/rateLimits');

// Public organisation sign-up (rate-limited). The organisation starts as 'pending'.
router.post('/register', orgSignupLimiter, OrganizationController.register);

module.exports = router;
