/**
 * PROCESS FL BACK (JSX)
 * Edits FL BACK.psd: DD lines, Big/Linear barcodes, Age inside EDIT TEXT SO
 */

#target photoshop

// =============================================================================
// CONFIGURATION
// =============================================================================
var SCRIPT_PATH = File($.fileName).parent.fsName;
var CFG_FILE  = new File(SCRIPT_PATH + "/../config.json");

var config = {};
if (CFG_FILE.exists) {
    CFG_FILE.open("r");
    config = eval("(" + CFG_FILE.read() + ")");
    CFG_FILE.close();
} else {
    throw "config.json missing";
}

var ROOT_PATH = config.paths.base_dir;
if (ROOT_PATH.charAt(ROOT_PATH.length - 1) != "/" && ROOT_PATH.charAt(ROOT_PATH.length - 1) != "\\") ROOT_PATH += "/";

var JOB_FILE  = new File(ROOT_PATH + "active_job.txt");

var LOG_DIR = new Folder(ROOT_PATH + "logs");
if (!LOG_DIR.exists) LOG_DIR.create();

var LOG_FILE  = new File(ROOT_PATH + "logs/process_fl_back.log");
LOG_FILE.open("w");
LOG_FILE.close();

var PSD_NAME = (config.filenames && config.filenames.fl_back) ? config.filenames.fl_back : "FL BACK.psd";
var PSD_PATH = ROOT_PATH + "PSDs/" + PSD_NAME;

function log(msg) {
    try {
        LOG_FILE.open("a");
        LOG_FILE.writeln("[" + new Date().toLocaleString() + "] " + msg);
        LOG_FILE.close();
    } catch (e) {}
}

log("==================================================");
log("SCRIPT STARTED: process_fl_back.jsx");

// =============================================================================
// HELPERS
// =============================================================================

function readFile(path) {
    var f = new File(path);
    var data = {};
    if (f.exists) {
        f.open("r");
        while (!f.eof) {
            var line = f.readln();
            if (line.indexOf(":") > -1) {
                var parts = line.split(":");
                var key = parts[0].replace(/^\s+|\s+$/g, '');
                var val = parts[1].replace(/^\s+|\s+$/g, '');
                for (var i = 2; i < parts.length; i++) val += ":" + parts[i];
                data[key] = val;
            }
        }
        f.close();
        log("Data file read successfully: " + path);
    } else {
        log("ERROR: Data file not found at " + path);
    }
    return data;
}

function findLayerByName(parent, name) {
    for (var i = 0; i < parent.layers.length; i++) {
        if (parent.layers[i].name.toUpperCase() == name.toUpperCase()) return parent.layers[i];
        if (parent.layers[i].typename == "LayerSet") {
            var found = findLayerByName(parent.layers[i], name);
            if (found) return found;
        }
    }
    return null;
}

function findDirectArtLayer(parentSet, layerName) {
    if (!parentSet) return null;
    var targetName = layerName.toLowerCase();
    for (var i = 0; i < parentSet.artLayers.length; i++) {
        if (parentSet.artLayers[i].name.toLowerCase() == targetName) {
            return parentSet.artLayers[i];
        }
    }
    return null;
}

function setLayerText(parent, layerName, text) {
    try {
        var layer = findLayerByName(parent, layerName);
        if (layer && layer.kind == LayerKind.TEXT) {
            var oldText = layer.textItem.contents;
            layer.textItem.contents = text;
            log("Updated Text [" + layerName + "]: '" + oldText + "' -> '" + text + "'");
        } else {
            log("WARN: Text layer missing or not text kind: " + layerName);
        }
    } catch (e) {
        log("ERROR setting text for " + layerName + ": " + e);
    }
}

function replaceSmartObject(parentSet, layerName, filePath) {
    var fileRef = new File(filePath);
    if (!fileRef.exists) {
        log("Error: File not found for " + layerName + ": " + filePath);
        return;
    }

    try {
        var foundLayer = findDirectArtLayer(parentSet, layerName);

        if (foundLayer && foundLayer.kind == LayerKind.SMARTOBJECT) {
            app.activeDocument.activeLayer = foundLayer;
            executeAction(stringIDToTypeID("placedLayerEditContents"), new ActionDescriptor(), DialogModes.NO);

            var soDoc = app.activeDocument;

            var idPlc = charIDToTypeID("Plc ");
            var desc = new ActionDescriptor();
            desc.putPath(charIDToTypeID("null"), fileRef);
            desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
            executeAction(idPlc, desc, DialogModes.NO);

            var newLayer = soDoc.activeLayer;

            var docW = soDoc.width.as("px");
            var docH = soDoc.height.as("px");

            var bounds = newLayer.bounds;
            var layerW = bounds[2].as("px") - bounds[0].as("px");
            var layerH = bounds[3].as("px") - bounds[1].as("px");

            var scaleX = (docW / layerW) * 100;
            var scaleY = (docH / layerH) * 100;

            newLayer.resize(scaleX, scaleY, AnchorPosition.MIDDLECENTER);

            for (var j = soDoc.layers.length - 1; j >= 0; j--) {
                var layer = soDoc.layers[j];
                if (layer != newLayer) {
                    layer.remove();
                }
            }

            soDoc.close(SaveOptions.SAVECHANGES);
            log("Replaced/Edited Smart Object: " + layerName);

        } else {
            log("Error: Layer '" + layerName + "' not found or not a Smart Object.");
        }
    } catch(e) {
        log("Error replacing '" + layerName + "': " + e);
        if (app.activeDocument != parentSet.parent) {
            try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch(err) {}
        }
    }
}

function editSmartObjectText(parentSet, soLayerName, textLayerName, textValue) {
    try {
        // Prefer direct child under BLACK so we don't hit nested REV */EDIT TEXT
        var soLayer = findDirectArtLayer(parentSet, soLayerName);
        if (!soLayer) soLayer = findLayerByName(parentSet, soLayerName);

        if (!soLayer || soLayer.kind != LayerKind.SMARTOBJECT) {
            log("WARN: Smart Object '" + soLayerName + "' not found.");
            return;
        }

        app.activeDocument.activeLayer = soLayer;
        executeAction(stringIDToTypeID("placedLayerEditContents"), new ActionDescriptor(), DialogModes.NO);

        var soDoc = app.activeDocument;
        var textLayer = findLayerByName(soDoc, textLayerName);
        if (textLayer && textLayer.kind == LayerKind.TEXT) {
            var oldText = textLayer.textItem.contents;
            textLayer.textItem.contents = textValue;
            log("Updated SO Text [" + soLayerName + "/" + textLayerName + "]: '" + oldText + "' -> '" + textValue + "'");
        } else {
            log("WARN: Text layer '" + textLayerName + "' not found inside '" + soLayerName + "'");
        }

        soDoc.close(SaveOptions.SAVECHANGES);
    } catch (e) {
        log("ERROR editing smart object text '" + soLayerName + "': " + e);
        try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (err) {}
    }
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
    if (!JOB_FILE.exists) { log("CRITICAL: Job file missing."); return; }

    JOB_FILE.open("r");
    var dataFilePath = JOB_FILE.readln();
    JOB_FILE.close();

    if (!File(dataFilePath).exists) { log("CRITICAL: Data file path invalid: " + dataFilePath); return; }

    var data = readFile(dataFilePath);

    if (!File(PSD_PATH).exists) {
        log("CRITICAL: PSD not found at " + PSD_PATH);
        return;
    }

    log("Opening PSD: " + PSD_PATH);
    app.open(File(PSD_PATH));
    var doc = app.activeDocument;

    // Reset to original template state if history exists
    try {
        if (doc.historyStates.length > 0) {
            doc.activeHistoryState = doc.historyStates[0];
        }
    } catch (e) {
        log("WARN: Could not reset history: " + e);
    }

    var backGroup = findLayerByName(doc, "BACK");
    var blackGroup = backGroup ? findLayerByName(backGroup, "BLACK") : findLayerByName(doc, "BLACK");
    if (!blackGroup) {
        log("CRITICAL: 'BLACK' group not found!");
        return;
    }

    log("--- Editing BLACK ---");

    // DD = Document Discriminator from barcode DCF (11 + next 5 digits)
    setLayerText(blackGroup, "DD First Line", data["DD First Line"] || "");
    setLayerText(blackGroup, "DD Second Line", data["DD Second Line"] || "");

    // Age lives inside the EDIT TEXT smart object (direct child of BLACK)
    editSmartObjectText(blackGroup, "EDIT TEXT", "Age", data["Age"] || "21");

    var barcodesGroup = findLayerByName(blackGroup, "BARCODES");
    if (!barcodesGroup) {
        log("WARN: 'BARCODES' group not found under BLACK; trying BLACK itself.");
        barcodesGroup = blackGroup;
    }

    var bigBarcodePath = data["Load Big Barcode"];
    var linearBarcodePath = data["Load Linear Barcode"];

    if (bigBarcodePath && File(bigBarcodePath).exists) {
        replaceSmartObject(barcodesGroup, "Big barcode", bigBarcodePath);
    } else {
        log("WARN: Big barcode file missing: " + bigBarcodePath);
    }

    if (linearBarcodePath && File(linearBarcodePath).exists) {
        replaceSmartObject(barcodesGroup, "Linear barcode", linearBarcodePath);
    } else {
        log("WARN: Linear barcode file missing: " + linearBarcodePath);
    }

    // ================= EXPORT (match FL front black plate style) =================
    log("--- Starting Back Export ---");
    var historyState = doc.activeHistoryState;

    try {
        if (backGroup) backGroup.visible = true;
        if (blackGroup) blackGroup.visible = true;

        log("Converting to Grayscale for Back Black plate...");
        doc.changeMode(ChangeMode.GRAYSCALE);

        var tiffOptsGray = new TiffSaveOptions();
        tiffOptsGray.imageCompression = TIFFEncoding.NONE;
        tiffOptsGray.layers = false;
        tiffOptsGray.embedColorProfile = true;
        tiffOptsGray.transparency = true;

        var backFile = new File(data["Output Back"]);
        log("Saving Back TIFF to: " + backFile.fsName);
        doc.saveAs(backFile, tiffOptsGray, true, Extension.LOWERCASE);
        log("SUCCESS: Back Exported.");
    } catch(e) {
        log("ERROR during Back Export: " + e);
    }

    try {
        log("Reverting History State...");
        doc.activeHistoryState = historyState;
    } catch (e) {
        log("WARN: History revert failed: " + e);
    }

    log("Job Complete.");
    log("==================================================");
}

try { main(); } catch(e) { log("FATAL SCRIPT ERROR: " + e); }
