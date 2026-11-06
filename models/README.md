# Motor `bitnet-17m:ternario`

Aquí vive el motor de inferencia propio. El código y el tokenizer **sí van en el
repositorio**; los binarios pesados no (GitHub limita los ficheros a 100 MB).

| Fichero | ¿En git? | Qué es |
|---|---|---|
| `model.py` | ✅ | Definición de `MiniBitNet`: `BitLinear` ternario `{-1, 0, 1}` con straight-through estimator, activaciones a 8 bits. |
| `train.py` | ✅ | Entrenamiento: ~4.500 iteraciones sobre Wikipedia en español. |
| `demo.py` | ✅ | Inferencia de una frase desde la línea de comandos. |
| `tokenizer_wiki_8192.json` | ✅ | Tokenizer de 8.192 entradas. |
| `ckpt_4500.pt` | ❌ (195 MB) | Pesos entrenados. Cópialo aquí. |
| `val_wiki.bin` | ❌ (9,8 MB) | Corpus de validación con el que se midió la perplejidad **39,46**. |

## Puesta en marcha

```powershell
# 1. Colocar el checkpoint (una sola vez)
copy <ruta>\ckpt_4500.pt models\

# 2. Arrancar el nodo completo
npm run nodo
```

Si el checkpoint no está, `tools/bitnet_server.py` lo dice con un mensaje claro
al arrancar. También se puede apuntar a otra carpeta con la variable `BITNET_DIR`:

```powershell
$env:BITNET_DIR = "C:\ruta\del\motor"
npm run bitnet
```

## Requisitos

- Python 3.10+ con `torch` (suficiente la build CPU) y `tokenizers`.
- 204 MB libres en RAM para el modelo cargado.
- Sin internet en ningún momento: la inferencia es 100 % local.

## Medidas del motor

| Métrica | Valor |
|---|---|
| Parámetros | 17.033.984 |
| Configuración | `vocab 8192 · n_embd 384 · n_head 6 · n_layer 6 · block 256` |
| Pesos | ternarios `{-1, 0, 1}` (STE), activaciones 8 bits |
| Disco | 204 MB (204.488.011 bytes) |
| Perplejidad (`val_wiki.bin`) | 39,46 |
| Velocidad | 13,6–17,1 tok/s en CPU |

## Modelo ajustado: ngäbere (lengua indígena)

También incluido en este repositorio:

| Métrica | Valor |
|---|---|
| Archivo | `models/ajustado/ckpt_ngabe.pt` |
| Parámetros | 13.835.008 (13,8 M) |
| Configuración | `vocab 4096 · n_embd 384 · n_head 6 · n_layer 6 · block 128` |
| Pesos | ternarios `{-1, 0, 1}` (STE), activaciones 8 bits |
| Disco | 46,8 MB |
| Tokenizer | `models/ajustado/tokenizer_ngabe.json` |

Este checkpoint fine-tuneado con ngäbere se carga automáticamente al arrancar
el nodo. Véase `models/ajustado/README.md` para más detalles.
