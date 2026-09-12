import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import ".."

GlassCard {
    id: card

    // media payload from AnalyzeController.mediaReady
    property var media: null

    // selections, set by Home before calling startDownload
    property string selQuality: ""
    property string selContainer: "mp4"
    property string selAudio: "original"
    property string selSubMode: "none"
    property string selSubLang: ""

    signal downloadRequested()

    implicitHeight: content.implicitHeight + 2 * Theme.pad
    opacity: 0

    onMediaChanged: {
        if (!media) return;
        selQuality = media.qualities && media.qualities.length ? media.qualities[0] : "best";
        selContainer = "mp4";
        selAudio = "original";
        selSubMode = "none";
        selSubLang = media.subtitles && media.subtitles.length ? media.subtitles[0].language : "";
        entrance.restart();
    }

    ParallelAnimation {
        id: entrance
        NumberAnimation { target: card; property: "opacity"; to: 1.0; duration: Theme.anim(320); easing.type: Easing.OutCubic }
        NumberAnimation { target: card; property: "scale"; from: 0.98; to: 1.0; duration: Theme.anim(320); easing.type: Easing.OutCubic }
    }

    ColumnLayout {
        id: content
        anchors.fill: parent
        anchors.margins: Theme.pad
        spacing: 14

        RowLayout {
            spacing: 16
            Layout.fillWidth: true

            Rectangle {
                Layout.preferredWidth: 248
                Layout.preferredHeight: 140
                radius: Theme.radiusSmall
                color: Theme.bgElevated
                clip: true

                Image {
                    anchors.fill: parent
                    source: media && media.thumbnail ? media.thumbnail : ""
                    fillMode: Image.PreserveAspectCrop
                    asynchronous: true
                    visible: status === Image.Ready
                }
                Text {
                    anchors.centerIn: parent
                    visible: !imageOk()
                    text: "▶"
                    color: Theme.textFaint
                    font.pixelSize: 30
                    function imageOk() { return media && media.thumbnail; }
                }
                Rectangle {
                    anchors.bottom: parent.bottom
                    anchors.left: parent.left
                    anchors.margins: 8
                    width: durationLabel.implicitWidth + 14
                    height: 22
                    radius: 6
                    color: Qt.rgba(0, 0, 0, 0.65)
                    Text {
                        id: durationLabel
                        anchors.centerIn: parent
                        text: media ? (media.isLive ? "LIVE" : media.durationText) : ""
                        color: "white"
                        font.pixelSize: Theme.fontTiny
                        font.bold: true
                    }
                }
            }

            ColumnLayout {
                spacing: 6
                Layout.fillWidth: true

                Text {
                    text: media ? media.title : ""
                    color: Theme.text
                    font.pixelSize: Theme.fontTitle
                    font.bold: true
                    wrapMode: Text.WordWrap
                    maximumLineCount: 2
                    elide: Text.ElideRight
                    Layout.fillWidth: true
                }
                Text {
                    text: media ? ((media.uploader || "Unknown") + "  ·  " + (media.formatCount || 0) + " formats") : ""
                    color: Theme.textDim
                    font.pixelSize: Theme.fontSmall
                }
                Item { Layout.fillHeight: true }
            }
        }

        Rectangle { Layout.fillWidth: true; height: 1; color: Theme.stroke }

        ColumnLayout {
            spacing: 8
            Layout.fillWidth: true

            RowLayout {
                spacing: 10
                Text { text: "Quality"; color: Theme.textFaint; font.pixelSize: Theme.fontSmall; Layout.preferredWidth: 92 }
                PillSelector {
                    Layout.fillWidth: true
                    options: media && media.qualities ? media.qualities : []
                    selected: card.selQuality
                    onSelectionChanged: value => card.selQuality = value
                }
            }
            RowLayout {
                spacing: 10
                Text { text: "Format"; color: Theme.textFaint; font.pixelSize: Theme.fontSmall; Layout.preferredWidth: 92 }
                PillSelector {
                    Layout.fillWidth: true
                    options: [{ value: "mp4", label: "MP4" }, { value: "mkv", label: "MKV" },
                              { value: "webm", label: "WEBM" }, { value: "mp3", label: "MP3" }]
                    selected: card.selContainer
                    onSelectionChanged: value => card.selContainer = value
                }
            }
            RowLayout {
                spacing: 10
                // Always visible: single-track media shows "Original" so the
                // option is discoverable; extra languages appear only when
                // the media really offers them.
                Text { text: "Audio"; color: Theme.textFaint; font.pixelSize: Theme.fontSmall; Layout.preferredWidth: 92 }
                PillSelector {
                    Layout.fillWidth: true
                    options: (media && media.audioTracks ? media.audioTracks : []).map(t => ({ value: t.language, label: t.label }))
                    selected: card.selAudio
                    onSelectionChanged: value => card.selAudio = value
                }
            }
            RowLayout {
                spacing: 10
                visible: media && media.subtitles && media.subtitles.length > 0
                Text { text: "Subtitles"; color: Theme.textFaint; font.pixelSize: Theme.fontSmall; Layout.preferredWidth: 92 }
                PillSelector {
                    Layout.fillWidth: true
                    options: [{ value: "none", label: "None" }, { value: "external", label: "File" }, { value: "embedded", label: "Embed" }]
                    selected: card.selSubMode
                    onSelectionChanged: value => { card.selSubMode = value; }
                }
                PillSelector {
                    visible: card.selSubMode !== "none"
                    options: (media && media.subtitles ? media.subtitles : [])
                        .map(s => ({ value: s.language, label: s.auto ? s.name + " (auto)" : s.name }))
                    selected: card.selSubLang
                    onSelectionChanged: value => card.selSubLang = value
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            spacing: 12

            Text {
                text: media && media.qualities && media.qualities.indexOf("audio") >= 0 && card.selQuality === "audio"
                      ? "Audio-only download — a separate MP3/M4A file"
                      : "Separate streams are merged with FFmpeg when needed"
                color: Theme.textFaint
                font.pixelSize: Theme.fontTiny
                Layout.fillWidth: true
                wrapMode: Text.WordWrap
            }

            Button {
                id: downloadButton
                Layout.preferredHeight: 42
                Layout.preferredWidth: 190
                contentItem: Text {
                    text: "↓  Download"
                    color: "white"
                    font.pixelSize: Theme.fontBody
                    font.bold: true
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                }
                background: Rectangle {
                    radius: Theme.radiusSmall
                    gradient: Gradient {
                        GradientStop { position: 0; color: downloadButton.hovered ? "#7aa4ff" : Theme.accent }
                        GradientStop { position: 1; color: downloadButton.hovered ? "#4f79e6" : "#3d63c9" }
                    }
                }
                onClicked: card.downloadRequested()
            }
        }
    }
}
