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

    function writeLog(message) {
        logFile.open("a");
        var time = new Date().toTimeString().split(' ')[0];
        logFile.writeln("[" + time + "] " + message);
        logFile.close();
    }

    initLog();
    writeLog("Initializing script and UI...");

    if (app.documents.length === 0) {
        var msg = "Error: No target PSD document open.";
        writeLog(msg);
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
                    writeLog("Selected folder for Card " + idx + ": " + f.fsName);
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
            writeLog("Selected destination folder: " + f.fsName);
        }
    };

    var btnGroup = win.add("group");
    btnGroup.alignment = ["center", "top"];
    var btnOk = btnGroup.add("button", undefined, "OK", {name: "ok"});
    var btnCancel = btnGroup.add("button", undefined, "Cancel", {name: "cancel"});

    btnCancel.onClick = function() {
        writeLog("User cancelled script execution.");
        win.close();
    };

    // --- 2. EXECUTION LOGIC ---
    btnOk.onClick = function() {
        var destPath = destTxt.text;
        if (!destPath) {
            writeLog("Execution halted: Destination folder missing.");
            alert("Destination folder is required.");
            return;
        }
        var destFolder = new Folder(destPath);
        if (!destFolder.exists) {
            writeLog("Execution halted: Destination folder does not exist.");
            alert("Destination folder does not exist.");
            return;
        }

        writeLog("Starting batch processing...");
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
        writeLog("Active document: " + doc.name);

        for (var i = 0; i < cardInputs.length; i++) {
            var folderPath = cardInputs[i].text.text;
            if (folderPath !== "") {
                var cardFolder = new Folder(folderPath);
                if (cardFolder.exists) {
                    writeLog("Processing Card " + cardInputs[i].index + " from: " + folderPath);
                    processCard(doc, cardFolder, cardInputs[i].index);
                    cardsProcessed++;
                } else {
                    writeLog("Warning: Folder for Card " + cardInputs[i].index + " does not exist.");
                }
            }
        }

        if (cardsProcessed > 0) {
            saveFinalOutputs(doc, destFolder);
            writeLog("Batch process complete. Total cards processed: " + cardsProcessed);
            alert(cardsProcessed + " Cards done");
        } else {
            writeLog("Batch process aborted. 0 cards processed.");
            alert("0 Cards done. No valid folders were selected.");
        }
        
        app.preferences.rulerUnits = originalRulerUnits;
        app.displayDialogs = originalDialogMode;
        writeLog("--- Script Finished ---");
    }

    // --- 3. CORE FUNCTIONS ---
    function processCard(doc, folder, cardIndex) {
        var files = folder.getFiles("*.png");
        var layerName = "Card " + cardIndex;

        writeLog("Found " + files.length + " PNG files in Card " + cardIndex + " folder.");

        for (var f = 0; f < files.length; f++) {
            var file = files[f];
            var upperName = file.name.toUpperCase().replace(".PNG", "");
            var targetGroup = null;

            if (upperName.match(/FRONT_UV$/)) targetGroup = "FRONT UV";
            else if (upperName.match(/FRONT_LASER$/)) targetGroup = "LASER FRONT";
            else if (upperName.match(/FRONT$/)) targetGroup = "FRONT";
            else if (upperName.match(/BACK_LASER$/)) targetGroup = "LASER BACK";
            else if (upperName.match(/BACK$/)) targetGroup = "BACK";

            if (targetGroup) {
                writeLog("Matching file '" + file.name + "' to Group: '" + targetGroup + "', Layer: '" + layerName + "'");
                updateSmartObject(doc, targetGroup, layerName, file);
            } else {
                writeLog("Warning: Unrecognized file naming convention for '" + file.name + "'. Skipping.");
            }
        }
    }

    function updateSmartObject(mainDoc, groupName, layerName, fileToPlace) {
        app.activeDocument = mainDoc;
        try {
            var group = mainDoc.layerSets.getByName(groupName);
            var soLayer = group.artLayers.getByName(layerName);
            mainDoc.activeLayer = soLayer;

            var idplacedLayerEditContents = stringIDToTypeID("placedLayerEditContents");
            executeAction(idplacedLayerEditContents, new ActionDescriptor(), DialogModes.NO);

            var soDoc = app.activeDocument;
            writeLog("Opened Smart Object: " + layerName + " in group " + groupName);

            var idPlc = charIDToTypeID("Plc ");
            var desc = new ActionDescriptor();
            desc.putPath(charIDToTypeID("null"), new File(fileToPlace));
            desc.putEnumerated(charIDToTypeID("FTcs"), charIDToTypeID("QCSt"), charIDToTypeID("Qcsa"));
            executeAction(idPlc, desc, DialogModes.NO);

            var placedLayer = soDoc.activeLayer;
            var soWidth = soDoc.width.value;
            var soHeight = soDoc.height.value;

            var bounds = placedLayer.bounds;
            var layerWidth = bounds[2].value - bounds[0].value;
            var layerHeight = bounds[3].value - bounds[1].value;

            var scaleX = (soWidth / layerWidth) * 100;
            var scaleY = (soHeight / layerHeight) * 100;

            placedLayer.resize(scaleX, scaleY, AnchorPosition.MIDDLECENTER);
            writeLog("Placed and scaled '" + fileToPlace.name + "' inside Smart Object.");

            // Correct ActionManager Save Call
            var idsave = charIDToTypeID( "save" );
            executeAction( idsave, undefined, DialogModes.NO );
            
            soDoc.close(SaveOptions.DONOTSAVECHANGES);
            app.activeDocument = mainDoc;
            writeLog("Saved and closed Smart Object silently.");
            
        } catch (e) {
            writeLog("Error updating Smart Object (" + groupName + " -> " + layerName + "): " + e.message);
        }
    }

    function saveFinalOutputs(doc, destFolder) {
        var baseName = doc.name.replace(/\.[^\.]+$/, "");
        var timestamp = new Date().getTime();

        writeLog("Saving final output files...");

        var psdFile = new File(destFolder.fsName + "/" + baseName + "_Final_" + timestamp + ".psd");
        var psdOptions = new PhotoshopSaveOptions();
        psdOptions.embedColorProfile = true;
        psdOptions.alphaChannels = true;
        psdOptions.layers = true;
        doc.saveAs(psdFile, psdOptions, true, Extension.LOWERCASE);
        writeLog("Saved PSD: " + psdFile.fsName);

        // var pngFile = new File(destFolder.fsName + "/" + baseName + "_Final_" + timestamp + ".png");
        // var pngOptions = new PNGSaveOptions();
        // doc.saveAs(pngFile, pngOptions, true, Extension.LOWERCASE);
        // writeLog("Saved PNG: " + pngFile.fsName);
    }

    win.show();
    writeLog("UI Displayed to user.");
})();