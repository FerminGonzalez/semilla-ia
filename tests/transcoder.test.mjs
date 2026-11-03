import test from 'node:test';
import assert from 'node:assert/strict';
import {
  transcode,
  readability,
  splitSentences,
  shortenSentence,
  keyTerms,
} from '../src/core/transcoder.mjs';

const LESSON = `El ciclo del agua describe el movimiento continuo del agua en la Tierra. El sol calienta el agua de mares, ríos y lagos, que se evapora y pasa a la atmósfera en forma de vapor. Cuando ese vapor se enfría en las capas altas, se condensa en pequeñas gotitas que forman las nubes. Finalmente, esas gotitas se agrupan y caen como precipitación en forma de lluvia, nieve o granizo, y el agua vuelve al suelo, a los ríos y al mar para empezar de nuevo.`;

const FUNCTION_WORDS = new Set(['de', 'la', 'el', 'los', 'las', 'un', 'una', 'que', 'y', 'o', 'en', 'con', 'por', 'para', 'al', 'del']);

test('splitSentences separa por signos de cierre', () => {
  assert.equal(splitSentences('Una. Dos! ¿Tres?').length, 3);
});

test('splitSentences no parte abreviaturas', () => {
  assert.equal(splitSentences('El Dr. García llegó. Luego se fue.').length, 2);
});

test('readability penaliza frases largas y devuelve cero sin texto', () => {
  const short = readability('El agua se evapora. El vapor sube.');
  const long = readability(
    'El agua que se encuentra en los mares y en los ríos se evapora lentamente cuando recibe el calor del sol durante muchas horas.',
  );
  assert.ok(short.score > long.score);
  assert.equal(long.band, 'densa');
  assert.equal(readability('').score, 0);
});

test('shortenSentence no deja palabras funcionales al final', () => {
  const parts = shortenSentence(
    'El sol calienta el agua de mares ríos y lagos que se evapora y pasa a la atmósfera en forma de vapor de agua.',
  );
  assert.ok(parts.length > 1);
  for (const part of parts) {
    const last = part.split(' ').at(-1).toLowerCase().replace(/[^a-záéíóúñ]/g, '');
    assert.ok(!FUNCTION_WORDS.has(last), `fragmento acaba en "${last}": ${part}`);
  }
});

test('keyTerms descarta verbos conjugados y conserva sustantivos en -ción', () => {
  const keys = keyTerms(LESSON, 30).map((item) => item.key);
  assert.ok(keys.includes('agua'));
  assert.ok(!keys.includes('agrupan'));
  assert.ok(!keys.includes('forman'));

  const precision = keyTerms('La precisión del instrumento mejora la medición.', 10).map(
    (item) => item.key,
  );
  assert.ok(precision.includes('precision'), 'no debe perder sustantivos terminados en -ción');
});

test('keyTerms devuelve la forma con tilde para mostrar', () => {
  const terms = keyTerms(LESSON, 10);
  const agua = terms.find((item) => item.key === 'agua');
  assert.equal(agua.term, 'agua');
  const rios = keyTerms('Los ríos y las montañas.', 5).find((item) => item.key === 'rios');
  assert.equal(rios.term, 'ríos');
});

test('transcode entrega líneas de lectura fácil y mejora la legibilidad', () => {
  const result = transcode({ title: 'El ciclo del agua', source: LESSON });

  assert.ok(Array.isArray(result.easyReadLines));
  assert.ok(result.easyReadLines.length > result.meta.sentencesIn);
  assert.equal(result.easyRead, result.easyReadLines.join('\n'));

  for (const line of result.easyReadLines) {
    assert.ok(line.split(/\s+/).length <= 16, `línea demasiado larga: ${line}`);
  }

  assert.ok(result.readability.after.wordsPerSentence < result.readability.before.wordsPerSentence);
  assert.ok(result.conceptMap.nodes.length >= 2);
  assert.ok(result.conceptMap.edges.length >= 1);
});

test('el guion de audio no contiene marcadores literales', () => {
  const result = transcode({ title: 'El ciclo del agua', source: LESSON });
  assert.ok(!result.audioScript.includes('(pausa)'));
  assert.ok(result.audioScript.startsWith('Lección:'));
});

test('transcode es determinista', () => {
  const a = transcode({ title: 'T', source: LESSON });
  const b = transcode({ title: 'T', source: LESSON });
  assert.equal(a.easyRead, b.easyRead);
  assert.equal(a.audioScript, b.audioScript);
  assert.deepEqual(a.conceptMap, b.conceptMap);
});

test('el mapa conceptual conserva el texto original, no inventa', () => {
  const result = transcode({ title: 'El ciclo del agua', source: LESSON });
  const leaves = result.conceptMap.nodes.filter((node) => node.level === 2);
  for (const leaf of leaves) {
    const words = leaf.label.replace('…', '').split(' ');
    for (const word of words.slice(0, 4)) {
      assert.ok(LESSON.includes(word), `palabra inventada en el mapa: ${word}`);
    }
  }
});
