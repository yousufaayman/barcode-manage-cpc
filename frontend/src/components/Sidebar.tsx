import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import { 
  LayoutDashboard, 
  QrCode, 
  Package, 
  Users, 
  Archive, 
  LogOut, 
  X,
  User,
  FileText,
  Scissors,
  LayoutGrid,
  Activity,
  ChevronLeft,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import LanguageSwitcher from './LanguageSwitcher';

interface SidebarProps {
  onClose?: () => void;
}

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const [isCollapsed, setIsCollapsed] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(isCollapsed));
  }, [isCollapsed]);

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
      className={`flex items-center ${isCollapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-lg transition-all duration-200 group ${
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
      <span className={`${isCollapsed ? 'hidden' : 'font-medium'}`}>{label}</span>
    </Link>
  );

  return (
    <div
      className={`bg-white ${isCollapsed ? 'w-20' : 'w-64'} h-full md:h-full max-h-[100dvh] shadow-lg border-r border-gray-200 flex flex-col transition-all duration-300 relative`}
    >
      <button
        onClick={onClose}
        className="md:hidden absolute top-4 right-4 p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      >
        <X size={20} />
      </button>

      <button
        onClick={() => setIsCollapsed((prev) => !prev)}
        className="hidden md:flex items-center justify-center absolute top-4 -right-3 w-6 h-6 rounded-full bg-white border border-gray-200 shadow-sm"
      >
        {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
      </button>

      <div className={`flex items-center p-6 border-b border-gray-200 ${isCollapsed ? 'justify-center' : ''}`}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full shadow-md bg-white flex items-center justify-center flex-shrink-0">
            <img
              src="/company-logo.png"
              alt="Company Logo"
              className="w-10 h-10 object-contain"
            />
          </div>
          <div className={`${isCollapsed ? 'hidden' : ''}`}>
            <h1 className="text-lg font-bold text-gray-800">{t('company.tagline')}</h1>
            <p className="text-xs text-gray-500">{t('company.name')}</p>
          </div>
        </div>
      </div>
      
      <nav
        className={`flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-2 ${isCollapsed ? 'px-2' : ''}`}
      >
        <div className="mb-4">
          <h3 className={`text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2 ${isCollapsed ? 'hidden' : ''}`}>
            {t('navigation.mainNavigation')}
          </h3>
          <div className="space-y-1">
            <NavItem to="/dashboard" label={t('navigation.dashboard')} icon={LayoutDashboard} />
            <NavItem to="/scanner" label={t('navigation.barcodeScanner')} icon={QrCode} />
            <NavItem to="/barcode-management" label={t('navigation.barcodeManagement')} icon={Package} />
            <NavItem to="/cutting" label={t('navigation.cutting')} icon={Scissors} />
            {(user?.role === 'admin' || user?.role === 'general_operations') && (
              <NavItem to="/job-orders" label={t('navigation.jobOrders')} icon={FileText} />
            )}
            {(user?.role === 'admin' || user?.role === 'general_operations' || user?.role === 'cutting') && (
              <NavItem to="/bulk-create" label={t('navigation.barcodeCreate')} icon={Package} />
            )}
            {(user?.role === 'admin' || user?.role === 'general_operations' || user?.role === 'sewing') && (
              <NavItem to="/production/tracking" label={t('navigation.productionTracking')} icon={Activity} />
            )}
          </div>
        </div>

        {user?.role === 'admin' && (
          <div className="mb-4">
            <h3 className={`text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2 ${isCollapsed ? 'hidden' : ''}`}>
              {t('navigation.administration')}
            </h3>
            <div className="space-y-1">
              <NavItem to="/archive" label={t('navigation.archivedBatches')} icon={Archive} />
              <NavItem to="/production" label={t('navigation.productionManagement')} icon={LayoutGrid} />
              <NavItem to="/advanced-statistics" label={t('navigation.advancedStatistics')} icon={BarChart3} />
              <NavItem to="/users" label={t('navigation.userManagement')} icon={Users} />
            </div>
          </div>
        )}

        {(user?.role === 'general_operations' || user?.role === 'sewing') && (
          <div className="mb-4">
            <h3 className={`text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-2 ${isCollapsed ? 'hidden' : ''}`}>
              {t('navigation.additional')}
            </h3>
            <div className="space-y-1">
              {(user?.role === 'general_operations') && (
                <>
                  <NavItem to="/production" label={t('navigation.productionManagement')} icon={LayoutGrid} />
                  <NavItem to="/advanced-statistics" label={t('navigation.advancedStatistics')} icon={BarChart3} />
                </>
              )}
              {user?.role === 'sewing' && (
                <NavItem to="/production" label={t('navigation.productionManagement')} icon={LayoutGrid} />
              )}
            </div>
          </div>
        )}

        {!isCollapsed && (
          <div className="mb-4">
            <LanguageSwitcher />
          </div>
        )}
      </nav>
      
      {!isCollapsed && (
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
      )}
    </div>
  );
};

export default Sidebar;
