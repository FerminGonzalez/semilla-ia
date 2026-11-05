import { el, tag } from '../lib/dom.js';

const RETOS = [
  ['02 · Aprender sin conexión', 'Aula completa servida desde el nodo, sin internet', 'funcional'],
  ['03 · Un contenido, muchas formas', 'Transcodificador: lectura fácil, audio y mapa conceptual', 'funcional'],
  ['10 · Encontrar a quien dejamos atrás', 'Tutor sin prisa y señales de aula agregadas, nunca etiquetas al alumno', 'parcial'],
  ['11 · Segunda oportunidad', 'Cartucho andragógico reutilizable con ejemplos de oficio', 'parcial'],
  ['12 · Entrenador invisible del docente', 'Dudas agregadas, dinámica para mañana y rúbrica en segundos', 'funcional'],
  ['13 · La escuela aprende de sus datos', 'Paquete federado de tamaño medido; la radio está modelada', 'parcial'],
  ['15 · Educación en emergencias', 'Cápsula de calma con derivación explícita a un adulto', 'funcional'],
  ['17 · Laboratorio sin laboratorio', 'Sensor por HTTP + andamiaje del método científico', 'funcional'],
  ['20 · Potencial más allá de las notas', 'Rúbrica de proceso y persistencia; sin nota automática', 'parcial'],
];

export function renderEtica(root) {
  root.append(
    el(
      'header',
      { class: 'page-head' },
      el(
        'div',
        {},
        el('p', { class: 'eyebrow', text: 'Transparencia' }),
        el('h1', { text: 'Ética, datos y límites' }),
        el('p', {
          text: 'Un producto para menores en contextos vulnerables tiene que poder auditarse en una página. Esta es, y cada afirmación se puede comprobar en la máquina.',
        }),
      ),
      el('div', { class: 'row' }, tag('sin telemetría externa', 'ok'), tag('sin cuentas de usuario', 'ok')),
    ),

    el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Qué es real y qué es proyección' }),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          {},
          el('thead', {}, el('tr', {}, el('th', { text: 'Elemento' }), el('th', { text: 'Estado' }), el('th', { text: 'Cómo comprobarlo' }))),
          el(
            'tbody',
            {},
            row('Inferencia local', 'medido', 'Desconecta la red: el aula sigue respondiendo.'),
            row('Corrección y transcodificación', 'medido', 'El tiempo de respuesta es milisegundos; no hay llamada a red.'),
            row('Consumo y coste del nodo', 'proyección', 'Cifras del pitch, no medidas en este portátil.'),
            row('Radio LoRa', 'proyección', 'El paquete se mide; la transmisión no se ha ejecutado.'),
            row('Modelo ternario 1.58-bit', 'proyección', 'Se explica el cálculo; aquí corre un modelo de 4 bits.'),
            row('LoRA real', 'no incluido', 'Los cartuchos son prompts y reglas, como en la fase 3 del pitch.'),
          ),
        ),
      ),
    ),

    el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Cobertura de los retos ProFuturo' }),
      el('p', {
        class: 'small muted',
        text: 'Estado real de cada reto en este MVP. «Parcial» significa que la mecánica está construida pero falta profundidad o validación de campo.',
      }),
      el(
        'div',
        { class: 'table-wrap' },
        el(
          'table',
          {},
          el('thead', {}, el('tr', {}, el('th', { text: 'Reto' }), el('th', { text: 'Qué hace el MVP' }), el('th', { text: 'Estado' }))),
          el(
            'tbody',
            {},
            RETOS.map(([reto, what, status]) =>
              el(
                'tr',
                {},
                el('td', { text: reto }),
                el('td', { class: 'small', text: what }),
                el('td', {}, tag(status, status === 'funcional' ? 'ok' : status === 'parcial' ? 'warn' : 'neutral')),
              ),
            ),
          ),
        ),
      ),
    ),

    el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Menores' }),
      el('p', {
        text: 'El nodo no abre una conversación libre con un modelo sin límites: cada cartucho impone reglas, longitud máxima y prohibiciones explícitas (no pedir datos personales, no diagnosticar, no prometer). El cartucho de calma deriva a un adulto cuando detecta riesgo.',
      }),
      el('p', {
        class: 'small muted',
        text: 'El producto está pensado para uso escolar acompañado. No se ha diseñado para uso doméstico sin supervisión.',
      }),
    ),

    el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Datos' }),
      el(
        'div',
        { class: 'grid grid-2' },
        el(
          'div',
          {},
          el('h3', { text: 'Se guardan' }),
          el(
            'ul',
            {},
            el('li', { text: 'La pregunta literal, sin nombre de alumno ni IP, junto al cartucho y al curso.' }),
            el('li', { text: 'Lecturas del sensor con fecha y su origen: medida, manual o simulada.' }),
            el('li', { text: 'Contadores agregados de uso.' }),
          ),
        ),
        el(
          'div',
          {},
          el('h3', { text: 'No se guardan' }),
          el(
            'ul',
            {},
            el('li', { text: 'Nombre del alumno, IP o identificador de dispositivo.' }),
            el('li', { text: 'Historial completo de la conversación.' }),
            el('li', { text: 'Nada sale del equipo: no hay endpoint de salida a internet.' }),
          ),
        ),
      ),
      el('p', {
        class: 'small muted',
        text: 'El PIN del panel docente se genera en el primer arranque y la sesión caduca en 8 horas. Los datos viven en data/nodo.json y se pueden borrar desde el panel.',
      }),
    ),

    el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Límites que reconocemos' }),
      el(
        'div',
        { class: 'limits' },
        limit('El motor propio de 17 M se equivoca al conversar: es un LM causal, no un asistente afinado. Por eso lo estructurado no pasa por él: los ejercicios y las rúbricas los resuelve el motor simbólico.'),
        limit('Un portátil no es un nodo de 12 USD. El paso a RISC-V exige recompilar el runtime y validar el modelo ternario: es trabajo de ingeniería, no un cambio de configuración.'),
        limit('Este MVP incluye traducción español ↔ ngäbere ↔ inglés para el aula. El diccionario estático cubre saludos, instrucciones y vocabulario clave; las lecciones completas requieren el modelo bitnet fine-tuneado con ngäbere y la revisión de un hablante nativo.'),
        limit('Sin conexión no hay actualizaciones: el contenido nuevo entra por USB o por el paquete federado.'),
        limit('No sustituye al docente. El panel le da material para decidir, no decisiones tomadas.'),
      ),
    ),

    el(
      'section',
      { class: 'card' },
      el('h2', { text: 'Cómo verificarlo en dos minutos' }),
      el(
        'ol',
        { class: 'steps' },
        el('li', { text: 'Abre el aula y pregunta algo abierto. La respuesta sale del modelo local.' }),
        el('li', { text: 'Pregunta una operación con números: verás que responde el motor simbólico en milisegundos.' }),
        el('li', { text: 'Desconecta el wifi y repite: nada cambia.' }),
        el('li', { text: 'Abre /api/profile en otra pestaña: la memoria y la versión de Node son las de este equipo.' }),
        el('li', { text: 'Detén Ollama (o no lo arranques) y vuelve a preguntar: el nodo sigue respondiendo con el motor propio y el simbólico, y lo dice.' }),
      ),
    ),
  );
}

function row(label, status, how) {
  const tone = status === 'medido' ? 'ok' : status === 'proyección' ? 'projection' : 'neutral';
  return el('tr', {}, el('td', { text: label }), el('td', {}, tag(status, tone)), el('td', { class: 'small muted', text: how }));
}

function limit(text) {
  return el('p', { class: 'limit', text });
}
