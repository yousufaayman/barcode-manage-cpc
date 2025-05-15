import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const NavItem = ({ to, label }: { to: string; label: string }) => (
    <Link
      to={to}
      onClick={onClose}
      className={`block px-4 py-2 rounded-md transition-colors ${
        isActive(to)
          ? 'bg-green text-white font-medium'
          : 'text-gray-600 hover:bg-lime'
      }`}
    >
      {label}
    </Link>
  );

  return (
    <div className="bg-white w-64 h-full shadow-md p-6 flex flex-col">
      {/* Mobile Close Button */}
      <button
        onClick={onClose}
        className="md:hidden absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      <div className="flex items-center justify-center mb-8">
        <div className="w-12 h-12 bg-green rounded-full flex items-center justify-center">
          <span className="text-white text-lg font-bold">IMS</span>
        </div>
      </div>
      
      <nav className="flex-1 space-y-1">
        <NavItem to="/dashboard" label="Dashboard" />
        <NavItem to="/scanner" label="Barcode Scanner" />
        {user?.role === 'Admin' && (
          <>
            <NavItem to="/bulk-create" label="Bulk Barcode Create" />
            <NavItem to="/users" label="User Management" />
          </>
        )}
        <NavItem to="/barcode-management" label="Barcode Management" />
      </nav>
      
      <div className="mt-auto pt-4 border-t border-gray-200">
        <div className="text-xs text-gray-500 mb-2">Role</div>
        <div className="bg-lime rounded-md p-2">
          <div className="font-medium">{user?.role}</div>
          <div className="text-xs text-gray-600">Access Level</div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
