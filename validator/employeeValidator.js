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
    }
  },

  email: {
    isEmail: {
      errorMessage: 'Invalid email format',
    },
    custom: {
      options: async (value) => {
        const existingEmployee = await EmployeeModel.findEmployeeByEmail(value);
        if (existingEmployee) {
          throw new Error('Employee email already exists');
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
    isFloat: {
      options: { min: 0 },
      errorMessage: 'Salary must be a positive number',
    }
  }
};

module.exports = checkSchema(employeeValidationSchema);
