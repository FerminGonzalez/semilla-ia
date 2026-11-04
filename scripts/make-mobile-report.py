# -*- coding: utf-8 -*-
"""Genera el informe de evaluación móvil de Semilla-IA (Android / iOS) en PDF.

Reutiliza la tipografía y la paleta del informe principal (scripts/make-report.py).
Salida: INFORME-MOVIL-SEMILLA-IA.pdf en la raíz del proyecto.
"""

import os
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import cm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "INFORME-MOVIL-SEMILLA-IA.pdf")

# ---------------------------------------------------------------- tipografías
FONTS = {
    "Body": [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\segoeuib.ttf"],
    "Display": [r"C:\Windows\Fonts\georgia.ttf", r"C:\Windows\Fonts\georgiab.ttf"],
}
AV = {"body": "Helvetica", "body-bold": "Helvetica-Bold",
      "display": "Times-Roman", "display-bold": "Times-Bold"}

try:
    if all(os.path.exists(p) for p in FONTS["Body"]):
        pdfmetrics.registerFont(TTFont("Segoe", FONTS["Body"][0]))
        pdfmetrics.registerFont(TTFont("Segoe-Bold", FONTS["Body"][1]))
        AV["body"], AV["body-bold"] = "Segoe", "Segoe-Bold"
    if all(os.path.exists(p) for p in FONTS["Display"]):
        pdfmetrics.registerFont(TTFont("Georgia", FONTS["Display"][0]))
        pdfmetrics.registerFont(TTFont("Georgia-Bold", FONTS["Display"][1]))
        AV["display"], AV["display-bold"] = "Georgia", "Georgia-Bold"
except Exception:
    pass

INK = colors.HexColor("#1b1d17")
MUTED = colors.HexColor("#5f6555")
GREEN = colors.HexColor("#14532d")
GREEN_SOFT = colors.HexColor("#e8f0e7")
AMBER = colors.HexColor("#a45a09")
AMBER_SOFT = colors.HexColor("#fbf0dd")
RED = colors.HexColor("#a02222")
RED_SOFT = colors.HexColor("#f9e8e8")
LINE = colors.HexColor("#ddd6c3")
SURFACE = colors.HexColor("#fffdf7")

BODY = ParagraphStyle("body", fontName=AV["body"], fontSize=9.5, leading=13.6,
                      textColor=INK, alignment=TA_JUSTIFY)
SMALL = ParagraphStyle("small", fontName=AV["body"], fontSize=8.5, leading=12,
                       textColor=MUTED, alignment=TA_LEFT)
S_H1 = ParagraphStyle("h1", fontName=AV["display-bold"], fontSize=21, leading=25,
                      textColor=GREEN, spaceAfter=2)
S_H2 = ParagraphStyle("h2", fontName=AV["display-bold"], fontSize=13, leading=16,
                      textColor=GREEN, spaceBefore=14, spaceAfter=5)
S_H3 = ParagraphStyle("h3", fontName=AV["body-bold"], fontSize=10.5, leading=14,
                      textColor=INK, spaceBefore=9, spaceAfter=3)
CELL = ParagraphStyle("cell", fontName=AV["body"], fontSize=8.5, leading=11.6,
                      textColor=INK, alignment=TA_LEFT)
CELL_B = ParagraphStyle("cellb", fontName=AV["body-bold"], fontSize=8.5, leading=11.6,
                        textColor=INK, alignment=TA_LEFT)
HEAD_C = ParagraphStyle("headc", fontName=AV["body-bold"], fontSize=8.5, leading=11.6,
                        textColor=colors.white, alignment=TA_LEFT)
VERDICT = ParagraphStyle("verdict", fontName=AV["body-bold"], fontSize=10, leading=14,
                         textColor=INK)
QUOTE = ParagraphStyle("quote", fontName=AV["body"], fontSize=9, leading=13,
                       textColor=MUTED, leftIndent=14, borderPadding=4)


def base_table(rows, widths, header_style=None):
    data = [[Paragraph(r, HEAD_C) for r in rows[0]]]
    data += [[Paragraph(c, CELL_B if j == 0 else CELL) for j, c in enumerate(row)]
             for row in rows[1:]]
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), GREEN),
        ("LINEBELOW", (0, 0), (-1, 0), 0.8, GREEN),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [SURFACE, GREEN_SOFT]),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
    ]
    return Table(data, colWidths=widths, style=TableStyle(style), repeatRows=1)


def box(text, bg, fg):
    return Table([[Paragraph(text, VERDICT)]], colWidths=[17 * cm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.8, fg),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
    ]))


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.5)
    canvas.line(2 * cm, 1.55 * cm, A4[0] - 2 * cm, 1.55 * cm)
    canvas.setFont(AV["body"], 7.5)
    canvas.setFillColor(MUTED)
    canvas.drawString(2 * cm, 1.2 * cm, "Semilla-IA · #hack4edu 2026 · evaluación de implementación móvil")
    canvas.drawRightString(A4[0] - 2 * cm, 1.2 * cm, datetime.now().strftime("generado el %d/%m/%Y %H:%M"))
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=2 * cm, rightMargin=2 * cm,
                      topMargin=1.8 * cm, bottomMargin=2 * cm,
                      title="Semilla-IA · Evaluación de implementación móvil",
                      author="Semilla-IA")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=footer)])

E = []
def A(x):
    E.append(x)


def H1(text):
    return Paragraph(text, S_H1)


def H2(text):
    return Paragraph(text, S_H2)


def H3(text):
    return Paragraph(text, S_H3)

A(H1("Semilla-IA en móvil (Android / iOS)"))
A(Paragraph("Evaluación de viabilidad para ejecutar la IA local del nodo en una plataforma móvil. "
            "El código revisado es el prototipo actual (tests nativos: 44/44 correctos al momento del análisis).", BODY))
A(Spacer(1, 8))

# ------------------------------------------------------------------ qué usa la IA
A(H2("1 · Qué es hoy la IA del nodo"))
A(Paragraph(
    "El nodo es un servidor Node con librería estándar, sin dependencias, que combina un motor "
    "simbólico determinista (&lt;10 ms) con el motor ternario propio bitnet-17m:ternario, servido "
    "por un sidecar local en 127.0.0.1:11435. "
    "Los alumnos ya acceden desde su navegador por red local: el terminal móvil es hoy un cliente del nodo, no el nodo.", BODY))
A(base_table(
    [
        ["Pieza", "Dónde vive", "Portabilidad a móvil"],
        ["Inferencia LLM", "Sidecar propio en 127.0.0.1:11435 (tools/bitnet_server.py), aislada en src/core/ollama.mjs",
         "Alta: basta sustituir ese adaptador por un runtime en proceso"],
        ["Orquestador híbrido", "src/core/router.mjs, JS puro; degrada a motor simbólico si el modelo falla o está ocupado",
         "Total: el fallback ya construido es exactamente el comportamiento que exige la térmica de un móvil"],
        ["Cartuchos, ejercicios, transcodificador, docente", "JS puro + JSON local",
         "Total: no dependen de nada nativo"],
        ["Interfaz de alumnos", "Web SPA servida por LAN, viewport responsive",
         "Ya funciona en dispositivos móviles como cliente"],
    ],
    [4.2 * cm, 6.6 * cm, 6.2 * cm]))
A(Spacer(1, 6))

# ------------------------------------------------------------------ A B C
A(H2("2 · Escenarios"))
A(H3("A · Teléfono como cliente del nodo (ya funciona)"))
A(Paragraph(
    "El diseño actual («no hay que instalar nada en los dispositivos de los alumnos») ya es móvil. "
    "Solo requeriría pulir el layout de los seis paneles, que usan una barra lateral fija pensada para pantalla grande.", BODY))

A(H3("B · Teléfono como nodo — Android: viabilidad alta"))
A(Paragraph(
    "Es el escenario que reemplaza el «nodo RISC-V de &lt;12 USD» proyectado por un teléfono Android donado. "
    "Cifras medidas en 2026 con Qwen2.5 1.5B en GGUF, el mismo modelo que ya ejecuta el nodo:", BODY))
A(base_table(
    [
        ["Teléfono típico", "Modelo", "Velocidad generando", "¿Usable en aula?"],
        ["Gama alta (S25 / Pixel 9 Pro, 8+ GB)", "Qwen2.5 1.5B Q4 (1,0 GB)", "25–48 tok/s", "Sí, fluido"],
        ["Gama media (Snapdragon 7 gen, 6–8 GB)", "Qwen2.5 1.5B Q4_K_M", "≈14 tok/s · ≈23 s por respuesta corta",
         "Sí, lento pero coherente con los 42 s medidos en el PC del nodo"],
        ["Gama baja (4 GB, ~2020)", "1,5B Q4", "&lt;5 tok/s", "Marginal"],
        ["Gama alta", "3B Q4 (1,8 GB)", "≈18 tok/s", "Sí, con 8+ GB de RAM"],
        ["Gama media", "3B Q4", "Muy lento, riesgo de swap", "No recomendado"],
    ],
    [4.6 * cm, 3.9 * cm, 4.6 * cm, 3.9 * cm]))
A(Spacer(1, 4))
A(Paragraph(
    "Tres rutas de implementación, de menos a más esfuerzo:", BODY))
A(base_table(
    [
        ["Ruta", "Qué implica", "Para qué sirve"],
        ["Termux + llama.cpp (1–2 días, casi sin tocar código)",
         "Servidor llama.cpp con el GGUF Q4 existente y el nodo Node.js en Termux; solo hace falta un adaptador de ≈40 líneas porque /api/chat es específico de Ollama",
         "Demo del hackatón: «un teléfono hace de nodo»"],
        ["App Android con llama.rn o MLC LLM (JNI, producción)",
         "Se porta src/core/*.mjs —módulos ES puros— y ollama.mjs pasa a llamar al runtime en proceso",
         "Producto distribuido vía APK"],
        ["LiteRT-LM (Google)", "Ruta NPU (&gt;50 tok/s en gama alta); integración más pesada",
         "Maximizar rendimiento y autonomía"],
    ],
    [4.6 * cm, 7.2 * cm, 5.2 * cm]))
A(Spacer(1, 4))
A(H3("Riesgos medidos del escenario B"))
A(base_table(
    [
        ["Riesgo", "Evidencia", "Mitigación"],
        ["Térmica", "En Samsung, la GPU fremea tras el umbral: 25 → 5 tok/s en meseta; la política varía por fabricante",
         "El orquestador ya limita a 1–2 generaciones y degrada a simbólico; añadir un guard térmico (motor simbólico si batería &lt;25 % o SOC caliente)"],
        ["Batería", "La inferencia sostenida consume como un juego",
         "Coherente con el planteamiento solar del pitch; asumir carga frecuente y declararlo"],
        ["Ejecución en segundo plano", "Android mata el servidor al apagarse la pantalla si no hay foreground service",
         "Foreground service con notificación permanente"],
    ],
    [3.6 * cm, 7.2 * cm, 6.2 * cm]))
A(Spacer(1, 6))

A(H3("C · Inferencia en el teléfono de cada alumno: no recomendado"))
A(Paragraph(
    "Depende de la gama de cada terminal, drena la batería de teléfonos prestados por las familias y rompe la propiedad "
    "clásica del diseño («el nodo atiende una generación cada vez: es un aula»). El consumo energético se multiplicaría "
    "N veces en lugar de concentrarse en un nodo. El nodo centralizado es la decisión correcta; mantenerla.", BODY))

A(Spacer(1, 4))
A(H2("3 · iOS"))
A(Paragraph(
    "Como runtime de inferencia no hay problema: Metal está maduro y un iPhone 15/16 Pro genera el mismo "
    "Qwen2.5 1.5B Q4 a 48–64 tok/s —más rápido que la mayoría de Android—; desde iOS 26 además existe el modelo "
    "en el dispositivo del sistema (FoundationModels), sin instalar nada.", BODY))
A(Paragraph(
    "Como nodo de aula, iOS es la opción equivocada: segundo plano limitado (el servidor moriría al bloquear la pantalla), "
    "hotspot + servidor web + permisos estrictos y coste del hardware. Solo tendría sentido en el escenario C, "
    "que queda descartado. Windows/Android primero; iOS se documenta, no se implementa.", BODY))
A(Spacer(1, 4))

A(H2("4 · Veredicto"))
A(base_table(
    [
        ["Escenario", "Viabilidad", "Nota"],
        ["Android como nodo (1,5B Q4)", "Alta", "Recomendado; sustituto real del «nodo RISC-V» proyectado"],
        ["Android con el modelo de 3B", "Media", "Solo con 8+ GB de RAM y en carga corta"],
        ["iOS como nodo", "Baja", "Buen motor de inferencia, mal servidor de aula"],
        ["IA en cada teléfono de alumno", "Baja", "Contradice la arquitectura del nodo y la gestión energética"],
        ["Móvil como cliente del nodo actual", "Ya funciona", "Solo falta responsive del layout"],
    ],
    [5.4 * cm, 2.6 * cm, 9.0 * cm]))
A(Spacer(1, 8))

A(box("VEREDICTO GENERAL: la implantación en plataforma móvil es viable, y la recomendada es Android "
          "como nodo con el modelo Qwen2.5 1.5B Q4 que el proyecto ya empaqueta: el mismo GGUF, "
          "1,2–1,3 GB, corre a 25–48 tok/s en gama alta y ≈14 tok/s en gama media.", GREEN_SOFT, GREEN))
A(Spacer(1, 8))

A(H2("5 · Camino mínimo"))
A(base_table(
    [
        ["Paso", "Qué hacer", "Esfuerzo"],
        ["1 · Prototipo", "Termux + llama.cpp con el GGUF semilla-1.5b adaptado, adaptador /api/chat, NODO_HOST=0.0.0.0 y hotspot del propio teléfono",
         "Horas"],
        ["2 · Medir en el dispositivo", "Mismas métricas que en el documento: tok/s y latencia de primera respuesta con llama-bench, etiquetadas como medición real",
         "1 prueba"],
        ["3 · App empaquetada", "Fase 2: llama.rn (o MLC) + port del núcleo; el único archivo que cambia de verdad es ollama.mjs",
         "Días"],
        ["4 · Guard térmico y de batería", "Regla nueva en el orquestador con la misma estructura que la del cartucho de calma (motivo protegido: ahorro energético)",
         "~1 prueba unitaria"],
    ],
    [3.3 * cm, 10.7 * cm, 3.0 * cm]))
A(Spacer(1, 6))
A(Paragraph(
    "Fuentes de rendimiento: benchmarks públicos de llama.cpp, MLC LLM y LiteRT-LM sobre teléfonos concretos "
    "(Pixel 9, Galaxy S23/S25, Snapdragon 7 gen 3) de 2026, además del runlocalai.co “guía Android”. "
    "Todas las cifras de esta evaluación son de dispositivos de terceros: antes de presentarlas al jurado, "
    "medir en el dispositivo Android que representa el nodo.", SMALL))

doc.build(E)
print("OK ->", OUT)
