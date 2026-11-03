import { el, getJson, metric, tag, fmtMs } from '../lib/dom.js';

export async function renderNodo(root) {
  const [profile, telemetry] = await Promise.all([
    getJson('/api/profile'),
    getJson('/api/telemetry').catch(() => null),
  ]);

  const model = profile.model;
  const tokensPerSecond = profile.measurements?.llmTokensPerSecond;
  const energy = telemetry?.energy ?? null;
  const symbolic = profile.counters?.symbolic ?? 0;
  const llm = profile.counters?.llm ?? 0;

  root.append(
    el(
      'header',
      { class: 'page-head' },
      el(
        'div',
        {},
        el('p', { class: 'eyebrow', text: 'Nodo neuro-educativo autónomo' }),
        el('h1', { text: 'Semilla-IA' }),
        el('p', {
          text: 'Cognición empaquetada en un nodo que no pide internet. El modelo trabaja cuando hace falta; el motor simbólico resuelve lo demás en milisegundos.',
        }),
      ),
      el(
        'div',
        { class: 'row' },
        tag(model.engine === 'llm' ? 'Modelo local listo' : 'Solo motor simbólico', model.engine === 'llm' ? 'ok' : 'warn'),
        tag('100 % offline', 'ok'),
      ),
    ),

    el(
      'div',
      { class: 'grid grid-4' },
      metric(
        'Modelo',
        model.available ? model.model : 'no disponible',
        model.available
          ? `${model.parameters ?? ''} ${model.quantization ?? ''}`.trim() || 'Ollama local'
          : model.error ?? 'sin modelo',
        model.available ? 'ok' : 'warn',
      ),
      metric(
        'Memoria del proceso',
        `${profile.process.rssMb} MB`,
        `Node ${profile.process.nodeVersion} · medido`,
        'info',
      ),
      metric(
        'Velocidad medida',
        tokensPerSecond ? `${tokensPerSecond} tok/s` : '—',
        tokensPerSecond ? 'última respuesta del modelo' : 'aún sin generar',
      ),
      metric(
        'Consumo del nodo',
        `${profile.power.watts} W`,
        'proyección, no medición',
        'warn',
      ),
    ),

    el(
      'div',
      { class: 'grid grid-2' },
      el(
        'section',
        { class: 'card' },
        el('h2', { text: 'Arranque del nodo' }),
        el(
          'ul',
          { class: 'boot-list' },
          bootItem(model.available, `Modelo local: ${model.available ? model.model : 'no disponible'}`, model.available ? 'cargado en Ollama' : 'se usará el motor simbólico'),
          bootItem(true, 'Motor simbólico', 'ejercicios, rúbricas y mapas en <10 ms'),
          bootItem(true, 'Almacén local', 'datos en data/nodo.json, sin nube'),
          bootItem(true, 'Panel docente', 'protegido por PIN generado en el arranque'),
        ),
        el(
          'div',
          { class: 'row' },
          el('a', { class: 'btn btn-primary', href: '#/aula', text: 'Entrar al aula' }),
          el('a', { class: 'btn btn-ghost', href: '#/docente', text: 'Panel docente' }),
        ),
      ),

      el(
        'section',
        { class: 'card' },
        el('h2', { text: 'Reparto de trabajo' }),
        el('p', {
          class: 'small muted',
          text: 'En un nodo de 1,2 W el modelo es el recurso caro. El orquestador le manda solo lenguaje natural.',
        }),
        shareBar('Motor simbólico', symbolic, symbolic + llm, 'var(--green-2)'),
        shareBar('Modelo local', llm, symbolic + llm, 'var(--blue)'),
        el('p', {
          class: 'small',
          text: energy
            ? `${energy.shareSymbolic} % de las consultas se resolvieron sin modelo: ${energy.secondsSaved} s de inferencia evitados (${energy.whSaved} Wh proyectados).`
            : 'Sin consultas registradas todavía.',
        }),
        el('a', { class: 'btn btn-quiet btn-sm', href: '#/hardware', text: 'Ver energía y federación' }),
      ),
    ),

    sharingCard(profile),

    el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Qué es real y qué es proyección' }),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          { class: 'real-vs-projected' },
          el('thead', {}, el('tr', {}, el('th', { text: 'Elemento' }), el('th', { text: 'Estado' }), el('th', { text: 'Base' }))),
          el(
            'tbody',
            {},
            row(
              'Inferencia local sin internet',
              model.available ? tag('medido', 'ok') : tag('no disponible', 'warn'),
              model.available ? `${model.model} en 127.0.0.1:11434` : 'el nodo responde con el motor simbólico',
            ),
            row('Corrección de ejercicios', tag('medido', 'ok'), 'motor simbólico, mismo resultado siempre'),
            row('Transcodificación a 3 formatos', tag('medido', 'ok'), 'reglas deterministas, sin modelo'),
            row('Consumo eléctrico 1,2 W', tag('proyección', 'projection'), 'nodo objetivo, no este portátil'),
            row('Coste 12 USD por nodo', tag('proyección', 'projection'), 'lista de materiales estimada del pitch'),
            row('Radio LoRa', tag('proyección', 'projection'), 'el paquete se mide; la radio no se ha ejecutado'),
          ),
        ),
      ),
      el('p', {
        class: 'small muted',
        text: 'El jurado puede comprobar cada fila verde en esta misma máquina. Las filas rayadas están declaradas como objetivo de ingeniería, no como resultado.',
      }),
    ),

    el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Comprobarlo sin internet' }),
      el(
        'ol',
        { class: 'steps' },
        el('li', { text: 'Abre el aula y mantén una conversación: la respuesta sale de este equipo.' }),
        el('li', { text: 'Desconecta el wifi del portátil. La conversación y el taller siguen funcionando.' }),
        el('li', { text: 'Mira el panel de hardware: el paquete LoRa y las métricas se calculan en local.' }),
      ),
      el('p', {
        class: 'small muted',
        text: `Versión ${profile.version} · encendido desde hace ${since(profile.startedAt)} · sin dependencias externas.`,
      }),
    ),
  );
}

function sharingCard(profile) {
  const sharing = profile.sharing ?? { enabled: false, port: 8090, addresses: [] };

  if (!sharing.enabled || sharing.addresses.length === 0) {
    return el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Compartir con el equipo' }),
      el('p', {
        class: 'small muted',
        text: 'Ahora mismo el nodo solo escucha en este equipo. Para que otros dispositivos de la misma wifi abran el aula:',
      }),
      el('pre', { class: 'code-block', text: 'set NODO_HOST=0.0.0.0\nnode src/server.mjs' }),
      el('p', {
        class: 'tiny muted',
        text: 'La primera vez Windows pedirá permiso para aceptar conexiones en la red privada. Hay que permitirlo.',
      }),
    );
  }

  const list = el('div', { class: 'stack' });

  for (const item of sharing.addresses) {
    const url = `http://${item.address}:${sharing.port}`;
    const label =
      item.kind === 'tailscale'
        ? 'red privada Tailscale · sirve también fuera del aula'
        : 'misma red wifi';
    list.append(
      el(
        'div',
        { class: 'row', style: 'justify-content:space-between;gap:0.6rem' },
        el(
          'div',
          {},
          el('a', { class: 'share-url', href: url, target: '_blank', rel: 'noopener', text: url }),
          el('p', { class: 'tiny muted', text: `${label} · interfaz ${item.name}` }),
        ),
        el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-sm',
          text: 'Copiar',
          onclick: async (event) => {
            try {
              await navigator.clipboard.writeText(url);
              event.target.textContent = 'Copiado';
            } catch {
              toast(`Copia esta dirección: ${url}`);
            }
          },
        }),
      ),
    );
  }

  return el(
    'section',
    { class: 'card' },
    el('h2', { text: 'Compartir con el equipo' }),
    el('p', {
      class: 'small muted',
      text: 'El nodo está escuchando en la red local. Cualquier dispositivo de la misma wifi puede abrir el aula sin instalar nada:',
    }),
    list,
    el('p', {
      class: 'tiny muted',
      text: 'El panel docente sigue protegido por PIN. Si no cargan las direcciones, revisa que el firewall de Windows permita el puerto en redes privadas.',
    }),
  );
}

function since(iso) {
  const started = new Date(iso).getTime();
  if (!Number.isFinite(started)) return 'un rato';
  const minutes = Math.max(1, Math.round((Date.now() - started) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

function bootItem(ok, title, detail) {
  return el(
    'li',
    {},
    el('span', { class: `boot-mark ${ok ? 'ok' : 'pending'}`, 'aria-hidden': 'true', text: ok ? '✓' : '·' }),
    el('span', {}, el('strong', { text: title }), el('br'), el('span', { class: 'small muted', text: detail })),
  );
}

function shareBar(label, value, total, color) {
  const percent = total === 0 ? 0 : Math.round((value / total) * 100);
  return el(
    'div',
    { class: 'stack', style: undefined },
    el(
      'div',
      { class: 'row', style: undefined },
      el('span', { class: 'small', text: label }),
      el('span', { class: 'small muted', text: `${value} · ${percent} %` }),
    ),
    el('div', { class: 'bar' }, el('span', { style: `width:${percent}%;background:${color}` })),
  );
}

function row(label, badge, basis) {
  return el('tr', {}, el('td', { text: label }), el('td', {}, badge), el('td', { class: 'small muted', text: basis }));
}
