# Employee Management System v2.0

A comprehensive employee management system with role-based access control, authentication, and modern React frontend.

## Overview

This is version 2.0 of the Employee Management System, featuring significant architectural improvements, enhanced security, and a modern React-based frontend.

## Key Features v2.0

### Enhanced Architecture
- **Separation of Concerns**: Clean separation between authentication, user management, and business logic
- **Role-Based Access Control**: Admin, HR, and Employee roles with specific permissions
- **Modern React Frontend**: Built with React 18, React Router v6, and custom CSS
- **RESTful API Design**: Well-structured API endpoints with proper validation

### Security Improvements
- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Input Validation**: Comprehensive validation using express-validator
- **Rate Limiting**: Protection against brute force attacks
- **CORS Configuration**: Proper cross-origin resource sharing setup
- **Helmet Security**: Security headers for enhanced protection

### User Experience
- **Role-Specific Dashboards**: Different interfaces for Admin, HR, and Employees
- **Real-time Notifications**: System notifications for important events
- **Profile Management**: User profile with picture upload capability
- **Audit Logging**: Comprehensive audit trail for all system actions

## Technical Stack

### Backend
- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **MySQL** - Database
- **JWT** - Authentication
- **bcryptjs** - Password hashing
- **Multer** - File uploads
- **Nodemailer** - Email services

### Frontend
- **React 18.3.1** - UI framework
- **React Router 6.28.0** - Client-side routing
- **Axios** - HTTP client
- **Lucide React** - Icons
- **React Hot Toast** - Notifications
- **Custom CSS** - Styling (migrated from Tailwind)

## Project Structure

```
employee-management-backend/
|-- backend/
|   |-- config/           # Database configuration
|   |-- controllers/      # Route controllers
|   |-- middleware/       # Custom middleware
|   |-- models/          # Data models
|   |-- routes/          # API routes
|   |-- services/        # Business logic services
|   |-- utils/           # Utility functions
|   |-- validator/       # Input validation
|   |-- uploads/         # File upload directory
|   |-- server.js        # Main server file
|   |-- package.json     # Dependencies
|   |-- .env            # Environment variables (not committed)
|
|-- client/
|   |-- public/         # Static assets
|   |-- src/
|   |   |-- components/  # React components
|   |   |-- contexts/    # React contexts
|   |   |-- services/    # API services
|   |   |-- styles/      # CSS styles
|   |   |-- App-v2.js    # Main app component
|   |   |-- index.js     # Entry point
|   |-- package.json    # Frontend dependencies
|
|-- docs/               # Documentation
|-- postman/           # API collection
|-- README-V2.md       # This file
```

## Installation & Setup

### Prerequisites
- Node.js (v16 or higher)
- MySQL (v8.0 or higher)
- npm or yarn

### Backend Setup

1. **Clone the repository**
```bash
git clone <repository-url>
cd employee-management-backend
```

2. **Install dependencies**
```bash
npm install
```

3. **Database Setup**
```bash
# Create database
mysql -u root -p
CREATE DATABASE employee_management;

# Run setup script
node setup-db.js
```

4. **Environment Configuration**
```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=employee_management
JWT_SECRET=your_jwt_secret
PORT=5000
```

5. **Start Backend Server**
```bash
npm run dev
```

### Frontend Setup

1. **Navigate to client directory**
```bash
cd client
```

2. **Install dependencies**
```bash
npm install
```

3. **Start Development Server**
```bash
npm start
```

### Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **API Documentation**: Check Postman collection in `/postman/`

## Major Changes from v1.0

### Architecture Improvements
1. **Service Layer**: Introduced service layer for business logic separation
2. **Enhanced Authentication**: Improved JWT handling with refresh tokens
3. **Error Handling**: Centralized error handling middleware
4. **Validation**: Comprehensive input validation throughout the system

### Frontend Migration
1. **React 18**: Upgraded from older React version
2. **Custom CSS**: Migrated from Tailwind CSS to custom CSS for better control
3. **Component Structure**: Reorganized components with better separation
4. **State Management**: Implemented React Context for global state

### Security Enhancements
1. **Password Security**: Enhanced password hashing and validation
2. **Session Management**: Improved token management and expiration
3. **Input Sanitization**: Comprehensive input validation and sanitization
4. **Audit Trail**: Complete audit logging system

### Database Improvements
1. **Schema Optimization**: Improved database schema design
2. **Indexing**: Added proper database indexes for performance
3. **Migration Scripts**: Database migration and setup scripts
4. **Backup Scripts**: Automated backup and reset functionality

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/verify` - Token verification

### User Management
- `GET /api/users/profile` - Get user profile
- `PUT /api/users/profile` - Update user profile
- `POST /api/users/upload-picture` - Upload profile picture

### Admin Routes
- `GET /api/admin/dashboard` - Admin dashboard data
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:id` - Update user
- `DELETE /api/admin/users/:id` - Delete user

### HR Routes
- `GET /api/hr/employees` - Get employees
- `POST /api/hr/employees` - Add employee
- `PUT /api/hr/employees/:id` - Update employee
- `DELETE /api/hr/employees/:id` - Delete employee

## Testing

### Reset System for Testing
```bash
# Clear all users and reset system
node reset-system-for-testing.js
```

### Database Testing
```bash
# Test database connection
node test-db.js
```

## Development

### Environment Variables
Create a `.env` file in the root directory:

```env
# Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=employee_management

# JWT
JWT_SECRET=your_super_secret_jwt_key
JWT_EXPIRES_IN=24h

# Server
PORT=5000
NODE_ENV=development

# Email (Optional)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_app_password
```

### Common Development Commands

```bash
# Start backend in development
npm run dev

# Start frontend
cd client && npm start

# Reset database for testing
node reset-system-for-testing.js

# Test database connection
node test-db.js
```

## Deployment

### Production Build
```bash
# Build frontend
cd client
npm run build

# Start production server
npm start
```

### Environment Setup for Production
1. Set `NODE_ENV=production`
2. Configure production database
3. Set up proper CORS origins
4. Configure SSL/HTTPS
5. Set up reverse proxy (nginx/Apache)

## Security Considerations

- Never commit `.env` files
- Use strong JWT secrets
- Implement proper password policies
- Regular security updates
- Monitor audit logs
- Implement rate limiting in production
- Use HTTPS in production

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Check MySQL service is running
   - Verify database credentials in `.env`
   - Ensure database exists

2. **JWT Token Issues**
   - Check JWT_SECRET in environment
   - Verify token expiration settings
   - Clear browser cookies/localStorage

3. **CORS Issues**
   - Verify frontend URL in CORS config
   - Check if both servers are running
   - Ensure proper headers in requests

4. **File Upload Issues**
   - Check uploads directory permissions
   - Verify file size limits
   - Ensure proper MIME types

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the ISC License.

## Support

For issues and questions:
- Check the troubleshooting section
- Review the API documentation
- Create an issue in the repository
- Contact the development team

---

**Version**: 2.0.0  
**Last Updated**: 2025-04-12  
**Compatibility**: Node.js 16+, MySQL 8.0+, React 18+
