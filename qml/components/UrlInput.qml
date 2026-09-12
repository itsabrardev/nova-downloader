import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import ".."

GlassCard {
    id: root
    height: 62

    signal analyzeRequested(string url)
    property alias text: urlField.text
    readonly property bool looksInvalid:
        urlField.text.length > 0 && !/^https?:\/\/\S+\.\S+/i.test(urlField.text.trim())

    RowLayout {
        anchors.fill: parent
        anchors.leftMargin: 16
        anchors.rightMargin: 10
        anchors.verticalCenter: parent.verticalCenter
        spacing: 10

        Text {
            text: "🔗"
            color: Theme.textFaint
            font.pixelSize: 16
            Layout.alignment: Qt.AlignVCenter
        }

        TextField {
            id: urlField
            Layout.fillWidth: true
            placeholderText: qsTr("Paste video URL…")
            placeholderTextColor: Theme.textFaint
            color: root.looksInvalid ? Theme.danger : Theme.text
            font.pixelSize: Theme.fontBody
            background: null
            selectByMouse: true
            onAccepted: root.analyzeRequested(text.trim())
        }

        RoundButton {
            text: "✕"
            visible: urlField.text.length > 0
            onClicked: urlField.clear()
        }

        RoundButton {
            text: "Paste"
            onClicked: {
                urlField.clear();
                urlField.paste();
            }
        }

        Button {
            id: analyzeButton
            contentItem: Text {
                text: analyzeController.busy ? "Analyzing…" : "Analyze"
                color: "white"
                font.pixelSize: Theme.fontSmall
                font.bold: true
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
            }
            background: Rectangle {
                radius: Theme.radiusSmall
                color: analyzeButton.hovered ? "#6f9bff" : Theme.accent
                Behavior on color { ColorAnimation { duration: Theme.anim(120) } }
            }
            leftPadding: 18; rightPadding: 18; topPadding: 8; bottomPadding: 8
            enabled: !analyzeController.busy && urlField.text.length > 0
            opacity: enabled ? 1.0 : 0.5
            onClicked: root.analyzeRequested(urlField.text.trim())
        }
    }

    BusyIndicator {
        anchors.centerIn: parent
        running: analyzeController.busy
        visible: analyzeController.busy
        width: 34; height: 34
    }

    component RoundButton: Button {
        id: small
        background: Rectangle {
            radius: height / 2
            color: small.hovered ? Qt.rgba(1, 1, 1, 0.10) : Qt.rgba(1, 1, 1, 0.05)
            border.width: 1
            border.color: Theme.stroke
        }
        contentItem: Text {
            text: small.text
            color: Theme.textDim
            font.pixelSize: Theme.fontSmall
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
        }
        leftPadding: 12; rightPadding: 12; topPadding: 5; bottomPadding: 5
    }
}
