import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, message: error.message || 'Something went wrong' };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('ErrorBoundary caught:', error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page-card mx-auto max-w-xl text-center">
          <h2 className="mb-2 text-xl font-semibold text-[var(--color-danger)]">
            Module failed to load
          </h2>
          <p className="mb-4 text-[var(--color-muted)]">{this.state.message}</p>
          <button
            type="button"
            className="rounded-xl bg-[var(--color-brand)] px-4 py-2 font-medium text-black"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
