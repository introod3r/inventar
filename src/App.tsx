import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import Home from '@/pages/Home';
import Scanner from '@/pages/Scanner';
import Inventory from '@/pages/Inventory';
import AssetDetails from '@/pages/AssetDetails';
import AssetEdit from '@/pages/AssetEdit';
import AssetNew from '@/pages/AssetNew';

import Events from '@/pages/Events';
import EventDetails from '@/pages/EventDetails';
import EventNew from '@/pages/EventNew';

import Locations from '@/pages/Locations';
import Service from '@/pages/Service';
import Checkouts from '@/pages/Checkouts';
import Login from '@/pages/Login';

import Calendar from '@/pages/Calendar';
import Clients from '@/pages/Clients';
import Reports from '@/pages/Reports';
import Inventories from '@/pages/Inventories';
import InventoryDetails from '@/pages/InventoryDetails';

import SettingsApiKeys from '@/pages/SettingsApiKeys';
import SettingsAuditLog from '@/pages/SettingsAuditLog';
import SettingsBackup from '@/pages/SettingsBackup';
import SettingsCategories from '@/pages/SettingsCategories';
import SettingsUsers from '@/pages/SettingsUsers';
import SettingsRolePermissions from '@/pages/SettingsRolePermissions';

import { ThemeProvider } from '@/features/theme/use-theme';
import { AuthProvider } from '@/features/auth/use-auth';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PWAInstallPrompt } from '@/components/common/PWAInstallPrompt';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';

const LayoutWrapper = () => (
  <AppShell>
    <Outlet />
    <PWAInstallPrompt />
  </AppShell>
);

const queryClient = new QueryClient();

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <TooltipProvider delayDuration={150}>
            <BrowserRouter>
              <Routes>
                <Route path="/login" element={<Login />} />
                <Route element={<ProtectedRoute />}>
                  <Route path="/" element={<LayoutWrapper />}>
                    <Route index element={<Home />} />
                    <Route path="dashboard" element={<Home />} />
                    <Route path="scan" element={<Scanner />} />
                    
                    <Route path="assets" element={<Inventory />} />
                    <Route path="assets/new" element={<AssetNew />} />
                    <Route path="assets/:assetId" element={<AssetDetails />} />
                    <Route path="assets/:assetId/edit" element={<AssetEdit />} />
                    
                    <Route path="checkouts" element={<Checkouts />} />
                    
                    <Route path="events" element={<Events />} />
                    <Route path="events/new" element={<EventNew />} />
                    <Route path="events/:eventId" element={<EventDetails />} />
                    
                    <Route path="locations" element={<Locations />} />
                    <Route path="service" element={<Service />} />
                    
                    <Route path="calendar" element={<Calendar />} />
                    <Route path="clients" element={<Clients />} />
                    <Route path="reports" element={<Reports />} />
                    
                    <Route path="inventories" element={<Inventories />} />
                    <Route path="inventories/:inventoryId" element={<InventoryDetails />} />
                    
                    <Route path="settings/api-keys" element={<SettingsApiKeys />} />
                    <Route path="settings/audit-log" element={<SettingsAuditLog />} />
                    <Route path="settings/backup" element={<SettingsBackup />} />
                    <Route path="settings/categories" element={<SettingsCategories />} />
                    <Route path="settings/users" element={<SettingsUsers />} />
                    <Route path="settings/role-permissions" element={<SettingsRolePermissions />} />
                    <Route path="settings" element={<Navigate to="/settings/categories" replace />} />
                    
                    <Route path="*" element={<Navigate to="/dashboard" replace />} />
                  </Route>
                </Route>
              </Routes>
              <Toaster richColors position="top-right" />
            </BrowserRouter>
          </TooltipProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </ErrorBoundary>
  );
}

export default App;
