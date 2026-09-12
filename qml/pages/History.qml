import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import "../components" as UI
import ".."

Item {
    id: page

    property string activeFilter: "all"

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: Theme.pad
        spacing: Theme.pad

        // toolbar
        RowLayout {
            spacing: 12
            Layout.fillWidth: true

            TextField {
                id: searchField
                Layout.preferredWidth: 320
                placeholderText: qsTr("Search title, channel or URL…")
                placeholderTextColor: Theme.textFaint
                color: Theme.text
                font.pixelSize: Theme.fontSmall
                selectByMouse: true
                background: Rectangle {
                    radius: Theme.radiusSmall
                    color: Qt.rgba(1, 1, 1, 0.04)
                    border.width: 1
                    border.color: searchField.activeFocus ? Theme.accent : Theme.stroke
                }
                leftPadding: 12; rightPadding: 12; topPadding: 7; bottomPadding: 7
                onTextChanged: historyController.setSearch(text)
            }

            UI.PillSelector {
                options: [{ value: "all", label: "All" }, { value: "completed", label: "Completed" },
                          { value: "failed", label: "Failed" }, { value: "cancelled", label: "Cancelled" }]
                selected: page.activeFilter
                onSelectionChanged: value => {
                    page.activeFilter = value;
                    historyController.setFilter(value);
                }
            }

            Item { Layout.fillWidth: true }

            Text {
                text: historyController.count + (historyController.count === 1 ? " entry" : " entries")
                color: Theme.textFaint
                font.pixelSize: Theme.fontSmall
            }
            Button {
                text: "🗑 Clear history"
                onClicked: clearDialog.open()
            }
        }

        // list
        ListView {
            id: list
            Layout.fillWidth: true
            Layout.fillHeight: true
            clip: true
            spacing: 10
            model: historyModel

            delegate: UI.GlassCard {
                width: list.width
                hoverGlow: true
                implicitHeight: 86

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: Theme.padSmall + 2
                    spacing: 14

                    Rectangle {
                        Layout.preferredWidth: 96
                        Layout.preferredHeight: 54
                        radius: Theme.radiusSmall
                        color: Theme.bgElevated
                        clip: true
                        Image {
                            anchors.fill: parent
                            source: model.thumbnail
                            fillMode: Image.PreserveAspectCrop
                            asynchronous: true
                            visible: model.thumbnail !== "" && status === Image.Ready
                        }
                        Text {
                            anchors.centerIn: parent
                            visible: model.thumbnail === ""
                            text: "↺"
                            color: Theme.textFaint
                            font.pixelSize: 16
                        }
                    }

                    ColumnLayout {
                        spacing: 3
                        Layout.fillWidth: true
                        Text {
                            text: model.title
                            color: Theme.text
                            font.pixelSize: Theme.fontSmall
                            font.bold: true
                            elide: Text.ElideRight
                            Layout.fillWidth: true
                        }
                        Text {
                            text: model.detail + "  ·  " + model.dateText + "  ·  " + model.qualityText
                            color: Theme.textDim
                            font.pixelSize: Theme.fontTiny
                            elide: Text.ElideMiddle
                            Layout.fillWidth: true
                        }
                        Text {
                            visible: model.filePath !== ""
                            text: model.filePath
                            color: Theme.textFaint
                            font.pixelSize: Theme.fontTiny
                            elide: Text.ElideMiddle
                            Layout.fillWidth: true
                        }
                    }

                    Rectangle {
                        width: 10; height: 10; radius: 5
                        Layout.alignment: Qt.AlignVCenter
                        color: Theme.statusColor(model.status)
                    }

                    Row {
                        spacing: 6
                        Layout.alignment: Qt.AlignVCenter
                        UI.TooltipButton { glyph: "↗"; tip: "Open file"; enabled: model.hasFile; onClicked: historyController.openFile(model.id) }
                        UI.TooltipButton { glyph: "▤"; tip: "Show in folder"; enabled: model.hasFile; onClicked: historyController.openFolder(model.id) }
                        UI.TooltipButton { glyph: "↻"; tip: "Download again"; onClicked: historyController.redownload(model.id) }
                    }
                }
            }

            Text {
                anchors.centerIn: parent
                visible: list.count === 0
                text: "History is empty — finished downloads will appear here."
                color: Theme.textFaint
                font.pixelSize: Theme.fontSmall
            }
        }
    }

    // lightweight confirm dialog
    Dialog {
        id: clearDialog
        modal: true
        anchors.centerIn: Overlay.overlay
        title: "Clear download history?"
        width: 380
        contentItem: Text {
            text: "This removes history entries. Files on disk are not deleted."
            color: Theme.textDim
            font.pixelSize: Theme.fontSmall
            wrapMode: Text.WordWrap
        }
        background: Rectangle {
            radius: Theme.radius
            color: Theme.glassBright
            border.width: 1
            border.color: Theme.strokeStrong
        }
        standardButtons: Dialog.Yes | Dialog.No
        onAccepted: historyController.clearHistory()
    }

    Connections {
        target: page
        function onVisibleChanged() { if (visible) historyController.refresh(); }
    }
}
