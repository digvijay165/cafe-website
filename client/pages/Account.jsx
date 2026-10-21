import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSite } from '../state';
import { api } from '../lib/api';
import { useTitle } from '../lib/hooks';
import { ErrorNotice, Field, SubmitButton } from '../components/ui';
import RequireUser from '../components/RequireUser';

function useAction() {
  const [state, setState] = useState({ busy: false, error: null, done: '' });
  const run = (action, done) => async event => {
    event.preventDefault();
    setState({ busy: true, error: null, done: '' });
    try { await action(); setState({ busy: false, error: null, done }); } catch (error) { setState({ busy: false, error, done: '' }); }
  };
  return [state, run];
}

function Profile() {
  const { user, setUser } = useSite();
  const [values, setValues] = useState({ name: user.name, phone: user.phone });
  const [state, run] = useAction();
  const fields = state.error?.fields || {};
  return (
    <form className="card-soft mb-4" noValidate onSubmit={run(async () => setUser((await api('/account', { method: 'PATCH', body: values })).user), 'Saved.')}>
      <h2 className="h5">Your details</h2>
      <Field label="Name" name="name" autoComplete="name" value={values.name} error={fields.name} onChange={event => setValues({ ...values, name: event.target.value })} />
      <Field label="Phone (optional)" name="phone" type="tel" autoComplete="tel" value={values.phone} error={fields.phone} hint="Only used if we need to reach you about an order."
        onChange={event => setValues({ ...values, phone: event.target.value })} />
      <p className="small text-muted">Email: {user.email} {user.emailVerified ? '· confirmed ✓' : '· not confirmed yet'}</p>
      {!fields.name && !fields.phone && <ErrorNotice error={state.error} />}
      {state.done && <div className="text-success small mb-2" role="status">{state.done}</div>}
      <SubmitButton busy={state.busy} className="btn btn-primary">Save details</SubmitButton>
    </form>
  );
}

function ChangePassword() {
  const [values, setValues] = useState({ current: '', next: '' });
  const [state, run] = useAction();
  const fields = state.error?.fields || {};
  return (
    <form className="card-soft mb-4" noValidate onSubmit={run(async () => {
      await api('/account/password', { method: 'POST', body: values });
      setValues({ current: '', next: '' });
    }, 'Password changed. Other devices have been signed out.')}>
      <h2 className="h5">Change password</h2>
      <Field label="Current password" name="current" type="password" autoComplete="current-password" value={values.current} error={fields.current} onChange={event => setValues({ ...values, current: event.target.value })} />
      <Field label="New password" name="next" type="password" autoComplete="new-password" value={values.next} error={fields.next} hint="At least 8 characters." onChange={event => setValues({ ...values, next: event.target.value })} />
      {!fields.current && !fields.next && <ErrorNotice error={state.error} />}
      {state.done && <div className="text-success small mb-2" role="status">{state.done}</div>}
      <SubmitButton busy={state.busy} className="btn btn-outline-primary">Change password</SubmitButton>
    </form>
  );
}

function DeleteAccount() {
  const { setUser, cart } = useSite();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [state, run] = useAction();
  return (
    <section className="card-soft danger-zone">
      <h2 className="h5">Delete account</h2>
      <p className="small">This permanently deletes your account and your order history. It cannot be undone.</p>
      {!open ? <button type="button" className="btn btn-outline-danger" onClick={() => setOpen(true)}>Delete my account…</button> : (
        <form noValidate onSubmit={run(async () => {
          await api('/account', { method: 'DELETE', body: { password } });
          cart.clear();
          setUser(null);
          navigate('/', { replace: true });
        })}>
          <Field label="Enter your password to confirm" name="delete-password" type="password" autoComplete="current-password" value={password}
            error={state.error?.fields?.password} onChange={event => setPassword(event.target.value)} />
          {!state.error?.fields && <ErrorNotice error={state.error} />}
          <div className="d-flex gap-2">
            <SubmitButton busy={state.busy} className="btn btn-danger" busyLabel="Deleting…" disabled={!password}>Delete forever</SubmitButton>
            <button type="button" className="btn btn-link" onClick={() => { setOpen(false); setPassword(''); }}>Keep my account</button>
          </div>
        </form>
      )}
    </section>
  );
}

function AccountPage() {
  useTitle('Your account');
  const { logout } = useSite();
  const { state } = useLocation();
  const navigate = useNavigate();
  return (
    <div className="container py-5 narrow">
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <h1 className="page-title mb-0">Your account</h1>
        <button type="button" className="btn btn-outline-secondary" onClick={async () => { await logout(); navigate('/'); }}>Log out</button>
      </div>
      {state?.notice && <div className="alert alert-success">{state.notice}</div>}
      <p><Link to="/orders">See my orders →</Link></p>
      <Profile />
      <ChangePassword />
      <DeleteAccount />
    </div>
  );
}

export default function Account() {
  return <RequireUser><AccountPage /></RequireUser>;
}
