
import React, { createContext, useState, useContext, useEffect } from 'react';

// Define user roles
export type UserRole = 'Admin' | 'Cutting' | 'Sewing' | 'Packaging';

// Define user type
export type User = {
  id: number;
  username: string;
  role: UserRole;
};

// Define context type
type AuthContextType = {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
};

// Create context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Sample users for demo
const MOCK_USERS = [
  { id: 1, username: 'admin', password: 'admin123', role: 'Admin' as UserRole },
  { id: 2, username: 'cutting', password: 'cutting123', role: 'Cutting' as UserRole },
  { id: 3, username: 'sewing', password: 'sewing123', role: 'Sewing' as UserRole },
  { id: 4, username: 'packaging', password: 'packaging123', role: 'Packaging' as UserRole },
];

// Provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing user session in localStorage
    const storedUser = localStorage.getItem('user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 800));

      // Find user in mock data (in real app, this would be an API call)
      const matchedUser = MOCK_USERS.find(
        u => u.username === username && u.password === password
      );

      if (!matchedUser) {
        throw new Error('Invalid username or password');
      }

      // Store user without password
      const { password: _, ...userWithoutPassword } = matchedUser;
      setUser(userWithoutPassword);
      localStorage.setItem('user', JSON.stringify(userWithoutPassword));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred during login');
      console.error('Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        login,
        logout,
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
