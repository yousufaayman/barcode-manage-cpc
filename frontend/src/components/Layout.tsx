import React, { useState } from 'react';
import Sidebar from './Sidebar';
import { cn } from '../lib/utils';
import { Menu } from 'lucide-react';

type LayoutProps = {
  children: React.ReactNode;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-cream">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <Sidebar onClose={() => setIsSidebarOpen(false)} />
      </div>

      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Mobile Header */}
        <div className="md:hidden bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <img src="/company-logo.png" alt="Company Logo" className="w-8 h-8 rounded-full" />
            <span className="font-semibold text-gray-800">Barcode Management System</span>
          </div>
        </div>

        <main className="flex-1 p-4 md:p-6 overflow-y-auto">
          {children}
        </main>
        
        <footer className="bg-white border-t border-gray-200 p-4 text-center text-sm text-gray-500">
          <div className="flex items-center justify-center gap-2">
            <span>&copy; {new Date().getFullYear()} Cotton Plus Clothing</span>
            <span className="hidden md:inline">•</span>
            <span className="hidden md:inline">Barcode Management System</span>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;
