export default function LoadingSpinner({ message = 'Loading...' }) {
    return (
        <div className="loading-spinner-container">
            <div className="loading-spinner"></div>
            <p className="loading-text">{message}</p>
        </div>
    );
}
