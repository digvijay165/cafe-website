import { useState } from 'react';
import { api } from '../lib/api';
import { useInterval, useLoad, useTitle } from '../lib/hooks';
import { dateTime, money, pickupTime } from '../lib/format';
import { useSite } from '../state';
import { EmptyState, ErrorNotice, Loading, StatusBadge } from '../components/ui';
import RequireUser from '../components/RequireUser';

const NEXT = { received: ['preparing', 'Start making'], preparing: ['ready', 'Mark ready'], ready: ['collected', 'Collected'] };

function OrderBoard() {
  const [view, setView] = useState('active');
  const orders = useLoad(() => api(`/staff/orders?view=${view}`).then(data => data.orders), [view]);
  const [error, setError] = useState(null);
  useInterval(() => orders.retry({ quiet: true }), 15_000);
  const move = async (order, status) => {
    setError(null);
    try {
      const { order: updated } = await api(`/staff/orders/${order.id}`, { method: 'PATCH', body: { status } });
      orders.setData(orders.data.map(o => (o.id === updated.id ? { ...o, ...updated, customer: o.customer } : o)));
    } catch (failure) { setError(failure); }
  };
  return (
    <>
      <div className="btn-group mb-3" role="group" aria-label="Which orders">
        <button type="button" className={`btn btn-sm ${view === 'active' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setView('active')}>Open orders</button>
        <button type="button" className={`btn btn-sm ${view === 'all' ? 'btn-primary' : 'btn-outline-primary'}`} onClick={() => setView('all')}>Last 7 days</button>
      </div>
      <ErrorNotice error={error || orders.error} retry={orders.error ? orders.retry : undefined} />
      {orders.loading && !orders.data && <Loading lines={3} />}
      {orders.data?.length === 0 && <EmptyState icon="🧘" title="No open orders.">New orders appear here automatically every 15 seconds.</EmptyState>}
      <div className="row g-3">
        {orders.data?.map(order => (
          <div className="col-md-6 col-xl-4" key={order.id}>
            <div className={`card-soft h-100 staff-order status-${order.status}`}>
              <div className="d-flex justify-content-between align-items-start mb-2">
                <div><strong className="h5">#{order.number}</strong> <StatusBadge status={order.status} /></div>
                <span className="small fw-semibold">{pickupTime(order.pickupAt)}</span>
              </div>
              <p className="small mb-2">{order.customer?.name}{order.customer?.phone && <> · <a href={`tel:${order.customer.phone}`}>{order.customer.phone}</a></>}</p>
              <ul className="list-unstyled small mb-2">{order.items.map((item, i) => <li key={i}><strong>{item.quantity} ×</strong> {item.name}</li>)}</ul>
              {order.notes && <p className="small staff-note mb-2">📝 {order.notes}</p>}
              <div className="d-flex justify-content-between align-items-center mt-auto">
                <span className="small text-muted">{money(order.totalCents)} · {dateTime(order.createdAt)}</span>
                <div className="d-flex gap-1">
                  {NEXT[order.status] && <button type="button" className="btn btn-sm btn-primary" onClick={() => move(order, NEXT[order.status][0])}>{NEXT[order.status][1]}</button>}
                  {order.status === 'received' && <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => window.confirm(`Cancel order #${order.number}?`) && move(order, 'cancelled')}>Cancel</button>}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function MenuAvailability() {
  const { menu, setMenu } = useSite();
  const [error, setError] = useState(null);
  if (!menu) return <Loading />;
  const toggle = async item => {
    setError(null);
    try {
      const { item: updated } = await api(`/staff/menu/${item.id}`, { method: 'PATCH', body: { available: !item.available } });
      setMenu(menu.map(m => (m.id === updated.id ? { ...m, available: updated.available } : m)));
    } catch (failure) { setError(failure); }
  };
  return (
    <>
      <p className="text-muted small">Mark items sold out as they run out. Customers see it straight away and cannot order them.</p>
      <ErrorNotice error={error} />
      <ul className="list-group">
        {menu.map(item => (
          <li key={item.id} className="list-group-item d-flex align-items-center gap-3">
            <div className="form-check form-switch mb-0">
              <input className="form-check-input" type="checkbox" role="switch" id={`avail-${item.id}`} checked={item.available} onChange={() => toggle(item)} />
            </div>
            <label htmlFor={`avail-${item.id}`} className="flex-grow-1">{item.name} <span className="text-muted small">· {item.category}</span></label>
            <span className="small">{item.available ? 'Available' : <span className="text-danger">Sold out</span>}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Insights() {
  const stats = useLoad(() => api('/staff/stats'), []);
  if (stats.loading && !stats.data) return <Loading />;
  if (stats.error) return <ErrorNotice error={stats.error} retry={stats.retry} />;
  const { views, pages, errors, today } = stats.data;
  const max = Math.max(1, ...views.map(day => day.views));
  return (
    <div className="row g-4">
      <div className="col-md-4"><div className="card-soft"><div className="text-muted small">Orders, last 24 h</div><div className="display-6">{today.orders}</div><div className="small">{money(today.revenue)} value</div></div></div>
      <div className="col-md-8">
        <div className="card-soft">
          <h2 className="h6">Page views, last 7 days</h2>
          {views.length === 0 ? <p className="small text-muted mb-0">No visits recorded yet.</p> : (
            <div className="bars" role="img" aria-label={views.map(day => `${day.day}: ${day.views} views`).join(', ')}>
              {views.map(day => <div key={day.day} className="bar"><span style={{ height: `${(day.views / max) * 100}%` }} /><small>{day.day.slice(5)}</small><small className="fw-semibold">{day.views}</small></div>)}
            </div>
          )}
        </div>
      </div>
      <div className="col-md-6">
        <div className="card-soft">
          <h2 className="h6">Top pages</h2>
          {pages.length === 0 ? <p className="small text-muted mb-0">Nothing yet.</p>
            : <table className="table table-sm mb-0"><tbody>{pages.map(page => <tr key={page.path}><td>{page.path}</td><td className="text-end">{page.views}</td></tr>)}</tbody></table>}
        </div>
      </div>
      <div className="col-md-6">
        <div className="card-soft">
          <h2 className="h6">Recent errors</h2>
          {errors.length === 0 ? <p className="small text-muted mb-0">No errors reported. 🎉</p> : (
            <ul className="list-unstyled small mb-0">
              {errors.map((error, i) => <li key={i} className="mb-2"><span className="badge text-bg-light border me-1">{error.source}</span>{error.message}<div className="text-muted">{error.path} · {dateTime(error.reported_at)}</div></li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

const TABS = [['orders', 'Orders', OrderBoard], ['menu', 'Sold out', MenuAvailability], ['insights', 'Insights', Insights]];

function StaffPage() {
  useTitle('Staff');
  const [tab, setTab] = useState('orders');
  const Current = TABS.find(([key]) => key === tab)[2];
  return (
    <div className="container py-5">
      <h1 className="page-title">Staff</h1>
      <ul className="nav nav-tabs mb-4">
        {TABS.map(([key, label]) => (
          <li className="nav-item" key={key}><button type="button" className={`nav-link ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button></li>
        ))}
      </ul>
      <Current />
    </div>
  );
}

export default function Staff() {
  return <RequireUser staff><StaffPage /></RequireUser>;
}
