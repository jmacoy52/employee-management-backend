const { checkSchema } = require("express-validator");

// Import  UserModel to perform DB checks like email uniqueness
const UserModel = require("../models/userModel");

const userValidationSchema = {
    username: {
      notEmpty: {
        errorMessage: 'Username is required',
      },
      isLength: {
        options: { min: 3, max: 50 },
        errorMessage: 'Username must be between 3 and 50 characters',
      }
    },
  
    email: {
      isEmail: {
        errorMessage: 'Invalid email format',
      },
      // Custom validator to check if email already exists
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
        errorMessage: 'Password must be at least 8 characters long',
      }
      
    },
  
    role: {
      optional: true, // Make it optional so users default to 'hr'
      isIn: {
        options: [['hr', 'admin']], // Only allow 'hr' or 'admin'
        errorMessage: 'Invalid role. Must be either hr or admin',
      }
    }
  };
  
  // Export schema wrapped in checkSchema
  module.exports = checkSchema(userValidationSchema);

