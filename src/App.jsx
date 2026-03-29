import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProjectProvider, useProject } from './context/ProjectContext';
import { RFIProvider } from './context/RFIContext';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import AppExperienceEnhancements from './components/AppExperienceEnhancements';
import { Toaster } from 'react-hot-toast';
import LoginPage from './pages/LoginPage';
import ContractorDashboard from './pages/ContractorDashboard';
import DailyRFISheet from './pages/DailyRFISheet';
import ConsultantDashboard from './pages/ConsultantDashboard';
import ReviewQueue from './pages/ReviewQueue';
import RejectionJourneyBoard from './pages/RejectionJourneyBoard';
import AdminDashboard from './pages/AdminDashboard';
import UsersPage from './pages/UsersPage';
import AdminFormatDesigner from './pages/AdminFormatDesigner';
import PendingApproval from './pages/PendingApproval';
import SummaryPage from './pages/SummaryPage';
import RegisteredDevicesPage from './pages/RegisteredDevicesPage';
import NotificationRedirect from './pages/NotificationRedirect';
import SubscriptionBlocked from './pages/SubscriptionBlocked';
import SettingsPage from './pages/SettingsPage';
import ProfilePage from './pages/ProfilePage';
import SubscriptionPage from './pages/SubscriptionPage';
import SupportPage from './pages/SupportPage';
import SubscriptionGuard from './components/SubscriptionGuard';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';

function ProtectedRoute({ children, allowedRoles }) {
    const { user, authResolved } = useAuth();
    if (!authResolved) return <LoadingSpinner />;
    if (!user) return <Navigate to="/" replace />;
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        const home = user.role === 'admin' ? '/admin' : user.role === 'contractor' ? '/contractor' : user.role === 'consultant' ? '/consultant' : '/';
        return <Navigate to={home} replace />;
    }
    return children;
}

function AppRoutes() {
    const { user, authResolved } = useAuth();
    const { projects, projectsResolved } = useProject();

    // ── LOADING GATE ─────────────────────────────────────────────────────
    // If we have a cached user (authResolved=false) but haven't verified them yet, 
    // or if we are still fetching projects for a newly logged-in user, show the spinner.
    // For BRAND NEW users, authResolved will be true instantly on mount.
    if (!authResolved || (user && !projectsResolved)) {
        return <LoadingSpinner />;
    }

    return (
        <Routes>
            <Route path="/" element={user ? (
                user.role === 'pending' || user.role === 'rejected' ? <PendingApproval /> :
                <Navigate to={user.role === 'admin' ? '/admin' : user.role === 'contractor' ? '/contractor' : '/consultant'} replace />
            ) : <LoginPage />} />
            <Route path="/contractor" element={<ProtectedRoute allowedRoles={['contractor']}><SubscriptionGuard><ContractorDashboard /></SubscriptionGuard></ProtectedRoute>} />
            <Route path="/contractor/rfi-sheet" element={<ProtectedRoute allowedRoles={['contractor']}><SubscriptionGuard><DailyRFISheet /></SubscriptionGuard></ProtectedRoute>} />
            <Route path="/contractor/summary" element={<ProtectedRoute allowedRoles={['contractor']}><SubscriptionGuard><SummaryPage /></SubscriptionGuard></ProtectedRoute>} />
            <Route path="/consultant" element={<ProtectedRoute allowedRoles={['consultant']}><SubscriptionGuard><ConsultantDashboard /></SubscriptionGuard></ProtectedRoute>} />
            <Route path="/consultant/review" element={<ProtectedRoute allowedRoles={['consultant']}><SubscriptionGuard><ReviewQueue /></SubscriptionGuard></ProtectedRoute>} />
            <Route path="/consultant/rejection-journey" element={<ProtectedRoute allowedRoles={['consultant']}><SubscriptionGuard><RejectionJourneyBoard /></SubscriptionGuard></ProtectedRoute>} />
            <Route path="/consultant/summary" element={<ProtectedRoute allowedRoles={['consultant']}><SubscriptionGuard><SummaryPage /></SubscriptionGuard></ProtectedRoute>} />
            <Route path="/admin" element={<ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute allowedRoles={['admin']}><UsersPage /></ProtectedRoute>} />
            <Route path="/admin/export-format" element={<ProtectedRoute allowedRoles={['admin']}><AdminFormatDesigner /></ProtectedRoute>} />
            <Route path="/admin/registered-devices" element={<ProtectedRoute allowedRoles={['admin']}><RegisteredDevicesPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
            <Route path="/subscription" element={<ProtectedRoute><SubscriptionPage /></ProtectedRoute>} />
            <Route path="/support" element={<ProtectedRoute><SupportPage /></ProtectedRoute>} />
            <Route path="/project-blocked" element={<SubscriptionBlocked />} />
            <Route path="/notification-open" element={<NotificationRedirect />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default function App() {
    return (
        <ErrorBoundary>
            <BrowserRouter>
                <AuthProvider>
                    <ProjectProvider>
                        <RFIProvider>
                            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
                            <AppExperienceEnhancements />
                            <AppRoutes />
                        </RFIProvider>
                    </ProjectProvider>
                </AuthProvider>
            </BrowserRouter>
        </ErrorBoundary>
    );
}
