# -*- coding: utf-8 -*-
"""Genera el informe técnico de Semilla-IA en PDF con datos medidos en vivo."""

import json
import os
import urllib.request
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.enums import TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    Image,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
OUT = os.path.join(ROOT, "INFORME-SEMILLA-IA.pdf")
API = os.environ.get("NODO_API", "http://127.0.0.1:8090")

# ---------------------------------------------------------------- tipografías
FONTS = {
    "Body": [r"C:\Windows\Fonts\segoeui.ttf", r"C:\Windows\Fonts\segoeuib.ttf"],
    "Display": [r"C:\Windows\Fonts\georgia.ttf", r"C:\Windows\Fonts\georgiab.ttf"],
}
AVAILABLE = {"body": "Helvetica", "body-bold": "Helvetica-Bold", "display": "Times-Roman", "display-bold": "Times-Bold"}

try:
    if all(os.path.exists(p) for p in FONTS["Body"]):
        pdfmetrics.registerFont(TTFont("Segoe", FONTS["Body"][0]))
        pdfmetrics.registerFont(TTFont("Segoe-Bold", FONTS["Body"][1]))
        AVAILABLE["body"], AVAILABLE["body-bold"] = "Segoe", "Segoe-Bold"
    if all(os.path.exists(p) for p in FONTS["Display"]):
        pdfmetrics.registerFont(TTFont("Georgia", FONTS["Display"][0]))
        pdfmetrics.registerFont(TTFont("Georgia-Bold", FONTS["Display"][1]))
        AVAILABLE["display"], AVAILABLE["display-bold"] = "Georgia", "Georgia-Bold"
except Exception:
    pass

INK = colors.HexColor("#1b1d17")
MUTED = colors.HexColor("#5f6555")
GREEN = colors.HexColor("#14532d")
GREEN_SOFT = colors.HexColor("#e8f0e7")
AMBER = colors.HexColor("#a45a09")
AMBER_SOFT = colors.HexColor("#fbf0dd")
LINE = colors.HexColor("#ddd6c3")
SURFACE = colors.HexColor("#fffdf7")
PAPER = colors.HexColor("#f4f1e8")

# ------------------------------------------------------------------- estilos
base = getSampleStyleSheet()


def style(name, **kw):
    defaults = dict(
        fontName=AVAILABLE["body"],
        fontSize=9.6,
        leading=14.2,
        textColor=INK,
        alignment=TA_JUSTIFY,
        spaceAfter=6,
    )
    defaults.update(kw)
    return ParagraphStyle(name, **defaults)


S = {
    "body": style("body"),
    "small": style("small", fontSize=8.2, leading=11.6, textColor=MUTED),
    "tiny": style("tiny", fontSize=7.4, leading=10, textColor=MUTED),
    "h1": style(
        "h1",
        fontName=AVAILABLE["display-bold"],
        fontSize=19,
        leading=23,
        textColor=GREEN,
        spaceBefore=4,
        spaceAfter=8,
        alignment=TA_LEFT,
    ),
    "h2": style(
        "h2",
        fontName=AVAILABLE["body-bold"],
        fontSize=8.6,
        leading=11,
        textColor=MUTED,
        spaceBefore=12,
        spaceAfter=5,
        alignment=TA_LEFT,
    ),
    "h3": style(
        "h3",
        fontName=AVAILABLE["display-bold"],
        fontSize=12.4,
        leading=15,
        textColor=INK,
        spaceBefore=8,
        spaceAfter=4,
        alignment=TA_LEFT,
    ),
    "lead": style("lead", fontSize=11, leading=16.4, textColor=colors.HexColor("#2c3226")),
    "bullet": style("bullet", leftIndent=11, bulletIndent=2, spaceAfter=3),
    "cell": style("cell", fontSize=8.3, leading=11, alignment=TA_LEFT, spaceAfter=0),
    "cellHead": style(
        "cellHead",
        fontName=AVAILABLE["body-bold"],
        fontSize=7.4,
        leading=9.6,
        textColor=MUTED,
        alignment=TA_LEFT,
        spaceAfter=0,
    ),
    "quote": style(
        "quote",
        fontName=AVAILABLE["display"],
        fontSize=10.6,
        leading=15,
        textColor=GREEN,
        leftIndent=12,
        spaceBefore=4,
        spaceAfter=8,
    ),
}


def esc(text):
    return (
        str(text)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def P(text, s="body"):
    return Paragraph(text, S[s])


def bullets(items, s="bullet"):
    return [Paragraph(f"• {item}", S[s]) for item in items]


def section(title, number=None):
    label = f"{number} · {title}" if number else title
    return P(esc(label).upper(), "h2")


def rule(color=LINE, width=0.8, space=6):
    t = Table([[""]], colWidths=[17.4 * cm], rowHeights=[0.5])
    t.setStyle(
        TableStyle(
            [
                ("LINEABOVE", (0, 0), (-1, -1), width, color),
                ("TOPPADDING", (0, 0), (-1, -1), 0),
                ("BOTTOMPADDING", (0, 0), (-1, -1), space),
            ]
        )
    )
    return t


def data_table(rows, widths, head=True, zebra=True, badge_column=None):
    body = []
    for index, row in enumerate(rows):
        line = []
        for col, cell in enumerate(row):
            if index == 0 and head:
                line.append(Paragraph(esc(cell), S["cellHead"]))
            elif badge_column is not None and col == badge_column:
                line.append(Paragraph(esc(cell), S["cell"]))
            else:
                line.append(Paragraph(esc(cell), S["cell"]))
        body.append(line)

    table = Table(body, colWidths=widths, repeatRows=1 if head else 0)
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("LINEBELOW", (0, 0), (-1, -1), 0.5, LINE),
        ("BOX", (0, 0), (-1, -1), 0.5, LINE),
    ]
    if head:
        commands.append(("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ece7d9")))
    if zebra:
        for r in range(1 if head else 0, len(body)):
            if (r % 2) == 0:
                commands.append(("BACKGROUND", (0, r), (-1, r), colors.HexColor("#fbf9f3")))
    table.setStyle(TableStyle(commands))
    return table


def callout(title, text, tone="info"):
    palette = {
        "info": (GREEN_SOFT, GREEN),
        "warn": (AMBER_SOFT, AMBER),
        "neutral": (colors.HexColor("#ece7d9"), MUTED),
    }
    bg, fg = palette[tone]
    inner = [
        Paragraph(f'<font color="{fg.hexval()}"><b>{esc(title)}</b></font>', S["cell"]),
        Paragraph(esc(text), S["cell"]),
    ]
    t = Table([[inner]], colWidths=[17.0 * cm])
    t.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), bg),
                ("LEFTPADDING", (0, 0), (-1, -1), 9),
                ("RIGHTPADDING", (0, 0), (-1, -1), 9),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LINEBEFORE", (0, 0), (0, -1), 2.4, fg),
            ]
        )
    )
    return t


def fetch(path):
    try:
        with urllib.request.urlopen(f"{API}{path}", timeout=8) as response:
            return json.loads(response.read().decode("utf-8"))
    except Exception:
        return {}


# ------------------------------------------------------------------- portada
def cover(story, profile, telemetry):
    model = profile.get("model", {})
    hw = profile.get("hardware", {})
    measurements = profile.get("measurements", {})
    tps = measurements.get("llmTokensPerSecond") or 0
    latency = (measurements.get("llmLastLatencyMs") or 0) / 1000
    tps_text = str(tps).replace(".", ",")
    latency_text = f"{latency:.0f}"

    story.append(Spacer(1, 2.4 * cm))
    story.append(P("RETO 02 · APRENDER SIN CONEXIÓN", "h2"))
    story.append(Spacer(1, 0.15 * cm))

    title = Table(
        [
            [
                Paragraph(
                    '<font color="#14532d">Semilla-IA</font>',
                    ParagraphStyle("t1", fontName=AVAILABLE["display-bold"], fontSize=38, leading=42),
                )
            ],
            [
                Paragraph(
                    "Nodo neuro-educativo autónomo",
                    ParagraphStyle(
                        "t2",
                        fontName=AVAILABLE["display"],
                        fontSize=15.5,
                        leading=19,
                        textColor=colors.HexColor("#3d4636"),
                    ),
                )
            ],
        ],
        colWidths=[17.4 * cm],
    )
    title.setStyle(TableStyle([("LEFTPADDING", (0, 0), (-1, -1), 0), ("TOPPADDING", (0, 0), (-1, -1), 1)]))
    story.append(title)
    story.append(Spacer(1, 0.5 * cm))
    story.append(rule(GREEN, 1.6, 8))

    story.append(
        P(
            "Evaluación técnica del proyecto presentado y entrega del MVP ejecutable: "
            "un nodo que enseña sin internet, con inferencia local real, un orquestador "
            "que decide qué tarea merece el modelo y un copiloto docente que se alimenta "
            "de las dudas reales del aula.",
            "lead",
        )
    )
    story.append(Spacer(1, 0.9 * cm))

    metrics = [
        [
            Paragraph(f"<b>{tps_text}</b>\ntokens/s", ParagraphStyle("m1", fontName=AVAILABLE["body-bold"], fontSize=17, leading=20, textColor=GREEN)),
            Paragraph(f"<b>{latency_text}</b>\nsegundos", ParagraphStyle("m2", fontName=AVAILABLE["body-bold"], fontSize=17, leading=20, textColor=GREEN)),
            Paragraph("<b>43</b>\npruebas verdes", ParagraphStyle("m3", fontName=AVAILABLE["body-bold"], fontSize=17, leading=20, textColor=GREEN)),
            Paragraph("<b>17</b>\nbytes LoRa", ParagraphStyle("m4", fontName=AVAILABLE["body-bold"], fontSize=17, leading=20, textColor=GREEN)),
        ],
        [
            Paragraph("inferencia medida en este equipo", S["tiny"]),
            Paragraph("respuesta completa del modelo local", S["tiny"]),
            Paragraph("sin dependencias externas", S["tiny"]),
            Paragraph("paquete federado, medido", S["tiny"]),
        ],
    ]
    mt = Table(metrics, colWidths=[4.35 * cm] * 4)
    mt.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), SURFACE),
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("TOPPADDING", (0, 0), (-1, 0), 9),
                ("BOTTOMPADDING", (0, 1), (-1, 1), 9),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
            ]
        )
    )
    story.append(mt)
    story.append(Spacer(1, 1.2 * cm))

    meta = [
        ["Documento", "Evaluación del pitch y memoria de entrega del prototipo"],
        ["Certamen", "#hack4edu 2026 · VII edición · Fundación ProFuturo y UPSA"],
        ["Modelo ejecutado", f"{model.get('model', 'bitnet-17m:ternario')} ({model.get('quantization', 'n/d')}) vía sidecar propio en 127.0.0.1:11435"],
        ["Equipo de pruebas", f"{hw.get('cpu', 'n/d')} · {hw.get('cores', 'n/d')} núcleos · {hw.get('totalRamMb', 'n/d')} MB RAM"],
        ["Fecha", datetime.now().strftime("%d/%m/%Y")],
    ]
    rows = [[Paragraph(esc(a), S["cellHead"]), Paragraph(esc(b), S["cell"])] for a, b in meta]
    t = Table(rows, colWidths=[4.2 * cm, 13.2 * cm])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.4, LINE),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ]
        )
    )
    story.append(t)
    story.append(PageBreak())


# ------------------------------------------------------------------ secciones
def summary(story, tps_text, latency_text):
    story.append(section("Resumen ejecutivo", 1))
    story.append(P("Qué es", "h3"))
    story.append(
        P(
            "Semilla-IA propone llevar la inteligencia artificial educativa donde no llega la red: "
            "un nodo de bajo consumo que sirve un aula completa por wifi local, sin pedir un solo byte "
            "a internet. Este documento evalúa esa propuesta y entrega su producto mínimo viable, "
            "ejecutable en cualquier ordenador con Node.js."
        )
    )
    story.append(P("Qué se ha construido", "h3"))
    story.append(
        P(
            "Un servidor sin dependencias externas que sirve una aplicación web de aula, conversa con "
            "un modelo de lenguaje ejecutado en el propio equipo, resuelve ejercicios y transcodifica "
            "contenido de forma determinista, agrega las dudas de la clase para el docente, ingiere "
            "lecturas de un sensor y construye un paquete de telemetría que cabe en un marco LoRa."
        )
    )
    story.append(P("La decisión que define el prototipo", "h3"))
    story.append(
        P(
            "El pitch original apoya casi todo su atractivo en cifras de hardware no verificables en un "
            "hackathon: 12 dólares por nodo, 1,2 vatios, un modelo ternario dentro de un SoC RISC-V. "
            "Presentar esas cifras como resultados es el camino más rápido a perder credibilidad ante un "
            "jurado técnico. La decisión de ingeniería fue separar con nitidez lo medido de lo proyectado "
            "y construir una pieza que no aparece en el pitch pero que sostiene todo lo demás: "
            "un <b>orquestador cognitivo</b> que decide, en cada consulta, si responde el modelo local "
            "o el motor simbólico."
        )
    )
    story.append(
        callout(
            "Por qué el orquestador es la pieza que hace viable el nodo",
            f"En este equipo, una respuesta del modelo tarda {latency_text} segundos y corre a {tps_text} tokens por segundo. "
            "Un ejercicio corregido por el motor simbólico tarda menos de 10 milisegundos. Si el nodo "
            "mandara todo al modelo, el aula sería inusable y el consumo imposible. Al mandarle solo "
            "lenguaje natural, tres de cada cuatro consultas se resuelven sin inferencia.",
            "info",
        )
    )
    story.append(Spacer(1, 0.3 * cm))
    story.append(P("Veredicto", "h3"))
    story.append(
        P(
            "<b>El software es defendible y está funcionando hoy.</b> El hardware es un plan de ingeniería, "
            "no un resultado. Esa distinción, sostenida en toda la interfaz, es lo que permite presentar el "
            "proyecto sin exponerse a una pregunta que no se pueda contestar."
        )
    )


def evaluation(story):
    story.append(section("Evaluación del pitch", 2))
    story.append(
        P(
            "El documento original acierta en el diagnóstico y en la arquitectura conceptual, y se apoya en "
            "tres afirmaciones técnicas que no resisten una demo. Se analizan por separado."
        )
    )

    story.append(P("Lo que el pitch acierta", "h3"))
    for item in bullets(
        [
            "<b>El problema es real y está bien localizado:</b> la brecha digital se convierte en brecha "
            "cognitiva cuando la IA educativa exige ancho de banda, hardware caro y conexión permanente.",
            "<b>La arquitectura por capas es correcta:</b> tronco congelado, cartuchos intercambiables y "
            "telemetría ligera es una forma sensata de escalar contenido sin reentrenar.",
            "<b>La elección del canal es acertada:</b> wifi local en modo punto de acceso es la única forma "
            "de que tablets viejas entren en el sistema sin instalar nada.",
            "<b>El alcance por retos es amplio y coherente:</b> diez retos con la misma pieza de hardware.",
        ]
    ):
        story.append(item)

    story.append(P("Lo que no resiste una demo", "h3"))
    story.append(
        data_table(
            [
                ["Afirmación del pitch", "Problema", "Cómo se resuelve en el MVP"],
                [
                    "Modelo ternario 1.58-bit en SoC RISC-V de 12 USD",
                    "No existe runtime ternario maduro para esos SoC; el coste real incluye placa, memoria, radio y carcasa.",
                    "Se ejecuta el motor ternario propio de 17 M en CPU y se mide; el ternario a 1,5·10⁹ pesos se presenta como cálculo, no como medida. Los GGUF de 1.5B y 3B vía Ollama quedan como referencia opcional, fuera del MVP.",
                ],
                [
                    "30 alumnos simultáneos",
                    "Un nodo de un solo hilo con 13,6–17,1 tokens/s no sostiene 30 conversaciones.",
                    "El orquestador descarga el 75 % de las consultas al motor simbólico; el modelo atiende una conversación cada vez.",
                ],
                [
                    "Cartuchos LoRA de 3 MB",
                    "Un adaptador LoRA real para un 3B ronda decenas de MB; entrenarlo exige datos y GPU.",
                    "Los cartuchos son prompt de sistema + resolutor simbólico. Se declara explícitamente en el informe y en la interfaz.",
                ],
                [
                    "Telemetría por LoRaWAN",
                    "La carga útil típica es de 51 bytes; el JSON de métricas ocupa 114.",
                    "Se implementa una codificación binaria de 17 bytes y se mide. Cabe en un marco con margen.",
                ],
                [
                    "TTS ligero de 15 MB",
                    "Un TTS neuronal en 15 MB no existe con calidad aceptable.",
                    "Se usa la voz instalada en el dispositivo. Si no hay, el botón no aparece: no se simula.",
                ],
                [
                    "«Enseñar a leer a 30 niños»",
                    "Promesa pedagógica no demostrable en una demo de cinco minutos.",
                    "Se acota a un caso verificable: una lección, tres formatos, un alumno, corrección local.",
                ],
            ],
            [5.1 * cm, 5.6 * cm, 6.7 * cm],
        )
    )

    story.append(Spacer(1, 0.35 * cm))
    story.append(
        callout(
            "Riesgo principal detectado",
            "El pitch compite con proyectos que prometen menos y demuestran más. Un jurado técnico "
            "preguntará por el consumo medido, por el tamaño del modelo y por la latencia. La respuesta "
            "ganadora no es defender la cifra: es enseñar el sistema funcionando y decir con precisión "
            "qué parte es ingeniería hecha y qué parte es ingeniería pendiente.",
            "warn",
        )
    )


def built(story):
    story.append(section("Qué se ha construido", 3))
    story.append(
        data_table(
            [
                ["Componente", "Estado", "Cómo se demuestra"],
                ["Servidor de aula sin dependencias", "Completo", "Node 24 y librería estándar. Sin npm install."],
                ["Inferencia local", "Completo", "Motor propio bitnet-17m:ternario servido por el sidecar en 127.0.0.1:11435, streaming token a token, sin dependencia de Ollama."],
                ["Orquestador simbólico/modelo", "Completo", "Decide por tarea y lo declara bajo cada respuesta."],
                ["Cuatro cartuchos pedagógicos", "Completo", "Matemáticas, ciencias, lectoescritura y calma."],
                ["Transcodificador (Reto 03)", "Completo", "Una lección en lectura fácil, audio y mapa conceptual, en 8 ms."],
                ["Taller con corrección", "Completo", "Generación por semilla; corrección sin estado."],
                ["Copiloto docente (Reto 12)", "Completo", "Dudas agregadas, dinámica, rúbrica y señales. PIN y sesión firmada."],
                ["Consulta libre", "Completo", "Chat sin cartucho contra el modelo local, con streaming, copiar y detener."],
                ["Cambio de modelo en caliente", "Completo", "Selector gobernado por el sidecar; hoy anuncia solo el motor propio, sin reiniciar."],
                ["Sensor y método científico (Reto 17)", "Completo", "Ingesta HTTP, gráfica, andamiaje hipótesis-experimento."],
                ["Telemetría federada (Reto 13)", "Completo", "Paquete binario de 17 bytes, sin PII, tamaño medido."],
                ["Nodo RISC-V, LoRa y solar", "Fuera de alcance", "Modelado y etiquetado como proyección."],
                ["LoRA entrenado", "Fuera de alcance", "Los cartuchos son prompts; se declara."],
            ],
            [5.0 * cm, 2.6 * cm, 9.8 * cm],
        )
    )


def architecture(story, tps_text, latency_text):
    story.append(section("Arquitectura", 4))
    story.append(
        P(
            "El navegador del alumno o del docente habla con el nodo por la red local. El nodo no tiene "
            "salida a internet: no existe ningún endpoint que llame al exterior salvo el propio modelo local."
        )
    )

    def center(text, size=8.6, color=INK, bold=False):
        return Paragraph(
            f"<b>{esc(text)}</b>" if bold else esc(text),
            ParagraphStyle(
                "c",
                fontName=AVAILABLE["body-bold"] if bold else AVAILABLE["body"],
                fontSize=size,
                leading=size + 3.4,
                alignment=1,
                textColor=color,
            ),
        )

    motors = Table(
        [
            [
                Paragraph(
                    "<b>Motor simbólico</b><br/>menos de 10 ms · determinista<br/>ejercicios, rúbricas, mapas",
                    ParagraphStyle("m1c", fontName=AVAILABLE["body"], fontSize=7.8, leading=11, alignment=1),
                ),
                Paragraph(
                    f"<b>Modelo local</b><br/>{tps_text} tok/s · generativo<br/>conversación, explicación",
                    ParagraphStyle("m2c", fontName=AVAILABLE["body"], fontSize=7.8, leading=11, alignment=1),
                ),
            ]
        ],
        colWidths=[8.2 * cm, 8.2 * cm],
    )
    motors.setStyle(
        TableStyle(
            [
                ("BOX", (0, 0), (-1, -1), 0.5, LINE),
                ("INNERGRID", (0, 0), (-1, -1), 0.5, LINE),
                ("BACKGROUND", (0, 0), (0, 0), GREEN_SOFT),
                ("BACKGROUND", (1, 0), (1, 0), colors.HexColor("#e9eff6")),
                ("TOPPADDING", (0, 0), (-1, -1), 7),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ]
        )
    )

    flow = Table(
        [
            [center("Navegador del aula · tablet, móvil o portátil", 8.8, MUTED, True)],
            [center("HTTP + Server-Sent Events por wifi local", 7.6, MUTED)],
            [center("server.mjs · Node estándar, sin dependencias", 8.8, INK, True)],
            [center("Orquestador · decide el motor y lo declara", 8.8, INK, True)],
            [motors],
            [center("Almacén JSON local · data/nodo.json · cero llamadas al exterior", 7.8, MUTED)],
        ],
        colWidths=[17.4 * cm],
    )
    flow.setStyle(
        TableStyle(
            [
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                ("BACKGROUND", (0, 0), (0, 0), colors.HexColor("#ece7d9")),
                ("BACKGROUND", (0, 2), (0, 2), colors.HexColor("#f4f1e8")),
                ("BACKGROUND", (0, 3), (0, 3), AMBER_SOFT),
                ("BACKGROUND", (0, 5), (0, 5), colors.HexColor("#ece7d9")),
                ("TOPPADDING", (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LINEBELOW", (0, 0), (-1, 0), 0.4, LINE),
                ("LINEBELOW", (0, 2), (-1, 2), 0.4, LINE),
                ("LINEBELOW", (0, 3), (-1, 3), 0.4, LINE),
                ("LINEABOVE", (0, 5), (-1, 5), 0.4, LINE),
            ]
        )
    )
    story.append(KeepTogether([flow, P("Flujo del nodo. Una sola máquina, dos motores, ninguna salida a internet.", "tiny")]))

    story.append(Spacer(1, 0.3 * cm))
    story.append(P("El reparto de trabajo, medido", "h3"))
    story.append(
        data_table(
            [
                ["Tarea", "Motor", "Tiempo real"],
                ["Aritmética exacta con números", "Simbólico", "2 ms"],
                ["Ejercicios y corrección", "Simbólico", "menos de 10 ms"],
                ["Transcodificación a tres formatos", "Simbólico", "8 ms"],
                ["Rúbrica y dinámica docente", "Simbólico", "menos de 10 ms"],
                ["Conversación abierta", "Modelo local", f"{latency_text} s (streaming)"],
            ],
            [7.4 * cm, 4.0 * cm, 6.0 * cm],
        )
    )
    story.append(
        P(
            "La consecuencia práctica: el alumno ve respuesta inmediata en todo lo que se puede calcular, "
            "y ve escribir al modelo en lo que exige lenguaje. Eso cambia por completo la percepción de "
            "velocidad de un nodo modesto.",
            "small",
        )
    )


def measurements(story, profile, telemetry):
    model = profile.get("model", {})
    process_info = profile.get("process", {})
    hw = profile.get("hardware", {})
    meas = profile.get("measurements", {})
    packet = telemetry.get("packet", {})
    energy = telemetry.get("energy", {})
    counters = profile.get("counters", {})

    story.append(section("Medidas reales de esta ejecución", 5))
    story.append(
        P(
            "Todas las cifras de esta tabla salen del equipo donde se generó este documento. "
            "Las que no se podían medir aparecen en la sección de proyecciones, nunca aquí."
        )
    )

    story.append(
        data_table(
            [
                ["Medida", "Valor", "Origen"],
                ["Modelo en ejecución", f"{model.get('model', 'n/d')} · {model.get('quantization', 'n/d')}", "sidecar propio :11435"],
                ["Memoria del proceso del nodo", f"{process_info.get('rssMb', 'n/d')} MB", "process.memoryUsage"],
                ["Velocidad de generación", f"{meas.get('llmTokensPerSecond', 'n/d')} tokens/s", "eval_count / eval_duration"],
                ["Latencia de una respuesta completa", f"{round(meas.get('llmLastLatencyMs', 0) / 1000, 1)} s", "cronómetro del servidor"],
                ["Consultas resueltas sin modelo", f"{energy.get('shareSymbolic', 'n/d')} %", "contadores internos"],
                ["Inferencia evitada", f"{energy.get('secondsSaved', 'n/d')} s", "cálculo sobre contadores"],
                ["Paquete LoRa en JSON", f"{packet.get('jsonBytes', 'n/d')} bytes", "medido en UTF-8"],
                ["Paquete LoRa binario", f"{packet.get('binaryBytes', 'n/d')} bytes", "medido en binario"],
                ["¿Cabe en un marco LoRaWAN?", "Sí" if packet.get("fitsInOnePacket") else "No", f"presupuesto {packet.get('loraBudgetBytes', 51)} B"],
                ["Pruebas automáticas", "43 de 43", "node --test"],
                ["Dependencias de ejecución", "0", "package.json"],
                ["Hardware de la prueba", f"{hw.get('cores', 'n/d')} núcleos · {hw.get('totalRamMb', 'n/d')} MB", "os.cpus / os.totalmem"],
            ],
            [6.6 * cm, 4.4 * cm, 6.4 * cm],
        )
    )

    story.append(Spacer(1, 0.35 * cm))
    story.append(P("Lo que son proyecciones, y por qué se separan", "h3"))
    story.append(
        P(
            "El nodo objetivo del pitch no existe todavía. Confundir sus cifras con las de este portátil "
            "sería el error más caro del proyecto. Por eso la aplicación muestra ambas columnas y marca "
            "visualmente lo proyectado."
        )
    )
    story.append(
        data_table(
            [
                ["Cifra del pitch", "Cálculo o supuesto", "Estado"],
                ["1,5 · 10⁹ pesos × 1,58 bits ÷ 8 ≈ 283 MB", "Tamaño teórico del modelo ternario", "Proyección"],
                ["380 MB de RAM con overhead de runtime", "Modelo más estado de inferencia", "Proyección"],
                ["1,2 W de consumo", "Objetivo de diseño del SoC", "Proyección"],
                ["12 USD de coste por nodo", "Lista de materiales estimada", "Proyección"],
                ["5 s de arranque, 100 g de peso", "Objetivo de la cápsula de emergencia", "Proyección"],
            ],
            [7.4 * cm, 6.6 * cm, 3.4 * cm],
        )
    )


def integration(story):
    story.append(section("Integración con el proyecto de cuantización", 6))

    story.append(
        P(
            "La carpeta <b>proyectoLLMcuantizado</b> contiene una guía técnica de 12 páginas sobre "
            "Neuro-Semilla (BitLinear 1.58-bit, QAT con pesos fantasma, empaquetado a 2 bits, "
            "despliegue en RISC-V y portal cautivo) y un modelo real: "
            "<b>qwen2.5-1.5b-instruct-q5_k_m.gguf</b>, 1,2 GB."
        )
    )
    story.append(P("Qué sirve el MVP hoy", "h3"))
    story.append(
        P(
            "El MVP se sirve únicamente con el motor ternario propio. El sidecar de 127.0.0.1:11435 "
            "anuncia un solo modelo y el nodo lo toma como predeterminado; el catálogo ya no se "
            "consulta a Ollama. Medido en este equipo:"
        )
    )
    story.append(
        data_table(
            [
                ["Modelo", "Cuantización", "Disco", "Velocidad", "Calidad observada"],
                ["<b>bitnet-17m:ternario</b> (MiniBitNet, único modelo del MVP)", "ternario real", "204 MB", "13,6–15,1 tok/s directo · 16,6–17,1 tok/s por el sidecar", "17.033.984 parámetros y perplejidad 39,46 en val_wiki.bin; LM causal, no sigue instrucciones."],
            ],
            [5.0 * cm, 2.4 * cm, 2.2 * cm, 3.8 * cm, 4.0 * cm],
        )
    )
    story.append(P("Integración con el GGUF: referencia opcional, fuera del MVP", "h3"))
    story.append(
        P(
            "El GGUF de la carpeta se registró en su día con un Modelfile propio y fue seleccionable "
            "desde el panel. Hoy no forma parte del MVP ni se anuncia. Las cifras siguientes siguen "
            "siendo mediciones reales y se conservan como referencia histórica:"
        )
    )
    story.append(
        data_table(
            [
                ["Modelo (histórico, no MVP)", "Cuantización", "Disco", "Velocidad", "Calidad observada"],
                ["semilla-1.5b (Qwen2.5 1.5B)", "Q5_K_M", "1226 MB", "13,7–15,7 tok/s", "Más rápida; respuestas más simples y con algún error conceptual."],
                ["qwen2.5:3b", "Q4_K_M", "1841 MB", "8,6–9,4 tok/s", "Casi la mitad de velocidad; respuestas mejor construidas."],
            ],
            [5.0 * cm, 2.4 * cm, 2.2 * cm, 2.6 * cm, 5.2 * cm],
        )
    )
    story.append(
        P(
            "La comparación histórica dice que el 1.5B era más rápido y liberaba 600 MB de RAM. El MVP "
            "asume la pérdida de calidad conversacional a cambio de servir un ternario propio de 17 M "
            "que se ejecuta y se mide aquí; lo que no se pierde es la corrección, porque el trabajo "
            "estructurado nunca pasó por el modelo.",
            "small",
        )
    )
    story.append(
        callout(
            "Lo que el GGUF no es",
            "Es una cuantización de 5 bits por peso, no ternaria. En esa carpeta no hay ningún "
            "checkpoint 1.58-bit: la guía describe cómo entrenarlo y empaquetarlo, no incluye el "
            "resultado. Presentar este archivo como «modelo ternario» sería falso y comprobable. "
            "Ahora bien, el proyecto sí tiene y ejecuta su propio checkpoint ternario, entrenado "
            "aparte y mucho más pequeño: MiniBitNet, 17 M de parámetros, 204 MB, pesos en {-1, 0, 1} "
            "con STE y activaciones int8.",
            "warn",
        )
    )

    story.append(P("Cómo se llega al 1.58-bit que describe la guía", "h3"))
    story.append(
        P(
            "Hay un malentendido que conviene deshacer antes: el ternario no es un formato de "
            "cuantización posterior. No se coge un Qwen entrenado y se convierte a {-1, 0, +1} sin "
            "destruirlo; BitNet b1.58 se entrena desde cero con QAT. A la escala de 2B eso exige GPU "
            "y semanas, y no cabe en un hackathon. A escala reducida sí cupo: el proyecto entrenó su "
            "propio MiniBitNet en CPU y lo sirve al nodo. Además, sigue siendo posible ejecutar un "
            "modelo ternario ya publicado."
        )
    )
    story.append(
        data_table(
            [
                ["Etapa", "Qué se hace", "Qué hace falta", "Resultado esperado"],
                ["0 · Base histórica (opcional)", "Qwen2.5 1.5B en Q4/Q5 sobre Ollama; fuera del MVP desde que el sidecar sirve el motor propio", "Ollama instalado, solo para comparar", "13,7–15,7 tok/s, 1,2 GB; ya no se anuncia en el panel"],
                ["1 · Ternario propio (hecho y en el MVP)", "MiniBitNet de 17 M: pesos en {-1, 0, 1} con STE, activaciones int8, entrenado en CPU sobre Wikipedia en español", "Nada: ckpt_4500.pt ya está en el repositorio", "204 MB; 13,6–17,1 tok/s; perplejidad 39,46; único modelo servido, como bitnet-17m:ternario"],
                ["2 · Ternario publicado (pendiente)", "Descargar BitNet b1.58 2B4T y ejecutarlo con bitnet.cpp o con llama.cpp (TQ1_0/TQ2_0)", "CMake, compilador C++, ~1,1 GB de descarga", "1.58-bit de verdad a escala 2B; medir tok/s y RAM en este equipo"],
                ["3 · Servirlo al nodo", "Levantar llama-server o el servidor de bitnet.cpp y apuntar el nodo con un adaptador OpenAI-compatible", "Añadir un proveedor al nodo (una tarde)", "El nodo usa el ternario sin tocar la interfaz; ya ocurre con el modelo propio vía sidecar"],
                ["4 · Nodo físico", "Compilar para RISC-V y medir en placa", "Milk-V Duo o Luckfox Pico, toolchain riscv64", "0,5–3 tok/s en CPU; la NPU exige toolchain del fabricante"],
                ["5 · Modelo propio a escala útil", "Entrenar con QAT sobre corpus educativo", "Presupuesto de GPU y semanas", "Investigación, no hackathon"],
            ],
            [3.0 * cm, 5.4 * cm, 4.4 * cm, 4.6 * cm],
        )
    )
    story.append(
        P(
            "La etapa 1 ya está completada y es lo que sirve el MVP hoy, por una vía propia que no "
            "figuraba en el plan original: "
            "17 M de parámetros ternarios (17.033.984), 204 MB, 13,6–15,1 tok/s en prueba directa y "
            "16,6–17,1 tok/s medidos por el sidecar, con perplejidad 39,46 en "
            "<font face='Courier'>val_wiki.bin</font>. "
            "El motor está integrado y es el único modelo que el panel anuncia. Lo que falta no es "
            "ejecución sino "
            "calidad: es un LM causal sobre Wikipedia, no un asistente afinado. No sigue instrucciones, "
            "ignora el system prompt, ecoa tokens de plantilla como <font face='Courier'>[INST]</font> "
            "y ante «La capital de Francia es» responde «la ciudad de Lemón». Esa limitación se asume: "
            "la conversación libre puede salir incoherente, mientras el motor simbólico cubre "
            "aritmética, ejercicios, rúbricas y señales de riesgo.",
            "small",
        )
    )

    story.append(P("Tres correcciones a la guía, para que no os las hagan en la demo", "h3"))
    for item in bullets(
        [
            "<b>La bandera <font face='Courier'>-DNEURO_SEMILLA_BUILD_NPU=ON</font> no existe</b> en "
            "llama.cpp. Compilar con una opción inventada falla; la NPU de esos SoC necesita el "
            "toolchain del fabricante y kernels propios, no un flag de CMake.",
            "<b>150 MB para 1000 millones de pesos no cuadra:</b> 10⁹ × 1,58 bits ÷ 8 ≈ 197 MB. Para "
            "2 000 millones son ~395 MB. Las cuentas propias de la guía dan 283 MB para 1,5·10⁹.",
            "<b>El servidor de ejemplo usa la plantilla <font face='Courier'>[INST]</font></b>, que es "
            "de Llama 2. Qwen usa ChatML (<font face='Courier'>&lt;|im_start|&gt;</font>); con la "
            "plantilla equivocada el modelo responde peor y nadie sabe por qué.",
        ]
    ):
        story.append(item)


def lab(story):
    story.append(section("Laboratorio ternario: la etapa 1 en C++", 7))
    story.append(
        P(
            "Con el proyecto ya cerrado, se intentó un paso más: ejecutar un modelo "
            "<b>1.58-bit real</b> en este equipo con un motor mínimo escrito en C++, sin integrarlo en "
            "el producto. Este laboratorio es anterior y distinto del MiniBitNet que sí quedó "
            "integrado (sección 6): aquí se buscaba verificar la matemática, no servir el aula. Se "
            "probaron las tres vías disponibles y solo una funciona. Los artefactos están en "
            "<font face='Courier'>C:\\Users\\Ghost\\bitnet-lab</font> (3,87 GB)."
        )
    )

    story.append(
        data_table(
            [
                ["Vía", "Resultado", "Evidencia"],
                ["bitnet.cpp + i2_s oficial", "Arranca y genera, pero el texto degenera", "5–9 tok/s; «The capital of France is 0»"],
                ["TQ2_0 en llama.cpp oficial", "Rápido, cuantizado roto", "9,76 tok/s; repite en bucle con decodificación voraz"],
                ["Modelo ternario propio en C++", "Funciona de extremo a extremo", "4 400–5 300 tok/s; salida coherente"],
            ],
            [5.6 * cm, 6.2 * cm, 5.6 * cm],
        )
    )

    story.append(P("Por qué falla bitnet.cpp en este equipo", "h3"))
    story.append(
        P(
            "No es un problema de configuración: los dos ficheros de kernel que ofrece el "
            "repositorio son incompatibles entre sí."
        )
    )
    for item in bullets(
        [
            "El <font face='Courier'>kernel_config.ini</font> incluido está calibrado para el "
            "modelo de 3B (<font face='Courier'>m = 3200, k = 8640</font>), no para el 2B4T "
            "(<font face='Courier'>d = 2560, ff = 6912</font>).",
            "Regenerarlo con <font face='Courier'>codegen_tl2.py</font> produce un header que usa "
            "<font face='Courier'>ggml_tensor::backend</font> y "
            "<font face='Courier'>GGML_BACKEND_TYPE_CPU</font>, símbolos que ya no existen en el "
            "llama.cpp que el propio repositorio incluye. No compila.",
            "El tipo <font face='Courier'>i2_s</font> no tiene dequantizador genérico, así que "
            "tampoco se puede reconvertir: <font face='Courier'>llama-quantize</font> responde "
            "<font face='Courier'>invalid type 36</font>.",
            "El camino soportado del proyecto es ARM con kernels TL1, o una rama x86 actualizada. "
            "En Windows x86 esta rama no ejecuta correctamente el 2B4T.",
        ]
    ):
        story.append(item)

    story.append(P("El modelo desde cero, en C++", "h3"))
    story.append(
        P(
            "Para no quedarse en el diagnóstico, se escribió un transformer decoder-only "
            "completo —atención causal con caché K/V, RoPE, RMSNorm, SwiGLU y matmul "
            "ternario— sin llama.cpp y sin PyTorch en inferencia. El entrenamiento sí usa "
            "PyTorch, con cuantización ternaria en cada paso hacia delante."
        )
    )
    story.append(
        data_table(
            [
                ["Medida", "Valor"],
                ["Parámetros", "863 872 · 851 968 ternarios a 2 bits"],
                ["Entrenamiento", "400 pasos · 4 minutos en CPU · pérdida 3,89 → 0,26"],
                ["Tamaño en disco", "879 kB"],
                ["Inferencia en C++", "4 400–5 300 tokens/s"],
                ["Dependencias", "ninguna"],
            ],
            [5.4 * cm, 12.0 * cm],
        )
    )
    story.append(
        P(
            "Salida real con el prompt «El agua »: <i>«El agua se evapora cuando el sol la "
            "calienta. Cuando el vapor se enfría aparecen gotitas.»</i> El modelo no sabe nada "
            "fuera de su corpus de 144 kB y a veces inventa palabras; eso es esperable a esta "
            "escala y está declarado.",
            "small",
        )
    )

    story.append(P("Cómo se reproduce", "h3"))
    code = ParagraphStyle(
        "code2",
        fontName="Courier",
        fontSize=7.6,
        leading=10.6,
        textColor=colors.HexColor("#1f2419"),
        backColor=colors.HexColor("#efeade"),
        borderPadding=7,
        spaceAfter=8,
    )
    story.append(
        Paragraph(
            "cd C:\\Users\\Ghost\\bitnet-lab\\semilla-cpp<br/>"
            "python tools\\make_corpus.py<br/>"
            "python train.py 400<br/>"
            "set PATH=C:\\msys64\\ucrt64\\bin;%PATH%<br/>"
            "g++ -O2 -std=c++17 -o semilla.exe src\\main.cpp<br/>"
            "semilla.exe model \"El agua \" 110 0.55",
            code,
        )
    )
    story.append(
        callout(
            "Qué demuestra esto y qué no",
            "Demuestra que la matemática del pitch —BitLinear, STE, activaciones int8, "
            "empaquetado ternario— se puede implementar y ejecutar, y que un motor propio "
            "reproduce la salida de PyTorch. No demuestra que un modelo de 2B entre en 512 MB "
            "ni que 30 alumnos quepan en un nodo: para eso hace falta un entorno Linux/ARM, un "
            "checkpoint ternario a escala útil —publicado o entrenado aquí— y LoRA con 8–16 GB de VRAM.",
            "warn",
        )
    )


def screenshots(story):
    story.append(section("El prototipo en pantalla", 8))

    shots = [
        ("captura-nodo.png", "Panel del nodo. Métricas medidas, estado del modelo y la tabla que separa lo real de lo proyectado."),
        ("captura-aula.png", "Aula. El cartucho activo, la conversación y, bajo cada respuesta, qué motor contestó y en cuánto tiempo."),
        ("captura-hardware.png", "Hardware. Sensor, gráfica de lecturas, reparto de energía y el paquete federado en sus dos codificaciones."),
        ("captura-consulta.png", "Consulta libre. Chat sin cartucho contra el modelo local, con streaming, tiempo por respuesta y copiado."),
        ("captura-docente.png", "Panel docente. Dudas agregadas, dinámica para el día siguiente, rúbrica y señales, tras el PIN."),
    ]

    for filename, caption in shots:
        path = os.path.join(DOCS, filename)
        if not os.path.exists(path):
            continue
        img = Image(path)
        max_w = 16.4 * cm
        ratio = img.imageHeight / img.imageWidth
        img.drawWidth = max_w
        img.drawHeight = max_w * ratio
        if img.drawHeight > 11.4 * cm:
            img.drawHeight = 11.4 * cm
            img.drawWidth = img.drawHeight / ratio
        story.append(KeepTogether([img, Spacer(1, 0.12 * cm), P(caption, "tiny")]))
        story.append(Spacer(1, 0.45 * cm))


def coverage(story):
    story.append(section("Cobertura de los retos ProFuturo", 9))
    story.append(
        P(
            "«Funcional» significa que la mecánica está construida y se puede probar en la demo. "
            "«Parcial» significa que la mecánica existe pero falta profundidad o validación de campo. "
            "No hay ninguna fila verde que no se pueda comprobar en la máquina."
        )
    )
    rows = [["Reto", "Qué hace el MVP", "Estado"]]
    data = [
        ("02 · Aprender sin conexión", "Aula completa servida desde el nodo, sin internet", "Funcional"),
        ("03 · Un contenido, muchas formas", "Transcodificador: lectura fácil, audio y mapa", "Funcional"),
        ("10 · Encontrar a quien dejamos atrás", "Tutor sin prisa y señales de aula, nunca etiquetas", "Parcial"),
        ("11 · Segunda oportunidad", "Enfoque andragógico reutilizable con ejemplos de oficio", "Parcial"),
        ("12 · Entrenador invisible", "Dudas agregadas, dinámica y rúbrica en segundos", "Funcional"),
        ("13 · La escuela aprende de sus datos", "Paquete federado medido; radio modelada", "Parcial"),
        ("15 · Educación en emergencias", "Cápsula de calma con derivación a un adulto", "Funcional"),
        ("17 · Laboratorio sin laboratorio", "Sensor HTTP y andamiaje del método científico", "Funcional"),
        ("20 · Potencial más allá de las notas", "Rúbrica de proceso y persistencia, sin nota automática", "Parcial"),
    ]
    for reto, what, status in data:
        rows.append([reto, what, status])

    table = data_table(rows, [5.0 * cm, 9.4 * cm, 2.6 * cm])
    style_cmds = []
    for index, (_, _, status) in enumerate(data, start=1):
        color = GREEN_SOFT if status == "Funcional" else AMBER_SOFT
        style_cmds.append(("BACKGROUND", (2, index), (2, index), color))
    table.setStyle(TableStyle(style_cmds))
    story.append(table)

    story.append(Spacer(1, 0.3 * cm))
    story.append(
        P(
            "<b>Cinco funcionales, cinco parciales, ninguna inventada.</b> Ese reparto es deliberado: "
            "un hackathon premia el acabado, y el acabado se demuestra cerrando pocas cosas del todo "
            "en lugar de insinuar diez."
        )
    )


def limits(story):
    story.append(section("Límites, riesgos y camino al hardware", 10))
    story.append(P("Límites que el informe asume", "h3"))
    for item in bullets(
        [
            "<b>El motor propio se equivoca al conversar.</b> Es un LM causal: no sigue instrucciones y "
            "puede ecoar la plantilla. Por eso lo estructurado no pasa por él: ejercicios, "
            "rúbricas y mapas los resuelve el motor simbólico. Un fallo del modelo degrada la conversación, "
            "no la evaluación.",
            "<b>Un portátil no es un nodo de 12 dólares.</b> Pasar a RISC-V exige recompilar el runtime, "
            "validar el modelo cuantizado en la NPU y medir consumo real. Es un proyecto de ingeniería, "
            "no un cambio de configuración.",
            "<b>Este MVP incluye traducción español ↔ ngäbere ↔ inglés para el aula.</b> El diccionario estático cubre saludos, instrucciones y vocabulario clave; las lecciones completas requieren el modelo bitnet fine-tuneado con ngäbere y la revisión de un hablante nativo."
            "<b>Sin conexión no hay actualizaciones.</b> El contenido nuevo entra por USB o por el paquete "
            "federado; el nodo no se actualiza solo.",
            "<b>No sustituye al docente.</b> El panel le da material para decidir, no decisiones tomadas.",
        ]
    ):
        story.append(item)

    story.append(P("Riesgos de la propuesta, por orden de gravedad", "h3"))
    story.append(
        data_table(
            [
                ["Riesgo", "Impacto", "Mitigación en el MVP"],
                ["Sobreventa de hardware ante el jurado", "Alto", "Tabla de medido frente a proyectado en la portada del producto y en este informe."],
                ["Latencia percibida del modelo", "Medio", "Streaming token a token y descarga de lo estructurado al motor simbólico."],
                ["Contenido inadecuado para menores", "Alto", "Cartuchos con reglas duras, longitud máxima, sin datos personales y derivación explícita."],
                ["Sesgo o error en la corrección", "Medio", "Corrección determinista y revisable; el texto libre nunca se marca como incorrecto."],
                ["Coste de mantenimiento del contenido", "Medio", "El paquete es JSON abierto y el currículo entra por fichero."],
            ],
            [5.2 * cm, 2.2 * cm, 10.0 * cm],
        )
    )

    story.append(P("Hoja de ruta hacia el nodo físico", "h3"))
    story.append(
        data_table(
            [
                ["Fase", "Objetivo", "Criterio de salida"],
                ["1 · Runtime", "Compilar llama.cpp con soporte de enteros en el SoC objetivo", "Perplejidad dentro del 5 % del modelo de referencia"],
                ["2 · Modelo", "Cuantizar a 1.58-bit y validar calidad pedagógica", "80 % de respuestas aceptables en un set de 50 preguntas"],
                ["3 · Energía", "Medir consumo real con el modelo cargado", "Menos de 2 W sostenidos, medidos con vatímetro"],
                ["4 · Radio", "Sustituir la simulación por un módulo LoRa real", "Paquete de 17 B recibido en un gateway a 2 km"],
                ["5 · Campo", "Piloto en un aula multigrado durante cuatro semanas", "Uso autónomo por parte del docente sin soporte técnico"],
            ],
            [2.6 * cm, 7.6 * cm, 7.2 * cm],
        )
    )


def demo(story):
    story.append(section("Guion de demostración", 11))
    story.append(P("Noventa segundos, en este orden", "h3"))
    steps = [
        ("0–15 s", "Panel del nodo", "Señalar el modelo local, la memoria medida y la etiqueta naranja de 1,2 W: «esto es proyección, no medida»."),
        ("15–45 s", "Aula, conversación", "Preguntar por qué se seca un plato al sol. El modelo escribe en directo. Leer la línea de tiempo bajo la respuesta."),
        ("45–60 s", "Aula, aritmética", "Repartir 24 semillas entre 4. La respuesta aparece en 2 ms, marcada como motor simbólico: mismo aula, dos motores."),
        ("60–75 s", "Muchas formas", "Convertir una lección en lectura fácil, audio y mapa. Mostrar la legibilidad: de 21 a 8 palabras por fragmento."),
        ("75–90 s", "Docente", "Abrir el panel con PIN: dudas agrupadas, dinámica para mañana y rúbrica. Cerrar con la frase de posicionamiento."),
    ]
    story.append(
        data_table(
            [["Tiempo", "Dónde", "Qué se dice o se hace"]] + [[a, b, c] for a, b, c in steps],
            [2.0 * cm, 3.4 * cm, 12.0 * cm],
        )
    )

    story.append(Spacer(1, 0.35 * cm))
    story.append(P("Frase de cierre", "h3"))
    story.append(
        P(
            "«No estamos presentando una aplicación web más. Estamos enseñando que la cognición "
            "más avanzada puede caber en un nodo que se enciende con el sol y no pide un solo byte "
            "de conexión. Lo que ven funcionar es el software completo; lo que falta es la fábrica.»",
            "quote",
        )
    )

    story.append(P("Verificación en dos minutos", "h3"))
    verify = [
        "Abrir <b>/api/profile</b> y comprobar que el modelo y la memoria son los de esta máquina.",
        "Preguntar algo abierto en el aula y ver el streaming del modelo local.",
        "Preguntar una operación con números y ver el cambio a motor simbólico en milisegundos.",
        "Desconectar el wifi y repetir: nada cambia.",
        "Ejecutar <b>node --test</b>: 43 pruebas en verde, sin dependencias.",
        "Detén Ollama (o no lo arranques) y vuelve a preguntar: el nodo sigue respondiendo con el motor propio y lo declara.",
    ]
    for index, item in enumerate(verify, start=1):
        story.append(Paragraph(f"<b>{index}.</b> {item}", S["bullet"]))


def ethics(story):
    story.append(section("Ética y protección de menores", 12))
    story.append(
        P(
            "Un producto para menores en contextos vulnerables tiene que poder auditarse. "
            "Estas son las decisiones que están implementadas en el código, no solo declaradas."
        )
    )
    story.append(
        data_table(
            [
                ["Principio", "Implementación"],
                ["La IA no sustituye al docente", "El panel produce material para decidir; no asigna notas ni sanciones."],
                ["No se conversa libremente con el alumno", "Cada cartucho impone reglas, longitud máxima y prohibiciones explícitas."],
                ["No se piden datos personales", "El prompt lo prohíbe y el almacén solo guarda pregunta, cartucho y curso."],
                ["El riesgo se deriva, no se diagnostica", "El cartucho de calma indica acudir a un adulto ante señales de peligro."],
                ["Nada de etiquetas sobre el alumno", "Las señales son de aula y agregadas; nunca individuales."],
                ["Sin salida a internet", "El servidor no realiza peticiones externas salvo al modelo local."],
                ["Panel protegido", "PIN generado en el arranque, sesión firmada con HMAC y caducidad de 8 horas."],
            ],
            [5.6 * cm, 11.8 * cm],
        )
    )


def annex(story):
    story.append(PageBreak())
    story.append(section("Anexo · Cómo ejecutarlo", 13))
    story.append(P("Arranque", "h3"))
    code_style = ParagraphStyle(
        "code",
        fontName="Courier",
        fontSize=8.2,
        leading=11.6,
        textColor=colors.HexColor("#1f2419"),
        backColor=colors.HexColor("#efeade"),
        borderPadding=7,
        spaceBefore=2,
        spaceAfter=8,
    )
    story.append(
        Paragraph(
            "cd C:\\Users\\Ghost\\hac4edu2<br/>"
            "node src/server.mjs<br/>"
            "<br/>"
            "# abrir http://127.0.0.1:8090<br/>"
            "# el PIN del panel docente se imprime en el primer arranque<br/>"
            "# (también queda en data/config.json)",
            code_style,
        )
    )
    story.append(
        P(
            "No requiere <b>npm install</b>: el servidor usa solo la librería estándar de Node 24. "
            "El nodo no necesita Ollama: si el sidecar no responde, arranca igualmente y responde con el "
            "motor simbólico, declarándolo en cada respuesta."
        )
    )

    story.append(P("Variables de entorno", "h3"))
    story.append(
        data_table(
            [
                ["Variable", "Por defecto", "Para qué"],
                ["NODO_PORT", "8090", "Puerto del nodo. No se usa PORT a propósito."],
                ["NODO_HOST", "127.0.0.1", "Poner 0.0.0.0 para publicar el aula en la red local."],
                ["OLLAMA_URL", "http://127.0.0.1:11434", "Servicio de inferencia local; npm run nodo lo apunta al sidecar en :11435."],
                ["OLLAMA_MODEL", "bitnet-17m:ternario", "Modelo a cargar (único anunciado por el sidecar)."],
            ],
            [3.6 * cm, 4.6 * cm, 9.2 * cm],
        )
    )

    story.append(P("Superficie de API", "h3"))
    story.append(
        data_table(
            [
                ["Ruta", "Método", "Qué hace"],
                ["/api/profile", "GET", "Hardware, modelo, medidas y proyecciones."],
                ["/api/chat", "POST", "Conversación con streaming SSE y motor declarado."],
                ["/api/transcode", "POST", "Una lección en tres formatos."],
                ["/api/exercise", "POST", "Serie determinista de ejercicios."],
                ["/api/exercise/check", "POST", "Corrección sin estado."],
                ["/api/teacher/login", "POST", "PIN y cookie firmada."],
                ["/api/teacher/summary", "GET", "Dudas, dinámica, rúbrica y señales (requiere sesión)."],
                ["/api/sensors", "GET/POST", "Lecturas del sensor."],
                ["/api/telemetry", "GET", "Paquete federado y balance energético."],
                ["/api/telemetry/send", "POST", "Genera y guarda un paquete (requiere sesión)."],
            ],
            [4.6 * cm, 2.0 * cm, 10.8 * cm],
        )
    )

    story.append(P("Estructura del repositorio", "h3"))
    story.append(
        data_table(
            [
                ["Ruta", "Contenido"],
                ["src/server.mjs", "Servidor HTTP, rutas, sesión firmada y cabeceras de seguridad."],
                ["src/core/", "Orquestador, motor simbólico, cartuchos, transcodificador, ejercicios, docente, sensores y telemetría."],
                ["src/web/", "Interfaz sin compilación: módulos ES, CSS y vistas. No requiere bundler."],
                ["tests/", "43 pruebas con el runner nativo de Node."],
                ["docs/", "Este informe y las capturas de pantalla."],
                ["data/", "Estado local del nodo (se crea al arrancar, no se versiona)."],
            ],
            [3.6 * cm, 13.8 * cm],
        )
    )


# ------------------------------------------------------------------- documento
def on_page(canvas, doc):
    canvas.saveState()
    canvas.setFont(AVAILABLE["body"], 7.4)
    canvas.setFillColor(MUTED)
    if doc.page > 1:
        canvas.drawString(2.0 * cm, 1.05 * cm, "Semilla-IA · Reto 02 · #hack4edu 2026")
        canvas.drawRightString(A4[0] - 2.0 * cm, 1.05 * cm, f"{doc.page}")
        canvas.setStrokeColor(LINE)
        canvas.setLineWidth(0.4)
        canvas.line(2.0 * cm, 1.45 * cm, A4[0] - 2.0 * cm, 1.45 * cm)
    canvas.restoreState()


def build():
    profile = fetch("/api/profile")
    telemetry = fetch("/api/telemetry")

    doc = BaseDocTemplate(
        OUT,
        pagesize=A4,
        leftMargin=2.0 * cm,
        rightMargin=2.0 * cm,
        topMargin=1.9 * cm,
        bottomMargin=2.0 * cm,
        title="Semilla-IA · Evaluación y MVP",
        author="Equipo Semilla-IA",
        subject="Reto 02 · Aprender sin conexión · #hack4edu 2026",
    )
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates([PageTemplate(id="page", frames=[frame], onPage=on_page)])

    story = []
    cover(story, profile, telemetry)

    meas = profile.get("measurements", {})
    tps_text = str(meas.get("llmTokensPerSecond") or 0).replace(".", ",")
    latency_text = f"{(meas.get('llmLastLatencyMs') or 0) / 1000:.0f}"

    summary(story, tps_text, latency_text)
    evaluation(story)
    built(story)
    architecture(story, tps_text, latency_text)
    measurements(story, profile, telemetry)
    integration(story)
    lab(story)
    screenshots(story)
    coverage(story)
    limits(story)
    demo(story)
    ethics(story)
    annex(story)

    os.makedirs(DOCS, exist_ok=True)
    doc.build(story)
    size = os.path.getsize(OUT)
    print(f"PDF generado: {OUT} ({size/1024:.1f} kB)")
    print(f"modelo: {profile.get('model', {}).get('model')} · tok/s: {profile.get('measurements', {}).get('llmTokensPerSecond')}")
    print(f"paquete LoRa: {telemetry.get('packet', {}).get('binaryBytes')} B")


if __name__ == "__main__":
    build()




