import React, { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useCart, groupItemsByDeliveryDate } from "../contexts/CartContext";
import { useAuth } from "../contexts/AuthContext";
import orderService from "../services/orderService";
import type { Order } from "../services/orderService";
import { getImageUrl } from "../services/api";
import { logger } from "../utils/logger";
import "../styles/OrderConfirmationPage.css";

const OrderConfirmationPage: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const { clearCart } = useCart();
  const { getAccessToken, loading: authLoading, user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showShippingBreakdown, setShowShippingBreakdown] = useState(false);

  const fetchOrder = useCallback(async (id: string) => {
    let token: string | undefined;
    try {
      if (user) {
        try {
          token = await getAccessToken();
        } catch (tokenError) {
          logger.warn("Unable to get auth token for order fetch:", tokenError);
        }
      }

      const orderData = await orderService.getOrder(id, token);
      setOrder(orderData);
      setError(null);
    } catch (err: any) {
      logger.error("Error fetching order:", err);
      if (user && !token) {
        setError("We couldn't verify your order. Please refresh and sign in again.");
      } else {
        setError(err.response?.data?.error || "Failed to load order details");
      }
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, user]);

  useEffect(() => {
    // Clear cart when order confirmation page loads
    clearCart();
  }, [clearCart]);

  useEffect(() => {
    if (!orderId) return;
    if (authLoading) return;

    fetchOrder(orderId);
  }, [orderId, authLoading, user, fetchOrder]);

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getCountryName = (countryCode?: string) => {
    const countries: Record<string, string> = {
      AU: "Australia",
      US: "United States",
      UK: "United Kingdom",
      CA: "Canada",
      NZ: "New Zealand",
    };
    return countries[countryCode || "AU"] || countryCode || "Australia";
  };

  const getCustomerName = () => {
    // Prefer the authenticated user if we captured their profile name
    if (order?.user?.firstName && order?.user?.lastName) {
      return `${order.user.firstName} ${order.user.lastName}`;
    }

    // For guest checkouts, thank the purchaser (billing info) before the recipient
    if (order?.billingFirstName && order?.billingLastName) {
      return `${order.billingFirstName} ${order.billingLastName}`;
    }

    if (order?.shippingFirstName && order?.shippingLastName) {
      return `${order.shippingFirstName} ${order.shippingLastName}`;
    }

    return "Valued Customer";
  };

  const formatSubscriptionType = (subscriptionType?: string) => {
    if (!subscriptionType) return "One-time purchase";

    // Extract frequency and type to avoid redundancy
    // IMPORTANT: Check BIWEEKLY before WEEKLY to avoid substring match bug
    let frequency = '';
    let type = '';

    if (subscriptionType.includes('SPONTANEOUS')) {
      type = 'Spontaneous';
    } else if (subscriptionType.includes('RECURRING')) {
      type = 'Recurring';
    }

    // Check BIWEEKLY first (it contains "WEEKLY" as substring)
    if (subscriptionType.includes('BIWEEKLY')) {
      frequency = 'Biweekly';
    } else if (subscriptionType.includes('WEEKLY')) {
      frequency = 'Weekly';
    } else if (subscriptionType.includes('MONTHLY')) {
      frequency = 'Monthly';
    } else if (subscriptionType.includes('QUARTERLY')) {
      frequency = 'Quarterly';
    } else if (subscriptionType.includes('YEARLY')) {
      frequency = 'Yearly';
    } else if (subscriptionType === 'SPONTANEOUS') {
      // Legacy spontaneous type
      return 'Biweekly Spontaneous';
    }

    // Return: "Biweekly Recurring" or "Monthly Spontaneous", etc.
    return frequency && type ? `${frequency} ${type}` : subscriptionType;
  };

  const getDeliveryEstimate = (deliveryType?: string) => {
    const estimates: Record<string, string> = {
      'STANDARD': 'Standard delivery (3-5 business days)',
      'EXPRESS': 'Express delivery (1-2 business days)',
      'SAME_DAY': 'Same-day delivery',
      'PICKUP': 'Pickup (date to be arranged)',
    };
    return estimates[deliveryType || 'STANDARD'] || 'Standard delivery (3-5 business days)';
  };

  const getShippingBreakdown = () => {
    if (!order || !order.items) return [];

    // Convert order items to cart item format for grouping
    // Note: We only need minimal product info for grouping by date
    const cartItems = order.items.map(item => ({
      id: item.id,
      product: {
        ...item.product,
        // Add missing required Product fields with placeholder values
        description: '',
        priceRange: '',
        inStock: true,
        stockCount: 0,
        occasions: [],
        seasons: [],
        moods: [],
        colors: [],
        types: [],
        isActive: true,
        type: '',
        categoryId: null,
        longDescription: undefined,
        createdAt: '',
        updatedAt: '',
      },
      quantity: item.quantity,
      selectedDate: item.requestedDeliveryDate ? new Date(item.requestedDeliveryDate) : undefined,
    }));

    // Group by delivery date
    const groups = groupItemsByDeliveryDate(cartItems);

    // Calculate shipping cost per group
    const shippingPerDelivery = order.deliveryType === 'PICKUP' ? 0 : 899; // $8.99 in cents

    return groups.map(group => ({
      date: group.date,
      itemCount: group.items.reduce((sum, item) => sum + item.quantity, 0),
      shippingCost: shippingPerDelivery,
    }));
  };

  if (loading) {
    return (
      <div className="order-confirmation-loading">
        <div className="spinner"></div>
        <p>Loading your order...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="order-confirmation-page">
        <div className="confirmation-container">
          <div className="logo-section">
            <div className="logo">FLORA</div>
          </div>
          <div className="error-section">
            <h2>Unable to Load Order</h2>
            <p>{error || "Order not found"}</p>
            <Link to="/" className="back-home-btn">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="order-confirmation-page">
      <div className="confirmation-container">
        {/* Logo */}
        <div className="logo-section">
          <div className="logo-image">
          <a href="/">
            <img src="/assets/flora-logo.svg" alt="flora logo" width="75px">
            </img>
            <img src="/assets/flora-text-cursive.svg" alt="flora text" width="150px">
            </img>
          </a>
          </div>
        </div>

        {/* Header Section */}
        <div className="header-section">
          <h1>ORDER CONFIRMATION</h1>
          {order && (
            <div className="order-number-highlight">
              <span className="order-number-label">Order Number:</span>
              <span className="order-number-value">#{order.orderNumber}</span>
            </div>
          )}
          <p className="thank-you-message">{getCustomerName()}, thank you for your order!</p>
          <p className="info-message">
            We've received your order and will contact you as soon as your package is shipped. You can find your
            purchase information below.
          </p>
          <p className="info-message">An email will be sent to you soon.</p>
        </div>

        {order && (
          <>
            {/* Order Summary */}
            <div className="order-summary-section">
              <h2>Order Summary</h2>
              <p className="order-date">{formatDate(order.createdAt)}</p>

              {order.items && order.items.length > 0 && (
                <>
                  {/* Loop through all order items */}
                  {order.items.map((item) => {
                    const itemTotalCents = item.priceCents * item.quantity;

                    return (
                      <div key={item.id} className="order-item-card">
                        <div className="item-image-container">
                          {item.product.imageUrl ? (
                            <img src={getImageUrl(item.product.imageUrl)} alt={item.product.name} />
                          ) : (
                            <div className="placeholder-image"></div>
                          )}
                        </div>
                        <div className="item-details-container">
                          <div className="item-header">
                            <h3>{item.product.name}</h3>
                            <span className="item-price">{formatPrice(itemTotalCents)}</span>
                          </div>
                          <div className="item-info-list">
                            <p>Quantity: {item.quantity}</p>
                            <p>Suburb: {order.shippingCity || "N/A"}</p>
                            <p>Postcode: {order.shippingZipCode || "N/A"}</p>
                            <p>
                              Delivery Date:{" "}
                              {item.requestedDeliveryDate ? formatDate(item.requestedDeliveryDate) : getDeliveryEstimate(order.deliveryType)}
                            </p>
                            <p>Subscription: {formatSubscriptionType(item.subscriptionType)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Price breakdown shown once after all items */}
                  <div className="price-breakdown">
                    <div className="price-row">
                      <span>Subtotal</span>
                      <span>{formatPrice(order.subtotalCents)}</span>
                    </div>

                    {/* Shipping section with breakdown */}
                    {(() => {
                      const shippingBreakdown = getShippingBreakdown();
                      const calculatedShipping = shippingBreakdown.reduce((sum, group) => sum + group.shippingCost, 0);

                      return (
                        <>
                          <div className="price-row shipping-row">
                            <div className="shipping-label-wrapper">
                              <span>
                                {shippingBreakdown.length > 1
                                  ? `Shipping (${shippingBreakdown.length} deliveries)`
                                  : 'Shipping'}
                              </span>
                              {shippingBreakdown.length > 1 && (
                                <button
                                  className="breakdown-toggle"
                                  onClick={() => setShowShippingBreakdown(!showShippingBreakdown)}
                                  type="button"
                                >
                                  {showShippingBreakdown ? '▼ Hide details' : '▶ See breakdown'}
                                </button>
                              )}
                            </div>
                            <span>{formatPrice(calculatedShipping)}</span>
                          </div>

                          {/* Shipping breakdown details */}
                          {showShippingBreakdown && shippingBreakdown.length > 1 && (
                            <div className="shipping-breakdown">
                              {shippingBreakdown.map((group, index) => (
                                <div key={index} className="breakdown-item">
                                  <span className="breakdown-date">
                                    {group.date
                                      ? new Date(group.date + 'T12:00:00').toLocaleDateString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          year: 'numeric',
                                        })
                                      : 'Unscheduled'}{' '}
                                    ({group.itemCount} {group.itemCount === 1 ? 'item' : 'items'})
                                  </span>
                                  <span className="breakdown-cost">{formatPrice(group.shippingCost)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      );
                    })()}

                    <div className="price-row total-row">
                      <span>Total</span>
                      <span>{formatPrice(order.totalCents)}</span>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Billing and Shipping */}
            <div className="billing-shipping-section">
              <h2>Billing and Shipping</h2>

              <div className="info-grid">
                <div className="info-column">
                  <h3>Billing Information</h3>
                  {order.billingFirstName && order.billingLastName ? (
                    <>
                      <p>
                        {order.billingFirstName} {order.billingLastName}
                      </p>
                      <p>{order.billingStreet1}</p>
                      {order.billingStreet2 && <p>{order.billingStreet2}</p>}
                      <p>
                        {order.billingCity}, {order.billingState}
                      </p>
                      <p>{order.billingZipCode}</p>
                      <p>{getCountryName(order.billingCountry)}</p>
                    </>
                  ) : (
                    <>
                      <p>
                        {order.shippingFirstName} {order.shippingLastName}
                      </p>
                      <p>{order.shippingStreet1}</p>
                      {order.shippingStreet2 && <p>{order.shippingStreet2}</p>}
                      <p>
                        {order.shippingCity}, {order.shippingState}
                      </p>
                      <p>{order.shippingZipCode}</p>
                      <p>{getCountryName(order.shippingCountry)}</p>
                      <p className="same-as-shipping">(Same as shipping)</p>
                    </>
                  )}
                </div>

                <div className="info-column">
                  <h3>Shipping Information</h3>
                  <p>
                    {order.shippingFirstName} {order.shippingLastName}
                  </p>
                  <p>{order.shippingStreet1}</p>
                  {order.shippingStreet2 && <p>{order.shippingStreet2}</p>}
                  <p>
                    {order.shippingCity}, {order.shippingState}
                  </p>
                  <p>{order.shippingZipCode}</p>
                  <p>{getCountryName(order.shippingCountry)}</p>
                </div>
              </div>

              <div className="payment-shipping-methods">
                <div className="method-column">
                  <h3>Payment method</h3>
                  <p>Visa **** **** **** 4242</p>
                </div>

                <div className="method-column">
                  <h3>Shipping method</h3>
                  <p>
                    {order.deliveryType === "STANDARD"
                      ? "Standard shipping"
                      : order.deliveryType || "Standard shipping"}
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        {/* Action Buttons */}
        <div className="action-buttons">
          <Link to={`/tracking/${order.id}`} className="track-order-btn">
            📦 Track Your Order
          </Link>
          <Link to="/" className="back-home-btn">
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
