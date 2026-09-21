/**
 * PROCESS PA BACK (JSX)
 * Edits PA BACK.psd: Age, DOB, DD lines, Big/Linear barcodes
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
var LOG_FILE  = new File(ROOT_PATH + "logs/process_pa_back.log");
LOG_FILE.open("w");
LOG_FILE.close();

var logFolder = new Folder(ROOT_PATH + "logs");
if (!logFolder.exists) logFolder.create();

var PSD_NAME = (config.filenames && config.filenames.pa_back) ? config.filenames.pa_back : "PA BACK.psd";
var PSD_PATH = ROOT_PATH + "PSDs/" + PSD_NAME;

function log(msg) {
    LOG_FILE.open("a");
    LOG_FILE.writeln("[" + new Date().toLocaleString() + "] " + msg);
    LOG_FILE.close();
}

log("==================================================");
log("SCRIPT STARTED: process_pa_back.jsx");

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

function isDocumentOpen(name) {
    for (var i = 0; i < app.documents.length; i++) {
        if (app.documents[i].name == name) return true;
    }
    return false;
}

function openTemplate(psdPath, psdName) {
    if (isDocumentOpen(psdName)) {
        log("PSD already open — activating: " + psdName);
        app.activeDocument = app.documents.getByName(psdName);
        return app.activeDocument;
    }

    var fileRef = new File(psdPath);
    if (!fileRef.exists) {
        throw "PSD missing at: " + psdPath;
    }

    try {
        log("Opening PSD via app.open: " + psdPath);
        app.open(fileRef);
    } catch (e1) {
        log("app.open failed (" + e1 + ") — retrying via Action Manager...");
        var desc = new ActionDescriptor();
        desc.putPath(charIDToTypeID("null"), fileRef);
        executeAction(charIDToTypeID("Opn "), desc, DialogModes.NO);
    }
    return app.activeDocument;
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
        var targetName = layerName.toLowerCase();
        var foundLayer = null;

        for (var i = 0; i < parentSet.artLayers.length; i++) {
            if (parentSet.artLayers[i].name.toLowerCase() == targetName) {
                foundLayer = parentSet.artLayers[i];
                break;
            }
        }

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

    log("Opening PSD: " + PSD_PATH);
    var doc = openTemplate(PSD_PATH, PSD_NAME);

    // Reset to original template state if history exists
    try {
        if (doc.historyStates.length > 0) {
            doc.activeHistoryState = doc.historyStates[0];
            log("Reset history to original template state.");
        }
    } catch (e) {
        log("WARN: Could not reset history: " + e);
    }

    var blackText = findLayerByName(doc, "BLACK TEXT");
    if (!blackText) {
        log("CRITICAL: 'BLACK TEXT' group not found!");
        return;
    }

    log("--- Editing BLACK TEXT ---");
    setLayerText(blackText, "Age", data["Age"] || "21");
    setLayerText(blackText, "DOB", data["DOB"] || "");
    // DD = Document Discriminator from barcode DCF field (11 + next 5 digits)
    setLayerText(blackText, "DD First Line", data["DD First Line"] || "");
    setLayerText(blackText, "DD Second Line", data["DD Second Line"] || "");
    // From bulk Endorsements / Restrictions (default None)
    setLayerText(blackText, "Restrictions (Back)", data["Restrictions Back"] || "None");
    setLayerText(blackText, "Endorsements (Back)", data["Endorsements Back"] || "None");

    var bigBarcodePath = data["Load Big Barcode"];
    var linearBarcodePath = data["Load Linear Barcode"];

    if (bigBarcodePath && File(bigBarcodePath).exists) {
        replaceSmartObject(blackText, "Big barcode", bigBarcodePath);
    } else {
        log("WARN: Big barcode file missing: " + bigBarcodePath);
    }

    if (linearBarcodePath && File(linearBarcodePath).exists) {
        replaceSmartObject(blackText, "Linear barcode", linearBarcodePath);
        replaceSmartObject(blackText, "Linear barcode 2", linearBarcodePath);
    } else {
        log("WARN: Linear barcode file missing: " + linearBarcodePath);
    }

    // ================= EXPORT =================
    log("--- Starting Back Export ---");
    var historyState = doc.activeHistoryState;

    try {
        if (blackText) blackText.visible = true;

        log("Converting Profile to sRGB IEC61966-2.1 (Relative Colorimetric)...");
        doc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, true);

        var pngOpts = new PNGSaveOptions();
        pngOpts.compression = 0;
        pngOpts.interlaced = false;

        var backFile = new File(data["Output Back"]);
        log("Saving Back PNG to: " + backFile.fsName);
        doc.saveAs(backFile, pngOpts, true, Extension.LOWERCASE);
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

    log("==================================================");
}

try { main(); } catch(e) { log("FATAL SCRIPT ERROR: " + e); }
