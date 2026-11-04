import { el, setChildren, getJson, postJson, renderRich, toast, tag, fmtMs, svg } from '../lib/dom.js';
import { postStream } from '../lib/sse.js';

const SUGGESTIONS = {
  mate: [
    'Tengo 24 semillas y quiero repartirlas entre 4 amigos, ¿cuántas toca a cada uno?',
    'No entiendo las fracciones, explícamelo con algo de casa.',
  ],
  ciencias: [
    '¿Por qué se seca el agua de un plato al sol?',
    '¿Cómo hago un experimento con la planta del patio?',
  ],
  lengua: [
    'Corrige esta frase y hazla más fácil: "Los alumnos que habían llegado tarde no pudieron realizar la actividad que la profesora había preparado con anterioridad".',
    '¿Cómo explico la diferencia entre sujeto y predicado?',
  ],
  emocional: [
    'Hoy no puedo concentrarme, tengo miedo.',
    'Me he enfadado con un compañero y no sé qué hacer.',
  ],
};

const SAMPLE_LESSON = `El ciclo del agua describe el movimiento continuo del agua en la Tierra. El sol calienta el agua de mares, ríos y lagos, que se evapora y pasa a la atmósfera en forma de vapor. Cuando ese vapor se enfría en las capas altas, se condensa en pequeñas gotitas que forman las nubes. Finalmente, esas gotitas se agrupan y caen como precipitación en forma de lluvia, nieve o granizo, y el agua vuelve al suelo, a los ríos y al mar para empezar de nuevo.`;

const TAB_IDS = ['conversar', 'formas', 'taller', 'sobre'];
let pendingTab = null;

/** El router puede pedir una pestaña inicial (deep-link #/aula?tab=formas). */
export function setInitialTab(tab) {
  pendingTab = TAB_IDS.includes(tab) ? tab : null;
}

export async function renderAula(root) {
  let active = pendingTab ?? 'conversar';
  pendingTab = null;
  const cartridges = await getJson('/api/cartridges');

  const state = {
    cartridge: 'mate',
    grade: '5º primaria',
    topic: 'fracciones',
    engine: 'auto',
    messages: [],
    streaming: false,
    controller: null,
  };

  /* ------------------------------- cabecera ------------------------------- */
  const header = el(
    'header',
    { class: 'page-head' },
    el(
      'div',
      {},
      el('p', { class: 'eyebrow', text: 'Reto 02 · Aprender sin conexión' }),
      el('h1', { text: 'Aula-Semilla' }),
      el('p', { text: 'El alumno escribe; el nodo responde sin salir del equipo. Cada cartucho cambia el enfoque, no el alumno.' }),
    ),
  );

  const tabs = el('div', { class: 'tabs', role: 'group', 'aria-label': 'Herramientas del aula' });
  const panel = el('div', { role: 'region', 'aria-label': 'Contenido de la herramienta' });

  const views = {
    conversar: () => chatView(),
    formas: () => formsView(),
    taller: () => workshopView(),
    sobre: () => aboutView(),
  };

  const buttons = [
    ['conversar', 'Conversar'],
    ['formas', 'Muchas formas'],
    ['taller', 'Taller'],
    ['sobre', 'Cómo funciona'],
  ].map(([id, label]) => {
    const button = el('button', {
      type: 'button',
      text: label,
      'aria-pressed': String(id === active),
      onclick: () => {
        // Cambiar de herramienta nunca puede dejar una generación huérfana.
        state.controller?.abort();
        state.controller = null;
        state.streaming = false;

        active = id;
        for (const other of tabs.querySelectorAll('button')) {
          other.setAttribute('aria-pressed', String(other.dataset.id === id));
        }
        panel.replaceChildren(views[id]());
      },
    });
    button.dataset.id = id;
    tabs.append(button);
    return button;
  });

  root.append(header, tabs, panel);
  panel.append(views[active]());

  /* -------------------------------- chat ---------------------------------- */

  function chatView() {
    const wrapper = el('div', { class: 'stack' });

    const detail = el('p', { class: 'small muted' });
    const suggestions = el('div', { class: 'row' });

    const chat = el('div', { class: 'chat', role: 'log', 'aria-label': 'Conversación', 'aria-live': 'polite' });
    const liveStatus = el('p', { class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    const composerInput = el('textarea', {
      rows: 2,
      placeholder: placeholderFor(state.cartridge),
      'aria-label': 'Escribe tu pregunta',
    });

    function suggestionChips() {
      return (SUGGESTIONS[state.cartridge] ?? []).map((text) =>
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text,
          onclick: () => {
            composerInput.value = text;
            composerInput.focus();
          },
        }),
      );
    }

    function cartridgeBar() {
      const grid = el('div', { class: 'cartridges', role: 'group', 'aria-label': 'Cartuchos pedagógicos' });
      for (const cartridge of cartridges) {
        const button = el(
          'button',
          {
            type: 'button',
            class: 'cartridge',
            'aria-pressed': String(cartridge.id === state.cartridge),
            style: `border-left-color:${cartridge.accent}`,
            onclick: () => {
              state.cartridge = cartridge.id;
              for (const other of grid.querySelectorAll('.cartridge')) {
                other.setAttribute('aria-pressed', String(other.dataset.id === cartridge.id));
              }
              suggestions.replaceChildren(...suggestionChips());
              detail.textContent = `${cartridge.reto} · ${cartridge.tagline}`;
              composerInput.placeholder = placeholderFor(cartridge.id);
            },
          },
          el('strong', { text: cartridge.name }),
          el('span', { text: cartridge.role }),
        );
        button.dataset.id = cartridge.id;
        grid.append(button);
      }
      return grid;
    }


    const sendButton = el('button', { type: 'button', class: 'btn btn-primary', text: 'Preguntar' });
    const stopButton = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Detener', disabled: true });
    const engineSelect = el(
      'select',
      { 'aria-label': 'Motor de respuesta' },
      el('option', { value: 'auto', text: 'Motor automático' }),
      el('option', { value: 'symbolic', text: 'Forzar simbólico' }),
      el('option', { value: 'llm', text: 'Forzar modelo local' }),
    );
    const gradeInput = el('input', { type: 'text', value: state.grade, 'aria-label': 'Curso' });
    const topicInput = el('input', { type: 'text', value: state.topic, 'aria-label': 'Tema' });

    const composer = el(
      'div',
      {},
      el('div', { class: 'composer' }, composerInput, sendButton),
      el(
        'div',
        { class: 'composer-actions' },
        el('label', { class: 'field', style: 'max-width:150px' }, el('span', { text: 'Curso' }), gradeInput),
        el('label', { class: 'field', style: 'max-width:180px' }, el('span', { text: 'Tema' }), topicInput),
        el('label', { class: 'field', style: 'max-width:190px' }, el('span', { text: 'Motor' }), engineSelect),
        stopButton,
      ),
    );

    const ask = async () => {
      const text = composerInput.value.trim();
      if (text === '' || state.streaming) return;

      state.grade = gradeInput.value.trim() || '5º primaria';
      state.topic = topicInput.value.trim();
      state.engine = engineSelect.value;

      chat.append(userMessage(text));
      composerInput.value = '';
      composerInput.style.height = '';

      const bubble = el('div', { class: 'bubble' }, el('div', { class: 'typing' }, el('i'), el('i'), el('i')));
      const meta = el('div', { class: 'msg-meta', text: 'pensando…' });
      const assistant = el('div', { class: 'msg' }, bubble, meta);
      chat.append(assistant);
      chat.scrollTop = chat.scrollHeight;

      // El chat es role="log"; marcamos busy durante el streaming para que el
      // lector no anuncie cada token y solo lea la respuesta completa al final.
      chat.setAttribute('aria-busy', 'true');

      state.streaming = true;
      stopButton.disabled = false;
      sendButton.disabled = true;
      state.controller = new AbortController();

      let answer = '';
      let started = performance.now();

      try {
        await postStream(
          '/api/chat',
          {
            cartridge: state.cartridge,
            message: text,
            grade: state.grade,
            topic: state.topic,
            engine: state.engine,
          },
          {
            signal: state.controller.signal,
            onMeta: (data) => {
              setChildren(
                meta,
                el('span', { text: `motor: ${data.engine === 'llm' ? 'modelo local' : 'simbólico'}` }),
                el('span', { text: data.reason ?? '' }),
              );
              liveStatus.textContent = data.engine === 'llm' ? 'Pensando con el modelo local.' : 'Resolviendo en el nodo.';
              bubble.replaceChildren();
            },
            onToken: (token) => {
              answer += token;
              bubble.replaceChildren(renderRich(answer));
              chat.scrollTop = chat.scrollHeight;
            },
            onDone: (data) => {
              chat.removeAttribute('aria-busy');
              const elapsed = data.ms ?? performance.now() - started;
              setChildren(
                meta,
                el('span', { text: data.engine === 'llm' ? 'modelo local' : 'motor simbólico' }),
                el('span', { text: fmtMs(elapsed) }),
                data.tokensPerSecond ? el('span', { text: `${data.tokensPerSecond} tok/s` }) : null,
                el('span', { text: data.reason ?? '' }),
              );
              liveStatus.textContent = 'Respuesta lista.';
            },
            onError: (error) => {
              chat.removeAttribute('aria-busy');
              bubble.replaceChildren(renderRich(`No he podido responder: ${error.message}`));
            },
          },
        );
      } catch (error) {
        if (error.name !== 'AbortError') {
          bubble.replaceChildren(renderRich(`No he podido responder: ${error.message}`));
        } else {
          setChildren(meta, el('span', { text: 'detenido por ti' }));
        }
      } finally {
        chat.removeAttribute('aria-busy');
        state.streaming = false;
        stopButton.disabled = true;
        sendButton.disabled = false;
        state.controller = null;
        if (answer === '' && bubble.textContent === '') bubble.append(renderRich('Sin respuesta.'));
      }
    };

    sendButton.addEventListener('click', ask);
    stopButton.addEventListener('click', () => state.controller?.abort());
    composerInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        void ask();
      }
    });

    suggestions.replaceChildren(...suggestionChips());
    detail.textContent = `${cartridges.find((c) => c.id === state.cartridge)?.reto ?? ''} · ${
      cartridges.find((c) => c.id === state.cartridge)?.tagline ?? ''
    }`;

    if (state.messages.length === 0) {
      chat.append(welcomeMessage(cartridges.find((c) => c.id === state.cartridge)));
    }

    wrapper.append(
      cartridgeBar(),
      detail,
      el('p', { class: 'small muted', text: 'Prueba una de estas para ver la diferencia de motor:' }),
      suggestions,
      el('div', { class: 'card', style: 'padding:0.9rem' }, liveStatus, chat, composer),
    );

    return wrapper;
  }

  function placeholderFor(id) {
    return (
      {
        mate: 'Escribe el problema con tus palabras…',
        ciencias: '¿Qué has observado hoy?',
        lengua: 'Pega tu frase y la hacemos más fácil…',
        emocional: '¿Cómo estás hoy?',
      }[id] ?? 'Escribe tu pregunta…'
    );
  }

  function userMessage(text) {
    return el('div', { class: 'msg msg-user' }, el('div', { class: 'bubble', text }));
  }

  function welcomeMessage(cartridge) {
    if (!cartridge) return el('div');
    return el(
      'div',
      { class: 'msg' },
      el(
        'div',
        { class: 'bubble' },
        renderRich(
          `**${cartridge.name}** · ${cartridge.role}\n\n${cartridge.tagline}\n\nEscríbeme lo que necesites. No hay nota y no hay prisa.`,
        ),
      ),
      el('div', { class: 'msg-meta' }, el('span', { text: 'nodo local' }), el('span', { text: 'sin conexión' })),
    );
  }

  /* ---------------------------- transcodificador -------------------------- */

  function formsView() {
    const wrapper = el('div', { class: 'stack' });
    const titleInput = el('input', { type: 'text', value: 'El ciclo del agua', 'aria-label': 'Título de la lección' });
    const sourceInput = el('textarea', { rows: 6, 'aria-label': 'Texto de la lección' });
    sourceInput.value = SAMPLE_LESSON;

    const output = el('div', {});
    const runButton = el('button', { type: 'button', class: 'btn btn-primary', text: 'Convertir en tres formatos' });

    runButton.addEventListener('click', async () => {
      runButton.disabled = true;
      runButton.textContent = 'Convirtiendo…';
      const startedAt = performance.now();
      try {
        const result = await postJson('/api/transcode', {
          title: titleInput.value,
          source: sourceInput.value,
          grade: state.grade,
        });
        const elapsed = performance.now() - startedAt;
        output.replaceChildren(formsResult(result));
        toast(`Tres formatos generados en ${fmtMs(elapsed)}`);
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        runButton.disabled = false;
        runButton.textContent = 'Convertir en tres formatos';
      }
    });

    wrapper.append(
      el(
        'section',
        { class: 'card' },
        el('h2', { text: 'Reto 03 · Un contenido, muchas formas' }),
        el('p', {
          class: 'small muted',
          text: 'Una lección entra; salen tres formatos equivalentes. Lo resuelve el motor simbólico: mismo texto, mismo resultado, sin gastar el modelo.',
        }),
        el('label', { class: 'field' }, el('span', { text: 'Título' }), titleInput),
        el('label', { class: 'field' }, el('span', { text: 'Texto de la lección' }), sourceInput),
        el('div', { class: 'row' }, runButton, tag('instantáneo', 'ok'), tag('sin modelo', 'info')),
      ),
      output,
    );

    return wrapper;
  }

  function formsResult(result) {
    const lines = Array.isArray(result.easyReadLines)
      ? result.easyReadLines
      : String(result.easyRead).split('\n');

    const easy = el(
      'div',
      { class: 'form-block' },
      el('h3', { text: 'Lectura fácil' }),
      el(
        'ol',
        { class: 'easy-lines' },
        lines.map((line) => el('li', { text: line })),
      ),
      el('p', {
        class: 'tiny muted',
        text: 'Una idea por línea. Se mide sobre estas líneas, no sobre el texto original.',
      }),
    );

    const audio = el(
      'div',
      { class: 'form-block' },
      el('h3', { text: 'Guion de audio' }),
      el('p', { class: 'audio-script', text: result.audioScript }),
      el('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        text: 'Escuchar',
        onclick: () => speak(result.audioScript),
      }),
      el('p', { class: 'tiny muted', text: 'Voz del propio dispositivo. No descarga nada.' }),
    );

    const mapBlock = el(
      'div',
      { class: 'form-block' },
      el('h3', { text: 'Mapa conceptual' }),
      conceptMapSvg(result.conceptMap),
      el('details', {}, el('summary', { class: 'small', text: 'Ver como texto' }), el('pre', { class: 'map-text', text: result.conceptMapText ?? mapAsText(result.conceptMap) })),
    );

    const metrics = el(
      'div',
      { class: 'card' },
      el('h2', { text: 'Legibilidad' }),
      el(
        'div',
        { class: 'grid grid-3' },
        el('div', {}, el('span', { class: 'metric-label', text: 'Antes' }), el('p', { class: 'mono', text: `${result.readability.before.wordsPerSentence} palabras/frase · ${result.readability.before.band}` })),
        el('div', {}, el('span', { class: 'metric-label', text: 'Después' }), el('p', { class: 'mono', text: `${result.readability.after.wordsPerSentence} palabras/fragmento · ${result.readability.after.band}` })),
        el('div', {}, el('span', { class: 'metric-label', text: 'Unidades' }), el('p', { class: 'mono', text: `${result.meta.sentencesIn} frases → ${result.meta.sentencesOut} fragmentos` })),
      ),
    );

    return el('div', { class: 'stack' }, el('div', { class: 'forms-output' }, easy, audio, mapBlock), metrics);
  }

  function mapAsText(map) {
    const children = new Map();
    for (const edge of map.edges) {
      if (!children.has(edge.from)) children.set(edge.from, []);
      children.get(edge.from).push(edge.to);
    }
    const label = (id) => map.nodes.find((node) => node.id === id)?.label ?? id;
    const lines = [];
    const walk = (id, depth) => {
      lines.push(`${'  '.repeat(depth)}- ${label(id)}`);
      for (const child of children.get(id) ?? []) walk(child, depth + 1);
    };
    if (map.nodes[0]) walk(map.nodes[0].id, 0);
    return lines.join('\n');
  }

  function conceptMapSvg(map) {
    const width = 660;
    const level1 = map.nodes.filter((node) => node.level === 1);
    const height = 150 + (level1.length > 0 ? 130 : 0);
    const canvas = svg('svg', {
      class: 'map-svg',
      viewBox: `0 0 ${width} ${height}`,
      role: 'img',
      'aria-label': `Mapa conceptual con ${map.nodes.length} ideas`,
    });

    const rootNode = map.nodes.find((node) => node.level === 0);
    const rootX = width / 2;
    const rootY = 44;

    const positions = new Map([[rootNode.id, { x: rootX, y: rootY }]]);
    const spacing = level1.length > 0 ? Math.min(150, (width - 80) / level1.length) : 150;

    level1.forEach((node, index) => {
      const x = rootX + (index - (level1.length - 1) / 2) * spacing;
      positions.set(node.id, { x, y: 130 });
    });

    for (const edge of map.edges) {
      const from = positions.get(edge.from);
      const to = positions.get(edge.to);
      if (!from || !to) continue;
      canvas.append(
        svg('line', {
          x1: from.x,
          y1: from.y,
          x2: to.x,
          y2: to.y,
          stroke: '#c6bda5',
          'stroke-width': 1.4,
        }),
      );
    }

    for (const node of map.nodes) {
      const position = positions.get(node.id);
      if (!position) continue;
      const isRoot = node.level === 0;
      const text = node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label;
      canvas.append(
        svg(
          'rect',
          {
            x: position.x - (isRoot ? 92 : 62),
            y: position.y - 16,
            width: isRoot ? 184 : 124,
            height: 32,
            rx: 16,
            fill: isRoot ? '#14532d' : '#fffdf7',
            stroke: isRoot ? '#14532d' : '#c6bda5',
          },
          svg('title', {}, node.label),
        ),
      );
      canvas.append(
        svg(
          'text',
          {
            x: position.x,
            y: position.y + 4,
            'text-anchor': 'middle',
            'font-size': isRoot ? 13 : 11,
            'font-family': 'system-ui, sans-serif',
            fill: isRoot ? '#fffdf7' : '#1b1d17',
          },
          text,
        ),
      );
    }

    // Hojas: se dibujan como texto bajo su nodo padre.
    const leaves = map.nodes.filter((node) => node.level === 2);
    leaves.forEach((leaf) => {
      const parentEdge = map.edges.find((edge) => edge.to === leaf.id);
      const parent = positions.get(parentEdge?.from);
      if (!parent) return;
      canvas.append(
        svg(
          'text',
          {
            x: parent.x,
            y: parent.y + 44,
            'text-anchor': 'middle',
            'font-size': 9.5,
            'font-family': 'system-ui, sans-serif',
            fill: '#5f6555',
          },
          leaf.label.length > 26 ? `${leaf.label.slice(0, 25)}…` : leaf.label,
        ),
      );
    });

    return canvas;
  }

  function speak(text) {
    if (!('speechSynthesis' in window)) {
      toast('Este dispositivo no tiene voz instalada', 'error');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-ES';
    utterance.rate = 0.95;
    const voice = window.speechSynthesis.getVoices().find((item) => item.lang.startsWith('es'));
    if (voice) utterance.voice = voice;
    window.speechSynthesis.speak(utterance);
  }

  /* --------------------------------- taller -------------------------------- */

  function workshopView() {
    const DOMAIN_LABEL = {
      fractions: 'fracciones',
      math: 'operaciones',
      language: 'lengua',
      science: 'ciencias',
      mixed: 'mixto',
    };

    const wrapper = el('div', { class: 'stack' });
    const topicInput = el('input', { type: 'text', value: state.topic, 'aria-label': 'Tema de los ejercicios' });
    const gradeInput = el('input', { type: 'text', value: state.grade, 'aria-label': 'Curso' });
    const countInput = el('input', { type: 'number', min: 1, max: 8, value: 4, 'aria-label': 'Número de ejercicios' });
    const generate = el('button', { type: 'button', class: 'btn btn-primary', text: 'Generar ejercicios' });
    const list = el('div', { class: 'stack' });
    const score = el('p', { class: 'small muted', text: 'Sin corregir todavía.' });

    let correct = 0;
    const scored = new Set();

    generate.addEventListener('click', async () => {
      generate.disabled = true;
      try {
        const result = await postJson('/api/exercise', {
          topic: topicInput.value,
          grade: gradeInput.value,
          count: Number(countInput.value),
        });
        correct = 0;
        scored.clear();
        updateScore();
        list.replaceChildren(...result.exercises.map((exercise) => exerciseCard(exercise, result)));
        toast(
          `${result.exercises.length} ejercicios de ${DOMAIN_LABEL[result.domain] ?? result.domain}`,
        );
      } catch (error) {
        toast(error.message, 'error');
      } finally {
        generate.disabled = false;
      }
    });

    function updateScore() {
      score.textContent =
        scored.size === 0
          ? 'Sin corregir todavía.'
          : `${correct} acierto${correct === 1 ? '' : 's'} a la primera de ${scored.size} comprobado${
              scored.size === 1 ? '' : 's'
            }.`;
    }

    function exerciseCard(exercise, result) {
      const feedback = el('div', {});
      let answer = '';
      let tries = 0;

      const controls = el('div', {});
      const button = el('button', {
        type: 'button',
        class: 'btn btn-ghost btn-sm',
        text: 'Comprobar',
        disabled: true,
      });

      if (Array.isArray(exercise.options)) {
        const group = el('div', { class: 'options', role: 'radiogroup', 'aria-label': exercise.prompt });
        exercise.options.forEach((option, index) => {
          const optionId = `${exercise.id}-${index}`.replace(/[^\w-]/g, '');
          const input = el('input', { type: 'radio', name: optionId, value: String(index), id: optionId });
          input.addEventListener('change', () => {
            answer = String(index);
            button.disabled = false;
          });
          group.append(el('label', { class: 'option', for: optionId }, input, el('span', { text: option })));
        });
        controls.append(group);
      } else {
        const input = el('input', { type: 'text', 'aria-label': 'Tu respuesta', placeholder: 'Escribe tu respuesta' });
        input.addEventListener('input', () => {
          answer = input.value;
          button.disabled = answer.trim() === '';
        });
        input.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' && !button.disabled) {
            event.preventDefault();
            void check();
          }
        });
        controls.append(input);
      }

      const check = async () => {
        if (answer.trim() === '') {
          toast('Elige una opción o escribe una respuesta', 'error');
          return;
        }

        try {
          const verdict = await postJson('/api/exercise/check', {
            seed: result.seed,
            index: exercise.index,
            answer,
            topic: result.topic,
            grade: result.grade,
          });

          tries += 1;
          // La nota cuenta solo el primer intento: reintentar no infla el marcador.
          if (!scored.has(exercise.index)) {
            scored.add(exercise.index);
            if (verdict.correct) correct += 1;
            updateScore();
          }

          const parts = [
            el('strong', { text: verdict.correct ? 'Correcto. ' : 'Todavía no. ' }),
            el('span', { text: verdict.feedback }),
          ];
          if (!verdict.correct && verdict.hint && tries < 2) {
            parts.push(el('span', { text: ` Pista: ${verdict.hint}` }));
          }
          if (!verdict.correct && tries >= 2 && verdict.expected) {
            parts.push(el('span', { text: ` Respuesta esperada: ${verdict.expected}.` }));
          }

          setChildren(feedback, el('div', { class: `feedback ${verdict.correct ? 'ok' : 'ko'}`, role: 'status' }, parts));
        } catch (error) {
          toast(error.message, 'error');
        }
      };

      button.addEventListener('click', check);

      return el(
        'div',
        { class: 'exercise' },
        el('p', { class: 'exercise-prompt', text: `${exercise.index + 1}. ${exercise.prompt}` }),
        controls,
        el('div', { class: 'row' }, button),
        feedback,
      );
    }

    wrapper.append(
      el(
        'section',
        { class: 'card' },
        el('h2', { text: 'Taller · corrección determinista' }),
        el('p', {
          class: 'small muted',
          text: 'Los ejercicios se generan con una semilla: el mismo tema produce siempre la misma serie, así la corrección no depende de la memoria del servidor. La nota cuenta el primer intento.',
        }),
        el(
          'div',
          { class: 'grid grid-3' },
          el('label', { class: 'field' }, el('span', { text: 'Tema' }), topicInput),
          el('label', { class: 'field' }, el('span', { text: 'Curso' }), gradeInput),
          el('label', { class: 'field' }, el('span', { text: 'Cantidad' }), countInput),
        ),
        el('div', { class: 'row' }, generate, tag('sin modelo', 'info')),
      ),
      score,
      list,
    );

    return wrapper;
  }

  /* ------------------------------- cómo funciona --------------------------- */

  function aboutView() {
    return el(
      'div',
      { class: 'stack' },
      el(
        'section',
        { class: 'card' },
        el('h2', { text: 'Dos motores, una decisión' }),
        el('p', {
          class: 'small muted',
          text: 'El orquestador decide en cada consulta. No es una preferencia estética: es lo que permite que el nodo sea pequeño y barato.',
        }),
        el(
          'div',
          { class: 'table-wrap' },
          el(
            'table',
            {},
            el('thead', {}, el('tr', {}, el('th', { text: 'Tarea' }), el('th', { text: 'Motor' }), el('th', { text: 'Tiempo' }))),
            el(
              'tbody',
              {},
              simpleRow('Aritmética exacta', 'simbólico', '< 10 ms'),
              simpleRow('Ejercicios y corrección', 'simbólico', '< 10 ms'),
              simpleRow('Transcodificación', 'simbólico', '< 10 ms'),
              simpleRow('Rúbrica y dinámica docente', 'simbólico', '< 10 ms'),
              simpleRow('Conversación abierta', 'modelo local', '20–40 s'),
              simpleRow('Explicación con ejemplo propio', 'modelo local', '20–40 s'),
            ),
          ),
        ),
      ),
      el(
        'section',
        { class: 'card' },
        el('h2', { text: 'Qué es un cartucho' }),
        el('p', {
          text: 'En el pitch son adaptadores LoRA de 3 MB. En este MVP son dos cosas: un prompt de sistema que cambia el comportamiento del modelo y un resolutor simbólico con el conocimiento del dominio. El efecto que ve el docente es el mismo: cambiar de cartucho cambia el enfoque sin reinstalar nada.',
        }),
        el('p', {
          class: 'small muted',
          text: 'El ajuste fino real (LoRA) queda fuera del alcance del hackathon y está declarado en el informe.',
        }),
      ),
    );
  }

  function simpleRow(task, engine, time) {
    return el('tr', {}, el('td', { text: task }), el('td', {}, tag(engine, engine === 'simbólico' ? 'ok' : 'info')), el('td', { class: 'mono small', text: time }));
  }
}

