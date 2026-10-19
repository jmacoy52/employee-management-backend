// Request limits for the public auth endpoints (brute-force protection).
//   AUTH_RATE_LIMIT_MAX        attempts per window per IP (default 10)
//   AUTH_RATE_LIMIT_WINDOW_MIN window length in minutes (default 15)
const { rateLimit } = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: (Number(process.env.AUTH_RATE_LIMIT_WINDOW_MIN) || 15) * 60 * 1000,
  limit: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});

module.exports = { authLimiter };
