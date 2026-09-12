pragma Singleton
import QtQuick

QtObject {
    id: theme

    // palette — deep, cinematic, restrained
    readonly property color bg: "#070b14"
    readonly property color bgElevated: "#0d1424"
    readonly property color glass: Qt.rgba(0.055, 0.085, 0.15, 0.62)
    readonly property color glassBright: Qt.rgba(0.09, 0.13, 0.22, 0.78)
    readonly property color stroke: Qt.rgba(1, 1, 1, 0.07)
    readonly property color strokeStrong: Qt.rgba(1, 1, 1, 0.13)
    readonly property color text: "#e8eefc"
    readonly property color textDim: "#8b96b0"
    readonly property color textFaint: "#5a6478"
    readonly property color accent: "#5b8cff"
    readonly property color accentSoft: Qt.rgba(0.36, 0.55, 1.0, 0.16)
    readonly property color cyan: "#39d5ec"
    readonly property color success: "#3fd68f"
    readonly property color warning: "#f5c451"
    readonly property color danger: "#ff6b6b"

    // geometry scale
    readonly property int radius: 14
    readonly property int radiusSmall: 8
    readonly property int pad: 18
    readonly property int padSmall: 10

    // typography
    readonly property string family: "Segoe UI"
    readonly property int fontTiny: 11
    readonly property int fontSmall: 12
    readonly property int fontBody: 14
    readonly property int fontTitle: 17
    readonly property int fontBig: 26

    // motion — Main.qml keeps this in sync with settingsController
    property real motion: 1.0
    function anim(ms: int): int { return Math.max(60, Math.round(ms * motion)); }

    function statusColor(status: string): color {
        switch (status) {
            case "completed": return success;
            case "failed": return danger;
            case "cancelled": return textFaint;
            case "paused": return warning;
            case "downloading": return accent;
            case "processing": return cyan;
            case "analyzing": return cyan;
            default: return textDim; // queued
        }
    }
}
