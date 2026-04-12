# User Onboarding Guide

## Overview

This guide explains how the Employee Management System v2.0 handles user onboarding, from initial system setup to adding new users.

## System Setup Flow (First Time)

### Step 1: Initial Access
When the database is empty, the system automatically redirects to the setup page:

1. **Visit**: `http://localhost:3000`
2. **System Check**: `/api/system/status` detects 0 users
3. **Redirect**: User is sent to `/system-setup`

### Step 2: System Initialization
The first user creates the foundational accounts:

1. **Super Admin Account**
   - Email: `super.admin@company.com`
   - Role: `super_admin`
   - Purpose: System administration and oversight

2. **Admin Account**
   - Email: `admin@company.com`
   - Role: `admin`
   - Purpose: User management and daily operations

3. **Company Information**
   - Company name setup
   - System configuration

### Step 3: System Ready
After setup:
- System is marked as initialized
- New users are redirected to `/login`
- Setup page becomes inaccessible

## User Onboarding Flow (After Setup)

### How Admins Add New Users

#### Step 1: Admin Login
1. Admin logs in with credentials
2. Navigates to Admin Dashboard
3. Selects "User Management"

#### Step 2: Create New User
1. Click **"Add User"** button
2. Fill in user information:
   - **Email** (required): `user@company.com`
   - **Role** (required): `employee`, `hr`, or `admin`
   - **First Name** (optional): `John`
   - **Last Name** (optional): `Doe`
   - **Department** (optional): `Engineering`
   - **Position** (optional): `Software Developer`

#### Step 3: User Creation
1. System generates **temporary password**
2. Admin receives success message with password
3. Admin shares credentials with new user
4. User is marked with `isTemporaryPassword = true`

#### Step 4: User Login
1. New user visits `http://localhost:3000`
2. Enters email and temporary password
3. System authenticates and redirects to appropriate dashboard
4. User is prompted to change password on first login

## Role-Based Access

### Super Admin
- **Can**: Create admins, manage system settings, view all audit logs
- **Cannot**: Be deleted by other users
- **Dashboard**: Full system overview and controls

### Admin
- **Can**: Create users (employee, hr, admin), manage users, view audit logs
- **Cannot**: Create other admins (requires super admin)
- **Dashboard**: User management and system operations

### HR
- **Can**: Manage employee records, create employees, view reports
- **Cannot**: Create other users, access admin functions
- **Dashboard**: Employee management and HR functions

### Employee
- **Can**: View own profile, update personal information
- **Cannot**: Create users, access admin functions
- **Dashboard**: Personal dashboard and limited functions

## Security Features

### Temporary Password System
- **Generated**: 12-character random password
- **Secure**: Contains letters, numbers, and symbols
- **Flag**: `isTemporaryPassword = true` in database
- **Requirement**: User must change password on first login

### Audit Trail
- **Logged**: All user creation actions
- **Tracked**: Admin who created user, timestamp, IP address
- **Visible**: In audit logs for compliance

### Authentication
- **JWT Tokens**: Secure session management
- **Role Validation**: Proper role-based access control
- **Input Validation**: Comprehensive validation on all inputs

## API Endpoints

### System Status
```http
GET /api/system/status
Response: { isInitialized: boolean, userCount: number }
```

### System Initialization
```http
POST /api/system/initialize
Body: { superAdmin: {email, password}, admin: {email, password}, companyName: string }
```

### User Creation (Admin)
```http
POST /api/admin/users
Headers: Authorization: Bearer <token>
Body: { email, role, firstName?, lastName?, department?, position? }
Response: { success: true, user: {...}, temporaryPassword: "xK9#mP2@nQ7$" }
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'user',
  firstName VARCHAR(100) NULL,
  lastName VARCHAR(100) NULL,
  department VARCHAR(100) NULL,
  position VARCHAR(100) NULL,
  isTemporaryPassword BOOLEAN DEFAULT FALSE,
  failed_login_attempts INT DEFAULT 0,
  account_locked BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## Troubleshooting

### Common Issues

#### 1. Setup Page Not Showing
**Problem**: System doesn't redirect to setup page
**Solution**: 
```bash
# Clear all users
node reset-system-for-testing.js
```

#### 2. Can't Create Users
**Problem**: "Add User" button not working
**Solution**: 
- Check admin authentication token
- Verify user has admin role
- Check browser console for errors

#### 3. User Can't Login
**Problem**: Invalid credentials error
**Solution**:
- Verify email is correct
- Check temporary password spelling
- Ensure user was created successfully

#### 4. Role Access Issues
**Problem**: User can't access expected features
**Solution**:
- Verify user role in database
- Check role-based route protection
- Ensure proper JWT token claims

### Debug Commands

#### Check System Status
```bash
curl http://localhost:5000/api/system/status
```

#### Test User Creation
```bash
curl -X POST http://localhost:5000/api/admin/users \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"email":"test@company.com","role":"employee"}'
```

#### Check Database
```bash
node check-table-structure.js
```

## Best Practices

### For Admins
1. **Use strong temporary passwords** - System generates secure passwords
2. **Communicate securely** - Share credentials via secure channels
3. **Verify user roles** - Double-check role assignments
4. **Monitor audit logs** - Review user creation activities

### For New Users
1. **Change password immediately** - Don't keep temporary passwords
2. **Use strong passwords** - Mix letters, numbers, symbols
3. **Update profile** - Add personal information
4. **Report issues** - Contact admin for login problems

### For Developers
1. **Validate all inputs** - Never trust user input
2. **Use proper authentication** - Always verify JWT tokens
3. **Log security events** - Track user creation and role changes
4. **Handle errors gracefully** - Provide clear error messages

## Migration Notes

### From v1.0 to v2.0
- **New fields added**: firstName, lastName, department, position, isTemporaryPassword
- **Enhanced security**: Temporary password system
- **Better UX**: Modal-based user creation
- **Improved audit logging**: Comprehensive tracking

### Database Updates
Run migration script to add new fields:
```bash
node add-user-fields-simple.js
```

## Future Enhancements

### Planned Features
1. **Email Invitations**: Send email invitations instead of sharing passwords
2. **Bulk User Creation**: CSV import for multiple users
3. **User Templates**: Pre-configured role templates
4. **Approval Workflows**: Multi-step user approval process
5. **Self-Service Registration**: Allow users to request accounts

### Security Improvements
1. **Multi-Factor Authentication**: Add 2FA for sensitive roles
2. **Password Policies**: Enforce strong password requirements
3. **Session Management**: Better session timeout and handling
4. **Encryption**: Encrypt sensitive data in database

---

## Summary

The Employee Management System v2.0 provides a complete user onboarding solution:

1. **Initial Setup**: First user creates Super Admin and Admin accounts
2. **User Management**: Admins can create users with temporary passwords
3. **Role-Based Access**: Proper permissions for different user types
4. **Security First**: Temporary passwords, audit logging, and validation
5. **Great UX**: Modern modal interface and clear workflows

This system ensures that only authorized users can access the system while maintaining security and compliance requirements.

**For questions or issues**, refer to the troubleshooting section or contact the development team.
