// Small building blocks shared by every page: loading, empty and error states, and form fields.
import { Component } from 'react';
import { Link } from 'react-router-dom';
import { reportError } from '../lib/telemetry';
import { clock } from '../lib/format';

export function Loading({ label = 'Loading…', lines = 0 }) {
  if (lines) {
    return (
      <div aria-busy="true" aria-label={label}>
        {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton mb-3" style={{ height: 76 }} />)}
      </div>
    );
  }
  return (
    <div className="d-flex align-items-center justify-content-center gap-2 py-5 text-muted" role="status">
      <span className="spinner-border spinner-border-sm" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ icon = '☕', title, children, action }) {
  return (
    <div className="empty-state text-center py-5 px-3">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h2 className="h4 mt-3">{title}</h2>
      {children && <p className="text-muted mx-auto" style={{ maxWidth: 420 }}>{children}</p>}
      {action}
    </div>
  );
}

export function ErrorNotice({ error, retry, className = '' }) {
  if (!error) return null;
  return (
    <div className={`alert alert-danger d-flex flex-wrap align-items-center gap-2 ${className}`} role="alert">
      <span className="me-auto">{error.message || String(error)}</span>
      {retry && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => retry()}>Try again</button>}
    </div>
  );
}

export function Field({ label, name, error, hint, as = 'input', children, ...props }) {
  const Tag = as;
  const id = `field-${name}`;
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">{label}</label>
      <Tag id={id} name={name} className={`${as === 'select' ? 'form-select' : 'form-control'} ${error ? 'is-invalid' : ''}`} aria-invalid={Boolean(error)} aria-describedby={describedBy} {...props}>
        {children}
      </Tag>
      {error && <div id={`${id}-error`} className="invalid-feedback">{error}</div>}
      {hint && !error && <div id={`${id}-hint`} className="form-text">{hint}</div>}
    </div>
  );
}

export function SubmitButton({ busy, children, busyLabel = 'Please wait…', className = 'btn btn-primary w-100', ...props }) {
  return (
    <button type="submit" className={className} disabled={busy} {...props}>
      {busy ? <><span className="spinner-border spinner-border-sm me-2" aria-hidden="true" />{busyLabel}</> : children}
    </button>
  );
}

const STATUS = {
  received: ['Received', 'text-bg-secondary'],
  preparing: ['Being made', 'text-bg-warning'],
  ready: ['Ready to collect', 'text-bg-success'],
  collected: ['Collected', 'text-bg-light border'],
  cancelled: ['Cancelled', 'text-bg-danger']
};
export const statusLabel = status => STATUS[status]?.[0] || status;
export function StatusBadge({ status }) {
  const [label, style] = STATUS[status] || [status, 'text-bg-secondary'];
  return <span className={`badge rounded-pill ${style}`}>{label}</span>;
}

export function OpenBadge({ hours, className = '' }) {
  if (!hours) return null;
  if (hours.openNow) return <span className={`open-badge open ${className}`}><span className="dot" />Open now · until {clock(hours.closesAt)}</span>;
  const next = hours.nextOpen;
  return <span className={`open-badge closed ${className}`}><span className="dot" />Closed{next ? ` · opens ${next.day} at ${clock(next.opens)}` : ''}</span>;
}

export const DIET_LABELS = { vegan: 'Vegan', 'gluten-free': 'Gluten free' };

// Catches render errors so one broken page does not blank the whole site, and reports them.
export class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { reportError(error, info.componentStack); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="container py-5">
        <EmptyState icon="🫖" title="Something spilled." action={<Link to="/" className="btn btn-primary" onClick={() => this.setState({ error: null })}>Back to the home page</Link>}>
          This page hit an unexpected error. We have been told about it. Reloading usually helps.
        </EmptyState>
      </div>
    );
  }
}
