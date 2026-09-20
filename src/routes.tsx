import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { Loading } from '@/components/ui/states';

const Login = lazy(() => import('@/pages/Login'));
const Dashboard = lazy(() => import('@/features/dashboard/DashboardPage'));
const Products = lazy(() => import('@/features/products/ProductsPage'));
const Categories = lazy(() => import('@/features/categories/CategoriesPage'));
const Suppliers = lazy(() => import('@/features/suppliers/SuppliersPage'));
const Branches = lazy(() => import('@/features/branches/BranchesPage'));
const Inventory = lazy(() => import('@/features/inventory/InventoryPage'));
const Movements = lazy(() => import('@/features/movements/MovementsPage'));
const Adjustments = lazy(() => import('@/features/adjustments/AdjustmentsPage'));
const Purchases = lazy(() => import('@/features/purchases/PurchasesPage'));
const Sales = lazy(() => import('@/features/sales/SalesPage'));
const Reports = lazy(() => import('@/features/reports/ReportsPage'));
const Users = lazy(() => import('@/features/users/UsersPage'));
const RolesPage = lazy(() => import('@/features/roles/RolesPage'));
const Audit = lazy(() => import('@/features/audit/AuditPage'));

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <AppLayout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="/products" element={<ProtectedRoute module="products"><Products /></ProtectedRoute>} />
          <Route path="/categories" element={<ProtectedRoute module="categories"><Categories /></ProtectedRoute>} />
          <Route path="/suppliers" element={<ProtectedRoute module="suppliers"><Suppliers /></ProtectedRoute>} />
          <Route path="/branches" element={<ProtectedRoute module="branches"><Branches /></ProtectedRoute>} />
          <Route path="/inventory" element={<ProtectedRoute module="inventory"><Inventory /></ProtectedRoute>} />
          <Route path="/movements" element={<ProtectedRoute module="inventory"><Movements /></ProtectedRoute>} />
          <Route path="/adjustments" element={<ProtectedRoute module="adjustments"><Adjustments /></ProtectedRoute>} />
          <Route path="/purchases" element={<ProtectedRoute module="purchases"><Purchases /></ProtectedRoute>} />
          <Route path="/sales" element={<ProtectedRoute module="sales"><Sales /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute module="reports"><Reports /></ProtectedRoute>} />
          <Route path="/users" element={<ProtectedRoute module="users"><Users /></ProtectedRoute>} />
          <Route path="/roles" element={<ProtectedRoute module="roles"><RolesPage /></ProtectedRoute>} />
          <Route path="/audit" element={<ProtectedRoute module="audit"><Audit /></ProtectedRoute>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
