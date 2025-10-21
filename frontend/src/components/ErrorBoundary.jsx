// File: src/components/ErrorBoundary.jsx
import { Component } from "react";

class ErrorBoundary extends Component {
    state = { hasError: false, error: null };

    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-gray-900 via-indigo-900 to-gray-800 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-white/80 p-6 sm:p-8 shadow-xl backdrop-blur-md text-center">
                        <h2 className="text-2xl font-bold text-red-600 mb-4">Something Went Wrong</h2>
                        <p className="text-gray-600 mb-6">We encountered an error. Please try again or contact support.</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="px-6 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-colors duration-200"
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