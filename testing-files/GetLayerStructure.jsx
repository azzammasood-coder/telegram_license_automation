#target photoshop

function getLayerStructure() {
    if (app.documents.length === 0) {
        alert("No document is currently open.");
        return;
    }

    var doc = app.activeDocument;
    var output = [];
    output.push("Document: " + doc.name);
    output.push("--------------------------------------------------");

    // Recursive function to parse layers
    function parseLayers(layers, depth) {
        var indent = "";
        for (var i = 0; i < depth; i++) {
            indent += "    "; // 4 spaces for indentation hierarchy
        }

        for (var i = 0; i < layers.length; i++) {
            var layer = layers[i];

            if (layer.typename === "LayerSet") {
                // It's a group/folder
                output.push(indent + "+ [Group] " + layer.name);
                parseLayers(layer.layers, depth + 1); // Recurse into the group
            } else if (layer.typename === "ArtLayer") {
                // It's a regular layer
                var kindStr = "UNKNOWN";
                try {
                    // Extract just the specific kind type, e.g., "LayerKind.TEXT" -> "TEXT"
                    kindStr = layer.kind.toString().replace("LayerKind.", "");
                } catch (e) { }

                var layerInfo = indent + "- [" + kindStr + " Layer] " + layer.name;

                // If it's a text layer, grab its contents
                if (layer.kind == LayerKind.TEXT) {
                    try {
                        var textContent = layer.textItem.contents;
                        // Replace line breaks to keep the log on a single line per layer
                        textContent = textContent.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
                        layerInfo += ' => TEXT CONTENT: "' + textContent + '"';
                    } catch (e) {
                        // Fallback just in case textItem is inaccessible
                        layerInfo += ' => TEXT CONTENT: (Empty or Unavailable)';
                    }
                }

                output.push(layerInfo);
            }
        }
    }

    // Start parsing from the root of the document
    parseLayers(doc.layers, 0);

    var resultText = output.join("\n");

    // Save to a text file in the same directory as the script
    var scriptFolder = new File($.fileName).parent;
    var logFile = new File(scriptFolder + "/LayerStructureLog.txt");
    if (logFile.open("w")) {
        logFile.encoding = "UTF8";
        logFile.write(resultText);
        logFile.close();
        alert("Success! Layer structure log has been saved to:\n" + logFile.fsName);
    } else {
        alert("Failed to write the log file.");
    }
}

// Execute
getLayerStructure();
