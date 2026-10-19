require('dotenv').config();

const express = require('express');
const cors = require('cors');
const db = require('./config/db');
const { corsOptions } = require('./config/cors');
const employeeRoutes = require('./routes/employeeRoute');
const userRoutes = require('./routes/userRoute');
const auditLogRoutes = require('./routes/auditLogRoute');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Logins will fail until it is configured.');
}

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1); // behind Render's proxy
app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

// Health check (use as Render's health check path)
app.get('/api/health', (req, res) => {
  db.query('SELECT 1', (err) => {
    if (err) {
      return res.status(503).json({ status: 'degraded', database: 'unreachable' });
    }
    res.json({ status: 'ok', database: 'connected' });
  });
});

// Use the route
app.use('/api', employeeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit-logs', auditLogRoutes);

// Home test route
app.get('/', (req, res) => {
  res.send('Employee Management System Backend is running...');
});

// Unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Last-resort error handler (e.g. invalid JSON body)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

app.listen(PORT, () => {
  console.log(`Server is running on ${PORT}`);
});
