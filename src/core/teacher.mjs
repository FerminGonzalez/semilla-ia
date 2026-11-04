import { store } from './store.mjs';

const STOPWORDS = new Set(
  `de la que el en y a los se del las un por con no una su para es al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros tengo tienes tiene quiero quieres puedo puedes podria hacer hago dime dame ayudame necesito sabe sabes explicar explicame entiendo entiende cuanto cuanta cuantos cuantas toca cada amigos amigo cosas cosa vez veces hoy clase nino ninos nina ninas profe profesor maestra`
    .split(/\s+/)
    .filter(Boolean),
);

const VERB_ENDING = /(ando|iendo|ado|ada|idos|idas|amos|emos|imos|an|en|ar|er|ir)$/;

const normalise = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Agrupa por tema cuando el aula lo ha indicado y, si no, por palabras
 * significativas. Nunca usa un verbo conjugado como foco de una dinámica.
 */
export function clusterDoubts(doubts, limit = 5) {
  const clusters = [];
  const seen = new Set();

  const topics = new Map();
  for (const doubt of doubts) {
    const topic = String(doubt.topic ?? '').trim();
    if (topic === '') continue;
    const key = normalise(topic);
    const entry = topics.get(key) ?? { term: topic, key, count: 0, examples: [] };
    entry.count += 1;
    if (entry.examples.length < 2) entry.examples.push(doubt.question);
    topics.set(key, entry);
  }

  for (const entry of [...topics.values()].sort((a, b) => b.count - a.count)) {
    clusters.push({ term: entry.term, count: entry.count, examples: entry.examples, source: 'tema' });
    seen.add(entry.key);
  }

  const counts = new Map();
  let position = 0;
  for (const doubt of doubts) {
    for (const word of normalise(doubt.question).split(' ')) {
      position += 1;
      if (word.length < 4 || STOPWORDS.has(word) || VERB_ENDING.test(word)) continue;
      if (seen.has(word)) continue;
      const entry = counts.get(word) ?? { term: word, count: 0, first: position, examples: [] };
      entry.count += 1;
      if (entry.examples.length < 2) entry.examples.push(doubt.question);
      counts.set(word, entry);
    }
  }

  const keywords = [...counts.values()].sort((a, b) => b.count - a.count || a.first - b.first);
  for (const entry of keywords) {
    if (clusters.length >= limit) break;
    clusters.push({ ...entry, source: 'palabra' });
  }

  return clusters.slice(0, limit);
}

const CARTRIDGE_LABEL = {
  mate: 'Matemáticas',
  ciencias: 'Ciencias',
  lengua: 'Lengua',
  emocional: 'Acompañamiento',
};

function dynamicsFor(cartridgeId, focus) {
  const plans = {
    mate: {
      title: `Contar con las manos: ${focus}`,
      steps: [
        '5 min · Cada pareja cuenta 20 semillas y forma dos montones distintos.',
        '7 min · Juntan, separan y anotan en el cuaderno lo que hicieron.',
        '3 min · Dos parejas comparan resultados y explican el suyo.',
      ],
      material: 'Semillas, tapones o piedras. Cuaderno y lápiz.',
      why: 'El error en matemáticas suele venir de un hueco manipulativo, no de falta de esfuerzo.',
    },
    ciencias: {
      title: `Observar antes de explicar: ${focus}`,
      steps: [
        '5 min · Observación silenciosa de un fenómeno concreto del patio o del aula.',
        '7 min · Cada alumno escribe una hipótesis con la fórmula «creo que ___ porque ___».',
        '3 min · Se contrastan dos hipótesis y se diseña entre todos cómo comprobarlas.',
      ],
      material: 'Un vaso de agua, dos hojas, o el sensor del nodo si está disponible.',
      why: 'Formular la hipótesis antes de la explicación fija el aprendizaje.',
    },
    lengua: {
      title: `Leer en voz alta y en parejas: ${focus}`,
      steps: [
        '4 min · Lectura individual en silencio del mismo párrafo corto.',
        '7 min · Uno lee en voz alta, el otro señala la palabra que no entiende.',
        '4 min · Escriben juntos una frase con esa palabra.',
      ],
      material: 'Un párrafo corto impreso o escrito en la pizarra.',
      why: 'La lectura acompañada reduce el miedo a equivocarse en público.',
    },
    emocional: {
      title: `Un minuto de calma antes de empezar: ${focus}`,
      steps: [
        '2 min · Respiración guiada: cuatro al entrar, seis al salir.',
        '5 min · Cada alumno escribe o dibuja una cosa que le preocupa hoy.',
        '5 min · Quien quiera comparte; el resto escucha sin opinar.',
      ],
      material: 'Papel y lápiz. Un adulto de referencia disponible.',
      why: 'Sin regulación emocional no hay atención disponible para aprender.',
    },
  };
  return plans[cartridgeId] ?? plans.mate;
}

function rubricFor(cartridgeId, focus) {
  return {
    title: `Rúbrica formativa · ${focus}`,
    criteria: [
      {
        name: 'Explica con sus palabras',
        levels: {
          inicio: 'Repite la definición sin ejemplo.',
          proceso: 'Explica con un ejemplo guiado.',
          logrado: 'Explica con un ejemplo propio y detecta un error ajeno.',
        },
      },
      {
        name: 'Persiste ante el error',
        levels: {
          inicio: 'Abandona tras el primer intento.',
          proceso: 'Reintenta si un adulto le anima.',
          logrado: 'Reintenta solo y cambia de estrategia.',
        },
      },
      {
        name: 'Usa el material disponible',
        levels: {
          inicio: 'No usa semillas, dibujos ni el sensor.',
          proceso: 'Los usa si se le indica.',
          logrado: 'Elige el material que le ayuda y lo justifica.',
        },
      },
    ],
  };
}

function signalsFrom(doubts) {
  const signals = [];
  const total = doubts.length;
  if (total === 0) return signals;

  const short = doubts.filter((doubt) => normalise(doubt.question).split(' ').length <= 3).length;
  if (short / total >= 0.3) {
    signals.push({
      level: 'revisar',
      text: `${short} de ${total} consultas son de tres palabras o menos. Puede haber vergüenza a escribir o prisa por terminar: conviene preguntar en privado.`,
    });
  }

  const repeated = new Map();
  for (const doubt of doubts) {
    const key = normalise(doubt.question).slice(0, 60);
    repeated.set(key, (repeated.get(key) ?? 0) + 1);
  }
  const mostRepeated = [...repeated.entries()].sort((a, b) => b[1] - a[1])[0];
  if (mostRepeated && mostRepeated[1] >= 3) {
    signals.push({
      level: 'revisar',
      text: `La misma consulta aparece ${mostRepeated[1]} veces. No es un problema individual: es un punto del tema que hay que volver a enseñar a toda la clase.`,
    });
  }

  const emotional = doubts.filter((doubt) => doubt.cartridge === 'emocional').length;
  if (emotional >= 2) {
    signals.push({
      level: 'derivar',
      text: `${emotional} consultas usaron la cápsula de calma. El nodo no diagnostica: corresponde a un adulto del centro valorar el contexto.`,
    });
  }

  if (signals.length === 0) {
    signals.push({
      level: 'estable',
      text: 'Sin patrones de alerta con los datos actuales. El nodo no infiere estados internos del alumno.',
    });
  }

  return signals;
}

export function teacherSummary() {
  const state = store.state();
  const doubts = state.doubts;
  const clusters = clusterDoubts(doubts);

  const byCartridge = new Map();
  for (const doubt of doubts) {
    byCartridge.set(doubt.cartridge, (byCartridge.get(doubt.cartridge) ?? 0) + 1);
  }
  const topCartridge =
    [...byCartridge.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mate';

  const focus = clusters[0]?.term ?? 'el tema de la semana';

  return {
    total: doubts.length,
    since: state.doubts[0]?.at ?? null,
    clusters,
    byCartridge: [...byCartridge.entries()].map(([id, count]) => ({
      id,
      label: CARTRIDGE_LABEL[id] ?? id,
      count,
    })),
    nextSession: dynamicsFor(topCartridge, focus),
    rubric: rubricFor(topCartridge, focus),
    signals: signalsFrom(doubts),
    privacy: {
      stored:
        'La pregunta literal, sin nombre de alumno y sin IP, junto al cartucho y al curso. El texto puede contener datos que el alumno escriba por su cuenta.',
      notStored: 'No se guarda quién preguntó, ni la IP, ni el historial completo de la conversación.',
      retention: `${doubts.length} consultas en el dispositivo del nodo. Se pueden borrar desde el panel del docente.`,
    },
  };
}

export function clearDoubts() {
  const state = store.state();
  state.doubts = [];
  store.flush();
}
