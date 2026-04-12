# Employee Management System API Endpoints

## Base URL
`http://localhost:5000` (or configured PORT)

## Authentication
- JWT token required for protected routes
- Include in header: `Authorization: Bearer <token>`

## Roles
- **HR**: Employee management
- **Admin**: User management, audit logs, + HR permissions

---

## Public Routes

### Home
- **GET** `/`
  - Description: Welcome message
  - Auth: None

### User Registration
- **POST** `/api/users/register`
  - Description: Register new user (HR or Admin)
  - Body: `{ "username": "string", "email": "string", "password": "string", "role": "hr|admin" }`
  - Validation: Required fields, email format, password length, unique email, role validation
  - Response: `{ "message": "User registered successfully", "userId": number }`

### User Login
- **POST** `/api/users/login`
  - Description: Authenticate user
  - Body: `{ "email": "string", "password": "string" }`
  - Validation: Required fields, email format
  - Response: `{ "message": "Login successful", "token": "jwt_token" }`
  - Errors: 401 Invalid credentials, 423 Account locked (after 3 failed attempts)

### Forgot Password
- **POST** `/api/users/forgot-password`
  - Description: Request password reset
  - Body: `{ "email": "string" }`
  - Response: Reset token generated or 404 if user not found
  - Errors: 404 User not found

### Reset Password
- **POST** `/api/users/reset-password`
  - Description: Reset password with token
  - Body: `{ "token": "string", "newPassword": "string" }`
  - Response: Password reset confirmation

### Change Password
- **PUT** `/api/users/change-password`
  - Description: Change password for authenticated user
  - Auth: JWT
  - Body: `{ "currentPassword": "string", "newPassword": "string" }`
  - Validation: New password min 8 chars, verify current password
  - Response: `{ "message": "Password changed successfully" }`

---

## Authenticated Routes (Any Logged-in User)

### Get Profile
- **GET** `/api/users/profile`
  - Description: Get current user's profile
  - Auth: JWT
  - Response: User object (without password)

### Update Profile
- **PUT** `/api/users/profile`
  - Description: Update current user's profile
  - Auth: JWT
  - Body: `{ "username": "string", "email": "string" }` (sensitive fields excluded)
  - Response: `{ "message": "Profile updated successfully" }`

---

## HR Routes (HR or Admin)

### Get All Employees
- **GET** `/api/employees?page=1&limit=10`
  - Description: Retrieve all employees with pagination
  - Auth: JWT + HR/Admin
  - Query Params: `page` (default 1), `limit` (default 10)
  - Response: `{ employees: [...], pagination: { currentPage, totalPages, totalEmployees, limit } }`

### Get Employee by ID
- **GET** `/api/employees/:id`
  - Description: Retrieve specific employee
  - Auth: JWT + HR/Admin
  - Params: `id` (employee ID)
  - Response: Employee object

### Create Employee
- **POST** `/api/employees`
  - Description: Add new employee
  - Auth: JWT + HR/Admin
  - Body: `{ "FullName": "string", "position": "string", "Department": "string", "salary": number, "email": "string" }`
  - Validation: Required fields
  - Response: `{ "message": "Employee created successfully", "id": number }`

### Update Employee
- **PUT** `/api/employees/:id`
  - Description: Update employee details
  - Auth: JWT + HR/Admin
  - Params: `id` (employee ID)
  - Body: `{ "FullName": "string", "position": "string", "Department": "string", "salary": number }`
  - Response: `{ "message": "Employee updated successfully" }`

### Delete Employee
- **DELETE** `/api/employees/:id`
  - Description: Remove employee
  - Auth: JWT + HR/Admin
  - Params: `id` (employee ID)
  - Response: `{ "message": "Employee deleted successfully" }`

---

## Admin Routes (Admin Only)

### Get All Users
- **GET** `/api/admin/users`
  - Description: Retrieve all users
  - Auth: JWT + Admin
  - Response: Array of user objects (id, username, email, role, created_at)

### Get User by ID
- **GET** `/api/admin/users/:id`
  - Description: Retrieve specific user
  - Auth: JWT + Admin
  - Params: `id` (user ID)
  - Response: User object (id, username, email, role, created_at) - password excluded
  - Error: 404 if user not found

### Get User by ID
- **GET** `/api/admin/users/:id`
  - Description: Retrieve specific user
  - Auth: JWT + Admin
  - Params: `id` (user ID)
  - Response: User object (id, username, email, role, created_at)

### Update User Role
- **PUT** `/api/admin/users/:id/role`
  - Description: Change user role
  - Auth: JWT + Admin
  - Params: `id` (user ID)
  - Body: `{ "role": "hr|admin" }`
  - Validation: Role validation
  - Response: `{ "message": "User role updated successfully" }`

### Delete User
- **DELETE** `/api/admin/users/:id`
  - Description: Remove user
  - Auth: JWT + Admin
  - Params: `id` (user ID)
  - Response: `{ "message": "User deleted successfully" }`

### Get All Audit Logs
- **GET** `/api/admin/audit-logs`
  - Description: Retrieve full audit log
  - Auth: JWT + Admin
  - Response: Array of audit log entries

### Get Recent Audit Activities
- **GET** `/api/admin/audit-logs/recent`
  - Description: Retrieve recent audit activities
  - Auth: JWT + Admin
  - Response: Array of recent log entries

### Insert Audit Log (Testing)
- **POST** `/api/admin/audit-logs`
  - Description: Manually insert audit log entry
  - Auth: JWT + Admin
  - Body: `{ "userId": number, "actions": "string", "descriptions": "string" }`
  - Response: `{ "message": "Audit log created successfully", "logId": number }`

---

## Error Responses
- **400 Bad Request**: Validation errors or invalid payload
- **401 Unauthorized**: Missing/invalid token or invalid credentials
- **403 Forbidden**: Insufficient permissions
- **404 Not Found**: Resource not found
- **423 Locked**: Account locked due to failed login attempts
- **500 Internal Server Error**: Server error

## Notes
- All protected routes require JWT authentication
- Payloads are strictly validated to prevent extra fields
- Audit logging captures vital activities only
- Roles: 'hr' for HR operations, 'admin' for full system access
- Account locking: After 3 failed login attempts, account is locked; password reset unlocks it
- Database requires: `failed_login_attempts` INT DEFAULT 0, `account_locked` BOOLEAN DEFAULT FALSE in users table