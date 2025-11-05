import { Routes, Route, useLocation } from "react-router-dom";
import Layout from "./layouts/Layout";
import Navbar from "./components/Navbar";
import PrivateRoute from "./components/PrivateRoute";
import ErrorBoundary from "./components/ErrorBoundary";
import { useAuth } from "./context/AuthContext";

// Pages
import Home from "./pages/Home";
import About from "./pages/About";
import Referral from "./pages/Referral";
import Dashboard from "./pages/Dashboard";
import Deposit from "./pages/wallet/Deposit";
import WalletTransactions from "./pages/WalletTransactions";

import Login from "./pages/accounts/Login";
import Register from "./pages/accounts/Register";
import Profile from "./pages/accounts/Profile";
import VerifyEmail from "./pages/accounts/VerifyEmail";
import ResetPassword from "./pages/accounts/ResetPassword";
import ResetPasswordRequest from "./pages/accounts/ResetPasswordRequest";

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

function App() {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  // Hide Navbar on login/register/reset-password pages
  const hideNavbar =
    ["/login", "/register", "/reset-password-request"].includes(location.pathname) ||
    location.pathname.startsWith("/reset-password");

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-gray-900 to-gray-900 text-white">
      {!hideNavbar && isAuthenticated && <Navbar />}

      <main className="flex-1 container mx-auto px-4 pt-20 pb-6">
        <ErrorBoundary>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />

            {/* Auth */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/verify-email/:token" element={<VerifyEmail />} />
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
          </Routes>
        </ErrorBoundary>
      </main>
    </div>
  );
}

export default App;
