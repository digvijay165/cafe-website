// Owner dashboard: sales, full order history, menu editing, opening hours, café details, team
// roles and customers. Staff use the simpler /staff board.
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useLoad, useTitle } from '../lib/hooks';
import { clock, dateTime, money, pickupTime } from '../lib/format';
import { useSite } from '../state';
import { DIET_LABELS, EmptyState, ErrorNotice, Field, Loading, StatusBadge, SubmitButton, statusLabel } from '../components/ui';
import RequireUser from '../components/RequireUser';

const STATUSES = ['received', 'preparing', 'ready', 'collected', 'cancelled'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Small helper for forms that save to the API: busy flag, error, field errors and a saved notice.
function useSave() {
  const [state, setState] = useState({ busy: false, error: null, saved: '' });
  const save = async (action, saved = 'Saved.') => {
    setState({ busy: true, error: null, saved: '' });
    try {
      const result = await action();
      setState({ busy: false, error: null, saved });
      return result;
    } catch (error) {
      setState({ busy: false, error, saved: '' });
      return undefined;
    }
  };
  return { ...state, fields: state.error?.fields || {}, save, clear: () => setState({ busy: false, error: null, saved: '' }) };
}

function Saved({ text }) {
  return text ? <span className="text-success small ms-2" role="status">✓ {text}</span> : null;
}

// ---- Overview --------------------------------------------------------------------------------

function Overview() {
  const [days, setDays] = useState(30);
  const data = useLoad(() => api(`/owner/overview?days=${days}`), [days]);
  if (data.loading && !data.data) return <Loading lines={3} />;
  if (data.error) return <ErrorNotice error={data.error} retry={data.retry} />;
  const { totals, today, byDay, topItems, byStatus } = data.data;
  const max = Math.max(1, ...byDay.map(day => day.revenue));
  const tiles = [
    ['Today', money(today.revenue), `${today.orders} order${today.orders === 1 ? '' : 's'}`],
    [`Revenue, ${days} days`, money(totals.revenue), `${totals.orders} order${totals.orders === 1 ? '' : 's'}`],
    ['Average order', money(totals.averageCents), 'excluding cancelled'],
    ['Customers', String(totals.customers), `ordered in ${days} days`]
  ];
  return (
    <>
      <div className="d-flex justify-content-end mb-3">
        <select className="form-select w-auto" value={days} onChange={event => setDays(Number(event.target.value))} aria-label="Period">
          {[7, 30, 90, 365].map(d => <option key={d} value={d}>Last {d} days</option>)}
        </select>
      </div>
      <div className="row g-3 mb-4">
        {tiles.map(([label, value, note]) => (
          <div className="col-6 col-lg-3" key={label}>
            <div className="card-soft h-100"><div className="text-muted small">{label}</div><div className="kpi">{value}</div><div className="small text-muted">{note}</div></div>
          </div>
        ))}
      </div>
      <div className="row g-4">
        <div className="col-lg-8">
          <div className="card-soft h-100">
            <h2 className="h6">Revenue by day</h2>
            {byDay.length === 0 ? <p className="text-muted small mb-0">No orders in this period yet.</p> : (
              <div className="bars bars-wide" role="img" aria-label={byDay.map(day => `${day.day}: ${money(day.revenue)}`).join(', ')}>
                {byDay.map(day => (
                  <div key={day.day} className="bar" title={`${day.day}: ${money(day.revenue)}, ${day.orders} orders`}>
                    <span style={{ height: `${(day.revenue / max) * 100}%` }} />
                    <small>{day.day.slice(8)}</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="col-lg-4">
          <div className="card-soft mb-4">
            <h2 className="h6">Best sellers</h2>
            {topItems.length === 0 ? <p className="text-muted small mb-0">Nothing sold yet.</p> : (
              <table className="table table-sm mb-0">
                <tbody>{topItems.map(item => <tr key={item.name}><td>{item.name}</td><td className="text-end">{item.quantity}×</td><td className="text-end text-muted">{money(item.revenue)}</td></tr>)}</tbody>
              </table>
            )}
          </div>
          <div className="card-soft">
            <h2 className="h6">Orders by status</h2>
            <ul className="list-unstyled mb-0 small">
              {STATUSES.map(status => <li key={status} className="d-flex justify-content-between py-1"><StatusBadge status={status} /><strong>{byStatus[status] || 0}</strong></li>)}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}

// ---- Orders ----------------------------------------------------------------------------------

function Orders() {
  const [filters, setFilters] = useState({ status: '', days: 30, q: '' });
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(null);
  const [error, setError] = useState(null);
  const query = new URLSearchParams({ days: filters.days, ...(filters.status && { status: filters.status }), ...(filters.q && { q: filters.q }) });
  const orders = useLoad(() => api(`/owner/orders?${query}`).then(data => data.orders), [query.toString()]);
  const total = (orders.data || []).filter(o => o.status !== 'cancelled').reduce((sum, o) => sum + o.totalCents, 0);

  const setStatus = async (order, status) => {
    setError(null);
    try {
      const { order: updated } = await api(`/staff/orders/${order.id}`, { method: 'PATCH', body: { status } });
      orders.setData(orders.data.map(o => (o.id === updated.id ? { ...o, status: updated.status } : o)));
    } catch (failure) { setError(failure); }
  };

  return (
    <>
      <form className="row g-2 mb-3" onSubmit={event => { event.preventDefault(); setFilters({ ...filters, q: search.trim() }); }}>
        <div className="col-md-5"><input type="search" className="form-control" placeholder="Search name, email or #order number" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search orders" /></div>
        <div className="col-6 col-md-3">
          <select className="form-select" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })} aria-label="Status">
            <option value="">All statuses</option>
            {STATUSES.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
          </select>
        </div>
        <div className="col-6 col-md-2">
          <select className="form-select" value={filters.days} onChange={event => setFilters({ ...filters, days: Number(event.target.value) })} aria-label="Period">
            {[1, 7, 30, 90, 365].map(d => <option key={d} value={d}>{d === 1 ? 'Today' : `${d} days`}</option>)}
          </select>
        </div>
        <div className="col-md-2"><button type="submit" className="btn btn-outline-primary w-100">Search</button></div>
      </form>
      <ErrorNotice error={error || orders.error} retry={orders.error ? orders.retry : undefined} />
      {orders.loading && !orders.data && <Loading lines={4} />}
      {orders.data?.length === 0 && <EmptyState icon="🧾" title="No orders match.">Try a longer period or clear the search.</EmptyState>}
      {orders.data?.length > 0 && <p className="small text-muted">{orders.data.length} order{orders.data.length === 1 ? '' : 's'} · {money(total)} excluding cancelled</p>}
      <ul className="list-unstyled owner-list">
        {orders.data?.map(order => (
          <li key={order.id} className="owner-row">
            <button type="button" className="owner-row-main" onClick={() => setOpen(open === order.id ? null : order.id)} aria-expanded={open === order.id}>
              <strong>#{order.number}</strong>
              <span className="flex-grow-1 text-start">{order.customer?.name}<span className="d-none d-md-inline text-muted small"> · {order.items.reduce((n, i) => n + i.quantity, 0)} items</span></span>
              <span className="small text-muted d-none d-md-inline">{dateTime(order.createdAt)}</span>
              <StatusBadge status={order.status} />
              <strong className="owner-amount">{money(order.totalCents)}</strong>
            </button>
            {open === order.id && (
              <div className="owner-row-detail">
                <div className="row g-3">
                  <div className="col-md-6">
                    <ul className="list-unstyled mb-2">{order.items.map((item, i) => <li key={i}>{item.quantity} × {item.name} <span className="text-muted">· {money(item.unitCents * item.quantity)}</span></li>)}</ul>
                    {order.notes && <p className="staff-note small mb-0">📝 {order.notes}</p>}
                  </div>
                  <div className="col-md-6 small">
                    <div>Pickup: <strong>{pickupTime(order.pickupAt)}</strong></div>
                    <div>Placed: {dateTime(order.createdAt)}</div>
                    <div>Email: <a href={`mailto:${order.customer?.email}`}>{order.customer?.email}</a></div>
                    {order.customer?.phone && <div>Phone: <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></div>}
                    <label className="form-label mt-2 mb-1" htmlFor={`status-${order.id}`}>Status</label>
                    <select id={`status-${order.id}`} className="form-select form-select-sm w-auto" value={order.status} onChange={event => setStatus(order, event.target.value)}>
                      {STATUSES.map(status => <option key={status} value={status}>{statusLabel(status)}</option>)}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// ---- Menu ------------------------------------------------------------------------------------

const EMPTY_ITEM = { name: '', category: '', price: '', description: '', tags: [], available: true };

function ItemForm({ initial, categories, onSaved, onCancel }) {
  const [values, setValues] = useState(initial);
  const form = useSave();
  const set = (key, value) => setValues(current => ({ ...current, [key]: value }));
  const submit = async event => {
    event.preventDefault();
    const priceCents = Math.round(Number(values.price) * 100);
    const body = { name: values.name, category: values.category, description: values.description, tags: values.tags, available: values.available, priceCents: values.price === '' ? NaN : priceCents };
    const result = await form.save(() => (initial.id
      ? api(`/owner/menu/${initial.id}`, { method: 'PATCH', body })
      : api('/owner/menu', { method: 'POST', body })));
    if (result) onSaved(result.item);
  };
  return (
    <form className="card-soft item-form mb-3" onSubmit={submit} noValidate>
      <h3 className="h6">{initial.id ? `Edit ${initial.name}` : 'New menu item'}</h3>
      <div className="row g-2">
        <div className="col-md-5"><Field label="Name" name="item-name" value={values.name} error={form.fields.name} onChange={event => set('name', event.target.value)} maxLength={60} /></div>
        <div className="col-md-4">
          <Field label="Category" name="item-category" list="category-options" value={values.category} error={form.fields.category} hint="Pick one or type a new one" onChange={event => set('category', event.target.value)} maxLength={30} />
          <datalist id="category-options">{categories.map(category => <option key={category} value={category} />)}</datalist>
        </div>
        <div className="col-md-3"><Field label="Price (₹)" name="item-price" type="number" min="0" step="0.5" inputMode="decimal" value={values.price} error={form.fields.priceCents} onChange={event => set('price', event.target.value)} /></div>
      </div>
      <Field as="textarea" rows={2} label="Description" name="item-description" value={values.description} maxLength={200} hint={`${200 - values.description.length} characters left`} onChange={event => set('description', event.target.value)} />
      <div className="d-flex flex-wrap gap-3 mb-3">
        {Object.entries(DIET_LABELS).map(([tag, label]) => (
          <div className="form-check" key={tag}>
            <input className="form-check-input" type="checkbox" id={`tag-${tag}`} checked={values.tags.includes(tag)} onChange={event => set('tags', event.target.checked ? [...values.tags, tag] : values.tags.filter(t => t !== tag))} />
            <label className="form-check-label" htmlFor={`tag-${tag}`}>{label}</label>
          </div>
        ))}
        <div className="form-check form-switch">
          <input className="form-check-input" type="checkbox" role="switch" id="item-available" checked={values.available} onChange={event => set('available', event.target.checked)} />
          <label className="form-check-label" htmlFor="item-available">Available to order</label>
        </div>
      </div>
      {!Object.keys(form.fields).length && <ErrorNotice error={form.error} />}
      <div className="d-flex gap-2">
        <SubmitButton busy={form.busy} className="btn btn-primary" busyLabel="Saving…">{initial.id ? 'Save changes' : 'Add to menu'}</SubmitButton>
        <button type="button" className="btn btn-link" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function MenuEditor() {
  const { loadMenu } = useSite();
  const menu = useLoad(() => api('/owner/menu'), []);
  const [editing, setEditing] = useState(null); // 'new' or an item id
  const [error, setError] = useState(null);
  const items = menu.data?.items || [];
  const categories = menu.data?.categories || [];
  const grouped = useMemo(() => categories.map(category => [category, items.filter(item => item.category === category)]), [items, categories]);

  const refresh = async () => { await menu.retry({ quiet: true }); loadMenu(); };
  const act = async action => {
    setError(null);
    try { await action(); await refresh(); } catch (failure) { setError(failure); }
  };
  const toForm = item => ({ ...item, price: String(item.priceCents / 100) });

  if (menu.loading && !menu.data) return <Loading lines={5} />;
  if (menu.error) return <ErrorNotice error={menu.error} retry={menu.retry} />;
  return (
    <>
      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
        <p className="text-muted small mb-0">{items.length} items in {categories.length} categories. Changes appear on the public menu straight away.</p>
        {editing !== 'new' && <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>+ Add item</button>}
      </div>
      {editing === 'new' && <ItemForm initial={EMPTY_ITEM} categories={categories} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      <ErrorNotice error={error} />
      {items.length === 0 && <EmptyState icon="📋" title="Your menu is empty.">Add your first item to start taking orders.</EmptyState>}
      {grouped.map(([category, list]) => (
        <section key={category} className="mb-4">
          <h2 className="h5 section-title">{category}</h2>
          <ul className="list-unstyled owner-list">
            {list.map((item, index) => (
              <li key={item.id}>
                {editing === item.id ? (
                  <ItemForm initial={toForm(item)} categories={categories} onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />
                ) : (
                  <div className={`owner-row owner-item ${item.available ? '' : 'sold-out'}`}>
                    <div className="d-flex flex-column">
                      <button type="button" className="btn btn-sm btn-link p-0 move" disabled={index === 0} aria-label={`Move ${item.name} up`} onClick={() => act(() => api(`/owner/menu/${item.id}/move`, { method: 'POST', body: { direction: 'up' } }))}>▲</button>
                      <button type="button" className="btn btn-sm btn-link p-0 move" disabled={index === list.length - 1} aria-label={`Move ${item.name} down`} onClick={() => act(() => api(`/owner/menu/${item.id}/move`, { method: 'POST', body: { direction: 'down' } }))}>▼</button>
                    </div>
                    <div className="flex-grow-1">
                      <strong>{item.name}</strong> {item.tags.map(tag => <span key={tag} className={`diet diet-${tag} ms-1`}>{DIET_LABELS[tag]}</span>)}
                      <div className="small text-muted">{item.description}</div>
                    </div>
                    <strong className="owner-amount">{money(item.priceCents)}</strong>
                    <div className="form-check form-switch mb-0" title={item.available ? 'Available' : 'Sold out'}>
                      <input className="form-check-input" type="checkbox" role="switch" checked={item.available} aria-label={`${item.name} available`}
                        onChange={() => act(() => api(`/owner/menu/${item.id}`, { method: 'PATCH', body: { available: !item.available } }))} />
                    </div>
                    <button type="button" className="btn btn-sm btn-outline-primary" onClick={() => setEditing(item.id)}>Edit</button>
                    <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => window.confirm(`Delete ${item.name} from the menu? Past orders keep their copy.`) && act(() => api(`/owner/menu/${item.id}`, { method: 'DELETE' }))}>Delete</button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

// ---- Opening hours ---------------------------------------------------------------------------

function HoursTab() {
  const { info } = useSite();
  return info ? <HoursEditor /> : <Loading />;
}

function HoursEditor() {
  const { info, loadInfo } = useSite();
  const [days, setDays] = useState(() => info.hours.week.map(day => ({ day: day.day, open: Boolean(day.opens), opens: day.opens || '08:00', closes: day.closes || '18:00' })));
  const form = useSave();
  const set = (index, key, value) => setDays(current => current.map((day, i) => (i === index ? { ...day, [key]: value } : day)));
  return (
    <form className="card-soft hours-editor" onSubmit={async event => { event.preventDefault(); if (await form.save(() => api('/owner/hours', { method: 'PUT', body: { days } }), 'Opening hours saved.')) loadInfo(); }}>
      <p className="small text-muted">Pickup slots follow these hours automatically. Times are in {info.cafe.timeZone}.</p>
      {days.map((day, index) => (
        <div key={day.day} className="hours-row">
          <div className="form-check form-switch mb-0">
            <input className="form-check-input" type="checkbox" role="switch" id={`open-${day.day}`} checked={day.open} onChange={event => set(index, 'open', event.target.checked)} />
            <label className="form-check-label fw-semibold" htmlFor={`open-${day.day}`}>{DAYS[day.day]}</label>
          </div>
          {day.open ? (
            <div className="d-flex align-items-center gap-2">
              <input type="time" className="form-control form-control-sm" value={day.opens} onChange={event => set(index, 'opens', event.target.value)} aria-label={`${DAYS[day.day]} opens`} />
              <span>to</span>
              <input type="time" className="form-control form-control-sm" value={day.closes} onChange={event => set(index, 'closes', event.target.value)} aria-label={`${DAYS[day.day]} closes`} />
            </div>
          ) : <span className="text-muted">Closed</span>}
          {form.fields[`day${day.day}`] && <div className="text-danger small w-100">{form.fields[`day${day.day}`]}</div>}
        </div>
      ))}
      {!Object.keys(form.fields).length && <ErrorNotice error={form.error} className="mt-3" />}
      <div className="mt-3"><SubmitButton busy={form.busy} className="btn btn-primary">Save hours</SubmitButton><Saved text={form.saved} /></div>
      {form.saved && <p className="small text-muted mt-2 mb-0">Now: {days.filter(d => d.open).map(d => `${DAYS[d.day].slice(0, 3)} ${clock(d.opens)}–${clock(d.closes)}`).join(' · ') || 'closed every day'}</p>}
    </form>
  );
}

// ---- Café details ----------------------------------------------------------------------------

function DetailsEditor() {
  const { loadInfo } = useSite();
  const data = useLoad(() => api('/owner/settings'), []);
  const [values, setValues] = useState(null);
  const form = useSave();
  if (data.loading && !data.data) return <Loading />;
  if (data.error) return <ErrorNotice error={data.error} retry={data.retry} />;
  const current = values || data.data.settings;
  const bind = key => ({ name: key, value: current[key] ?? '', error: form.fields[key], onChange: event => setValues({ ...current, [key]: event.target.value }) });
  return (
    <form className="card-soft" noValidate onSubmit={async event => { event.preventDefault(); if (await form.save(() => api('/owner/settings', { method: 'PATCH', body: current }), 'Café details saved.')) loadInfo(); }}>
      <div className="row g-2">
        <div className="col-md-6"><Field label="Café name" {...bind('name')} maxLength={60} /></div>
        <div className="col-md-6"><Field label="Phone" type="tel" {...bind('phone')} /></div>
        <div className="col-md-6"><Field label="Email" type="email" {...bind('email')} /></div>
        <div className="col-md-6"><Field label="Tagline" {...bind('tagline')} maxLength={140} /></div>
        <div className="col-12"><Field label="Address" {...bind('address')} maxLength={200} /></div>
        <div className="col-6"><Field label="Map latitude" type="number" step="any" {...bind('latitude')} hint="Right-click the spot in Google Maps to copy it" /></div>
        <div className="col-6"><Field label="Map longitude" type="number" step="any" {...bind('longitude')} /></div>
      </div>
      <p className="small text-muted">Time zone ({data.data.fixed.timeZone}) and currency ({data.data.fixed.currency}) are set on the server, because changing them would shift existing orders.</p>
      {!Object.keys(form.fields).length && <ErrorNotice error={form.error} />}
      <SubmitButton busy={form.busy} className="btn btn-primary">Save details</SubmitButton><Saved text={form.saved} />
    </form>
  );
}

// ---- Team ------------------------------------------------------------------------------------

function Team() {
  const { user } = useSite();
  const team = useLoad(() => api('/owner/team').then(data => data.team), []);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const form = useSave();
  const change = async (memberEmail, nextRole, notice) => {
    const result = await form.save(() => api('/owner/team', { method: 'POST', body: { email: memberEmail, role: nextRole } }), notice);
    if (result) { team.setData(result.team); setEmail(''); }
  };
  return (
    <>
      <form className="card-soft mb-4" noValidate onSubmit={event => { event.preventDefault(); change(email.trim(), role, `${email.trim()} is now ${role}.`); }}>
        <h2 className="h6">Add someone to the team</h2>
        <p className="small text-muted">They need an account first: ask them to sign up on the site, then enter their email here. <strong>Staff</strong> run the order board and sold-out switches; <strong>owners</strong> can also change the menu, hours, details and team.</p>
        <div className="row g-2 align-items-end">
          <div className="col-md-6"><Field label="Email" name="team-email" type="email" value={email} error={form.fields.email} onChange={event => setEmail(event.target.value)} /></div>
          <div className="col-md-3">
            <Field as="select" label="Role" name="team-role" value={role} onChange={event => setRole(event.target.value)}>
              <option value="staff">Staff</option>
              <option value="owner">Owner</option>
            </Field>
          </div>
          <div className="col-md-3 mb-3"><SubmitButton busy={form.busy} className="btn btn-primary w-100">Add</SubmitButton></div>
        </div>
        {!form.fields.email && <ErrorNotice error={form.error} />}
        <Saved text={form.saved} />
      </form>
      {team.loading && !team.data && <Loading />}
      <ErrorNotice error={team.error} retry={team.retry} />
      <ul className="list-unstyled owner-list">
        {team.data?.map(member => (
          <li key={member.id} className="owner-row">
            <div className="flex-grow-1"><strong>{member.name}</strong> <span className="text-muted small">{member.email}</span>
              {member.fromConfig && <div className="small text-muted">Set by the server's STAFF_EMAILS / OWNER_EMAILS, so removing them here only lasts until they next sign in.</div>}
            </div>
            {member.email === user?.email ? <span className="badge text-bg-dark">You · {member.role}</span> : (
              <select className="form-select form-select-sm w-auto" value={member.role} aria-label={`Role for ${member.name}`}
                onChange={event => change(member.email, event.target.value, `${member.name} is now ${event.target.value}.`)}>
                <option value="owner">Owner</option>
                <option value="staff">Staff</option>
                <option value="customer">Remove from team</option>
              </select>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

// ---- Customers -------------------------------------------------------------------------------

function Customers() {
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const customers = useLoad(() => api(`/owner/customers?q=${encodeURIComponent(q)}`).then(data => data.customers), [q]);
  return (
    <>
      <form className="d-flex gap-2 mb-3" onSubmit={event => { event.preventDefault(); setQ(search.trim()); }}>
        <input type="search" className="form-control" placeholder="Search name, email or phone" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search customers" />
        <button type="submit" className="btn btn-outline-primary">Search</button>
      </form>
      {customers.loading && !customers.data && <Loading lines={4} />}
      <ErrorNotice error={customers.error} retry={customers.retry} />
      {customers.data?.length === 0 && <EmptyState icon="👋" title={q ? 'No customers match.' : 'No customers yet.'}>Customers appear here once they create an account.</EmptyState>}
      {customers.data?.length > 0 && (
        <div className="table-responsive card-soft p-0">
          <table className="table align-middle mb-0 owner-table">
            <thead><tr><th>Name</th><th>Contact</th><th className="text-end">Orders</th><th className="text-end">Spent</th><th>Last order</th></tr></thead>
            <tbody>
              {customers.data.map(customer => (
                <tr key={customer.id}>
                  <td><strong>{customer.name}</strong>{!customer.verified && <span className="badge text-bg-light border ms-1">unconfirmed</span>}<div className="small text-muted">Joined {dateTime(customer.joinedAt)}</div></td>
                  <td className="small"><a href={`mailto:${customer.email}`}>{customer.email}</a>{customer.phone && <div><a href={`tel:${customer.phone}`}>{customer.phone}</a></div>}</td>
                  <td className="text-end">{customer.orders}</td>
                  <td className="text-end">{money(customer.spentCents)}</td>
                  <td className="small">{customer.lastOrderAt ? dateTime(customer.lastOrderAt) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

const TABS = [
  ['overview', 'Overview', Overview], ['orders', 'Orders', Orders], ['menu', 'Menu', MenuEditor], ['hours', 'Hours', HoursTab],
  ['details', 'Café details', DetailsEditor], ['team', 'Team', Team], ['customers', 'Customers', Customers]
];

function OwnerPage() {
  useTitle('Owner');
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('owner-tab') || 'overview'; } catch { return 'overview'; }
  });
  const choose = key => { setTab(key); try { sessionStorage.setItem('owner-tab', key); } catch {} };
  const Current = (TABS.find(([key]) => key === tab) || TABS[0])[2];
  return (
    <div className="container py-5">
      <div className="d-flex flex-wrap align-items-end justify-content-between gap-2 mb-3">
        <h1 className="page-title mb-0">Owner dashboard</h1>
        <Link to="/staff" className="btn btn-sm btn-outline-primary">Open the live order board →</Link>
      </div>
      <ul className="nav nav-tabs owner-tabs mb-4" role="tablist">
        {TABS.map(([key, label]) => (
          <li className="nav-item" key={key} role="presentation">
            <button type="button" role="tab" aria-selected={tab === key} className={`nav-link ${tab === key ? 'active' : ''}`} onClick={() => choose(key)}>{label}</button>
          </li>
        ))}
      </ul>
      <Current />
    </div>
  );
}

export default function Owner() {
  return <RequireUser roles={['owner']}><OwnerPage /></RequireUser>;
}
