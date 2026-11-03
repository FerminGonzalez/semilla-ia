import test from 'node:test';
import assert from 'node:assert/strict';
import { generateExercises, checkAnswer, hashSeed, gcd } from '../src/core/exercises.mjs';

const normalise = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

test('mismo seed produce la misma serie', () => {
  const a = generateExercises({ topic: 'fracciones equivalentes', grade: '5º', count: 4 });
  const b = generateExercises({ topic: 'fracciones equivalentes', grade: '5º', count: 4 });
  assert.deepEqual(a.exercises, b.exercises);
  assert.equal(a.seed, b.seed);
});

test('el seed explícito manda sobre el tema', () => {
  const a = generateExercises({ topic: 'x', seed: 42, count: 2 });
  const b = generateExercises({ topic: 'y', seed: 42, count: 2 });
  assert.deepEqual(a.exercises, b.exercises);
});

test('las opciones múltiples tienen cuatro opciones únicas y un índice válido', () => {
  for (const topic of ['fracciones', 'el ciclo del agua', 'la oración simple', 'repaso']) {
    for (const seed of [1, 2, 3, 7, 11, 99]) {
      const result = generateExercises({ topic, count: 8, seed });
      for (const exercise of result.exercises) {
        if (!Array.isArray(exercise.options)) continue;
        assert.equal(exercise.options.length, 4, `seed ${seed}: ${exercise.prompt}`);
        assert.equal(new Set(exercise.options).size, 4, 'opciones duplicadas');
        assert.ok(exercise.correctIndex >= 0 && exercise.correctIndex <= 3);
      }
    }
  }
});

test('no repite el mismo enunciado dentro de una serie', () => {
  for (const topic of ['el ciclo del agua', 'la oración simple', 'fracciones']) {
    const result = generateExercises({ topic, count: 6, seed: 5 });
    const prompts = result.exercises.map((exercise) => exercise.prompt);
    assert.equal(new Set(prompts).size, prompts.length, `enunciados repetidos en ${topic}`);
  }
});

test('la fracción que se pide simplificar es siempre irreducible', () => {
  for (const seed of [1, 2, 3, 7, 11, 21]) {
    const result = generateExercises({ topic: 'fracciones', count: 8, seed });
    for (const exercise of result.exercises) {
      if (!exercise.answer || !exercise.answer.includes('/')) continue;
      const [numerator, denominator] = exercise.answer.split('/').map(Number);
      assert.equal(gcd(numerator, denominator), 1, `respuesta no irreducible: ${exercise.answer}`);
    }
  }
});

test('checkAnswer rechaza una respuesta vacía', () => {
  const result = generateExercises({ topic: 'fracciones', count: 1, seed: 7 });
  const verdict = checkAnswer({ seed: result.seed, index: 0, answer: '   ', topic: 'fracciones' });
  assert.equal(verdict.correct, false);
  assert.equal(verdict.empty, true);
});

test('checkAnswer acepta la respuesta correcta de una opción', () => {
  const result = generateExercises({ topic: 'fracciones', count: 1, seed: 7 });
  const exercise = result.exercises[0];
  const answer = Array.isArray(exercise.options) ? String(exercise.correctIndex) : exercise.answer;
  const verdict = checkAnswer({ seed: result.seed, index: 0, answer, topic: 'fracciones' });
  assert.equal(verdict.correct, true);
  assert.equal(verdict.expected, null);
});

test('checkAnswer rechaza una respuesta incorrecta y revela la esperada', () => {
  const result = generateExercises({ topic: 'fracciones', count: 1, seed: 7 });
  const exercise = result.exercises[0];
  const wrong = Array.isArray(exercise.options) ? String((exercise.correctIndex + 1) % 4) : 'zzz';
  const verdict = checkAnswer({ seed: result.seed, index: 0, answer: wrong, topic: 'fracciones' });
  assert.equal(verdict.correct, false);
  assert.ok(verdict.expected);
});

test('checkAnswer no acepta subcadenas como respuesta', () => {
  // "1000" no puede valer por "100", ni "12/3" por "2/3".
  const result = generateExercises({ topic: 'fracciones', count: 8, seed: 2 });
  const shortIndex = result.exercises.findIndex((exercise) => !Array.isArray(exercise.options));
  assert.ok(shortIndex >= 0);
  const expected = result.exercises[shortIndex].answer;

  const verdict = checkAnswer({
    seed: result.seed,
    index: shortIndex,
    answer: `${expected}0`,
    topic: 'fracciones',
  });
  assert.equal(verdict.correct, false, `"${expected}0" no debe aceptarse por "${expected}"`);
});

test('checkAnswer acepta fracciones equivalentes', () => {
  const result = generateExercises({ topic: 'fracciones', count: 8, seed: 3 });
  const index = result.exercises.findIndex((exercise) => exercise.answer === '1/2');
  if (index === -1) return; // la serie de este seed no incluye 1/2
  const verdict = checkAnswer({ seed: result.seed, index, answer: '2/4', topic: 'fracciones' });
  assert.equal(verdict.correct, true);
});

test('checkAnswer ignora tildes y mayúsculas en respuesta corta', () => {
  const result = generateExercises({ topic: 'la oración simple', count: 8, seed: 11 });
  const index = result.exercises.findIndex((exercise) => !Array.isArray(exercise.options));
  assert.ok(index >= 0, 'la serie debe incluir una respuesta corta');
  const answer = result.exercises[index].answer;
  const verdict = checkAnswer({
    seed: result.seed,
    index,
    answer: answer.toUpperCase(),
    topic: 'la oración simple',
  });
  assert.equal(verdict.correct, true);
});

test('hashSeed es estable', () => {
  assert.equal(hashSeed('hola'), hashSeed('hola'));
  assert.notEqual(hashSeed('hola'), hashSeed('hola2'));
});

test('los ejercicios son coherentes con el dominio pedido', () => {
  for (const topic of ['fracciones equivalentes', 'el ciclo del agua', 'la oración simple']) {
    const result = generateExercises({ topic, count: 4, seed: 9 });
    const text = normalise(result.exercises.map((exercise) => exercise.prompt).join(' '));
    if (topic.includes('fraccion')) assert.match(text, /fraccion/);
    if (topic.includes('agua')) assert.match(text, /agua|hoja|sensor|plato/);
  }
});
