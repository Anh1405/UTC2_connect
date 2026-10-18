import { useState, useEffect } from 'react';
import socket from '../services/socket';

// Bộ lọc màu camera: của mình (cameraFilter) và của đối phương (remoteFilter)
export default function useCameraFilters(roomID) {
  const [cameraFilter, setCameraFilter] = useState('none');
  const [remoteFilter, setRemoteFilter] = useState('none');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    const handleReceiveFilter = (data) => {
      if (data && data.filterType) setRemoteFilter(data.filterType);
    };
    socket.on('receive_filter', handleReceiveFilter);
    return () => socket.off('receive_filter', handleReceiveFilter);
  }, []);

  const handleFilterChange = (type) => {
    setCameraFilter(type);
    if (roomID) socket.emit('send_filter', { roomID, filterType: type });
  };

  return { cameraFilter, remoteFilter, showFilters, setShowFilters, handleFilterChange };
}
