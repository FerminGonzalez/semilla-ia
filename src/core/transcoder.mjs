/**
 * Reto 03 · Un contenido, muchas formas.
 * Transcodificador determinista: el mismo texto en lectura fácil, audio y mapa.
 * No usa el modelo local: es instantáneo y siempre da el mismo resultado.
 */

const STOPWORDS = new Set(
  `de la que el en y a los se del las un por con no una su para es al lo como más pero sus le ya o este sí porque esta entre cuando muy sin sobre también me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mí antes algunos qué unos yo otro otras otra él tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mi mis tú te ti tu tus ellas nosotras vosotros vosotras os mío mía míos mías tuyo tuya tuyos tuyas suyo suya suyos suyas nuestro nuestra nuestros nuestras vuestro vuestra vuestros vuestras esos esas estoy estás está estamos estáis están estaba estaban fue fueron ser son era eran sido tiene tienen tenía hace hacen puede pueden debe deben`
    .split(/\s+/)
    .filter(Boolean),
);

/** Palabras que no deben quedar al final de un fragmento ni abrir el siguiente. */
const FUNCTION_WORDS = new Set(
  `de la el los las un una unos unas que y o en con por para al del se su sus como mas pero si no lo le les es son fue ha han muy sin sobre entre cuando donde este esta estos estas ese esa eso mi tu te me nos os`.split(
    ' ',
  ),
);

/** Abreviaturas que no cierran frase. */
const ABBREVIATIONS = new Set(['dr', 'dra', 'sr', 'sra', 'srta', 'etc', 'pag', 'num', 'ee', 'uu', 'ej', 'aprox', 'fig', 's']);

const isFunctionWord = (word) =>
  FUNCTION_WORDS.has(word.toLowerCase().replace(/[^a-záéíóúüñ]/g, ''));

export function splitSentences(text) {
  const prepared = String(text ?? '')
    .replace(/\s+/g, ' ')
    .replace(/\b([A-Za-zÁÉÍÓÚÑáéíóúñ]{1,4})\.\s/g, (match, token) =>
      ABBREVIATIONS.has(token.toLowerCase()) ? `${token}· ` : match,
    );

  return prepared
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/·/g, '.').trim())
    .filter((sentence) => sentence.length > 0);
}

export function words(sentence) {
  return sentence.split(/\s+/).filter(Boolean);
}

/** Índice sencillo de legibilidad: palabras por unidad y proporción de palabras largas. */
export function readability(text) {
  const clean = String(text ?? '').trim();
  if (clean === '') {
    return { sentences: 0, words: 0, wordsPerSentence: 0, longWordRatio: 0, score: 0, band: 'sin texto' };
  }

  const sentences = splitSentences(clean);
  const totalWords = sentences.reduce((sum, sentence) => sum + words(sentence).length, 0);
  const longWords = sentences.reduce(
    (sum, sentence) => sum + words(sentence).filter((word) => word.length > 11).length,
    0,
  );
  const wordsPerSentence = sentences.length === 0 ? 0 : totalWords / sentences.length;
  const longRatio = totalWords === 0 ? 0 : longWords / totalWords;

  const score = Math.max(0, Math.min(100, Math.round(100 - wordsPerSentence * 3 - longRatio * 120)));
  return {
    sentences: sentences.length,
    words: totalWords,
    wordsPerSentence: Math.round(wordsPerSentence * 10) / 10,
    longWordRatio: Math.round(longRatio * 100) / 100,
    score,
    band: score >= 70 ? 'fácil' : score >= 45 ? 'media' : 'densa',
  };
}

/** Parte una frase larga por conectores naturales, sin romper el sentido. */
export function shortenSentence(sentence) {
  const clean = sentence.trim().replace(/[.;!?]+$/, '');
  if (words(clean).length <= 12) return [clean];

  const clauses = clean
    .split(/,\s+|\s+(?=y\s)|\s+(?=pero\s)|\s+(?=porque\s)|\s+(?=que\s)|\s+(?=cuando\s)/i)
    .map((part) => part.trim())
    .filter(Boolean);

  const groups = [];
  let current = [];
  for (const clause of clauses) {
    const candidate = [...current, clause].join(', ');
    if (current.length === 0 || words(candidate).length <= 11) {
      current.push(clause);
    } else {
      groups.push(current.join(', '));
      current = [clause];
    }
  }
  if (current.length > 0) groups.push(current.join(', '));

  return groups.flatMap((group) => (words(group).length > 14 ? smartChunk(group, 11) : [group]));
}

/** Corte por palabras que respeta artículos y preposiciones. */
function smartChunk(text, max) {
  const list = words(text);
  const chunks = [];
  let start = 0;

  while (start < list.length) {
    let end = Math.min(list.length, start + max);
    if (end < list.length) {
      while (end > start + 4 && isFunctionWord(list[end - 1])) end -= 1;
      while (end < list.length && isFunctionWord(list[end])) end += 1;
    }
    chunks.push(list.slice(start, end).join(' '));
    start = end;
  }

  return chunks;
}

/*
 * El filtro de verbos es deliberadamente estrecho: gerundios, participios y
 * 3ª persona del plural. Con `-ón` se perdían «lección», «precisión» o
 * «corazón», que son justo los conceptos que interesa mapear.
 */
const VERB_ENDING = /(ando|iendo|ado|ada|idos|idas|amos|emos|imos|an|en)$/;

export function keyTerms(text, limit = 6) {
  const counts = new Map();
  let position = 0;

  for (const raw of words(String(text ?? ''))) {
    position += 1;
    const clean = raw.replace(/[.,;:()¿?¡!«»"']/g, '');
    const key = clean
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (key.length < 4 || !/^[a-zñ]+$/.test(key)) continue;
    if (STOPWORDS.has(key)) continue;
    if (VERB_ENDING.test(key)) continue;

    const entry = counts.get(key) ?? { term: clean, key, count: 0, first: position };
    entry.count += 1;
    counts.set(key, entry);
  }

  return [...counts.values()]
    .sort((a, b) => b.count - a.count || a.first - b.first)
    .slice(0, limit);
}

/**
 * Transcodifica una lección en tres formatos equivalentes.
 * @param {{title?: string, source: string, grade?: string}} input
 */
export function transcode(input) {
  const source = String(input.source ?? '').trim();
  const title = String(input.title ?? '').trim() || 'La lección';
  const sentences = splitSentences(source);
  const readabilityBefore = readability(source);

  // Cada frase original se conserva como unidad; sus fragmentos van en líneas
  // separadas, que es como se presenta la lectura fácil de verdad.
  const units = sentences.map((sentence) => ({
    sentence,
    parts: shortenSentence(sentence),
    terminal: /[?!]$/.test(sentence) ? sentence.slice(-1) : '.',
  }));

  const lines = units.flatMap(({ parts, terminal }, unitIndex) =>
    parts.map((part, partIndex) => {
      const isLast = partIndex === parts.length - 1;
      return `${capitalise(part)}${isLast ? terminal : ''}`;
    }),
  );

  const easyRead = lines.join('\n');
  const terms = keyTerms(source, 6);
  const conceptMap = buildConceptMap(title, sentences, terms);
  const fragmentsPerSentence =
    units.length === 0 ? 0 : Math.round((lines.length / units.length) * 10) / 10;

  return {
    title,
    source,
    easyRead,
    easyReadLines: lines,
    audioScript: buildAudioScript(title, sentences),
    conceptMap,
    conceptMapText: conceptMapToText(conceptMap),
    glossary: terms.map((item) => ({ term: item.term })),
    checklist: [
      'Una idea por línea.',
      `Fragmentos de ${Math.round(avgLength(lines))} palabras de media.`,
      `Cada frase original se divide en ${fragmentsPerSentence} fragmento${fragmentsPerSentence === 1 ? '' : 's'}.`,
      'Criterio de revisión: comprobar siglas y voz activa antes de publicar.',
    ],
    readability: {
      before: readabilityBefore,
      // Se mide sobre las líneas que se entregan, no sobre una unidad interna.
      after: readability(lines.join('. ')),
    },
    meta: {
      engine: 'simbólico',
      deterministic: true,
      sentencesIn: sentences.length,
      sentencesOut: lines.length,
      fragmentsPerSentence,
    },
  };
}

function avgLength(list) {
  if (list.length === 0) return 0;
  return list.reduce((sum, item) => sum + words(item).length, 0) / list.length;
}

function capitalise(text) {
  const clean = text.trim();
  if (clean === '') return clean;
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

function buildAudioScript(title, sentences) {
  // Sin marcadores literales: el TTS los leería en voz alta.
  const intro = `Lección: ${title}.`;
  const body = sentences
    .map((sentence) => sentence.replace(/[.]+$/, '').trim())
    .map((sentence) => `${sentence}.`)
    .join(' ');
  const outro = 'Fin de la lección. Puedes repetir el audio las veces que necesites.';
  return `${intro} ${body} ${outro}`;
}

function buildConceptMap(title, sentences, terms) {
  const root = { id: 'root', label: title, level: 0 };
  const nodes = [root];
  const edges = [];
  const usedSentences = new Set();

  const chosen = terms.length > 0 ? terms : [{ term: 'idea principal', key: 'idea principal' }];

  chosen.forEach((item, index) => {
    const id = `n${index}`;
    nodes.push({ id, label: item.term, level: 1 });
    edges.push({ from: root.id, to: id });

    // Una frase sirve de ejemplo a un solo término: repetirla en seis ramas
    // daría un mapa ruidoso y fingiría relaciones que el texto no tiene.
    const related = sentences.find(
      (sentence) =>
        !usedSentences.has(sentence) &&
        sentence.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(item.key),
    );
    if (related) {
      usedSentences.add(related);
      const leaf = shortLeaf(related);
      if (leaf) {
        const leafId = `l${index}`;
        nodes.push({ id: leafId, label: leaf, level: 2 });
        edges.push({ from: id, to: leafId });
      }
    }
  });

  return { nodes, edges };
}

/** Una frase corta y literal del texto: nunca inventa contenido. */
function shortLeaf(sentence) {
  const list = words(sentence);
  const leaf = list.slice(0, 7).join(' ').replace(/[,;:]$/, '');
  return leaf.length > 2 ? `${leaf}…` : null;
}

/** Texto plano del mapa, para quien no ve el dibujo o lo imprime. */
export function conceptMapToText(map) {
  const byParent = new Map();
  for (const edge of map.edges) {
    if (!byParent.has(edge.from)) byParent.set(edge.from, []);
    byParent.get(edge.from).push(edge.to);
  }
  const label = (id) => map.nodes.find((node) => node.id === id)?.label ?? id;

  const lines = [];
  const walk = (id, depth) => {
    lines.push(`${'  '.repeat(depth)}- ${label(id)}`);
    for (const child of byParent.get(id) ?? []) walk(child, depth + 1);
  };
  if (map.nodes.length > 0) walk(map.nodes[0].id, 0);
  return lines.join('\n');
}
