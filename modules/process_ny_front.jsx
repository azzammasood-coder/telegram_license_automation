/**
 * PROCESS NY FRONT (JSX)
 * Handles Front PSD Logic Only with Dedicated Logging & Styling
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
var LOG_FILE = new File(LOG_DIR.fsName + "/process_ny_front_logs.txt");

function initLog() {
    LOG_FILE.open("w"); 
    LOG_FILE.write("--- NY FRONT LOG START ---\n"); 
    LOG_FILE.close();
}

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

// =============================================================================
// MAIN LOGIC
// =============================================================================

function main() {
    initLog();
    log("Starting Front Process...");
    
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

        var NAME_FRONT = config.filenames && config.filenames.ny_front ? config.filenames.ny_front : "Front NY Automation.psd";
        var PATH_FRONT = findTemplatePath(NAME_FRONT, ROOT_PATH);

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
                    log("Processing 'Raised' Section...");
                    // Using updateText for standard replacement, spacing handled in Python
                    updateText(getLayerSet(raised, "16 RAISED DL"), "DL 3 characters", data["DL 3 Chars"]);
                    
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
                    log("Processing 'Laser' Section...");

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
                            
                            // CONFIG FOR SWIRL STYLE
                            // Font: Arial (Black type usually implies 'Arial-Black' or 'ArialMT' with faux bold)
                            // We use 'Arial-Black' if available, otherwise 'Arial-BoldMT' + Faux Bold
                            var swirlStyle = {
                                fontName: "Arial-Black", // Try specific black font
                                fauxBold: true,
                                antiAlias: "Strn" // Strong
                            };

                            log("Updating Front Swirl (Styled). Text: " + swirlTxt);
                            var sizes = generateFrontSwirlSizes(swirlTxt.length);
                            updateTextAtomic(l09text, swirlTxt, sizes, "px", swirlStyle);
                            applySwirlStyle();
                            
                        } else { log("ERROR: Could not find 'Name' text layer in Swirl group."); }

                        // --- 10 BOLD ---
                        var l10 = getLayerSet(laserEdit, "10 Laser Edited BOLD Text");
                        if(l10) {
                            var l10dob = getLayerSet(l10, "DOB");
                            updateText(l10dob, "first two digits of year", data["First 2 Digits Year"]);
                            updateText(l10dob, "05/09/1959", data["Raised DOB"]); 

                            updateText(l10, "DL remaining characters", data["DL Remaining"]);
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
                            updateHeightPreserve(getLayerSet(l11, "Height"), data["Height"]);
                            updateText(l11, "Eye Color", data["Eyes"]);
                            updateText(l11, "Micro", data["Micro Text"]);
                        }
                    }

                    // LAYER 12 AUTOMATION
                    log("Updating 12 Laser Dob Text Under Pic...");
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

            // --- EXPORTS ---
            var outDir = data["Output Dir"];
            var baseName = data["Base Name"];

            // --- ADDITIONAL EXPORT REQUIREMENTS (FRONT) ---
            log("--- Exporting Full Front PNGs ---");

            // 1st Full PNG Front: VISIBLE ONLY: 01, 02, 03, 04, 05, 09, 10, 11, 12, 13
            hideAllInSet(frontGroup);
            showLayerPath(laser, "01, 02, 03, 04, 05");
            showLayerPath(laserEdit, "09 Laser Swirl name");
            showLayerPath(laserEdit, "10 Laser Edited BOLD Text");
            showLayerPath(laserEdit, "11 LIGHT");
            showLayerPath(laser, "12 Laser Dob Text Under Pic");
            showLayerPath(laser, "13 Big Photo");
            exportPNG(new File(outDir + "\\1st_Full_PNG_Front.png"));

            // 2nd Full PNG Front: VISIBLE ONLY: RAISED
            hideAllInSet(frontGroup);
            showLayerPath(frontGroup, "Raised");
            exportPNG(new File(outDir + "\\2nd_Full_PNG_Front.png"));
  
            // exportPNG(new File(outDir + "\\Front_" + baseName + ".png"));

            log("--- Exporting Layers ---");
            if (laserEdit) {
                exportLayer(doc, getLayerSet(laserEdit, "09 Laser Swirl name"), outDir + "\\09 Laser Swirl name.png");
                exportLayer(doc, getLayerSet(laserEdit, "10 Laser Edited BOLD Text"), outDir + "\\10 Laser Edited BOLD Text.png");
                exportLayer(doc, getLayerSet(laserEdit, "11 LIGHT"), outDir + "\\11 LIGHT.png");
            }
            if (laser) {
                exportLayer(doc, getLayerSet(laser, "12 Laser Dob Text Under Pic"), outDir + "\\12 Laser Dob Text Under Pic.png");
                exportLayer(doc, getLayerSet(laser, "13 Big Photo"), outDir + "\\13 Big Photo.png");
                exportLayer(doc, getLayerSet(laser, '"14" Lens Face'), outDir + "\\14 Lens Face.png");
                exportLayer(doc, getLayerSet(laser, '"15" Lens Dob'), outDir + "\\15 Lens Dob.png");
            }
            exportLayer(doc, getLayerSet(frontGroup, "Raised"), outDir + "\\Raised.png");

            doc.saveAs(new File(outDir + "\\" + baseName + ".psd"));
            // doc.close(SaveOptions.DONOTSAVECHANGES);
            log("Front Processing Complete.");
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
        var desc5 = new ActionDescriptor();
        var ref3 = new ActionReference();
        ref3.putProperty(cTID('Prpr'), cTID('TxtS'));
        ref3.putEnumerated(cTID('TxLr'), cTID('Ordn'), cTID('Trgt'));
        desc5.putReference(cTID('null'), ref3);
        var desc6 = new ActionDescriptor();
        desc6.putInteger(sTID("textOverrideFeatureName"), 808465459);
        desc6.putInteger(sTID("typeStyleOperationType"), 3);
        desc6.putBoolean(sTID("syntheticBold"), true);
        desc5.putObject(cTID('T   '), cTID('TxtS'), desc6);
        executeAction(cTID('setd'), desc5, DialogModes.NO);

        // Step 4: Set Anti-Alias to Strong
        var desc7 = new ActionDescriptor();
        var ref4 = new ActionReference();
        ref4.putProperty(cTID('Prpr'), cTID('AntA'));
        ref4.putEnumerated(cTID('TxLr'), cTID('Ordn'), cTID('Trgt'));
        desc7.putReference(cTID('null'), ref4);
        desc7.putEnumerated(cTID('T   '), cTID('Annt'), cTID('AnSt'));
        executeAction(cTID('setd'), desc7, DialogModes.NO);

    } catch(e) { log("Error in applySwirlStyle: " + e); }
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

function updateTextAtomic(layer, textContent, sizesArray, unitStr) {
    // Replaces text AND applies character specific sizing in one history step.
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
            textStyle.putString(charIDToTypeID("FntN"), "Arial-BoldMT"); // Default font
            textStyle.putString(charIDToTypeID("FntS"), "Arial-BoldMT");
            textStyle.putInteger(charIDToTypeID("FntT"), 1);
            
            var size = (i < sizesArray.length) ? sizesArray[i] : sizesArray[sizesArray.length - 1];
            if (unitStr == "px") {
                textStyle.putUnitDouble(charIDToTypeID("Sz  "), charIDToTypeID("#Pxl"), size);
            } else {
                textStyle.putUnitDouble(charIDToTypeID("Sz  "), charIDToTypeID("#Pnt"), size);
            }
            
            // Auto Kerning 0 (VA)
            textStyle.putInteger(charIDToTypeID("Krn "), 0);

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
        
        // Paragraph Style
        var paraList = new ActionList();
        var paraRange = new ActionDescriptor();
        paraRange.putInteger(charIDToTypeID("From"), 0);
        paraRange.putInteger(charIDToTypeID("T   "), textContent.length);
        var paraStyle = new ActionDescriptor();
        paraStyle.putEnumerated(charIDToTypeID("Algn"), charIDToTypeID("Alg "), charIDToTypeID("Left"));
        paraRange.putObject(charIDToTypeID("Prgd"), charIDToTypeID("Prgd"), paraStyle);
        paraList.putObject(charIDToTypeID("TrnR"), paraRange); 
        
        // Finalize
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