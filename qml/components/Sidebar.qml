import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import ".."

Rectangle {
    id: sidebar
    color: Qt.rgba(0.02, 0.035, 0.07, 0.5)

    readonly property var pages: [
        { name: "home", glyph: "⌂", label: "Home" },
        { name: "downloads", glyph: "↓", label: "Downloads" },
        { name: "history", glyph: "↺", label: "History" },
        { name: "settings", glyph: "⚙", label: "Settings" },
    ]

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 6

        Repeater {
            model: sidebar.pages

            delegate: Rectangle {
                id: navItem
                required property var modelData
                required property int index
                readonly property bool active: appController.currentPage === modelData.name

                Layout.fillWidth: true
                Layout.preferredHeight: 44
                radius: Theme.radiusSmall
                color: active ? Theme.accentSoft
                     : (navArea.containsMouse ? Qt.rgba(1, 1, 1, 0.05) : "transparent")
                Behavior on color { ColorAnimation { duration: Theme.anim(150) } }

                Row {
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.left: parent.left
                    anchors.leftMargin: 14
                    spacing: 12

                    Text {
                        text: navItem.modelData.glyph
                        color: navItem.active ? Theme.accent : Theme.textDim
                        font.pixelSize: 16
                        font.bold: navItem.active
                        anchors.verticalCenter: parent.verticalCenter
                    }
                    Text {
                        text: navItem.modelData.label
                        color: navItem.active ? Theme.text : Theme.textDim
                        font.pixelSize: Theme.fontSmall
                        font.bold: navItem.active
                        anchors.verticalCenter: parent.verticalCenter
                    }
                }

                Rectangle {
                    width: 3; height: 20
                    radius: 2
                    anchors.verticalCenter: parent.verticalCenter
                    anchors.right: parent.right
                    anchors.rightMargin: 6
                    color: Theme.accent
                    visible: navItem.active
                }

                ScaleAnimator {
                    target: navItem
                    running: navItem.active
                    from: 0.97; to: 1.0
                    duration: Theme.anim(180)
                    easing.type: Easing.OutCubic
                }

                MouseArea {
                    id: navArea
                    anchors.fill: parent
                    hoverEnabled: true
                    cursorShape: Qt.PointingHandCursor
                    onClicked: appController.navigate(navItem.modelData.name)
                }
            }
        }

        Item { Layout.fillHeight: true }

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 1
            color: Theme.stroke
        }

        Text {
            Layout.fillWidth: true
            text: downloadsController.activeCount + " active · " +
                  downloadsController.queuedCount + " queued"
            color: Theme.textFaint
            font.pixelSize: Theme.fontTiny
            horizontalAlignment: Text.AlignHCenter
        }
    }
}
