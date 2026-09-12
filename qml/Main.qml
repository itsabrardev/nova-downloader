import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import QtMultimedia
import "components" as UI

ApplicationWindow {
    id: root
    width: 1366
    height: 768
    minimumWidth: 1080
    minimumHeight: 660
    visible: true
    flags: Qt.FramelessWindowHint | Qt.Window
    color: Theme.bg
    title: appController.appName
    font.family: Theme.family
    font.pixelSize: Theme.fontBody

    property string currentPage: appController.currentPage

    // ---------- animated background (video with gradient fallback) ----------
    Rectangle {
        id: backgroundBase
        anchors.fill: parent
        gradient: Gradient {
            GradientStop { position: 0.0; color: "#0a1020" }
            GradientStop { position: 0.55; color: Theme.bg }
            GradientStop { position: 1.0; color: "#0d1526" }
        }
    }

    VideoOutput {
        id: backgroundVideoOutput
        anchors.fill: parent
        fillMode: VideoOutput.PreserveAspectCrop
        visible: backgroundPlayer.source.toString() !== "" && !backgroundPlayer.failed
    }
    MediaPlayer {
        id: backgroundPlayer
        property bool failed: false
        source: appController.backgroundVideoUrl
        autoPlay: true
        loops: MediaPlayer.Infinite
        videoOutput: backgroundVideoOutput
        audioOutput: AudioOutput {
            muted: true
            volume: 0.0
        }
        onErrorOccurred: (err, msg) => { backgroundPlayer.failed = true; }
    }

    Rectangle {
        id: backgroundOverlay
        anchors.fill: parent
        color: "#04060c"
        opacity: settingsController.backgroundOpacity
    }

    // ---------- chrome + content ----------
    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        UI.TitleBar {
            Layout.fillWidth: true
            Layout.preferredHeight: 48
        }

        RowLayout {
            spacing: 0
            Layout.fillWidth: true
            Layout.fillHeight: true

            UI.Sidebar {
                Layout.fillHeight: true
                Layout.preferredWidth: 216
            }

            StackView {
                id: pageStack
                Layout.fillWidth: true
                Layout.fillHeight: true
                clip: true
                initialItem: Qt.resolvedUrl(root.pageUrl(appController.currentPage))
            }
        }
    }

    UI.ToastHost {
        id: toastHost
        z: 100
    }

    function pageUrl(name: string): url {
        switch (name) {
            case "downloads": return "pages/Downloads.qml";
            case "history": return "pages/History.qml";
            case "settings": return "pages/Settings.qml";
            default: return "pages/Home.qml";
        }
    }

    function showPage(name: string) {
        appController.navigate(name);
    }

    Connections {
        target: appController
        function onCurrentPageChanged() {
            pageStack.replace(Qt.resolvedUrl(root.pageUrl(appController.currentPage)));
        }
        function onNotificationRequested(title, message) {
            toastHost.push(title, message);
        }
        function onQuitRequested() {
            Qt.quit();
        }
    }

    Connections {
        target: settingsController
        function onConfigChanged() {
            Theme.motion = settingsController.animationIntensity;
        }
    }

    Connections {
        target: analyzeController
        function onAnalyzeFailed(title, message) {
            toastHost.push(title, message);
        }
        function onDownloadStarted(taskId, title) {
            toastHost.push("Download queued", title);
        }
    }

    Connections {
        target: downloadsController
        function onNotificationRequested(title, message) {
            toastHost.push(title, message);
        }
    }

    Connections {
        target: historyController
        function onNotificationRequested(title, message) {
            toastHost.push(title, message);
        }
    }

    onClosing: function(close) {
        close.accepted = false;
        appController.handleClose();
    }

    Component.onCompleted: {
        Theme.motion = settingsController.animationIntensity;
    }
}
