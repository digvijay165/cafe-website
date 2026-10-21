import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useSite } from '../state';
import { api } from '../lib/api';
import { useLoad, useTitle } from '../lib/hooks';
import { clock, money } from '../lib/format';
import { EmptyState, ErrorNotice, Field, Loading, SubmitButton } from '../components/ui';

export default function Checkout() {
  useTitle('Checkout');
  const { user, cart, menu, loadMenu } = useSite();
  const navigate = useNavigate();
  const slots = useLoad(() => api('/pickup-slots'), []);
  const [pickupAt, setPickupAt] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const groups = useMemo(() => {
    const byDay = new Map();
    for (const slot of slots.data?.slots || []) {
      if (!byDay.has(slot.day)) byDay.set(slot.day, []);
      byDay.get(slot.day).push(slot);
    }
    return [...byDay];
  }, [slots.data]);

  if (user === undefined || !menu) return <div className="container py-5"><Loading /></div>;
  if (!user) return <Navigate to="/login?next=/checkout" replace />;
  if (!cart.count) return <Navigate to="/cart" replace />;

  if (!user.emailVerified) {
    return (
      <div className="container py-5">
        <EmptyState icon="📬" title="One quick step first." action={<Link to="/cart" className="btn btn-outline-primary">Back to basket</Link>}>
          Please confirm your email address before ordering, so we can send your receipt and reach you about your order. We sent a link to {user.email}; you can resend it from the banner above.
        </EmptyState>
      </div>
    );
  }

  const submit = async event => {
    event.preventDefault();
    setError(null);
    if (!pickupAt) { setFieldErrors({ pickupAt: 'Choose when you would like to pick up.' }); return; }
    setFieldErrors({});
    setBusy(true);
    try {
      const { order } = await api('/orders', {
        method: 'POST',
        body: { items: cart.lines.map(line => ({ id: line.id, quantity: line.quantity })), pickupAt, notes }
      });
      cart.clear();
      navigate(`/orders/${order.id}`, { state: { justPlaced: true } });
    } catch (failure) {
      setError(failure);
      setFieldErrors(failure.fields || {});
      if (failure.status === 409) loadMenu(); // refresh sold-out flags
      if (failure.fields?.pickupAt) { setPickupAt(''); slots.retry(); }
      setBusy(false);
    }
  };

  return (
    <div className="container py-5 narrow">
      <h1 className="page-title">Checkout</h1>
      <div className="row g-4">
        <div className="col-md-7">
          <form onSubmit={submit} noValidate>
            {slots.loading && !slots.data && <Loading label="Finding pickup times" />}
            <ErrorNotice error={slots.error} retry={slots.retry} />
            {slots.data && !slots.data.slots.length && (
              <div className="alert alert-info">We are not taking online orders for the next few days. Please call us instead.</div>
            )}
            {groups.length > 0 && (
              <Field as="select" label="Pickup time" name="pickupAt" value={pickupAt} error={fieldErrors.pickupAt}
                hint={slots.data.openNow ? 'The earliest slot is about 15 minutes from now.' : 'We are closed right now, so the first slot is just after we open.'}
                onChange={event => setPickupAt(event.target.value)} required>
                <option value="">Choose a time…</option>
                {groups.map(([day, daySlots]) => (
                  <optgroup key={day} label={day}>
                    {daySlots.map(slot => <option key={slot.at} value={slot.at}>{day}, {clock(slot.time)}</option>)}
                  </optgroup>
                ))}
              </Field>
            )}
            <Field as="textarea" label="Anything we should know? (optional)" name="notes" rows={3} maxLength={300} value={notes}
              onChange={event => setNotes(event.target.value)} placeholder="Oat milk, extra hot, allergies…" hint={`${300 - notes.length} characters left`} />
            <ErrorNotice error={error} />
            <SubmitButton busy={busy} busyLabel="Placing your order…" disabled={!groups.length}>Place order · {money(cart.total)}</SubmitButton>
            <p className="small text-muted mt-2 mb-0">Pay at the counter when you collect. By ordering you agree to our <Link to="/terms">terms</Link>.</p>
          </form>
        </div>
        <div className="col-md-5">
          <div className="card-soft">
            <h2 className="h6 text-uppercase text-muted">Your order</h2>
            <ul className="list-unstyled mb-3">
              {cart.lines.map(line => (
                <li key={line.id} className="d-flex justify-content-between py-1">
                  <span>{line.quantity} × {line.item.name}</span>
                  <span>{money(line.item.priceCents * line.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="d-flex justify-content-between border-top pt-2 fw-semibold"><span>Total</span><span>{money(cart.total)}</span></div>
            <Link to="/cart" className="small d-inline-block mt-3">Edit basket</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
