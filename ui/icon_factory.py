"""Programmatic app icon — no binary assets required.

Draws the NovaDownloader mark: a dark rounded square with a soft blue
gradient and a white download arrow.
"""

from __future__ import annotations

from PySide6.QtCore import QPointF, QRectF, Qt
from PySide6.QtGui import QColor, QIcon, QLinearGradient, QPainter, QPixmap, QPolygonF


def create_app_icon() -> QIcon:
    icon = QIcon()
    for resolution in (16, 24, 32, 48, 64, 128, 256):
        icon.addPixmap(_draw(resolution))
    return icon


def _draw(size: int) -> QPixmap:
    pixmap = QPixmap(size, size)
    pixmap.fill(Qt.transparent)
    painter = QPainter(pixmap)
    painter.setRenderHint(QPainter.Antialiasing, True)

    rect = QRectF(1, 1, size - 2, size - 2)
    radius = size * 0.24

    gradient = QLinearGradient(0, 0, size, size)
    gradient.setColorAt(0.0, QColor("#1a2740"))
    gradient.setColorAt(1.0, QColor("#0c1120"))
    painter.setPen(Qt.NoPen)
    painter.setBrush(gradient)
    painter.drawRoundedRect(rect, radius, radius)

    # soft accent glow behind the arrow
    glow = QLinearGradient(0, size * 0.3, 0, size)
    glow.setColorAt(0.0, QColor(90, 140, 255, 0))
    glow.setColorAt(1.0, QColor(90, 140, 255, 110))
    painter.setBrush(glow)
    painter.drawRoundedRect(rect, radius, radius)

    white = QColor("#eaf1ff")
    cx = size / 2

    shaft = QRectF(cx - size * 0.07, size * 0.22, size * 0.14, size * 0.34)
    painter.setBrush(white)
    painter.drawRoundedRect(shaft, size * 0.05, size * 0.05)

    arrow = QPolygonF(
        [
            QPointF(cx - size * 0.20, size * 0.50),
            QPointF(cx + size * 0.20, size * 0.50),
            QPointF(cx, size * 0.72),
        ]
    )
    painter.setBrush(white)
    painter.drawPolygon(arrow)

    tray = QRectF(cx - size * 0.24, size * 0.76, size * 0.48, size * 0.055)
    painter.drawRoundedRect(tray, size * 0.027, size * 0.027)

    painter.end()
    return pixmap
