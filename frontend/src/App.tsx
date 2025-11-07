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
const JobOrdersPage = lazy(() => import('./pages/JobOrdersPage'));
const AddJobOrderPage = lazy(() => import('./pages/AddJobOrderPage'));
const ArchivedBatchesPage = lazy(() => import('./pages/ArchivedBatchesPage'));
const UnauthorizedPage = lazy(() => import('./pages/UnauthorizedPage'));
const NotFound = lazy(() => import('./pages/NotFound'));
const AdvancedStatisticsPage = lazy(() => import('./pages/AdvancedStatisticsPage'));
const JobOrderDetailsPage = lazy(() => import('./pages/JobOrderDetailsPage'));
const BarcodeDetailsPage = lazy(() => import('./pages/BarcodeDetailsPage'));

const queryClient = new QueryClient();

const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/" />;
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
            <Route path="/job-orders/:jobOrderId" element={<JobOrderDetailsPage />} />
            <Route path="/barcode-details/:batchId" element={<BarcodeDetailsPage />} />
          </Route>
          
          {/* Admin, Creator, and Cutting Only Routes */}
          <Route element={<PrivateRoute allowedRoles={['admin', 'creator', 'cutting']} />}>
            <Route path="/bulk-create" element={<BulkBarcodeCreatePage />} />
          </Route>
          
          {/* Admin and Creator Only Routes */}
          <Route element={<PrivateRoute allowedRoles={['admin', 'creator']} />}>
            <Route path="/job-orders" element={<JobOrdersPage />} />
            <Route path="/add-job-order" element={<AddJobOrderPage />} />
            <Route path="/advanced-statistics" element={<AdvancedStatisticsPage />} />
          </Route>
          
          {/* Admin Only Routes */}
          <Route element={<PrivateRoute allowedRoles={['admin']} />}>
            <Route path="/archive" element={<ArchivedBatchesPage />} />
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
