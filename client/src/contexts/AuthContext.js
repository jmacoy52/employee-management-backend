import React, { createContext, useContext, useReducer, useEffect } from 'react';
import authService from '../services/authService';
import secureStorage from '../services/secureStorage';

// Initial state
const initialState = {
  user: null,
  token: null,
  isAuthenticated: false,
  loading: false,
  error: null
};

// Action types
const AUTH_ACTIONS = {
  LOGIN_START: 'LOGIN_START',
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  CLEAR_ERROR: 'CLEAR_ERROR'
};

// Reducer
const authReducer = (state, action) => {
  switch (action.type) {
    case AUTH_ACTIONS.LOGIN_START:
      return { ...state, loading: true, error: null };
    
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      return {
        ...state,
        loading: false,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        error: null
      };
    
    case AUTH_ACTIONS.LOGIN_FAILURE:
      return {
        ...state,
        loading: false,
        isAuthenticated: false,
        user: null,
        token: null,
        error: action.payload
      };
    
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        error: null
      };
    
    case AUTH_ACTIONS.CLEAR_ERROR:
      return { ...state, error: null };
    
    default:
      return state;
  }
};

// Create context
const AuthContext = createContext();

// Provider component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check for existing auth on mount
  useEffect(() => {
    const token = secureStorage.getToken();
    const user = secureStorage.getUser();
    
    if (token && user) {
      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: { token, user }
      });
    }
  }, []);

  // Login action
  const login = async (credentials) => {
    dispatch({ type: AUTH_ACTIONS.LOGIN_START });
    
    const result = await authService.login(credentials);
    
    if (result.success) {
      dispatch({
        type: AUTH_ACTIONS.LOGIN_SUCCESS,
        payload: result.data
      });
    } else {
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: result.error
      });
    }
    
    return result;
  };

  // Logout action
  const logout = () => {
    authService.logout();
    dispatch({ type: AUTH_ACTIONS.LOGOUT });
  };

  const value = {
    ...state,
    login,
    logout,
    isAuthenticated: state.isAuthenticated,
    user: state.user,
    token: state.token
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
