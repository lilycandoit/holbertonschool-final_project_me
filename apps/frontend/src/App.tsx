import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from "react-router-dom";
import "./App.css";
import { useAuth } from "./contexts/AuthContext";
import { useAuth0 } from "@auth0/auth0-react";
import Header from "./components/Header";
import Footer from "./components/Footer";
import LandingPage from "./pages/LandingPage";
import ProductsPage from "./pages/ProductsPage";
import ProductDetail from "./pages/ProductDetail";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import UserProfile from "./pages/UserProfile";
import OrderHistory from "./pages/OrderHistory";
import CartPage from "./pages/CartPage";
import CheckoutPage from "./pages/Checkout";
import OrderConfirmationPage from "./pages/OrderConfirmationPage";
import OrderTracking from "./pages/OrderTracking";
import { logger } from "./utils/logger";


function App() {
  const [loading, setLoading] = useState(true);
  const [useAPI, setUseAPI] = useState(false);
  const { user, getAccessToken } = useAuth();

  useEffect(() => {
    // Check if API is available
    checkAPIStatus();
  }, []);

  useEffect(() => {
    if (user) {
      getAccessToken().then((token) => {
        if (token) {
          logger.log("Auth0 token received");
        } else {
          logger.log("No Auth0 token found");
        }
      });
    }
  }, [user, getAccessToken]);

  const checkAPIStatus = async () => {
    try {
      setLoading(true);
      const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3001/api";
      logger.log("🔍 Checking API status:", `${apiUrl}/health`);

      const response = await fetch(`${apiUrl}/health`);

      if (response.ok) {
        logger.log("✅ API is available");
        setUseAPI(true);
      } else {
        logger.log("ℹ️ API not responding properly");
        setUseAPI(false);
      }
    } catch (err) {
      logger.log("ℹ️ API not available:", err);
      setUseAPI(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="app">
        <div className="loading">🌸 Loading Flora marketplace...</div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <AppContent useAPI={useAPI} />
    </BrowserRouter>
  );
}

function AppContent({ useAPI }: any) {
  const navigate = useNavigate();
  const location = useLocation();
  const { isLoading: auth0Loading, isAuthenticated } = useAuth0();

  // Check if we're on the order confirmation, checkout, or tracking page
  const hideHeaderFooter =
    location.pathname.startsWith("/order-confirmation") ||
    location.pathname.startsWith("/checkout") ||
    location.pathname.startsWith("/tracking");

  useEffect(() => {
    // Handle Auth0 redirect callback - wait until Auth0 finishes processing
    if (!auth0Loading && isAuthenticated) {
      const returnTo = sessionStorage.getItem("auth_return_to");

      if (returnTo) {
        logger.log("📍 Navigating to saved location:", returnTo);
        sessionStorage.removeItem("auth_return_to");

        // Small delay to ensure Auth0 has fully processed
        setTimeout(() => {
          navigate(returnTo, { replace: true });
        }, 100);
      }
    }
  }, [auth0Loading, isAuthenticated, navigate]);

  return (
    <div className="app">
      {/* Hide header on order confirmation and checkout pages */}
      {!hideHeaderFooter && <Header />}

      {!useAPI && <div className="demo-badge">🚧 Demo Mode - API Not Available</div>}
      <main className="main">
        {/* Define app routes. AuthCallback is not needed with Auth0 React SDK */}
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/products/:id" element={<ProductDetail />} />
          <Route path="/subscriptions" element={<SubscriptionsPage />} />
          <Route path="/profile" element={<UserProfile />} />
          <Route path="/orders" element={<OrderHistory />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/checkout" element={<CheckoutPage />} />
          <Route path="/order-confirmation/:orderId" element={<OrderConfirmationPage />} />
          <Route path="/tracking/:orderId" element={<OrderTracking />} />
        </Routes>
      </main>

      {/* Hide footer on order confirmation and checkout pages */}
      {!hideHeaderFooter && <Footer />}
    </div>
  );
}
export default App;
