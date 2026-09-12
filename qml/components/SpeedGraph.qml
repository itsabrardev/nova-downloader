import QtQuick
import ".."

Canvas {
    id: graph

    property var points: []
    property color lineColor: Theme.accent
    property color fillColor: Qt.rgba(0.36, 0.55, 1.0, 0.14)

    onPointsChanged: schedulePaint()
    onWidthChanged: schedulePaint()
    onHeightChanged: schedulePaint()

    function schedulePaint() { requestPaint(); }

    onPaint: {
        const ctx = getContext("2d");
        ctx.reset();
        ctx.clearRect(0, 0, width, height);
        const data = points || [];
        if (data.length < 2) return;

        let peak = 0;
        for (let i = 0; i < data.length; i++) peak = Math.max(peak, data[i]);
        if (peak <= 0) peak = 1;

        const top = 4, bottom = height - 4;
        const stepX = width / (data.length - 1);
        const yFor = v => bottom - (v / peak) * (bottom - top);

        // filled area under the curve
        ctx.beginPath();
        ctx.moveTo(0, bottom);
        for (let i = 0; i < data.length; i++) ctx.lineTo(i * stepX, yFor(data[i]));
        ctx.lineTo(width, bottom);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();

        // glow stroke, then crisp line
        for (const [lineWidth, alpha] of [[5, 0.18], [2, 0.95]]) {
            ctx.beginPath();
            for (let i = 0; i < data.length; i++) {
                const x = i * stepX, y = yFor(data[i]);
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.strokeStyle = lineColor;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = lineWidth;
            ctx.lineJoin = "round";
            ctx.stroke();
            ctx.globalAlpha = 1.0;
        }
    }
}
