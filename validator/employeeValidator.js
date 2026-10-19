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
    // Email is optional (the column allows NULL); when given it must be valid and unique
    optional: { options: { values: 'falsy' } },
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

  Department: {
    notEmpty: {
      errorMessage: 'Department is required',
    },
    isLength: {
      options: { min: 2, max: 100 },
      errorMessage: 'Department must be between 2 and 100 characters',
    }
  },

  salary: {
    isFloat: {
      options: { min: 0, max: 9999999999 },
      errorMessage: 'Salary must be a positive number',
    }
  }
};

// Updates use the same rules except email (not editable on update, so no uniqueness check)
const { email, ...employeeUpdateSchema } = employeeValidationSchema;

module.exports = checkSchema(employeeValidationSchema);
module.exports.update = checkSchema(employeeUpdateSchema);
