import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProjectProvider } from './context/ProjectContext';
import { RFIProvider } from './context/RFIContext';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import { Toaster } from 'react-hot-toast';
import LoginPage from './pages/LoginPage';
import ContractorDashboard from './pages/ContractorDashboard';
import DailyRFISheet from './pages/DailyRFISheet';
import ConsultantDashboard from './pages/ConsultantDashboard';
import ReviewQueue from './pages/ReviewQueue';

function ProtectedRoute({ children, allowedRole }) {
    const { user, loading } = useAuth();
    if (loading) return <LoadingSpinner message="Authenticating..." />;
    if (!user) return <Navigate to="/" replace />;
    if (allowedRole && user.role !== allowedRole) {
        return <Navigate to={user.role === 'contractor' ? '/contractor' : '/consultant'} replace />;
    }
    return children;
}

function AppRoutes() {
    const { user, loading } = useAuth();

    if (loading) return <div className="loading-screen">Loading...</div>;

    return (
        <Routes>
            <Route
                path="/"
                element={
                    user ? (
                        <Navigate to={user.role === 'contractor' ? '/contractor' : '/consultant'} replace />
                    ) : (
                        <LoginPage />
                    )
                }
            />
            <Route
                path="/contractor"
                element={
                    <ProtectedRoute allowedRole="contractor">
                        <ContractorDashboard />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/contractor/rfi-sheet"
                element={
                    <ProtectedRoute allowedRole="contractor">
                        <DailyRFISheet />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/consultant"
                element={
                    <ProtectedRoute allowedRole="consultant">
                        <ConsultantDashboard />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/consultant/review"
                element={
                    <ProtectedRoute allowedRole="consultant">
                        <ReviewQueue />
                    </ProtectedRoute>
                }
            />
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
                            <AppRoutes />
                        </RFIProvider>
                    </ProjectProvider>
                </AuthProvider>
            </BrowserRouter>
        </ErrorBoundary>
    );
}
