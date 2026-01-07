/**
 * PROCESS LICENSE (JSX)
 * Features: Smart Object Replacement, Hyphenation Fix, Custom Signature Image Support
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
var LOG_FILE  = new File(ROOT_PATH + "photoshop_log.txt");

var PSD_NAME = config.filenames ? config.filenames.nj_psd : "AUTOMATED NJ F AND B.psd";
var PSD_PATH = ROOT_PATH + "PSDs/" + PSD_NAME;

function main() {
    initLog();
    log("------------------------------------------");
    log("Script Triggered by Python");

    // Store settings
    var originalRulerUnits = app.preferences.rulerUnits;
    app.preferences.rulerUnits = Units.PIXELS;

    try {
        // 1. READ JOB TICKET
        if (!JOB_FILE.exists) throw "No active_job.txt found.";
        JOB_FILE.open("r");
        var dataPath = JOB_FILE.read();
        JOB_FILE.close();
        
        var dataFile = new File(dataPath);
        if (!dataFile.exists) throw "Data file not found: " + dataPath;
        log("Processing Data File: " + dataFile.name);

        // 2. PARSE DATA
        var data = parseDataFile(dataFile);
        
        // 3. OPEN / ACTIVATE TEMPLATE
        if (!isDocumentOpen(PSD_NAME)) {
            if (new File(PSD_PATH).exists) {
                log("Opening template: " + PSD_NAME);
                app.open(new File(PSD_PATH));
            } else {
                throw "Template missing at: " + PSD_PATH;
            }
        }
        app.activeDocument = app.documents.getByName(PSD_NAME);
        var doc = app.activeDocument;

        // 4. RESET STATE (History Revert to Open)
        // We do this at the start to ensure a clean slate, but NOT at the end.
        log("Resetting to original state...");
        doc.activeHistoryState = doc.historyStates[0];

        // 5. PROCESS FRONT
        log("--- Updating Front Layers ---");
        
        // Root group navigation
        var njPrint = getLayerSet(doc, "NJ PRINT");
        var front   = getLayerSet(njPrint, "FRONT");
        var color   = getLayerSet(front, "COLOR");
        var black   = getLayerSet(front, "BLACK");
        var info    = getLayerSet(black, "Infomation");

        // --- SECTION A: COLOR GROUP UPDATES ---
        log("Updating Color group items...");
        var dlNumGroup = getLayerSet(color, "DL NUMBER + dob");
        if (dlNumGroup) {
            updateText(dlNumGroup, "DL edit", data["DL edit"]);
            updateText(dlNumGroup, "DOB edit", data["Dob"]); // Sync DOB on front as well
        }
        setVisibility(color, "Real ID Marker", data["Real ID Marker"]);

        // --- SECTION B: INFORMATION (BLACK) GROUP UPDATES ---
        log("Updating Information group items...");
        
        // Raw Data Elements
        updateText(info, "DD", data["DD"]);
        
        // Identity Elements
        updateText(info, "Last Edit", data["Last Edit"]);
        updateText(info, "First Edit", data["First Edit"]);
        updateText(info, "Address Edit", data["Address Edit"]);
        updateText(info, "City state zip edit", data["City state zip edit"]);
        
        // Physical & Class Elements
        updateText(info, "Class edit", data["Class edit"]);
        updateText(info, "Issue edit", data["Issue edit"]);
        updateText(info, "Expires edit", data["Expires edit"]);
        updateText(info, "Sex edit", data["Sex edit"]);
        updateText(info, "Eyes edit", data["Eyes edit"]);
        updateText(info, "Height edit", data["Height edit"]);
        updateText(info, "End edit", data["End edit"]);
        updateText(info, "Restriction edit", data["Restriction edit"]);
        
        // --- SIGNATURE LOGIC ---
        var sigImgPath = data["Load Signature Image"];
        
        // Target layers within the 'Infomation' group
        var sigTextLayer = info.artLayers.getByName("Signature edit");
        var sigImgLayer = null;
        try { sigImgLayer = info.artLayers.getByName("Signature image"); } catch(e) {}

        if (sigImgPath && new File(sigImgPath).exists) {
            log("Processing Custom Signature Image...");
            
            // 1. Hide the Text Layer
            sigTextLayer.visible = false;
            
            // 2. Show and Replace Image Layer
            if (sigImgLayer) {
                sigImgLayer.visible = true;
                if (sigImgLayer.kind == LayerKind.SMARTOBJECT) {
                    // This helper opens the SO, places the new image, fits it, deletes old content, saves & closes
                    replaceSmartObject(info, "Signature image", new File(sigImgPath));
                } else {
                    log("Warning: 'Signature image' layer exists but is not a Smart Object.");
                }
            } else {
                log("Error: 'Signature image' Smart Object not found.");
            }

        } else {
            // Default: Use Text Signature
            log("Using Text Signature...");
            
            // 1. Show Text Layer
            sigTextLayer.visible = true;
            
            // 2. Hide Image Layer (if it exists)
            if (sigImgLayer) {
                sigImgLayer.visible = false;
            }
            
            // 3. Update Text Content
            updateText(info, "Signature edit", data["Signature Edit"]);
            
            // 4. Fit Text to Box
            try { 
                fitLayerToBox(sigTextLayer, 9697, 3304, 10789, 3667); 
                log("Signature text resized.");
            } catch(e) { log("Sig Resize Warning: " + e); }
        }

        // --- FACE PICTURE LOGIC ---
        var facePath = data["Load Face Image"];
        var njBgLayer = null;
        
        // "NJ BG" is inside the FRONT group (variable 'front')
        try { njBgLayer = front.artLayers.getByName("NJ BG"); } catch(e) {}

        if (facePath && new File(facePath).exists && njBgLayer) {
            log("Processing Face Image...");
            
            // 1. Open "NJ BG" Smart Object
            app.activeDocument.activeLayer = njBgLayer;
            executeAction(stringIDToTypeID("placedLayerEditContents"), new ActionDescriptor(), DialogModes.NO);
            
            var bgDoc = app.activeDocument; // We are now inside the NJ BG smart object
            
            try {
                // 2. Replace "Big Photo edit" (Top Level)
                log("Replacing Big Photo...");
                replaceSmartObject(bgDoc, "Big Photo edit", new File(facePath));

                // 3. Replace "Ghost Photo edit" (Nested: New Jersey "State" > Photo > Photo)
                var g1 = getLayerSet(bgDoc, "New Jersey \"State\"");
                if (g1) {
                    var g2 = getLayerSet(g1, "Photo");
                    if (g2) {
                        var g3 = getLayerSet(g2, "Photo");
                        if (g3) {
                            log("Replacing Ghost Photo...");
                            replaceSmartObject(g3, "Ghost Photo edit", new File(facePath));
                        }
                    }
                }
            } catch(err) {
                log("Error processing face inside NJ BG: " + err);
            }

            // 4. Save & Close "NJ BG"
            bgDoc.close(SaveOptions.SAVECHANGES);
            log("Closed NJ BG.");
        }

        // --- MICRO LOGIC ---
        // Requirement: Last Initial, last digit in dob year, F initial, 2nd to last digit in dob year
        try {
            var firstName = data["First Edit"] || "";
            var lastName = data["Last Edit"] || "";
            var dob = data["Dob"] || ""; // Format: MM/DD/YYYY

            // 1. Get Initials
            var fInitial = firstName.charAt(0).toUpperCase();
            var lInitial = lastName.charAt(0).toUpperCase();

            // 2. Get Year Digits
            var dobDigits = dob.replace(/\D/g, ""); 
            var microResult = "ERROR";

            if (dobDigits.length >= 8) {
                var lastDigitYear = dobDigits.charAt(7);      // Last digit of YYYY
                var secondLastDigitYear = dobDigits.charAt(6); // 2nd to last digit of YYYY
                
                // Construct string
                microResult = lInitial + lastDigitYear + fInitial + secondLastDigitYear;
            }

            var microLayerName = "Micro = Last Initial, last digit in dob year, F initial, 2nd to last digit in dob year";
            updateText(info, microLayerName, microResult);
            log("Micro updated to: " + microResult);

        } catch(e) {
            log("Micro Update Error: " + e);
        }

        // Visibility Logic
        setVisibility(info, "Not For Real Id", data["Not For Real Id"]);
        setVisibility(info, "Chief Sig July 1 2022 +", data["Chief Sig July 1 2022 +"]);
        setVisibility(info, "Chief Administrator +", data["Chief Administrator +"]);
        setVisibility(info, "Chief Sig July 1 2022 -", data["Chief Sig July 1 2022 -"]);
        setVisibility(info, "Chief administrator -", data["Chief administrator -"]);

        // 6. PROCESS BACK
        log("--- Updating Back Layers ---");
        var back      = getLayerSet(njPrint, "BACK");
        var backBlack = getLayerSet(back, "Black");
        var editable  = getLayerSet(backBlack, "EDITABLE");
        var barcodes  = getLayerSet(backBlack, "BARCODES");

        updateText(editable, "Ic Line 1", data["Ic Line 1"]);
        updateText(editable, "Ic Line 2", data["Ic Line 2"]);
        updateText(editable, "Dob", data["Dob"]);

        // 7. PLACE BARCODES
        var pathBig = data["Load Big Barcode"];
        var pathSmall = data["Load Small Barcode"];
        
        if (pathBig && new File(pathBig).exists) {
            log("Placing Big Barcode...");
            replaceSmartObject(barcodes, "Big barcode", new File(pathBig));
        }

        if (pathSmall && new File(pathSmall).exists) {
            log("Placing Small Barcode...");
            replaceSmartObject(barcodes, "Small Barcode", new File(pathSmall));
        }

        // 8. SAVE PSD COPY
        var psdOut = data["Output PSD"];
        if (psdOut) {
            log("Saving User PSD...");
            savePSD(psdOut);
        }

        // 9. TRIM & EXPORT
        var frontOut = data["Output Front"];
        var backOut  = data["Output Back"];
        
        // Snapshot the state BEFORE any trimming (Full Canvas)
        var stateBeforeTrim = doc.activeHistoryState;

        // --- EXPORT FRONT ---
        log("Exporting Front...");
        front.visible = true; 
        back.visible = false;
        doc.trim(TrimType.TRANSPARENT, true, true, true, true);
        exportPNG(frontOut);
        
        // Revert to full canvas
        doc.activeHistoryState = stateBeforeTrim;

        // --- EXPORT BACK ---
        log("Exporting Back...");
        front.visible = false; 
        back.visible = true;
        doc.trim(TrimType.TRANSPARENT, true, true, true, true);
        exportPNG(backOut);

        // 10. FINAL CLEANUP (Crucial Step)
        log("Final Revert...");
        
        // 1. Undo the last Trim action to return to Full Canvas
        doc.activeHistoryState = stateBeforeTrim;
        
        // 2. Explicitly set visibility for the final open state
        front.visible = true; 
        back.visible = true; 
        
        app.preferences.rulerUnits = originalRulerUnits;
        log("SUCCESS: Job Completed."); 

    } catch(e) {
        log("CRITICAL ERROR: " + e + " (Line: " + e.line + ")");
        app.preferences.rulerUnits = originalRulerUnits;
    }
}

// =============================================================================
// HELPERS
// =============================================================================

function replaceSmartObject(parentSet, layerName, fileRef) {
    // 1. Validate inputs
    if (!parentSet || !fileRef.exists) return;

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

function fitLayerToBox(layer, x1, y1, x2, y2) {
    var bounds = layer.bounds;
    var curW = bounds[2].value - bounds[0].value;
    var curH = bounds[3].value - bounds[1].value;
    var targetW = x2 - x1;
    var targetH = y2 - y1;
    var ratioX = targetW / curW;
    var ratioY = targetH / curH;
    var scale = Math.min(ratioX, ratioY);
    
    if (scale < 1) {
        layer.resize(scale * 100, scale * 100, AnchorPosition.MIDDLECENTER);
        bounds = layer.bounds;
        curW = bounds[2].value - bounds[0].value;
        curH = bounds[3].value - bounds[1].value;
    }
    
    var boxCenterX = (x1 + x2) / 2;
    var boxCenterY = (y1 + y2) / 2;
    var layerCenterX = bounds[0].value + (curW / 2);
    var layerCenterY = bounds[1].value + (curH / 2);
    
    layer.translate(boxCenterX - layerCenterX, boxCenterY - layerCenterY);
}

function isDocumentOpen(name) {
    for (var i = 0; i < app.documents.length; i++) if (app.documents[i].name == name) return true;
    return false;
}

function parseDataFile(file) {
    file.open("r");
    var content = file.read();
    file.close();
    var lines = content.split('\n');
    var data = {};
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line.indexOf(":") > -1) {
            var parts = line.split(":");
            var key = parts[0].replace(/^\s+|\s+$/g, '');
            var val = parts.slice(1).join(":").replace(/^\s+|\s+$/g, '');
            data[key] = val;
        }
    }
    return data;
}

function getLayerSet(p, n) {
    try {
        var t = n.toLowerCase();
        for(var i=0; i<p.layers.length; i++) if(p.layers[i].name.toLowerCase() == t) return p.layers[i];
    } catch(e) {}
    log("Warning: Group '" + n + "' not found.");
    return null;
}

function updateText(p, n, txt) {
    if(!p) return;
    try {
        var t = n.toLowerCase();
        for(var i=0; i<p.artLayers.length; i++) {
            var l = p.artLayers[i];
            if(l.name.toLowerCase() == t && l.kind == LayerKind.TEXT) {
                if(txt && txt !== "undefined") {
                    l.textItem.contents = txt;
                    // Disable Paragraph Hyphenation to remove auto-dashes
                    if (l.textItem.kind == TextType.PARAGRAPHTEXT) {
                        l.textItem.hyphenation = false;
                    }
                }
                return;
            }
        }
    } catch(e) { log("Text Update Error on " + n + ": " + e); }
}

function setVisibility(p, n, s) {
    if(!p) return;
    try {
        var t = n.toLowerCase();
        var v = (s && s.toString().toLowerCase() == "visible");
        for(var i=0; i<p.artLayers.length; i++) {
            if(p.artLayers[i].name.toLowerCase() == t) {
                p.artLayers[i].visible = v;
                return;
            }
        }
    } catch(e) {}
}

function savePSD(path) {
    try {
        var f = new File(path);
        var o = new PhotoshopSaveOptions();
        o.layers = true;
        o.alphaChannels = true;
        o.embedColorProfile = true;
        app.activeDocument.saveAs(f, o, true, Extension.LOWERCASE);
        log("Saved PSD.");
    } catch(e) { log("Error saving PSD: " + e); }
}

function exportPNG(path) {
    try {
        var f = new File(path);
        var o = new ExportOptionsSaveForWeb();
        o.format = SaveDocumentType.PNG;
        o.PNG8 = false;
        o.transparency = true;
        o.quality = 100;
        app.activeDocument.exportDocument(f, ExportType.SAVEFORWEB, o);
        log("Saved PNG: " + f.name);
    } catch(e) { log("Error exporting PNG: " + e); }
}

function initLog() {
    LOG_FILE.open("w"); LOG_FILE.write(""); LOG_FILE.close();
}

function log(m) {
    LOG_FILE.open("a");
    var time = new Date().toTimeString().split(' ')[0];
    LOG_FILE.writeln("[" + time + "] " + m);
    LOG_FILE.close();
}

main();