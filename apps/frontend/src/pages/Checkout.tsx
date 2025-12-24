import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CheckoutForm from '../components/CheckoutForm';
import OrderSummary from '../components/OrderSummary';
import { useCart, groupItemsByDeliveryDate } from '../contexts/CartContext';
import { useAuth } from '../contexts/AuthContext';
import { useCheckout } from '../hooks/useCheckout';
import deliveryService, { type DeliveryInfo } from '../services/deliveryService';
import type { CheckoutFormData } from '../components/CheckoutForm';
import { logger } from '../utils/logger';
import '../styles/CheckoutPage.css';

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { state, clearCart } = useCart();
  const { login } = useAuth();
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);
  const [selectedDeliveryType, setSelectedDeliveryType] = useState<'STANDARD' | 'EXPRESS' | 'PICKUP'>('STANDARD');
  const {
    clientSecret,
    orderId,
    isProcessing,
    error,
    hasSubscriptions, // NEW
    createOrderAndPaymentIntent,
    handlePaymentSuccess: handleCheckoutPaymentSuccess, // NEW: Rename to avoid conflict
  } = useCheckout();

  // Fetch delivery info on component mount
  useEffect(() => {
    const fetchDeliveryInfo = async () => {
      try {
        const info = await deliveryService.getDeliveryInfo();
        setDeliveryInfo(info);
      } catch (error) {
        logger.error('Failed to fetch delivery info:', error);
      }
    };

    fetchDeliveryInfo();
  }, []);

  const handleFormSubmit = async (formData: CheckoutFormData) => {
    await createOrderAndPaymentIntent(
      { ...formData, deliveryType: selectedDeliveryType },
      state.items
    );
  };

  const handlePaymentSuccess = async (paymentMethodId?: string) => {
    // NEW: Call checkout's payment success handler first (saves payment method)
    await handleCheckoutPaymentSuccess(paymentMethodId);

    // Then handle navigation (if not already redirected)
    if (orderId) {
      clearCart();
      // Note: PaymentForm.tsx now handles the redirect after payment method is saved
    }
  };

  const handlePaymentError = (error: string) => {
    logger.error('Payment error:', error);
  };

  if (state.items.length === 0) {
    return (
      <div className="checkout-page">
        <div className="empty-cart">
          <h2>Your cart is empty</h2>
          <button onClick={() => navigate('/products')} className="continue-shopping-btn">
            Continue Shopping
          </button>
        </div>
      </div>
    );
  }

  // Calculate shipping breakdown by delivery date
  const getShippingBreakdown = () => {
    if (selectedDeliveryType === 'PICKUP') {
      return [{ date: null, itemCount: state.items.length, shippingCost: 0 }];
    }

    // Group items by delivery date
    const deliveryGroups = groupItemsByDeliveryDate(state.items);

    // Calculate shipping cost per group
    const breakdown = deliveryGroups.map(group => {
      const itemCount = group.items.reduce((sum, item) => sum + item.quantity, 0);

      // Get shipping cost for this delivery type
      let shippingCost = 500; // Fallback to $5 if not loaded yet
      if (deliveryInfo) {
        const deliveryKey = selectedDeliveryType.toLowerCase() as 'standard' | 'express';
        shippingCost = deliveryInfo.pricing[deliveryKey].fee;
      }

      return {
        date: group.date,
        itemCount,
        shippingCost,
      };
    });

    return breakdown;
  };

  const shippingBreakdown = getShippingBreakdown();
  const SHIPPING_COST = shippingBreakdown.reduce((sum, group) => sum + group.shippingCost, 0);

  // Create user-friendly error message
  const getErrorDisplay = () => {
    if (!error) return null;

    if (error === 'SUBSCRIPTION_AUTH_REQUIRED') {
      return (
        <div className="auth-required-message">
          <div className="auth-message-content">
            <h3>🔐 Login Required</h3>
            <p>You have subscription items in your cart. Please log in to continue with your purchase.</p>
            <div className="auth-actions">
              <button onClick={login} className="login-btn">
                Sign In
              </button>
              <button onClick={() => navigate('/cart')} className="back-to-cart-btn">
                Back to Cart
              </button>
            </div>
          </div>
        </div>
      );
    }

    return <div className="error-message">{error}</div>;
  };

  return (
    <div className="checkout-page">
      <div className="checkout-container">
        <div className="checkout-left">
          <div className="checkout-logo-placeholder">
            <a href="/">
            <img src="/assets/flora-logo.svg" alt="flora logo" width="75px" height="150px">
            </img>
            <img src="/assets/flora-text-cursive.svg" alt="flora text" width="150px" height="150px">
            </img>
            </a>
          </div>
          {getErrorDisplay()}
          {isProcessing && <div className="loading-message">Processing...</div>}

          <CheckoutForm
            clientSecret={clientSecret || undefined}
            orderId={orderId || undefined}
            onSubmit={handleFormSubmit}
            onPaymentSuccess={handlePaymentSuccess}
            onPaymentError={handlePaymentError}
            deliveryInfo={deliveryInfo}
            selectedDeliveryType={selectedDeliveryType}
            onDeliveryTypeChange={setSelectedDeliveryType}
            hasSubscriptions={hasSubscriptions}
          />
        </div>

        <div className="checkout-right-container">
          <div className="checkout-right">
            <OrderSummary
              items={state.items}
              subtotal={state.total}
              shipping={SHIPPING_COST}
              total={state.total + SHIPPING_COST}
              shippingBreakdown={shippingBreakdown}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;