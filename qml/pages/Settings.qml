import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import QtQuick.Dialogs
import "../components" as UI
import ".."

Flickable {
    id: page
    clip: true
    contentWidth: width
    contentHeight: column.implicitHeight + 2 * Theme.pad

    ColumnLayout {
        id: column
        x: Math.max(Theme.pad, (page.width - width) / 2)
        width: Math.min(page.width - 2 * Theme.pad, 760)
        spacing: Theme.pad

        SectionCard { title: "General"; Layout.fillWidth: true
            ColumnLayout { anchors.fill: parent; anchors.margins: Theme.pad; spacing: 14
                ToggleRow { label: "Minimize to tray instead of closing"; checked: settingsController.minimizeToTray; onToggled: v => settingsController.minimizeToTray = v }
                ToggleRow { label: "Monitor clipboard for video links"; checked: settingsController.clipboardMonitor; onToggled: v => settingsController.clipboardMonitor = v }
                ToggleRow { label: "Desktop notifications (start/end of downloads)"; checked: settingsController.notifications; onToggled: v => settingsController.notifications = v }
                ToggleRow { label: "Start with Windows"; checked: settingsController.startWithWindows; onToggled: v => settingsController.startWithWindows = v }
            }
        }

        SectionCard { title: "Downloads"; Layout.fillWidth: true
            ColumnLayout { anchors.fill: parent; anchors.margins: Theme.pad; spacing: 14
                RowLayout { spacing: 12; Layout.fillWidth: true
                    Text { text: "Download folder"; color: Theme.textDim; font.pixelSize: Theme.fontSmall; Layout.preferredWidth: 200 }
                    TextField {
                        id: folderField
                        Layout.fillWidth: true
                        text: settingsController.downloadFolder
                        color: Theme.text
                        font.pixelSize: Theme.fontSmall
                        readOnly: true
                        selectByMouse: true
                        background: Rectangle { radius: Theme.radiusSmall; color: Qt.rgba(1,1,1,0.04); border.width: 1; border.color: Theme.stroke }
                        leftPadding: 10; rightPadding: 10; topPadding: 7; bottomPadding: 7
                    }
                    Button { text: "Browse…"; onClicked: folderDialog.open() }
                }
                SpinRow { label: "Maximum simultaneous downloads"; value: settingsController.maxConcurrentDownloads; from: 1; to: 6; onMoved: v => settingsController.maxConcurrentDownloads = v }
                SpinRow { label: "Connections per download (fragments)"; value: settingsController.connections; from: 1; to: 16; onMoved: v => settingsController.connections = v }
                SpinRow { label: "Retry count"; value: settingsController.retries; from: 0; to: 10; onMoved: v => settingsController.retries = v }
                SpinRow { label: "Speed limit (KB/s, 0 = unlimited)"; value: settingsController.speedLimitKbps; from: 0; to: 100000; step: 50; onMoved: v => settingsController.speedLimitKbps = v }
            }
        }

        SectionCard { title: "Appearance"; Layout.fillWidth: true
            ColumnLayout { anchors.fill: parent; anchors.margins: Theme.pad; spacing: 14
                ToggleRow { label: "Animated background (falls back to gradient when no video)"; checked: settingsController.animatedBackground; onToggled: v => settingsController.animatedBackground = v }
                SliderRow { label: "Background dim"; value: settingsController.backgroundOpacity * 100; onMoved: v => settingsController.backgroundOpacity = v / 100; suffix: "%" }
                SliderRow { label: "Animation intensity"; value: settingsController.animationIntensity * 100; onMoved: v => settingsController.animationIntensity = v / 100; suffix: "%" }
            }
        }

        SectionCard { title: "Advanced"; Layout.fillWidth: true
            ColumnLayout { anchors.fill: parent; anchors.margins: Theme.pad; spacing: 14
                RowLayout { spacing: 12; Layout.fillWidth: true
                    Text { text: "FFmpeg path (empty = auto-detect)"; color: Theme.textDim; font.pixelSize: Theme.fontSmall; Layout.preferredWidth: 200 }
                    TextField {
                        Layout.fillWidth: true
                        text: settingsController.ffmpegPath
                        color: Theme.text
                        font.pixelSize: Theme.fontSmall
                        selectByMouse: true
                        onEditingFinished: settingsController.ffmpegPath = text
                        background: Rectangle { radius: Theme.radiusSmall; color: Qt.rgba(1,1,1,0.04); border.width: 1; border.color: Theme.stroke }
                        leftPadding: 10; rightPadding: 10; topPadding: 7; bottomPadding: 7
                    }
                }
                RowLayout { spacing: 12; Layout.fillWidth: true
                    Text { text: "Extension pairing token"; color: Theme.textDim; font.pixelSize: Theme.fontSmall; Layout.preferredWidth: 200 }
                    TextField {
                        Layout.fillWidth: true
                        text: settingsController.apiToken
                        color: Theme.cyan
                        font.pixelSize: Theme.fontTiny
                        readOnly: true
                        selectByMouse: true
                        background: Rectangle { radius: Theme.radiusSmall; color: Qt.rgba(1,1,1,0.04); border.width: 1; border.color: Theme.stroke }
                        leftPadding: 10; topPadding: 7; bottomPadding: 7
                    }
                    ToggleRow { label: "Require"; compact: true; checked: settingsController.apiTokenEnabled; onToggled: v => settingsController.apiTokenEnabled = v }
                }
                Text {
                    text: "Paste this token once in the extension popup to pair it with this app. Config file: " + settingsController.configPath
                    color: Theme.textFaint
                    font.pixelSize: Theme.fontTiny
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
                RowLayout { spacing: 12
                    Item { Layout.fillWidth: true }
                    Button { text: "↺ Reset settings"; onClicked: settingsController.resetSettings() }
                }
            }
        }
    }

    FolderDialog {
        id: folderDialog
        onSelectedFolder: folder => { settingsController.downloadFolder = folder.toString().replace("file:///", "").replace("/", "\\"); }
    }

    component SectionCard: UI.GlassCard {
        id: section
        property string title: ""
        implicitHeight: sectionBody.implicitHeight + 2 * Theme.pad
        Text {
            id: sectionBody
            text: section.title.toUpperCase()
            color: Theme.textFaint
            font.pixelSize: 11
            font.letterSpacing: 1.4
            font.bold: true
            anchors.top: parent.top
            anchors.left: parent.left
            anchors.margins: Theme.padSmall + 4
        }
    }

    component ToggleRow: RowLayout {
        id: toggleRow
        property string label: ""
        property bool checked: false
        property bool compact: false
        signal toggled(bool value)
        spacing: 10
        Layout.fillWidth: true

        Text {
            text: toggleRow.label
            visible: !toggleRow.compact
            color: Theme.textDim
            font.pixelSize: Theme.fontSmall
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
        }

        Rectangle {
            width: 44; height: 24; radius: 12
            color: toggleRow.checked ? Theme.accent : Qt.rgba(1, 1, 1, 0.10)
            border.width: 1
            border.color: toggleRow.checked ? Theme.accent : Theme.stroke
            Behavior on color { ColorAnimation { duration: Theme.anim(150) } }

            Rectangle {
                width: 18; height: 18; radius: 9
                anchors.verticalCenter: parent.verticalCenter
                x: toggleRow.checked ? parent.width - 20 : 2
                color: "white"
                Behavior on x { NumberAnimation { duration: Theme.anim(150); easing.type: Easing.OutCubic } }
            }
            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.PointingHandCursor
                onClicked: toggleRow.toggled(!toggleRow.checked)
            }
        }
    }

    component SpinRow: RowLayout {
        id: spinRow
        property string label: ""
        property int value: 0
        property int from: 0
        property int to: 99
        property int step: 1
        signal moved(int value)
        spacing: 12
        Layout.fillWidth: true

        Text { text: spinRow.label; color: Theme.textDim; font.pixelSize: Theme.fontSmall; Layout.fillWidth: true; wrapMode: Text.WordWrap }
        SpinBox {
            value: spinRow.value
            from: spinRow.from; to: spinRow.to; stepSize: spinRow.step
            editable: true
            onValueModified: spinRow.moved(value)
            background: Rectangle { radius: Theme.radiusSmall; color: Qt.rgba(1,1,1,0.05); border.width: 1; border.color: Theme.stroke }
            contentItem: Text { text: spinBoxText(parent); color: Theme.text; font.pixelSize: Theme.fontSmall; horizontalAlignment: Text.AlignHCenter
                function spinBoxText(sb) { return sb.displayText } }
            up.indicator: Rectangle { color: "transparent"; Text { anchors.centerIn: parent; text: "+"; color: Theme.textDim } }
            down.indicator: Rectangle { color: "transparent"; Text { anchors.centerIn: parent; text: "−"; color: Theme.textDim } }
        }
    }

    component SliderRow: RowLayout {
        id: sliderRow
        property string label: ""
        property real value: 0
        property string suffix: ""
        signal moved(real value)
        spacing: 12
        Layout.fillWidth: true

        ColumnLayout { spacing: 4; Layout.fillWidth: true
            Text { text: sliderRow.label; color: Theme.textDim; font.pixelSize: Theme.fontSmall }
            Slider {
                Layout.fillWidth: true
                value: sliderRow.value
                from: 0; to: 100
                onMoved: sliderRow.moved(value)
                background: Rectangle { y: parent.height / 2 - 3; height: 6; radius: 3; color: Qt.rgba(1,1,1,0.08)
                    Rectangle { width: parent.parent.visualPosition * parent.width; height: parent.height; radius: 3; color: Theme.accent } }
                handle: Rectangle { anchors.verticalCenter: parent.verticalCenter; x: parent.visualPosition * (parent.width - 20); width: 18; height: 18; radius: 9; color: "white" }
            }
        }
        Text { text: Math.round(sliderRow.value) + sliderRow.suffix; color: Theme.text; font.pixelSize: Theme.fontSmall; Layout.preferredWidth: 48 }
    }
}
