/**
 * PROCESS CT LICENSE (JSX)
 * Single PSD (CT 8 UP.psb) with Front + Back. Edits text, photos, barcodes, signature.
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
var LOG_FILE  = new File(ROOT_PATH + "logs/process_ct.log");

var logFolder = new Folder(ROOT_PATH + "logs");
if (!logFolder.exists) logFolder.create();

LOG_FILE.open("w");
LOG_FILE.close();

var PSD_NAME = (config.filenames && config.filenames.ct_psd) ? config.filenames.ct_psd : "CT 8 UP.psb";
var PSD_PATH = ROOT_PATH + "PSDs/" + PSD_NAME;

function log(msg) {
    LOG_FILE.open("a");
    LOG_FILE.writeln("[" + new Date().toLocaleString() + "] " + msg);
    LOG_FILE.close();
}

log("==================================================");
log("SCRIPT STARTED: process_ct.jsx");

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

/**
 * Open smart object, place target image, delete existing layers, save and close.
 * Same pattern used by process_pa.jsx / process_pa_back.jsx.
 */
function replaceSmartObject(parentSet, layerName, filePath) {
    var fileRef = new File(filePath);
    if (!fileRef.exists) {
        log("Error: File not found for " + layerName + ": " + filePath);
        return;
    }

    try {
        var foundLayer = findLayerByName(parentSet, layerName);

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
    } catch (e) {
        log("Error replacing '" + layerName + "': " + e);
        try {
            if (app.activeDocument.name != parentSet.parent.name) {
                app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
            }
        } catch (err) {}
    }
}

function exportPNG(path) {
    var pngOpts = new PNGSaveOptions();
    pngOpts.compression = 0;
    pngOpts.interlaced = false;
    var f = new File(path);
    app.activeDocument.saveAs(f, pngOpts, true, Extension.LOWERCASE);
    log("Exported PNG: " + path);
}

function savePSD(path) {
    var psdOpts = new PhotoshopSaveOptions();
    psdOpts.layers = true;
    psdOpts.embedColorProfile = true;
    var f = new File(path);
    app.activeDocument.saveAs(f, psdOpts, true, Extension.LOWERCASE);
    log("Saved PSD: " + path);
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

    var originalRulerUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    try {
        log("Opening PSD: " + PSD_PATH);
        if (!File(PSD_PATH).exists) throw "Template missing: " + PSD_PATH;
        app.open(File(PSD_PATH));
        var doc = app.activeDocument;

        try {
            if (doc.historyStates.length > 0) {
                doc.activeHistoryState = doc.historyStates[0];
            }
        } catch (e) {
            log("WARN: Could not reset history: " + e);
        }

        var ctPrint = findLayerByName(doc, "CT Print");
        if (!ctPrint) {
            log("CRITICAL: 'CT Print' group not found!");
            return;
        }

        var front = findLayerByName(ctPrint, "FRONT");
        var back = findLayerByName(ctPrint, "BACK");
        var uvBack = findLayerByName(ctPrint, "UV Back");

        // --- FRONT TEXT ---
        var textEdit = front ? findLayerByName(front, "TEXT EDIT") : null;
        if (textEdit) {
            log("--- Editing FRONT TEXT EDIT ---");
            setLayerText(textEdit, "DL", data["DL"] || "");
            setLayerText(textEdit, "DOB", data["DOB"] || "");
            setLayerText(textEdit, "EXP", data["Exp Date"] || "");
            setLayerText(textEdit, "ISSUE", data["Iss Date"] || "");
            setLayerText(textEdit, "HGT", data["Height"] || "");
            setLayerText(textEdit, "SEX", data["Sex"] || "");
            setLayerText(textEdit, "EYES", data["Eyes"] || "");
            setLayerText(textEdit, "DD", data["DD"] || "");
            setLayerText(textEdit, "LAST", data["Last Name"] || "");
            setLayerText(textEdit, "FIRST MIDDLE", data["First Middle"] || "");
            setLayerText(textEdit, "ADDRESS", data["Street 1"] || "");
            setLayerText(textEdit, "CITY STATE ZIP", data["City State Zip"] || "");
            setLayerText(textEdit, "CLASS", data["Class"] || "D");
        } else {
            log("CRITICAL: 'TEXT EDIT' group not found!");
        }

        // --- SIGNATURE ---
        var sigGroup = front ? findLayerByName(front, "SIGNATURE") : null;
        if (sigGroup) {
            log("--- Processing Signature ---");
            var sigTxtLayer = findLayerByName(sigGroup, "Signature text");
            var sigImgLayer = findLayerByName(sigGroup, "Signature image");
            var useSigImg = (data["Use Sig Image"] == "TRUE");

            if (useSigImg && data["Sig Path"] && File(data["Sig Path"]).exists) {
                if (sigImgLayer) {
                    replaceSmartObject(sigGroup, "Signature image", data["Sig Path"]);
                    sigImgLayer.visible = true;
                    log("Visible: Signature image");
                }
                if (sigTxtLayer) sigTxtLayer.visible = false;
            } else {
                if (sigTxtLayer) {
                    if (data["Sig Text"]) {
                        var oldSig = sigTxtLayer.textItem.contents;
                        sigTxtLayer.textItem.contents = data["Sig Text"];
                        log("Updated Signature text: '" + oldSig + "' -> '" + data["Sig Text"] + "'");
                    }
                    sigTxtLayer.visible = true;
                    log("Visible: Signature text");
                }
                if (sigImgLayer) sigImgLayer.visible = false;
            }
        } else {
            log("WARN: 'SIGNATURE' group not found");
        }

        // --- FRONT PHOTOS ---
        var photoEdit = front ? findLayerByName(front, "PHOTO EDIT") : null;
        if (photoEdit && data["Face Path"] && File(data["Face Path"]).exists) {
            log("--- Replacing Front Photo Smart Objects ---");
            var frontPhotoLayers = ["Big photo", "Small photo", "51 copy 5", "51 copy 4"];
            for (var p = 0; p < frontPhotoLayers.length; p++) {
                replaceSmartObject(photoEdit, frontPhotoLayers[p], data["Face Path"]);
            }
        } else {
            log("WARN: Face path missing or PHOTO EDIT group not found");
        }

        // --- UV BACK PHOTOS ---
        if (uvBack && data["Face Path"] && File(data["Face Path"]).exists) {
            log("--- Replacing UV Back Photo Smart Objects ---");
            var uvPhotoLayers = ["Big photo", "51 copy 6", "51 copy 3"];
            for (var u = 0; u < uvPhotoLayers.length; u++) {
                replaceSmartObject(uvBack, uvPhotoLayers[u], data["Face Path"]);
            }
        }

        // --- BACK BLACK TEXT + BARCODES ---
        var blackGroup = back ? findLayerByName(back, "BLACK") : null;
        if (blackGroup) {
            log("--- Editing BACK BLACK ---");
            setLayerText(blackGroup, "Inventory control - first line", data["IC Line 1"] || "");
            setLayerText(blackGroup, "Inventory control - second line", data["IC Line 2"] || "");
            setLayerText(blackGroup, "DOB (Back)", data["DOB Back"] || data["DOB"] || "");

            var barcodes = findLayerByName(blackGroup, "BARCODES");
            var barcodeParent = barcodes ? barcodes : blackGroup;

            var bigBarcodePath = data["Load Big Barcode"];
            var linearBarcodePath = data["Load Linear Barcode"];

            if (bigBarcodePath && File(bigBarcodePath).exists) {
                replaceSmartObject(barcodeParent, "Big barcode", bigBarcodePath);
            } else {
                log("WARN: Big barcode file missing: " + bigBarcodePath);
            }

            if (linearBarcodePath && File(linearBarcodePath).exists) {
                replaceSmartObject(barcodeParent, "Linear barcode", linearBarcodePath);
            } else {
                log("WARN: Linear barcode file missing: " + linearBarcodePath);
            }
        } else {
            log("CRITICAL: 'BLACK' group not found on BACK!");
        }

        // --- SAVE PSD ---
        if (data["Output PSD"]) {
            savePSD(data["Output PSD"]);
        }

        // --- EXPORT FRONT / BACK PNGs ---
        var stateBeforeTrim = doc.activeHistoryState;

        if (front && back && data["Output Front"] && data["Output Back"]) {
            log("Exporting Front...");
            front.visible = true;
            back.visible = false;
            if (uvBack) uvBack.visible = false;
            try { doc.trim(TrimType.TRANSPARENT, true, true, true, true); } catch (e) { log("Trim front warn: " + e); }
            exportPNG(data["Output Front"]);

            doc.activeHistoryState = stateBeforeTrim;

            log("Exporting Back...");
            front.visible = false;
            back.visible = true;
            if (uvBack) uvBack.visible = true;
            try { doc.trim(TrimType.TRANSPARENT, true, true, true, true); } catch (e) { log("Trim back warn: " + e); }
            exportPNG(data["Output Back"]);

            doc.activeHistoryState = stateBeforeTrim;
            front.visible = true;
            back.visible = true;
            if (uvBack) uvBack.visible = true;
        }

        app.preferences.rulerUnits = originalRulerUnits;
        log("SUCCESS: CT Job Completed.");
        log("==================================================");

    } catch (e) {
        log("CRITICAL ERROR: " + e + " (Line: " + e.line + ")");
        app.preferences.rulerUnits = originalRulerUnits;
    }
}

main();
