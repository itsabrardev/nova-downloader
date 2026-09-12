import QtQuick
import ".."

Rectangle {
    id: tipButton

    property string glyph: ""
    property string tip: ""
    property bool enabled: true
    signal clicked()

    width: 34; height: 34
    radius: Theme.radiusSmall
    opacity: enabled ? 1.0 : 0.3
    color: area.containsMouse && enabled ? Qt.rgba(1, 1, 1, 0.09) : Qt.rgba(1, 1, 1, 0.035)
    border.width: 1
    border.color: Theme.stroke
    Behavior on color { ColorAnimation { duration: Theme.anim(120) } }

    Text {
        anchors.centerIn: parent
        text: tipButton.glyph
        color: Theme.textDim
        font.pixelSize: 13
    }
    ToolTip {
        visible: area.containsMouse && tipButton.enabled && tipButton.tip !== ""
        text: tipButton.tip
        delay: 450
    }
    MouseArea {
        id: area
        anchors.fill: parent
        hoverEnabled: true
        enabled: tipButton.enabled
        cursorShape: Qt.PointingHandCursor
        onClicked: tipButton.clicked()
    }
}
