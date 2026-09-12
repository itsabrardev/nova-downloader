import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import "../components" as UI
import ".."

Item {
    id: page

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Theme.pad
        spacing: Theme.pad

        // header: stats + live speed graph
        UI.GlassCard {
            Layout.fillWidth: true
            implicitHeight: statsRow.implicitHeight + graphRow.implicitHeight + 2 * Theme.pad

            ColumnLayout {
                id: statsRow
                anchors.fill: parent
                anchors.margins: Theme.pad
                spacing: 12

                RowLayout {
                    spacing: 20
                    Layout.fillWidth: true

                    Stat { label: "DOWNLOADING"; value: String(downloadsController.activeCount) }
                    Stat { label: "QUEUED"; value: String(downloadsController.queuedCount) }
                    Stat { label: "SPEED"; value: downloadsController.currentSpeedText; accent: true }
                    Stat { label: "AVERAGE"; value: downloadsController.averageSpeedText }
                    Stat { label: "PEAK"; value: downloadsController.peakSpeedText }
                    Item { Layout.fillWidth: true }
                    Button { text: "⏸ Pause all"; onClicked: downloadsController.pauseAll() }
                    Button { text: "▶ Resume all"; onClicked: downloadsController.resumeAll() }
                    Button { text: "↻ Retry failed"; onClicked: downloadsController.retryFailed() }
                }

                RowLayout {
                    id: graphRow
                    spacing: 12
                    Layout.fillWidth: true

                    Text {
                        text: "Speed · last 60 s"
                        color: Theme.textFaint
                        font.pixelSize: Theme.fontTiny
                        Layout.alignment: Qt.AlignTop
                    }
                    UI.SpeedGraph {
                        Layout.fillWidth: true
                        Layout.preferredHeight: 90
                        points: downloadsController.speedHistory
                    }
                }
            }
        }

        // task list
        ListView {
            id: list
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 10
            model: downloadsModel

            delegate: UI.DownloadCard {
                width: list.width
                taskId: model.id
                title: model.title
                status: model.status
                progress: model.progress
                detail: model.detail
                speed: model.speed
                eta: model.eta
                errorText: model.errorText
                thumbnail: model.thumbnail
                qualityText: model.qualityText
                filePath: model.filePath
                hasFile: model.hasFile
                canPause: model.canPause
                canResume: model.canResume
                canCancel: model.canCancel
                canRetry: model.canRetry

                onPauseRequested: taskId => downloadsController.pause(taskId)
                onResumeRequested: taskId => downloadsController.resume(taskId)
                onCancelRequested: taskId => downloadsController.cancel(taskId)
                onRetryRequested: taskId => downloadsController.retry(taskId)
                onOpenFileRequested: taskId => downloadsController.openFile(taskId)
                onOpenFolderRequested: taskId => downloadsController.openFolder(taskId)
            }

            Text {
                anchors.centerIn: parent
                visible: list.count === 0
                text: "No downloads yet.\nPaste a URL on the Home page to get started."
                color: Theme.textFaint
                font.pixelSize: Theme.fontSmall
                horizontalAlignment: Text.AlignHCenter
            }
        }
    }

    component Stat: ColumnLayout {
        property string label: ""
        property string value: ""
        property bool accent: false
        spacing: 2
        Text {
            text: label
            color: Theme.textFaint
            font.pixelSize: 10
            font.letterSpacing: 1.1
            font.bold: true
        }
        Text {
            text: value
            color: accent ? Theme.accent : Theme.text
            font.pixelSize: Theme.fontTitle
            font.bold: true
        }
    }
}
