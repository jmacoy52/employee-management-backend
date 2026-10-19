require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const db = require('./config/db');
const { corsOptions } = require('./config/cors');
const employeeRoutes = require('./routes/employeeRoute');
const userRoutes = require('./routes/userRoute');
const auditLogRoutes = require('./routes/auditLogRoute');
const departmentRoutes = require('./routes/departmentRoute');
const organizationRoutes = require('./routes/organizationRoute');
const platformRoutes = require('./routes/platformRoute');
const enquiryRoutes = require('./routes/enquiryRoute');

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set. Logins will fail until it is configured.');
}

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1); // behind Render's proxy
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '100kb' }));

// Liveness check: the process is up (no database call). Use as Render's health check path
// so a database outage does not make Render restart or fail the deploy.
app.get('/api/live', (req, res) => {
  res.json({ status: 'ok' });
});

// Health check (database included; use for monitoring)
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
app.use('/api/departments', departmentRoutes);
app.use('/api/organizations', organizationRoutes);
app.use('/api/platform', platformRoutes);
app.use('/api/enquiries', enquiryRoutes);

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

// Start listening only when run directly (tests import the app without a port)
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server is running on ${PORT}`);
  });
}

module.exports = app;
