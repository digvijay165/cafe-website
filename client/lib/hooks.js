import { useCallback, useEffect, useRef, useState } from 'react';

// Loads data on mount (and when deps change). Exposes loading, error and a retry function so every
// page can show the same three states.
export function useLoad(load, deps = []) {
  const [state, setState] = useState({ loading: true, error: null, data: null });
  const latest = useRef(0);
  const run = useCallback(({ quiet = false } = {}) => {
    const id = ++latest.current;
    if (!quiet) setState(previous => ({ ...previous, loading: true, error: null }));
    return load().then(
      data => { if (id === latest.current) setState({ loading: false, error: null, data }); },
      error => { if (id === latest.current) setState(previous => ({ loading: false, error: quiet && previous.data ? null : error, data: previous.data })); }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, retry: run, setData: data => setState(previous => ({ ...previous, data })) };
}

export function useInterval(callback, ms) {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    if (!ms) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') saved.current(); }, ms);
    return () => clearInterval(id);
  }, [ms]);
}

export function useTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Little Lantern Café` : 'Little Lantern Café · Coffee, bakes and pickup orders in Bengaluru';
  }, [title]);
}
