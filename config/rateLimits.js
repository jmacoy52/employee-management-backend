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

// Public organisation sign-up and the one-time owner bootstrap (per IP).
//   ORG_SIGNUP_RATE_LIMIT_MAX        attempts per window (default 5)
//   ORG_SIGNUP_RATE_LIMIT_WINDOW_MIN window length in minutes (default 60)
const orgSignupLimiter = rateLimit({
  windowMs: (Number(process.env.ORG_SIGNUP_RATE_LIMIT_WINDOW_MIN) || 60) * 60 * 1000,
  limit: Number(process.env.ORG_SIGNUP_RATE_LIMIT_MAX) || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many registrations from this network. Please try again later.' },
});

// Public "Request a demo" / contact form (per IP).
//   ENQUIRY_RATE_LIMIT_MAX        submissions per window (default 5)
//   ENQUIRY_RATE_LIMIT_WINDOW_MIN window length in minutes (default 60)
const enquiryLimiter = rateLimit({
  windowMs: (Number(process.env.ENQUIRY_RATE_LIMIT_WINDOW_MIN) || 60) * 60 * 1000,
  limit: Number(process.env.ENQUIRY_RATE_LIMIT_MAX) || 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many messages from this network. Please try again later, or e-mail us instead.' },
});

// Public payment return page (signed-out payer): checks one reference with Paystack (per IP).
//   CALLBACK_RATE_LIMIT_MAX per 15 minutes (default 30)
const callbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: Number(process.env.CALLBACK_RATE_LIMIT_MAX) || 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please wait a few minutes and try again.' },
});

module.exports = { authLimiter, orgSignupLimiter, enquiryLimiter, callbackLimiter };
