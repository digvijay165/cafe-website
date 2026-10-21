// App-wide state: the café's info and hours, the signed-in user, the menu and the basket.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './lib/api';
import { setCafe } from './lib/format';

const Site = createContext(null);
export const useSite = () => useContext(Site);

const CART_KEY = 'lantern-cart';
function readCart() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(line => Number.isInteger(line.id) && line.quantity > 0) : [];
  } catch {
    return [];
  }
}

export function SiteProvider({ children }) {
  const [info, setInfo] = useState(null);
  const [infoError, setInfoError] = useState(null);
  const [user, setUser] = useState(undefined); // undefined while we do not know yet
  const [menu, setMenu] = useState(null);
  const [menuError, setMenuError] = useState(null);
  const [cart, setCart] = useState(readCart);

  const loadInfo = useCallback(() => {
    setInfoError(null);
    return api('/info').then(data => { setCafe(data.cafe); setInfo(data); }, setInfoError);
  }, []);

  const loadMenu = useCallback(() => {
    setMenuError(null);
    return api('/menu').then(data => setMenu(data.items), setMenuError);
  }, []);

  useEffect(() => {
    loadInfo();
    loadMenu();
    api('/auth/me').then(data => setUser(data.user), () => setUser(null));
    // Refresh the open/closed badge every minute.
    const id = setInterval(() => api('/info').then(setInfo, () => {}), 60_000);
    return () => clearInterval(id);
  }, [loadInfo, loadMenu]);

  useEffect(() => {
    try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch {}
  }, [cart]);

  const setQuantity = useCallback((id, quantity) => {
    setCart(lines => {
      const next = lines.filter(line => line.id !== id);
      if (quantity > 0) {
        const index = lines.findIndex(line => line.id === id);
        const line = { id, quantity: Math.min(quantity, 20) };
        if (index === -1) next.push(line); else next.splice(index, 0, line);
      }
      return next;
    });
  }, []);

  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(() => {
    const byId = new Map((menu || []).map(item => [item.id, item]));
    const lines = cart.map(line => ({ ...line, item: byId.get(line.id) })).filter(line => !menu || line.item);
    const count = lines.reduce((sum, line) => sum + line.quantity, 0);
    const total = lines.reduce((sum, line) => sum + (line.item?.priceCents || 0) * line.quantity, 0);
    return {
      info, infoError, loadInfo,
      user, setUser, logout,
      menu, menuError, loadMenu, setMenu,
      cart: { lines, count, total, setQuantity, clear: () => setCart([]), quantityOf: id => cart.find(line => line.id === id)?.quantity || 0 }
    };
  }, [info, infoError, loadInfo, user, logout, menu, menuError, loadMenu, cart, setQuantity]);

  return <Site.Provider value={value}>{children}</Site.Provider>;
}
