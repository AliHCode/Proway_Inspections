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
import AdminDashboard from './pages/AdminDashboard';
import OnboardingWizard from './pages/OnboardingWizard';
import { useProject } from './context/ProjectContext';

function ProtectedRoute({ children, allowedRoles }) {
    const { user, loading } = useAuth();
    if (loading) return <LoadingSpinner message="Authenticating..." />;
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

    if (loading || loadingProjects) return <LoadingSpinner message="Setting up your workspace..." />;

    // Redirect to onboarding if user has no projects
    const hasNoProjects = projects.length === 0;
    const isLoginPage = window.location.pathname === '/';
    const isOnboardingPage = window.location.pathname === '/onboarding';

    if (user && hasNoProjects && !isOnboardingPage && user.role !== 'admin') {
        return <Navigate to="/onboarding" replace />;
    }

    return (
        <Routes>
            <Route
                path="/"
                element={
                    user ? (
                        <Navigate to={
                            user.role === 'admin' ? '/admin' :
                                user.role === 'contractor' ? '/contractor' : user.role === 'consultant' ? '/consultant' : '/'
                        } replace />
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
                path="/admin"
                element={
                    <ProtectedRoute allowedRoles={['admin']}>
                        <AdminDashboard />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/onboarding"
                element={
                    <ProtectedRoute allowedRoles={['contractor', 'consultant']}>
                        {projects.length > 0 ? (
                            <Navigate to="/" replace />
                        ) : (
                            <OnboardingWizard />
                        )}
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
