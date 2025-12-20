import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrl } from '../services/api';
import apiService from '../services/api';
import { logger } from '../utils/logger';
import '../styles/SubscriptionsPage.css';

interface SubscriptionItem {
  id: string;
  productId: string;
  quantity: number;
  product: {
    id: string;
    name: string;
    imageUrl: string | null;
    priceCents: number;
  };
}

interface Subscription {
  id: string;
  type: string;
  status: string;
  nextDeliveryDate: string | null;
  lastDeliveryDate: string | null;
  deliveryType: string;
  shippingFirstName: string;
  shippingLastName: string;
  shippingCity: string;
  shippingState: string;
  createdAt: string;
  items: SubscriptionItem[];
}

interface BillingEvent {
  id: string;
  eventType: string;
  amountCents: number | null;
  skippedItems: Array<{ productId: string; reason: string }> | null;
  errorMessage: string | null;
  createdAt: string;
}

const SubscriptionsPage = () => {
  const { getAccessToken, user, loading: authLoading } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [billingHistory, setBillingHistory] = useState<Record<string, BillingEvent[]>>({});
  const [expandedBilling, setExpandedBilling] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const fetchSubscriptions = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        const token = await getAccessToken();
        if (!token) throw new Error('No access token found');

        logger.log('🔑 Fetching subscriptions with token');
        const response = await apiService.getSubscriptions(token);
        logger.log('📋 Subscriptions response:', response);

        setSubscriptions(response.data || []);
      } catch (err: any) {
        logger.error('❌ Subscriptions error:', err);
        setError(`Failed to load subscriptions: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };

    if (!authLoading) {
      fetchSubscriptions();
    }
  }, [getAccessToken, user, authLoading]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  const getSubscriptionTypeInfo = (type: string) => {
    // Extract frequency and whether it's spontaneous or recurring
    const isSpontaneous = type.includes('SPONTANEOUS');

    let frequency = '';
    let discount = 0;

    // IMPORTANT: Check BIWEEKLY before WEEKLY (BIWEEKLY contains substring "WEEKLY")
    if (type.includes('BIWEEKLY')) {
      frequency = 'Every 2 weeks';
      discount = isSpontaneous ? 15 : 15;
    } else if (type.includes('WEEKLY')) {
      frequency = 'Every 1 week';
      discount = isSpontaneous ? 20 : 20;
    } else if (type.includes('MONTHLY')) {
      frequency = 'Every 1 month';
      discount = isSpontaneous ? 10 : 10;
    } else if (type === 'SPONTANEOUS') {
      // Legacy spontaneous type
      frequency = 'Every 2 weeks';
      discount = 15;
    }

    return {
      badge: isSpontaneous ? 'SPONTANEOUS SUBSCRIPTION' : 'RECURRING SUBSCRIPTION',
      frequency,
      discount,
      isSpontaneous,
    };
  };

  const getNextDeliveryDisplay = (subscription: Subscription) => {
    const typeInfo = getSubscriptionTypeInfo(subscription.type);

    // For spontaneous subscriptions, show random date with explanation
    if (typeInfo.isSpontaneous) {
      if (subscription.nextDeliveryDate) {
        return `${formatDate(subscription.nextDeliveryDate)} (random surprise day)`;
      }
      return 'Surprise delivery date pending';
    }

    // For recurring subscriptions, show the scheduled date
    if (subscription.nextDeliveryDate) {
      return formatDate(subscription.nextDeliveryDate);
    }

    // Fallback for recurring without a scheduled date
    return 'Not yet scheduled';
  };

  const formatPrice = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };

  const getStatusBadgeClass = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === 'active') return 'status-active';
    if (statusLower === 'paused') return 'status-paused';
    if (statusLower === 'cancelled') return 'status-cancelled';
    return 'status-pending';
  };

  const getStatusDisplay = (status: string) => {
    return status.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  const fetchBillingHistory = async (subscriptionId: string) => {
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('No access token found');

      logger.log(`📊 Fetching billing history for subscription ${subscriptionId}`);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/subscriptions/${subscriptionId}/billing-history`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch billing history');
      }

      const data = await response.json();
      logger.log('📊 Billing history response:', data);

      setBillingHistory((prev) => ({
        ...prev,
        [subscriptionId]: data.data || [],
      }));
    } catch (err: any) {
      logger.error('❌ Billing history error:', err);
    }
  };

  const toggleBillingHistory = async (subscriptionId: string) => {
    const isExpanded = expandedBilling[subscriptionId];

    if (!isExpanded && !billingHistory[subscriptionId]) {
      // Fetch billing history if not already loaded
      await fetchBillingHistory(subscriptionId);
    }

    setExpandedBilling((prev) => ({
      ...prev,
      [subscriptionId]: !isExpanded,
    }));
  };

  const pauseSubscription = async (subscriptionId: string) => {
    try {
      const token = await getAccessToken();
      logger.log('🔑 Got token for pause:', token ? 'Token exists' : 'No token');
      if (!token) {
        alert('Please log in to pause subscription');
        return;
      }

      logger.log(`⏸ Pausing subscription ${subscriptionId}`);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/subscriptions/${subscriptionId}/pause`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.log('Response status:', response.status, response.statusText);

      const data = await response.json();
      logger.log('Response data:', data);

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to pause subscription');
      }

      // Refresh subscriptions to show updated status
      const subsResponse = await apiService.getSubscriptions(token);
      setSubscriptions(subsResponse.data || []);
      logger.log('✅ Subscription paused successfully');
      alert('Subscription paused!');
    } catch (err: any) {
      logger.error('❌ Pause subscription error:', err);
      alert(`Failed to pause subscription: ${err.message}`);
    }
  };

  const resumeSubscription = async (subscriptionId: string) => {
    try {
      const token = await getAccessToken();
      if (!token) {
        alert('Please log in to resume subscription');
        return;
      }

      logger.log(`▶ Resuming subscription ${subscriptionId}`);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/subscriptions/${subscriptionId}/resume`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to resume subscription');
      }

      // Refresh subscriptions to show updated status
      const subsResponse = await apiService.getSubscriptions(token);
      setSubscriptions(subsResponse.data || []);
      logger.log('✅ Subscription resumed successfully');
      alert('Subscription resumed!');
    } catch (err: any) {
      logger.error('❌ Resume subscription error:', err);
      alert(`Failed to resume subscription: ${err.message}`);
    }
  };

  const cancelSubscription = async (subscriptionId: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to cancel this subscription? This action cannot be undone.'
    );

    if (!confirmed) return;

    try {
      const token = await getAccessToken();
      if (!token) {
        alert('Please log in to cancel subscription');
        return;
      }

      logger.log(`❌ Cancelling subscription ${subscriptionId}`);
      const response = await fetch(
        `${import.meta.env.VITE_API_URL}/subscriptions/${subscriptionId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || 'Failed to cancel subscription');
      }

      // Refresh subscriptions to show updated status
      const subsResponse = await apiService.getSubscriptions(token);
      setSubscriptions(subsResponse.data || []);
      logger.log('✅ Subscription cancelled successfully');
      alert('Subscription cancelled');
    } catch (err: any) {
      logger.error('❌ Cancel subscription error:', err);
      alert(`Failed to cancel subscription: ${err.message}`);
    }
  };

  if (authLoading) {
    return (
      <div className="subscriptions-loading">
        <div className="spinner"></div>
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="subscriptions-not-logged-in">
        <h2>My Subscriptions</h2>
        <p>Please log in to view your subscriptions.</p>
        <Link to="/products" className="browse-products-btn">
          Browse Products
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="subscriptions-loading">
        <div className="spinner"></div>
        <p>Loading your subscriptions...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="subscriptions-error">
        <h2>Error Loading Subscriptions</h2>
        <p>{error}</p>
        <button onClick={() => window.location.reload()} className="retry-btn">
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="subscriptions-page">
      <div className="subscriptions-container">
        <div className="subscriptions-header">
          <h1>My Subscriptions</h1>
          <p className="subscription-count">
            {subscriptions.length === 0
              ? 'No active subscriptions'
              : `${subscriptions.length} ${subscriptions.length === 1 ? 'subscription' : 'subscriptions'}`}
          </p>
        </div>

        {subscriptions.length === 0 ? (
          <div className="no-subscriptions">
            <div className="no-subscriptions-icon">{'\u{1F504}'}</div>
            <h2>No Subscriptions Yet</h2>
            <p>Subscribe to your favorite flowers for recurring deliveries.</p>
            <Link to="/products" className="browse-products-btn">
              Browse Products
            </Link>
          </div>
        ) : (
          <div className="subscriptions-list">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="subscription-card">
                <div className="subscription-card-header">
                  <div className="subscription-info-left">
                    <div className="subscription-type-badge">
                      <span className="type-badge">
                        {getSubscriptionTypeInfo(subscription.type).badge}
                      </span>
                    </div>
                    <p className="subscription-frequency">
                      {getSubscriptionTypeInfo(subscription.type).frequency} • Save {getSubscriptionTypeInfo(subscription.type).discount}%
                    </p>
                    <p className="subscription-created">
                      Started {formatDate(subscription.createdAt)}
                    </p>
                  </div>
                  <div className="subscription-info-right">
                    <span
                      className={`status-badge ${getStatusBadgeClass(
                        subscription.status
                      )}`}
                    >
                      {getStatusDisplay(subscription.status)}
                    </span>
                  </div>
                </div>

                <div className="subscription-card-body">
                  <div className="subscription-items">
                    {subscription.items.map((item) => (
                      <div key={item.id} className="subscription-item-preview">
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
                          <p className="item-quantity">Qty: {item.quantity}</p>
                          <p className="item-price">
                            {formatPrice(item.product.priceCents)} each
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="subscription-details">
                    <div className="detail-row">
                      <span className="label">Delivery:</span>
                      <span className="value">
                        {getStatusDisplay(subscription.deliveryType)}
                      </span>
                    </div>
                    <div className="detail-row">
                      <span className="label">Next Delivery:</span>
                      <span className="value next-delivery">
                        {getNextDeliveryDisplay(subscription)}
                      </span>
                    </div>
                    {subscription.lastDeliveryDate && (
                      <div className="detail-row">
                        <span className="label">Last Delivery:</span>
                        <span className="value">
                          {formatDate(subscription.lastDeliveryDate)}
                        </span>
                      </div>
                    )}
                    <div className="detail-row">
                      <span className="label">Ship To:</span>
                      <span className="value">
                        {subscription.shippingCity}, {subscription.shippingState}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="subscription-card-footer">
                  <div className="subscription-actions">
                    {subscription.status === 'ACTIVE' && (
                      <button
                        className="action-btn pause-btn"
                        onClick={() => pauseSubscription(subscription.id)}
                      >
                        ⏸ Pause
                      </button>
                    )}
                    {subscription.status === 'PAUSED' && (
                      <button
                        className="action-btn resume-btn"
                        onClick={() => resumeSubscription(subscription.id)}
                      >
                        ▶ Resume
                      </button>
                    )}
                    {subscription.status !== 'CANCELLED' && (
                      <button
                        className="action-btn cancel-btn"
                        onClick={() => cancelSubscription(subscription.id)}
                      >
                        Cancel
                      </button>
                    )}
                    {subscription.status === 'CANCELLED' && (
                      <p className="cancelled-message">
                        This subscription has been cancelled
                      </p>
                    )}
                  </div>

                  <button
                    className="billing-history-link"
                    onClick={() => toggleBillingHistory(subscription.id)}
                  >
                    {expandedBilling[subscription.id] ? '▼' : '▶'} View Billing History
                  </button>

                  {expandedBilling[subscription.id] && (
                    <div className="billing-history">
                      {billingHistory[subscription.id]?.length > 0 ? (
                        <div className="billing-events">
                          {billingHistory[subscription.id].map((event) => (
                            <div
                              key={event.id}
                              className={`billing-event ${event.eventType.toLowerCase().replace(/_/g, '-')}`}
                            >
                              <div className="event-header">
                                <span className="event-type">
                                  {event.eventType.replace(/_/g, ' ')}
                                </span>
                                <span className="event-date">
                                  {formatDate(event.createdAt)}
                                </span>
                              </div>
                              <div className="event-details">
                                {event.amountCents && (
                                  <span className="event-amount">
                                    Amount: {formatPrice(event.amountCents)}
                                  </span>
                                )}
                                {event.errorMessage && (
                                  <span className="event-error">
                                    Error: {event.errorMessage}
                                  </span>
                                )}
                                {event.skippedItems && event.skippedItems.length > 0 && (
                                  <div className="skipped-items">
                                    <span className="skipped-label">
                                      ⚠️ {event.skippedItems.length} item(s) skipped
                                    </span>
                                    <ul className="skipped-list">
                                      {event.skippedItems.map((item, idx) => (
                                        <li key={idx}>
                                          {item.productId}: {item.reason}
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="no-billing-history">No billing events yet. Renewals will appear here.</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SubscriptionsPage;
