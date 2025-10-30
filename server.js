const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./config/db');
const employeeRoutes = require('./routes/employeeRoute');
const userRoutes = require('./routes/userRoute');
const auditLogRoutes = require('./routes/auditLogRoute');


dotenv.config();

const app = express();
const PORT =process.env.PORT || 5000;
app.use(cors());
app.use(express.json());

// Use the route
app.use('/api', employeeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/audit-logs', auditLogRoutes);

// Home test route
app.get('/', (req, res) => {
  res.send('Employee Management System Backend is running...');
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
