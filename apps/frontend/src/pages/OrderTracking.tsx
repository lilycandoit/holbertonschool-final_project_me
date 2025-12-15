import React, { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiService from '../services/api';
import StatusBadge from '../components/tracking/StatusBadge';
import TrackingTimeline from '../components/tracking/TrackingTimeline';
import { logger } from '../utils/logger';
import '../styles/OrderTracking.css';

interface TrackingData {
  orderId: string;
  orderNumber: string;
  trackingNumber: string;
  status: string;
  statusMessage: string;
  sendleTrackingUrl: string | null;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  currentLocation: string | null;
  lastUpdated: string;
  carrierName: string;
}

interface TrackingEvent {
  timestamp: string;
  eventType: string;
  description: string;
  location: string;
  source: string;
}

const OrderTracking: React.FC = () => {
  const { orderId } = useParams<{ orderId: string }>();
  const [tracking, setTracking] = useState<TrackingData | null>(null);
  const [events, setEvents] = useState<TrackingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  const fetchTracking = useCallback(async (id: string) => {
    try {
      setLoading(true);
      setError(null);

      // Fetch tracking info and events in parallel
      const [trackingData, eventsData] = await Promise.all([
        apiService.getOrderTracking(id),
        apiService.getOrderTrackingEvents(id),
      ]);

      setTracking(trackingData);
      setEvents(eventsData.events);
      logger.log('📦 Tracking data loaded:', trackingData);
    } catch (err: any) {
      logger.error('❌ Error fetching tracking:', err);
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Failed to load tracking information'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleRefresh = async () => {
    if (!orderId) return;

    try {
      setRefreshing(true);
      setRefreshMessage(null);

      logger.log('🔄 Refreshing tracking...');
      const refreshData = await apiService.refreshOrderTracking(orderId);

      // Update tracking data
      setTracking((prev) =>
        prev
          ? {
              ...prev,
              status: refreshData.status,
              statusMessage: refreshData.statusMessage,
              lastUpdated: refreshData.lastUpdated,
            }
          : null
      );

      // Refetch events to get the latest
      const eventsData = await apiService.getOrderTrackingEvents(orderId);
      setEvents(eventsData.events);

      // Show success message
      if (refreshData.statusChanged) {
        setRefreshMessage(`Status updated to: ${refreshData.statusMessage}`);
      } else {
        setRefreshMessage('No new updates available');
      }

      logger.log('✅ Tracking refreshed successfully');
    } catch (err: any) {
      logger.error('❌ Error refreshing tracking:', err);
      setRefreshMessage(err.response?.data?.message || 'Failed to refresh tracking');
    } finally {
      setRefreshing(false);

      // Clear message after 3 seconds
      setTimeout(() => {
        setRefreshMessage(null);
      }, 3000);
    }
  };

  useEffect(() => {
    if (!orderId) return;
    fetchTracking(orderId);
  }, [orderId, fetchTracking]);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'Not available';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getRelativeTime = (timestamp: string): string => {
    const now = new Date();
    const eventDate = new Date(timestamp);
    const diffMs = now.getTime() - eventDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  };

  if (loading) {
    return (
      <div className="order-tracking-page">
        <div className="tracking-container">
          <div className="tracking-loading">
            <div className="spinner"></div>
            <p>Loading tracking information...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !tracking) {
    return (
      <div className="order-tracking-page">
        <div className="tracking-container">
          <div className="logo-section">
            <Link to="/" className="logo-link">
              <img src="/assets/flora-logo.svg" alt="Flora logo" width="75px" />
              <img src="/assets/flora-text-cursive.svg" alt="Flora" width="150px" />
            </Link>
          </div>
          <div className="error-section">
            <h2>Unable to Load Tracking</h2>
            <p>{error || 'Tracking information not found'}</p>
            <div className="error-actions">
              <Link to="/orders" className="btn-secondary">
                View My Orders
              </Link>
              <Link to="/" className="btn-primary">
                Back to Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="order-tracking-page">
      <div className="tracking-container">
        {/* Logo */}
        <div className="logo-section">
          <Link to="/" className="logo-link">
            <img src="/assets/flora-logo.svg" alt="Flora logo" width="75px" />
            <img src="/assets/flora-text-cursive.svg" alt="Flora" width="150px" />
          </Link>
        </div>

        {/* Header */}
        <div className="tracking-header">
          <h1>Order Tracking</h1>
          <div className="order-info">
            <div className="info-item">
              <span className="info-label">Order Number:</span>
              <span className="info-value">#{tracking.orderNumber}</span>
            </div>
            <div className="info-item">
              <span className="info-label">Tracking Number:</span>
              <span className="info-value">{tracking.trackingNumber}</span>
            </div>
          </div>
        </div>

        {/* Status Card */}
        <div className="status-card">
          <StatusBadge status={tracking.status} statusMessage={tracking.statusMessage} />

          <div className="status-details">
            {tracking.currentLocation && (
              <div className="detail-row">
                <span className="detail-icon">📍</span>
                <span className="detail-label">Current Location:</span>
                <span className="detail-value">{tracking.currentLocation}</span>
              </div>
            )}

            {tracking.estimatedDelivery && (
              <div className="detail-row">
                <span className="detail-icon">⏰</span>
                <span className="detail-label">Estimated Delivery:</span>
                <span className="detail-value">{formatDate(tracking.estimatedDelivery)}</span>
              </div>
            )}

            {tracking.actualDelivery && (
              <div className="detail-row">
                <span className="detail-icon">✅</span>
                <span className="detail-label">Delivered On:</span>
                <span className="detail-value">{formatDate(tracking.actualDelivery)}</span>
              </div>
            )}

            <div className="detail-row">
              <span className="detail-icon">🚚</span>
              <span className="detail-label">Carrier:</span>
              <span className="detail-value">{tracking.carrierName}</span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="action-buttons">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="btn-refresh"
              type="button"
            >
              {refreshing ? (
                <>
                  <span className="spinner-small"></span>
                  Refreshing...
                </>
              ) : (
                <>
                  <span>🔄</span>
                  Refresh Tracking
                </>
              )}
            </button>

            {tracking.sendleTrackingUrl && (
              <a
                href={tracking.sendleTrackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-sendle"
              >
                <span>🔗</span>
                View on Sendle
              </a>
            )}
          </div>

          {/* Refresh Message */}
          {refreshMessage && (
            <div className={`refresh-message ${refreshMessage.includes('Failed') ? 'error' : 'success'}`}>
              {refreshMessage}
            </div>
          )}

          {/* Last Updated */}
          <div className="last-updated">
            Last updated: {getRelativeTime(tracking.lastUpdated)}
          </div>
        </div>

        {/* Timeline */}
        <div className="timeline-section">
          <h2>Tracking Timeline</h2>
          <TrackingTimeline events={events} />
        </div>

        {/* Back Button */}
        <div className="back-actions">
          <Link to="/orders" className="btn-secondary">
            ← Back to My Orders
          </Link>
          <Link to="/" className="btn-primary">
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default OrderTracking;
