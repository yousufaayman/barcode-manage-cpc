
import React, { useState, FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Eye, EyeOff, LogIn } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  
  const { login, error, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || '/dashboard';

  const validateForm = () => {
    if (!username.trim()) {
      setFormError('Username is required');
      return false;
    }
    
    if (!password.trim()) {
      setFormError('Password is required');
      return false;
    }
    
    setFormError('');
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      // Error is handled in the auth context
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/lovable-uploads/33fc39df-cd6b-474a-93eb-94892c005f8e.png" alt="Cotton Plus Logo" className="h-24 w-24" />
          </div>
          <h1 className="text-3xl font-bold text-green">Cotton Plus Clothing</h1>
          <p className="text-gray-600 mt-2">Inventory Management System</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-green p-6 text-center">
            <h2 className="text-xl font-semibold text-white flex items-center justify-center gap-2">
              <LogIn size={20} />
              Sign In to Your Account
            </h2>
          </div>
          
          <div className="p-8">
            {(error || formError) && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700 rounded">
                <p className="font-medium">{error || formError}</p>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="form-group">
                <label htmlFor="username" className="text-gray-700 font-medium block mb-2">
                  Username
                </label>
                <input
                  id="username"
                  type="text"
                  className="input-field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  disabled={isLoading}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password" className="text-gray-700 font-medium block mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="input-field pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    disabled={isLoading}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              
              <button
                type="submit"
                className="btn-primary w-full py-3 text-lg flex items-center justify-center"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Signing in...
                  </span>
                ) : (
                  <span className="flex items-center justify-center">
                    <LogIn className="mr-2" size={20} />
                    Sign In
                  </span>
                )}
              </button>
            </form>

            <div className="mt-8 p-4 bg-lime bg-opacity-40 rounded-lg">
              <h3 className="text-green font-medium text-center mb-2">Demo Credentials</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="bg-white p-2 rounded shadow-sm">
                  <span className="font-semibold block">Admin</span>
                  <span className="text-gray-600">admin / admin123</span>
                </div>
                <div className="bg-white p-2 rounded shadow-sm">
                  <span className="font-semibold block">Cutting</span>
                  <span className="text-gray-600">cutting / cutting123</span>
                </div>
                <div className="bg-white p-2 rounded shadow-sm">
                  <span className="font-semibold block">Sewing</span>
                  <span className="text-gray-600">sewing / sewing123</span>
                </div>
                <div className="bg-white p-2 rounded shadow-sm">
                  <span className="font-semibold block">Packaging</span>
                  <span className="text-gray-600">packaging / packaging123</span>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="mt-6 text-center text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} Cotton Plus Clothing. All rights reserved.
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
