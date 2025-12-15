import React from 'react';
import './StatusBadge.css';

interface StatusBadgeProps {
  status: string;
  statusMessage: string;
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, statusMessage }) => {
  const getStatusClass = (status: string): string => {
    const statusMap: Record<string, string> = {
      PROCESSING: 'status-processing',
      IN_TRANSIT: 'status-in-transit',
      OUT_FOR_DELIVERY: 'status-out-for-delivery',
      DELIVERED: 'status-delivered',
      FAILED: 'status-failed',
      CANCELLED: 'status-cancelled',
    };
    return statusMap[status] || 'status-processing';
  };

  const getStatusIcon = (status: string): string => {
    const iconMap: Record<string, string> = {
      PROCESSING: '📋',
      IN_TRANSIT: '📦',
      OUT_FOR_DELIVERY: '🚚',
      DELIVERED: '✅',
      FAILED: '❌',
      CANCELLED: '🚫',
    };
    return iconMap[status] || '📋';
  };

  return (
    <div className={`status-badge ${getStatusClass(status)}`}>
      <span className="status-icon">{getStatusIcon(status)}</span>
      <span className="status-text">{statusMessage}</span>
    </div>
  );
};

export default StatusBadge;
