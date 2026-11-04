/**
 * Cartuchos ("LoRA simulada", fase 3 del pitch).
 *
 * Cada cartucho es un par: un prompt de sistema para el modelo local y un
 * resolutor simbólico determinista. El orquestador decide cuál de los dos usa
 * según la tarea, no según la suerte.
 */

const COMMON_RULES = `Reglas que no puedes romper:
- Responde en español de España, claro y breve (máximo 130 palabras).
- No pidas nunca datos personales: ni nombre completo, ni colegio, ni dirección.
- No des diagnósticos médicos ni psicológicos, ni etiquetes al alumno.
- Si no sabes algo, dilo y propón cómo comprobarlo.
- Nada de enlaces, vídeos ni recursos online: el nodo funciona sin internet.
- No inventes cifras. Si das un dato, que sea comprobable.`;

function context({ extra }) {
  // El curso y el tema NO se interpolan aquí: acaban en el turno de usuario,
  // delimitados, para que un campo del formulario no reescriba el rol de sistema.
  return extra ? String(extra) : '';
}

export const CARTRIDGES = [
  {
    id: 'mate',
    name: 'Sin prisa',
    role: 'Tutor de matemáticas',
    reto: 'Reto 10 · Encontrar a quien dejamos atrás',
    tagline: 'Explica con material manipulable y sin cronómetro. Nunca etiqueta al alumno.',
    accent: '#1f6f5c',
    buildSystemPrompt: (ctx) => `Eres un tutor de matemáticas para escuela rural.
${context(ctx)}
Trabajas con niños que han acumulado huecos y que se bloquean con la prisa. Por eso:
- Empieza siempre por algo que el alumno ya sabe hacer.
- Usa objetos contables (piedras, semillas, tapones, palos) antes que símbolos.
- Da un solo paso por respuesta y termina preguntando si quiere seguir.
- Si el alumno se equivoca, describe el error sin valorarlo y ofrece otra forma de verlo.
${COMMON_RULES}`,
    symbolic: (ctx) => symbolicMaths(ctx),
  },
  {
    id: 'ciencias',
    name: 'Con las manos',
    role: 'Laboratorio de ciencias',
    reto: 'Reto 17 · Laboratorio de ciencias sin laboratorio',
    tagline: 'Razona sobre datos reales del sensor del nodo y guía el método científico.',
    accent: '#8a5a1f',
    buildSystemPrompt: (ctx) => `Eres un guía de ciencias naturales en una escuela sin laboratorio.
${context(ctx)}
Trabajas con materiales del entorno y con las lecturas de un sensor conectado al nodo.
- Distingue siempre observación, hipótesis y conclusión.
- Propón experimentos posibles con agua, tierra, luz, plantas o el propio sensor.
- No des la conclusión antes de que el alumno formule su hipótesis.
- Si hay datos del sensor, úsalos explícitamente con sus cifras.
${COMMON_RULES}`,
    symbolic: (ctx) => symbolicScience(ctx),
  },
  {
    id: 'lengua',
    name: 'Palabra a palabra',
    role: 'Lectura y escritura',
    reto: 'Reto 03 · Un contenido, muchas formas',
    tagline: 'Adapta el mismo texto a lectura fácil, audio y mapa conceptual.',
    accent: '#3a5a8a',
    buildSystemPrompt: (ctx) => `Eres un especialista en lectoescritura y lectura fácil.
${context(ctx)}
- Frases cortas, una idea por frase, voz activa.
- Vocabulario cotidiano; si usas una palabra difícil, explícala entre paréntesis.
- No infantilices al alumno: simplifica la forma, no el contenido.
- Cuando corrijas un texto, señala primero lo que sí funciona.
${COMMON_RULES}`,
    symbolic: (ctx) => symbolicLanguage(ctx),
  },
  {
    id: 'emocional',
    name: 'Cápsula de calma',
    role: 'Apoyo en emergencias',
    reto: 'Reto 15 · Educación en emergencias',
    tagline: 'Acompaña sin diagnosticar. Si hay riesgo, deriva a un adulto.',
    accent: '#a3442f',
    buildSystemPrompt: (ctx) => `Acompañas a un menor en un contexto de emergencia (desplazamiento, desastre, cierre de escuela).
${context(ctx)}
- Habla despacio, en frases cortas, sin minimizar lo que siente.
- Ofrece una sola acción sencilla y concreta (respirar, beber agua, buscar a un adulto de confianza).
- No diagnostiques, no interpretes, no prometas que todo irá bien.
- Si aparece peligro para el menor o para otros, indica con claridad que hable con un adulto de confianza o con un servicio de emergencia local.
- Recuerda que eres una herramienta, no una persona.
${COMMON_RULES}`,
    symbolic: (ctx) => symbolicCalm(ctx),
  },
];

export function getCartridge(id) {
  return CARTRIDGES.find((item) => item.id === id) ?? CARTRIDGES[0];
}

export function publicCartridges() {
  return CARTRIDGES.map(({ id, name, role, reto, tagline, accent }) => ({
    id,
    name,
    role,
    reto,
    tagline,
    accent,
  }));
}

/* ------------------------------------------------------------------ */
/* Resolutores simbólicos: respuesta inmediata, determinista y sin modelo */
/* ------------------------------------------------------------------ */

const normalise = (text) =>
  String(text ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function cleanQuestion(text) {
  return String(text ?? '').trim().replace(/\s+/g, ' ');
}

export function detectOperation(text) {
  const t = normalise(text);
  if (!/\d/.test(t)) return null;

  if (/\bentre\b|\brepart\w*\b|\bdivid\w*\b|\//.test(t)) return 'division';
  if (/\bmultiplic\w*\b|\bveces\b|\d+\s*(?:x|por|\*)\s*\d+/.test(t)) return 'multiplicacion';
  if (/\bsum\w*\b|\bmas\b|\bagreg\w*\b|\bjunt\w*\b|\+/.test(t)) return 'suma';
  if (/\brest\w*\b|\bquit\w*\b|\bmenos\b|\bsobran?\b|\bquedan?\b|-/.test(t)) return 'resta';
  return null;
}

function symbolicMaths({ message, grade, topic }) {
  const question = cleanQuestion(message);
  const numbers = (question.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => Number(n.replace(',', '.')));
  const operation = detectOperation(question);
  const normalised = normalise(question);

  // Solo se calcula con exactamente dos operandos y una operación inequívoca.
  // «¿Cuántos números hay entre 5 y 9?» no es una división: es un rango.
  const comparative = /entre\s+\d+\s+y\s+\d+/.test(normalised);
  const ambiguous = numbers.length !== 2 || comparative || /cuantos\s+\w+\s+hay\s+entre/.test(normalised);

  if (!operation || ambiguous) {
    return pedagogicMaths({ topic, grade, numbers, reason: ambiguous && numbers.length >= 2 });
  }

  let [a, b] = numbers;

  // «quito 3 de 10» significa 10 − 3, no 3 − 10.
  const reversed = question.match(
    /(?:quito|quitar|resta|restar)\s+(\d+(?:[.,]\d+)?)\s+(?:de|a)\s+(\d+(?:[.,]\d+)?)/i,
  );
  if (operation === 'resta' && reversed) {
    b = Number(reversed[1].replace(',', '.'));
    a = Number(reversed[2].replace(',', '.'));
  }

  let result = null;
  let symbol = '';
  if (operation === 'suma') {
    result = a + b;
    symbol = '+';
  } else if (operation === 'resta') {
    result = a - b;
    symbol = '−';
  } else if (operation === 'multiplicacion') {
    result = a * b;
    symbol = '×';
  } else if (operation === 'division') {
    if (b === 0) return pedagogicMaths({ topic, grade, numbers, reason: false });
    result = Math.round((a / b) * 100) / 100;
    symbol = '÷';
  }

  if (result === null) return pedagogicMaths({ topic, grade, numbers, reason: false });

  return {
    text: `**Vamos paso a paso**

Tienes ${a} y ${b}. La operación que necesitas es ${operationLabel(operation)}.

1. Piensa qué significa: ${describeOperation(operation, a, b)}
2. ${manipulativeHint(operation, a, b)}
3. Resultado: **${a} ${symbol} ${b} = ${result}**

**Compruébalo tú:** ${checkHint(operation, a, b, result)}

¿Quieres que lo hagamos con números más pequeños o con un ejemplo de tu casa?`,
    meta: { operation, numbers: [a, b], result, confident: true },
  };
}

/** Cuando no hay seguridad, se dice. Un número falso enseña peor que una pregunta. */
function pedagogicMaths({ topic, grade, numbers, reason }) {
  const stage = /^[1-2]/.test(grade ?? '') ? 'primer ciclo' : 'segundo o tercer ciclo';
  const lead = reason
    ? 'Con esos números hay más de una operación posible y no quiero darte un resultado equivocado.'
    : 'Necesito que me lo cuentes de otra forma para resolverlo con seguridad.';

  return {
    text: `**Antes de calcular**

${lead}

Dime qué quieres hacer, con una de estas formas:
- «junto ${numbers[0] ?? 8} y ${numbers[1] ?? 5}»
- «quito ${numbers[0] ?? 3} de ${numbers[1] ?? 10}»
- «reparto ${numbers[1] ?? 12} entre ${numbers[0] ?? 4}»

**Mientras tanto, con material (${stage})**
- Usa semillas o tapones: cada montón es una cantidad.
- Juntar montones es sumar; quitar es restar; repartir en partes iguales es dividir.
- Si el problema tiene tres números, hazlo en dos pasos y anota el resultado del primero.

Escríbemelo con tus palabras, aunque esté mal escrito. No hay prisa y no hay nota.`,
    meta: { operation: null, confident: false },
  };
}

function describeOperation(operation, a, b) {
  switch (operation) {
    case 'suma':
      return `juntar ${a} con ${b}, es decir, contar todo seguido.`;
    case 'resta':
      return `quitar ${b} de ${a} y ver cuánto queda.`;
    case 'multiplicacion':
      return `repetir ${a} un total de ${b} veces.`;
    case 'division':
      return `repartir ${a} en ${b} partes iguales.`;
    default:
      return 'identificar los grupos que tienes.';
  }
}

function operationLabel(operation) {
  return (
    {
      suma: 'una suma',
      resta: 'una resta',
      multiplicacion: 'una multiplicación',
      division: 'una división',
      fraccion: 'una fracción',
    }[operation] ?? 'una operación'
  );
}

function manipulativeHint(operation, a, b) {
  switch (operation) {
    case 'suma':
      return `Coge ${Math.min(a, 20)} piedras y otras ${Math.min(b, 20)}. Júntalas y cuéntalas todas.`;
    case 'resta':
      return `Dibuja ${Math.min(a, 20)} palitos y tacha ${Math.min(b, 20)}. Cuenta los que quedan sin tachar.`;
    case 'multiplicacion':
      return `Haz ${Math.min(b, 10)} montones con ${Math.min(a, 10)} objetos cada uno y cuéntalos todos.`;
    case 'division':
      return `Coge ${Math.min(a, 40)} semillas y repártelas en ${Math.min(b, 10)} montones iguales, una a una.`;
    default:
      return 'Usa objetos que puedas contar y mover.';
  }
}

function checkHint(operation, a, b, result) {
  switch (operation) {
    case 'suma':
      return `resta ${b} al resultado y debe darte ${a}.`;
    case 'resta':
      return `suma ${b} al resultado y debe darte ${a}.`;
    case 'multiplicacion':
      return `divide ${result} entre ${b} y debe darte ${a}.`;
    case 'division':
      return `multiplica ${result} por ${b} y debe acercarse a ${a}.`;
    default:
      return 'repite la operación de otra forma.';
  }
}

function symbolicScience({ message, sensor }) {
  const reading = sensor ?? null;
  const question = cleanQuestion(message);

  if (/fotosintesis|planta|hoja|clorofila/.test(normalise(question))) {
    const light = reading ? reading.light : null;
    return {
      text: `**Observación**
${light !== null ? `El sensor marca ${light} lux ahora mismo.` : 'No hay lectura del sensor en este momento.'}

**Hipótesis (tuya, no mía)**
Escribe qué crees que le pasará a una hoja si la tapamos tres días.

**Experimento posible sin laboratorio**
1. Dos hojas de la misma planta, una tapada con cartón y otra al aire.
2. Riega las dos igual durante tres días.
3. Compara el color y el brillo.

**Qué mirar**
La hoja tapada no recibe luz. Sin luz no puede fabricar su alimento y pierde el color verde.

**Conclusión (escríbela tú)**
¿Qué relación hay entre la luz y el color de la hoja?`,
      meta: { experiment: 'fotosintesis' },
    };
  }

  if (reading) {
    const trend = reading.humidity !== undefined && reading.temperature !== undefined
      ? reading.temperature > 25 && reading.humidity < 40
        ? 'aire caliente y seco'
        : reading.humidity > 70
          ? 'aire húmedo'
          : 'condiciones templadas'
      : 'sin datos suficientes';

    return {
      text: `**Lo que dice el sensor ahora**

- Temperatura: ${reading.temperature ?? '—'} °C
- Humedad: ${reading.humidity ?? '—'} %
- Luz: ${reading.light ?? '—'} lux

Eso es ${trend}. Antes de explicarlo, fórmula tu hipótesis:

> ¿Por qué crees que el agua de un plato desaparece más rápido unos días que otros?

**Experimento con lo que hay**
1. Dos platos iguales con la misma agua, uno al sol y otro a la sombra.
2. Mira el nivel cada hora y anótalo.
3. Relaciona lo que ves con la temperatura y la humedad que marca el sensor.

**Conclusión**
El agua pasa a vapor (evaporación). Cuanto más calor y menos humedad, más rápido ocurre. ¿Coincide con tus datos?`,
      meta: { experiment: 'evaporacion' },
    };
  }

  return {
    text: `**Empecemos observando**

Para hacer ciencia no hace falta un laboratorio: hace falta fijarse y anotar.

1. Elige algo que cambie durante el día: una sombra, un charco, una planta.
2. Anota tres momentos con la misma pregunta.
3. Escribe una frase con esta forma: «Creo que ___ porque ___».

El nodo tiene un sensor conectado. Si lo enciendes, puedo razonar con sus cifras de temperatura, humedad y luz en lugar de con suposiciones.`,
    meta: { experiment: null },
  };
}

function symbolicLanguage({ message }) {
  const text = cleanQuestion(message);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const longest = sentences.reduce((max, item) => (item.length > max.length ? item : max), '');

  return {
    text: `**Tu texto, tal cual**

${sentences.length > 0 ? sentences.map((s) => `- ${s.trim()}`).join('\n') : '- Escribe una frase y trabajamos con ella.'}

**Lo que veo**
- ${sentences.length} frase${sentences.length === 1 ? '' : 's'}.
- La más larga tiene ${longest.trim().split(/\s+/).filter(Boolean).length} palabras.
- No he cambiado ni el orden ni las palabras: lo que lees arriba es tuyo.

**Para simplificarlo de verdad**
Usa la herramienta «Muchas formas» de este mismo nodo: corta las frases largas, mide la legibilidad antes y después, y te devuelve también audio y mapa conceptual.

**Pista de escritura**
Sujeto + verbo + qué. Ejemplo: «La niña / leyó / el cuento».`,
    meta: { sentences: sentences.length, longest: longest.trim() },
  };
}

/**
 * Señales de riesgo que obligan a derivar a un adulto.
 * No es un clasificador clínico: es un conjunto conservador de patrones.
 * Ante la duda, deriva.
 */
const RISK_PATTERN =
  /(suicid|matarme|matarirme|morirme|quiero morir|no quiero vivir|quiero desaparecer|hacerme dano|hacerme dano|autolesion|cortarme|me corto|me pegan|me pega|me maltratan|me maltrata|me tocan|abus|violac|violad|amenaz|me amenaza|peligro|herido|herida|sangre|golpe|miedo|no puedo mas|nadie me quiere)/;

export function detectRisk(text) {
  return RISK_PATTERN.test(normalise(text));
}

export function symbolicCalm({ message }) {
  const danger = detectRisk(message);

  if (danger) {
    return {
      text: `**Lo primero: que estés con alguien**

Lo que cuentas suena a algo que no deberías cargar tú solo.

1. Busca ahora a un adulto de confianza: un familiar, un docente, alguien del centro.
2. Si hay peligro inmediato, pide que llamen al servicio de emergencia de tu país.
3. No tienes que explicarlo todo ni explicarlo bien. Basta con decir «necesito ayuda».

Yo soy una herramienta en un nodo pequeño y no puedo acompañarte en un momento así. Una persona sí puede.

Cuando estés con alguien, si quieres, seguimos con lo que necesites.`,
      meta: { risk: 'alto', action: 'derivar a adulto' },
    };
  }

  return {
    text: `**Estamos aquí un momento**

No hace falta explicar nada largo. Vamos despacio.

1. Apoya los pies en el suelo y nota el suelo.
2. Respira contando hasta cuatro al entrar y hasta seis al salir. Tres veces.
3. Mira alrededor y nombra tres cosas que veas.

**Después**
Si te apetece, escribe una sola frase de cómo estás. No la corrijo y no la guardo con tu nombre.

Si en algún momento aparece algo que te da miedo, dilo y buscamos a un adulto de confianza.`,
    meta: { risk: 'bajo', action: 'regulación' },
  };
}

/** Respuesta simbólica para cualquier cartucho, como red de seguridad. */
export function symbolicFallback({ message }) {
  const text = cleanQuestion(message);
  if (text === '') {
    return {
      text: 'Escribe tu pregunta con tus palabras. No hace falta que esté bien escrita: aquí no hay nota.',
      meta: { fallback: true },
    };
  }
  return {
    text: `**Vamos a acotarlo**

Lo que preguntas es: «${text.slice(0, 160)}».

Para responderte bien necesito dos cosas:
1. ¿En qué curso estás?
2. ¿Qué parte te bloquea: entender la idea, hacer el ejercicio o explicarlo?

Mientras lo piensas, una idea que sirve casi siempre: empieza por lo que ya sabes del tema y escribe una frase. De ahí tiramos.`,
    meta: { fallback: true },
  };
}

