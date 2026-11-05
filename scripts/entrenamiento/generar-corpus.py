#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera el corpus de entrenamiento español <-> ngäbere <-> inglés
en varios formatos listos para fine-tuning del modelo bitnet-17m:ternario.

Salidas:
  data/entrenamiento/corpus-es-ngäbere-en.txt      texto plano con pares etiquetados
  data/entrenamiento/corpus-es-ngäbere-en.jsonl    JSONL (una pareja por línea)
  data/entrenamiento/vocabulario-aula.csv          vocabulario clave del aula
"""

import json
import csv
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # repositorio
DATOS = ROOT / "scripts" / "entrenamiento" / "datos-ngäbere.json"
OUT_DIR = ROOT / "data" / "entrenamiento"


def cargar_datos():
    with open(DATOS, encoding="utf-8") as f:
        return json.load(f)


def generar_txt(datos):
    """Texto plano con bloques etiquetados <es> <ng> <en>."""
    lineas = []
    lineas.append("# Corpus de entrenamiento: español <-> ngäbere <-> inglés")
    lineas.append("# Idioma: ngäbere (ISO 639-3: gym) · Familia: chibcha · Regiones: Panamá, Costa Rica")
    lineas.append("# Generado automáticamente a partir de scripts/entrenamiento/datos-ngäbere.json")
    lineas.append("")

    # Frases útiles
    for fr in datos["frases_utiles"]:
        lineas.append(f"<es>{fr['es']}</es>")
        lineas.append(f"<ng>{fr['ng']}</ng>")
        lineas.append(f"<en>{fr['en']}</en>")
        lineas.append("")

    # Oraciones del aula
    for fr in datos["oraciones_aula"]:
        lineas.append(f"<es>{fr['es']}</es>")
        lineas.append(f"<ng>{fr['ng']}</ng>")
        lineas.append(f"<en>{fr['en']}</en>")
        lineas.append("")

    # Oración ejemplo larga
    lineas.append(f"<es>{datos['oracion_ejemplo_es']}</es>")
    lineas.append(f"<ng>{datos['oracion_ejemplo_ng']}</ng>")
    lineas.append(f"<en>{datos['oracion_ejemplo_en']}</en>")
    lineas.append("")

    return "\n".join(lineas)


def generar_jsonl(datos):
    """JSONL: cada línea es un objeto con es, ng, en, contexto."""
    lineas = []
    for fr in datos["frases_utiles"]:
        obj = {
            "es": fr["es"],
            "ng": fr["ng"],
            "en": fr["en"],
            "contexto": fr["contexto"],
        }
        lineas.append(json.dumps(obj, ensure_ascii=False))
    for fr in datos["oraciones_aula"]:
        obj = {
            "es": fr["es"],
            "ng": fr["ng"],
            "en": fr["en"],
            "contexto": fr["contexto"],
        }
        lineas.append(json.dumps(obj, ensure_ascii=False))
    return "\n".join(lineas)


def generar_csv(datos):
    """CSV: vocabulario clave del aula."""
    filas = ["español,ngäbere,inglés,contexto"]
    for fr in datos["frases_utiles"]:
        filas.append(f'{fr["es"]},{fr["ng"]},{fr["en"]},{fr["contexto"]}')
    return "\n".join(filas)


def main():
    datos = cargar_datos()
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    txt = generar_txt(datos)
    jsonl = generar_jsonl(datos)
    csv = generar_csv(datos)

    (OUT_DIR / "corpus-es-ngäbere-en.txt").write_text(txt, encoding="utf-8")
    (OUT_DIR / "corpus-es-ngäbere-en.jsonl").write_text(jsonl, encoding="utf-8")
    (OUT_DIR / "vocabulario-aula.csv").write_text(csv, encoding="utf-8")

    n_frases = len(datos["frases_utiles"]) + len(datos["oraciones_aula"]) + 1
    print(f"Corpus generado en {OUT_DIR}")
    print(f"  pares es-ng-en: {n_frases}")
    print(f"  ficheros: corpus-es-ngäbere-en.txt, corpus-es-ngäbere-en.jsonl, vocabulario-aula.csv")


if __name__ == "__main__":
    main()
