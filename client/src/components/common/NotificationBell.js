import React, { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { notificationAPI } from '../../services/apiService';

const NotificationBell = ({ targetPath, className = '', badgeClassName = '' }) => {
  const navigate = useNavigate();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let mounted = true;

    const loadUnreadCount = async () => {
      try {
        const response = await notificationAPI.getUnreadCount();
        if (mounted) {
          setCount(Number(response.data.count || 0));
        }
      } catch (error) {
        if (mounted) {
          setCount(0);
        }
      }
    };

    loadUnreadCount();
    const interval = setInterval(loadUnreadCount, 30000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <button
      type="button"
      onClick={() => navigate(targetPath)}
      className={className}
      aria-label="Open notifications"
    >
      <Bell size={20} />
      {count > 0 && <span className={badgeClassName}>{count > 9 ? '9+' : count}</span>}
    </button>
  );
};

export default NotificationBell;
