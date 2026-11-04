import { el, setChildren, getJson, postJson, renderRich, toast, fmtMs } from '../lib/dom.js';
import { postStream } from '../lib/sse.js';

const STORAGE_KEY = 'semilla.consulta';

const SUGGESTIONS = [
  'Prepara cinco preguntas para abrir una clase sobre el ciclo del agua.',
  'Explícame la diferencia entre evaporación y condensación como si tuviera 10 años.',
  'Escribe una nota breve para las familias sobre la salida al huerto.',
  'Tengo 7 años de experiencia como agricultor y quiero sacarme el título. ¿Por dónde empiezo?',
];

/** El historial vive en memoria y en sessionStorage: cambiar de pestaña no lo borra. */
function loadHistory() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(-40) : [];
  } catch {
    return [];
  }
}

function saveHistory(messages) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-40)));
  } catch {
    /* almacenamiento lleno o deshabilitado: seguimos en memoria */
  }
}

export async function renderConsulta(root) {
  const models = await getJson('/api/models').catch(() => ({ active: null, models: [] }));
  const messages = loadHistory();

  const status = el('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
  const chat = el('div', { class: 'chat chat-tall', role: 'log', 'aria-label': 'Historial de la consulta', 'aria-live': 'polite' });
  const input = el('textarea', {
    rows: 2,
    placeholder: 'Pregunta lo que quieras. El nodo responde con el modelo local, sin conexión.',
    'aria-label': 'Tu pregunta',
  });

  const sendButton = el('button', { type: 'button', class: 'btn btn-primary', text: 'Preguntar' });
  const stopButton = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Detener', disabled: true });
  const clearButton = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Limpiar conversación' });

  let streaming = false;
  let controller = null;

  function paint() {
    // Render completo: solo para el arranque o el «Limpiar conversación».
    setChildren(chat, ...messages.map((message) => bubble(message)));
    chat.scrollTop = chat.scrollHeight;
  }

  function appendMessage(message) {
    // Añade un solo globo sin re-anunciar todo el historial al lector de pantalla.
    chat.append(bubble(message));
    chat.scrollTop = chat.scrollHeight;
  }

  function bubble(message) {
    if (message.role === 'user') {
      return el('div', { class: 'msg msg-user' }, el('div', { class: 'bubble', text: message.text }));
    }

    const meta = el('div', { class: 'msg-meta' });
    if (message.meta) {
      setChildren(
        meta,
        el('span', { text: message.meta.model ?? 'modelo local' }),
        el('span', { text: fmtMs(message.meta.ms) }),
        message.meta.tokensPerSecond ? el('span', { text: `${message.meta.tokensPerSecond} tok/s` }) : null,
      );
    }

    const copy = el('button', {
      type: 'button',
      class: 'btn btn-quiet btn-sm',
      text: 'Copiar',
      onclick: async (event) => {
        try {
          await navigator.clipboard.writeText(message.text);
          event.target.textContent = 'Copiado';
          setTimeout(() => {
            event.target.textContent = 'Copiar';
          }, 1800);
        } catch {
          toast('No se pudo copiar en este navegador');
        }
      },
    });

    return el('div', { class: 'msg' }, el('div', { class: 'bubble' }, renderRich(message.text)), el('div', { class: 'row' }, meta, copy));
  }

  async function ask() {
    const text = input.value.trim();
    if (text === '' || streaming) return;

    messages.push({ role: 'user', text });
    input.value = '';
    input.style.height = '';
    appendMessage({ role: 'user', text });
    saveHistory(messages);

    const placeholder = el('div', { class: 'bubble' }, el('div', { class: 'typing' }, el('i'), el('i'), el('i')));
    const meta = el('div', { class: 'msg-meta', text: 'pensando…' });
    const answer = { role: 'assistant', text: '', meta: null };
    const node = el('div', { class: 'msg' }, placeholder, meta);
    chat.append(node);
    chat.scrollTop = chat.scrollHeight;

    streaming = true;
    sendButton.disabled = true;
    stopButton.disabled = false;
    controller = new AbortController();
    // El chat es role="log"; marcamos busy durante el streaming para que el
    // lector no anuncie cada token y solo lea la respuesta completa al final.
    chat.setAttribute('aria-busy', 'true');
    status.textContent = 'Consultando al modelo local.';
    const started = performance.now();

    try {
      await postStream(
        '/api/ask',
        { message: text },
        {
          signal: controller.signal,
          onMeta: (data) => {
            meta.textContent = data.reason ?? 'modelo local';
            placeholder.replaceChildren();
          },
          onToken: (token) => {
            answer.text += token;
            placeholder.replaceChildren(renderRich(answer.text));
            chat.scrollTop = chat.scrollHeight;
          },
          onDone: (data) => {
            chat.removeAttribute('aria-busy');
            if (data.aborted) {
              meta.textContent = 'detenido por ti';
              status.textContent = 'Consulta detenida.';
              return;
            }
            answer.meta = {
              model: models.active,
              ms: data.ms ?? performance.now() - started,
              tokensPerSecond: data.tokensPerSecond ?? null,
            };
            setChildren(
              meta,
              el('span', { text: answer.meta.model ?? 'modelo local' }),
              el('span', { text: fmtMs(answer.meta.ms) }),
              answer.meta.tokensPerSecond ? el('span', { text: `${answer.meta.tokensPerSecond} tok/s` }) : null,
            );
            status.textContent = 'Respuesta lista.';
          },
          onError: (error) => {
            chat.removeAttribute('aria-busy');
            answer.text = answer.text || `No he podido responder: ${error.message}`;
            placeholder.replaceChildren(renderRich(answer.text));
            meta.textContent = 'sin respuesta';
            status.textContent = 'Error al consultar el modelo.';
          },
        },
      );
    } catch (error) {
      if (error.name !== 'AbortError') {
        answer.text = answer.text || `No he podido responder: ${error.message}`;
        placeholder.replaceChildren(renderRich(answer.text));
        meta.textContent = 'sin respuesta';
      }
    } finally {
      chat.removeAttribute('aria-busy');
      streaming = false;
      sendButton.disabled = false;
      stopButton.disabled = true;
      controller = null;
      if (answer.text.trim() !== '') {
        messages.push(answer);
        saveHistory(messages);
        // Sustituimos el placeholder por el globo final con su meta. append-only.
        node.replaceWith(bubble(answer));
      } else {
        node.remove();
      }
      input.focus();
    }
  }

  sendButton.addEventListener('click', ask);
  stopButton.addEventListener('click', () => controller?.abort());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void ask();
    }
  });
  clearButton.addEventListener('click', () => {
    messages.length = 0;
    saveHistory(messages);
    paint(); // «Limpiar» sí necesita el render completo.
    input.focus();
  });

  const suggestions = el(
    'div',
    { class: 'row' },
    SUGGESTIONS.map((text) =>
      el('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        text,
        onclick: () => {
          input.value = text;
          input.focus();
        },
      }),
    ),
  );

  root.append(
    el(
      'header',
      { class: 'page-head' },
      el(
        'div',
        {},
        el('p', { class: 'eyebrow', text: 'Mesa de consulta' }),
        el('h1', { text: 'Pregúntale al modelo' }),
        el('p', {
          text: 'Sin cartucho y sin guion: el modelo local tal cual. Pensado para el docente o el adulto que acompaña el aula.',
        }),
      ),
      el(
        'div',
        { class: 'row' },
        models.active ? el('span', { class: 'tag tag-ok', text: models.active }) : null,
        el('span', { class: 'tag', text: 'sin conexión' }),
      ),
    ),

    el(
      'p',
      { class: 'notice notice-info' },
      'Este espacio no lleva las reglas de los cartuchos pedagógicos. El aula de los alumnos trabaja con «Aula», donde cada respuesta tiene un marco revisado.',
    ),

    suggestions,

    el('div', { class: 'card chat-card' }, status, chat, el('div', { class: 'composer' }, input, sendButton), el('div', { class: 'composer-actions' }, stopButton, clearButton, el('span', { class: 'tiny muted', text: 'Enter envía · Mayús+Enter salta de línea' }))),
  );

  paint();
}
