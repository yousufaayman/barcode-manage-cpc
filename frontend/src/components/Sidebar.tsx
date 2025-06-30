import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  QrCode, 
  Package, 
  Users, 
  BarChart3, 
  Archive, 
  LogOut, 
  X,
  User,
  Settings,
  FileText
} from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';

interface SidebarProps {
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useTranslation();

  const isActive = (path: string) => {
    return location.pathname === path;
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const NavItem = ({ to, label, icon: Icon }: { to: string; label: string; icon: any }) => (
    <Link
      to={to}
      onClick={onClose}
      className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group ${
        isActive(to)
          ? 'bg-green text-white shadow-md transform scale-105'
          : 'text-gray-600 hover:bg-lime hover:text-gray-800 hover:shadow-sm'
      }`}
    >
      <Icon 
        size={20} 
        className={`transition-colors duration-200 ${
          isActive(to) ? 'text-white' : 'text-gray-500 group-hover:text-gray-700'
        }`}
      />
      <span className="font-medium">{label}</span>
    </Link>
  );

  return (
    <div className="bg-white w-64 h-full shadow-lg border-r border-gray-200 flex flex-col">
      {/* Mobile Close Button */}
      <button
        onClick={onClose}
        className="md:hidden absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <X size={20} />
      </button>

      {/* Logo Section */}
      <div className="flex items-center justify-center p-6 border-b border-gray-200">
        <img src="/company-logo.png" alt="Company Logo" className="w-12 h-12 rounded-full shadow-md" />
        <div className="ml-3">
          <h1 className="text-lg font-bold text-gray-800">{t('company.tagline')}</h1>
          <p className="text-xs text-gray-500">{t('company.name')}</p>
        </div>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">
            {t('navigation.mainNavigation')}
          </h3>
          <div className="space-y-1">
            <NavItem to="/dashboard" label={t('navigation.dashboard')} icon={LayoutDashboard} />
            <NavItem to="/scanner" label={t('navigation.barcodeScanner')} icon={QrCode} />
            <NavItem to="/barcode-management" label={t('navigation.barcodeManagement')} icon={Package} />
            <NavItem to="/job-orders" label={t('navigation.jobOrders')} icon={FileText} />
            {(user?.role === 'Admin' || user?.role === 'Creator') && (
              <NavItem to="/bulk-create" label={t('navigation.barcodeCreate')} icon={Package} />
            )}
          </div>
        </div>

        {/* Admin Section */}
        {user?.role === 'Admin' && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2">
              {t('navigation.administration')}
            </h3>
            <div className="space-y-1">
              <NavItem to="/archived-batches" label={t('navigation.archivedBatches')} icon={Archive} />
              <NavItem to="/advanced-statistics" label={t('navigation.advancedStatistics')} icon={BarChart3} />
              <NavItem to="/users" label={t('navigation.userManagement')} icon={Users} />
            </div>
          </div>
        )}

        {/* Language Switcher */}
        <div className="mb-4">
          <LanguageSwitcher />
        </div>
      </nav>
      
      {/* User Section */}
      <div className="p-4 border-t border-gray-200 bg-gray-50">
        {user && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="w-8 h-8 bg-gradient-to-br from-green to-mint rounded-full flex items-center justify-center">
                <User size={16} className="text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 truncate">{user.username}</div>
                <div className="text-xs text-gray-500 capitalize">{user.role}</div>
              </div>
            </div>
            
            <button 
              onClick={handleLogout} 
              className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200 group"
            >
              <LogOut size={18} className="text-gray-500 group-hover:text-red-500 transition-colors" />
              <span className="font-medium">{t('auth.signOut')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
