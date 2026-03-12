/**
 * PROCESS TX BACK (JSX)
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
var LOG_FILE = new File(LOG_DIR.fsName + "/process_tx_back_logs.txt");

function main() {
    initLog();
    log("Starting TX Back Process...");
    
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

        var NAME_BACK = config.filenames && config.filenames.tx_back ? config.filenames.tx_back : "TX Back.psd";
        var PATH_BACK = findTemplatePath(NAME_BACK, ROOT_PATH);

        if (PATH_BACK) {
            log("Opening TX Back Template: " + PATH_BACK);
            openDocument(PATH_BACK, NAME_BACK);
            var doc = app.activeDocument;
            doc.activeHistoryState = doc.historyStates[0];

            var boldGroup = getLayerSet(doc, "1 Bold Text");
            var barcodeGroup = getLayerSet(doc, "2, 3  Barcodes");
            var lightGroup = getLayerSet(doc, "4 Light Text");

            if (boldGroup) {
                updateText(boldGroup, "DOB EDIT", data["Dob"]);
            }

            if (lightGroup) {
                updateText(lightGroup, "INVENTORY", data["Inv Control"]);
            }

            if (barcodeGroup) {
                var smallBarcodePath = data["Load Small Barcode"];
                if (smallBarcodePath && new File(smallBarcodePath).exists) {
                    // Passed '90' as the 4th parameter to rotate 90 degrees clockwise
                    replaceSmartObject(barcodeGroup, "2 Side Code", new File(smallBarcodePath), 90);
                }

                var bigBarcodePath = data["Load Big Barcode"];
                if (bigBarcodePath && new File(bigBarcodePath).exists) {
                    // No rotation for the big barcode
                    replaceSmartObject(barcodeGroup, "3 barcode", new File(bigBarcodePath));
                }
            }

            // --- EXPORT BACK LAYERS FOR LASER/LIGHTBURN ---
            try {
                log("--- Exporting TX Back Layers ---");
                var backDir = data["Output Dir Back"];
                var baseName = data["Base Name"];
                
                var exportsBack = [
                    { target: boldGroup, name: "1 Bold Text" },
                    { target: barcodeGroup ? barcodeGroup.artLayers.getByName("2 Side Code") : null, name: "2 Side Code" },
                    { target: barcodeGroup ? barcodeGroup.artLayers.getByName("3 barcode") : null, name: "3 barcode" },
                    { target: lightGroup, name: "4 Light Text" }
                ];

                for (var j = 0; j < exportsBack.length; j++) {
                    try {
                        var item = exportsBack[j];
                        if (item.target) {
                            var savePath = backDir + "/" +  item.name + ".png";
                            exportLayer(doc, item.target, savePath);
                        }
                    } catch(e) {
                        log("Skipped or missing back export layer: " + exportsBack[j].name);
                    }
                }
            } catch(e) {
                log("Error in back export routine: " + e);
            }
            
            log("--- Exporting TX Back PSD ---");
            doc.saveAs(new File(backDir + "\\" + baseName + ".psd"));
            
            log("TX Back Processing Complete.");
        }
    } catch(e) {
        log("FATAL ERROR: " + e + " line: " + e.line);
    }
}

// =============================================================================
// HELPERS (Paste your standard functions below)
// =============================================================================

function log(m) {
    LOG_FILE.open("a");
    var time = new Date().toTimeString().split(' ')[0];
    LOG_FILE.writeln("[" + time + "] " + m);
    LOG_FILE.close();
}

function initLog() {
    LOG_FILE.open("w"); 
    LOG_FILE.write("--- TX BACK LOG START ---\n"); 
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

function replaceSmartObject(parentSet, layerName, fileRef, rotateAngle) {
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

            // Apply rotation if an angle was provided
            if (rotateAngle) {
                newLayer.rotate(rotateAngle, AnchorPosition.MIDDLECENTER);
            }

            var docW = soDoc.width.as("px"); var docH = soDoc.height.as("px");
            var bounds = newLayer.bounds; 
            var layerW = bounds[2].as("px")-bounds[0].as("px");
            var layerH = bounds[3].as("px")-bounds[1].as("px");
            var scaleX = (docW/layerW)*100; var scaleY = (docH/layerH)*100;
            newLayer.resize(scaleX, scaleY, AnchorPosition.MIDDLECENTER);
            
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