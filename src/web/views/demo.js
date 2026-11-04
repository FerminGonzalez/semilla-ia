/**
 * Modo presentación: recorrido guiado de ~90 s para la demo del hackatón.
 *
 * Es una ayuda para el presentador, no parte de la experiencia del alumno:
 * - Estado solo de sesión (nada se persiste en storage ni en la URL como tal).
 * - No bloquea el resto de la página: la barra es una región inferior, no un modal.
 * - Atajo de teclado: Alt+P (abre/cierra).
 * - Flecha derecha → siguiente, Flecha izquierda → anterior, Escape → salir.
 */

import { el } from '../lib/dom.js';

const STEPS = [
  { hash: '#/', cue: 'Panel del nodo: señala el modelo local, la memoria medida y la etiqueta naranja de 1,2 W — «esto es proyección, no medida».' },
  { hash: '#/aula?tab=conversar', cue: 'Aula, conversación: pregunta por qué se seca un plato al sol. El modelo escribe en directo; lee la línea de tiempo bajo la respuesta.' },
  { hash: '#/aula?tab=conversar', cue: 'Mismo aula, segundo motor: reparte 24 semillas entre 4. La respuesta sale en milisegundos, marcada como motor simbólico.' },
  { hash: '#/aula?tab=formas', cue: 'Muchas formas: convierte una lección en lectura fácil, audio y mapa. La legibilidad pasa de 21 a 8 palabras por fragmento.' },
  { hash: '#/consulta', cue: 'Consulta libre: el docente o el adulto pregunta al modelo sin cartucho. Streaming y copiado, la pieza más nueva.' },
  { hash: '#/docente', cue: 'Panel docente: abre con PIN. Dudas agrupadas, dinámica para mañana y rúbrica en segundos.' },
  { hash: '#/hardware', cue: 'Hardware: el sensor entra por HTTP y la IA razona sobre el dato real. El paquete federado de 17 bytes cabe en un marco LoRa.' },
  { hash: '#/etica', cue: 'Ética y límites: cada afirmación de esta página se puede comprobar en la misma máquina.' },
  { hash: '#/', cue: 'Cierre: «lo que ven funcionar es el software completo; lo que falta es la fábrica».' },
];

let index = 0;
let active = false;
let bar = null;
let progressEl = null;
let cueEl = null;
let prevButton = null;
let nextButton = null;
let booted = false;
let syncingHash = false;

/** El router la consulta para no robar el foco a la barra durante el recorrido. */
export function isDemoActive() {
  return active;
}

export function initDemo() {
  if (booted) return;
  booted = true;

  const launch = document.getElementById('demo-launch');
  if (launch) launch.addEventListener('click', start);

  document.addEventListener('keydown', (event) => {
    // Evita el doble-toggle rápido al mantener la tecla pulsada.
    if (event.repeat) return;
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.shiftKey &&
      (event.key === 'p' || event.key === 'P')
    ) {
      event.preventDefault();
      if (active) stop();
      else start();
    }
  });

  // Si el presentador cambia el hash por otra vía (Atrás/Adelante, clic en el
  // sidebar), la barra se resincroniza con el paso correspondiente o se cierra.
  window.addEventListener('hashchange', () => {
    if (!active || syncingHash) return;
    const i = STEPS.findIndex((s) => s.hash === window.location.hash);
    if (i >= 0) {
      index = i;
      update();
    } else {
      stop();
    }
  });
}

function start() {
  stop();

  index = 0;
  active = true;

  progressEl = el('span', { class: 'cue-bar__progress' });
  cueEl = el('p', { class: 'cue-bar__cue', 'aria-live': 'polite' });
  prevButton = el('button', { type: 'button', class: 'cue-bar__btn', text: 'Anterior', onclick: prev });
  nextButton = el('button', {
    type: 'button',
    class: 'cue-bar__btn cue-bar__btn--primary',
    text: 'Siguiente',
    onclick: next,
  });
  const quitButton = el('button', {
    type: 'button',
    class: 'cue-bar__btn cue-bar__btn--quit',
    text: 'Salir',
    onclick: stop,
  });

  bar = el(
    'div',
    {
      class: 'cue-bar',
      role: 'region',
      'aria-label': 'Recorrido de presentación',
      tabindex: '-1',
    },
    el('div', { class: 'cue-bar__body' }, progressEl, cueEl),
    el('div', { class: 'cue-bar__actions' }, prevButton, nextButton, quitButton),
  );

  document.body.append(bar);
  document.body.classList.add('is-demo');
  document.addEventListener('keydown', onKeydown);

  goTo(0);
  bar.focus({ preventScroll: true });
}

function stop() {
  if (!active && bar === null) return;
  active = false;
  document.removeEventListener('keydown', onKeydown);
  document.body.classList.remove('is-demo');
  bar?.remove();
  bar = null;
  progressEl = null;
  cueEl = null;
  prevButton = null;
  nextButton = null;
  // En móvil, el botón del sidebar queda oculto (`.sidebar-foot { display: none }`);
  // devolver el foco ahí no hace nada. Caemos en el skip-link, que siempre está.
  const launch = document.getElementById('demo-launch');
  const fallback = launch?.offsetParent ? launch : document.querySelector('.skip-link');
  fallback?.focus({ preventScroll: true });
}

function goTo(i) {
  index = Math.max(0, Math.min(STEPS.length - 1, i));
  const step = STEPS[index];
  // El recorrido no debe contaminar el historial del navegador (Atrás no debe
  // repasar los 9 pasos uno a uno). Si el hash ya es el correcto, no hacemos nada.
  if (window.location.hash === step.hash) {
    update();
    return;
  }
  syncingHash = true;
  try {
    history.replaceState(null, '', step.hash);
  } catch {
    // Fallback: algunos navegadores restringen replaceState con hash vacío.
    window.location.hash = step.hash;
  }
  syncingHash = false;
  update();
}

function update() {
  const step = STEPS[index];
  progressEl.textContent = `Paso ${index + 1} de ${STEPS.length}`;
  cueEl.textContent = step.cue;
  prevButton.disabled = index === 0;
  nextButton.disabled = index === STEPS.length - 1;
}

function next() {
  goTo(index + 1);
}

function prev() {
  goTo(index - 1);
}

function onKeydown(event) {
  // No secuestres el teclado si el foco está en un campo editable (composers
  // del Aula, Consulta, formulario del Hardware…). Flechas ahí son navegación
  // del texto, no del recorrido.
  const target = event.target;
  if (
    target &&
    target.closest &&
    target.closest('input, textarea, select, [contenteditable="true"]')
  ) {
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    next();
  } else if (event.key === 'ArrowLeft') {
    event.preventDefault();
    prev();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    stop();
  }
}
