import { getJson, toast } from './lib/dom.js';
import { renderNodo } from './views/nodo.js';
import { renderAula, setInitialTab } from './views/aula.js';
import { renderConsulta } from './views/consulta.js';
import { renderDocente } from './views/docente.js';
import { renderHardware } from './views/hardware.js';
import { renderEtica } from './views/etica.js';
import { initDemo, isDemoActive } from './views/demo.js';

const ROUTES = {
  '/': { render: renderNodo, nav: 'nodo', title: 'Nodo' },
  '/aula': { render: renderAula, nav: 'aula', title: 'Aula' },
  '/consulta': { render: renderConsulta, nav: 'consulta', title: 'Consulta libre' },
  '/docente': { render: renderDocente, nav: 'docente', title: 'Panel docente' },
  '/hardware': { render: renderHardware, nav: 'hardware', title: 'Hardware' },
  '/etica': { render: renderEtica, nav: 'etica', title: 'Ética y datos' },
};

const main = document.getElementById('contenido');

/** Evita que dos renders concurrentes se pisen y dupliquen la vista. */
let renderToken = 0;
let booted = false;

/** Descompone el hash en ruta + query (#/aula?tab=formas → /aula + { tab: 'formas' }).
 *  Los anclajes internos (#contenido) o las URLs sin ruta se tratan como la raíz,
 *  así el skip-link y Atrás hasta una URL sin hash no rompen el render. */
function parseHash() {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw.startsWith('/')) {
    return { path: '/', query: new URLSearchParams() };
  }
  const qIndex = raw.indexOf('?');
  if (qIndex === -1) return { path: raw === '' ? '/' : raw, query: new URLSearchParams() };
  return {
    path: raw.slice(0, qIndex) || '/',
    query: new URLSearchParams(raw.slice(qIndex + 1)),
  };
}

async function render() {
  const token = ++renderToken;
  const { path, query } = parseHash();
  const route = ROUTES[path];

  // Deep-link de pestaña del Aula (p. ej. #/aula?tab=formas). Un valor no
  // válido se ignora en aula.js, que cae en «conversar».
  if (path === '/aula') setInitialTab(query.get('tab'));

  for (const link of document.querySelectorAll('[data-nav]')) {
    if (route && link.dataset.nav === route.nav) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }

  if (!route) {
    main.replaceChildren(notFound(path));
    return;
  }

  try {
    // La vista se construye en un fragmento y se monta de golpe: si el usuario
    // cambia de pestaña a mitad de una carga, el resultado viejo no se cuela.
    const staging = document.createDocumentFragment();
    await route.render(staging);
    if (token !== renderToken) return;
    main.replaceChildren(staging);
    document.title = `${route.title} · Semilla-IA`;
    if (!isDemoActive()) main.focus({ preventScroll: true });
  } catch (error) {
    if (token !== renderToken) return;
    const section = document.createElement('section');
    section.className = 'notice notice-bad';
    section.setAttribute('role', 'alert');
    section.textContent = `No se pudo cargar la vista: ${error.message}`;
    main.replaceChildren(section);
    toast(error.message, 'error');
  }
}

function notFound(path) {
  const section = document.createElement('section');
  section.className = 'card';
  const title = document.createElement('h1');
  title.textContent = 'Esa página no existe';
  const text = document.createElement('p');
  text.className = 'muted';
  text.textContent = `La ruta «${path}» no forma parte del nodo.`;
  const link = document.createElement('a');
  link.className = 'btn btn-primary';
  link.href = '#/';
  link.textContent = 'Volver al nodo';
  section.append(title, text, link);
  return section;
}

async function updateStatus() {
  const dot = document.querySelector('#sidebar-status .dot');
  const text = document.getElementById('sidebar-status-text');
  if (!dot || !text) return;
  try {
    const profile = await getJson('/api/profile');
    const modelReady = profile.model?.available === true;
    dot.className = `dot ${modelReady ? 'ok' : 'warn'}`;
    text.textContent = modelReady ? 'modelo local listo' : 'solo simbólico';
  } catch {
    dot.className = 'dot bad';
    text.textContent = 'nodo sin respuesta';
  }
}

function boot() {
  if (booted) return;
  booted = true;
  initDemo();
  void render();
  void updateStatus();
  setInterval(updateStatus, 20_000);
}

// Solo reaccionamos a hashes de ruta (#/...). Los anclajes internos (#contenido
// del «Saltar al contenido», por ejemplo) no deben disparar un re-render, y una
// URL sin hash tampoco (puede venir de haber pulsado Atrás hasta el estado inicial).
window.addEventListener('hashchange', () => {
  if (!window.location.hash.startsWith('#/')) return;
  void render();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
