import QtQuick
import QtQuick.Controls.Basic
import ".."

Rectangle {
    id: titleBar
    color: Qt.rgba(0.02, 0.03, 0.06, 0.55)

    // drag to move + double-click maximize
    MouseArea {
        anchors.fill: parent
        onPressed: mouse => root.startSystemMove()
        onDoubleClicked: root.toggleMaximize()
    }

    function toggleMaximize() {
        if (root.visibility === Window.Maximized) root.showNormal();
        else root.showMaximized();
    }

    Row {
        anchors.left: parent.left
        anchors.leftMargin: 16
        anchors.verticalCenter: parent.verticalCenter
        spacing: 10

        Rectangle {
            width: 22; height: 22; radius: 6
            anchors.verticalCenter: parent.verticalCenter
            gradient: Gradient {
                GradientStop { position: 0; color: "#5b8cff" }
                GradientStop { position: 1; color: "#27408f" }
            }
            Text {
                anchors.centerIn: parent
                text: "↓"
                color: "white"
                font.pixelSize: 14
                font.bold: true
            }
        }

        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: appController.appName
            color: Theme.text
            font.pixelSize: Theme.fontBody
            font.bold: true
            font.letterSpacing: 0.4
        }
        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: appController.appVersion
            color: Theme.textFaint
            font.pixelSize: Theme.fontTiny
        }
    }

    Row {
        anchors.right: parent.right
        anchors.verticalCenter: parent.verticalCenter
        spacing: 4

        TitleBarButton { glyph: "–"; onClicked: root.showMinimized() }
        TitleBarButton { glyph: "□"; onClicked: titleBar.toggleMaximize() }
        TitleBarButton { glyph: "✕"; isClose: true; onClicked: appController.handleClose() }
    }

    component TitleBarButton: Rectangle {
        id: btn
        property string glyph: ""
        property bool isClose: false
        signal clicked()
        width: 40; height: titleBar.height
        color: closeArea.containsMouse
               ? (isClose ? "#e81123" : Qt.rgba(1, 1, 1, 0.08))
               : "transparent"
        Behavior on color { ColorAnimation { duration: Theme.anim(120) } }

        Text {
            anchors.centerIn: parent
            text: btn.glyph
            color: Theme.textDim
            font.pixelSize: 12
            font.bold: true
        }
        MouseArea {
            id: closeArea
            anchors.fill: parent
            hoverEnabled: true
            onClicked: btn.clicked()
        }
    }
}
