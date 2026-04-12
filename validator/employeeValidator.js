const { checkSchema } = require('express-validator');

// Import EmployeeModel to check email uniqueness
const EmployeeModel = require('../models/employeeModel');

const employeeValidationSchema = {
  FullName: {
    notEmpty: {
      errorMessage: 'Employee name is required',
    },
    isLength: {
      options: { min: 3, max: 100 },
      errorMessage: 'Name must be between 3 and 100 characters',
    },
    trim: true,
    escape: true
  },

  email: {
    optional: true,
    isEmail: {
      errorMessage: 'Invalid email format',
    },
    normalizeEmail: true,
    custom: {
      options: async (value) => {
        if (value) {
          const existingEmployee = await EmployeeModel.findEmployeeByEmail(value);
          if (existingEmployee) {
            throw new Error('Employee email already exists');
          }
        }
        return true;
      }
    }
  },

  position: {
    notEmpty: {
      errorMessage: 'Position is required',
    },
    isLength: {
      options: { min: 2, max: 50 },
      errorMessage: 'Position must be between 2 and 50 characters',
    }
  },

  salary: {
    custom: {
      options: (value) => {
        const salaryNum = parseFloat(value);
        if (!value || isNaN(salaryNum) || salaryNum <= 0) {
          throw new Error('Please enter a valid salary amount');
        }
        if (salaryNum < 1000) {
          throw new Error('Salary must be at least ₵1,000 per month');
        }
        return true;
      }
    }
  },

  start_date: {
    optional: true,
    isDate: {
      errorMessage: 'Please enter a valid date'
    },
    custom: {
      options: (value) => {
        if (value) {
          const date = new Date(value);
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          
          if (date > today) {
            throw new Error('Start date cannot be in the future');
          }
          
          // Check if date is not too old (e.g., more than 50 years)
          const minDate = new Date();
          minDate.setFullYear(minDate.getFullYear() - 50);
          if (date < minDate) {
            throw new Error('Start date is too far in the past');
          }
        }
        return true;
      }
    }
  }
};

module.exports = checkSchema(employeeValidationSchema);
