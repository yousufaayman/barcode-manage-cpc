import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

interface NavbarProps {
  onMenuClick: () => void;
}

const Navbar: React.FC<NavbarProps> = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
        <div className="flex items-center">
          {/* Hamburger Menu Button */}
          <button
            onClick={onMenuClick}
            className="md:hidden mr-4 p-2 text-gray-500 hover:text-gray-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-green">Barcode Management System</h1>
        </div>
        <div className="flex items-center space-x-4">
          {user && (
            <>
              <div className="text-sm hidden md:block">
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
