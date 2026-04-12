const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const dotenv = require('dotenv');
const db = require('./config/db');
const hrRoutes = require('./routes/hrRoute');
const userRoutes = require('./routes/userRoute');
const adminRoutes = require('./routes/adminRoute');
const notificationRoutes = require('./routes/notificationRoute');
const errorHandler = require('./middleware/errorHandler');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware - CSP disabled for development
app.use(helmet({
  contentSecurityPolicy: false, // Disabled for development to allow profile pictures
}));

// CORS middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow frontend origin
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001'
    ];
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting - Commented out for development
// Uncomment in production
/*
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 auth attempts per windowMs
  message: { error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // limit each IP to 20 password reset requests per hour
  message: { error: 'Too many password reset requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);
app.use('/api/users/login', authLimiter);
app.use('/api/users/forgot-password', passwordResetLimiter);
*/
const multer = require('multer');
const path = require('path');

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif)'));
    }
  }
});

app.use(express.json());

// Serve static files from uploads directory with CORS headers
app.use('/uploads', (req, res, next) => {
  const origin = req.headers.origin;
  // Allow specific origins for better security
  const allowedOrigins = ['http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001'];
  
  if (allowedOrigins.includes(origin) || !origin) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Cross-Origin-Resource-Policy', 'cross-origin');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
    return;
  }
  
  next();
}, express.static('uploads'));

// Use the route
app.use('/api', hrRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);

// System status endpoint
app.get('/api/system/status', (req, res) => {
  // Check if there are any users in the system
  const query = 'SELECT COUNT(*) as userCount FROM users';
  
  db.query(query, (err, results) => {
    if (err) {
      console.error('Error checking system status:', err);
      return res.status(500).json({ 
        error: 'Failed to check system status',
        isInitialized: false 
      });
    }
    
    const userCount = results[0].userCount;
    const isInitialized = userCount > 0;
    
    res.json({
      isInitialized: isInitialized,
      userCount: userCount,
      message: isInitialized 
        ? 'System is initialized' 
        : 'System needs initialization'
    });
  });
});

// System initialization endpoint
app.post('/api/system/initialize', async (req, res) => {
  try {
    const { superAdmin, admin, companyName } = req.body;
    
    // Validate input
    if (!superAdmin || !admin || !companyName) {
      return res.status(400).json({
        error: 'Missing required fields: superAdmin, admin, companyName'
      });
    }
    
    // Check if system is already initialized
    const checkQuery = 'SELECT COUNT(*) as userCount FROM users';
    db.query(checkQuery, (err, results) => {
      if (err) {
        console.error('Error checking system status:', err);
        return res.status(500).json({ error: 'Failed to check system status' });
      }
      
      if (results[0].userCount > 0) {
        return res.status(400).json({
          error: 'System is already initialized'
        });
      }
      
      // Start transaction
      db.beginTransaction((err) => {
        if (err) {
          console.error('Error starting transaction:', err);
          return res.status(500).json({ error: 'Failed to initialize system' });
        }
        
        // Insert Super Admin
        const superAdminQuery = `
          INSERT INTO users (email, password, role, created_at, updated_at) 
          VALUES (?, ?, 'super_admin', NOW(), NOW())
        `;
        
        db.query(superAdminQuery, [superAdmin.email, superAdmin.password], (err, result) => {
          if (err) {
            return db.rollback(() => {
              console.error('Error creating super admin:', err);
              res.status(500).json({ error: 'Failed to create super admin account' });
            });
          }
          
          // Insert Admin
          const adminQuery = `
            INSERT INTO users (email, password, role, created_at, updated_at) 
            VALUES (?, ?, 'admin', NOW(), NOW())
          `;
          
          db.query(adminQuery, [admin.email, admin.password], (err, result) => {
            if (err) {
              return db.rollback(() => {
                console.error('Error creating admin:', err);
                res.status(500).json({ error: 'Failed to create admin account' });
              });
            }
            
            // Commit transaction
            db.commit((err) => {
              if (err) {
                return db.rollback(() => {
                  console.error('Error committing transaction:', err);
                  res.status(500).json({ error: 'Failed to initialize system' });
                });
              }
              
              res.json({
                success: true,
                message: 'System initialized successfully',
                companyName: companyName
              });
            });
          });
        });
      });
    });
  } catch (error) {
    console.error('System initialization error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Home test route
app.get('/', (req, res) => {
  res.send('Employee Management System Backend is running...');
});

// Error handling middleware (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});
