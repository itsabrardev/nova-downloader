import QtQuick
import QtQuick.Controls.Basic
import QtQuick.Layouts
import "../components" as UI
import ".."

Item {
    id: page

    property var media: null
    property string clipboardCandidate: ""

    Flickable {
        anchors.fill: parent
        contentWidth: width
        contentHeight: column.implicitHeight + 2 * Theme.pad
        clip: true

        ColumnLayout {
            id: column
            x: Math.max(Theme.pad, (parent.width - width) / 2)
            width: Math.min(parent.width - 2 * Theme.pad, 860)
            spacing: Theme.pad

            // headline
            ColumnLayout {
                spacing: 6
                Layout.fillWidth: true
                Layout.topMargin: Theme.padSmall

                Text {
                    text: "Grab any video you're allowed to."
                    color: Theme.text
                    font.pixelSize: Theme.fontBig
                    font.bold: true
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                }
                Text {
                    text: "Paste a link, pick quality, format, audio language and subtitles — NovaDownloader does the rest."
                    color: Theme.textDim
                    font.pixelSize: Theme.fontSmall
                    Layout.fillWidth: true
                    wrapMode: Text.WordWrap
                }
            }

            // clipboard detection banner
            UI.GlassCard {
                visible: page.clipboardCandidate !== ""
                Layout.fillWidth: true
                implicitHeight: 64

                RowLayout {
                    anchors.fill: parent
                    anchors.margins: 12
                    spacing: 12

                    Text { text: "🔗"; font.pixelSize: 18 }
                    ColumnLayout {
                        spacing: 2
                        Layout.fillWidth: true
                        Text {
                            text: "Video URL detected in clipboard"
                            color: Theme.text
                            font.pixelSize: Theme.fontSmall
                            font.bold: true
                        }
                        Text {
                            text: page.clipboardCandidate
                            color: Theme.textDim
                            font.pixelSize: Theme.fontTiny
                            elide: Text.ElideMiddle
                            Layout.fillWidth: true
                        }
                    }
                    Button {
                        text: "Analyze"
                        onClicked: {
                            urlInput.text = page.clipboardCandidate;
                            page.clipboardCandidate = "";
                            analyzeController.analyze(urlInput.text);
                        }
                    }
                    Button {
                        text: "Ignore"
                        flat: true
                        onClicked: page.clipboardCandidate = ""
                    }
                }
            }

            // URL input
            UI.UrlInput {
                id: urlInput
                Layout.fillWidth: true
                onAnalyzeRequested: url => {
                    page.media = null;
                    analyzeController.analyze(url);
                }
            }

            // analysis card
            UI.VideoInfoCard {
                id: infoCard
                visible: page.media !== null
                Layout.fillWidth: true
                media: page.media
                onDownloadRequested: {
                    analyzeController.startDownload(
                        page.media.url, infoCard.selQuality, infoCard.selContainer,
                        infoCard.selAudio, infoCard.selSubMode,
                        infoCard.selSubMode === "none" ? "" : infoCard.selSubLang);
                    appController.navigate("downloads");
                }
            }

            // empty-state hint
            ColumnLayout {
                visible: page.media === null && !analyzeController.busy
                spacing: 6
                Layout.fillWidth: true
                Layout.topMargin: Theme.pad

                Text {
                    text: analyzeController.busy ? "" : "Tips"
                    color: Theme.textFaint
                    font.pixelSize: Theme.fontSmall
                    font.bold: true
                }
                Text {
                    visible: !analyzeController.busy
                    text: "• Only download content you own or are allowed to save.\n" +
                          "• The clipboard monitor can catch copied links (enable it in Settings).\n" +
                          "• The Chrome extension sends pages here with one click."
                    color: Theme.textFaint
                    font.pixelSize: Theme.fontTiny
                    lineHeight: 1.35
                    wrapMode: Text.WordWrap
                    Layout.fillWidth: true
                }
            }
        }
    }

    Connections {
        target: analyzeController
        function onMediaReady(payload) {
            page.media = payload;
        }
        function onAnalyzeFailed(_title, _message) {
            page.media = null;
        }
    }

    Connections {
        target: appController
        function onClipboardUrlDetected(url) {
            page.clipboardCandidate = url;
            bannerTimer.restart();
        }
    }

    Timer {
        id: bannerTimer
        interval: 15000
        onTriggered: page.clipboardCandidate = ""
    }
}
