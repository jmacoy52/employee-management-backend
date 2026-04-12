import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log the error to console and state
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // You can also log the error to an error reporting service
    this.logErrorToService(error, errorInfo);
  }

  logErrorToService = (error, errorInfo) => {
    // Log to error reporting service
    try {
      const errorData = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      // Send to error logging endpoint
      fetch('/api/errors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(errorData)
      }).catch(err => {
        console.error('Failed to log error:', err);
      });
    } catch (e) {
      console.error('Error logging failed:', e);
    }
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      // Custom error UI
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="max-w-md w-full p-6">
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 2.502-3.181V8a4 4 0 00-8 0V4a4 4 0 008 0v4.01c0 1.514 1.962 3.181 2.502 3.181M12 17h.01" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Something went wrong
              </h2>
              
              <p className="text-gray-600 mb-6">
                We're sorry, but something unexpected happened. Our team has been notified.
              </p>

              {process.env.NODE_ENV === 'development' && (
                <details className="mb-6 text-left">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                    Technical Details
                  </summary>
                  <div className="mt-2 p-4 bg-gray-100 rounded text-xs font-mono">
                    <p className="font-semibold mb-2">Error:</p>
                    <pre className="whitespace-pre-wrap break-all">
                      {this.state.error?.message}
                    </pre>
                    {this.state.error?.stack && (
                      <>
                        <p className="font-semibold mt-4 mb-2">Stack Trace:</p>
                        <pre className="whitespace-pre-wrap break-all">
                          {this.state.error.stack}
                        </pre>
                      </>
                    )}
                  </div>
                </details>
              )}

              <div className="flex flex-col sm:flex-row gap-4">
                <button
                  onClick={this.handleRetry}
                  className="flex-1 bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 bg-gray-200 text-gray-900 px-4 py-2 rounded-md hover:bg-gray-300 transition-colors"
                >
                  Reload Page
                </button>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-200">
                <p className="text-sm text-gray-500">
                  If this problem persists, please contact our support team at{' '}
                  <a href="mailto:support@emplocore.com" className="text-primary-600 hover:text-primary-700">
                    support@emplocore.com
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // When there's no error, render children normally
    return this.props.children;
  }
}

export default ErrorBoundary;
