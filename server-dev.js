require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const db = require('./config/db');
const hrRoutes = require('./routes/hrRoute');
const userRoutes = require('./routes/userRoute');
const adminRoutes = require('./routes/adminRoute');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 5001; // Use different port to avoid conflicts

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// Development-friendly rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs (increased for development)
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 auth attempts per windowMs (increased for development)
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 password reset requests per hour (increased for development)
  message: { error: 'Too many password reset requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use('/api/users/login', authLimiter);
app.use('/api/users/forgot-password', passwordResetLimiter);

app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002', 'http://localhost:3003'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Use the route
app.use('/api', hrRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);

// Home test route
app.get('/', (req, res) => {
  res.send('Employee Management System Backend (Development) is running...');
});

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Development server is running on port ${PORT}`);
  console.log(`Rate limits increased for development:`);
  console.log(`- General: 500 requests per 15 minutes`);
  console.log(`- Auth: 50 attempts per 15 minutes`);
  console.log(`- Password reset: 20 requests per hour`);
});
