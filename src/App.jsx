import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProjectProvider } from './context/ProjectContext';
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
import { useProject } from './context/ProjectContext';

function ProtectedRoute({ children, allowedRoles }) {
    const { user, loading } = useAuth();
    if (loading) return <LoadingSpinner />;
    if (!user) return <Navigate to="/" replace />;
    if (allowedRoles && !allowedRoles.includes(user.role)) {
        const home = user.role === 'admin' ? '/admin' : user.role === 'contractor' ? '/contractor' : user.role === 'consultant' ? '/consultant' : '/';
        return <Navigate to={home} replace />;
    }
    return children;
}

function AppRoutes() {
    const { user, loading } = useAuth();
    const { projects, loadingProjects } = useProject();

    if (loading || (loadingProjects && projects.length === 0)) {
        return (
            <LoadingSpinner />
        );
    }

    return (
        <Routes>
            <Route
                path="/"
                element={
                    user ? (
                        user.role === 'pending' || user.role === 'rejected' ? (
                            <PendingApproval />
                        ) : (
                            <Navigate to={
                                user.role === 'admin' ? '/admin' :
                                    user.role === 'contractor' ? '/contractor' : user.role === 'consultant' ? '/consultant' : '/admin'
                            } replace />
                        )
                    ) : (
                        <LoginPage />
                    )
                }
            />
            <Route
                path="/contractor"
                element={
                    <ProtectedRoute allowedRoles={['contractor']}>
                        <ContractorDashboard />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/contractor/rfi-sheet"
                element={
                    <ProtectedRoute allowedRoles={['contractor']}>
                        <DailyRFISheet />
                    </ProtectedRoute>
                }
            />

                <Route
                    path="/contractor/summary"
                    element={
                        <ProtectedRoute allowedRoles={['contractor']}>
                            <SummaryPage />
                        </ProtectedRoute>
                    }
                />
            <Route
                path="/consultant"
                element={
                    <ProtectedRoute allowedRoles={['consultant']}>
                        <ConsultantDashboard />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/consultant/review"
                element={
                    <ProtectedRoute allowedRoles={['consultant']}>
                        <ReviewQueue />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/consultant/rejection-journey"
                element={
                    <ProtectedRoute allowedRoles={['consultant']}>
                        <RejectionJourneyBoard />
                    </ProtectedRoute>
                }
            />
                <Route
                    path="/consultant/summary"
                    element={
                        <ProtectedRoute allowedRoles={['consultant']}>
                            <SummaryPage />
                        </ProtectedRoute>
                    }
                />
            <Route
                path="/admin"
                element={
                    <ProtectedRoute allowedRoles={['admin']}>
                        <AdminDashboard />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/users"
                element={
                    <ProtectedRoute allowedRoles={['admin']}>
                        <UsersPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/export-format"
                element={
                    <ProtectedRoute allowedRoles={['admin']}>
                        <AdminFormatDesigner />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/registered-devices"
                element={
                    <ProtectedRoute allowedRoles={['admin']}>
                        <RegisteredDevicesPage />
                    </ProtectedRoute>
                }
            />
            <Route path="/notification-open" element={<NotificationRedirect />} />
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
