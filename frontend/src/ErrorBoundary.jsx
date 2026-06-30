import { Component } from 'react';

/**
 * Catches render-time errors so one broken panel/component shows a small
 * fallback instead of unmounting the whole app to a blank white screen.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface in console for debugging; never crash the tree.
    console.error('ErrorBoundary caught:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback(this.state.error, this.reset);
      return (
        <div style={{ padding: 24, margin: 16, borderRadius: 12, background: '#fef2f2', color: '#991b1b', fontSize: 14, lineHeight: 1.5 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Something went wrong rendering this view.</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{String(this.state.error?.message || this.state.error)}</div>
          <button onClick={this.reset} style={{ marginTop: 12, padding: '6px 12px', borderRadius: 8, border: '1px solid #fca5a5', background: '#fff', color: '#991b1b', cursor: 'pointer', fontSize: 12 }}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
