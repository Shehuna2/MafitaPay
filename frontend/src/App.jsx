import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect } from "react";
import Layout from "./layouts/Layout";
import Navbar from "./components/Navbar";
import PrivateRoute from "./components/PrivateRoute";
import AdminRoute from "./components/AdminRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import MaintenancePage from "./components/MaintenancePage";
import useMaintenanceCheck from "./hooks/useMaintenanceCheck";
import { useAuth } from "./context/AuthContext";

// Auth paths that should be accessible during maintenance mode
const AUTH_PATHS_EXEMPT_FROM_MAINTENANCE = [
  '/login',
  '/register', 
  '/verify-email',
  '/reset-password',
  '/reset-password-request'
];

// Pages
import Home from "./pages/Home";
import About from "./pages/About";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import Referral from "./pages/Referral";
import Rewards from "./pages/Rewards";
import Dashboard from "./pages/Dashboard";
import Deposit from "./pages/wallet/Deposit";
import CardDeposit from "./pages/wallet/CardDeposit";
import CardDepositCallback from "./pages/wallet/CardDepositCallback";
import WalletTransactions from "./pages/WalletTransactions";

import Login from "./pages/accounts/Login";
import Register from "./pages/accounts/Register";
import Profile from "./pages/accounts/Profile";
import AccountDeactivate from "./pages/accounts/AccountDeactivate";
import AccountDelete from "./pages/accounts/AccountDelete";
import VerifyEmail from "./pages/accounts/VerifyEmail";
import ResetPassword from "./pages/accounts/ResetPassword";
import ResetPasswordRequest from "./pages/accounts/ResetPasswordRequest";
import SecuritySettings from "./pages/SecuritySettings";

import BuyData from "./pages/bills/BuyData";
import BuyAirtime from "./pages/bills/BuyAirtime";
import BuyCableTV from "./pages/bills/BuyCableTV";
import BuyElectricity from "./pages/bills/BuyElectricity";
import BuyEducation from "./pages/bills/BuyEducation";

import Assets from "./pages/gasfee/Assets";
import BuyCrypto from "./pages/gasfee/BuyCrypto";
import SellCrypto from "./pages/gasfee/SellCrypto";
import AdminSellOrders from "./pages/gasfee/AdminSellOrders";

import DepositOffers from "./pages/p2p/DepositOffers";
import CreateOffer from "./pages/p2p/CreateOffer";
import MyOrders from "./pages/p2p/MyOrders";
import MerchantOrders from "./pages/p2p/MerchantOrders";
import OrderDetails from "./pages/p2p/OrderDetails";
import OffersHub from "./pages/p2p/OffersHub";
import WithdrawOrderDetails from "./pages/p2p/WithdrawOrderDetails";
import MerchantWithdrawOrderDetails from "./pages/p2p/MerchantWithdrawOrderDetails";

// Analytics Pages
import AnalyticsLayout from "./layouts/AnalyticsLayout";
import AnalyticsOverview from "./pages/analytics/AnalyticsOverview";
import AnalyticsDemoOverview from "./pages/analytics/AnalyticsDemoOverview";
import TransactionsDemoAnalytics from "./pages/analytics/TransactionsDemoAnalytics";
import TransactionsAnalytics from "./pages/analytics/TransactionsAnalytics";
import RevenueAnalytics from "./pages/analytics/RevenueAnalytics";
import UsersAnalytics from "./pages/analytics/UsersAnalytics";
import ServicesAnalytics from "./pages/analytics/ServicesAnalytics";
import KPIsAnalytics from "./pages/analytics/KPIsAnalytics";
import ReportsAnalytics from "./pages/analytics/ReportsAnalytics";

function App() {
  const { isAuthenticated, logout, user } = useAuth();
  const location = useLocation();
  
  // Check for maintenance mode (poll every 30 seconds)
  const { isMaintenanceMode, maintenanceData, isLoading } = useMaintenanceCheck(30000);

  useEffect(() => {
  const update = () => localStorage.setItem("last_active", Date.now().toString());

  ["click", "mousemove", "keydown", "scroll", "touchstart"].forEach((evt) =>
    window.addEventListener(evt, update)
  );

  return () => {
    ["click", "mousemove", "keydown", "scroll", "touchstart"].forEach((evt) =>
      window.removeEventListener(evt, update)
    );
  };
}, []);

  // Check if user is admin/staff
  const isAdmin = user?.is_staff || user?.is_superuser;

  // Check if current page is an auth page that should be accessible during maintenance
  const isAuthPage = AUTH_PATHS_EXEMPT_FROM_MAINTENANCE.some(path => 
    location.pathname.startsWith(path)
  ) || location.pathname === '/';

  // Show maintenance page if:
  // - Maintenance mode is active
  // - User is not admin/staff
  // - User is not on an auth page (login, register, verify-email, etc.)
  if (!isLoading && isMaintenanceMode && !isAdmin && !isAuthPage) {
    return <MaintenancePage maintenanceData={maintenanceData} />;
  }

  // Hide Navbar on auth & reset pages
  const hideNavbar =
    ["/login", "/register", "/reset-password-request"].includes(location.pathname) ||
    location.pathname.startsWith("/reset-password") ||
    location.pathname.startsWith("/verify-email");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-gray-900 to-gray-900 text-white">

      {/* Navbar only when authenticated AND current page is not an auth page */}
      {isAuthenticated && !hideNavbar && <Navbar />}

      <main className="flex-1 container mx-auto px-4 pt-20 pb-6">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />
            <Route path="/reset-password-request" element={<ResetPasswordRequest />} />

            {/* Private Routes */}
            <Route
              path="/accounts/profile"
              element={
                <PrivateRoute>
                  <Layout>
                    <Profile />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/accounts/deactivate"
              element={
                <PrivateRoute>
                  <Layout>
                    <AccountDeactivate />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/accounts/delete"
              element={
                <PrivateRoute>
                  <Layout>
                    <AccountDelete />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/security-settings"
              element={
                <PrivateRoute>
                  <Layout>
                    <SecuritySettings />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/dashboard"
              element={
                <PrivateRoute>
                  <Layout>
                    <Dashboard />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/buy-airtime"
              element={
                <PrivateRoute>
                  <Layout>
                    <BuyAirtime />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/buy-data"
              element={
                <PrivateRoute>
                  <Layout>
                    <BuyData />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/buy-cable-tv"
              element={
                <PrivateRoute>
                  <Layout>
                    <BuyCableTV />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/buy-electricity"
              element={
                <PrivateRoute>
                  <Layout>
                    <BuyElectricity />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/buy-education"
              element={
                <PrivateRoute>
                  <Layout>
                    <BuyEducation />
                  </Layout>
                </PrivateRoute>
              }
            />

            {/* Wallet */}
            <Route
              path="/deposit"
              element={
                <PrivateRoute>
                  <Layout>
                    <Deposit />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/card-deposit"
              element={
                <PrivateRoute>
                  <Layout>
                    <CardDeposit />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/card-deposit-callback"
              element={
                <PrivateRoute>
                  <Layout>
                    <CardDepositCallback />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/wallet/card-deposit/callback"
              element={
                <PrivateRoute>
                  <Layout>
                    <CardDepositCallback />
                  </Layout>
                </PrivateRoute>
              }
            />

            <Route
              path="/wallet-transactions"
              element={
                <PrivateRoute>
                  <Layout>
                    <WalletTransactions />
                  </Layout>
                </PrivateRoute>
              }
            />

            {/* P2P */}
            <Route
              path="/p2p"
              element={
                <PrivateRoute>
                  <Layout />
                </PrivateRoute>
              }
            >
              <Route index element={<DepositOffers />} />
              <Route path="create-offer" element={<CreateOffer />} />
              <Route path="merchant-orders" element={<MerchantOrders />} />
              <Route path="order/:orderId" element={<OrderDetails />} />
              <Route path="marketplace" element={<OffersHub />} />
              <Route path="my-orders" element={<MyOrders />} />
              <Route path="withdraw-orders/:orderId" element={<WithdrawOrderDetails />} />
              <Route
                path="merchant-withdraw-orders/:orderId"
                element={<MerchantWithdrawOrderDetails />}
              />
            </Route>

            {/* Others */}
            <Route
              path="/assets"
              element={
                <Layout>
                  <Assets />
                </Layout>
              }
            />

            <Route
              path="/sell-crypto"
              element={
                <Layout>
                  <SellCrypto />
                </Layout>
              }
            />

            <Route
              path="/referral"
              element={
                <Layout>
                  <Referral />
                </Layout>
              }
            />

            <Route
              path="/rewards"
              element={
                <Layout>
                  <Rewards />
                </Layout>
              }
            />

            <Route
              path="/admin/sell-orders"
              element={
                <Layout>
                  <AdminSellOrders />
                </Layout>
              }
            />

            <Route
              path="/buy-crypto/:id"
              element={
                <PrivateRoute>
                  <Layout>
                    <BuyCrypto />
                  </Layout>
                </PrivateRoute>
              }
            />

            {/* Analytics Routes - Admin/CEO Only */}
            <Route
              path="/analytics"
              element={
                <PrivateRoute>
                  <AdminRoute>
                    <AnalyticsLayout />
                  </AdminRoute>
                </PrivateRoute>
              }
            >
              <Route path="overview" element={<AnalyticsOverview />} />
              <Route path="transactions" element={<TransactionsAnalytics />} />
              <Route path="revenue" element={<RevenueAnalytics />} />
              <Route path="users" element={<UsersAnalytics />} />
              <Route path="services" element={<ServicesAnalytics />} />
              <Route path="kpis" element={<KPIsAnalytics />} />
              <Route path="reports" element={<ReportsAnalytics />} />
            </Route>

            {/* Analytics Demo Route - No auth required for showcase */}
            <Route path="/analytics-demo" element={<AnalyticsLayout />}>
              <Route path="overview" element={<AnalyticsDemoOverview />} />
              <Route path="transactions" element={<TransactionsDemoAnalytics />} />
            </Route>
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
