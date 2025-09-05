import React, { useState, FormEvent, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { Eye, EyeOff, LogIn, AlertCircle } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState('');
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  
  const { login, error, isLoading, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  
  const from = location.state?.from?.pathname || '/dashboard';

  // Clear form errors when user starts typing
  useEffect(() => {
    if (username || password) {
      setFormError('');
    }
  }, [username, password]);

  // Clear auth errors when user starts typing
  useEffect(() => {
    if (error && (username || password)) {
      clearError();
    }
  }, [error, username, password, clearError]);

  // Handle lockout after too many attempts
  useEffect(() => {
    if (loginAttempts >= 5) {
      setIsLocked(true);
      const timer = setTimeout(() => {
        setIsLocked(false);
        setLoginAttempts(0);
      }, 300000); // 5 minutes lockout
      
      return () => clearTimeout(timer);
    }
  }, [loginAttempts]);

  const validateForm = () => {
    if (!username.trim()) {
      setFormError(t('auth.usernameRequired'));
      return false;
    }
    
    if (!password.trim()) {
      setFormError(t('auth.passwordRequired'));
      return false;
    }
    
    // Basic input validation
    if (username.length < 3) {
      setFormError(t('auth.usernameTooShort'));
      return false;
    }
    
    if (password.length < 6) {
      setFormError(t('auth.passwordTooShort'));
      return false;
    }
    
    setFormError('');
    return true;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    
    if (isLocked) {
      setFormError(t('auth.tooManyAttempts'));
      return;
    }
    
    if (!validateForm()) return;
    
    try {
      await login(username, password);
      // Reset attempts on successful login
      setLoginAttempts(0);
      setFormError('');
      navigate(from, { replace: true });
    } catch (err) {
      // Increment login attempts on failure
      setLoginAttempts(prev => prev + 1);
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
          <h1 className="text-3xl font-bold text-green">{t('company.name')}</h1>
          <p className="text-gray-600 mt-2">{t('company.tagline')}</p>
        </div>
        
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          <div className="bg-green p-6 text-center">
            <h2 className="text-xl font-semibold text-white flex items-center justify-center gap-2">
              <LogIn size={20} />
              {t('auth.signInToAccount')}
            </h2>
          </div>
          
          <div className="p-8">
            {(error || formError) && (
              <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-400 text-red-700 rounded flex items-start gap-3">
                <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{error || formError}</p>
                  {isLocked && (
                    <p className="text-sm mt-1 opacity-90">
                      {t('auth.tooManyAttempts')} Please wait 5 minutes before trying again.
                    </p>
                  )}
                  {loginAttempts > 0 && loginAttempts < 5 && (
                    <p className="text-sm mt-1 opacity-90">
                      {5 - loginAttempts} {t('common.attempts')} remaining.
                    </p>
                  )}
                </div>
              </div>
            )}
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="form-group">
                <label htmlFor="username" className="text-gray-700 font-medium block mb-2">
                  {t('auth.username')}
                </label>
                <input
                  id="username"
                  type="text"
                  className="input-field"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('auth.enterUsername')}
                  disabled={isLoading || isLocked}
                />
              </div>
              
              <div className="form-group">
                <label htmlFor="password" className="text-gray-700 font-medium block mb-2">
                  {t('auth.password')}
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    className="input-field pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={t('auth.enterPassword')}
                    disabled={isLoading || isLocked}
                  />
                  <button
                    type="button"
                    onClick={togglePasswordVisibility}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    tabIndex={-1}
                    disabled={isLoading || isLocked}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              
              <button
                type="submit"
                className="btn-primary w-full py-3 text-lg flex items-center justify-center"
                disabled={isLoading || isLocked}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    {t('auth.signingIn')}
                  </span>
                ) : (
                  <span className="flex items-center justify-center">
                    <LogIn className="mr-2" size={20} />
                    {t('auth.signIn')}
                  </span>
                )}
              </button>
            </form>
          </div>
        </div>
        
        <div className="mt-6 text-center text-gray-500 text-sm">
          &copy; {new Date().getFullYear()} {t('company.name')}. {t('company.copyright')}
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
