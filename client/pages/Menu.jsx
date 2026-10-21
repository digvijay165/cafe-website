import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useSite } from '../state';
import { useTitle } from '../lib/hooks';
import MenuItem from '../components/MenuItem';
import { DIET_LABELS, EmptyState, ErrorNotice, Loading } from '../components/ui';

export default function Menu() {
  useTitle('Menu');
  const { menu, menuError, loadMenu } = useSite();
  const { hash } = useLocation();
  const [search, setSearch] = useState('');
  const [diet, setDiet] = useState('');

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (menu || []).filter(item =>
      (!term || `${item.name} ${item.description} ${item.category}`.toLowerCase().includes(term)) &&
      (!diet || item.tags.includes(diet)));
  }, [menu, search, diet]);

  const categories = useMemo(() => [...new Set(filtered.map(item => item.category))], [filtered]);

  // Links like /menu#flat-white scroll to that item once the menu has loaded.
  useEffect(() => {
    if (menu && hash) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'center' });
  }, [menu, hash]);

  return (
    <div className="container py-5">
      <header className="mb-4">
        <h1 className="page-title">Menu</h1>
        <p className="text-muted mb-0">Add anything to your basket and pick it up at a time that suits you. Plant milks are free.</p>
      </header>

      <div className="menu-toolbar sticky-toolbar">
        <input type="search" className="form-control" placeholder="Search the menu, e.g. chai" value={search} onChange={event => setSearch(event.target.value)} aria-label="Search the menu" />
        <div className="d-flex flex-wrap gap-2" role="group" aria-label="Dietary filter">
          {['', ...Object.keys(DIET_LABELS)].map(tag => (
            <button key={tag || 'all'} type="button" className={`chip ${diet === tag ? 'active' : ''}`} aria-pressed={diet === tag} onClick={() => setDiet(tag)}>
              {tag ? DIET_LABELS[tag] : 'Everything'}
            </button>
          ))}
        </div>
        {categories.length > 1 && (
          <nav className="category-links" aria-label="Menu sections">
            {categories.map(category => <a key={category} href={`#section-${category.replace(/\W+/g, '-')}`}>{category}</a>)}
          </nav>
        )}
      </div>

      {menuError && !menu && <ErrorNotice error={menuError} retry={loadMenu} />}
      {!menu && !menuError && <Loading lines={6} label="Loading the menu" />}
      {menu && filtered.length === 0 && (
        <EmptyState icon="🔍" title="Nothing matches that." action={<button type="button" className="btn btn-outline-primary" onClick={() => { setSearch(''); setDiet(''); }}>Show the whole menu</button>}>
          Try a different word, or clear the filters to see everything we make.
        </EmptyState>
      )}
      {categories.map(category => (
        <section key={category} id={`section-${category.replace(/\W+/g, '-')}`} className="menu-section">
          <h2 className="section-title">{category}</h2>
          <div className="menu-grid">
            {filtered.filter(item => item.category === category).map(item => <div id={item.slug} key={item.id}><MenuItem item={item} /></div>)}
          </div>
        </section>
      ))}
    </div>
  );
}
