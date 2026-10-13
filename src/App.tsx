import { useEffect, useState } from 'react';
import { Editor } from './Editor';
import { Home } from './Home';

/** Minimal hash routing: `#/` = list of maps, `#/map/<id>[/<loadout>]` = editor. */
function useRoute() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  const m = /^#\/map\/([^/]+)(?:\/([^/]+))?/.exec(hash);
  return m
    ? { page: 'editor' as const, mapId: decodeURIComponent(m[1]), start: m[2] ? decodeURIComponent(m[2]) : undefined }
    : { page: 'home' as const };
}

export default function App() {
  const route = useRoute();
  return route.page === 'editor' ? <Editor key={route.mapId} mapId={route.mapId} start={route.start} /> : <Home />;
}
