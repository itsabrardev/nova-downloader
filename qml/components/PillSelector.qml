import QtQuick
import ".."

Row {
    id: selector

    property var options: []            // [{value, label}] or plain strings
    property string selected: ""
    signal selectionChanged(string value)

    spacing: 8
    clip: true

    function label(option): string { return option.label !== undefined ? option.label : option; }
    function value(option): string { return option.value !== undefined ? option.value : option; }

    Repeater {
        model: selector.options

        delegate: Rectangle {
            id: pill
            required property var modelData
            readonly property bool chosen: selector.selected === selector.value(pill.modelData)
            readonly property bool fits: pill.labelText.width + 26 < selector.maxPillWidth

            width: Math.min(selector.maxPillWidth, pill.labelText.width + 24)
            height: 30
            radius: height / 2
            color: chosen ? Theme.accentSoft
                 : (pillArea.containsMouse ? Qt.rgba(1, 1, 1, 0.07) : Qt.rgba(1, 1, 1, 0.035))
            border.width: 1
            border.color: chosen ? Theme.accent : Theme.stroke
            Behavior on color { ColorAnimation { duration: Theme.anim(140) } }
            Behavior on border.color { ColorAnimation { duration: Theme.anim(140) } }

            property real maxPillWidth: 180
            Binding on maxPillWidth { value: Math.max(60, (selector.width - 24) / Math.max(1, selector.options.length) - 8) }

            Text {
                id: labelText
                anchors.centerIn: parent
                text: selector.label(pill.modelData)
                color: pill.chosen ? Theme.text : Theme.textDim
                font.pixelSize: Theme.fontSmall
                font.bold: pill.chosen
                elide: Text.ElideRight
                width: Math.min(implicitWidth, pill.maxPillWidth - 14)
            }

            MouseArea {
                id: pillArea
                anchors.fill: parent
                hoverEnabled: true
                cursorShape: Qt.PointingHandCursor
                onClicked: {
                    selector.selected = selector.value(pill.modelData);
                    selector.selectionChanged(selector.selected);
                }
            }
        }
    }
}
