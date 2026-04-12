# Development Guide v2.0

This guide provides comprehensive information for developers working on the Employee Management System v2.0.

## Quick Start

### Prerequisites
- Node.js 16+ 
- MySQL 8.0+
- Git
- Code editor (VS Code recommended)

### Setup Time: ~15 minutes

```bash
# 1. Clone repository
git clone <repository-url>
cd employee-management-backend

# 2. Install backend dependencies
npm install

# 3. Setup database
mysql -u root -p -e "CREATE DATABASE employee_management;"
node setup-db.js

# 4. Configure environment
cp .env.example .env
# Edit .env with your credentials

# 5. Install frontend dependencies
cd client
npm install

# 6. Start development servers
# Terminal 1: Backend
cd .. && npm run dev

# Terminal 2: Frontend  
cd client && npm start
```

Access: http://localhost:3000

## Architecture Overview

### System Architecture
```
Frontend (React) -> Backend API (Express) -> Database (MySQL)
```

### Key Components

#### Backend (Node.js/Express)
- **Controllers**: Handle HTTP requests and responses
- **Services**: Business logic layer
- **Models**: Database interaction layer
- **Middleware**: Authentication, validation, error handling
- **Routes**: API endpoint definitions
- **Utils**: Helper functions

#### Frontend (React)
- **Components**: UI components (Pages, common, layout)
- **Contexts**: Global state management
- **Services**: API communication
- **Styles**: CSS styling (custom, not Tailwind)

### Data Flow
1. User action triggers React component
2. Component calls service function
3. Service makes HTTP request to backend
4. Backend validates and processes request
5. Database operations performed
6. Response sent back to frontend
7. Frontend updates state/UI

## Development Workflow

### 1. Feature Development

```bash
# Create feature branch
git checkout -b feature/new-feature

# Make changes
# Test changes
# Commit changes
git add .
git commit -m "feat: add new feature"

# Push and create PR
git push origin feature/new-feature
```

### 2. Database Changes

**Always create migration scripts for database changes:**

```javascript
// migration-script-name.js
const db = require('./config/db');

const migration = async () => {
  try {
    // Your migration logic here
    const query = `ALTER TABLE users ADD COLUMN new_column VARCHAR(255)`;
    await db.query(query);
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Migration failed:', error);
  }
};

migration();
```

### 3. Testing

```bash
# Test database connection
node test-db.js

# Reset system for testing
node reset-system-for-testing.js

# Run frontend tests
cd client && npm test
```

## Code Standards

### Backend Standards

#### File Naming
- Use camelCase for files: `userController.js`
- Use descriptive names: `authService.js` not `auth.js`

#### Code Structure
```javascript
// Controller structure
const getUserProfile = async (req, res) => {
  try {
    // 1. Validate input
    const { userId } = req.params;
    
    // 2. Call service
    const user = await userService.getUserById(userId);
    
    // 3. Send response
    res.status(200).json({
      success: true,
      data: user
    });
  } catch (error) {
    // 4. Handle errors
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
```

#### Service Layer
```javascript
// Service structure
const getUserById = async (userId) => {
  try {
    // Business logic here
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return user;
  } catch (error) {
    throw error;
  }
};
```

### Frontend Standards

#### Component Structure
```javascript
// Component structure
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import './ComponentName.css';

const ComponentName = ({ prop1, prop2 }) => {
  const { user } = useAuth();
  const [state, setState] = useState(null);
  
  useEffect(() => {
    // Side effects
  }, []);
  
  const handleClick = () => {
    // Event handlers
  };
  
  return (
    <div className="component-name">
      {/* JSX content */}
    </div>
  );
};

export default ComponentName;
```

#### CSS Structure
```css
/* Component CSS - use BEM methodology */
.component-name {
  /* Block styles */
}

.component-name__element {
  /* Element styles */
}

.component-name--modifier {
  /* Modifier styles */
}

/* Responsive design */
@media (max-width: 768px) {
  .component-name {
    /* Mobile styles */
  }
}
```

## Common Development Tasks

### 1. Adding New API Endpoint

**Step 1: Create Route**
```javascript
// routes/newRoute.js
const express = require('express');
const router = express.Router();
const newController = require('../controllers/newController');

router.get('/', newController.getAll);
router.post('/', newController.create);
router.put('/:id', newController.update);
router.delete('/:id', newController.delete);

module.exports = router;
```

**Step 2: Add to Server**
```javascript
// server.js
const newRoute = require('./routes/newRoute');
app.use('/api/new', newRoute);
```

**Step 3: Create Controller**
```javascript
// controllers/newController.js
const newService = require('../services/newService');

const getAll = async (req, res) => {
  try {
    const items = await newService.getAll();
    res.status(200).json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

module.exports = { getAll, create, update, delete };
```

**Step 4: Create Service**
```javascript
// services/newService.js
const db = require('../config/db');

const getAll = async () => {
  const query = 'SELECT * FROM table_name';
  const [rows] = await db.query(query);
  return rows;
};

module.exports = { getAll, create, update, delete };
```

### 2. Adding New Frontend Component

**Step 1: Create Component File**
```javascript
// components/Pages/NewComponent.js
import React from 'react';
import './NewComponent.css';

const NewComponent = () => {
  return (
    <div className="new-component">
      <h1>New Component</h1>
    </div>
  );
};

export default NewComponent;
```

**Step 2: Create CSS File**
```css
/* components/Pages/NewComponent.css */
.new-component {
  padding: 20px;
}

.new-component h1 {
  color: #333;
}
```

**Step 3: Add to Router**
```javascript
// App-v2.js
import NewComponent from './components/Pages/NewComponent';

// Add route
<Route path="/new-component" element={<NewComponent />} />
```

### 3. Adding Authentication to Routes

```javascript
// middleware/authMiddleware.js
const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = user;
    next();
  });
};

module.exports = { authenticateToken };
```

```javascript
// Apply to routes
router.get('/protected', authenticateToken, (req, res) => {
  // Protected route logic
});
```

## Debugging Guide

### Common Issues & Solutions

#### 1. Database Connection Issues
```bash
# Check MySQL service
sudo systemctl status mysql

# Test connection manually
mysql -u root -p -e "SHOW DATABASES;"

# Check environment variables
cat .env
```

#### 2. Authentication Issues
```javascript
// Debug JWT tokens
const jwt = require('jsonwebtoken');
const token = 'your-token-here';
const decoded = jwt.verify(token, process.env.JWT_SECRET);
console.log(decoded);
```

#### 3. CORS Issues
```javascript
// Check CORS configuration in server.js
app.use(cors({
  origin: ['http://localhost:3000'],
  credentials: true
}));
```

#### 4. Frontend Build Issues
```bash
# Clear npm cache
npm cache clean --force

# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Check for React version conflicts
npm list react react-dom
```

### Debugging Tools

#### Backend Debugging
```javascript
// Add debugging logs
console.log('Request received:', req.body);
console.log('Database query result:', result);

// Use Node.js debugger
node --inspect server.js
```

#### Frontend Debugging
```javascript
// React Developer Tools
// Add console.log for debugging
console.log('Component state:', state);
console.log('API response:', response);
```

## Environment Configuration

### Development Environment
```env
# .env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=employee_management
JWT_SECRET=your_development_secret
JWT_EXPIRES_IN=24h
PORT=5000
NODE_ENV=development
```

### Production Environment
```env
# .env.production
DB_HOST=your_production_db_host
DB_USER=your_production_user
DB_PASSWORD=your_production_password
DB_NAME=employee_management_prod
JWT_SECRET=your_super_secure_production_secret
JWT_EXPIRES_IN=1h
PORT=5000
NODE_ENV=production
```

## Testing Strategy

### Backend Testing
```javascript
// Example test file
const request = require('supertest');
const app = require('../server');

describe('API Endpoints', () => {
  test('GET /api/users should return users', async () => {
    const response = await request(app)
      .get('/api/users')
      .expect(200);
      
    expect(response.body.success).toBe(true);
  });
});
```

### Frontend Testing
```javascript
// Example component test
import { render, screen } from '@testing-library/react';
import ComponentName from './ComponentName';

test('renders component correctly', () => {
  render(<ComponentName />);
  expect(screen.getByText('Expected Text')).toBeInTheDocument();
});
```

## Performance Optimization

### Backend Optimization
1. **Database Indexing**
```sql
-- Add indexes for frequently queried columns
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_employees_user_id ON employees(user_id);
```

2. **Query Optimization**
```javascript
// Use parameterized queries
const query = 'SELECT * FROM users WHERE email = ?';
const [rows] = await db.query(query, [email]);
```

3. **Caching**
```javascript
// Implement caching for frequently accessed data
const cache = new Map();

const getCachedData = (key) => {
  if (cache.has(key)) {
    return cache.get(key);
  }
  // Fetch from database
  const data = await fetchData(key);
  cache.set(key, data);
  return data;
};
```

### Frontend Optimization
1. **Component Optimization**
```javascript
// Use React.memo for expensive components
const ExpensiveComponent = React.memo(({ data }) => {
  return <div>{/* heavy rendering */}</div>;
});

// Use useMemo for expensive calculations
const expensiveValue = useMemo(() => {
  return calculateExpensiveValue(data);
}, [data]);
```

2. **Lazy Loading**
```javascript
// Lazy load components
const LazyComponent = React.lazy(() => import('./LazyComponent'));

// Use with Suspense
<Suspense fallback={<div>Loading...</div>}>
  <LazyComponent />
</Suspense>
```

## Security Best Practices

### Backend Security
1. **Input Validation**
```javascript
// Always validate input
const { body, validationResult } = require('express-validator');

const validateUser = [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    next();
  }
];
```

2. **Password Security**
```javascript
// Use bcrypt for password hashing
const bcrypt = require('bcryptjs');
const saltRounds = 12;

const hashPassword = async (password) => {
  return await bcrypt.hash(password, saltRounds);
};
```

### Frontend Security
1. **XSS Prevention**
```javascript
// Use React's built-in XSS protection
// Never use dangerouslySetInnerHTML with untrusted data
const safeContent = { __html: trustedContent };
<div dangerouslySetInnerHTML={safeContent} />
```

2. **Token Security**
```javascript
// Store tokens securely
// Use httpOnly cookies for production
localStorage.setItem('token', token); // Development only
```

## Deployment Guide

### Development Deployment
```bash
# Start development servers
npm run dev                    # Backend
cd client && npm start         # Frontend
```

### Production Deployment
```bash
# Build frontend
cd client && npm run build

# Start production server
npm start
```

### Docker Deployment
```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 5000
CMD ["npm", "start"]
```

## Troubleshooting Quick Reference

| Issue | Cause | Solution |
|-------|--------|----------|
| Database connection failed | Wrong credentials | Check .env file |
| JWT token invalid | Expired/invalid token | Re-authenticate |
| CORS error | Origin not allowed | Update CORS config |
| Build failed | Missing dependencies | Run npm install |
| Blank page | Route mismatch | Check import paths |

## Contributing Guidelines

### Before Submitting Code
1. Write clear commit messages
2. Follow code standards
3. Add tests for new features
4. Update documentation
5. Test thoroughly

### Commit Message Format
```
type(scope): description

feat(auth): add password reset feature
fix(api): resolve user creation bug
docs(readme): update installation guide
```

### Pull Request Process
1. Create feature branch
2. Make changes with tests
3. Update documentation
4. Submit pull request
5. Code review
6. Merge to main

---

This guide will be updated as the system evolves. For specific issues, check the troubleshooting section or create an issue in the repository.
