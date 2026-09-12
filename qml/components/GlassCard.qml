import QtQuick
import ".."

Rectangle {
    id: card
    default property alias content: inner.data
    property bool hoverGlow: false

    radius: Theme.radius
    color: Theme.glass
    border.width: 1
    border.color: hoverArea.containsMouse && hoverGlow ? Theme.strokeStrong : Theme.stroke
    Behavior on border.color { ColorAnimation { duration: Theme.anim(150) } }

    scale: hoverArea.containsMouse && hoverGlow ? 1.008 : 1.0
    Behavior on scale { NumberAnimation { duration: Theme.anim(160); easing.type: Easing.OutCubic } }

    Item { id: inner; anchors.fill: parent }

    MouseArea {
        id: hoverArea
        anchors.fill: parent
        hoverEnabled: card.hoverGlow
        enabled: card.hoverGlow
        acceptedButtons: Qt.NoButton  // hover feedback only — never swallow clicks
        scrollGestureEnabled: false
    }
}
