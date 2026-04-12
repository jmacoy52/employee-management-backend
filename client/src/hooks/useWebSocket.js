import { useState, useEffect, useCallback } from 'react';
import websocketService from '../services/websocketService';

export const useWebSocket = () => {
  const [notifications, setNotifications] = useState([]);
  const [connectionStatus, setConnectionStatus] = useState('disconnected');
  const [lastMessage, setLastMessage] = useState(null);

  useEffect(() => {
    // Connect to WebSocket
    websocketService.connect();

    // Handle incoming messages
    const handleMessage = useCallback((event) => {
      const data = event.detail;
      
      switch (data.type) {
        case 'notification':
          setNotifications(prev => [data.payload, ...prev]);
          break;
        case 'user_update':
          // Handle real-time user updates
          console.log('User updated:', data.payload);
          break;
        case 'system_alert':
          // Handle system alerts
          console.log('System alert:', data.payload);
          break;
        default:
          console.log('Unknown message type:', data.type);
      }
      
      setLastMessage(data);
    }, []);

    // Listen for custom WebSocket events
    window.addEventListener('websocket-message', handleMessage);

    // Update connection status
    const updateConnectionStatus = useCallback(() => {
      setConnectionStatus(websocketService.isConnected() ? 'connected' : 'disconnected');
    }, []);

    // Check connection status periodically
    const interval = setInterval(updateConnectionStatus, 1000);

    return () => {
      // Cleanup
      window.removeEventListener('websocket-message', handleMessage);
      clearInterval(interval);
      websocketService.disconnect();
    };
  }, []);

  const sendMessage = useCallback((message) => {
    websocketService.send(message);
  }, []);

  const sendNotification = useCallback((notification) => {
    websocketService.send({
      type: 'notification',
      payload: notification
    });
  }, []);

  return {
    notifications,
    connectionStatus,
    lastMessage,
    sendMessage,
    sendNotification,
    isConnected: websocketService.isConnected
  };
};
