import React from 'react';

class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    componentDidCatch(error, errorInfo) {
        console.error('App Error:', error, errorInfo);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: '100vh',
                    padding: '2rem',
                    textAlign: 'center',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    backgroundColor: '#FAFAFA',
                }}>
                    <div style={{
                        background: '#FEF2F2',
                        border: '1px solid #FCA5A5',
                        borderRadius: '12px',
                        padding: '2.5rem',
                        maxWidth: '480px',
                        width: '100%',
                    }}>
                        <h2 style={{ color: '#DC2626', fontSize: '1.5rem', marginBottom: '0.75rem' }}>
                            Something went wrong
                        </h2>
                        <p style={{ color: '#4B5563', marginBottom: '1.5rem', lineHeight: '1.6' }}>
                            An unexpected error occurred. Please refresh the page to try again.
                            If the problem persists, please contact support.
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                padding: '0.6rem 1.5rem',
                                background: '#111827',
                                color: 'white',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontWeight: '600',
                                fontSize: '0.9rem',
                            }}
                        >
                            Reload Page
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
