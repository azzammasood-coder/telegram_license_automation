/**
 * PROCESS NY LICENSE (JSX) - DUAL PSD
 * Features: Smart Path Detection (PSDs folder -> Root), Atomic Text Sizing
 */

#target photoshop

// =============================================================================
// CONFIGURATION & SETUP
// =============================================================================
var SCRIPT_PATH = File($.fileName).parent.fsName;
var CFG_FILE  = new File(SCRIPT_PATH + "/../config.json");

var config = {};
if (CFG_FILE.exists) {
    CFG_FILE.open("r");
    var jsonString = CFG_FILE.read();
    CFG_FILE.close();
    config = eval("(" + jsonString + ")");
} else {
    // Fallback defaults
    config = { 
        paths: { base_dir: "C:/License_Factory/" },
        filenames: { ny_front: "Front NY Automation.psd", ny_back: "Back NY Automation.psd" }
    };
}

var ROOT_PATH = config.paths.base_dir;
// Ensure trailing slash
if (ROOT_PATH.charAt(ROOT_PATH.length - 1) != "/" && ROOT_PATH.charAt(ROOT_PATH.length - 1) != "\\") {
    ROOT_PATH += "/";
}

var JOB_FILE  = new File(ROOT_PATH + "active_job.txt");
var LOG_FILE  = new File(ROOT_PATH + "photoshop_log.txt");

// --- SMART PATH DETECTION ---
function findTemplatePath(filename) {
    // 1. Check inside "PSDs" folder
    var psdFolderFile = new File(ROOT_PATH + "PSDs/" + filename);
    if (psdFolderFile.exists) return psdFolderFile.fsName;

    // 2. Check in Root Directory
    var rootFile = new File(ROOT_PATH + filename);
    if (rootFile.exists) return rootFile.fsName;

    return null; // Not found
}

// Get Filenames from Config
var NAME_FRONT = config.filenames && config.filenames.ny_front ? config.filenames.ny_front : "Front NY Automation.psd";
var NAME_BACK  = config.filenames && config.filenames.ny_back ? config.filenames.ny_back : "Back NY Automation.psd";

var PATH_FRONT = findTemplatePath(NAME_FRONT);
var PATH_BACK  = findTemplatePath(NAME_BACK);

function main() {
    initLog();
    log("------------------------------------------");
    log("Starting NY Processing...");
    
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.POINTS; 
    app.displayDialogs = DialogModes.NO;

    try {
        // 1. READ DATA
        if (!JOB_FILE.exists) throw "No active_job.txt found.";
        JOB_FILE.open("r");
        var dataPath = JOB_FILE.read();
        JOB_FILE.close();
        
        var dataFile = new File(dataPath);
        if (!dataFile.exists) throw "Data file not found: " + dataPath;
        var data = parseDataFile(dataFile);
        
        // =====================================================================
        // SECTION 1: FRONT PSD
        // =====================================================================
        if (PATH_FRONT) {
            log("Opening Front Template: " + PATH_FRONT);
            openDocument(PATH_FRONT, NAME_FRONT);
            var doc = app.activeDocument;
            doc.activeHistoryState = doc.historyStates[0];

            var frontGroup = getLayerSet(doc, "front");
            if (frontGroup) {
                // --- A. RAISED ---
                var raised = getLayerSet(frontGroup, "Raised");
                if (raised) {
                    updateText(getLayerSet(raised, "16 RAISED DL"), "text", data["DL 3 Chars"]);
                    
                    var r17 = getLayerSet(raised, "17 RAISED DOB");
                    updateText(r17, "day", data["Dob Day"]);
                    updateText(r17, "month", data["Dob Month"]);
                    updateText(r17, "last two digits of year", data["Dob Year Last 2"]);

                    var r18 = getLayerSet(raised, "18 RAISED EXP");
                    updateText(r18, "day", data["Exp Day"]);
                    updateText(r18, "month", data["Exp Month"]);
                    updateText(r18, "last two digits of year", data["Exp Year Last 2"]);

                    updateText(getLayerSet(raised, "19 RAISED TEXT SWIRL DOB"), "dob", data["Dob Swirl"]); 

                    var r20 = getLayerSet(raised, "20 RAISED SIG");
                    var sigPath = data["Load Signature Image"];
                    if (sigPath && new File(sigPath).exists) {
                        replaceSmartObject(r20, "SIG copy", new File(sigPath), true);
                    }

                    updateText(getLayerSet(raised, "21 Raised Dob Text Under Big Photo"), "dob", data["Dob Compact"]);
                }

                // --- B. LASER ---
                var laser = getLayerSet(frontGroup, "Laser");
                if (laser) {
                    // 05 DO NOT TOUCH
                    var l05 = getLayerSet(getLayerSet(laser, "01, 02, 03, 04, 05 LASER Do Not Touch"), "05 Do Not Touch");
                    if (l05) {
                        updateText(l05, "Class", data["Class"]); 
                        updateText(l05, "Eyes", data["Eyes"]);
                        updateText(l05, "Height", data["Height"]);
                        updateText(l05, "Sex", data["Gender"]);
                        updateText(l05, "Expires", data["Raised EXP"]);
                        updateText(l05, "DOB", data["Raised DOB"]);
                        updateText(l05, "Issued", data["Issue Full"]);
                    }

                    // LASER EDIT TEXT
                    var laserEdit = getLayerSet(laser, "9, 10, 11"); 
                    if (!laserEdit) laserEdit = getLayerSet(laser, "\"9, 10, 11\"Laser Edit Text");
                    
                    if (laserEdit) {
                        // --- 09 SWIRL NAME ---
                        var l09 = getLayerSet(laserEdit, "09 Laser Swirl name");
                        var l09text = getLayerSet(l09, "Name"); 
                        if (!l09text && l09.artLayers.length > 0) l09text = l09.artLayers[0];
                        
                        if (l09text && l09text.kind == LayerKind.TEXT) {
                            var swirlTxt = data["Swirl Text 26"] || "ANNARDIESSLINANNARDIESSLIN";
                            var sizes = generateFrontSwirlSizes(swirlTxt.length);
                            updateTextAtomic(l09text, swirlTxt, sizes, "px");
                        }

                        // --- 10 BOLD ---
                        var l10 = getLayerSet(laserEdit, "10 Laser Edited BOLD Text");
                        if(l10) {
                            var l10dob = getLayerSet(l10, "DOB");
                            updateText(l10dob, "first two digits of year", data["First 2 Digits Year"]);
                            updateText(l10dob, "05/09/1959", data["Raised DOB"]); 

                            updateText(l10, "4  7 1  9 0  0", data["DL Remaining"]); 
                            updateText(l10, "ISSUE", data["Issue Full"]);
                            updateText(l10, "EXP", data["Raised EXP"]);
                            
                            updateText(l10, "Last Name", data["Last Name"]);
                            updateText(l10, "Front and Middle Name", data["First Middle"]);
                            updateText(l10, "Address First Line", data["Address 1"]);
                            updateText(l10, "Address Second Line", data["Address 2"]);
                        }
                        
                        // --- 11 LIGHT ---
                        var l11 = getLayerSet(laserEdit, "11 LIGHT");
                        if(l11) {
                            updateText(l11, "Gender", data["Gender"]);
                            updateText(l11, "Height", data["Height"]);
                            updateText(l11, "Eye Color", data["Eyes"]);
                            updateText(l11, "Micro", data["Micro Text"]);
                        }
                    }

                    // 12-15 IMAGES
                    updateText(getLayerSet(laser, "12 Laser Dob Text Under Pic"), "dob", data["Dob Compact"]);

                    var facePath = data["Load Face Image"];
                    if (facePath && new File(facePath).exists) {
                        replaceSmartObject(getLayerSet(laser, "13 Big Photo"), "13b made", new File(facePath), true);
                        replaceSmartObject(getLayerSet(laser, "14 Lens Face"), "13b made copy 3", new File(facePath), true);
                    }

                    var l15 = getLayerSet(laser, "15 Lens Dob");
                    updateText(l15, "month", data["Dob Month"]);
                    updateText(l15, "day", data["Dob Day"]);
                }
            }

        //     // --- FRONT EXPORTS ---
        //     log("Exporting Front Layers...");
        //     var outDir = data["Output Dir"];
        //     var baseName = data["Base Name"];
            
        //     exportPNG(new File(outDir + "\\Front_" + baseName + ".png"));

        //     if (laserEdit) {
        //         exportLayer(doc, getLayerSet(laserEdit, "09 Laser Swirl name"), outDir + "\\09 Laser Swirl name.png");
        //         exportLayer(doc, getLayerSet(laserEdit, "10 Laser Edited BOLD Text"), outDir + "\\10 Laser Edited BOLD Text.png");
        //         exportLayer(doc, getLayerSet(laserEdit, "11 LIGHT"), outDir + "\\11 LIGHT.png");
        //     }
        //     if (laser) {
        //         exportLayer(doc, getLayerSet(laser, "12 Laser Dob Text Under Pic"), outDir + "\\12 Laser Dob Text Under Pic.png");
        //         exportLayer(doc, getLayerSet(laser, "13 Big Photo"), outDir + "\\13 Big Photo.png");
        //         exportLayer(doc, getLayerSet(laser, "14 Lens Face"), outDir + "\\14 Lens Face.png");
        //         exportLayer(doc, getLayerSet(laser, "15 Lens Dob"), outDir + "\\15 Lens Dob.png");
        //     }
        //     exportLayer(doc, getLayerSet(frontGroup, "Raised"), outDir + "\\Raised.png");
            
        //     doc.close(SaveOptions.DONOTSAVECHANGES);
        // } else {
        //     log("ERROR: Front Template Not Found! Checked 'PSDs' folder and Root.");
        // }

        // // =====================================================================
        // // SECTION 2: BACK PSD
        // // =====================================================================
        // if (PATH_BACK) {
        //     log("Opening Back Template: " + PATH_BACK);
        //     openDocument(PATH_BACK, NAME_BACK);
        //     var doc = app.activeDocument;
        //     doc.activeHistoryState = doc.historyStates[0];

        //     var backGroup = getLayerSet(doc, "Back");
        //     if (backGroup) {
        //         log("Processing Back...");
                
        //         // 1 BARCODE
        //         var barcodePath = data["Load Big Barcode"];
        //         if (barcodePath && new File(barcodePath).exists) {
        //             replaceSmartObject(getLayerSet(backGroup, "1 Barcode"), "barcode", new File(barcodePath));
        //         }

        //         // 2 DOC NUM
        //         updateText(getLayerSet(backGroup, "2 Regular Print Doc#"), "Number", data["Doc Discriminator"]);

        //         // --- 3 TOP WINDOW DOB ---
        //         var b3 = getLayerSet(backGroup, "3 Regular Print Top Window");
        //         var b3dob = getLayerSet(b3, "DOB");
        //         if (b3dob && b3dob.kind == LayerKind.TEXT) {
        //             var backDobTxt = data["Dob Swirl"] || "JUN 11 87";
        //             var dobSizes = [350.00, 316.67, 300.00, 333.33, 266.67, 233.33, 233.33, 183.33, 166.67, 166.67];
        //             updateTextAtomic(b3dob, backDobTxt, dobSizes, "pt");
        //         }

        //         // 4 SWIRL
        //         var b4edit = getLayerSet(getLayerSet(backGroup, "4 Regular Print Swirl"), "EDIT");
        //         if (b4edit) {
        //             updateText(b4edit, "Month - First character", data["Back Swirl Month 1"]);
        //             updateText(b4edit, "Month - Second Characer", data["Back Swirl Month 2"]);
        //             updateText(b4edit, "Month - Third Character", data["Back Swirl Month 3"]);
        //             updateText(b4edit, "Day", data["Back Swirl Day"]);
        //             updateText(b4edit, "Year", data["Back Swirl Year"]);
        //             updateText(b4edit, "DL", data["Raw DL"]);
        //         }

        //         // --- 5 RAISED TEXT ---
        //         var b5 = getLayerSet(backGroup, "5 Raised text");
        //         var b5text = getLayerSet(b5, "Raised text");
        //         if (!b5text && b5.artLayers.length > 0) b5text = b5.artLayers[0];

        //         if (b5text && b5text.kind == LayerKind.TEXT) {
        //             var backRaisedTxt = data["Back Raised Text"] || "ANNARDIESSLINANNARDIESSLIN";
        //             var raisedSizes = [
        //                 450.00, 466.67, 500.00, 516.67, 516.67, 508.33, 482.24, 434.02, 
        //                 416.67, 400.00, 391.67, 383.33, 369.72, 383.33, 369.72, 353.64, 
        //                 337.57, 305.42, 273.27, 241.12, 208.97, 192.90, 160.75, 144.67, 
        //                 144.67, 144.67
        //             ];
        //             updateTextAtomic(b5text, backRaisedTxt, raisedSizes, "pt");
        //         }

        //         // 6-7 BARCODES
        //         updateText(getLayerSet(backGroup, "6 Regular Print Light Black"), "Barcode number", data["Back Barcode Num"]);
        //         var smallBarPath = data["Load Small Barcode"];
        //         if (smallBarPath && new File(smallBarPath).exists) {
        //             replaceSmartObject(getLayerSet(backGroup, "7 Bottom Barcode"), "barcode", new File(smallBarPath));
        //         }
        //     }

        //     // --- BACK EXPORTS ---
        //     log("Exporting Back Layers...");
        //     var outDir = data["Output Dir"];
        //     var baseName = data["Base Name"];

        //     exportPNG(new File(outDir + "\\Back_" + baseName + ".png"));

        //     if (backGroup) {
        //         exportLayer(doc, getLayerSet(backGroup, "1 Barcode"), outDir + "\\1 Barcode.png");
        //         exportLayer(doc, getLayerSet(backGroup, "2 Regular Print Doc#"), outDir + "\\2 Regular Print Doc#.png");
        //         exportLayer(doc, getLayerSet(backGroup, "3 Regular Print Top Window"), outDir + "\\3 Regular Print Top Window.png");
        //         exportLayer(doc, getLayerSet(backGroup, "4 Regular Print Swirl"), outDir + "\\4 Regular Print Swirl.png");
        //         exportLayer(doc, getLayerSet(backGroup, "5 Raised text"), outDir + "\\5 Raised text.png");
        //         exportLayer(doc, getLayerSet(backGroup, "6 Regular Print Light Black"), outDir + "\\6 Regular Print Light Black.png");
        //     }
            
        //     doc.saveAs(new File(outDir + "\\" + baseName + ".psd"));
        //     doc.close(SaveOptions.SAVECHANGES);
        } else {
            log("ERROR: Back Template Not Found! Checked 'PSDs' folder and Root.");
        }

        log("NY DUAL PSD DONE.");

    } catch(e) {
        log("ERROR: " + e + " line: " + e.line);
    }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function updateTextAtomic(layer, textContent, sizesArray, unitStr) {
    try {
        app.activeDocument.activeLayer = layer;
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putEnumerated(charIDToTypeID("Lyr "), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);
        
        var textDesc = new ActionDescriptor();
        textDesc.putString(charIDToTypeID("Txt "), textContent);
        
        var styleList = new ActionList();
        
        for (var i = 0; i < textContent.length; i++) {
            var styleDesc = new ActionDescriptor();
            styleDesc.putInteger(charIDToTypeID("From"), i);
            styleDesc.putInteger(charIDToTypeID("T   "), i + 1);
            
            var textStyle = new ActionDescriptor();
            textStyle.putString(charIDToTypeID("FntN"), "Arial-BoldMT");
            textStyle.putString(charIDToTypeID("FntS"), "Arial-BoldMT");
            textStyle.putInteger(charIDToTypeID("FntT"), 1);
            
            var size = (i < sizesArray.length) ? sizesArray[i] : sizesArray[sizesArray.length - 1];
            if (unitStr == "px") {
                textStyle.putUnitDouble(charIDToTypeID("Sz  "), charIDToTypeID("#Pxl"), size);
            } else {
                textStyle.putUnitDouble(charIDToTypeID("Sz  "), charIDToTypeID("#Pnt"), size);
            }
            
            textStyle.putInteger(charIDToTypeID("Krn "), 0); // Auto Kerning

            var colorDesc = new ActionDescriptor();
            colorDesc.putDouble(charIDToTypeID("Rd  "), 0.0);
            colorDesc.putDouble(charIDToTypeID("Grn "), 0.0);
            colorDesc.putDouble(charIDToTypeID("Bl  "), 0.0);
            textStyle.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), colorDesc);
            
            styleDesc.putObject(charIDToTypeID("TxtS"), charIDToTypeID("TxtS"), textStyle);
            styleList.putObject(charIDToTypeID("Txtt"), styleDesc);
        }
        
        textDesc.putList(charIDToTypeID("Txtt"), styleList);
        
        var paraList = new ActionList();
        var paraRange = new ActionDescriptor();
        paraRange.putInteger(charIDToTypeID("From"), 0);
        paraRange.putInteger(charIDToTypeID("T   "), textContent.length);
        var paraStyle = new ActionDescriptor();
        paraStyle.putEnumerated(charIDToTypeID("Algn"), charIDToTypeID("Alg "), charIDToTypeID("Left"));
        paraRange.putObject(charIDToTypeID("Prgd"), charIDToTypeID("Prgd"), paraStyle);
        paraList.putObject(charIDToTypeID("TrnR"), paraRange); 
        
        desc.putObject(charIDToTypeID("T   "), charIDToTypeID("TxLr"), textDesc);
        executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
        
    } catch(e) { log("Atomic Update Error: " + e); }
}

function generateFrontSwirlSizes(len) {
    var arr = [];
    var increment = 16.67;
    var startSize = 100.0;
    var peakIndex = 13;
    
    for (var i = 0; i < len; i++) {
        var size;
        if (i < 2) size = 100.0;
        else if (i <= peakIndex) size = startSize + ((i - 1) * increment);
        else {
            var peakSize = startSize + ((peakIndex - 1) * increment);
            size = peakSize - ((i - peakIndex) * increment);
        }
        if (size < 10) size = 10;
        arr.push(size);
    }
    return arr;
}

function exportLayer(doc, group, savePath) {
    if(!group) return;
    try {
        var state = doc.activeHistoryState;
        for(var i=0; i<doc.layers.length; i++) doc.layers[i].visible = false; 
        
        var p = group;
        while(p && p != doc) { p.visible = true; p = p.parent; }
        group.visible = true;
        
        doc.trim(TrimType.TRANSPARENT, true, true, true, true);
        exportPNG(new File(savePath));
        doc.activeHistoryState = state;
    } catch(e) { log("Export Layer Error: " + e); }
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
            if(p.layers[i].name.toLowerCase().indexOf(t) > -1) return p.layers[i];
        }
    } catch(e) {}
    return null;
}

function updateText(p, n, txt) {
    if(!p || !txt) return;
    try {
        for(var i=0; i<p.artLayers.length; i++) {
            var l = p.artLayers[i];
            if(l.kind == LayerKind.TEXT && l.name.toLowerCase().indexOf(n.toLowerCase()) > -1) {
                l.textItem.contents = txt;
                return;
            }
        }
    } catch(e) {}
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
    } catch(e) {}
}

function exportPNG(fileRef) {
    var pngOpts = new PNGSaveOptions();
    pngOpts.compression = 0;
    pngOpts.interlaced = false;
    app.activeDocument.saveAs(fileRef, pngOpts, true, Extension.LOWERCASE);
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