import { Component, type ReactNode } from 'react';
import { Icon } from './Icons';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="w-12 h-12 rounded-xl bg-danger/10 flex items-center justify-center mx-auto mb-4">
              <Icon name="alertTriangle" className="w-6 h-6 text-danger" />
            </div>
            <h2 className="text-lg font-semibold text-dark-heading mb-2">
              {this.props.fallbackTitle || 'Something went wrong'}
            </h2>
            <p className="text-sm text-dark-text mb-4">
              An unexpected error occurred. Please try again.
            </p>
            {this.state.error && (
              <p className="text-xs text-dark-text/50 mb-4 font-mono bg-dark-surface p-2 rounded-lg">
                {this.state.error.message}
              </p>
            )}
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary-hover transition-colors"
              >
                Try Again
              </button>
              <a
                href="/"
                className="px-4 py-2 rounded-lg border border-dark-border text-dark-text text-sm hover:bg-dark-surface transition-colors"
              >
                Go Home
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
