# Modelo ajustado de Ngäbere (pendiente de recibir)

Este directorio está reservado para el **checkpoint fine-tuneado** del modelo
`bitnet-17m:ternario` entrenado con datos de ngäbere. El equipo lo pasará cuando esté
listo.

## Cómo conectarlo

### Opción A: variable de entorno (recomendado)

```powershell
$env:MODELO_AJUSTADO_RUTA = "C:\ruta\al\ckpt_ngäbere.pt"
npm run nodo
```

El traductor lo detectará al arrancar y lo usará en lugar del diccionario estático.

### Opción B: ruta por API

Una vez arrancado el nodo:

```bash
curl -X POST http://127.0.0.1:8090/api/traducir/modelo-ajustado \
  -H "Content-Type: application/json" \
  -d '{"ruta": "C:\\ruta\\al\\ckpt_ngäbere.pt"}'
```

### Opción C: copiar al directorio por defecto

```powershell
copy <ruta>\ckpt_ngäbere.pt models\ajustado\ckpt_ajustado.pt
```

El nodo busca `models/ajustado/ckpt_ajustado.pt` por defecto (variable
`MODELO_AJUSTADO_RUTA`).

## Formato esperado

El checkpoint debe ser un archivo `.pt` de PyTorch compatible con la arquitectura
`MiniBitNet` (`models/model.py`): `vocab 8192 · n_embd 384 · n_head 6 · n_layer 6 ·
block 256`, pesos ternarios `{-1, 0, 1}` con straight-through estimator.

## Corpus de entrenamiento

Los datos usados para preparar el fine-tuning están en:

- `scripts/entrenamiento/datos-ngäbere.json` — 79 pares es-ng-en (frases útiles,
  vocabulario del aula, oraciones de ciencias y matemáticas)
- `data/entrenamiento/corpus-es-ngäbere-en.txt` — formato texto plano con etiquetas
  `<es>`, `<ng>`, `<en>`
- `data/entrenamiento/corpus-es-ngäbere-en.jsonl` — formato JSONL para fine-tuning
- `data/entrenamiento/vocabulario-aula.csv` — vocabulario clave en CSV

Los datos provienen de Wikipedia (español e inglés) sobre el idioma ngäbere y de
material público de vocabulario básico ngäbe.

## Idiomas soportados

- `es` — Español
- `ng` — Ngäbere (ISO 639-3: gym, familia chibcha, Panamá y Costa Rica)
- `en` — English

## Traducción sin modelo ajustado

Hasta que llegue el modelo ajustado, el traductor usa un **diccionario estático**
construido a partir del corpus de entrenamiento. Cubre saludos, instrucciones de aula,
números, familia y conceptos básicos. Las frases que no están en el diccionario se
devuelven sin traducir (motor `fallback`).

## Verificación

```bash
# Listar idiomas y estado del modelo ajustado
curl http://127.0.0.1:8090/api/idiomas

# Traducir
curl -X POST http://127.0.0.1:8090/api/traducir \
  -H "Content-Type: application/json" \
  -d '{"texto":"Hola, ¿cómo estás?","desde":"es","hacia":"ng"}'
```
