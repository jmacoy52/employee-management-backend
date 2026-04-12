import React from 'react';

const Input = ({ 
  label, 
  type = 'text', 
  placeholder = '', 
  value, 
  onChange, 
  error = '', 
  disabled = false, 
  className = '',
  ...props 
}) => {
  const baseClasses = 'block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm disabled:bg-gray-100 disabled:cursor-not-allowed';
  
  const labelClasses = 'block text-sm font-medium text-gray-700 mb-1';
  const errorClasses = 'text-red-600 text-xs mt-1';
  
  return (
    <div className={className}>
      {label && (
        <label className={labelClasses}>
          {label}
        </label>
      )}
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`${baseClasses} ${error ? 'border-red-500' : ''}`}
        {...props}
      />
      {error && (
        <p className={errorClasses}>
          {error}
        </p>
      )}
    </div>
  );
};

export default Input;
