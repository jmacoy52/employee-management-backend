const { checkSchema } = require('express-validator');
const UserModel = require('../models/userModel');
const roleValidationSchema = require('./roleValidator');

const registerValidationSchema = {
  username: {
    notEmpty: {
      errorMessage: 'Username is required'
    },
    isLength: {
      options: { min: 3, max: 50 },
      errorMessage: 'Username must be between 3 and 50 characters'
    },
    trim: true,
    escape: true
  },
  email: {
    notEmpty: {
      errorMessage: 'Email is required'
    },
    isEmail: {
      errorMessage: 'Invalid email format'
    },
    normalizeEmail: true,
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
    notEmpty: {
      errorMessage: 'Password is required'
    },
    isLength: {
      options: { min: 8 },
      errorMessage: 'Password must be at least 8 characters long'
    },
    isStrongPassword: {
      options: {
        minLength: 8,
        minLowercase: 1,
        minUppercase: 1,
        minNumbers: 1,
        minSymbols: 1
      },
      errorMessage: 'Password must contain at least 8 characters with uppercase, lowercase, number, and symbol'
    }
  },
  ...roleValidationSchema // Merge role validation
};

module.exports = checkSchema(registerValidationSchema);
