import React from 'react';
import './TrackingTimeline.css';

interface TrackingEvent {
  timestamp: string;
  eventType: string;
  description: string;
  location: string;
  source?: string;
}

interface TrackingTimelineProps {
  events: TrackingEvent[];
}

const TrackingTimeline: React.FC<TrackingTimelineProps> = ({ events }) => {
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  };

  const getRelativeTime = (timestamp: string): string => {
    const now = new Date();
    const eventDate = new Date(timestamp);
    const diffMs = now.getTime() - eventDate.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatTimestamp(timestamp);
  };

  // Map event types to user-friendly names
  const getEventTypeName = (eventType: string): string => {
    const eventTypeMap: Record<string, string> = {
      'ORDER_PLACED': 'Order Placed',
      'PREPARING': 'Preparing Order',
      'SHIPPED': 'Shipped',
      'IN_TRANSIT': 'In Transit',
      'OUT_FOR_DELIVERY': 'Out for Delivery',
      'DELIVERED': 'Delivered',
      'FAILED': 'Delivery Failed',
      'CANCELLED': 'Cancelled',
      'Picked Up': 'Picked Up',
      'Info Received': 'Info Received',
      'Pickup Scheduled': 'Pickup Scheduled',
    };
    return eventTypeMap[eventType] || eventType;
  };

  if (!events || events.length === 0) {
    return (
      <div className="tracking-timeline-empty">
        <p>No tracking events available yet.</p>
        <p className="empty-subtext">Check back later for updates.</p>
      </div>
    );
  }

  return (
    <div className="tracking-timeline">
      {events.map((event, index) => (
        <div key={index} className="timeline-event">
          <div className="timeline-marker">
            <div className={`timeline-dot ${index === 0 ? 'latest' : ''}`}></div>
            {index < events.length - 1 && <div className="timeline-line"></div>}
          </div>
          <div className="timeline-content">
            <div className="event-header">
              <h4 className="event-type">{getEventTypeName(event.eventType)}</h4>
              <span className="event-time">{getRelativeTime(event.timestamp)}</span>
            </div>
            {event.description && <p className="event-description">{event.description}</p>}
            {event.location && (
              <p className="event-location">
                <span className="location-icon">📍</span>
                {event.location}
              </p>
            )}
            <p className="event-timestamp">{formatTimestamp(event.timestamp)}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TrackingTimeline;
