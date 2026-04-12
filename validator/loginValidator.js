const { checkSchema } = require('express-validator');

const loginValidationSchema = {
  email: {
    notEmpty: {
      errorMessage: 'Email is required'
    },
    isEmail: {
      errorMessage: 'Invalid email format'
    }
  },
  password: {
    notEmpty: {
      errorMessage: 'Password is required'
    },
    isLength: {
      options: { min: 1 },
      errorMessage: 'Password is required'
    }
  }
};

module.exports = checkSchema(loginValidationSchema);
