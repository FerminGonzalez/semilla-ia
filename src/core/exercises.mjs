/**
 * Taller de ejercicios. Generación determinista por semilla:
 * el mismo seed produce los mismos ejercicios, así la corrección es sin estado
 * y funciona aunque el nodo se reinicie a mitad de la clase.
 */

const normalise = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .replace(/[^a-z0-9ñ/\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** Tokens significativos: compara palabras completas, nunca subcadenas. */
function tokens(value) {
  return normalise(value).split(' ').filter(Boolean);
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick(random, list) {
  return list[Math.floor(random() * list.length)];
}

function range(random, min, max) {
  return min + Math.floor(random() * (max - min + 1));
}

function gcd(a, b) {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}

function shuffle(random, list) {
  const copy = [...list];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

function detectDomain(topic) {
  const t = normalise(topic);
  if (/fraccion|fracciones|numerador|denominador/.test(t)) return 'fractions';
  if (/suma|resta|multiplic|divid|numero|problema|algebra|ecuacion|decimal/.test(t)) return 'math';
  if (/oracion|sujeto|predicado|verbo|sustantivo|plural|tilde|acento|palabra|lectura|escritura/.test(t)) return 'language';
  if (/agua|planta|fotosintesis|clima|sensor|energia|animal|ecosistema|tierra|ciencia/.test(t)) return 'science';
  return 'mixed';
}

const SCIENCE_BANK = [
  {
    prompt: 'Una hoja tapada con cartón durante tres días pierde el color verde. ¿Por qué?',
    options: ['Porque no recibe luz y no puede fabricar su alimento', 'Porque le sobra agua', 'Porque hace demasiado frío', 'Porque el cartón la seca'],
    correctIndex: 0,
    feedback: 'Sin luz no hay fotosíntesis: la clorofila se degrada y la hoja amarillea.',
    hint: 'Piensa qué aporta la luz a la planta.',
  },
  {
    prompt: 'Un plato con agua se vacía antes al sol que a la sombra. ¿Qué proceso ocurre?',
    options: ['Condensación', 'Evaporación', 'Precipitación', 'Filtración'],
    correctIndex: 1,
    feedback: 'El calor acelera la evaporación: el agua pasa a vapor.',
    hint: 'El agua desaparece del plato, no se va por un desagüe.',
  },
  {
    prompt: 'En el ciclo del agua, ¿cómo se llama el paso de vapor a gotitas al enfriarse?',
    options: ['Precipitación', 'Evaporación', 'Condensación', 'Escorrentía'],
    correctIndex: 2,
    feedback: 'Condensación: el vapor se enfría y forma gotitas que vemos como nubes o vaho.',
    hint: 'Ocurre en el aire frío.',
  },
  {
    prompt: 'El sensor marca 32 °C y 25 % de humedad. ¿Qué esperas del agua de un recipiente abierto?',
    options: ['Que se evapore rápido', 'Que se congele', 'Que no cambie', 'Que aumente de nivel'],
    correctIndex: 0,
    feedback: 'Calor alto y humedad baja aceleran la evaporación.',
    hint: 'Compara con un día húmedo y fresco.',
  },
  {
    prompt: '¿Cuál de estas es una observación y no una conclusión?',
    options: ['La planta está mustia', 'La planta tiene sed', 'A la planta le falta agua', 'La planta se va a morir'],
    correctIndex: 0,
    feedback: 'Observar es describir lo que se ve; concluir es interpretarlo.',
    hint: 'Observar no explica el motivo.',
  },
];

const LANGUAGE_BANK = [
  {
    prompt: 'En «La profesora explica la lección», ¿cuál es el sujeto?',
    options: ['La profesora', 'Explica', 'La lección', 'Explica la lección'],
    correctIndex: 0,
    feedback: 'El sujeto es quien realiza la acción: pregúntale al verbo «¿quién explica?».',
    hint: 'Pregunta al verbo quién hace la acción.',
  },
  {
    prompt: '¿Cuál de estas palabras es un verbo?',
    options: ['Cuaderno', 'Rápido', 'Escribir', 'Ayer'],
    correctIndex: 2,
    feedback: '«Escribir» es una acción, por tanto un verbo.',
    hint: 'El verbo indica acción.',
  },
  {
    prompt: '¿Cuál es el plural correcto de «lápiz»?',
    options: ['Lápizes', 'Lápices', 'Lapises', 'Lápiz'],
    correctIndex: 1,
    feedback: 'Las palabras terminadas en -z hacen el plural en -ces: lápiz → lápices.',
    hint: 'La z cambia a c.',
  },
  {
    prompt: '¿Qué palabra lleva tilde obligatoriamente?',
    options: ['Examen', 'Casa', 'Fácil', 'Joven'],
    correctIndex: 2,
    feedback:
      '«Fácil» es una palabra llana terminada en -l, y las llanas que no acaban en -n o -s llevan tilde. «Examen» y «joven» acaban en -n, así que no la llevan.',
    hint: 'Fíjate en la última letra de cada palabra.',
  },
  {
    prompt: '¿Qué signo cierra una pregunta en castellano?',
    options: ['El punto', 'La coma', 'El signo de interrogación', 'Los dos puntos'],
    correctIndex: 2,
    feedback: 'Las preguntas se abren con «¿» y se cierran con «?».',
    hint: 'Mira cómo empieza la pregunta.',
  },
];

const VERB_FORMS = [
  { sentence: 'Los alumnos leen despacio.', answer: 'leen' },
  { sentence: 'La niña dibuja un árbol.', answer: 'dibuja' },
  { sentence: 'Nosotros caminamos al río.', answer: 'caminamos' },
  { sentence: 'El perro corre por el patio.', answer: 'corre' },
];

function buildMath(random, grade) {
  const small = /^[1-6]\s*(?:º|°)?\s*primaria/.test(grade ?? '') ? /^[1-2]/.test(grade ?? '') : false;
  const max = small ? 20 : 100;
  const a = range(random, 2, max);
  const b = range(random, 2, small ? 9 : 30);
  const kind = pick(random, ['suma', 'resta', 'multiplicacion']);

  if (kind === 'suma') {
    return {
      prompt: `En el huerto recogemos ${a} tomates por la mañana y ${b} por la tarde. ¿Cuántos tomates hay en total?`,
      answer: String(a + b),
      hint: 'Junta las dos cantidades.',
      feedback: `${a} + ${b} = ${a + b}.`,
    };
  }
  if (kind === 'resta') {
    const big = Math.max(a, b);
    const smallNum = Math.min(a, b);
    return {
      prompt: `Había ${big} semillas y se gastaron ${smallNum}. ¿Cuántas quedan?`,
      answer: String(big - smallNum),
      hint: 'Quita la segunda cantidad a la primera.',
      feedback: `${big} − ${smallNum} = ${big - smallNum}.`,
    };
  }
  const c = range(random, 2, small ? 5 : 9);
  return {
    prompt: `Cada caja lleva ${c} lápices. ¿Cuántos lápices hay en ${a} cajas?`,
    answer: String(c * a),
    hint: 'Repite la cantidad tantas veces como cajas.',
    feedback: `${c} × ${a} = ${c * a}.`,
  };
}

function buildFraction(random) {
  // Numerador y denominador coprimos: la respuesta canónica es irreducible.
  let numerator = 1;
  let denominator = 2;
  for (let intento = 0; intento < 12; intento += 1) {
    denominator = pick(random, [2, 3, 4, 5, 6, 8]);
    numerator = range(random, 1, denominator - 1);
    if (gcd(numerator, denominator) === 1) break;
  }

  const factor = range(random, 2, 4);

  if (random() < 0.5) {
    const correct = `${numerator * factor}/${denominator * factor}`;
    const distractors = [
      `${numerator + factor}/${denominator + factor}`,
      `${numerator * factor}/${denominator + factor}`,
      `${numerator}/${denominator * factor}`,
      `${numerator * factor + 1}/${denominator * factor}`,
    ];
    const options = [correct];
    for (const candidate of distractors) {
      if (options.length >= 4) break;
      if (!options.includes(candidate)) options.push(candidate);
    }
    // Relleno determinista por si los distractores colisionan.
    let extra = 2;
    while (options.length < 4) {
      const candidate = `${numerator * factor + extra}/${denominator * factor}`;
      if (!options.includes(candidate)) options.push(candidate);
      extra += 1;
    }
    const shuffled = shuffle(random, options);
    return {
      prompt: `¿Cuál de estas fracciones es equivalente a ${numerator}/${denominator}?`,
      options: shuffled,
      correctIndex: shuffled.indexOf(correct),
      feedback: `${numerator}/${denominator} = ${correct}: has multiplicado los dos términos por ${factor}.`,
      hint: 'Multiplica arriba y abajo por el mismo número.',
    };
  }

  const display = `${numerator * factor}/${denominator * factor}`;
  return {
    prompt: `Simplifica ${display} y escribe la fracción irreducible (por ejemplo 1/2).`,
    answer: `${numerator}/${denominator}`,
    hint: `Divide los dos números entre ${factor}.`,
    feedback: `${display} = ${numerator}/${denominator}.`,
  };
}

function buildLanguage(random, deck) {
  if (random() < 0.45) {
    const item = deck.language.shift();
    if (item) return { ...item };
  }
  const verb = deck.verbs.shift() ?? pick(random, VERB_FORMS);
  return {
    prompt: `Escribe el verbo de esta oración: «${verb.sentence}»`,
    answer: verb.answer,
    hint: 'El verbo es la acción.',
    feedback: `El verbo es «${verb.answer}».`,
  };
}

function buildScience(random, deck) {
  const item = deck.science.shift();
  return { ...(item ?? pick(random, SCIENCE_BANK)) };
}

/**
 * @param {{topic?: string, grade?: string, count?: number, seed?: number|string}} input
 */
export function generateExercises(input = {}) {
  const topic = String(input.topic ?? '').trim() || 'repaso general';
  const grade = String(input.grade ?? '').trim();
  const count = Math.max(1, Math.min(10, Number(input.count ?? 4)));
  const seed = input.seed === undefined ? hashSeed(`${topic}|${grade}`) : Number(input.seed);
  const random = mulberry32(seed);
  const domain = detectDomain(topic);

  // Barajas sin reemplazo: evita ejercicios repetidos dentro de la misma serie.
  const deck = {
    science: shuffle(random, SCIENCE_BANK),
    language: shuffle(random, LANGUAGE_BANK),
    verbs: shuffle(random, VERB_FORMS),
  };
  const seen = new Set();
  const exercises = [];

  let guard = 0;
  while (exercises.length < count && guard < count * 6) {
    guard += 1;
    let base;
    if (domain === 'fractions') base = buildFraction(random);
    else if (domain === 'math') base = buildMath(random, grade);
    else if (domain === 'language') base = buildLanguage(random, deck);
    else if (domain === 'science') base = buildScience(random, deck);
    else {
      const kind = pick(random, ['math', 'language', 'science']);
      base = kind === 'math' ? buildMath(random, grade) : kind === 'language' ? buildLanguage(random, deck) : buildScience(random, deck);
    }

    if (seen.has(base.prompt)) continue;
    seen.add(base.prompt);
    exercises.push({ id: `${seed}:${exercises.length}`, index: exercises.length, ...base });
  }

  return { topic, grade, seed, domain, count: exercises.length, exercises };
}

/** ¿Son la misma fracción? Compara productos cruzados. */
function sameFraction(a, b) {
  const pattern = /^(\d+)\/(\d+)$/;
  const left = a.match(pattern);
  const right = b.match(pattern);
  if (!left || !right) return false;
  if (Number(left[2]) === 0 || Number(right[2]) === 0) return false;
  return Number(left[1]) * Number(right[2]) === Number(right[1]) * Number(left[2]);
}

/** La respuesta contiene la esperada como palabras completas, no como subcadena. */
function containsTokens(given, expected) {
  const g = tokens(given);
  const e = tokens(expected);
  if (e.length === 0 || g.length < e.length) return false;
  for (let start = 0; start <= g.length - e.length; start += 1) {
    if (e.every((token, offset) => g[start + offset] === token)) return true;
  }
  return false;
}

/** Corrección sin estado: se regenera la serie con el mismo seed. */
export function checkAnswer({ seed, index, topic, grade, answer }) {
  const entry = String(answer ?? '').trim();
  if (entry === '') {
    return {
      correct: false,
      feedback: 'Elige una opción o escribe una respuesta antes de comprobar.',
      hint: null,
      expected: null,
      empty: true,
    };
  }

  const { exercises } = generateExercises({ seed, topic, grade, count: Number(index) + 1 });
  const exercise = exercises[Number(index)];
  if (!exercise) return { correct: false, feedback: 'Ejercicio no encontrado.', expected: null };

  let correct;
  if (Array.isArray(exercise.options)) {
    const numeric = Number(entry);
    const isIndex = /^\d+$/.test(entry) && numeric >= 0 && numeric < exercise.options.length;
    correct = isIndex
      ? numeric === exercise.correctIndex
      : normalise(entry) === normalise(exercise.options[exercise.correctIndex]);
  } else {
    const given = normalise(entry);
    const expected = normalise(exercise.answer);
    correct =
      given === expected ||
      sameFraction(given, expected) ||
      (expected.length >= 3 && containsTokens(given, expected));
  }

  return {
    correct,
    feedback: correct ? exercise.feedback : 'Todavía no. Lee la pista y prueba otra vez; no hay prisa.',
    hint: correct ? null : exercise.hint ?? null,
    expected: correct ? null : exercise.options ? exercise.options[exercise.correctIndex] : exercise.answer,
  };
}

export { hashSeed, gcd, sameFraction };
