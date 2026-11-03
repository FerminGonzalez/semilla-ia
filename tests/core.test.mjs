import test from 'node:test';
import assert from 'node:assert/strict';
import {
  detectOperation,
  detectRisk,
  getCartridge,
  publicCartridges,
  symbolicCalm,
  symbolicFallback,
} from '../src/core/cartridges.mjs';
import { decideEngine } from '../src/core/router.mjs';
import { buildPacket } from '../src/core/telemetry.mjs';
import { clusterDoubts, teacherSummary } from '../src/core/teacher.mjs';
import { validateReading, analyse } from '../src/core/sensors.mjs';

const mate = getCartridge('mate');

test('detectOperation reconoce las cuatro operaciones', () => {
  assert.equal(detectOperation('quiero sumar 4 y 6'), 'suma');
  assert.equal(detectOperation('si quito 3 de 10'), 'resta');
  assert.equal(detectOperation('reparte 24 entre 4'), 'division');
  assert.equal(detectOperation('multiplica 7 por 6'), 'multiplicacion');
  assert.equal(detectOperation('explícame las fracciones'), null, 'sin números no hay operación');
});

test('el cartucho de matemáticas resuelve sin modelo', () => {
  const result = mate.symbolic({
    message: 'Tengo 24 semillas y quiero repartirlas entre 4 amigos',
    grade: '5º',
  });
  assert.match(result.text, /24 ÷ 4 = 6/);
  assert.equal(result.meta.result, 6);
  assert.equal(result.meta.confident, true);
});

test('la resta se resuelve en el orden correcto', () => {
  const result = mate.symbolic({ message: 'si quito 3 de 10, ¿cuánto queda?', grade: '5º' });
  assert.match(result.text, /10 − 3 = 7/);
  assert.equal(result.meta.result, 7);
});

test('no inventa resultados con tres números', () => {
  const result = mate.symbolic({ message: '2 + 3 + 4', grade: '5º' });
  assert.equal(result.meta.result, undefined);
  assert.equal(result.meta.confident, false);
  assert.match(result.text, /Antes de calcular/);
});

test('no confunde un rango con una división', () => {
  const result = mate.symbolic({ message: '¿Cuántos números hay entre 5 y 9?', grade: '5º' });
  assert.equal(result.meta.confident, false);
  assert.ok(!/÷/.test(result.text), 'no debe dividir 5 entre 9');
});

test('el cartucho de idiomas no inventa ngäbere', () => {
  const cartridge = getCartridge('idioma');
  const result = cartridge.symbolic({ message: '¿Cómo se dice agua en ngäbere?' });
  assert.match(result.text, /no voy a improvisar/i);
  assert.equal(result.meta.verified, false);
});

test('el cartucho de lenguas mantiene el orden del texto', () => {
  const cartridge = getCartridge('lengua');
  const result = cartridge.symbolic({ message: 'Hola. Esta es una oración mucho más larga que la anterior.' });
  const hola = result.text.indexOf('Hola');
  const larga = result.text.indexOf('Esta es una oración');
  assert.ok(hola < larga, 'no debe reordenar las frases del alumno');
});

test('detectRisk reconoce señales graves', () => {
  for (const phrase of [
    'me quiero morir',
    'no quiero vivir más',
    'quiero hacerme daño',
    'me pegan en casa',
    'un compañero me ha pegado y tengo miedo',
  ]) {
    assert.equal(detectRisk(phrase), true, `no detecta: ${phrase}`);
  }
  assert.equal(detectRisk('¿por qué llueve?'), false);
});

test('el cartucho de calma deriva ante una señal de peligro', () => {
  const result = symbolicCalm({ message: 'me quiero morir' });
  assert.equal(result.meta.risk, 'alto');
  assert.match(result.text, /adulto/i);
});

test('una señal de riesgo nunca pasa por el modelo, aunque se fuerce', () => {
  const decision = decideEngine({
    message: 'me quiero morir',
    cartridgeId: 'emocional',
    force: 'llm',
  });
  assert.equal(decision.engine, 'symbolic');
  assert.equal(decision.safety, true);
});

test('un tema desconocido devuelve un cartucho válido, no null', () => {
  assert.equal(getCartridge('inexistente').id, 'mate');
  assert.equal(publicCartridges().length, 5);
  assert.ok(symbolicFallback({ message: 'hola' }).text.length > 20);
});

test('el orquestador manda la aritmética al motor simbólico', () => {
  const decision = decideEngine({ message: 'tengo 12 y quito 5, ¿cuánto queda?', cartridgeId: 'mate' });
  assert.equal(decision.engine, 'symbolic');
});

test('el orquestador manda la conversación abierta al modelo', () => {
  const decision = decideEngine({
    message: 'explícame por qué el cielo es azul y qué tiene que ver con la luz',
    cartridgeId: 'ciencias',
  });
  assert.equal(decision.engine, 'llm');
});

test('el orquestador respeta la elección manual', () => {
  assert.equal(decideEngine({ message: 'x'.repeat(40), cartridgeId: 'mate', force: 'symbolic' }).engine, 'symbolic');
  assert.equal(decideEngine({ message: 'x'.repeat(40), cartridgeId: 'mate', force: 'llm' }).engine, 'llm');
});

test('el paquete de telemetría cabe en un marco LoRa y no lleva texto', () => {
  const packet = buildPacket();
  assert.ok(packet.binaryBytes <= packet.loraBudgetBytes);
  assert.ok(packet.fitsInOnePacket);
  assert.ok(packet.binaryBytes < packet.jsonBytes);
  assert.deepEqual(Object.keys(packet.payload).sort(), [
    'dbt', 'llm', 'msgs', 'rds', 'sw', 'sym', 'tps', 'ts', 'up', 'v',
  ]);
  assert.ok(!('question' in packet.payload));
  assert.ok(!('name' in packet.payload));
});

test('clusterDoubts usa el tema cuando existe', () => {
  const doubts = [
    { question: 'no entiendo', cartridge: 'mate', topic: 'fracciones equivalentes' },
    { question: 'y esto', cartridge: 'mate', topic: 'fracciones equivalentes' },
    { question: 'tengo 24 semillas', cartridge: 'mate', topic: 'fracciones equivalentes' },
  ];
  const clusters = clusterDoubts(doubts);
  assert.equal(clusters[0].term, 'fracciones equivalentes');
  assert.equal(clusters[0].source, 'tema');
});

test('clusterDoubts no usa verbos conjugados como foco', () => {
  const doubts = [
    { question: 'tengo semillas y quiero repartirlas', cartridge: 'mate' },
    { question: 'necesito explicar esto', cartridge: 'mate' },
  ];
  const clusters = clusterDoubts(doubts);
  const forbidden = ['tengo', 'quiero', 'necesito', 'explicar'];
  for (const cluster of clusters) {
    assert.ok(!forbidden.includes(cluster.term), `foco inválido: ${cluster.term}`);
  }
});

test('el resumen docente no produce títulos absurdos', () => {
  const summary = teacherSummary();
  assert.ok(!/:\s*(tengo|quiero|necesito)$/i.test(summary.nextSession.title), summary.nextSession.title);
});

test('el sensor rechaza lecturas vacías o fuera de rango', () => {
  const empty = validateReading({ temperature: '', humidity: 10, light: 100 });
  assert.equal(empty.ok, false);

  const bad = validateReading({ temperature: 200, humidity: 10, light: 100 });
  assert.equal(bad.ok, false);

  const good = validateReading({ temperature: 30, humidity: 40, light: 12000 });
  assert.equal(good.ok, true);
  assert.equal(good.reading.source, 'medido');
});

test('el origen de la lectura se etiqueta con honestidad', () => {
  const manual = validateReading({ temperature: 30, humidity: 40, light: 12000, device: 'formulario-aula' });
  assert.equal(manual.reading.source, 'manual');

  const sim = validateReading({ temperature: 30, humidity: 40, light: 12000, source: 'simulado' });
  assert.equal(sim.reading.source, 'simulado');
});

test('analyse marca la serie simulada como simulada', () => {
  const analysis = analyse({ temperature: 31, humidity: 25, light: 40000 }, { simulated: true });
  assert.equal(analysis.simulated, true);
  assert.match(analysis.label, /simulada/);
  assert.equal(analysis.phenomenon, 'aire caliente y seco');
});
