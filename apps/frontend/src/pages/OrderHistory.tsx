import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import orderService from '../services/orderService';
import type { Order, OrdersResponse } from '../services/orderService';
import { getImageUrl } from '../services/api';
import { logger } from '../utils/logger';
import '../styles/OrderHistory.css';

const OrderHistory = () => {
  const { user, loading: authLoading, getAccessToken } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStatusInfo, setShowStatusInfo] = useState(false);

  const ITEMS_PER_PAGE = 10;

  useEffect(() => {
    const fetchOrders = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        logger.log('🔍 DEBUG: Fetching orders for user:', user.sub, user.email);
        const token = await getAccessToken();
        if (!token) {
          throw new Error('No access token available');
        }

        logger.log('🔑 DEBUG: Got access token, length:', token.length);
        const response: OrdersResponse = await orderService.getUserOrders(
          token,
          currentPage,
          ITEMS_PER_PAGE
        );

        logger.log('📊 DEBUG: Order history response:', response);
        setOrders(response.data || []);
        setTotal(response.total || 0);
        setTotalPages(response.totalPages || 1);
      } catch (err: any) {
        logger.error('❌ Error fetching orders:', err);
        logger.error('❌ Error response:', err.response?.data);
        setError(err.message || 'Failed to load order history');
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchOrders();
    }
  }, [user, authLoading, getAccessToken, currentPage]);

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const getStatusBadgeClass = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'delivered') return 'status-delivered';
    if (statusLower === 'shipped' || statusLower === 'in_transit')
      return 'status-shipped';
    if (statusLower === 'preparing' || statusLower === 'confirmed')
      return 'status-preparing';
    if (statusLower === 'cancelled') return 'status-cancelled';
    return 'status-pending';
  };

  const getStatusDisplay = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const getOrderType = (order: Order) => {
    // Check individual items to determine actual order type
    const hasSubscription = order.items.some(item => item.subscriptionType);
    const hasOneTime = order.items.some(item => !item.subscriptionType);

    if (hasSubscription && hasOneTime) {
      return '🌸 Mixed'; // Both subscription and one-time items
    } else if (hasSubscription) {
      return '🔄 Subscription';
    } else {
      return '📦 One-time';
    }
  };

  if (authLoading) {
    return (
      <div className="order-history-loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="order-history-not-logged-in">
        <h2>Order History</h2>
        <p>Please log in to view your order history.</p>
        <Link
          to="/products"
          className="browse-products-btn"
        >
          Browse Products
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="order-history-loading">
        <div className="spinner"></div>
        <p>Loading your orders...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-history-error">
        <h2>Error Loading Orders</h2>
        <p>{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="retry-btn"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="order-history-page">
      <div className="order-history-container">
        <div className="order-history-header">
          <div className="header-title-row">
            <h1>Order History</h1>
            <button
              className="status-info-btn"
              onClick={() => setShowStatusInfo(!showStatusInfo)}
              title="Order status information"
            >
              ℹ️ Status Guide
            </button>
          </div>
          <p className="order-count">
            {total === 0
              ? 'No orders yet'
              : `${total} ${total === 1 ? 'order' : 'orders'} total`}
          </p>

          {showStatusInfo && (
            <div className="status-info-panel">
              <h3>Order Status Explained</h3>
              <div className="status-info-grid">
                <div className="status-info-item">
                  <span className="status-badge status-preparing">Confirmed</span>
                  <p>Payment successful! Your order is confirmed and being prepared for delivery.</p>
                </div>
                <div className="status-info-item">
                  <span className="status-badge status-preparing">Preparing</span>
                  <p>Your beautiful flowers are being carefully arranged and prepared.</p>
                </div>
                <div className="status-info-item">
                  <span className="status-badge status-shipped">Shipped</span>
                  <p>Your order is on its way! Check your email for tracking details.</p>
                </div>
                <div className="status-info-item">
                  <span className="status-badge status-delivered">Delivered</span>
                  <p>Your flowers have been delivered. Enjoy!</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {orders.length === 0 ? (
          <div className="no-orders">
            <div className="no-orders-icon">{'\u{1F4E6}'}</div>
            <h2>No Orders Yet</h2>
            <p>When you place an order, it will appear here.</p>
            <Link
              to="/products"
              className="browse-products-btn"
            >
              Browse Products
            </Link>
          </div>
        ) : (
          <>
            <div className="orders-list">
              {orders.map((order) => (
                <div
                  key={order.id}
                  className="order-card"
                >
                  <div className="order-card-header">
                    <div className="order-info-left">
                      <h3 className="order-number">
                        Order #{order.orderNumber}
                      </h3>
                      <p className="order-date">
                        {formatDate(order.createdAt)}
                      </p>
                    </div>
                    <div className="order-info-right">
                      <span
                        className={`status-badge ${getStatusBadgeClass(
                          order.status
                        )}`}
                      >
                        {getStatusDisplay(order.status)}
                      </span>
                    </div>
                  </div>

                  <div className="order-card-body">
                    <div className="order-items">
                      {order.items.slice(0, 3).map((item) => (
                        <div
                          key={item.id}
                          className="order-item-preview"
                        >
                          {item.product.imageUrl ? (
                            <img
                              src={getImageUrl(item.product.imageUrl)}
                              alt={item.product.name}
                              className="item-thumbnail"
                            />
                          ) : (
                            <div className="item-thumbnail-placeholder">
                              {'\u{1F338}'}
                            </div>
                          )}
                          <div className="item-preview-info">
                            <p className="item-name">{item.product.name}</p>
                            <p className="item-quantity">
                              Qty: {item.quantity}
                            </p>
                          </div>
                        </div>
                      ))}
                      {order.items.length > 3 && (
                        <p className="more-items">
                          +{order.items.length - 3} more{' '}
                          {order.items.length - 3 === 1 ? 'item' : 'items'}
                        </p>
                      )}
                    </div>

                    <div className="order-summary">
                      <div className="order-type">
                        <span className="label">Type:</span>
                        <span className="value">
                          {getOrderType(order)}
                        </span>
                      </div>
                      {order.deliveryType && (
                        <div className="order-delivery">
                          <span className="label">Delivery:</span>
                          <span className="value">
                            {getStatusDisplay(order.deliveryType)}
                          </span>
                        </div>
                      )}
                      <div className="order-total">
                        <span className="label">Total:</span>
                        <span className="value total-amount">
                          {formatPrice(order.totalCents)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="order-card-footer">
                    <Link
                      to={`/order-confirmation/${order.id}`}
                      className="view-details-btn"
                    >
                      View Details
                    </Link>
                    {order.status !== 'PENDING' && (
                      <Link
                        to={`/tracking/${order.id}`}
                        className="track-order-btn"
                      >
                        📦 Track Order
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  className="page-btn"
                  onClick={() =>
                    setCurrentPage((prev) => Math.max(1, prev - 1))
                  }
                  disabled={currentPage === 1}
                >
                  ← Previous
                </button>

                <div className="page-numbers">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (page) => {
                      // Show first page, last page, current page, and pages around current
                      if (
                        page === 1 ||
                        page === totalPages ||
                        (page >= currentPage - 1 && page <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={page}
                            className={`page-number ${
                              page === currentPage ? 'active' : ''
                            }`}
                            onClick={() => setCurrentPage(page)}
                          >
                            {page}
                          </button>
                        );
                      } else if (
                        page === currentPage - 2 ||
                        page === currentPage + 2
                      ) {
                        return (
                          <span
                            key={page}
                            className="page-ellipsis"
                          >
                            ...
                          </span>
                        );
                      }
                      return null;
                    }
                  )}
                </div>

                <button
                  className="page-btn"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={currentPage === totalPages}
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default OrderHistory;
