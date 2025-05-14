
import React from 'react';
import Navbar from './Navbar';
import Sidebar from './Sidebar';

type LayoutProps = {
  children: React.ReactNode;
};

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="flex min-h-screen bg-cream">
      <Sidebar />
      <div className="flex flex-col flex-1">
        <Navbar />
        <main className="flex-1 p-6">
          {children}
        </main>
        <footer className="p-4 text-center text-sm text-gray-500">
          &copy; {new Date().getFullYear()} Inventory Management System
        </footer>
      </div>
    </div>
  );
};

export default Layout;
