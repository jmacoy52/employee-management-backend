const { checkSchema } = require('express-validator');
const UserModel = require('../models/userModel');

// User base validation (without role)
const userValidationSchema = {
  username: {
    notEmpty: {
      errorMessage: 'Username is required'
    },
    isLength: {
      options: { min: 3, max: 50 },
      errorMessage: 'Username must be between 3 and 50 characters'
    }
  },

  email: {
    isEmail: {
      errorMessage: 'Invalid email format'
    },
    custom: {
      options: async (value) => {
        const existingUser = await UserModel.findUserByEmail(value);
        if (existingUser) {
          throw new Error('Email already in use');
        }
        return true;
      }
    }
  },

  password: {
    isLength: {
      options: { min: 8 },
      errorMessage: 'Password must be at least 8 characters long'
    }
  }
};

module.exports = checkSchema(userValidationSchema);

