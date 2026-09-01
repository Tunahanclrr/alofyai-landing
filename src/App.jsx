import { Navigate, Route, Routes } from 'react-router-dom'
import LandingPage from './marketing/LandingPage'
import LoginPage from './auth/LoginPage'
import RegisterPage from './auth/RegisterPage'
import AppLayout from './layouts/AppLayout'
import AdminLayout from './layouts/AdminLayout'
import DashboardPage from './app/DashboardPage'
import ServicesPage from './app/ServicesPage'
import StaffPage from './app/StaffPage'
import CustomersPage from './app/CustomersPage'
import CustomerDetailPage from './app/CustomerDetailPage'
import RestaurantTablesPage from './app/RestaurantTablesPage'
import RestaurantReservationsPage from './app/RestaurantReservationsPage'
import RestaurantMenuPage from './app/RestaurantMenuPage'
import CalendarPage from './app/CalendarPage'
import BusinessCallsPage from './app/CallsPage'
import BusinessSettingsPage from './app/BusinessSettingsPage'
import NotificationsPage from './app/NotificationsPage'
import AdminDashboardPage from './admin/AdminDashboardPage'
import BusinessesListPage from './admin/BusinessesListPage'
import BusinessDetailPage from './admin/BusinessDetailPage'
import UsersPage from './admin/UsersPage'
import AuditLogsPage from './admin/AuditLogsPage'
import AgentsPage from './admin/AgentsPage'
import PhoneNumbersPage from './admin/PhoneNumbersPage'
import CallsPage from './admin/CallsPage'
import ComingSoonPage from './components/ComingSoonPage'
import RequireAuth from './routes/RequireAuth'
import RequireSuperAdmin from './routes/RequireSuperAdmin'
import NotFoundPage from './routes/NotFoundPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />

      <Route element={<RequireAuth />}>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="appointments" element={<CalendarPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="customers/:id" element={<CustomerDetailPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="packages" element={<ComingSoonPage title="Paketler" phase="Faz 5" />} />
          <Route path="payments" element={<ComingSoonPage title="Ödemeler" phase="Faz 5" />} />
          <Route path="calls" element={<BusinessCallsPage />} />
          <Route path="notifications" element={<NotificationsPage />} />
          <Route path="reports" element={<ComingSoonPage title="Raporlar" phase="Faz 5" />} />
          <Route path="settings/business" element={<BusinessSettingsPage />} />
          <Route path="restaurant/reservations" element={<RestaurantReservationsPage />} />
          <Route path="restaurant/tables" element={<RestaurantTablesPage />} />
          <Route path="restaurant/menu" element={<RestaurantMenuPage />} />
        </Route>

        <Route element={<RequireSuperAdmin />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<AdminDashboardPage />} />
            <Route path="businesses" element={<BusinessesListPage />} />
            <Route path="businesses/:id" element={<BusinessDetailPage />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="agents" element={<AgentsPage />} />
            <Route path="phone-numbers" element={<PhoneNumbersPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="usage" element={<ComingSoonPage title="AI Kullanımı" phase="Faz 4" />} />
            <Route path="subscriptions" element={<ComingSoonPage title="Abonelikler" phase="Faz 7" />} />
            <Route path="payments" element={<ComingSoonPage title="Ödemeler" phase="Faz 7" />} />
            <Route path="logs" element={<AuditLogsPage />} />
            <Route path="settings" element={<ComingSoonPage title="Ayarlar" phase="Faz 8" />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default App
