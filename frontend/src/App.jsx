import React, { useEffect, useState } from "react";
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
import { getMe, logout, readStoredAuth, storeAuth } from "./api/auth";
import { BG_APP } from "./theme";
import { getDisplayName } from "./utils/displayName";
import { isStaffAdmin, isSuperAdmin } from "./utils/roles";

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
  const [bootstrapping, setBootstrapping] = useState(() => Boolean(readStoredAuth()));
  const role = isStaffAdmin(auth?.user?.userType) ? "admin" : "user";
  const [page, setPage] = useState(() => (role === "admin" ? "dashboard" : "home"));
  const [toast, setToast] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [trackingNav, setTrackingNav] = useState(null);
  const notify = (t) => setToast(t);

  const [myBookings, setMyBookings] = useState([]);
  const [problemReports, setProblemReports] = useState([]);

  useEffect(() => {
    let active = true;
    const storedAuth = readStoredAuth();
    if (!storedAuth?.accessToken && !storedAuth?.refreshToken) {
      sessionStorage.removeItem("kinofAuth");
      setAuth(null);
      setBootstrapping(false);
      return () => {
        active = false;
      };
    }

    getMe()
      .then((user) => {
        if (!active) return;
        const currentAuth = readStoredAuth();
        if (!currentAuth?.accessToken) {
          throw new Error("เซสชันหมดอายุ");
        }
        const nextAuth = { ...currentAuth, user };
        storeAuth(nextAuth);
        setAuth(nextAuth);
        if (isStaffAdmin(user.userType)) {
          setPage("dashboard");
        }
      })
      .catch(() => {
        if (!active) return;
        sessionStorage.removeItem("kinofAuth");
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
    if (bootstrapping || !auth?.accessToken || role !== "user") return;
    getMyBookings()
      .then((rows) => setMyBookings(rows.map(mapBookingRow)))
      .catch(() => {});
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

  const handleVerified = (result) => {
    const nextAuth = {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: result.user,
    };
    storeAuth(nextAuth);
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
    sessionStorage.removeItem("kinofAuth");
    setAuth(null);
    setSidebarOpen(false);
    navigate("/login");
  };

  const handleSetPage = (nextPage) => {
    if (nextPage === "tracking") setTrackingNav(null);
    setPage(nextPage);
  };

  const openTrackingRoom = (roomId) => {
    setTrackingNav({ roomId });
    setPage("tracking");
  };

  const openTrackingSeat = ({ roomId, seatId }) => {
    setTrackingNav({ roomId, seatId });
    setPage("tracking");
  };

  const appShell = (
    <div className="flex min-h-screen w-full" style={{ background: BG_APP }}>
      <Sidebar
        items={role === "admin"
          ? [...ADMIN_NAV, ...(isSuperAdmin(auth?.user?.userType) ? [{ key: "audit", label: "Log แอดมิน", icon: ScrollText }] : [])]
          : USER_NAV}
        page={page}
        setPage={handleSetPage}
        roleLabel={role === "admin" ? "ระบบดูแลและจองห้องแล็บ" : "ระบบจองห้องแล็บ"}
        onLogout={handleLogout}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 p-4 md:p-8 w-full min-w-0">
        <TopBar name={getDisplayName(auth?.user)} onMenuClick={() => setSidebarOpen(true)} />

        {role === "user" && page === "home" && (
          <UserHome setPage={handleSetPage} myBookings={myBookings} auth={auth} />
        )}
        {role === "user" && page === "book" && (
          <BookRoom
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
            notify={notify}
            onInvitationAccepted={(booking) => (
              setMyBookings((current) => [mapBookingRow(booking), ...current])
            )}
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
            onOpenMonitor={() => setPage("monitor")}
          />
        )}
        {role === "admin" && page === "monitor" && (
          <AdminMonitor
            notify={notify}
            onOpenTrackingSeat={openTrackingSeat}
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
      <Route path="/kiosk/:roomId" element={<KioskEntry />} />
      <Route
        path="/login"
        element={auth ? <Navigate to="/" replace /> : <Login onAuthenticated={handleVerified} />}
      />
      <Route
        path="/register"
        element={auth ? <Navigate to="/" replace /> : <Register onAuthenticated={handleVerified} />}
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
