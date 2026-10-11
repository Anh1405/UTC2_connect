import { useState } from 'react';
import './App.css';

import socket from './services/socket';

// Hooks
import useAuth from './hooks/useAuth';
import useCampusData from './hooks/useCampusData';
import useLocalCamera from './hooks/useLocalCamera';
import useChat from './hooks/useChat';
import useRandomCall from './hooks/useRandomCall';
import useCameraFilters from './hooks/useCameraFilters';
import useReport from './hooks/useReport';

// Components
import AuthScreen from './components/auth/AuthScreen';
import DeviceOtpModal from './components/auth/DeviceOtpModal';
import Navbar from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import CallSection from './components/call/CallSection';
import ReportModal from './components/call/ReportModal';
import UserProfileDrawer from './components/profile/UserProfileDrawer';
import HousingModule from './components/housing/HousingModule';
import MarketModule from './components/market/MarketModule';
import TeaChatHub from './components/social/TeaChatHub';

function App() {
  const [activeSection, setActiveSection] = useState('call'); // call | market | housing | social
  const [profileUsername, setProfileUsername] = useState(null); // mở UserProfileDrawer

  const auth = useAuth();
  const campus = useCampusData();
  const camera = useLocalCamera({ enabled: auth.loginSuccess, active: activeSection === 'call' });
  const chat = useChat();
  const call = useRandomCall({
    loginSuccess: auth.loginSuccess,
    userData: auth.userData,
    localStream: camera.localStream,
    ensureMicTrack: camera.ensureMicTrack,
    chat,
    onSessionExpired: (reason) => forceLogout(reason),
  });
  const filters = useCameraFilters(call.roomID);
  const report = useReport({
    roomID: call.roomID,
    remoteVideoRef: call.remoteVideoRef,
    remoteUsername: call.remoteUsername,
    reporterUsername: auth.userData?.username,
    onReportSent: call.handleNextUser,
  });

  // Dọn dẹp cuộc gọi + phiên đăng nhập, quay về màn hình Đăng nhập
  const forceLogout = (reason) => {
    call.handleEndCall();
    socket.disconnect();
    auth.clearSession();
    setActiveSection('call');
    if (reason) alert(reason);
  };

  const handleOpenProfile = (uname) => {
    const name = typeof uname === 'string' ? uname : uname?.username;
    if (name && name !== 'Ẩn danh') setProfileUsername(name);
  };

  // ================== RENDER ==================
  return (
    <div
      className="u2-page"
      style={{ fontFamily: "'Be Vietnam Pro', 'Inter', system-ui, -apple-system, sans-serif" }}
    >
      {auth.loginSuccess ? (
        <div className="u2-home-layout">
          <Navbar username={auth.userData?.username} onOpenProfile={handleOpenProfile} onLogout={() => forceLogout()} />
          <Sidebar activeSection={activeSection} onSelect={setActiveSection} />

          {activeSection === 'call' && (
            <CallSection
              username={auth.userData?.username}
              call={call}
              camera={camera}
              filters={filters}
              chat={chat}
              onOpenReport={report.handleOpenReport}
            />
          )}

          {activeSection === 'market' && (
            <div className="u2-main-content" style={{ marginLeft: 280 }}>
              <MarketModule
                userData={auth.userData}
                marketItems={campus.marketItems}
                setMarketItems={campus.setMarketItems}
                marketOrders={campus.marketOrders}
                setMarketOrders={campus.setMarketOrders}
              />
            </div>
          )}

          {activeSection === 'housing' && (
            <div className="u2-main-content" style={{ marginLeft: 280 }}>
              <HousingModule
                userData={auth.userData}
                housingItems={campus.housingItems}
                setHousingItems={campus.setHousingItems}
                housingContracts={campus.housingContracts}
                setHousingContracts={campus.setHousingContracts}
              />
            </div>
          )}

          {activeSection === 'social' && (
            <div
              className="u2-main-content tea-mode"
              style={{ padding: 0, display: 'block', marginRight: 0, width: 'auto' }}
            >
              <TeaChatHub socket={socket} currentUser={auth.userData?.username} onOpenProfile={handleOpenProfile} />
            </div>
          )}

          {profileUsername && (
            <UserProfileDrawer
              username={profileUsername}
              selfUsername={auth.userData?.username}
              onClose={() => setProfileUsername(null)}
            />
          )}
        </div>
      ) : (
        <AuthScreen auth={auth} />
      )}

      <ReportModal report={report} />
      <DeviceOtpModal auth={auth} />
    </div>
  );
}

export default App;
