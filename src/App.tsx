import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';

import { ThemeProvider } from '@/features/theme/use-theme';
import { AuthProvider } from '@/features/auth/use-auth';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { TooltipProvider } from '@/components/ui/tooltip';
import { PWAInstallPrompt } from '@/components/common/PWAInstallPrompt';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { PageLoader } from '@/components/common/PageLoader';

// Lazy load page components for route-based code splitting
const Home = lazy(() => import('@/pages/Home'));
const Scanner = lazy(() => import('@/pages/Scanner'));
const Inventory = lazy(() => import('@/pages/Inventory'));
const AssetDetails = lazy(() => import('@/pages/AssetDetails'));
const AssetEdit = lazy(() => import('@/pages/AssetEdit'));
const AssetNew = lazy(() => import('@/pages/AssetNew'));

const Events = lazy(() => import('@/pages/Events'));
const EventDetails = lazy(() => import('@/pages/EventDetails'));
const EventNew = lazy(() => import('@/pages/EventNew'));

const Locations = lazy(() => import('@/pages/Locations'));
const Service = lazy(() => import('@/pages/Service'));
const Checkouts = lazy(() => import('@/pages/Checkouts'));
const Login = lazy(() => import('@/pages/Login'));

const Calendar = lazy(() => import('@/pages/Calendar'));
const Clients = lazy(() => import('@/pages/Clients'));
const Reports = lazy(() => import('@/pages/Reports'));
const Inventories = lazy(() => import('@/pages/Inventories'));
const InventoryDetails = lazy(() => import('@/pages/InventoryDetails'));

const SettingsApiKeys = lazy(() => import('@/pages/SettingsApiKeys'));
const SettingsAuditLog = lazy(() => import('@/pages/SettingsAuditLog'));
const SettingsBackup = lazy(() => import('@/pages/SettingsBackup'));
const SettingsCategories = lazy(() => import('@/pages/SettingsCategories'));
const SettingsUsers = lazy(() => import('@/pages/SettingsUsers'));
const SettingsRolePermissions = lazy(() => import('@/pages/SettingsRolePermissions'));
const SettingsCompany = lazy(() => import('@/pages/SettingsCompany'));

const LayoutWrapper = () => (
  <AppShell>
    <Suspense fallback={<PageLoader />}>
      <Outlet />
    </Suspense>
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
                <Route
                  path="/login"
                  element={
                    <Suspense fallback={<PageLoader />}>
                      <Login />
                    </Suspense>
                  }
                />
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
                    
                    <Route path="settings/company" element={<SettingsCompany />} />
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

