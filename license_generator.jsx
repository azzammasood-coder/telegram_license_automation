#target photoshop

(function() {
    // --- LOGGING SETUP ---
    var scriptFile = new File($.fileName);
    var logFolder = new Folder(scriptFile.parent.fsName + "/logs");
    if (!logFolder.exists) {
        logFolder.create();
    }
    var logFile = new File(logFolder.fsName + "/card_generator.log");

    function initLog() {
        logFile.open("w");
        logFile.writeln("--- Card Generator Process Started: " + new Date().toLocaleString() + " ---");
        logFile.close();
    }

    function log(message) {
        logFile.open("a");
        var time = new Date().toTimeString().split(' ')[0];
        logFile.writeln("[" + time + "] " + message);
        logFile.close();
    }

    initLog();
    log("Initializing script and UI...");

    if (app.documents.length === 0) {
        var msg = "Error: No target PSD document open.";
        log(msg);
        alert(msg);
        return;
    }

    // --- 1. UI SETUP ---
    var win = new Window("dialog", "Batch Process Cards");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];

    var cardPanel = win.add("panel", undefined, "Select Card Folders (Leave empty to skip)");
    cardPanel.orientation = "column";
    cardPanel.alignChildren = ["left", "top"];

    var cardInputs = [];
    for (var i = 1; i <= 8; i++) {
        var row = cardPanel.add("group");
        row.add("statictext", [0, 0, 50, 20], "Card " + i + ":");
        var txt = row.add("edittext", [0, 0, 300, 20], "");
        var btn = row.add("button", undefined, "Browse");
        
        cardInputs.push({ text: txt, button: btn, index: i });

        (function(t, idx) {
            btn.onClick = function() {
                var f = Folder.selectDialog("Select folder containing images for Card " + idx);
                if (f) {
                    t.text = f.fsName;
                    log("Selected folder for Card " + idx + ": " + f.fsName);
                }
            }
        })(txt, i);
    }

    var destPanel = win.add("panel", undefined, "Destination Folder");
    var destRow = destPanel.add("group");
    var destTxt = destRow.add("edittext", [0, 0, 355, 20], "");
    var destBtn = destRow.add("button", undefined, "Browse");
    
    destBtn.onClick = function() {
        var f = Folder.selectDialog("Select destination folder for final PSD and PNG");
        if (f) {
            destTxt.text = f.fsName;
            log("Selected destination folder: " + f.fsName);
        }
    };

    var btnGroup = win.add("group");
    btnGroup.alignment = ["center", "top"];
    var btnOk = btnGroup.add("button", undefined, "OK", {name: "ok"});
    var btnCancel = btnGroup.add("button", undefined, "Cancel", {name: "cancel"});

    btnCancel.onClick = function() {
        log("User cancelled script execution.");
        win.close();
    };

    // --- 2. EXECUTION LOGIC ---
    btnOk.onClick = function() {
        var destPath = destTxt.text;
        if (!destPath) {
            log("Execution halted: Destination folder missing.");
            alert("Destination folder is required.");
            return;
        }
        var destFolder = new Folder(destPath);
        if (!destFolder.exists) {
            log("Execution halted: Destination folder does not exist.");
            alert("Destination folder does not exist.");
            return;
        }

        log("Starting batch processing...");
        win.close();
        processBatch(destFolder);
    };

    function processBatch(destFolder) {
        var originalRulerUnits = app.preferences.rulerUnits;
        var originalDialogMode = app.displayDialogs;
        
        app.preferences.rulerUnits = Units.PIXELS;
        app.displayDialogs = DialogModes.NO;

        var cardsProcessed = 0;
        var doc = app.activeDocument;
        log("Active document: " + doc.name);

        for (var i = 0; i < cardInputs.length; i++) {
            var folderPath = cardInputs[i].text.text;
            if (folderPath !== "") {
                var cardFolder = new Folder(folderPath);
                if (cardFolder.exists) {
                    log("Processing Card " + cardInputs[i].index + " from: " + folderPath);
                    processCard(doc, cardFolder, cardInputs[i].index);
                    cardsProcessed++;
                } else {
                    log("Warning: Folder for Card " + cardInputs[i].index + " does not exist.");
                }
            }
        }

        if (cardsProcessed > 0) {
            saveFinalOutputs(doc, destFolder);
            log("Batch process complete. Total cards processed: " + cardsProcessed);
            alert(cardsProcessed + " Cards done");
        } else {
            log("Batch process aborted. 0 cards processed.");
            alert("0 Cards done. No valid folders were selected.");
        }
        
        app.preferences.rulerUnits = originalRulerUnits;
        app.displayDialogs = originalDialogMode;
        log("--- Script Finished ---");
    }

    // --- 3. CORE FUNCTIONS ---
    function processCard(doc, folder, cardIndex) {
        var files = folder.getFiles("*.png");
        var layerName = "Card " + cardIndex;

        log("Found " + files.length + " PNG files in Card " + cardIndex + " folder.");

        for (var f = 0; f < files.length; f++) {
            var file = new File(files[f]);
            var upperName = file.name.toUpperCase().replace(".PNG", "");
            var targetGroupName = null;

            if (upperName.match(/FRONT_UV$/)) targetGroupName = "FRONT UV";
            else if (upperName.match(/FRONT_LASER$/)) targetGroupName = "LASER FRONT";
            else if (upperName.match(/FRONT$/)) targetGroupName = "FRONT";
            else if (upperName.match(/BACK_LASER$/)) targetGroupName = "LASER BACK";
            else if (upperName.match(/BACK$/)) targetGroupName = "BACK";

            if (targetGroupName) {
                log("Matching file '" + file.name + "' to Group: '" + targetGroupName + "', Layer: '" + layerName + "'");
                try {
                    var targetGroup = doc.layerSets.getByName(targetGroupName);
                    // Pass doBg as false since template filling usually shouldn't cut out backgrounds automatically
                    replaceSmartObject(targetGroup, layerName, file, false);
                } catch(e) {
                    log("Error locating target group '" + targetGroupName + "': " + e.message);
                }
            } else {
                log("Warning: Unrecognized file naming convention for '" + file.name + "'. Skipping.");
            }
        }
    }

    function findSmartObjectRecursive(parentSet, layerName) {
        for (var i = 0; i < parentSet.layers.length; i++) {
            var layer = parentSet.layers[i];
            if (layer.name === layerName && layer.kind === LayerKind.SMARTOBJECT) {
                return layer;
            }
            if (layer.typename === "LayerSet") {
                var found = findSmartObjectRecursive(layer, layerName);
                if (found) return found;
            }
        }
        return null;
    }

    // User provided function
    function replaceSmartObject(parentSet, layerName, fileRef, doBg) {
        if (!parentSet || !fileRef.exists) {
            log("Replace SO Failed: Parent set missing or file doesn't exist (" + fileRef.fsName + ")");
            return;
        }
        try {
            var foundLayer = findSmartObjectRecursive(parentSet, layerName);
            if (foundLayer) {
                log("Replacing SO: " + foundLayer.name + " with " + fileRef.name);
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
            } else {
                 log("Error: Target Smart Object layer '" + layerName + "' not found.");
            }
        } catch(e) { log("Replace SO Error for '" + layerName + "': " + e); }
    }

    function saveFinalOutputs(doc, destFolder) {
        var baseName = doc.name.replace(/\.[^\.]+$/, "");
        var timestamp = new Date().getTime();

        log("Saving final output files...");

        var psdFile = new File(destFolder.fsName + "/" + baseName + "_Final_" + timestamp + ".psd");
        var psdOptions = new PhotoshopSaveOptions();
        psdOptions.embedColorProfile = true;
        psdOptions.alphaChannels = true;
        psdOptions.layers = true;
        doc.saveAs(psdFile, psdOptions, true, Extension.LOWERCASE);
        log("Saved PSD: " + psdFile.fsName);

        var pngFile = new File(destFolder.fsName + "/" + baseName + "_Final_" + timestamp + ".png");
        var pngOptions = new PNGSaveOptions();
        doc.saveAs(pngFile, pngOptions, true, Extension.LOWERCASE);
        log("Saved PNG: " + pngFile.fsName);
    }

    win.show();
    log("UI Displayed to user.");
})();