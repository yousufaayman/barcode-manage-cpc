
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";

// Pages
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import BarcodeScannerPage from "./pages/BarcodeScannerPage";
import BulkBarcodeCreatePage from "./pages/BulkBarcodeCreatePage";
import BarcodeManagementPage from "./pages/BarcodeManagementPage";
import UserManagementPage from "./pages/UserManagementPage";
import UnauthorizedPage from "./pages/UnauthorizedPage";
import NotFound from "./pages/NotFound";

// Components
import PrivateRoute from "./components/PrivateRoute";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
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
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
