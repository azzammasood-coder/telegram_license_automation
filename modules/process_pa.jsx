/**
 * PROCESS PA LICENSE (JSX)
 * UPDATED: Detailed Logging + Export Fix + Document Stays Open
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
var LOG_FILE  = new File(ROOT_PATH + "logs/process_pa.log");
LOG_FILE.open("w");
LOG_FILE.close();

// Ensure logs folder exists
var logFolder = new Folder(ROOT_PATH + "logs");
if (!logFolder.exists) logFolder.create();

// PSD Selection
var PSD_NAME = (config.filenames && config.filenames.pa_psd) ? config.filenames.pa_psd : "FRONT PA POLY.psd";
var PSD_PATH = ROOT_PATH + "PSDs/" + PSD_NAME;

function log(msg) {
    LOG_FILE.open("a");
    LOG_FILE.writeln("[" + new Date().toLocaleString() + "] " + msg);
    LOG_FILE.close();
}

cTID = function(s) { return app.charIDToTypeID(s); };
sTID = function(s) { return app.stringIDToTypeID(s); };

log("==================================================");
log("SCRIPT STARTED: process_pa.jsx");

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
            log("Replacing Face Layer [" + layerName + "]...");
            app.activeDocument.activeLayer = foundLayer;
            executeAction(stringIDToTypeID("placedLayerEditContents"), new ActionDescriptor(), DialogModes.NO);

            var soDoc = app.activeDocument;
            var idPlc = charIDToTypeID("Plc ");
            var desc = new ActionDescriptor();
            desc.putPath(charIDToTypeID("null"), fileRef);
            desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
            executeAction(idPlc, desc, DialogModes.NO);

            var newLayer = soDoc.activeLayer;
            
            // --- SCALING LOGIC ---
            var docW = soDoc.width.as("px");
            var docH = soDoc.height.as("px");
            var bounds = newLayer.bounds;
            var layerW = bounds[2].as("px") - bounds[0].as("px");
            var layerH = bounds[3].as("px") - bounds[1].as("px");

            var ratioW = docW / layerW;
            var ratioH = docH / layerH;
            var baseRatio = Math.max(ratioW, ratioH);
            var scaleFactor = baseRatio * 110; 

            newLayer.resize(scaleFactor, scaleFactor, AnchorPosition.MIDDLECENTER);

            var newBounds = newLayer.bounds;
            var currentTopY = newBounds[1].as("px");
            newLayer.translate(0, -currentTopY);

            for (var j = soDoc.layers.length - 1; j >= 0; j--) {
                if (soDoc.layers[j] != newLayer) soDoc.layers[j].remove();
            }

            // =============================================================
            //  APPLY EXACT DROP SHADOW (FROM ACTION)
            // =============================================================
            try {
                var desc1 = new ActionDescriptor();
                var ref1 = new ActionReference();
                ref1.putProperty(cTID('Prpr'), cTID('Lefx'));
                ref1.putEnumerated(cTID('Lyr '), cTID('Ordn'), cTID('Trgt'));
                desc1.putReference(cTID('null'), ref1);
                var desc2 = new ActionDescriptor();
                desc2.putUnitDouble(cTID('Scl '), cTID('#Prc'), 1666.66666666667);
                var desc3 = new ActionDescriptor();
                desc3.putBoolean(cTID('enab'), true);
                desc3.putBoolean(sTID("present"), true);
                desc3.putBoolean(sTID("showInDialog"), true);
                desc3.putEnumerated(cTID('Md  '), cTID('BlnM'), cTID('Mltp'));
                var desc4 = new ActionDescriptor();
                desc4.putDouble(cTID('Rd  '), 32.2271423041821);
                desc4.putDouble(cTID('Grn '), 32.2268991172314);
                desc4.putDouble(cTID('Bl  '), 32.2271423041821);
                desc3.putObject(cTID('Clr '), sTID("RGBColor"), desc4);
                desc3.putUnitDouble(cTID('Opct'), cTID('#Prc'), 60);
                desc3.putBoolean(cTID('uglg'), true);
                desc3.putUnitDouble(cTID('lagl'), cTID('#Ang'), 90);
                desc3.putUnitDouble(cTID('Dstn'), cTID('#Pxl'), 71);
                desc3.putUnitDouble(cTID('Ckmt'), cTID('#Pxl'), 10);
                desc3.putUnitDouble(cTID('blur'), cTID('#Pxl'), 90);
                desc3.putUnitDouble(cTID('Nose'), cTID('#Prc'), 0);
                desc3.putBoolean(cTID('AntA'), false);
                var desc5 = new ActionDescriptor();
                desc5.putString(cTID('Nm  '), "Linear");
                desc3.putObject(cTID('TrnS'), cTID('ShpC'), desc5);
                desc3.putBoolean(sTID("layerConceals"), true);
                desc2.putObject(cTID('DrSh'), cTID('DrSh'), desc3);
                desc1.putObject(cTID('T   '), cTID('Lefx'), desc2);
                executeAction(cTID('setd'), desc1, DialogModes.NO);
                log("Applied Drop Shadow (Exact Settings).");
            } catch(e) {
                log("WARN: Failed to apply Drop Shadow: " + e);
            }
            // =============================================================

            soDoc.close(SaveOptions.SAVECHANGES);
            log("SUCCESS: Face processed [" + layerName + "]");

        } else {
            log("WARN: Face Layer [" + layerName + "] not found.");
        }
    } catch (e) {
        log("Error in replaceFace [" + layerName + "]: " + e);
        if (app.activeDocument != parentSet.parent) {
            try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (err) {}
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
    app.open(File(PSD_PATH));
    var doc = app.activeDocument;

    var frontGroup = findLayerByName(doc, "Front");
    var colorGroup = findLayerByName(frontGroup, "Color");
    var blackGroup = findLayerByName(frontGroup, "Black");
    var blackEdit  = findLayerByName(blackGroup, "Edit Text");

    // 1. Color Group Edits
    if (colorGroup) {
        log("--- Editing Color Group ---");
        setLayerText(colorGroup, "MICRO TOP", data["Micro Top"]);

        // Face Logic
        if (data["Face Path"] && File(data["Face Path"]).exists) {
             log("Processing Face Image: " + data["Face Path"]);
             
             replaceFace(colorGroup, "GHOST PIC", data["Face Path"]);

             var group2 = findLayerByName(colorGroup, "Group 2");
             if (group2) {
                 replaceFace(group2, "Layer 13", data["Face Path"]);
             } else {
                 log("WARN: 'Group 2' not found for Layer 13 face replacement");
             }
        }
        
        // --- REAL ID LOGIC (Strict Toggle) ---
        var isRealID = (data["Real ID"] == "YES");

        // 1. Color Group (STAR)
        if (colorGroup) {
            var starLayer = findLayerByName(colorGroup, "star");
            if (starLayer) {
                starLayer.visible = isRealID; // YES=Visible, NO=Hidden
                log("Set 'star' visibility: " + isRealID);
            }
        }

        // 2. Black Group (Not Visible)
        if (blackGroup) {
            var notVisLayer = findLayerByName(blackGroup, "Not Visible");
            if (notVisLayer) {
                // STRICT TOGGLE: YES -> Hidden (false) | NO -> Visible (true)
                notVisLayer.visible = !isRealID; 
                log("Set 'Not Visible' layer visibility: " + !isRealID);
            }
        }

    } else {
        log("CRITICAL: 'Color' Group not found!");
    }

    // 2. Black Group Edits
    if (blackEdit) {
        log("--- Editing Black Group (Edit Text) ---");
        setLayerText(blackEdit, "TOP MICRO INITIALS- FIRST NAME INITIAL / LAST NAME INITIAL/ BIRTH YEAR LAST TWO DIGITS", data["Top Micro Initials"]);
        setLayerText(blackEdit, "DL", data["DL"]);
        setLayerText(blackEdit, "DOB", data["DOB"]);
        setLayerText(blackEdit, "LAST NAME", data["Last Name"]);
        setLayerText(blackEdit, "FIRST MIDDLE", data["First Middle"]);
        setLayerText(blackEdit, "STREET 1", data["Street 1"]);
        setLayerText(blackEdit, "CITY STATE ZIP", data["City State Zip"]);
        setLayerText(blackEdit, "EXP DATE", data["Exp Date"]);
        setLayerText(blackEdit, "ISS DATE", data["Iss Date"]);
        setLayerText(blackEdit, "Sex", data["Sex"]);
        setLayerText(blackEdit, "EYE COLOR", data["Eye Color"]);
        setLayerText(blackEdit, "HEIGHT", data["Height"]);
        setLayerText(blackEdit, "CLASS", data["Class"]);
        setLayerText(blackEdit, "DD LINE 1", data["DD Line 1"]);
        setLayerText(blackEdit, "DD LINE 2", data["DD Line 2"]);
        setLayerText(blackEdit, "BOTTOM MICRO INITIALS- FIRST NAME INITIAL / LAST NAME INITIAL/ BIRTH YEAR LAST TWO DIGITS", data["Bottom Micro Initials"]);
        
        // --- Signature Logic (Image vs Text with Positioning) ---
        log("--- Processing Signature ---");
        var sigImgLayer = findLayerByName(blackEdit, "Sig");
        var sigTxtLayer = findLayerByName(blackEdit, "Signature Text");
        var useSigImg = (data["Use Sig Image"] == "TRUE");
        
        var targetX = 241;
        var targetY = 2155;

        if (useSigImg) {
            if (sigImgLayer && File(data["Sig Path"]).exists) {
                replaceSmartObject(blackEdit, "Sig", data["Sig Path"]);
                sigImgLayer.visible = true;
                log("Visible: Sig Image");
            }
            if (sigTxtLayer) sigTxtLayer.visible = false;
        } else {
            if (sigTxtLayer) {
                // 1. Update Content
                var oldSig = sigTxtLayer.textItem.contents;
                sigTxtLayer.textItem.contents = data["Sig Text"];
                
                // 2. Position Top-Left at X:241, Y:2153
                // Get current bounds [left, top, right, bottom]
                var curBounds = sigTxtLayer.bounds;
                var curX = curBounds[0].as("px");
                var curY = curBounds[1].as("px");
                
                // Calculate movement needed
                var deltaX = targetX - curX;
                var deltaY = targetY - curY;
                
                sigTxtLayer.translate(deltaX, deltaY);
                
                sigTxtLayer.visible = true;
                log("Visible: Sig Text (Updated '" + oldSig + "' -> '" + data["Sig Text"] + "')");
                log("Positioned Sig Text to X: " + targetX + ", Y: " + targetY);
            }
            if (sigImgLayer) sigImgLayer.visible = false;
        }
    } else {
        log("CRITICAL: 'Edit Text' Group not found in Black!");
    }

    // Real ID Black Logic (Not Visible)
    if (blackGroup) {
        var notVis = findLayerByName(blackGroup, "Not Visible");
        if (notVis) {
            notVis.visible = (data["Real ID"] == "NO");
            log("Set 'Not Visible' layer visibility to: " + notVis.visible);
        } else {
            log("WARN: 'Not Visible' layer not found in Black group.");
        }
    }

    // ================= EXPORT =================
    log("--- Starting Export Process ---");
    var historyState = doc.activeHistoryState;

    // 1. Export Color (TIFF sRGB)
    try {
        log("Configuring for Color Export...");
        colorGroup.visible = true;
        blackGroup.visible = false;

        // FIXED: Replaced Intent.MICROSOFTICM with Intent.RELATIVECOLORIMETRIC
        log("Converting Profile to sRGB IEC61966-2.1 (Relative Colorimetric)...");
        doc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, true);

        var tiffOpts = new TiffSaveOptions();
        tiffOpts.imageCompression = TIFFEncoding.NONE;
        tiffOpts.layers = false;
        tiffOpts.transparency = true;

        var colorFile = new File(data["Output Color"]);
        log("Saving Color TIFF to: " + colorFile.fsName);
        doc.saveAs(colorFile, tiffOpts, true, Extension.LOWERCASE);
        log("SUCCESS: Color Exported.");
    } catch(e) { 
        log("ERROR during Color Export: " + e); 
    }

    // 2. Export Black (PNG sRGB)
    try {
        log("Configuring for Black Export...");
        colorGroup.visible = false;
        blackGroup.visible = true;
        // Ensure Edit Text is visible
        if(blackEdit) blackEdit.visible = true;

        // FIXED: Replaced Intent.MICROSOFTICM with Intent.RELATIVECOLORIMETRIC
        log("Converting Profile to sRGB IEC61966-2.1 (Relative Colorimetric)...");
        doc.convertProfile("sRGB IEC61966-2.1", Intent.RELATIVECOLORIMETRIC, true, true);

        var pngOpts = new PNGSaveOptions();
        pngOpts.compression = 0;
        pngOpts.interlaced = false;

        var blackFile = new File(data["Output Black"]);
        log("Saving Black PNG to: " + blackFile.fsName);
        doc.saveAs(blackFile, pngOpts, true, Extension.LOWERCASE);
        log("SUCCESS: Black Exported.");
    } catch(e) { 
        log("ERROR during Black Export: " + e); 
    }

    log("Reverting History State...");
    doc.activeHistoryState = historyState; // Undo

    // Force Black group to be visible in the workspace after script ends
    if (blackGroup) blackGroup.visible = true; 
    if (colorGroup) colorGroup.visible = true; // Set both to true if you want a layered view

    // doc.close(SaveOptions.DONOTSAVECHANGES);
    log("==================================================");
}

try { main(); } catch(e) { log("FATAL SCRIPT ERROR: " + e); }