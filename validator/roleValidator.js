const { checkSchema } = require('express-validator');

const roleValidationSchema = {
  role: {
    isIn: {
      options: [['hr', 'admin']],
      errorMessage: 'Role must be either hr or admin'
    }
  }
};

module.exports = roleValidationSchema;
