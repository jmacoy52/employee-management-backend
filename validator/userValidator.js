const { checkSchema } = require("express-validator");
const { ROLES, MIN_PASSWORD_LENGTH } = require("../config/roles");

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
        options: { min: MIN_PASSWORD_LENGTH },
        errorMessage: `Password must be at least ${MIN_PASSWORD_LENGTH} characters long`,
      }
      
    },
  
    role: {
      optional: true, // Defaults to 'employee'. Who may pick which role is checked in the controller.
      isIn: {
        options: [ROLES],
        errorMessage: `Invalid role. Must be one of: ${ROLES.join(', ')}`,
      }
    }
  };
  
  // Export schema wrapped in checkSchema
  module.exports = checkSchema(userValidationSchema);

