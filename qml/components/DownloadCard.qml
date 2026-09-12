import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import ".."

GlassCard {
    id: card
    hoverGlow: true

    required property int taskId
    required property string title
    required property string status
    required property real progress
    required property string detail
    required property string speed
    required property string eta
    required property string errorText
    required property string thumbnail
    required property string qualityText
    required property string filePath
    required property bool hasFile
    required property bool canPause
    required property bool canResume
    required property bool canCancel
    required property bool canRetry

    signal pauseRequested(int taskId)
    signal resumeRequested(int taskId)
    signal cancelRequested(int taskId)
    signal retryRequested(int taskId)
    signal openFileRequested(int taskId)
    signal openFolderRequested(int taskId)

    implicitHeight: 118

    RowLayout {
        anchors.fill: parent
        anchors.margins: Theme.padSmall + 2
        spacing: 14

        Rectangle {
            Layout.preferredWidth: 104
            Layout.preferredHeight: 60
            radius: Theme.radiusSmall
            color: Theme.bgElevated
            clip: true

            Image {
                anchors.fill: parent
                source: card.thumbnail
                fillMode: Image.PreserveAspectCrop
                asynchronous: true
                visible: card.thumbnail !== "" && status === Image.Ready
            }
            Text {
                anchors.centerIn: parent
                visible: card.thumbnail === ""
                text: "↓"
                color: Theme.textFaint
                font.pixelSize: 20
            }
        }

        ColumnLayout {
            spacing: 5
            Layout.fillWidth: true

            RowLayout {
                spacing: 10
                Layout.fillWidth: true

                Text {
                    text: card.title
                    color: Theme.text
                    font.pixelSize: Theme.fontBody
                    font.bold: true
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }

                Rectangle {
                    width: statusChip.implicitWidth + 16
                    height: 22
                    radius: 11
                    color: Qt.rgba(Theme.statusColor(card.status).r,
                                   Theme.statusColor(card.status).g,
                                   Theme.statusColor(card.status).b, 0.16)
                    Text {
                        id: statusChip
                        anchors.centerIn: parent
                        text: card.status.toUpperCase()
                        color: Theme.statusColor(card.status)
                        font.pixelSize: Theme.fontTiny - 1
                        font.bold: true
                        font.letterSpacing: 0.6
                    }
                }
            }

            Text {
                text: card.errorText !== "" ? card.errorText : card.detail
                color: card.errorText !== "" ? Theme.danger : Theme.textDim
                font.pixelSize: Theme.fontTiny
                elide: Text.ElideMiddle
                Layout.fillWidth: true
            }

            ProgressBar {
                Layout.fillWidth: true
                value: card.progress
                busy: card.status === "analyzing"
                tint: Theme.statusColor(card.status)
            }

            RowLayout {
                spacing: 16
                Text { text: card.qualityText; color: Theme.textFaint; font.pixelSize: Theme.fontTiny }
                Text { text: card.speed; color: Theme.textDim; font.pixelSize: Theme.fontTiny; Layout.alignment: Qt.AlignRight }
                Text { text: card.eta === "—" ? "" : "ETA " + card.eta; color: Theme.textDim; font.pixelSize: Theme.fontTiny }
                Item { Layout.fillWidth: true }
                Text {
                    text: Math.round(card.progress * 100) + "%"
                    color: Theme.textDim
                    font.pixelSize: Theme.fontTiny
                    font.bold: true
                }
            }
        }

        Row {
            spacing: 6
            Layout.alignment: Qt.AlignVCenter

            ActionButton { glyph: "⏸"; tip: "Pause"; visible: card.canPause; onClicked: card.pauseRequested(card.taskId) }
            ActionButton { glyph: "▶"; tip: "Resume"; visible: card.canResume; onClicked: card.resumeRequested(card.taskId) }
            ActionButton { glyph: "↻"; tip: "Retry"; visible: card.canRetry; onClicked: card.retryRequested(card.taskId) }
            ActionButton { glyph: "↗"; tip: "Open file"; visible: card.hasFile; onClicked: card.openFileRequested(card.taskId) }
            ActionButton { glyph: "▤"; tip: "Show in folder"; visible: card.hasFile; onClicked: card.openFolderRequested(card.taskId) }
            ActionButton { glyph: "✕"; tip: "Cancel"; visible: card.canCancel; onClicked: card.cancelRequested(card.taskId) }
        }
    }

    component ActionButton: Rectangle {
        id: action
        property string glyph: ""
        property string tip: ""
        signal clicked()

        width: 34; height: 34
        radius: Theme.radiusSmall
        color: actionArea.containsMouse ? Qt.rgba(1, 1, 1, 0.09) : Qt.rgba(1, 1, 1, 0.035)
        border.width: 1
        border.color: Theme.stroke
        Behavior on color { ColorAnimation { duration: Theme.anim(120) } }

        Text {
            anchors.centerIn: parent
            text: action.glyph
            color: Theme.textDim
            font.pixelSize: 13
        }
        ToolTip {
            visible: actionArea.containsMouse && action.tip !== ""
            text: action.tip
            delay: 450
        }
        MouseArea {
            id: actionArea
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onClicked: action.clicked()
        }
    }
}
