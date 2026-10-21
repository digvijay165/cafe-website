import { Link } from 'react-router-dom';
import { useSite } from '../state';
import { useTitle } from '../lib/hooks';
import { money } from '../lib/format';
import { QuantityStepper } from '../components/MenuItem';
import { EmptyState, Loading } from '../components/ui';

export default function Cart() {
  useTitle('Basket');
  const { cart, menu } = useSite();
  if (!menu) return <div className="container py-5"><Loading label="Loading your basket" /></div>;
  if (!cart.count) {
    return (
      <div className="container py-5">
        <EmptyState icon="🛍" title="Your basket is empty." action={<Link to="/menu" className="btn btn-primary">Browse the menu</Link>}>
          Add a coffee, a bake or lunch and we will have it ready when you arrive.
        </EmptyState>
      </div>
    );
  }
  const soldOut = cart.lines.filter(line => !line.item.available);
  return (
    <div className="container py-5 narrow">
      <h1 className="page-title">Your basket</h1>
      {soldOut.length > 0 && (
        <div className="alert alert-warning" role="alert">
          {soldOut.map(line => line.item.name).join(', ')} {soldOut.length > 1 ? 'have' : 'has'} sold out since you added {soldOut.length > 1 ? 'them' : 'it'}. Remove {soldOut.length > 1 ? 'them' : 'it'} to continue.
        </div>
      )}
      <ul className="list-unstyled basket">
        {cart.lines.map(({ id, quantity, item }) => (
          <li key={id} className={`basket-line ${item.available ? '' : 'sold-out'}`}>
            <div className="flex-grow-1">
              <strong>{item.name}</strong>
              <div className="small text-muted">{money(item.priceCents)} each{item.available ? '' : ' · sold out'}</div>
            </div>
            <QuantityStepper id={id} name={item.name} quantity={quantity} setQuantity={cart.setQuantity} small />
            <span className="basket-line-total">{money(item.priceCents * quantity)}</span>
            <button type="button" className="btn btn-link btn-sm text-danger p-0" onClick={() => cart.setQuantity(id, 0)} aria-label={`Remove ${item.name}`}>Remove</button>
          </li>
        ))}
      </ul>
      <div className="d-flex justify-content-between align-items-center border-top pt-3 mb-4">
        <span className="h5 mb-0">Total</span>
        <span className="h4 mb-0">{money(cart.total)}</span>
      </div>
      <p className="small text-muted">You pay at the counter when you collect: cash, card or UPI.</p>
      <div className="d-flex flex-wrap gap-2">
        <Link to="/checkout" className={`btn btn-primary btn-lg ${soldOut.length ? 'disabled' : ''}`} aria-disabled={soldOut.length > 0}>Choose a pickup time</Link>
        <Link to="/menu" className="btn btn-outline-primary btn-lg">Add more</Link>
      </div>
    </div>
  );
}
