
import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold text-green">Inventory Management System</h1>
        </div>
        <div className="flex items-center space-x-4">
          {user && (
            <>
              <div className="text-sm">
                <span className="text-gray-500">Logged in as: </span>
                <span className="font-semibold">{user.username}</span>
                <span className="ml-2 px-2 py-1 bg-mint text-white text-xs rounded-full">
                  {user.role}
                </span>
              </div>
              <button 
                onClick={handleLogout} 
                className="text-sm text-gray-600 hover:text-green transition-colors"
              >
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
