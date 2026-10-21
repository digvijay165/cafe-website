import { useSite } from '../state';
import { money } from '../lib/format';
import { DIET_LABELS } from './ui';

export function QuantityStepper({ id, name, quantity, setQuantity, small = false }) {
  return (
    <div className={`stepper ${small ? 'stepper-sm' : ''}`} role="group" aria-label={`Quantity of ${name}`}>
      <button type="button" className="btn" onClick={() => setQuantity(id, quantity - 1)} aria-label={quantity === 1 ? `Remove ${name}` : `One fewer ${name}`}>−</button>
      <span aria-live="polite">{quantity}</span>
      <button type="button" className="btn" onClick={() => setQuantity(id, quantity + 1)} disabled={quantity >= 20} aria-label={`One more ${name}`}>+</button>
    </div>
  );
}

export default function MenuItem({ item }) {
  const { cart } = useSite();
  const quantity = cart.quantityOf(item.id);
  return (
    <article className={`menu-item ${item.available ? '' : 'sold-out'}`}>
      <div className="flex-grow-1">
        <div className="d-flex align-items-baseline gap-2 flex-wrap">
          <h3 className="menu-item-name">{item.name}</h3>
          {item.tags.map(tag => <span key={tag} className={`diet diet-${tag}`}>{DIET_LABELS[tag] || tag}</span>)}
        </div>
        <p className="menu-item-description">{item.description}</p>
        <p className="menu-item-price">{money(item.priceCents)}</p>
      </div>
      <div className="menu-item-action">
        {!item.available ? <span className="badge text-bg-light border">Sold out today</span>
          : quantity ? <QuantityStepper id={item.id} name={item.name} quantity={quantity} setQuantity={cart.setQuantity} />
          : <button type="button" className="btn btn-outline-primary btn-sm px-3" onClick={() => cart.setQuantity(item.id, 1)} aria-label={`Add ${item.name} to basket`}>Add</button>}
      </div>
    </article>
  );
}
