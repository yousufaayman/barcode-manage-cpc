import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';

const UnauthorizedPage: React.FC = () => {
  const { user } = useAuth();
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-cream flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-lg shadow-md p-8 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
        </div>
        
        <h1 className="text-2xl font-bold text-gray-800 mb-2">{t('auth.accessDenied')}</h1>
        <p className="text-gray-600 mb-6">
          {user ? (
            <>
              {t('auth.currentRole')} <span className="font-semibold">{user.role}</span> {t('auth.doesNotHavePermission')}
            </>
          ) : (
            <>
              {t('auth.noPermission')}
            </>
          )}
        </p>
        
        <div className="flex flex-col items-center gap-3">
          <Link to="/dashboard" className="btn-primary w-full max-w-xs">
            {t('navigation.goToDashboard')}
          </Link>
        </div>
      </div>
    </div>
  );
};

export default UnauthorizedPage;
