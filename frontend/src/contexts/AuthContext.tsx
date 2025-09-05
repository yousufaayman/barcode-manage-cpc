import React, { createContext, useState, useContext, useEffect } from 'react';
import { authApi, User } from '../services/api';

// Define user roles
export type UserRole = 'Admin' | 'Cutting' | 'Sewing' | 'Packaging' | 'Creator';

// Define context type
type AuthContextType = {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
};

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initializeAuth = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          const userData = await authApi.getCurrentUser();
          setUser(userData);
        } catch (err) {
          console.error('Failed to get user data:', err);
          localStorage.removeItem('token');
        }
      }
      setIsLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const { access_token } = await authApi.login(username, password);
      localStorage.setItem('token', access_token);
      
      const userData = await authApi.getCurrentUser();
      setUser(userData);
    } catch (err: any) {
      let errorMessage = 'An error occurred during login';
      
      if (err.response) {
        // Server responded with error status
        const status = err.response.status;
        const detail = err.response.data?.detail || err.response.data?.message;
        
        switch (status) {
          case 401:
            errorMessage = detail || 'Incorrect username or password';
            break;
          case 403:
            errorMessage = detail || 'Account is locked or disabled';
            break;
          case 429:
            errorMessage = detail || 'Too many login attempts. Please try again later.';
            break;
          case 500:
            errorMessage = detail || 'Server error. Please try again later.';
            break;
          default:
            errorMessage = detail || `Login failed (${status})`;
        }
      } else if (err.request) {
        // Network error
        errorMessage = 'Network error. Please check your connection and try again.';
      } else {
        // Other error
        errorMessage = err.message || 'An unexpected error occurred';
      }
      
      setError(errorMessage);
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setError(null);
    localStorage.removeItem('token');
  };

  const clearError = () => {
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
        clearError,
        isAuthenticated: !!user,
        isLoading,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
