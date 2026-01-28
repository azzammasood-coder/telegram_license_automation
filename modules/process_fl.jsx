/**
 * PROCESS FLORIDA LICENSE (JSX)
 * UPDATED: With Logging and Config Bootstrap
 */

#target photoshop

// =============================================================================
// CONFIGURATION
// =============================================================================
// 1. Bootstrap: Find config.json relative to this script
var SCRIPT_PATH = File($.fileName).parent.fsName;
var CFG_FILE  = new File(SCRIPT_PATH + "/../config.json");

var config = {};
if (CFG_FILE.exists) {
    CFG_FILE.open("r");
    var jsonString = CFG_FILE.read();
    CFG_FILE.close();
    config = eval("(" + jsonString + ")");
} else {
    throw "config.json missing at: " + SCRIPT_PATH;
}

// 2. Set ROOT_PATH from Config.json
var ROOT_PATH = config.paths.base_dir;

// Ensure trailing slash
if (ROOT_PATH.charAt(ROOT_PATH.length - 1) != "/" && ROOT_PATH.charAt(ROOT_PATH.length - 1) != "\\") {
    ROOT_PATH += "/";
}

// 3. Define other paths based on ROOT_PATH
var JOB_FILE  = new File(ROOT_PATH + "active_job.txt");

// Setup Logging: Create 'logs' directory if it doesn't exist
var LOG_DIR = new Folder(ROOT_PATH + "logs");
if (!LOG_DIR.exists) {
    LOG_DIR.create();
}
var LOG_FILE  = new File(ROOT_PATH + "logs/process_fl.log");
LOG_FILE.open("w");
LOG_FILE.close();

// PSD Selection (Adapted for FL)
var PSD_NAME = (config.filenames && config.filenames.fl_psd) ? config.filenames.fl_psd : "FL Revision 2020 For Poly.psd";
var PSD_PATH = ROOT_PATH + "PSDs/" + PSD_NAME;


// =============================================================================
// LOGGING SYSTEM
// =============================================================================

function log(msg) {
    try {
        var d = new Date();
        var timeStamp = d.toLocaleString();
        LOG_FILE.open("a");
        LOG_FILE.writeln("[" + timeStamp + "] " + msg);
        LOG_FILE.close();
    } catch (e) {
        // Fail silently if logging fails to avoid stopping the script
    }
}

log("==================================================");
log("SCRIPT STARTED: process_fl.jsx");
log("Configuration loaded. Root: " + ROOT_PATH);


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
                for (var i = 2; i < parts.length; i++) {
                    val += ":" + parts[i];
                }
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
        var layer = parent.layers[i];
        if (layer.name.toUpperCase() == name.toUpperCase()) {
            return layer;
        }
        if (layer.typename == "LayerSet") {
            var found = findLayerByName(layer, name);
            if (found) return found;
        }
    }
    return null;
}

function setLayerText(parent, layerName, text) {
    try {
        var layer = findLayerByName(parent, layerName);
        if (layer && layer.kind == LayerKind.TEXT) {
            layer.textItem.contents = text;
            log("Set Text [" + layerName + "]: " + text);
        } else {
            log("WARN: Text layer not found or not text kind: " + layerName);
        }
    } catch (e) {
        log("ERROR setting text for " + layerName + ": " + e);
    }
}

function toggleLayerVisibility(parent, layerName, isVisible) {
    try {
        var layer = findLayerByName(parent, layerName);
        if (layer) {
            layer.visible = isVisible;
            log("Set Visibility [" + layerName + "]: " + isVisible);
        } else {
            log("WARN: Layer to toggle not found: " + layerName);
        }
    } catch (e) {
        log("ERROR toggling " + layerName + ": " + e);
    }
}

function replaceSmartObject(parentSet, layerName, filePath) {
    // 1. Validate inputs
    // if (!parentSet || !fileRef.exists) return;

    // Convert string path to File object
    var fileRef = new File(filePath);
    if (!fileRef.exists) {
        log("Error: File not found for " + layerName + ": " + filePath);
        return;
    }

    try {
        var targetName = layerName.toLowerCase();
        var foundLayer = null;

        // 2. Find layer
        for (var i = 0; i < parentSet.artLayers.length; i++) {
            if (parentSet.artLayers[i].name.toLowerCase() == targetName) {
                foundLayer = parentSet.artLayers[i];
                break;
            }
        }

        if (foundLayer && foundLayer.kind == LayerKind.SMARTOBJECT) {
            // 3. Open Smart Object
            app.activeDocument.activeLayer = foundLayer;
            executeAction(stringIDToTypeID("placedLayerEditContents"), new ActionDescriptor(), DialogModes.NO);
            
            // We are now inside the child document
            var soDoc = app.activeDocument;
            
            // 4. Place Embedded
            var idPlc = charIDToTypeID("Plc ");
            var desc = new ActionDescriptor();
            desc.putPath(charIDToTypeID("null"), fileRef);
            desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
            executeAction(idPlc, desc, DialogModes.NO);
            
            // 5. Resize New Layer to Fit Canvas
            var newLayer = soDoc.activeLayer;
            
            // Get dimensions (in pixels)
            var docW = soDoc.width.as("px");
            var docH = soDoc.height.as("px");
            
            var bounds = newLayer.bounds;
            var layerW = bounds[2].as("px") - bounds[0].as("px");
            var layerH = bounds[3].as("px") - bounds[1].as("px");
            
            // Calculate scale percentage needed to fit exactly
            var scaleX = (docW / layerW) * 100;
            var scaleY = (docH / layerH) * 100;
            
            // Resize (using MIDDLECENTER ensures it stays centered if it was centered)
            newLayer.resize(scaleX, scaleY, AnchorPosition.MIDDLECENTER);
            
            // 6. Delete Old Layers
            // Loop backwards to remove everything except our new layer
            for (var j = soDoc.layers.length - 1; j >= 0; j--) {
                var layer = soDoc.layers[j];
                if (layer != newLayer) {
                    layer.remove();
                }
            }
            
            // 7. Save and Close
            soDoc.close(SaveOptions.SAVECHANGES);
            log("Replaced/Edited Smart Object: " + layerName);
            
        } else {
            log("Error: Layer '" + layerName + "' not found or not a Smart Object.");
        }
    } catch(e) {
        log("Error replacing '" + layerName + "': " + e);
        // If we are stuck inside the smart object due to error, try to close it
        if (app.activeDocument != parentSet.parent) {
            try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch(err) {}
        }
    }
}

function replaceFace(parentSet, layerName, filePath) {
    // Convert string path to File object
    var fileRef = new File(filePath);
    if (!fileRef.exists) {
        log("Error: Face File not found: " + filePath);
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

            // 1. Place Embedded
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

            // 2. SMART SCALE & ZOOM (Cover Style + 110%)
            // Calculate ratios for both width and height
            var ratioW = docW / layerW;
            var ratioH = docH / layerH;

            // Use the LARGER ratio. This ensures the image covers the entire canvas 
            // without leaving empty gaps on the shorter side.
            var baseRatio = Math.max(ratioW, ratioH);

            // Convert to percentage (x100) and apply the 1.1x zoom (110 total)
            var scaleFactor = baseRatio * 110;

            newLayer.resize(scaleFactor, scaleFactor, AnchorPosition.MIDDLECENTER);

            // 3. ALIGN TO TOP
            // Get new bounds after resize to find the current top position
            var newBounds = newLayer.bounds;
            var currentTopY = newBounds[1].as("px");

            // Move the image so the top (currentTopY) becomes 0 (top of canvas)
            newLayer.translate(0, -currentTopY);

            // 4. Cleanup old layers
            for (var j = soDoc.layers.length - 1; j >= 0; j--) {
                if (soDoc.layers[j] != newLayer) soDoc.layers[j].remove();
            }

            soDoc.close(SaveOptions.SAVECHANGES);
            log("Face processed: Smart Fit (Cover) + 0.1x zoom, aligned to top.");

        }
    } catch (e) {
        log("Error in replaceFace: " + e);
        if (app.activeDocument != parentSet.parent) {
            try {
                app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
            } catch (err) {}
        }
    }
}


function updateHeightPreserve(layer, heightData) {
    if (!layer || !heightData) return;
    try {
        var original = layer.textItem.contents;
        
        // 1. Extract new numbers from input (e.g. "5-04" or "5' 04"")
        var inputNums = heightData.match(/(\d+)\D+(\d+)/);
        if (!inputNums) {
             // Fallback if input format is weird
            layer.textItem.contents = heightData;
            log("Height Fallback (Format mismatch): " + heightData);
            return;
        }
        var newFeet = inputNums[1];
        var newInch = inputNums[2];

        // 2. Parse original structure (Digits + Separator + Digits + Suffix)
        // Matches: "5" + "’ " + "07" + "”"
        var parts = original.match(/^(\d+)(\D+)(\d+)(.*)$/);
        
        if (parts) {
            // Reconstruct: NewFeet + OldSeparator + NewInches + OldSuffix
            var finalStr = newFeet + parts[2] + newInch + parts[4];
            log("Height Preserve Update: " + original + " -> " + finalStr);
            layer.textItem.contents = finalStr;
        } else {
            // Fallback if original text layer format is unexpected
            layer.textItem.contents = heightData;
            log("Height Fallback (Original mismatch): " + heightData);
        }
    } catch(e) { log("Height Preserve Error: " + e); }
}

function setLayerText(parent, layerName, text) {
    try {
        var layer = findLayerByName(parent, layerName);
        if (layer && layer.kind == LayerKind.TEXT) {
            layer.textItem.contents = text;
            log("Set Text [" + layerName + "]: " + text);
        } else {
            log("WARN: Text layer not found or not text kind: " + layerName);
        }
    } catch (e) {
        log("ERROR setting text for " + layerName + ": " + e);
    }
}

// =============================================================================
// MAIN EXECUTION
// =============================================================================

function main() {
    // 1. Load Data
    if (!JOB_FILE.exists) {
        log("CRITICAL: active_job.txt not found at " + JOB_FILE);
        return;
    }

    JOB_FILE.open("r");
    var dataFilePath = JOB_FILE.readln();
    JOB_FILE.close();

    if (!dataFilePath) {
        log("CRITICAL: active_job.txt is empty.");
        return;
    }

    var data = readFile(dataFilePath);

    // 2. Open PSD
    if (!File(PSD_PATH).exists) {
        log("CRITICAL: PSD not found at " + PSD_PATH);
        return;
    }

    log("Opening PSD: " + PSD_PATH);
    app.open(File(PSD_PATH));
    var doc = app.activeDocument;

    // 3. Define Groups
    var frontGroup = findLayerByName(doc, "Front");
    var frontEdit  = findLayerByName(frontGroup, "Front edit");
    var blackGroup = findLayerByName(frontEdit, "Black");
    var colorGroup = findLayerByName(frontEdit, "color"); 
    if (!colorGroup) colorGroup = findLayerByName(frontEdit, "Color");

    // 4. Edit Black Layer
    if (blackGroup) {
        log("--- Editing Black Layer Group ---");
        setLayerText(blackGroup, "Top Micro Text", data["Top Micro Text"]);
        setLayerText(blackGroup, "Driver License Number", data["Driver License Number"]);
        setLayerText(blackGroup, "License Class", data["License Class"]);
        setLayerText(blackGroup, "Last Name", data["Last Name"]);
        setLayerText(blackGroup, "First Middle", data["First Middle"]);
        setLayerText(blackGroup, "Street Address Apt/Unit", data["Street Address Apt/Unit"]);
        setLayerText(blackGroup, "City State Zip", data["City State Zip"]);
        setLayerText(blackGroup, "Dob", data["Dob"]);
        setLayerText(blackGroup, "Sex", data["Sex"]);
        setLayerText(blackGroup, "Exp", data["Exp"]);
        var heightLayer = findLayerByName(blackGroup, "Height");
        updateHeightPreserve(heightLayer, data["Height"]);
        setLayerText(blackGroup, "Restriction = A, B, NONE", data["Restriction"]);
        setLayerText(blackGroup, "End = A, NONE", data["End"]);
        setLayerText(blackGroup, "Issue Date", data["Issue Date"]);
        setLayerText(blackGroup, "DD", data["DD"]);
        setLayerText(blackGroup, "Bottom Micro Text", data["Bottom Micro Text"]);
        setLayerText(blackGroup, "REPLACED DATE", data["REPLACED DATE"]);

        toggleLayerVisibility(blackGroup, "Safe Driver", (data["Safe Driver Black"] === "Visible"));

        // === SIGNATURE LOGIC (Image vs Text) ===
        var sigPath = data["Sig Path"];
        var sigText = data["Sig Text"];
        
        // If image exists, replace Smart Object & Hide Text. 
        // Else, set Text & Hide Smart Object.
        if (sigPath && File(sigPath).exists) {
            replaceSmartObject(blackGroup, "Signature", sigPath);
            toggleLayerVisibility(blackGroup, "Signature", true);       // Show Image
            toggleLayerVisibility(blackGroup, "Signature Text", false); // Hide Text
        } else {
            log("No Signature Image found. Attempting to set Signature Text: " + sigText);
            setLayerText(blackGroup, "Signature Text", sigText);
            toggleLayerVisibility(blackGroup, "Signature Text", true);  // Show Text
            toggleLayerVisibility(blackGroup, "Signature", false);      // Hide Image
        }
    } else {
        log("ERROR: 'Black' group not found.");
    }

    // 5. Edit Color Layer
    if (colorGroup) {
        log("--- Editing Color Layer Group ---");
        toggleLayerVisibility(colorGroup, "SAFE DRIVER", (data["Safe Driver Color"] === "Visible"));
        toggleLayerVisibility(colorGroup, "REAL ID STAR", (data["Real ID Star"] === "Visible"));
        
        var replacedVis = (data["Show Replaced"] === "Visible");
        toggleLayerVisibility(colorGroup, "REPLACED", replacedVis);
        // Fallback check
        // var objGroup = findLayerByName(frontEdit, "OBJECTS");
        // if (objGroup) toggleLayerVisibility(objGroup, "REPLACED", replacedVis);

        if (data["Face Path"]) {
            var photoGroup = findLayerByName(colorGroup, "PHOTO");
            if (photoGroup) {
                replaceFace(photoGroup, "PLACE PHOTO HERE copy", data["Face Path"]);
                replaceFace(photoGroup, "SM PHOTO FRONT copy", data["Face Path"]);
            }
        }
    } else {
        log("ERROR: 'Color' group not found.");
    }

    // =========================================================================
    // 6. EXPORT PROCESS (Strict Visibility)
    // =========================================================================
    log("--- Starting Export Process ---");

    var historyStateFilled = doc.activeHistoryState;

    // -------------------------------------------------------------------------
    // A. EXPORT FRONT COLOR ONLY (TIFF, RGB)
    // -------------------------------------------------------------------------
    try {
        // 1. Set Visibility: SHOW Color, HIDE Black
        colorGroup.visible = true;
        blackGroup.visible = false;

        // 2. Convert Profile (Adobe RGB 1998)
        doc.convertProfile("Adobe RGB (1998)", Intent.PERCEPTUAL, true, true);

        // 3. Save TIFF (No Layers, Transparent)
        var tiffOpts = new TiffSaveOptions();
        tiffOpts.imageCompression = TIFFEncoding.NONE; 
        tiffOpts.layers = false; 
        tiffOpts.transparency = true; // <--- ENABLE TRANSPARENCY
        
        var colorFile = new File(data["Output Color"]);
        doc.saveAs(colorFile, tiffOpts, true, Extension.LOWERCASE);
        log("Saved Front Color: " + data["Output Color"]);

    } catch(e) {
        log("ERROR saving Color: " + e);
    }

    // RESET STATE
    doc.activeHistoryState = historyStateFilled;

    // -------------------------------------------------------------------------
    // B. EXPORT FRONT BLACK ONLY (TIFF, Grayscale, Dot Grain)
    // -------------------------------------------------------------------------
    try {
        // 1. Set Visibility: HIDE Color, SHOW Black
        colorGroup.visible = false;
        blackGroup.visible = true;

        // 2. Convert to Grayscale
        doc.changeMode(ChangeMode.GRAYSCALE);
        
        // 3. Save TIFF (No Layers, Embed Profile, Transparent)
        var tiffOptsGray = new TiffSaveOptions();
        tiffOptsGray.imageCompression = TIFFEncoding.NONE; 
        tiffOptsGray.layers = false;
        tiffOptsGray.embedColorProfile = true; 
        tiffOptsGray.transparency = true; // <--- ENABLE TRANSPARENCY
        
        var blackFile = new File(data["Output Black"]);
        doc.saveAs(blackFile, tiffOptsGray, true, Extension.LOWERCASE);
        log("Saved Front Black: " + data["Output Black"]);

    } catch(e) {
        log("ERROR saving Black: " + e);
    }

    // RESET STATE
    doc.activeHistoryState = historyStateFilled;

    // 7. Finish
    // doc.close(SaveOptions.DONOTSAVECHANGES);
    log("Job Complete. Document Closed.");
    log("==================================================");
}

// Run
try {
    main();
} catch(e) {
    log("FATAL SCRIPT ERROR: " + e);
}