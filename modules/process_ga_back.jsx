/**
 * PROCESS GA BACK (JSX)
 * NOTE: Helper functions omitted per instructions. Paste them below main().
 */

#target photoshop

var SCRIPT_PATH = File($.fileName).parent.fsName;
var CFG_FILE  = new File(SCRIPT_PATH + "/../config.json");

var config = {};
if (CFG_FILE.exists) {
    CFG_FILE.open("r");
    var jsonString = CFG_FILE.read();
    CFG_FILE.close();
    config = eval("(" + jsonString + ")");
} else {
    throw "CRITICAL ERROR: config.json missing at " + CFG_FILE.fsName;
}

var ROOT_PATH = config.paths.base_dir;
if (ROOT_PATH.charAt(ROOT_PATH.length - 1) != "/" && ROOT_PATH.charAt(ROOT_PATH.length - 1) != "\\") {
    ROOT_PATH += "/";
}

var JOB_FILE  = new File(ROOT_PATH + "active_job.txt");
var LOG_DIR = new Folder(ROOT_PATH + "logs");
if (!LOG_DIR.exists) LOG_DIR.create();
var LOG_FILE = new File(LOG_DIR.fsName + "/process_ga_back_logs.txt");

function main() {
    initLog();
    log("Starting GA Back Process...");
    
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.POINTS; 
    app.displayDialogs = DialogModes.NO;

    try {
        if (!JOB_FILE.exists) throw "No active_job.txt found.";
        JOB_FILE.open("r");
        var dataPath = JOB_FILE.read();
        JOB_FILE.close();
        
        var dataFile = new File(dataPath);
        if (!dataFile.exists) throw "Data file not found: " + dataPath;
        var data = parseDataFile(dataFile);

        var NAME_BACK = config.filenames && config.filenames.ga_back ? config.filenames.ga_back : "GA Back Edit For Laser.psd";
        var PATH_BACK = findTemplatePath(NAME_BACK, ROOT_PATH);

        if (PATH_BACK) {
            log("Opening GA Back Template: " + PATH_BACK);
            openDocument(PATH_BACK, NAME_BACK);
            var doc = app.activeDocument;
            doc.activeHistoryState = doc.historyStates[0];

            var backGroup = getLayerSet(doc, "GEORGIA DRIVER LICENSE BACK");
            if (backGroup) {
                var barcodeGroup = getLayerSet(backGroup, "1, 2 Barcode");
                var textGroup = getLayerSet(backGroup, "4 Edit Text");

                if (textGroup) {
                    updateText(textGroup, "DOB EDIT", data["Dob"]);
                    updateText(textGroup, "ENDORSEMENTS EDIT", data["Endorsements"]);
                    updateText(textGroup, "RESTRICTIONS EDIT", data["Back Restrictions"]);
                    updateText(textGroup, "INV CONTROL NUMBER", data["Inv Control"]);
                }

                if (barcodeGroup) {
                    var bigBarcodePath = data["Load Big Barcode"];
                    if (bigBarcodePath && new File(bigBarcodePath).exists) {
                        replaceSmartObject(barcodeGroup, "1 Big Barcode", new File(bigBarcodePath));
                    }

                    var smallBarcodePath = data["Load Small Barcode"];
                    if (smallBarcodePath && new File(smallBarcodePath).exists) {
                        replaceSmartObject(barcodeGroup, "2 Small barcode", new File(smallBarcodePath));
                    }
                }
            }

            // --- EXPORT BACK LAYERS FOR LASER/LIGHTBURN ---
            try {
                log("--- Exporting GA Back Layers ---");
                var backDir = data["Output Dir Back"];
                var baseName = data["Base Name"];
                
                // Navigate hierarchy
                var mainGroupBack = doc.layerSets.getByName("GEORGIA DRIVER LICENSE BACK");
                var barcodeGroup = mainGroupBack.layerSets.getByName("1, 2 Barcode");

                // Map targets exactly as named in the layer structure
                var exportsBack = [
                    { target: barcodeGroup.artLayers.getByName("1 Big Barcode"), name: "1 Big Barcode" },
                    { target: barcodeGroup.artLayers.getByName("2 Small barcode"), name: "2 Small barcode" },
                    { target: mainGroupBack.layerSets.getByName("4 Edit Text"), name: "4 Edit Text" }
                ];

                for (var j = 0; j < exportsBack.length; j++) {
                    try {
                        var item = exportsBack[j];
                        var savePath = backDir + "/" +  item.name + ".png";
                        exportLayer(doc, item.target, savePath);
                    } catch(e) {
                        log("Skipped or missing back export layer: " + exportsBack[j].name);
                    }
                }
            } catch(e) {
                log("Error in back export routine: " + e);
            }
            
            log("--- Exporting GA Back PSD ---");
            // exportPNG(new File(backDir + "\\Back_" + baseName + ".png"));
            doc.saveAs(new File(backDir + "\\" + baseName + ".psd"));
            
            log("GA Back Processing Complete.");
        }
    } catch(e) {
        log("FATAL ERROR: " + e + " line: " + e.line);
    }
}

// =============================================================================
// HELPERS
// =============================================================================

function log(m) {
    LOG_FILE.open("a");
    var time = new Date().toTimeString().split(' ')[0];
    LOG_FILE.writeln("[" + time + "] " + m);
    LOG_FILE.close();
}

function sanitizeQuotes(s) {
    if (!s) return "";
    // FORCE ASCII QUOTES to fix "5 04"
    return s.replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace("’", ",").replace('”', '"');
}

function findTemplatePath(filename, root) {
    var psdFolderFile = new File(root + "PSDs/" + filename);
    if (psdFolderFile.exists) return psdFolderFile.fsName;
    var rootFile = new File(root + filename);
    if (rootFile.exists) return rootFile.fsName;
    return null;
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
        }
    } catch(e) { log("Height Preserve Error: " + e); }
}

function initLog() {
    LOG_FILE.open("w"); 
    LOG_FILE.write("--- NY BACK LOG START ---\n"); 
    LOG_FILE.close();
}

function applyHorizontalScale(amount) {
    try {
        log("Applying Horizontal Scale: " + amount + "%");
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("TxtS"));
        ref.putEnumerated(charIDToTypeID("TxLr"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);
        
        var textStyle = new ActionDescriptor();
        // 'HrzS' is the key for Horizontal Scale
        textStyle.putDouble(charIDToTypeID("HrzS"), amount);
        
        desc.putObject(charIDToTypeID("T   "), charIDToTypeID("TxtS"), textStyle);
        executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
    } catch(e) { log("Error setting horizontal scale: " + e); }
}

function applyTracking(amount) {
    try {
        log("Applying Tracking: " + amount);
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("TxtS"));
        ref.putEnumerated(charIDToTypeID("TxLr"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);
        
        var textStyle = new ActionDescriptor();
        textStyle.putInteger(charIDToTypeID("Trck"), amount);
        
        desc.putObject(charIDToTypeID("T   "), charIDToTypeID("TxtS"), textStyle);
        executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
    } catch(e) { log("Error setting tracking: " + e); }
}

/**
 * Hides all immediate children (layers and sets) within a LayerSet.
 */
function hideAllInSet(set) {
    if (!set) return;
    for (var i = 0; i < set.layers.length; i++) {
        set.layers[i].visible = false;
    }
}

/**
 * Shows a specific layer or group by name, even if nested.
 * @param {LayerSet} parent - The set to search in.
 * @param {string} name - The name of the layer/group to show.
 */
function showLayerPath(parent, name) {
    try {
        var layer = getLayerSet(parent, name);
        if (layer) {
            layer.visible = true;
            // Also ensure the parent is visible
            var p = layer.parent;
            while (p && p.typename !== "Document") {
                p.visible = true;
                p = p.parent;
            }
        } else {
            log("Warning: Could not find layer to show: " + name);
        }
    } catch(e) { log("Error in showLayerPath: " + e); }
}

function updateText(p, n, txt) {
    if(!p || !txt) return;
    try {
        var found = false;
        for(var i=0; i<p.artLayers.length; i++) {
            var l = p.artLayers[i];
            if(l.kind == LayerKind.TEXT && l.name.toLowerCase().indexOf(n.toLowerCase()) > -1) {
                var original = l.textItem.contents;
                l.textItem.contents = txt;
                var finalVal = l.textItem.contents;
                log("Update Text -> Layer: '" + l.name + "' | Org: " + original + " | New: " + txt + " | Final: " + finalVal);
                found = true;
                return;
            }
        }
        if(!found) log("WARNING: Text Layer matching '" + n + "' NOT FOUND in " + p.name);
    } catch(e) { log("Error updating text: " + e); }
}

function exportLayer(doc, group, savePath) {
    if (!group) return;

    // Helper for Action Manager
    function cTID(s) { return charIDToTypeID(s); }

    try {
        log("Fast Exporting: " + group.name);
        
        // 1. Set Active Layer (Required for the Action to target correct group)
        app.activeDocument = doc;
        doc.activeLayer = group;

        // 2. Determine temp document name from save path
        var f = new File(savePath);
        var tempDocName = f.name.replace(/\.[^\/.]+$/, ""); 

        // 3. Duplicate Layer to New Document (XTools Logic)
        var desc1 = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putClass(cTID('Dcmn'));
        desc1.putReference(cTID('null'), ref1);
        desc1.putString(cTID('Nm  '), tempDocName); // Dynamic Name
        var ref2 = new ActionReference();
        ref2.putEnumerated(cTID('Lyr '), cTID('Ordn'), cTID('Trgt'));
        desc1.putReference(cTID('Usng'), ref2);
        desc1.putInteger(cTID('Vrsn'), 5);
        executeAction(cTID('Mk  '), desc1, DialogModes.NO);

        // 4. Handle New Document
        var newDoc = app.activeDocument; // Focus switches automatically
        
        // // Optional: Trim ensures the PNG is tight to the content (fast on small docs)
        // newDoc.trim(TrimType.TRANSPARENT, true, true, true, true);

        // 5. Export and Close
        exportPNG(f);
        newDoc.close(SaveOptions.DONOTSAVECHANGES);

        // 6. Restore Focus to Original
        app.activeDocument = doc;

    } catch(e) { 
        log("Export Layer Error (" + group.name + "): " + e);
        // Safety: If we are stuck on the temp doc, close it
        if (app.documents.length > 0 && app.activeDocument != doc) {
             app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        }
    }
}

function replaceFace(parentSet, layerName, filePath, zoomAmount) {
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

            // Convert to percentage (x100) and apply zoom
            var scaleFactor = baseRatio * zoomAmount;

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

function replaceSmartObject(parentSet, layerName, fileRef, doBg) {
    if (!parentSet || !fileRef.exists) return;
    try {
        var foundLayer = null;
        var t = layerName.toLowerCase();
        for(var i=0; i<parentSet.layers.length; i++) {
            if(parentSet.layers[i].name.toLowerCase().indexOf(t) > -1) {
                foundLayer = parentSet.layers[i];
                break;
            }
        }
        if (foundLayer && foundLayer.kind == LayerKind.SMARTOBJECT) {
            log("Replacing SO: " + foundLayer.name);
            app.activeDocument.activeLayer = foundLayer;
            executeAction(stringIDToTypeID("placedLayerEditContents"), new ActionDescriptor(), DialogModes.NO);
            var soDoc = app.activeDocument;
            
            var idPlc = charIDToTypeID("Plc ");
            var desc = new ActionDescriptor();
            desc.putPath(charIDToTypeID("null"), fileRef);
            desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
            executeAction(idPlc, desc, DialogModes.NO);
            
            var newLayer = soDoc.activeLayer;
            var docW = soDoc.width.as("px"); var docH = soDoc.height.as("px");
            var bounds = newLayer.bounds; 
            var layerW = bounds[2].as("px")-bounds[0].as("px");
            var layerH = bounds[3].as("px")-bounds[1].as("px");
            var scaleX = (docW/layerW)*100; var scaleY = (docH/layerH)*100;
            newLayer.resize(scaleX, scaleY, AnchorPosition.MIDDLECENTER);
            
            if(doBg) {
                try {
                    var idautoCutout = stringIDToTypeID("autoCutout");
                    var desc2 = new ActionDescriptor();
                    desc2.putBoolean(stringIDToTypeID("sampleAllLayers"), false);
                    executeAction(idautoCutout, desc2, DialogModes.NO);
                    var idMk = charIDToTypeID("Mk  ");
                    var desc3 = new ActionDescriptor();
                    desc3.putClass(charIDToTypeID("Nw  "), charIDToTypeID("Chnl"));
                    var ref = new ActionReference();
                    ref.putEnumerated(charIDToTypeID("Chnl"), charIDToTypeID("Chnl"), charIDToTypeID("Msk "));
                    desc3.putReference(charIDToTypeID("At  "), ref);
                    desc3.putEnumerated(charIDToTypeID("Usng"), charIDToTypeID("UsrM"), charIDToTypeID("RvlS"));
                    executeAction(idMk, desc3, DialogModes.NO);
                } catch(e) {}
            }
            
            for(var j=soDoc.layers.length-1; j>=0; j--) {
                if(soDoc.layers[j] != newLayer) soDoc.layers[j].remove();
            }
            soDoc.close(SaveOptions.SAVECHANGES);
        }
    } catch(e) { log("Replace SO Error: " + e); }
}

function exportPNG(fileRef) {
    try {
        // 1. Ensure Directory Exists
        var folder = fileRef.parent;
        if (!folder.exists) {
            log("Directory missing. Creating: " + folder.fsName);
            folder.create();
        }

        // 2. Save
        var pngOpts = new PNGSaveOptions();
        pngOpts.compression = 9;
        pngOpts.interlaced = false;
        app.activeDocument.saveAs(fileRef, pngOpts, true, Extension.LOWERCASE);
    } catch(e) { 
        log("PNG Export Error: " + e + "\n- Path was: " + fileRef.fsName); 
    }
}

function openDocument(path, name) {
    if (!isDocumentOpen(name)) app.open(new File(path));
    else app.activeDocument = app.documents.getByName(name);
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
            var rawVal = parts.slice(1).join(":"); // Value including spaces
            
            // Default: Trim all leading/trailing spaces
            var val = rawVal.replace(/^\s+|\s+$/g, '');

            // FIX: Exception for 'DL 3 Chars' to preserve internal spacing
            // We only remove the first character (the separator space) and trim newlines at end
            if (key == "DL 3 Chars") {
                val = rawVal.replace(/^\s/, '').replace(/\s+$/, '');
            }

            data[key] = val;
        }
    }
    return data;
}

function getLayerSet(p, n) {
    try {
        var t = n.toLowerCase();
        for(var i=0; i<p.layers.length; i++) {
            if(p.layers[i].name.toLowerCase().indexOf(t) > -1) return p.layers[i];
        }
    } catch(e) {}
    return null;
}

main();