/**
 * Motor de traducción español <-> ngäbere <-> inglés para Semilla-IA.
 *
 * Diseño:
 * - Capa estática (diccionario desde el corpus de entrenamiento): funciona
 *   SIN modelo ajustado, sin internet, sin dependencias npm.
 * - Capa de modelo ajustado: cuando el equipo pase el checkpoint fine-tuneado
 *   de bitnet-17m:ternario entrenado con ngäbere, se conecta aquí mediante
 *   `conectarModeloAjustado(rutaCheckpoint)`. El módulo delega en él y usa el
 *   diccionario solo como fallback.
 *
 * Idiomas soportados: es (español), ng (ngäbere), en (inglés).
 * Dirección: cualquier par entre los tres.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, '..', '..');
const CORPUS_TXT = resolve(ROOT, 'data', 'entrenamiento', 'corpus-es-ngäbere-en.txt');
const VOCAB_CSV = resolve(ROOT, 'data', 'entrenamiento', 'vocabulario-aula.csv');
const JSONL_CORPUS = resolve(ROOT, 'data', 'entrenamiento', 'corpus-es-ngabe-en.jsonl');

const IDIOMAS = {
  es: { nombre: 'Español', codigo: 'es' },
  ng: { nombre: 'Ngäbere', codigo: 'ng' },
  en: { nombre: 'English', codigo: 'en' },
};

/* ------------------------------------------------------------------ diccionario estático */

// ->[origen][destino][texto] = { texto, confianza }
const DIC = {};

function _limpiar(s) {
  return s.toLowerCase().replace(/[.,¡¿!?;:()]/g, '');
}

function _registrar(es, ng, en) {
  const e = _limpiar(es), n = _limpiar(ng), i = _limpiar(en);
  const pares = [
    ['es', 'ng', e, n], ['es', 'en', e, i],
    ['ng', 'es', n, e], ['ng', 'en', n, i],
    ['en', 'es', i, e], ['en', 'ng', i, n],
  ];
  for (const [o, d, vOrigen, vDestino] of pares) {
    if (!DIC[o]) DIC[o] = {};
    if (!DIC[o][d]) DIC[o][d] = {};
    const textoDestino = o === 'en' ? (d === 'ng' ? ng : en) : d === 'ng' ? ng : en;
    DIC[o][d][vOrigen] = { texto: textoDestino, confianza: 1 };

    // Indexar cada palabra suelta para búsquedas parciales (traducción palabra a palabra)
    const palabrasOrigen = vOrigen.split(/\s+/);
    const palabrasDestino = textoDestino.split(/\s+/);
    const nPalabras = Math.min(palabrasOrigen.length, palabrasDestino.length);
    for (let k = 0; k < nPalabras; k++) {
      const po = _limpiar(palabrasOrigen[k]);
      const pd = _limpiar(palabrasDestino[k]);
      if (po && pd && !DIC[o][d][po]) {
        DIC[o][d][po] = { texto: pd, confianza: 0.7 };
      }
    }
  }
}

function _cargarCorpusTxt() {
  if (!existsSync(CORPUS_TXT)) return;
  const texto = readFileSync(CORPUS_TXT, 'utf8');
  let actual = { es: null, ng: null, en: null };
  for (const lineaRaw of texto.split('\n')) {
    const linea = lineaRaw.trim();
    if (!linea || linea.startsWith('#')) continue;
    const mEs = linea.match(/^<es>(.*)<\/es>$/);
    const mNg = linea.match(/^<ng>(.*)<\/ng>$/);
    const mEn = linea.match(/^<en>(.*)<\/en>$/);
    if (mEs) actual.es = mEs[1];
    else if (mNg) actual.ng = mNg[1];
    else if (mEn) {
      actual.en = mEn[1];
      if (actual.es && actual.ng && actual.en) {
        _registrar(actual.es, actual.ng, actual.en);
      }
      actual = { es: null, ng: null, en: null };
    }
  }
}

function _cargarVocabCsv() {
  if (!existsSync(VOCAB_CSV)) return;
  const texto = readFileSync(VOCAB_CSV, 'utf8');
  const lineas = texto.split('\n').slice(1);
  for (const linea of lineas) {
    const partes = linea.split(',');
    if (partes.length >= 3) {
      const es = partes[0].trim().replace(/^"|"$/g, '');
      const ng = partes[1].trim().replace(/^"|"$/g, '');
      const en = partes[2].trim().replace(/^"|"$/g);
      if (es && ng && en) _registrar(es, ng, en);
    }
  }
}

function _cargarJsonl() {
  if (!existsSync(JSONL_CORPUS)) return;
  const texto = readFileSync(JSONL_CORPUS, 'utf8');
  for (const linea of texto.split('\n')) {
    const l = linea.trim();
    if (!l || l.startsWith('#')) continue;
    try {
      const o = JSON.parse(l);
      const es = String(o.es ?? '').trim();
      const ng = String(o.ng ?? '').trim();
      const en = String(o.en ?? '').trim();
      if (es && ng) _registrar(es, ng, en);
    } catch {
      /* línea ignorada si no es JSON válido */
    }
  }
}

_cargarCorpusTxt();
_cargarVocabCsv();
_cargarJsonl();

/* ------------------------------------------------------------------ capa de modelo ajustado (pendiente) */

let modeloAjustado = null;

/**
 * Conecta el modelo ajustado fine-tuneado con ngäbere.
 */
export function conectarModeloAjustado({ rutaCheckpoint }) {
  if (!existsSync(rutaCheckpoint)) {
    modeloAjustado = { ruta: rutaCheckpoint, disponible: false, error: 'checkpoint no encontrado' };
    return false;
  }
  modeloAjustado = { ruta: rutaCheckpoint, disponible: true };
  console.log(`[traductor] modelo ajustado conectado: ${rutaCheckpoint}`);
  return true;
}

export function estadoModeloAjustado() {
  return modeloAjustado ? { disponible: modeloAjustado.disponible, ruta: modeloAjustado.ruta, error: modeloAjustado.error } : { disponible: false };
}

/* ------------------------------------------------------------------ API pública */

export function idiomasDisponibles() {
  return Object.entries(IDIOMAS).map(([codigo, info]) => ({ codigo, ...info }));
}

export function validarIdioma(codigo) {
  return Object.prototype.hasOwnProperty.call(IDIOMAS, codigo);
}

/**
 * Traduce un texto de un idioma a otro.
 * Devuelve { texto, desde, hacia, motor: 'diccionario' | 'modelo-ajustado' | 'fallback', confianza: number }
 */
export function traducir(texto, desde, hacia) {
  desde = String(desde ?? '').toLowerCase();
  hacia = String(hacia ?? '').toLowerCase();

  if (!validarIdioma(desde) || !validarIdioma(hacia)) {
    return { texto, desde, hacia, motor: 'error', error: 'idioma no soportado', confianza: 0 };
  }
  if (desde === hacia) {
    return { texto, desde, hacia, motor: 'identico', confianza: 1 };
  }

  // 1) intenta el modelo ajustado si está conectado
  if (modeloAjustado?.disponible) {
    try {
      const resultado = _traducirConModeloAjustado(texto, desde, hacia);
      if (resultado) return resultado;
    } catch {
      /* cae al diccionario */
    }
  }

  // 2) diccionario estático (búsqueda exacta, luego por palabras)
  const resultadoDiccionario = _traducirConDiccionario(texto, desde, hacia);
  if (resultadoDiccionario) return resultadoDiccionario;

  // 3) fallback: devuelve el texto original sin traducir, avisando
  return { texto, desde, hacia, motor: 'fallback', confianza: 0, nota: 'sin traducción disponible' };
}

function _traducirConModeloAjustado(texto, desde, hacia) {
  // Placeholder: cuando el equipo pase el checkpoint fine-tuneado, aquí se
  // cargará el modelo bitnet y se generará la traducción. Por ahora no hace
  // nada para no inventar traducciones que no existen.
  return null;
}

function _traducirConDiccionario(texto, desde, hacia) {
  const clave = _limpiar(texto);
  // búsqueda exacta
  if (DIC[desde]?.[hacia]?.[clave]) {
    const r = DIC[desde][hacia][clave];
    return { texto: r.texto, desde, hacia, motor: 'diccionario', confianza: r.confianza };
  }

  // búsqueda por palabras (traducción palabra a palabra para frases compuestas)
  const palabras = texto.split(/\s+/);
  const traducidas = [];
  let encontradas = 0;
  for (const palabra of palabras) {
    const limpia = _limpiar(palabra);
    const r = DIC[desde]?.[hacia]?.[limpia];
    if (r) {
      traducidas.push(r.texto);
      encontradas++;
    } else {
      traducidas.push(palabra); // se queda en el idioma original
    }
  }
  const confianza = palabras.length > 0 ? encontradas / palabras.length : 0;
  if (encontradas > 0) {
    return { texto: traducidas.join(' '), desde, hacia, motor: 'diccionario', confianza };
  }
  return null;
}

export function estadisticasDiccionario() {
  const conteo = {};
  for (const origen of Object.keys(DIC)) {
    conteo[origen] = {};
    for (const destino of Object.keys(DIC[origen])) {
      conteo[origen][destino] = Object.keys(DIC[origen][destino]).length;
    }
  }
  return { idiomas: Object.keys(IDIOMAS), pares: conteo };
}
