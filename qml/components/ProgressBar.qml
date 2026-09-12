import QtQuick
import ".."

Rectangle {
    id: bar

    property real value: 0.0          // 0..1
    property bool busy: false         // indeterminate shimmer
    property color tint: Theme.accent

    height: 8
    radius: height / 2
    color: Qt.rgba(1, 1, 1, 0.06)
    clip: true

    Rectangle {
        id: fill
        width: Math.max(0, Math.min(1, bar.value)) * parent.width
        height: parent.height
        radius: parent.radius
        color: bar.tint

        Behavior on width {
            NumberAnimation { duration: Theme.anim(350); easing.type: Easing.OutCubic }
        }
    }

    // shimmer while busy/indeterminate
    Rectangle {
        id: shimmer
        visible: bar.busy
        width: parent.width * 0.25
        height: parent.height
        radius: parent.radius
        gradient: Gradient {
            orientation: Gradient.Horizontal
            GradientStop { position: 0.0; color: Qt.rgba(1, 1, 1, 0.0) }
            GradientStop { position: 0.5; color: Qt.rgba(1, 1, 1, 0.35) }
            GradientStop { position: 1.0; color: Qt.rgba(1, 1, 1, 0.0) }
        }

        XAnimator on x {
            running: bar.busy
            from: -shimmer.width
            to: bar.width
            duration: Theme.anim(1200)
            loops: Animation.Infinite
        }
    }
}
