import React, { useEffect, useRef, useState } from "react";
import {
  Home,
  Calendar,
  Mail,
  User,
  HelpCircle,
  LayoutDashboard,
  ClipboardList,
  Radar,
  Upload,
  LifeBuoy,
  Database,
  ScrollText,
  KeyRound,
} from "lucide-react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";

import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";
import Toast from "./components/Toast";
import Login from "./pages/Login";
import OtpVerify from "./pages/OtpVerify";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import FaceEnrollIntro from "./pages/face/FaceEnrollIntro";
import FaceEnrollScan from "./pages/face/FaceEnrollScan";
import FaceEnrollSuccess from "./pages/face/FaceEnrollSuccess";

import UserHome from "./pages/user/UserHome";
import BookRoom from "./pages/user/BookRoom";
import Invitation from "./pages/user/Invitation";
import UserProfile from "./pages/user/UserProfile";
import UserHelp from "./pages/user/UserHelp";
import EntryOtp from "./pages/user/EntryOtp";
import KioskEntry from "./pages/kiosk/KioskEntry";

import AdminDashboard from "./pages/admin/AdminDashboard";
import AdminTracking from "./pages/admin/AdminTracking";
import AdminMonitor from "./pages/admin/AdminMonitor";
import AdminExport from "./pages/admin/AdminExport";
import AdminHelpCenter from "./pages/admin/AdminHelpCenter";
import AdminData from "./pages/admin/AdminData";
import AdminAuditLog from "./pages/admin/AdminAuditLog";

import { getMyBookings, mapBookingRow } from "./api/bookings";
import { getMyProblemReports, getProblemReports } from "./api/problemReports";
import {
  AUTH_CHANGED_EVENT,
  adoptBrowserSession,
  beginBrowserSession,
  clearStoredAuth,
  ensureBrowserSession,
  getMe,
  getTabSessionId,
  isSessionTakenOver,
  logout,
  markSessionTakenOver,
  peekStoredAuth,
  readStoredAuth,
  storeAuth,
} from "./api/auth";
import { BG_APP } from "./theme";
import { getDisplayName } from "./utils/displayName";
import { isStaffAdmin, isSuperAdmin } from "./utils/roles";
import { getNavBadges } from "./api/nav";

const USER_NAV = [
  { key: "home", label: "หน้าหลัก", icon: Home },
  { key: "book", label: "จองห้องแล็บ", icon: Calendar },
  { key: "invite", label: "คำเชิญ", icon: Mail },
  { key: "entry-otp", label: "รหัสเข้าห้อง", icon: KeyRound },
  { key: "profile", label: "โปรไฟล์", icon: User },
  { key: "help", label: "ช่วยเหลือ", icon: HelpCircle },
];

const ADMIN_NAV = [
  { key: "dashboard", label: "แดชบอร์ด", icon: LayoutDashboard },
  { key: "tracking", label: "Tracking", icon: Radar },
  { key: "monitor", label: "ตรวจสอบการใช้งาน", icon: ClipboardList },
  { key: "export", label: "ส่งออกข้อมูล", icon: Upload },
  { key: "data", label: "จัดการข้อมูล", icon: Database },
  { key: "helpcenter", label: "ศูนย์แก้ไขปัญหา", icon: LifeBuoy },
];

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [auth, setAuth] = useState(() => readStoredAuth());
  const [pendingLogin, setPendingLogin] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem("kinofPendingLogin") || "null"); } catch { return null; }
  });
  const [bootstrapping, setBootstrapping] = useState(() => Boolean(readStoredAuth()));
  const role = isStaffAdmin(auth?.user?.userType) ? "admin" : "user";
  const [page, setPage] = useState(() => {
    if (role === "admin") return sessionStorage.getItem("kinofAdminPage") || "dashboard";
    return "home";
  });
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [trackingNav, setTrackingNav] = useState(null);
  const notify = (t) => setToast(t);

  const [myBookings, setMyBookings] = useState([]);
  const [problemReports, setProblemReports] = useState([]);
  const [navBadges, setNavBadges] = useState({ invite: 0, monitor: 0, helpcenter: 0 });
  const [badgeTick, setBadgeTick] = useState(0);
  const tabSessionIdRef = useRef(auth?.sessionId ?? getTabSessionId());
  const pendingLoginRef = useRef(pendingLogin);

  useEffect(() => {
    let active = true;
    if (pendingLoginRef.current) {
      setAuth(null);
      setBootstrapping(false);
      return () => { active = false; };
    }
    const storedAuth = readStoredAuth();
    if (!storedAuth?.accessToken && !storedAuth?.refreshToken) {
      clearStoredAuth();
      setAuth(null);
      setBootstrapping(false);
      return () => {
        active = false;
      };
    }

    getMe()
      .then((user) => {
        if (!active || pendingLoginRef.current) return;
        const currentAuth = readStoredAuth() ?? peekStoredAuth();
        if (!currentAuth?.accessToken) {
          throw new Error("เซสชันหมดอายุ");
        }
        const nextAuth = ensureBrowserSession({ ...currentAuth, user });
        setAuth(nextAuth);
        tabSessionIdRef.current = nextAuth.sessionId;
        if (isStaffAdmin(user.userType)) {
          setPage(sessionStorage.getItem("kinofAdminPage") || "dashboard");
        }
      })
      .catch(() => {
        if (!active) return;
        clearStoredAuth();
        setAuth(null);
        navigate("/login", { replace: true });
      })
      .finally(() => {
        if (active) setBootstrapping(false);
      });

    return () => {
      active = false;
    };
  }, [navigate]);

  useEffect(() => {
    const kickThisTab = (notice) => {
      markSessionTakenOver();
      tabSessionIdRef.current = null;
      setAuth(null);
      setSidebarOpen(false);
      navigate("/login", {
        replace: true,
        state: notice ? { notice } : undefined,
      });
    };

    const syncLocalAuth = () => {
      if (pendingLoginRef.current) return;
      const nextAuth = readStoredAuth();
      setAuth(nextAuth);
      setSidebarOpen(false);
      if (!nextAuth) navigate("/login", { replace: true });
    };

    const syncAuthAcrossTabs = (event) => {
      if (pendingLoginRef.current) return;
      if (event.key !== "kinofSessionId" && event.key !== "kinofAuth") return;
      const nextSessionId = event.key === "kinofSessionId"
        ? event.newValue
        : peekStoredAuth()?.sessionId ?? null;
      const mine = tabSessionIdRef.current;

      if (mine && nextSessionId && mine !== nextSessionId) {
        kickThisTab("มีการเข้าสู่ระบบจากบัญชีอื่นในเบราว์เซอร์นี้");
        return;
      }
      if (mine && !nextSessionId) {
        kickThisTab();
        return;
      }
      if (!mine && nextSessionId && !isSessionTakenOver()) {
        const adopted = adoptBrowserSession();
        if (!adopted) return;
        tabSessionIdRef.current = adopted.sessionId;
        setAuth(adopted);
        setPage(isStaffAdmin(adopted.user?.userType) ? "dashboard" : "home");
        navigate("/", { replace: true });
      }
    };

    window.addEventListener("storage", syncAuthAcrossTabs);
    window.addEventListener(AUTH_CHANGED_EVENT, syncLocalAuth);
    return () => {
      window.removeEventListener("storage", syncAuthAcrossTabs);
      window.removeEventListener(AUTH_CHANGED_EVENT, syncLocalAuth);
    };
  }, [navigate]);

  useEffect(() => {
    setPage(role === "admin" ? "dashboard" : "home");
    setTrackingNav(null);
    setMyBookings([]);
    setProblemReports([]);
    setNavBadges({ invite: 0, monitor: 0, helpcenter: 0 });
  }, [auth?.user?.id, role]);

  useEffect(() => {
    if (bootstrapping || !auth?.accessToken || role !== "user") return;
    getMyBookings()
      .then((rows) => setMyBookings(rows.map(mapBookingRow)))
      .catch((error) => {
        setToast(error.message || "โหลดรายการจองไม่สำเร็จ กรุณาลองใหม่");
      });
  }, [auth?.accessToken, bootstrapping, role]);

  useEffect(() => {
    if (bootstrapping || !auth?.accessToken || location.pathname !== "/entry-otp") return;
    if (role === "user") setPage("entry-otp");
    navigate("/", { replace: true });
  }, [auth?.accessToken, bootstrapping, location.pathname, navigate, role]);

  useEffect(() => {
    if (bootstrapping || !auth?.accessToken) return;
    const load = role === "admin" ? getProblemReports : getMyProblemReports;
    load().then(setProblemReports).catch(() => setProblemReports([]));
  }, [auth?.accessToken, bootstrapping, role]);

  useEffect(() => {
    if (bootstrapping || !auth?.accessToken) return undefined;
    let active = true;
    const load = () => {
      getNavBadges()
        .then((data) => {
          if (!active) return;
          setNavBadges({
            invite: Number(data.invite) || 0,
            monitor: Number(data.monitor) || 0,
            helpcenter: Number(data.helpcenter) || 0,
          });
        })
        .catch(() => {
          if (active) setNavBadges({ invite: 0, monitor: 0, helpcenter: 0 });
        });
    };
    load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", load);
    };
  }, [auth?.accessToken, bootstrapping, role, page, badgeTick]);

  const withBadges = (items) => items.map((item) => ({
    ...item,
    badge: navBadges[item.key] || 0,
  }));

  const handleOtpRequired = (result) => {
    pendingLoginRef.current = result;
    tabSessionIdRef.current = null;
    clearStoredAuth();
    setAuth(null);
    setPendingLogin(result);
    sessionStorage.setItem("kinofPendingLogin", JSON.stringify(result));
    navigate("/login/otp");
  };
  const handleCancelPendingLogin = () => {
    pendingLoginRef.current = null;
    setPendingLogin(null);
    sessionStorage.removeItem("kinofPendingLogin");
    navigate("/login");
  };
  const handleVerified = (result) => {
    pendingLoginRef.current = null;
    setPendingLogin(null);
    sessionStorage.removeItem("kinofPendingLogin");
    const nextAuth = beginBrowserSession({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    });
    tabSessionIdRef.current = nextAuth.sessionId;
    setAuth(nextAuth);
    setPage(isStaffAdmin(result.user.userType) ? "dashboard" : "home");
    if (!result.user.faceEnrolled && !isStaffAdmin(result.user.userType)) {
      navigate("/register/face");
      return;
    }
    navigate("/");
  };

  const handleFaceEnrolled = (user) => {
    const nextAuth = { ...auth, user };
    storeAuth(nextAuth);
    setAuth(nextAuth);
  };

  const handleLogout = () => {
    logout().catch(() => {});
    clearStoredAuth();
    tabSessionIdRef.current = null;
    sessionStorage.removeItem("kinofPendingLogin");
    sessionStorage.removeItem("kinofAdminPage");
    sessionStorage.removeItem("kinofMonitorTab");
    setAuth(null);
    setSidebarOpen(false);
    setNavBadges({ invite: 0, monitor: 0, helpcenter: 0 });
    navigate("/login");
  };

  const handleSetPage = (nextPage) => {
    const allowedPages = role === "admin"
      ? [...ADMIN_NAV.map((item) => item.key), ...(isSuperAdmin(auth?.user?.userType) ? ["audit"] : [])]
      : USER_NAV.map((item) => item.key);
    if (!allowedPages.includes(nextPage)) {
      notify("บัญชีนี้ไม่มีสิทธิ์เปิดหน้านี้");
      return;
    }
    if (nextPage === "tracking") setTrackingNav(null);
    setPage(nextPage);
    if (role === "admin") sessionStorage.setItem("kinofAdminPage", nextPage);
  };

  const openTrackingRoom = (roomId) => {
    setTrackingNav({ roomId });
    setPage("tracking");
    sessionStorage.setItem("kinofAdminPage", "tracking");
  };

  const openTrackingSeat = ({ roomId, seatId }) => {
    setTrackingNav({ roomId, seatId });
    setPage("tracking");
    sessionStorage.setItem("kinofAdminPage", "tracking");
  };

  const appShell = (
    <div className="flex h-screen w-full overflow-hidden" style={{ background: BG_APP }}>
      <Sidebar
        items={role === "admin"
          ? withBadges([...ADMIN_NAV, ...(isSuperAdmin(auth?.user?.userType) ? [{ key: "audit", label: "Log แอดมิน", icon: ScrollText }] : [])])
          : withBadges(USER_NAV)}
        page={page}
        setPage={handleSetPage}
        roleLabel={role === "admin" ? "ระบบดูแลและจองห้องแล็บ" : "ระบบจองห้องแล็บ"}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 p-4 md:p-8 w-full min-w-0 h-full overflow-y-auto">
        <TopBar name={getDisplayName(auth?.user)} onMenuClick={() => setSidebarOpen(true)} />

        {role === "user" && page === "home" && (
          <UserHome setPage={handleSetPage} myBookings={myBookings} auth={auth} />
        )}
        {role === "user" && page === "book" && (
          <BookRoom
            key={`book-${auth?.user?.id}`}
            existingBookings={myBookings}
            onBookingCreated={(booking) => (
              setMyBookings((current) => [mapBookingRow(booking), ...current])
            )}
            auth={auth}
            notify={notify}
            setPage={handleSetPage}
          />
        )}
        {role === "user" && page === "invite" && (
          <Invitation
            key={`invite-${auth?.user?.id}`}
            notify={notify}
            onInvitationAccepted={(booking) => (
              setMyBookings((current) => [mapBookingRow(booking), ...current])
            )}
            onInvitationsChanged={() => setBadgeTick((n) => n + 1)}
          />
        )}
        {role === "user" && page === "entry-otp" && (
          <EntryOtp myBookings={myBookings} notify={notify} />
        )}
        {role === "user" && page === "profile" && <UserProfile auth={auth} setPage={handleSetPage} />}
        {role === "user" && page === "help" && (
          <UserHelp
            problemReports={problemReports}
            onSubmitted={(report) => setProblemReports((current) => [report, ...current])}
            onRefresh={() => getMyProblemReports().then(setProblemReports)}
            notify={notify}
          />
        )}

        {role === "admin" && page === "dashboard" && (
          <AdminDashboard
            problemReports={problemReports}
            setPage={handleSetPage}
            onOpenTrackingRoom={openTrackingRoom}
          />
        )}
        {role === "admin" && page === "tracking" && (
          <AdminTracking
            notify={notify}
            initialRoomId={trackingNav?.roomId}
            initialSeatId={trackingNav?.seatId}
            onOpenMonitor={() => handleSetPage("monitor")}
          />
        )}
        {role === "admin" && page === "monitor" && (
          <AdminMonitor
            notify={notify}
            onOpenTrackingSeat={openTrackingSeat}
            onBadgesChanged={() => setBadgeTick((n) => n + 1)}
          />
        )}
        {role === "admin" && page === "export" && <AdminExport notify={notify} />}
        {role === "admin" && page === "data" && <AdminData auth={auth} notify={notify} />}
        {role === "admin" && page === "audit" && isSuperAdmin(auth?.user?.userType) && (
          <AdminAuditLog notify={notify} />
        )}
        {role === "admin" && page === "helpcenter" && (
          <AdminHelpCenter
            problemReports={problemReports}
            setProblemReports={setProblemReports}
            notify={notify}
            onBadgesChanged={() => setBadgeTick((n) => n + 1)}
          />
        )}
      </div>

      <Toast text={toast} onDone={() => setToast("")} />
    </div>
  );

  const needsFaceEnroll = auth && !auth.user?.faceEnrolled && !isStaffAdmin(auth.user?.userType);
  // The Kiosk screen belongs to the lab door, not to a signed-in user, so it must render
  // without waiting for (or depending on) the session bootstrap.
  const isKiosk = location.pathname.startsWith("/kiosk/");

  if (bootstrapping && !isKiosk) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-gray-500" style={{ background: BG_APP }}>
        กำลังตรวจสอบเซสชัน...
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login/otp" element={auth ? <Navigate to="/" replace /> : pendingLogin ? <OtpVerify pendingLogin={pendingLogin} onVerified={handleVerified} onBack={handleCancelPendingLogin} /> : <Navigate to="/login" replace />} />
      <Route path="/kiosk/:roomId" element={<KioskEntry />} />
      <Route
        path="/login"
        element={auth ? <Navigate to="/" replace /> : <Login onOtpRequired={handleOtpRequired} />}
      />
      <Route
        path="/register"
        element={auth ? <Navigate to="/" replace /> : <Register onOtpRequired={handleOtpRequired} />}
      />
      <Route
        path="/forgot-password"
        element={auth ? <Navigate to="/" replace /> : <ForgotPassword />}
      />
      <Route
        path="/reset-password"
        element={auth ? <Navigate to="/" replace /> : <ResetPassword />}
      />
      <Route
        path="/register/face"
        element={auth ? <FaceEnrollIntro onLogout={handleLogout} /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/register/face/scan"
        element={
          auth ? (
            <FaceEnrollScan onFaceEnrolled={handleFaceEnrolled} />
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/register/face/success"
        element={auth ? <FaceEnrollSuccess /> : <Navigate to="/login" replace />}
      />
      <Route
        path="*"
        element={
          auth ? (
            needsFaceEnroll ? (
              <Navigate to="/register/face" replace />
            ) : (
              appShell
            )
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
    </Routes>
  );
}
