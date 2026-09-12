import QtQuick
import ".."

Rectangle {
    id: toast

    property string title: ""
    property string message: ""
    signal expired()

    width: 320
    height: Math.max(64, messageText.implicitHeight + 46)
    radius: Theme.radiusSmall
    color: Theme.glassBright
    border.width: 1
    border.color: Theme.strokeStrong
    opacity: 0
    scale: 0.96

    Component.onCompleted: {
        opacityAnimation.start();
        lifeTimer.start();
    }

    ParallelAnimation {
        id: opacityAnimation
        NumberAnimation { target: toast; property: "opacity"; to: 1.0; duration: Theme.anim(220); easing.type: Easing.OutCubic }
        NumberAnimation { target: toast; property: "scale"; to: 1.0; duration: Theme.anim(220); easing.type: Easing.OutCubic }
    }

    SequentialAnimation {
        id: fadeOut
        NumberAnimation { target: toast; property: "opacity"; to: 0.0; duration: Theme.anim(260) }
        ScriptAction { script: toast.expired(); }
    }

    Timer {
        id: lifeTimer
        interval: 4200
        onTriggered: fadeOut.start()
    }

    Column {
        anchors.fill: parent
        anchors.margins: 12
        spacing: 4

        Text {
            text: toast.title
            color: Theme.text
            font.pixelSize: Theme.fontSmall
            font.bold: true
            width: parent.width
            elide: Text.ElideRight
        }
        Text {
            id: messageText
            text: toast.message
            color: Theme.textDim
            font.pixelSize: Theme.fontTiny
            width: parent.width
            wrapMode: Text.WordWrap
            maximumLineCount: 3
            elide: Text.ElideRight
        }
    }

    MouseArea {
        anchors.fill: parent
        onClicked: toast.expired()
    }
}
