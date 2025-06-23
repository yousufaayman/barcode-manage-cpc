import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { useLanguageDirection } from './hooks/useLanguageDirection';
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PrivateRoute from "./components/PrivateRoute";
import LoadingSpinner from "./components/LoadingSpinner";
import { AuthProvider } from "./contexts/AuthContext";

// Lazy load components
const LoginPage = lazy(() => import('./pages/LoginPage'));
const UserManagementPage = lazy(() => import('./pages/UserManagementPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const BarcodeScannerPage = lazy(() => import('./pages/BarcodeScannerPage'));
const BulkBarcodeCreatePage = lazy(() => import('./pages/BulkBarcodeCreatePage'));
const BarcodeManagementPage = lazy(() => import('./pages/BarcodeManagementPage'));
const ArchivedBatchesPage = lazy(() => import('./pages/ArchivedBatchesPage'));
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdvancedStatisticsPage = lazy(() => import('./pages/AdvancedStatisticsPage'));

const queryClient = new QueryClient();

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  return user?.role === 'Admin' ? <>{children}</> : <Navigate to="/" />;
};

const AppContent: React.FC = () => {
  // Initialize language direction
  useLanguageDirection();

  return (
    <Router>
      <Suspense fallback={<LoadingSpinner />}>
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
            <Route path="/bulk-create" element={<BulkBarcodeCreatePage />} />
          </Route>
          
          {/* Admin Only Routes */}
          <Route element={<PrivateRoute allowedRoles={['Admin']} />}>
            <Route path="/archived-batches" element={<ArchivedBatchesPage />} />
            <Route path="/advanced-statistics" element={<AdvancedStatisticsPage />} />
            <Route path="/users" element={<UserManagementPage />} />
          </Route>
          
          {/* 404 Route */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <AppContent />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
