import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import LoginPage from './pages/LoginPage';
import UserManagementPage from './pages/UserManagementPage';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PrivateRoute from "./components/PrivateRoute";
import DashboardPage from "./pages/DashboardPage";
import BarcodeScannerPage from "./pages/BarcodeScannerPage";
import BulkBarcodeCreatePage from "./pages/BulkBarcodeCreatePage";
import BarcodeManagementPage from "./pages/BarcodeManagementPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import NotFound from "./pages/NotFound";
import { AuthProvider } from "./contexts/AuthContext";

const queryClient = new QueryClient();

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  return user?.role === 'Admin' ? <>{children}</> : <Navigate to="/" />;
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <Router>
            <Routes>
              {/* Public Routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/unauthorized" element={<UnauthorizedPage />} />
              
              {/* Protected Routes - All Users */}
              <Route element={<PrivateRoute />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/scanner" element={<BarcodeScannerPage />} />
                <Route path="/barcode-management" element={<BarcodeManagementPage />} />
              </Route>
              
              {/* Admin Only Routes */}
              <Route element={<PrivateRoute allowedRoles={['Admin']} />}>
                <Route path="/bulk-create" element={<BulkBarcodeCreatePage />} />
                <Route path="/users" element={<UserManagementPage />} />
              </Route>
              
              {/* 404 Route */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Router>
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
