import QtQuick
import ".."

Column {
    id: host

    anchors.top: parent.top
    anchors.right: parent.right
    anchors.margins: 16
    spacing: 8
    z: 100

    function push(title, message) {
        toastModel.append({ title: title, message: message });
        while (toastModel.count > 4) toastModel.remove(0);
    }

    ListModel { id: toastModel }

    Repeater {
        model: toastModel

        delegate: Toast {
            title: model.title
            message: model.message
            onExpired: toastModel.remove(model.index)
        }
    }
}
