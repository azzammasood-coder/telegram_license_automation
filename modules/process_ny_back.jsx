/**
 * PROCESS NY BACK (JSX)
 * Fixed: Updated Point Sizes for DOB and Raised Text
 */

#target photoshop

// =============================================================================
// SETUP & UTILS
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
    throw "CRITICAL ERROR: config.json missing at " + CFG_FILE.fsName;
}

var ROOT_PATH = config.paths.base_dir;
if (ROOT_PATH.charAt(ROOT_PATH.length - 1) != "/" && ROOT_PATH.charAt(ROOT_PATH.length - 1) != "\\") {
    ROOT_PATH += "/";
}

var JOB_FILE  = new File(ROOT_PATH + "active_job.txt");

// --- LOGGING SETUP ---
var LOG_DIR = new Folder(ROOT_PATH + "logs");
if (!LOG_DIR.exists) LOG_DIR.create();
var LOG_FILE = new File(LOG_DIR.fsName + "/process_ny_back_logs.txt");

function initLog() {
    LOG_FILE.open("w"); 
    LOG_FILE.write("--- NY BACK LOG START ---\n"); 
    LOG_FILE.close();
}

function log(m) {
    LOG_FILE.open("a");
    var time = new Date().toTimeString().split(' ')[0];
    LOG_FILE.writeln("[" + time + "] " + m);
    LOG_FILE.close();
}

function findTemplatePath(filename, root) {
    var psdFolderFile = new File(root + "PSDs/" + filename);
    if (psdFolderFile.exists) return psdFolderFile.fsName;
    var rootFile = new File(root + filename);
    if (rootFile.exists) return rootFile.fsName;
    return null;
}

// =============================================================================
// MAIN LOGIC
// =============================================================================

function main() {
    initLog();
    log("Starting Back Process...");
    
    app.preferences.rulerUnits = Units.PIXELS;
    app.preferences.typeUnits = TypeUnits.POINTS; 
    app.displayDialogs = DialogModes.NO;

    try {
        // READ DATA
        if (!JOB_FILE.exists) throw "No active_job.txt found.";
        JOB_FILE.open("r");
        var dataPath = JOB_FILE.read();
        JOB_FILE.close();
        
        var dataFile = new File(dataPath);
        if (!dataFile.exists) throw "Data file not found: " + dataPath;
        var data = parseDataFile(dataFile);

        // PROCESS
        var NAME_BACK  = config.filenames && config.filenames.ny_back ? config.filenames.ny_back : "Back NY Automation.psd";
        var PATH_BACK  = findTemplatePath(NAME_BACK, ROOT_PATH);

        if (PATH_BACK) {
            log("Opening Back Template: " + PATH_BACK);
            openDocument(PATH_BACK, NAME_BACK);
            var doc = app.activeDocument;
            doc.activeHistoryState = doc.historyStates[0];

            var backGroup = getLayerSet(doc, "Back");
            if (backGroup) {
                log("Found 'Back' Group. Starting Updates...");


                // --- 2 DOC NUM ---
                var b2 = getLayerSet(backGroup, "2 Regular Print Doc#");
                if (b2) {
                    updateText(b2, "Number", data["Doc Discriminator"]);
                }

                // --- 3 TOP WINDOW DOB (ATOMIC SIZING) ---
                var b3 = getLayerSet(backGroup, "3 Regular Print Top Window");
                var b3dob = getLayerSet(b3, "DOB");
                if (b3dob && b3dob.kind == LayerKind.TEXT) {
                    var backDobTxt = data["Dob Swirl"] || "JUN 11 87";
                    
                    // CORRECTED SIZES (PT)
                    var dobSizes = [
                        21.00, 19.00, 18.00, 20.00, 16.00, 
                        14.00, 14.00, 11.00, 10.00, 10.00
                    ];
                    
                    log("Updating Back Window DOB (Atomic): " + backDobTxt);
                    updateTextAtomic(b3dob, backDobTxt, dobSizes, "pt"); 
                    applySwirlStyle();
                    applyWhiteColor();
                    applyTracking(-40);
                } else { log("ERROR: Back Top Window DOB layer not found."); }

                // --- 5 RAISED TEXT (ATOMIC SIZING) ---
                var b5 = getLayerSet(backGroup, "5 Raised text");
                var b5text = getLayerSet(b5, "Raised text");
                
                if (b5text && b5text.kind == LayerKind.TEXT) {
                    var backRaisedTxt = data["Back Raised Text"] || "ANNARDIESSLINANNARDIESSLIN"; 
                    
                    // CORRECTED SIZES (PT)
                    var raisedSizes = [
                        27.00, 28.00, 30.00, 31.00, 31.00, 30.50, 28.93, 26.04, 
                        25.00, 24.00, 23.50, 23.00, 22.18, 23.00, 22.18, 21.22, 
                        20.25, 18.33, 16.40, 14.47, 12.54, 11.57, 9.64, 8.68, 
                        8.68, 8.68
                    ];

                    log("Updating Back Raised Text (Atomic): " + backRaisedTxt);
                    updateTextAtomic(b5text, backRaisedTxt, raisedSizes, "pt");
                    applySwirlStyle();
                    applyTracking(200);
                } else { log("ERROR: Back Raised Text layer not found."); }

                // --- 4 SWIRL ---
                var b4 = getLayerSet(backGroup, "4 Regular Print Swirl");
                var b4edit = getLayerSet(b4, "EDIT");
                if (b4edit) {
                    log("Processing Back Swirl Edit Group...");
                    updateText(b4edit, "Month - First character", data["Back Swirl Month 1"]);
                    updateText(b4edit, "Month - Second Characer", data["Back Swirl Month 2"]);
                    updateText(b4edit, "Month - Third Character", data["Back Swirl Month 3"]);
                    updateText(b4edit, "Day", data["Back Swirl Day"]);
                    updateText(b4edit, "Year", data["Back Swirl Year"]);
                    updateText(b4edit, "DL", data["Raw DL"]);
                }


                // --- 6 LIGHT BLACK ---
                var b6 = getLayerSet(backGroup, "6 Regular Print Light Black");
                if (b6) {
                    updateText(b6, "Barcode number", data["Back Barcode Num"]);
                }

                // --- 1 BARCODE ---
                var b1 = getLayerSet(backGroup, "1 Barcode");
                var barcodePath = data["Load Big Barcode"];
                if (barcodePath && new File(barcodePath).exists && b1) {
                    replaceSmartObject(b1, "barcode", new File(barcodePath));
                } else { log("WARNING: Big Barcode file missing or group 1 not found."); }

                // --- 7 BOTTOM BARCODE ---
                var b7 = getLayerSet(backGroup, "7 Bottom Barcode");
                var smallBarPath = data["Load Small Barcode"];
                if (smallBarPath && new File(smallBarPath).exists && b7) {
                    var targetLayer = "barcode";
                    if(getLayerSet(b7, "Layer 18")) targetLayer = "Layer 18";
                    
                    replaceSmartObject(b7, targetLayer, new File(smallBarPath));
                }
            } else { log("CRITICAL ERROR: 'Back' master group not found in PSD."); }

            // --- EXPORTS ---
            var outDir = data["Output Dir"];
            var baseName = data["Base Name"];

            // 1. Export Full Back PNG
            
            // exportPNG(new File(outDir + "\\Back_" + baseName + ".png"));

            log("--- Exporting Full Back PNGs ---");
            // 1st Full PNG BACK: VISIBLE ONLY: 1, 2, 3, 4, 6, 7
            hideAllInSet(backGroup);
            showLayerPath(backGroup, "1 Barcode");
            showLayerPath(backGroup, "2 Regular Print Doc#");
            showLayerPath(backGroup, "3 Regular Print Top Window");
            showLayerPath(backGroup, "4 Regular Print Swirl");
            showLayerPath(backGroup, "6 Regular Print Light Black");
            showLayerPath(backGroup, "7 Bottom Barcode");
            exportPNG(new File(outDir + "\\1st_Full_PNG_BACK.png"));

            // 2nd Full PNG BACK: VISIBLE ONLY: 5
            hideAllInSet(backGroup);
            showLayerPath(backGroup, "5 Raised text");
            exportPNG(new File(outDir + "\\2nd_Full_PNG_BACK.png"));

            // 2. Export Layers
            log("--- Exporting Layers ---");
            if (backGroup) {
                exportLayer(doc, getLayerSet(backGroup, "1 Barcode"), outDir + "\\1 Barcode.png");
                exportLayer(doc, getLayerSet(backGroup, "2 Regular Print Doc#"), outDir + "\\2 Regular Print Doc#.png");
                exportLayer(doc, getLayerSet(backGroup, "3 Regular Print Top Window"), outDir + "\\3 Regular Print Top Window.png");
                exportLayer(doc, getLayerSet(backGroup, "4 Regular Print Swirl"), outDir + "\\4 Regular Print Swirl.png");
                exportLayer(doc, getLayerSet(backGroup, "5 Raised text"), outDir + "\\5 Raised text.png");
                exportLayer(doc, getLayerSet(backGroup, "6 Regular Print Light Black"), outDir + "\\6 Regular Print Light Black.png");
            }
            
            doc.saveAs(new File(outDir + "\\" + baseName + ".psd"));
            // doc.close(SaveOptions.SAVECHANGES);
            log("Back Processing Complete.");
        } else {
            log("CRITICAL ERROR: Back Template Not Found! Checked 'PSDs' folder and Root.");
        }

    } catch(e) {
        log("FATAL ERROR: " + e + " line: " + e.line);
    }
}

// =============================================================================
// HELPERS
// =============================================================================

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

function applyWhiteColor() {
    try {
        log("Applying White Color...");
        var desc = new ActionDescriptor();
        var ref = new ActionReference();
        ref.putProperty(charIDToTypeID("Prpr"), charIDToTypeID("TxtS"));
        ref.putEnumerated(charIDToTypeID("TxLr"), charIDToTypeID("Ordn"), charIDToTypeID("Trgt"));
        desc.putReference(charIDToTypeID("null"), ref);
        
        var textStyle = new ActionDescriptor();
        var colorDesc = new ActionDescriptor();
        colorDesc.putDouble(charIDToTypeID("Rd  "), 255.0);
        colorDesc.putDouble(charIDToTypeID("Grn "), 255.0);
        colorDesc.putDouble(charIDToTypeID("Bl  "), 255.0);
        
        textStyle.putObject(charIDToTypeID("Clr "), charIDToTypeID("RGBC"), colorDesc);
        desc.putObject(charIDToTypeID("T   "), charIDToTypeID("TxtS"), textStyle);
        
        executeAction(charIDToTypeID("setd"), desc, DialogModes.NO);
    } catch(e) { log("Error setting white color: " + e); }
}

function applySwirlStyle() {
    // Helper function to apply specific styling (Arial Black, Faux Bold, Strong AA)
    // Based on user provided ScriptListener output
    try {
        log("Applying Swirl Styles (Arial Black/FauxBold)...");
        var cTID = function(s) { return app.charIDToTypeID(s); };
        var sTID = function(s) { return app.stringIDToTypeID(s); };

        // Step 1: Base Reset (Myriad Pro / Defaults)
        // This ensures subsequent style applications don't conflict with existing ranges
        var desc1 = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putProperty(cTID('Prpr'), cTID('TxtS'));
        ref1.putEnumerated(cTID('TxLr'), cTID('Ordn'), cTID('Trgt'));
        desc1.putReference(cTID('null'), ref1);
        var desc2 = new ActionDescriptor();
        desc2.putInteger(sTID("textOverrideFeatureName"), 808465457);
        desc2.putInteger(sTID("typeStyleOperationType"), 3);
        desc2.putString(sTID("fontPostScriptName"), "MyriadPro-Regular");
        desc2.putString(cTID('FntN'), "Myriad Pro");
        desc2.putString(cTID('FntS'), "Regular");
        desc2.putInteger(cTID('Scrp'), 0);
        desc2.putInteger(cTID('FntT'), 0);
        desc2.putBoolean(sTID("fontAvailable"), true);
        desc2.putDouble(cTID('HrzS'), 100);
        desc2.putDouble(cTID('VrtS'), 100);
        desc2.putBoolean(sTID("syntheticBold"), false);
        desc2.putBoolean(sTID("syntheticItalic"), false);
        desc2.putBoolean(sTID("autoLeading"), true);
        desc2.putInteger(cTID('Trck'), 0);
        desc2.putUnitDouble(cTID('Bsln'), cTID('#Pnt'), 0);
        desc2.putDouble(sTID("characterRotation"), 0);
        desc2.putEnumerated(cTID('AtKr'), cTID('AtKr'), sTID("metricsKern"));
        desc2.putEnumerated(sTID("fontCaps"), sTID("fontCaps"), cTID('Nrml'));
        desc2.putEnumerated(sTID("digitSet"), sTID("digitSet"), sTID("defaultDigits"));
        desc2.putEnumerated(sTID("dirOverride"), sTID("dirOverride"), sTID("dirOverrideDefault"));
        desc2.putEnumerated(sTID("kashidas"), sTID("kashidas"), sTID("kashidaDefault"));
        desc2.putEnumerated(sTID("diacVPos"), sTID("diacVPos"), sTID("diacVPosOpenType"));
        desc2.putUnitDouble(sTID("diacXOffset"), cTID('#Pnt'), 0);
        desc2.putUnitDouble(sTID("diacYOffset"), cTID('#Pnt'), 0);
        desc2.putUnitDouble(sTID("markYDistFromBaseline"), cTID('#Pnt'), 6);
        desc2.putEnumerated(sTID("baseline"), sTID("baseline"), cTID('Nrml'));
        desc2.putEnumerated(sTID("otbaseline"), sTID("otbaseline"), cTID('Nrml'));
        desc2.putEnumerated(sTID("strikethrough"), sTID("strikethrough"), sTID("strikethroughOff"));
        desc2.putEnumerated(cTID('Undl'), cTID('Undl'), sTID("underlineOff"));
        desc2.putUnitDouble(sTID("underlineOffset"), cTID('#Pnt'), 0);
        desc2.putBoolean(sTID("ligature"), true);
        desc2.putBoolean(sTID("altligature"), false);
        desc2.putBoolean(sTID("contextualLigatures"), false);
        desc2.putBoolean(sTID("alternateLigatures"), false);
        desc2.putBoolean(sTID("oldStyle"), false);
        desc2.putBoolean(sTID("fractions"), false);
        desc2.putBoolean(sTID("ordinals"), false);
        desc2.putBoolean(sTID("swash"), false);
        desc2.putBoolean(sTID("titling"), false);
        desc2.putBoolean(sTID("connectionForms"), false);
        desc2.putBoolean(sTID("stylisticAlternates"), false);
        desc2.putInteger(sTID("stylisticSets"), 0);
        desc2.putBoolean(sTID("ornaments"), false);
        desc2.putBoolean(sTID("justificationAlternates"), false);
        desc2.putEnumerated(sTID("figureStyle"), sTID("figureStyle"), cTID('Nrml'));
        desc2.putBoolean(sTID("proportionalMetrics"), false);
        desc2.putBoolean(cTID('kana'), false);
        desc2.putBoolean(sTID("italics"), false);
        desc2.putBoolean(cTID('ruby'), false);
        desc2.putEnumerated(sTID("baselineDirection"), sTID("baselineDirection"), sTID("withStream"));
        desc2.putEnumerated(sTID("textLanguage"), sTID("textLanguage"), sTID("englishLanguage"));
        desc2.putEnumerated(sTID("japaneseAlternate"), sTID("japaneseAlternate"), sTID("defaultForm"));
        desc2.putDouble(sTID("mojiZume"), 0);
        desc2.putEnumerated(sTID("gridAlignment"), sTID("gridAlignment"), sTID("roman"));
        desc2.putBoolean(sTID("enableWariChu"), false);
        desc2.putInteger(sTID("wariChuCount"), 2);
        desc2.putInteger(sTID("wariChuLineGap"), 0);
        desc2.putDouble(sTID("wariChuScale"), 0.5);
        desc2.putInteger(sTID("wariChuWidow"), 2);
        desc2.putInteger(sTID("wariChuOrphan"), 2);
        desc2.putEnumerated(sTID("wariChuJustification"), sTID("wariChuJustification"), sTID("wariChuAutoJustify"));
        desc2.putInteger(sTID("tcyUpDown"), 0);
        desc2.putInteger(sTID("tcyLeftRight"), 0);
        desc2.putDouble(sTID("leftAki"), -1);
        desc2.putDouble(sTID("rightAki"), -1);
        desc2.putInteger(sTID("jiDori"), 0);
        desc2.putBoolean(sTID("noBreak"), false);
        var colorDesc = new ActionDescriptor();
        colorDesc.putDouble(cTID('Rd  '), 0);
        colorDesc.putDouble(cTID('Grn '), 0);
        colorDesc.putDouble(cTID('Bl  '), 0);
        desc2.putObject(cTID('Clr '), sTID("RGBColor"), colorDesc);
        desc2.putBoolean(cTID('Fl  '), true);
        desc2.putBoolean(cTID('Strk'), false);
        desc2.putBoolean(sTID("fillFirst"), true);
        desc2.putBoolean(sTID("fillOverPrint"), false);
        desc2.putBoolean(sTID("strokeOverPrint"), false);
        desc2.putEnumerated(sTID("lineCap"), sTID("lineCap"), sTID("buttCap"));
        desc2.putEnumerated(sTID("lineJoin"), sTID("lineJoin"), sTID("miterJoin"));
        desc2.putUnitDouble(sTID("lineWidth"), cTID('#Pnt'), 0.06);
        desc2.putUnitDouble(sTID("miterLimit"), cTID('#Pnt'), 0.24);
        desc2.putDouble(sTID("lineDashoffset"), 0);
        desc1.putObject(cTID('T   '), cTID('TxtS'), desc2);
        executeAction(cTID('setd'), desc1, DialogModes.NO);

        // Step 2: Set Font to Arial-Black
        var desc3 = new ActionDescriptor();
        var ref2 = new ActionReference();
        ref2.putProperty(cTID('Prpr'), cTID('TxtS'));
        ref2.putEnumerated(cTID('TxLr'), cTID('Ordn'), cTID('Trgt'));
        desc3.putReference(cTID('null'), ref2);
        var desc4 = new ActionDescriptor();
        desc4.putInteger(sTID("textOverrideFeatureName"), 808465457);
        desc4.putInteger(sTID("typeStyleOperationType"), 3);
        desc4.putString(sTID("fontPostScriptName"), "Arial-Black");
        desc4.putString(cTID('FntN'), "Arial");
        desc4.putString(cTID('FntS'), "Black");
        desc4.putInteger(cTID('Scrp'), 0);
        desc4.putInteger(cTID('FntT'), 1);
        desc4.putBoolean(sTID("fontAvailable"), true);
        desc3.putObject(cTID('T   '), cTID('TxtS'), desc4);
        executeAction(cTID('setd'), desc3, DialogModes.NO);

        // Step 3: Enable Faux Bold
        // var desc5 = new ActionDescriptor();
        // var ref3 = new ActionReference();
        // ref3.putProperty(cTID('Prpr'), cTID('TxtS'));
        // ref3.putEnumerated(cTID('TxLr'), cTID('Ordn'), cTID('Trgt'));
        // desc5.putReference(cTID('null'), ref3);
        // var desc6 = new ActionDescriptor();
        // desc6.putInteger(sTID("textOverrideFeatureName"), 808465459);
        // desc6.putInteger(sTID("typeStyleOperationType"), 3);
        // desc6.putBoolean(sTID("syntheticBold"), true);
        // desc5.putObject(cTID('T   '), cTID('TxtS'), desc6);
        // executeAction(cTID('setd'), desc5, DialogModes.NO);

        // Step 4: Set Anti-Alias to Strong
        // var desc7 = new ActionDescriptor();
        // var ref4 = new ActionReference();
        // ref4.putProperty(cTID('Prpr'), cTID('AntA'));
        // ref4.putEnumerated(cTID('TxLr'), cTID('Ordn'), cTID('Trgt'));
        // desc7.putReference(cTID('null'), ref4);
        // desc7.putEnumerated(cTID('T   '), cTID('Annt'), cTID('AnSt'));
        // executeAction(cTID('setd'), desc7, DialogModes.NO);

    } catch(e) { log("Error in applySwirlStyle: " + e); }
}

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
            
            // Auto Kerning 0
            textStyle.putInteger(charIDToTypeID("Krn "), 0);
            
            // Tracking 0
            textStyle.putInteger(charIDToTypeID("Trck"), 0);

            // Black Color
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

main();