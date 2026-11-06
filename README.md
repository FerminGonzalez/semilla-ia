# 🌱 Semilla-IA

### El aula que no necesita internet

![hack4edu 2026 · Reto 02](https://img.shields.io/badge/hack4edu-2026%20%C2%B7%20Reto%2002-0A6B4C)
![licencia MIT](https://img.shields.io/badge/licencia-MIT-green)
![pruebas](https://img.shields.io/badge/pruebas-43%2F43-brightgreen)
![sin npm install](https://img.shields.io/badge/npm%20install-NUNCA-critical)
![100% offline](https://img.shields.io/badge/100%25-offline-orange)
![parámetros](https://img.shields.io/badge/par%C3%A1metros-17%20M-ff69b4)

<img src="docs/captura-nodo.png" width="600" alt="Panel principal de Semilla-IA">

**Un nodo pequeño y portátil convierte cualquier salón en un aula con IA propia: sin SIM, sin router, sin nube, sin una sola petición a internet.** Sirve una clase completa por wifi, conversa con un modelo de lenguaje entrenado por nosotros y ejecutado en la propia máquina, corrige ejercicios sin red y entrega al docente un resumen de lo que la clase no entendió.

> La IA prepara y acompaña. El docente decide. El alumno no habla con cualquiera: habla con un cartucho que tiene reglas.

Prototipo para **#hack4edu 2026 · Reto 02 — Aprender sin conexión** (y retos 03, 10, 12, 13, 15 y 17).

---

## 📦 Instalación paso a paso

### 1. Requisitos

| Requisito | Versión | Para qué |
|---|---|---|
| Node.js | 24+ | Servidor del nodo (sin `npm install`) |
| Python | 3.10+ | Sidecar del modelo de inferencia |
| torch | CPU build | Ejecutar el modelo ternario localmente |
| tokenizers | Python | Tokenizer del modelo |

No necesitas instalar dependencias npm: el nodo usa solo la librería estándar de Node 24.

### 2. Clonar el repositorio

```bash
git clone https://github.com/FerminGonzalez/semilla-ia.git
cd semilla-ia
```

### 3. Colocar el checkpoint del modelo

El modelo base (195 MB) no entra en git. Debes copiarlo una sola vez:

```powershell
# Copiar el checkpoint a la carpeta models/
copy <ruta-a-tu-checkpoint>\ckpt_4500.pt models\
```

Si ya tienes el modelo en `models/`, salta este paso.

### 4. Arrancar el nodo

```bash
npm run nodo
```

Esto levanta:
- El **sidecar de inferencia** en `http://127.0.0.1:11435` (motor ternario propio)
- El **nodo web** en `http://127.0.0.1:8090` (panel que ves en el navegador)

El primer arranque imprime el **PIN del panel docente** (guárdalo, lo necesitarás para el panel docente).

### 5. Abrir en el navegador

Ve a: **http://127.0.0.1:8090**

Desde cualquier dispositivo en la misma red wifi (móvil, tablet, portátil de los alumnos), abre la misma dirección IP del nodo.

---

## 🚀 Cómo usar la aplicación

El panel tiene 6 secciones. Navega por el menú lateral izquierdo:

### 1. Nodo (página principal)

Muestra el estado del nodo: modelo activo, memoria, velocidad de inferencia, consumo de energía y red local. Es lo que ves al entrar.

### 2. Aula

Chat para alumnos con 4 cartuchos pedagógicos:

| Cartucho | Para qué sirve |
|---|---|
| **Sin prisa** | Matemáticas con material manipulable, sin cronómetro |
| **Con las manos** | Ciencias con datos reales del sensor |
| **Palabra a palabra** | Lectoescritura y lectura fácil |
| **Cápsula de calma** | Acompañamiento en emergencias |

Escribe tu pregunta y el nodo decide si responde con el motor simbólico (<10 ms, determinista) o con el modelo ternario (lenguaje natural).

### 3. Consulta libre

Chat sin cartucho, directo al modelo local. Úsalo para preguntas abiertas. El historial se guarda en la sesión del navegador.

### 4. Traductor (español ↔ ngäbere ↔ inglés)

Traduce frases clave del aula entre los tres idiomas:

1. Escribe el texto en el cuadro de texto
2. Selecciona el idioma de origen y destino
3. Clic en **Traducir** (o presiona Enter)

Idiomas disponibles: **Español**, **Ngäbere**, **English**

### 5. Docente (requiere PIN)

Panel protegido con PIN (se genera al arrancar y está en `data/config.json`):

- Ver dudas agregadas de la clase
- Ver dinámica y rúbrica
- Señales de riesgo detectadas
- Resumen de lo que la clase no entendió

### 6. Hardware

Lecturas del sensor (temperatura, humedad, luz), gráfico en tiempo real y paquete de telemetría federado (17 bytes, cabe en LoRa).

---

## 🌐 Para el aula real (red local)

Para que los alumnos accedan desde sus dispositivos por wifi:

```powershell
$env:NODO_HOST = '0.0.0.0'
npm run nodo
```

El panel mostrará la IP local (ej. `http://192.168.1.50:8090`). Los alumnos abren esa dirección desde su navegador.

**Primera vez en Windows:** se pedirá permiso para aceptar conexiones en red privada. Debes permitirlo, o abrir el puerto manualmente:

```powershell
New-NetFirewallRule -DisplayName "Semilla-IA" -Direction Inbound -LocalPort 8090 -Protocol TCP -Action Allow -Profile Private
```

---

## 🧪 Probar que todo funciona

```bash
# Ejecutar las 43 pruebas
npm test

# Solo el motor de inferencia (sin el nodo web)
npm run bitnet

# Solo el nodo web (motor simbólico, sin modelo)
npm start

# Regenerar el informe PDF con medidas vivas
npm run report
```

---

## 📊 Los números que importan

Todo medido en el equipo del proyecto, no estimado:

| | **`bitnet-17m:ternario`** · nuestro motor | Qwen2.5 1.5B · solo referencia |
|---|---|---|
| Parámetros | **17.033.984** | 1.500.000.000 |
| Disco | **204 MB** | 1.226 MB |
| Velocidad en CPU | 13,6–15,1 tok/s | 13,7–15,7 tok/s |
| Perplejidad | **39,46** | — |

**88× menos parámetros · ~6× menos disco · la misma velocidad.**

---

## 🌱 Traducción: español ↔ ngäbere ↔ inglés

Semilla-IA incluye un traductor de lengua indígena para clases bilingües:

- **Diccionario estático:** 780 pares español–ngäbere–inglés (saludos, instrucciones de aula, números, familia, naturaleza)
- **Modelo ajustado ngäbere:** `models/ajustado/ckpt_ngabe.pt` (13,8 M parámetros, 46,8 MB) incluido en el repo
- **Ruta:** Pestaña "Traductor" en el panel, o `POST /api/traducir`

---

## 🔒 Límites honestos

El motor propio es un modelo de lenguaje causal entrenado sobre Wikipedia, no un asistente afinado:

- ❌ **La conversación libre puede salir incoherente** (es un LM causal, ignora el system prompt)
- ✅ **Lo crítico no depende de él:** aritmética, ejercicios, rúbricas y señales de riesgo los resuelve el motor simbólico

---

## 📄 Documentos

| Documento | Qué contiene |
|---|---|
| [`docs/idea-de-solucion.pdf`](docs/idea-de-solucion.pdf) | El problema del salón a 3 horas |
| [`docs/NgäbereWiki.pdf`](docs/NgäbereWiki.pdf) | Lengua ngäbere: gramática, alfabeto, frases |
| [`docs/Vocabulario-Ngabe.pdf`](docs/Vocabulario-Ngabe.pdf) | Vocabulario ngäbe-español |
| [`PLAN.md`](PLAN.md) | Plan de trabajo por slices |

---

## 📄 Licencia

[MIT](LICENSE) · © 2026 Equipo Semilla-IA.

Prototipo educativo para **#hack4edu 2026**.
