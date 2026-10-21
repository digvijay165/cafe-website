import { useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useInterval, useLoad, useTitle } from '../lib/hooks';
import { dateTime, money, pickupTime } from '../lib/format';
import { useSite } from '../state';
import { EmptyState, ErrorNotice, Loading, StatusBadge } from '../components/ui';
import RequireUser from '../components/RequireUser';

const ACTIVE = ['received', 'preparing', 'ready'];
const STEPS = [['received', 'Received'], ['preparing', 'Being made'], ['ready', 'Ready'], ['collected', 'Collected']];

function OrderList() {
  useTitle('My orders');
  const orders = useLoad(() => api('/orders').then(data => data.orders), []);
  useInterval(() => orders.retry({ quiet: true }), orders.data?.some(order => ACTIVE.includes(order.status)) ? 20_000 : 0);
  return (
    <div className="container py-5 narrow">
      <h1 className="page-title">My orders</h1>
      <ErrorNotice error={orders.error} retry={orders.retry} />
      {orders.loading && !orders.data && <Loading lines={3} label="Loading your orders" />}
      {orders.data?.length === 0 && (
        <EmptyState icon="🧾" title="No orders yet." action={<Link to="/menu" className="btn btn-primary">Start an order</Link>}>
          When you order ahead, your orders and their status show up here.
        </EmptyState>
      )}
      <ul className="list-unstyled">
        {orders.data?.map(order => (
          <li key={order.id}>
            <Link to={`/orders/${order.id}`} className="order-row">
              <div className="flex-grow-1">
                <strong>Order #{order.number}</strong> <StatusBadge status={order.status} />
                <div className="small text-muted">{order.items.map(item => `${item.quantity} × ${item.name}`).join(', ')}</div>
              </div>
              <div className="text-end small">
                <div className="fw-semibold">{money(order.totalCents)}</div>
                <div className="text-muted">Pickup {pickupTime(order.pickupAt)}</div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderDetail() {
  const { id } = useParams();
  const { state } = useLocation();
  const { info } = useSite();
  const order = useLoad(() => api(`/orders/${id}`).then(data => data.order), [id]);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);
  useTitle(order.data ? `Order #${order.data.number}` : 'Order');
  useInterval(() => order.retry({ quiet: true }), order.data && ACTIVE.includes(order.data.status) ? 15_000 : 0);

  if (order.loading && !order.data) return <div className="container py-5"><Loading label="Loading your order" /></div>;
  if (order.error?.status === 404) {
    return <div className="container py-5"><EmptyState icon="🧾" title="We could not find that order." action={<Link to="/orders" className="btn btn-primary">See my orders</Link>} /></div>;
  }
  if (order.error) return <div className="container py-5"><ErrorNotice error={order.error} retry={order.retry} /></div>;

  const data = order.data;
  const stepIndex = STEPS.findIndex(([status]) => status === data.status);
  const cancel = async () => {
    if (!window.confirm('Cancel this order?')) return;
    setCancelling(true);
    setCancelError(null);
    try { order.setData((await api(`/orders/${id}/cancel`, { method: 'POST' })).order); } catch (error) { setCancelError(error); order.retry({ quiet: true }); }
    setCancelling(false);
  };

  return (
    <div className="container py-5 narrow">
      {state?.justPlaced && <div className="alert alert-success" role="status">🎉 Thanks! Your order is in. We have emailed you a confirmation.</div>}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-1">
        <h1 className="page-title mb-0 me-2">Order #{data.number}</h1>
        <StatusBadge status={data.status} />
      </div>
      <p className="text-muted">Placed {dateTime(data.createdAt)} · Pickup <strong>{pickupTime(data.pickupAt)}</strong></p>

      {data.status !== 'cancelled' && (
        <ol className="progress-steps" aria-label="Order progress">
          {STEPS.map(([status, label], index) => (
            <li key={status} className={index <= stepIndex ? 'done' : ''} aria-current={index === stepIndex ? 'step' : undefined}>{label}</li>
          ))}
        </ol>
      )}
      {data.status === 'ready' && <div className="alert alert-success">Your order is ready at the counter. Just give your name or order number.</div>}

      <div className="card-soft my-4">
        <ul className="list-unstyled mb-3">
          {data.items.map((item, index) => (
            <li key={index} className="d-flex justify-content-between py-1">
              <span>{item.quantity} × {item.name}</span><span>{money(item.unitCents * item.quantity)}</span>
            </li>
          ))}
        </ul>
        <div className="d-flex justify-content-between border-top pt-2 fw-semibold"><span>Total, paid at pickup</span><span>{money(data.totalCents)}</span></div>
        {data.notes && <p className="small mt-3 mb-0"><strong>Your note:</strong> {data.notes}</p>}
      </div>

      {info && data.status !== 'cancelled' && data.status !== 'collected' && <p className="small text-muted">Pick up at {info.cafe.address}. Running late or need to change something? Call <a href={`tel:${info.cafe.phone.replace(/\s/g, '')}`}>{info.cafe.phone}</a>.</p>}
      <ErrorNotice error={cancelError} />
      <div className="d-flex flex-wrap gap-2">
        <Link to="/orders" className="btn btn-outline-primary">All my orders</Link>
        {data.status === 'received' && <button type="button" className="btn btn-outline-danger" onClick={cancel} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel order'}</button>}
      </div>
    </div>
  );
}

export const Orders = () => <RequireUser><OrderList /></RequireUser>;
export const Order = () => <RequireUser><OrderDetail /></RequireUser>;
