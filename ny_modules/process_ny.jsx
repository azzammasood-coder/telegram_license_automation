/**
 * PROCESS NY LICENSE (JSX)
 * Features: Single PSD, Advanced Font Sizing (Wave), Fast Export, Detailed Logging
 */

#target photoshop

// =============================================================================
// CONFIGURATION
// =============================================================================
var SCRIPT_PATH = File($.fileName).parent.fsName;
var CFG_FILE  = new File(SCRIPT_PATH + "/config.json");

var config = {};
if (CFG_FILE.exists) {
    CFG_FILE.open("r");
    var jsonString = CFG_FILE.read();
    CFG_FILE.close();
    config = eval("(" + jsonString + ")");
} else {
    throw "config.json missing";
}

var ROOT_PATH = config.paths.base_dir;
if (ROOT_PATH.charAt(ROOT_PATH.length - 1) != "/" && ROOT_PATH.charAt(ROOT_PATH.length - 1) != "\\") {
    ROOT_PATH += "/";
}

var JOB_FILE  = new File(ROOT_PATH + "active_job.txt");
var LOG_FILE  = new File(ROOT_PATH + "photoshop_log.txt");

var PSD_NAME = config.filenames ? config.filenames.ny_psd : "AUTOMATED NY F AND B.psd";
var PSD_PATH = ROOT_PATH + PSD_NAME;

function main() {
    initLog();
    log("==========================================");
    log("STARTING NY PROCESSING (VERBOSE LOGGING)");
    log("==========================================");
    
    app.preferences.rulerUnits = Units.PIXELS;
    app.displayDialogs = DialogModes.NO;

    try {
        // 1. READ DATA
        if (!JOB_FILE.exists) throw "No active_job.txt found.";
        JOB_FILE.open("r");
        var dataPath = JOB_FILE.read();
        JOB_FILE.close();
        
        var dataFile = new File(dataPath);
        if (!dataFile.exists) throw "Data file not found: " + dataPath;
        log("Reading Data File: " + dataFile.name);
        var data = parseDataFile(dataFile);
        
        // 2. OPEN TEMPLATE
        if (!isDocumentOpen(PSD_NAME)) {
            if (new File(PSD_PATH).exists) {
                log("Opening Template: " + PSD_NAME);
                app.open(new File(PSD_PATH));
            } else {
                throw "Template missing at: " + PSD_PATH;
            }
        } else {
            log("Template already open: " + PSD_NAME);
        }
        app.activeDocument = app.documents.getByName(PSD_NAME);
        var doc = app.activeDocument;

        // 3. RESET
        doc.activeHistoryState = doc.historyStates[0];
        log("Reset History to Open State.");

        // =====================================================================
        // SECTION 1: FRONT (Units = Pixels)
        // =====================================================================
        app.preferences.rulerUnits = Units.PIXELS;
        var frontGroup = getLayerSet(doc, "front");
        
        if (frontGroup) {
            log("\n--- PROCESSING FRONT LAYERS ---");
            
            // --- A. RAISED ---
            var raised = getLayerSet(frontGroup, "Raised");
            if (raised) {
                var r16 = getLayerSet(raised, "16 RAISED DL");
                updateText(r16, "text", data["DL 3 Chars"]);

                var r17 = getLayerSet(raised, "17 RAISED DOB");
                updateText(r17, "day", data["Dob Day"]);
                updateText(r17, "month", data["Dob Month"]);
                updateText(r17, "last two digits of year", data["Dob Year Last 2"]);

                var r18 = getLayerSet(raised, "18 RAISED EXP");
                updateText(r18, "day", data["Exp Day"]);
                updateText(r18, "month", data["Exp Month"]);
                updateText(r18, "last two digits of year", data["Exp Year Last 2"]);

                var r19 = getLayerSet(raised, "19 RAISED TEXT SWIRL DOB");
                updateText(r19, "dob", data["Dob Swirl"]); 

                var r20 = getLayerSet(raised, "20 RAISED SIG");
                var sigPath = data["Load Signature Image"];
                if (sigPath && new File(sigPath).exists) {
                    replaceSmartObject(r20, "SIG copy", new File(sigPath), true);
                } else {
                    log("SKIP: No signature image found at " + sigPath);
                }

                var r21 = getLayerSet(raised, "21 Raised Dob Text Under Big Photo");
                updateText(r21, "dob", data["Dob Compact"]);
            } else {
                log("WARNING: 'Raised' group not found in Front.");
            }

            // --- B. LASER ---
            var laser = getLayerSet(frontGroup, "Laser");
            if (laser) {
                // 05 DO NOT TOUCH
                var laserDoNotTouch = getLayerSet(laser, "01, 02, 03, 04, 05 LASER Do Not Touch");
                var l05 = getLayerSet(laserDoNotTouch, "05 Do Not Touch");
                if (l05) {
                    updateText(l05, "Class", data["Class"]); 
                    updateText(l05, "Eyes", data["Eyes"]);
                    updateText(l05, "Height", data["Height"]);
                    updateText(l05, "Sex", data["Gender"]);
                    updateText(l05, "Expires", data["Raised EXP"]);
                    updateText(l05, "DOB", data["Raised DOB"]);
                    updateText(l05, "Issued", data["Issue Full"]);
                }

                // LASER EDIT TEXT (9, 10, 11)
                var laserEdit = getLayerSet(laser, "9, 10, 11Laser Edit Text"); 
                if (!laserEdit) laserEdit = getLayerSet(laser, "\"9, 10, 11\"Laser Edit Text"); 

                if (laserEdit) {
                    // 09 SWIRL NAME (Complex Sizing)
                    var l09 = getLayerSet(laserEdit, "09 Laser Swirl name");
                    var l09text = getLayerSet(l09, "ANNARDIESSLINANNARDIESSLIN"); 
                    if (!l09text && l09.artLayers.length > 0) l09text = l09.artLayers[0];
                    
                    if (l09text && l09text.kind == LayerKind.TEXT) {
                        var safeSwirl = data["Swirl Text 26"] || data["Swirl Text"] || "ANNARDIESSLINANNARDIESSLIN";
                        log("APPLYING FRONT SWIRL LOGIC: '" + safeSwirl + "'");
                        l09text.textItem.contents = safeSwirl;
                        applyFrontSwirlSizing(l09text);
                    } else {
                        log("WARNING: Front Swirl Text Layer not found or not text.");
                    }

                    // 10 BOLD
                    var l10 = getLayerSet(laserEdit, "10 Laser Edited BOLD Text");
                    if (l10) {
                        var l10dob = getLayerSet(l10, "DOB");
                        updateText(l10dob, "first two digits of year", data["First 2 Digits Year"]);
                        updateText(l10dob, "05/09/1959", data["Raised DOB"]); // This usually targets the full date layer

                        updateText(l10, "4  7 1  9 0  0", data["DL Remaining"]); 
                        updateText(l10, "ISSUE", data["Issue Full"]);
                        updateText(l10, "EXP", data["Raised EXP"]);
                        // Address/Name logs would appear here if layers matched
                    }

                    // 11 LIGHT
                    var l11 = getLayerSet(laserEdit, "11 LIGHT");
                    if (l11) {
                        updateText(l11, "Gender", data["Gender"]);
                        updateText(l11, "Height", data["Height"]);
                        updateText(l11, "Eye Color", data["Eyes"]);
                        updateText(l11, "Micro", data["Micro Text"]);
                    }
                } else {
                    log("WARNING: 'Laser Edit Text' group not found.");
                }

                // 12 DOB UNDER PIC
                var l12 = getLayerSet(laser, "12 Laser Dob Text Under Pic");
                updateText(l12, "dob", data["Dob Compact"]);

                // 13 BIG PHOTO
                var l13 = getLayerSet(laser, "13 Big Photo");
                var facePath = data["Load Face Image"];
                if (facePath && new File(facePath).exists) {
                    replaceSmartObject(l13, "13b made", new File(facePath), true);
                } else {
                    log("SKIP: No face image found at " + facePath);
                }

                // 14 LENS FACE
                var l14 = getLayerSet(laser, "14 Lens Face");
                if (facePath && new File(facePath).exists) {
                    replaceSmartObject(l14, "13b made copy 3", new File(facePath), true);
                }

                // 15 LENS DOB
                var l15 = getLayerSet(laser, "15 Lens Dob");
                updateText(l15, "month", data["Dob Month"]);
                updateText(l15, "day", data["Dob Day"]);
            } else {
                log("WARNING: 'Laser' group not found in Front.");
            }
        } else {
            log("CRITICAL: 'front' group not found in document.");
        }

        // // =====================================================================
        // // SECTION 2: BACK (Units = Points)
        // // =====================================================================
        // app.preferences.rulerUnits = Units.POINTS; 
        // var backGroup = getLayerSet(doc, "Back");
        
        // if (backGroup) {
        //     log("\n--- PROCESSING BACK LAYERS ---");
            
        //     // 1 BARCODE
        //     var b1 = getLayerSet(backGroup, "1 Barcode");
        //     var barcodePath = data["Load Big Barcode"];
        //     if (barcodePath && new File(barcodePath).exists) {
        //         replaceSmartObject(b1, "barcode", new File(barcodePath));
        //     }

        //     // 2 DOC NUM
        //     var b2 = getLayerSet(backGroup, "2 Regular Print Doc#");
        //     updateText(b2, "Number", data["Doc Discriminator"]);

        //     // 3 TOP WINDOW
        //     var b3 = getLayerSet(backGroup, "3 Regular Print Top Window");
        //     updateText(b3, "DOB", data["Dob Swirl"]); 

        //     // 4 SWIRL
        //     var b4 = getLayerSet(backGroup, "4 Regular Print Swirl");
        //     var b4edit = getLayerSet(b4, "EDIT");
        //     if (b4edit) {
        //         updateText(b4edit, "Month - First character", data["Back Swirl Month 1"]);
        //         updateText(b4edit, "Month - Second Characer", data["Back Swirl Month 2"]);
        //         updateText(b4edit, "Month - Third Character", data["Back Swirl Month 3"]);
        //         updateText(b4edit, "Day", data["Back Swirl Day"]);
        //         updateText(b4edit, "Year", data["Back Swirl Year"]);
        //         updateText(b4edit, "DL", data["Raw DL"]);
        //     }

        //     // 5 RAISED TEXT (BACK)
        //     var b5 = getLayerSet(backGroup, "5 Raised text");
        //     var b5text = getLayerSet(b5, "Raised text");
        //     if (!b5text && b5.artLayers.length > 0) b5text = b5.artLayers[0];

        //     if (b5text && b5text.kind == LayerKind.TEXT) {
        //         var safeBackText = data["Back Raised Text"] || data["Swirl Text"] || "ANNARDIESSLINANNARDIESSLIN";
        //         log("APPLYING BACK RAISED LOGIC: '" + safeBackText + "'");
        //         b5text.textItem.contents = safeBackText;
        //         applyBackRaisedSizing(b5text);
        //     } else {
        //         log("WARNING: Back Raised text layer not found.");
        //     }

        //     // 6 LIGHT BLACK
        //     var b6 = getLayerSet(backGroup, "6 Regular Print Light Black");
        //     updateText(b6, "Barcode number", data["Back Barcode Num"]);

        //     // 7 BOTTOM BARCODE
        //     var b7 = getLayerSet(backGroup, "7 Bottom Barcode");
        //     var smallBarPath = data["Load Small Barcode"];
        //     if (smallBarPath && new File(smallBarPath).exists) {
        //         replaceSmartObject(b7, "barcode", new File(smallBarPath));
        //     }
        // } else {
        //     log("CRITICAL: 'Back' group not found in document.");
        // }

        // =====================================================================
        // SECTION 3: EXPORTS (Fast)
        // =====================================================================
        app.preferences.rulerUnits = Units.PIXELS;
        log("\n--- EXPORTING LAYERS ---");
        var outDir = data["Output Front"].substring(0, data["Output Front"].lastIndexOf("\\"));
        
        function exportLayer(group, saveName) {
            if(!group) {
                log("Export Skip: Group for '" + saveName + "' is null.");
                return;
            }
            var state = doc.activeHistoryState;
            for(var i=0; i<doc.layers.length; i++) doc.layers[i].visible = false; 
            
            var p = group;
            while(p && p != doc) { p.visible = true; p = p.parent; }
            group.visible = true;
            
            doc.trim(TrimType.TRANSPARENT, true, true, true, true);
            exportPNG(new File(outDir + "\\" + saveName + ".png"));
            log("Exported PNG: " + saveName + ".png");
            doc.activeHistoryState = state;
        }

        // // FRONT EXPORTS
        // if (frontGroup && laserEdit) {
        //     exportLayer(getLayerSet(laserEdit, "09 Laser Swirl name"), "09 Laser Swirl name");
        //     exportLayer(getLayerSet(laserEdit, "10 Laser Edited BOLD Text"), "10 Laser Edited BOLD Text");
        //     exportLayer(getLayerSet(laserEdit, "11 LIGHT"), "11 LIGHT");
        // }
        // if (frontGroup && laser) {
        //     exportLayer(getLayerSet(laser, "12 Laser Dob Text Under Pic"), "12 Laser Dob Text Under Pic");
        //     exportLayer(getLayerSet(laser, "13 Big Photo"), "13 Big Photo");
        //     exportLayer(getLayerSet(laser, "14 Lens Face"), "14 Lens Face");
        //     exportLayer(getLayerSet(laser, "15 Lens Dob"), "15 Lens Dob");
        // }
        // exportLayer(getLayerSet(frontGroup, "Raised"), "Raised");

        // // BACK EXPORTS
        // if (backGroup) {
        //     exportLayer(getLayerSet(backGroup, "1 Barcode"), "1 Barcode");
        //     exportLayer(getLayerSet(backGroup, "2 Regular Print Doc#"), "2 Regular Print Doc#");
        //     exportLayer(getLayerSet(backGroup, "3 Regular Print Top Window"), "3 Regular Print Top Window");
        //     exportLayer(getLayerSet(backGroup, "4 Regular Print Swirl"), "4 Regular Print Swirl");
        //     exportLayer(getLayerSet(backGroup, "5 Raised text"), "5 Raised text");
        //     exportLayer(getLayerSet(backGroup, "6 Regular Print Light Black"), "6 Regular Print Light Black");
        // }

        log("NY DONE SUCCESSFULLY.");

    } catch(e) {
        log("FATAL ERROR: " + e + " (Line: " + e.line + ")");
    }
}

// =============================================================================
// FONT SIZING HELPERS
// =============================================================================

function applyFrontSwirlSizing(textLayer) {
    try {
        var strLen = textLayer.textItem.contents.length;
        var increment = 16.67;
        log("  > Applying Front Wave Sizing to " + strLen + " chars.");
        
        for (var i = 0; i < strLen; i++) {
            var size = 100; // default start
            
            if (i > 1) { // First 2 are 100
                if (i <= 13) {
                     // Increase
                     size = 100 + ((i-1) * increment);
                } else {
                     // Decrease
                     var distFromPeak = i - 13;
                     size = 300 - (distFromPeak * increment);
                }
            }
            if (size < 66.67) size = 66.67;
            setCharSize(textLayer, i, size, "px");
        }
    } catch(e) { log("Front Swirl Size Error: " + e); }
}

function applyBackRaisedSizing(textLayer) {
    var sizes = [
        450.00, 466.67, 500.00, 516.67, 516.67, 508.33, 482.24, 434.02, 
        416.67, 400.00, 391.67, 383.33, 369.72, 383.33, 369.72, 353.64, 
        337.57, 305.42, 273.27, 241.12, 208.97, 192.90, 160.75, 144.67, 
        144.67, 144.67
    ];
    try {
        var len = textLayer.textItem.contents.length;
        log("  > Applying Back Point Sizing to " + len + " chars.");
        for (var i = 0; i < len; i++) {
            if (i < sizes.length) {
                setCharSize(textLayer, i, sizes[i], "pt");
            }
        }
    } catch(e) { log("Back Swirl Size Error: " + e); }
}

function setCharSize(layer, index, sizeVal, unit) {
    try {
        if (unit == "px") {
            layer.textItem.range(index, index+1).size = new UnitValue(sizeVal, "px");
        } else {
            layer.textItem.range(index, index+1).size = new UnitValue(sizeVal, "pt");
        }
    } catch(e) {
        // Range method might fail on very old PS versions or specific contexts
    }
}

// =============================================================================
// STANDARD HELPERS
// =============================================================================

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
        for(var i=0; i<p.layers.length; i++) {
            var check = p.layers[i].name.toLowerCase().replace(/["\s]/g, "");
            var target = t.replace(/["\s]/g, "");
            if(check.indexOf(target) > -1) return p.layers[i];
        }
    } catch(e) {}
    return null;
}

function updateText(p, n, txt) {
    if(!p || !n) return;
    var safeTxt = txt || ""; // Handle undefined/null gracefully
    try {
        var found = false;
        for(var i=0; i<p.artLayers.length; i++) {
            var l = p.artLayers[i];
            var check = l.name.toLowerCase();
            var target = n.toLowerCase();
            if(l.kind == LayerKind.TEXT && check.indexOf(target) > -1) {
                var old = l.textItem.contents;
                l.textItem.contents = safeTxt;
                if (l.textItem.kind == TextType.PARAGRAPHTEXT) l.textItem.hyphenation = false;
                
                log("UPDATE TEXT: [" + p.name + "] > [" + l.name + "] | Val: '" + old + "' -> '" + safeTxt + "'");
                found = true;
                return;
            }
        }
        if (!found) {
            // log("WARNING: Text layer matching '" + n + "' not found in group '" + p.name + "'");
        }
    } catch(e) { log("ERROR in updateText (" + n + "): " + e); }
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
            log("SMART OBJECT REPLACE: [" + parentSet.name + "] > [" + layerName + "] with " + fileRef.name);
        } else {
            log("WARNING: Smart Object layer '" + layerName + "' not found.");
        }
    } catch(e) { log("Smart Object Error: " + e); }
}

function exportPNG(fileRef) {
    try {
        var pngOpts = new PNGSaveOptions();
        pngOpts.compression = 0;
        pngOpts.interlaced = false;
        app.activeDocument.saveAs(fileRef, pngOpts, true, Extension.LOWERCASE);
    } catch(e) { log("PNG Export Error: " + e); }
}

function isDocumentOpen(name) {
    for (var i = 0; i < app.documents.length; i++) if (app.documents[i].name == name) return true;
    return false;
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