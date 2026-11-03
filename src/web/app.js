import { getJson, toast } from './lib/dom.js';
import { renderNodo } from './views/nodo.js';
import { renderAula } from './views/aula.js';
import { renderConsulta } from './views/consulta.js';
import { renderDocente } from './views/docente.js';
import { renderHardware } from './views/hardware.js';
import { renderEtica } from './views/etica.js';

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

function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  return hash === '' ? '/' : hash.split('?')[0];
}

async function render() {
  const token = ++renderToken;
  const path = currentPath();
  const route = ROUTES[path];

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
    main.focus({ preventScroll: true });
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
  void render();
  void updateStatus();
  setInterval(updateStatus, 20_000);
}

window.addEventListener('hashchange', () => void render());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
