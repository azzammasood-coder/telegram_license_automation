/**
 * PROCESS TX FRONT (JSX)
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
var LOG_FILE = new File(LOG_DIR.fsName + "/process_tx_front_logs.txt");

function main() {
    initLog();
    log("Starting TX Front Process...");
    
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

        var NAME_FRONT = config.filenames && config.filenames.tx_front ? config.filenames.tx_front : "TX Front.psd";
        var PATH_FRONT = findTemplatePath(NAME_FRONT, ROOT_PATH);

        if (PATH_FRONT) {
            log("Opening TX Front Template: " + PATH_FRONT);
            openDocument(PATH_FRONT, NAME_FRONT);
            var doc = app.activeDocument;
            doc.activeHistoryState = doc.historyStates[0];

            var boldGroup = getLayerSet(doc, "1 Bold Text");
            var lightGroup = getLayerSet(doc, "2 Light Text"); 
            var raisedGroup = getLayerSet(doc, "3 Raised Text");
            var pikGroup = getLayerSet(doc, "4,5,Pik");
            var lensGroup = getLayerSet(doc, "6, 7 Lens");

            // Process 1 Bold Text
            if (boldGroup) {
                var sigImgLayer = getLayerSet(boldGroup, "SIGNATURE IMAGE");
                var sigTextLayer = getLayerSet(boldGroup, "SIGNATURE TEXT");
                var sigPath = data["Load Signature Image"];
                var sigTextVal = data["Signature Text"];

                if (sigPath && new File(sigPath).exists) {
                    log("Using Signature Image");
                    if (sigTextLayer) sigTextLayer.visible = false;
                    if (sigImgLayer) {
                        sigImgLayer.visible = true;
                        replaceSmartObject(boldGroup, "SIGNATURE IMAGE", new File(sigPath), true);
                    }
                } else {
                    log("Using Signature Text: " + sigTextVal);
                    if (sigImgLayer) sigImgLayer.visible = false;
                    if (sigTextLayer) {
                        sigTextLayer.visible = true;
                        updateText(boldGroup, "SIGNATURE TEXT", sigTextVal);
                    }
                }

                updateText(boldGroup, "DD", data["DD"]);
                updateText(boldGroup, "EYES", data["Eyes"]);
                updateText(boldGroup, "SEX", data["Gender"]);
                updateText(boldGroup, "HEIGHT", data["Feet"] + "'-" + data["Inches"] + '"');
                updateText(boldGroup, "ENDORSEMENT", data["Endorsements"]);
                updateText(boldGroup, "RESTRICTION", data["Restrictions"]);
                updateText(boldGroup, "ADDRESS FIRST LINE", data["Address 1"]);
                updateText(boldGroup, "ADDRESS SECOND LINE", data["City State Zip"]);
                updateText(boldGroup, "ISSUE", data["Issue Date"]);
                updateText(boldGroup, "EXPIRY", data["Exp Date"]);
                updateText(boldGroup, "DOB", data["Dob"]);
                updateText(boldGroup, "CLASS", data["Class"]);
            }

            // Process 3 Raised Text
            if (raisedGroup) {
                updateText(raisedGroup, "FIRST AND MIDDLE", data["First Middle"]);
                updateText(raisedGroup, "LAST NAME", data["Last Name"]);
                updateText(raisedGroup, "DL", data["DL"]);
            }

            // Process 2 Light Text -> Micro Text
            if (lightGroup) {
                var microGroup = getLayerSet(lightGroup, "Micro Text");
                if (microGroup) {
                    var dobStr = data["Dob"] || "";
                    // Remove any slashes or non-digit characters to format as MMDDYYYY
                    dobStr = dobStr.replace(/[^0-9]/g, "");
                    updateText(microGroup, "DOB SMALL", dobStr);
                }
            }

            // Process Face Placements
            var facePath = data["Load Face Image"];
            if (facePath && new File(facePath).exists) {
                if (pikGroup) replaceFace(pikGroup, "5 Big Pik", new File(facePath), 100);
                if (lensGroup) {
                    replaceFace(lensGroup, "6 Lens pik", new File(facePath), 100);
                }
            }

            if (lensGroup) {
                updateText(lensGroup, "7 lens dob", data["Dob"]);
            }

            // --- EXPORT FRONT LAYERS FOR LASER/LIGHTBURN ---
            try {
                log("--- Exporting TX Front Layers ---");
                var frontDir = data["Output Dir Front"];
                var baseName = data["Base Name"];
                
                var exportsFront = [
                    { target: boldGroup, name: "1 Bold Text" },
                    { target: lightGroup, name: "2 Light Text" },
                    { target: raisedGroup, name: "3 Raised Text" },
                    { target: pikGroup ? pikGroup.artLayers.getByName("5 Big Pik") : null, name: "5 Big Pik" },
                    { target: lensGroup ? lensGroup.artLayers.getByName("6 Lens pik") : null, name: "6 lens pik" },
                    { target: lensGroup ? lensGroup.artLayers.getByName("7 lens dob") : null, name: "7 lens dob" }
                ];

                for (var i = 0; i < exportsFront.length; i++) {
                    try {
                        var item = exportsFront[i];
                        if (item.target) {
                            var savePath = frontDir + "/" + item.name + ".png";
                            exportLayer(doc, item.target, savePath);
                        }
                    } catch(e) {
                        log("Skipped or missing front export layer: " + exportsFront[i].name);
                    }
                }
            } catch(e) {
                log("Error in front export routine: " + e);
            }

            // Export PSD    
            log("--- Exporting TX Front PSD ---");        
            doc.saveAs(new File(frontDir + "\\" + baseName + ".psd"));
            
            log("TX Front Processing Complete.");
        }
    } catch(e) {
        log("FATAL ERROR: " + e + " line: " + e.line);
    }
}

// =============================================================================
// HELPERS (Paste your standard functions below: log, sanitizeQuotes, 
// findTemplatePath, exportPNG, openDocument, replaceFace, replaceSmartObject, 
// isDocumentOpen, parseDataFile, getLayerSet, updateText, exportLayer)
// =============================================================================

function log(m) {
    LOG_FILE.open("a");
    var time = new Date().toTimeString().split(' ')[0];
    LOG_FILE.writeln("[" + time + "] " + m);
    LOG_FILE.close();
}

function initLog() {
    LOG_FILE.open("w"); 
    LOG_FILE.write("--- TX FRONT LOG START ---\n"); 
    LOG_FILE.close();
}

function findTemplatePath(filename, root) {
    var psdFolderFile = new File(root + "PSDs/" + filename);
    if (psdFolderFile.exists) return psdFolderFile.fsName;
    var rootFile = new File(root + filename);
    if (rootFile.exists) return rootFile.fsName;
    return null;
}

function updateText(p, n, txt) {
    if(!p || !txt) return;
    try {
        // Strict exact match only to prevent overlaps (e.g., "FIRST AND MIDDLE" containing "DL")
        for(var i=0; i<p.artLayers.length; i++) {
            var l = p.artLayers[i];
            if(l.kind == LayerKind.TEXT && l.name.toLowerCase() === n.toLowerCase()) {
                var original = l.textItem.contents;
                l.textItem.contents = txt;
                log("Update Text (Exact) -> Layer: '" + l.name + "' | Org: " + original + " | New: " + txt);
                return;
            }
        }
        
        // If the loop finishes without returning, no exact match was found
        log("ERROR: Exact Text Layer match for '" + n + "' NOT FOUND in " + p.name + ". No update performed.");
    } catch(e) { log("Error updating text: " + e); }
}

function exportLayer(doc, group, savePath) {
    if (!group) return;
    function cTID(s) { return charIDToTypeID(s); }
    try {
        log("Fast Exporting: " + group.name);
        app.activeDocument = doc;
        doc.activeLayer = group;
        var f = new File(savePath);
        var tempDocName = f.name.replace(/\.[^\/.]+$/, ""); 

        var desc1 = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putClass(cTID('Dcmn'));
        desc1.putReference(cTID('null'), ref1);
        desc1.putString(cTID('Nm  '), tempDocName); 
        var ref2 = new ActionReference();
        ref2.putEnumerated(cTID('Lyr '), cTID('Ordn'), cTID('Trgt'));
        desc1.putReference(cTID('Usng'), ref2);
        desc1.putInteger(cTID('Vrsn'), 5);
        executeAction(cTID('Mk  '), desc1, DialogModes.NO);

        var newDoc = app.activeDocument; 
        exportPNG(f);
        newDoc.close(SaveOptions.DONOTSAVECHANGES);
        app.activeDocument = doc;
    } catch(e) { 
        log("Export Layer Error (" + group.name + "): " + e);
        if (app.documents.length > 0 && app.activeDocument != doc) {
             app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        }
    }
}

function replaceFace(parentSet, layerName, filePath, zoomAmount) {
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

            var ratioW = docW / layerW;
            var ratioH = docH / layerH;
            var baseRatio = Math.max(ratioW, ratioH);
            var scaleFactor = baseRatio * zoomAmount;

            newLayer.resize(scaleFactor, scaleFactor, AnchorPosition.MIDDLECENTER);
            var newBounds = newLayer.bounds;
            var currentTopY = newBounds[1].as("px");
            newLayer.translate(0, -currentTopY);

            for (var j = soDoc.layers.length - 1; j >= 0; j--) {
                if (soDoc.layers[j] != newLayer) soDoc.layers[j].remove();
            }
            soDoc.close(SaveOptions.SAVECHANGES);
        }
    } catch (e) {
        log("Error in replaceFace: " + e);
        if (app.activeDocument != parentSet.parent) {
            try { app.activeDocument.close(SaveOptions.DONOTSAVECHANGES); } catch (err) {}
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
        var folder = fileRef.parent;
        if (!folder.exists) folder.create();
        var pngOpts = new PNGSaveOptions();
        pngOpts.compression = 9;
        pngOpts.interlaced = false;
        app.activeDocument.saveAs(fileRef, pngOpts, true, Extension.LOWERCASE);
    } catch(e) { log("PNG Export Error: " + e); }
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
            var rawVal = parts.slice(1).join(":"); 
            var val = rawVal.replace(/^\s+|\s+$/g, '');
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