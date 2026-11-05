/**
 * Vista del traductor español ↔ ngäbere ↔ inglés.
 *
 * Llama a las rutas del nodo:
 *   GET  /api/idiomas   → lista de idiomas disponibles
 *   POST /api/traducir  → traduce un texto
 *
 * No requiere autenticación. Funciona 100 % offline.
 */
import { el, setChildren, getJson, postJson, toast } from '../lib/dom.js';

const IDIOMAS_NOMBRE = {
  es: 'Español',
  ng: 'Ngäbere',
  en: 'English',
};

/**
 * Crea un elemento <option> para un idioma.
 */
function optionIdioma(codigo, nombre) {
  return el('option', { value: codigo, text: `${nombre} (${codigo})` });
}

/**
 * Renderiza la vista del traductor dentro de `root`.
 */
export async function renderTraductor(root) {
  // Cargar idiomas disponibles desde el nodo
  let idiomas = [];
  try {
    const data = await getJson('/api/idiomas');
    idiomas = data.disponibles ?? [];
  } catch {
    idiomas = [
      { codigo: 'es', nombre: 'Español' },
      { codigo: 'ng', nombre: 'Ngäbere' },
      { codigo: 'en', nombre: 'English' },
    ];
  }

  const input = el('textarea', {
    rows: 4,
    placeholder: 'Escribe el texto que quieres traducir…',
    'aria-label': 'Texto a traducir',
  });

  const desde = el('select', { 'aria-label': 'Idioma origen' });
  const hacia = el('select', { 'aria-label': 'Idioma destino' });

  for (const idioma of idiomas) {
    desde.appendChild(optionIdioma(idioma.codigo, idioma.nombre));
    hacia.appendChild(optionIdioma(idioma.codigo, idioma.nombre));
  }

  // Valor por defecto: español → ngäbere
  desde.value = 'es';
  hacia.value = 'ng';

  const btn = el('button', {
    type: 'button',
    class: 'btn btn-primary',
    text: 'Traducir',
  });

  const resultado = el('div', {
    class: 'card notice',
    role: 'status',
    'aria-live': 'polite',
    style: 'margin-top: 1rem; padding: 1rem; display: none;',
  });

  const textoResultado = el('p', { class: 'lead' });
  const metaResultado = el('p', { class: 'muted small' });

  resultado.append(textoResultado, metaResultado);

  async function traducir() {
    const texto = input.value.trim();
    if (!texto) {
      toast('Escribe un texto para traducir', 'warn');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Traduciendo…';

    try {
      const data = await postJson('/api/traducir', {
        texto,
        desde: desde.value,
        hacia: hacia.value,
      });

      resultado.style.display = 'block';
      textoResultado.textContent = data.texto;

      const motorLabel =
        data.motor === 'diccionario'
          ? 'diccionario estático'
          : data.motor === 'modelo-ajustado'
            ? 'modelo ngäbere ajustado'
            : data.motor;

      metaResultado.textContent =
        `Motor: ${motorLabel} · Confianza: ${Math.round((data.confianza ?? 0) * 100)}% · ${data.desde.toUpperCase()} → ${data.hacia.toUpperCase()}`;

      if (data.nota) {
        metaResultado.textContent += ` · ${data.nota}`;
      }
    } catch (error) {
      toast(error.message ?? 'Error al traducir', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Traducir';
    }
  }

  btn.addEventListener('click', traducir);

  // También traducir con Enter (sin Shift)
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      traducir();
    }
  });

  root.append(
    el(
      'header',
      { class: 'page-head' },
      el(
        'div',
        {},
        el('p', { class: 'eyebrow', text: 'Traductor de lengua indígena' }),
        el('h1', { text: 'Español ↔ Ngäbere ↔ English' }),
        el('p', {
          text: 'Traduce frases clave del aula entre español, ngäbere e inglés. Funciona sin internet, con diccionario estático y modelo ngäbere ajustado.',
        }),
      ),
    ),

    el(
      'div',
      { class: 'grid grid-3' },
      el(
        'div',
        {},
        el('label', { text: 'Texto', class: 'label' }),
        input,
      ),
      el(
        'div',
        {},
        el('label', { text: 'Desde', class: 'label' }),
        desde,
      ),
      el(
        'div',
        {},
        el('label', { text: 'Hacia', class: 'label' }),
        hacia,
      ),
    ),

    btn,
    resultado,
  );
}
