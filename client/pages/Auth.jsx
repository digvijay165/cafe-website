import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useSite } from '../state';
import { api } from '../lib/api';
import { useTitle } from '../lib/hooks';
import { EmptyState, ErrorNotice, Field, Loading, SubmitButton } from '../components/ui';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Only follow ?next= to pages on this site.
function safeNext(params, fallback = '/') {
  const next = params.get('next') || '';
  return next.startsWith('/') && !next.startsWith('//') ? next : fallback;
}

// Shared form state: values, client-side checks, server field errors and the busy flag.
function useForm(initial, validate) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const bind = name => ({
    name, value: values[name], error: errors[name],
    onChange: event => {
      const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      setValues(current => ({ ...current, [name]: value }));
      if (errors[name]) setErrors(current => ({ ...current, [name]: undefined }));
    }
  });
  const submit = action => async event => {
    event.preventDefault();
    setError(null);
    const found = validate ? validate(values) : {};
    const clean = Object.fromEntries(Object.entries(found).filter(([, message]) => message));
    setErrors(clean);
    if (Object.keys(clean).length) {
      document.querySelector(`[name="${Object.keys(clean)[0]}"]`)?.focus();
      return;
    }
    setBusy(true);
    try {
      await action(values);
    } catch (failure) {
      setError(failure);
      setErrors(failure.fields || {});
    }
    setBusy(false);
  };
  return { values, bind, submit, error, busy, setValues };
}

function AuthCard({ title, children, footer }) {
  return (
    <div className="container py-5">
      <div className="auth-card mx-auto">
        <h1 className="page-title h2">{title}</h1>
        {children}
      </div>
      {footer && <p className="text-center mt-3 small">{footer}</p>}
    </div>
  );
}

export function Login() {
  useTitle('Log in');
  const { user, setUser } = useSite();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const form = useForm({ email: '', password: '' }, values => ({
    email: !EMAIL.test(values.email.trim()) && 'Enter the email you signed up with.',
    password: !values.password && 'Enter your password.'
  }));
  if (user) return <Navigate to={safeNext(params)} replace />;
  return (
    <AuthCard title="Welcome back" footer={<>New here? <Link to={`/signup${params.get('next') ? `?next=${encodeURIComponent(params.get('next'))}` : ''}`}>Create an account</Link></>}>
      {params.get('next') === '/checkout' && <p className="text-muted">Log in to choose a pickup time. Your basket is saved.</p>}
      <form noValidate onSubmit={form.submit(async values => {
        const { user: signedIn } = await api('/auth/login', { method: 'POST', body: values });
        navigate(safeNext(params), { replace: true });
        setUser(signedIn);
      })}>
        <Field label="Email" type="email" autoComplete="email" inputMode="email" {...form.bind('email')} />
        <Field label="Password" type="password" autoComplete="current-password" {...form.bind('password')} />
        <div className="text-end mb-3 small"><Link to="/forgot-password">Forgot your password?</Link></div>
        <ErrorNotice error={form.error} />
        <SubmitButton busy={form.busy} busyLabel="Logging in…">Log in</SubmitButton>
      </form>
    </AuthCard>
  );
}

export function Signup() {
  useTitle('Create an account');
  const { user, setUser } = useSite();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const form = useForm({ name: '', email: '', password: '', acceptTerms: false }, values => ({
    name: values.name.trim().length < 2 && 'Tell us your name (at least 2 characters).',
    email: !EMAIL.test(values.email.trim()) && 'Enter a valid email address, like name@example.com.',
    password: values.password.length < 8 && 'Use at least 8 characters.',
    acceptTerms: !values.acceptTerms && 'Please accept the terms to create an account.'
  }));
  if (user) return <Navigate to={safeNext(params)} replace />;
  const termsError = form.bind('acceptTerms').error;
  return (
    <AuthCard title="Create an account" footer={<>Already have one? <Link to="/login">Log in</Link></>}>
      <p className="text-muted">Order ahead, see your order status and get receipts by email.</p>
      <form noValidate onSubmit={form.submit(async values => {
        const { user: created } = await api('/auth/signup', { method: 'POST', body: values });
        navigate(`/welcome?next=${encodeURIComponent(safeNext(params, '/menu'))}`, { replace: true });
        setUser(created);
      })}>
        <Field label="Your name" autoComplete="name" {...form.bind('name')} hint="We call this out when your order is ready." />
        <Field label="Email" type="email" autoComplete="email" inputMode="email" {...form.bind('email')} />
        <Field label="Password" type="password" autoComplete="new-password" {...form.bind('password')} hint="At least 8 characters." />
        <div className="form-check mb-3">
          <input id="field-acceptTerms" type="checkbox" className={`form-check-input ${termsError ? 'is-invalid' : ''}`} name="acceptTerms"
            checked={form.values.acceptTerms} onChange={form.bind('acceptTerms').onChange} aria-describedby={termsError ? 'terms-error' : undefined} />
          <label className="form-check-label" htmlFor="field-acceptTerms">
            I agree to the <Link to="/terms" target="_blank">terms</Link> and <Link to="/privacy" target="_blank">privacy policy</Link>.
          </label>
          {termsError && <div id="terms-error" className="invalid-feedback">{termsError}</div>}
        </div>
        <ErrorNotice error={form.error} />
        <SubmitButton busy={form.busy} busyLabel="Creating your account…">Create account</SubmitButton>
      </form>
    </AuthCard>
  );
}

export function ForgotPassword() {
  useTitle('Reset your password');
  const [sent, setSent] = useState('');
  const form = useForm({ email: '' }, values => ({ email: !EMAIL.test(values.email.trim()) && 'Enter a valid email address.' }));
  if (sent) {
    return (
      <AuthCard title="Check your inbox">
        <p>If <strong>{sent}</strong> has an account, we have sent it a link to choose a new password. The link works for one hour.</p>
        <p className="small text-muted mb-0">Nothing after a few minutes? Check your spam folder, or <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setSent('')}>try again</button>.</p>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Reset your password" footer={<Link to="/login">Back to log in</Link>}>
      <p className="text-muted">Enter your email and we will send you a link to choose a new password.</p>
      <form noValidate onSubmit={form.submit(async values => {
        await api('/auth/forgot', { method: 'POST', body: values });
        setSent(values.email.trim());
      })}>
        <Field label="Email" type="email" autoComplete="email" inputMode="email" {...form.bind('email')} />
        <ErrorNotice error={form.error} />
        <SubmitButton busy={form.busy} busyLabel="Sending…">Send reset link</SubmitButton>
      </form>
    </AuthCard>
  );
}

export function ResetPassword() {
  useTitle('Choose a new password');
  const [params] = useSearchParams();
  const { setUser } = useSite();
  const navigate = useNavigate();
  const token = params.get('token') || '';
  const form = useForm({ password: '', confirm: '' }, values => ({
    password: values.password.length < 8 && 'Use at least 8 characters.',
    confirm: values.confirm !== values.password && 'The two passwords do not match.'
  }));
  if (!token) {
    return <AuthCard title="This link is incomplete"><p>Open the link from your email again, or <Link to="/forgot-password">request a new one</Link>.</p></AuthCard>;
  }
  return (
    <AuthCard title="Choose a new password">
      <form noValidate onSubmit={form.submit(async values => {
        const { user } = await api('/auth/reset', { method: 'POST', body: { token, password: values.password } });
        setUser(user);
        navigate('/account', { replace: true, state: { notice: 'Your password has been changed and other devices have been signed out.' } });
      })}>
        <Field label="New password" type="password" autoComplete="new-password" {...form.bind('password')} hint="At least 8 characters." />
        <Field label="Type it again" type="password" autoComplete="new-password" {...form.bind('confirm')} />
        <ErrorNotice error={form.error} />
        {form.error?.status === 400 && !form.error.fields && <p className="small"><Link to="/forgot-password">Request a new reset link</Link></p>}
        <SubmitButton busy={form.busy} busyLabel="Saving…">Save new password</SubmitButton>
      </form>
    </AuthCard>
  );
}

export function VerifyEmail() {
  useTitle('Confirm your email');
  const [params] = useSearchParams();
  const { setUser, user } = useSite();
  const [state, setState] = useState({ status: 'working' });
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    api('/auth/verify', { method: 'POST', body: { token: params.get('token') || '' } })
      .then(data => { setUser(current => (current && current.id === data.user.id ? data.user : current)); setState({ status: 'done', user: data.user }); })
      .catch(error => setState({ status: 'failed', error }));
  }, [params, setUser]);

  if (state.status === 'working') return <div className="container py-5"><Loading label="Confirming your email…" /></div>;
  if (state.status === 'failed') {
    return (
      <div className="container py-5">
        <EmptyState icon="⏳" title="That link did not work." action={<Link to={user ? '/account' : '/login'} className="btn btn-primary">{user ? 'Go to my account' : 'Log in'}</Link>}>
          {state.error.message}
        </EmptyState>
      </div>
    );
  }
  return (
    <div className="container py-5">
      <EmptyState icon="✅" title="Email confirmed. Thank you!" action={<Link to={state.user.onboarded ? '/menu' : '/welcome'} className="btn btn-primary">{state.user.onboarded ? 'Start an order' : 'Continue'}</Link>}>
        You can now order ahead for pickup.
      </EmptyState>
    </div>
  );
}

const STEPS = [
  ['1', 'Pick from the menu', 'Add drinks, bakes or lunch to your basket. Sold-out items are marked as the day goes on.'],
  ['2', 'Choose a pickup time', 'Slots run every 15 minutes while we are open. The earliest is about 15 minutes away.'],
  ['3', 'Collect and pay', 'Come to the counter, give your name or order number, and pay by cash, card or UPI.']
];

export function Welcome() {
  useTitle('Welcome');
  const { user, setUser } = useSite();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  if (user === undefined) return <div className="container py-5"><Loading /></div>;
  if (!user) return <Navigate to="/signup" replace />;
  const finish = async () => {
    setBusy(true);
    try { setUser((await api('/account/onboarded', { method: 'POST' })).user); } catch {}
    navigate(safeNext(params, '/menu'), { replace: true });
  };
  return (
    <div className="container py-5 narrow">
      <h1 className="page-title">Welcome to Little Lantern, {user.name.split(' ')[0]} 👋</h1>
      <p className="lead">Here is how ordering ahead works. It takes under a minute.</p>
      <ol className="list-unstyled onboarding my-4">
        {STEPS.map(([number, title, text]) => (
          <li key={number}><span className="step-number" aria-hidden="true">{number}</span><div><strong>{title}</strong><p className="mb-0 text-muted">{text}</p></div></li>
        ))}
      </ol>
      {!user.emailVerified && <div className="alert alert-info">📬 We sent a confirmation link to <strong>{user.email}</strong>. Open it before placing your first order.</div>}
      <button type="button" className="btn btn-primary btn-lg" onClick={finish} disabled={busy}>Got it, show me the menu</button>
    </div>
  );
}
