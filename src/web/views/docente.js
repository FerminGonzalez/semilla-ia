import { el, getJson, postJson, delJson, toast, tag, fmtDate } from '../lib/dom.js';

export async function renderDocente(root) {
  const status = await getJson('/api/teacher/status');
  if (!status.authenticated) {
    root.append(gate());
    return;
  }
  await renderPanel(root);
}

function gate(message) {
  const container = el(
    'div',
    { class: 'gate' },
    el(
      'section',
      { class: 'card' },
      el('h1', { text: 'Panel docente' }),
      el('p', {
        class: 'small muted',
        text: 'Las dudas registradas son de toda la clase. El PIN se genera en el primer arranque del nodo y aparece en su consola.',
      }),
      message ? el('p', { class: 'notice notice-bad', role: 'alert', text: message }) : null,
      el(
        'form',
        { onsubmit: (event) => event.preventDefault() },
        el(
          'label',
          { class: 'field' },
          el('span', { text: 'PIN del nodo' }),
          el('input', {
            class: 'pin-input',
            type: 'password',
            inputmode: 'numeric',
            autocomplete: 'current-password',
            maxlength: 8,
            id: 'pin',
            'aria-label': 'PIN del nodo',
          }),
        ),
        el('button', { class: 'btn btn-primary btn-wide', type: 'submit', text: 'Entrar' }),
      ),
    ),
  );

  const form = container.querySelector('form');
  const input = container.querySelector('#pin');
  form.addEventListener('submit', async () => {
    try {
      await postJson('/api/teacher/login', { pin: input.value.trim() });
      container.replaceChildren(el('p', { class: 'muted', text: 'Entrando…' }));
      const main = document.getElementById('contenido');
      main.replaceChildren();
      await renderPanel(main);
    } catch (error) {
      input.value = '';
      const notice = el('p', { class: 'notice notice-bad', role: 'alert', text: error.message });
      container.querySelector('.notice')?.remove();
      form.before(notice);
    }
  });

  setTimeout(() => input.focus(), 30);
  return container;
}

async function renderPanel(root) {
  const summary = await getJson('/api/teacher/summary');
  const maxCluster = summary.clusters[0]?.count ?? 1;

  const clearButton = el('button', {
    class: 'btn btn-danger btn-sm',
    type: 'button',
    text: 'Borrar dudas registradas',
    onclick: async () => {
      if (!confirm('¿Borrar todas las dudas registradas en el nodo? No se pueden recuperar.')) return;
      try {
        await delJson('/api/teacher/doubts');
        toast('Dudas borradas');
        root.replaceChildren();
        await renderPanel(root);
      } catch (error) {
        toast(error.message, 'error');
      }
    },
  });

  root.append(
    el(
      'header',
      { class: 'page-head' },
      el(
        'div',
        {},
        el('p', { class: 'eyebrow', text: 'Reto 12 · Entrenador invisible' }),
        el('h1', { text: 'Lo que la clase preguntó' }),
        el('p', {
          text: 'Agregado de las consultas del aula. Sin nombres, sin historiales individuales, sin etiquetas sobre el alumno.',
        }),
      ),
      el(
        'div',
        { class: 'row' },
        tag(`${summary.total} consulta${summary.total === 1 ? '' : 's'}`, 'info'),
        summary.since ? tag(`desde ${fmtDate(summary.since)}`, 'neutral') : null,
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: 'Salir',
          onclick: async () => {
            await postJson('/api/teacher/logout', {});
            root.replaceChildren();
            await renderDocente(root);
          },
        }),
        el('button', {
          type: 'button',
          class: 'btn btn-danger btn-sm',
          text: 'Borrar todos los datos del nodo',
          onclick: async () => {
            if (!confirm('Se borrarán dudas, lecturas del sensor y paquetes. Esta acción no se puede deshacer.')) {
              return;
            }
            try {
              await postJson('/api/node/reset', {});
              toast('Datos del nodo borrados');
              root.replaceChildren();
              await renderPanel(root);
            } catch (error) {
              toast(error.message, 'error');
            }
          },
        }),
      ),
    ),

    summary.total === 0
      ? el(
          'section',
          { class: 'card' },
          el('h2', { text: 'Todavía no hay datos' }),
          el('p', {
            class: 'muted',
            text: 'Ve al aula y mantén dos o tres conversaciones. Al volver aquí verás los temas que más cuestan, una dinámica para mañana y una rúbrica lista para usar.',
          }),
          el('a', { class: 'btn btn-primary', href: '#/aula', text: 'Ir al aula' }),
        )
      : el(
          'div',
          { class: 'stack' },

          el(
            'section',
            { class: 'card' },
            el('h2', { text: 'Temas que más cuestan' }),
            summary.clusters.length === 0
              ? el('p', { class: 'muted', text: 'Sin términos repetidos.' })
              : el(
                  'ul',
                  { class: 'stack', style: 'list-style:none;padding:0' },
                  summary.clusters.map((cluster) =>
                    el(
                      'li',
                      {},
                      el(
                        'div',
                        { class: 'row', style: 'justify-content:space-between' },
                        el('strong', { text: cluster.term }),
                        el('span', { class: 'small muted', text: `${cluster.count} menciones` }),
                      ),
                      el('div', { class: 'bar' }, el('span', { style: `width:${Math.round((cluster.count / maxCluster) * 100)}%` })),
                      el('p', { class: 'tiny muted', text: `Ej.: «${cluster.examples[0]?.slice(0, 110)}…»` }),
                    ),
                  ),
                ),
            summary.byCartridge.length > 0
              ? el(
                  'div',
                  { class: 'row' },
                  summary.byCartridge.map((item) => tag(`${item.label}: ${item.count}`, 'neutral')),
                )
              : null,
          ),

          el(
            'section',
            { class: 'card' },
            el('h2', { text: 'Dinámica para el día siguiente' }),
            el('h3', { text: summary.nextSession.title }),
            el(
              'ol',
              {},
              summary.nextSession.steps.map((step) => el('li', { text: step })),
            ),
            el('p', { class: 'small' }, el('strong', { text: 'Material: ' }), summary.nextSession.material),
            el('p', { class: 'small muted', text: summary.nextSession.why }),
          ),

          el(
            'section',
            { class: 'card' },
            el('h2', { text: summary.rubric.title }),
            el(
              'div',
              { class: 'table-wrap' },
              el(
                'table',
                {},
                el(
                  'thead',
                  {},
                  el(
                    'tr',
                    {},
                    el('th', { text: 'Criterio' }),
                    el('th', { text: 'Inicio' }),
                    el('th', { text: 'En proceso' }),
                    el('th', { text: 'Logrado' }),
                  ),
                ),
                el(
                  'tbody',
                  {},
                  summary.rubric.criteria.map((criterion) =>
                    el(
                      'tr',
                      {},
                      el('td', { text: criterion.name }),
                      el('td', { class: 'small', text: criterion.levels.inicio }),
                      el('td', { class: 'small', text: criterion.levels.proceso }),
                      el('td', { class: 'small', text: criterion.levels.logrado }),
                    ),
                  ),
                ),
              ),
            ),
          ),

          el(
            'section',
            { class: 'card' },
            el('h2', { text: 'Señales para mirar' }),
            el('p', {
              class: 'small muted',
              text: 'Son indicios de aula, no diagnósticos. El nodo no decide nada sobre un alumno.',
            }),
            el(
              'ul',
              { class: 'stack', style: 'list-style:none;padding:0' },
              summary.signals.map((signal) =>
                el(
                  'li',
                  {},
                  el(
                    'div',
                    { class: `notice ${signal.level === 'derivar' ? 'notice-warn' : signal.level === 'estable' ? 'notice-ok' : 'notice-info'}` },
                    el('strong', { text: `${signal.level === 'derivar' ? 'Derivar' : signal.level === 'estable' ? 'Estable' : 'Revisar'} · ` }),
                    el('span', { text: signal.text }),
                  ),
                ),
              ),
            ),
          ),

          el(
            'section',
            { class: 'card' },
            el('h2', { text: 'Privacidad' }),
            el('p', { class: 'small' }, el('strong', { text: 'Se guarda: ' }), summary.privacy.stored),
            el('p', { class: 'small' }, el('strong', { text: 'No se guarda: ' }), summary.privacy.notStored),
            el('p', { class: 'small muted', text: summary.privacy.retention }),
            el('div', { class: 'row' }, clearButton),
          ),
        ),
  );
}
