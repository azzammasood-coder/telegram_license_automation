/**
 * PROCESS GA FRONT (JSX)
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
var LOG_FILE = new File(LOG_DIR.fsName + "/process_ga_front_logs.txt");

function main() {
    initLog();
    log("Starting GA Front Process...");
    
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

        var NAME_FRONT = config.filenames && config.filenames.ga_front ? config.filenames.ga_front : "GA Front Edit For Laser.psd";
        var PATH_FRONT = findTemplatePath(NAME_FRONT, ROOT_PATH);

        if (PATH_FRONT) {
            log("Opening GA Front Template: " + PATH_FRONT);
            openDocument(PATH_FRONT, NAME_FRONT);
            var doc = app.activeDocument;
            doc.activeHistoryState = doc.historyStates[0];

            var frontGroup = getLayerSet(doc, "FRNT");
            if (frontGroup) {
                var textEditGroup = getLayerSet(frontGroup, "4 TEXT EDIT");
                var raisedGroup = getLayerSet(frontGroup, "5 Raised"); 
                var photoGroup = getLayerSet(frontGroup, "6 Big Photo");
                var lensGroup = getLayerSet(frontGroup, "7,8 Lens");

                // Process 4 TEXT EDIT
                if (textEditGroup) {
                    updateText(textEditGroup, "DD", data["DD"]);
                    updateText(textEditGroup, "CLASS", data["Class"]);
                    updateText(textEditGroup, "EXP DATE", data["Exp Date"]);
                    updateText(textEditGroup, "FIRST MIDDLE", data["First Middle"]);
                    updateText(textEditGroup, "STREET ADDRESS", data["Address 1"]);
                    updateText(textEditGroup, "CITY STATE ZIP PLUS 4", data["City State Zip"]);
                    updateText(textEditGroup, "COUNTY", data["County"]);
                    updateText(textEditGroup, "RESTRICTIONS", data["Restrictions"]);
                    updateText(textEditGroup, "ENDORSEMENTS", data["Endorsements"]);
                    updateText(textEditGroup, "ISSUE DATE", data["Issue Date"]);
                    updateText(textEditGroup, "SEX", data["Gender"]);
                    updateText(textEditGroup, "FEET", data["Feet"]);
                    updateText(textEditGroup, "INCHES", data["Inches"]);
                    updateText(textEditGroup, "EYES", data["Eyes"]);
                    updateText(textEditGroup, "WGT", data["Weight"]);
                }

                // Process 5 Raised (contains text and signature)
                if (raisedGroup) {
                    updateText(raisedGroup, "DRIVERS LICENSE", data["DL"]);
                    updateText(raisedGroup, "DOB", data["Dob"]);
                    updateText(raisedGroup, "LAST NAME", data["Last Name"]);
                    
                    var sigPath = data["Load Signature Image"];
                    var sigTextVal = data["Signature Text"];
                    
                    // Corrected layer targeting based on your structure
                    var sigImgLayer = getLayerSet(raisedGroup, "SIGNATURE EDIT"); 
                    var sigTextLayer = getLayerSet(raisedGroup, "Signature Text");
                    
                    if (sigPath && new File(sigPath).exists) {
                        log("Using Signature Image");
                        if (sigTextLayer) sigTextLayer.visible = false;
                        if (sigImgLayer) {
                            sigImgLayer.visible = true;
                            replaceSmartObject(raisedGroup, "SIGNATURE EDIT", new File(sigPath), true);
                        }
                    } else {
                        log("Using Signature Text Fallback: " + sigTextVal);
                        if (sigImgLayer) sigImgLayer.visible = false;
                        if (sigTextLayer) {
                            sigTextLayer.visible = true;
                            if (sigTextLayer.kind == LayerKind.TEXT) {
                                sigTextLayer.textItem.contents = sigTextVal;
                            }
                        }
                    }
                }

                // Process Lens Text
                if (lensGroup) {
                    updateText(lensGroup, "8 Dob Lens", data["Dob"]);
                }

                // Process Face Placements
                var facePath = data["Load Face Image"];
                if (facePath && new File(facePath).exists) {
                    if (photoGroup) replaceFace(photoGroup, "Big Photo", new File(facePath), 100);
                    if (lensGroup) replaceFace(lensGroup, "7 Lens Photo", new File(facePath), 100);
                }
            }

            // --- EXPORT FRONT LAYERS FOR LASER/LIGHTBURN ---
            try {
                log("--- Exporting GA Front Layers ---");
                var frontDir = data["Output Dir Front"];
                var baseName = data["Base Name"];
                
                // Navigate hierarchy
                var mainGroup = doc.layerSets.getByName("FRNT");
                var lensGroup = mainGroup.layerSets.getByName("7,8 Lens");

                // Map targets exactly as named in the layer structure
                var exportsFront = [
                    { target: mainGroup.layerSets.getByName("2 Do Not Touch"), name: "2 Do Not Touch" },
                    { target: mainGroup.layerSets.getByName("3 Star"), name: "3 Star" },
                    { target: mainGroup.layerSets.getByName("4 TEXT EDIT"), name: "4 Text Edit" },
                    { target: mainGroup.layerSets.getByName("5 Raised "), name: "5 Raised" }, // Note the space in your structure
                    { target: mainGroup.layerSets.getByName("6 Big Photo"), name: "6 Big Photo" },
                    { target: lensGroup.artLayers.getByName("7 Lens Photo"), name: "7 Lens Photo" },
                    { target: lensGroup.artLayers.getByName("8 Dob Lens"), name: "8 Dob Lens" }
                ];

                for (var i = 0; i < exportsFront.length; i++) {
                    try {
                        var item = exportsFront[i];
                        var savePath = frontDir + "/" + item.name + ".png";
                        exportLayer(doc, item.target, savePath);
                    } catch(e) {
                        log("Skipped or missing front export layer: " + exportsFront[i].name);
                    }
                }
            } catch(e) {
                log("Error in front export routine: " + e);
            }

            // Export PSD    
            log("--- Exporting GA Front PSD ---");        
            // exportPNG(new File(frontDir + "\\Front_" + baseName + ".png"));
            doc.saveAs(new File(frontDir + "\\" + baseName + ".psd"));
            
            log("GA Front Processing Complete.");
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
    LOG_FILE.write("--- NY FRONT LOG START ---\n"); 
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