
import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { user } = useAuth();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const NavItem = ({ to, label }: { to: string; label: string }) => (
    <Link
      to={to}
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
    <div className="bg-white w-64 shadow-md p-6 flex flex-col">
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
