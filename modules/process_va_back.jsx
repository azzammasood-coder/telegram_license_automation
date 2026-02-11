/**
 * PROCESS VA BACK (JSX)
 */

#target photoshop

// =============================================================================
// SETUP
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
    throw "CRITICAL ERROR: config.json missing";
}

var ROOT_PATH = config.paths.base_dir;
if (ROOT_PATH.charAt(ROOT_PATH.length - 1) != "/" && ROOT_PATH.charAt(ROOT_PATH.length - 1) != "\\") {
    ROOT_PATH += "/";
}

var JOB_FILE  = new File(ROOT_PATH + "active_job.txt");
var LOG_DIR = new Folder(ROOT_PATH + "logs");
if (!LOG_DIR.exists) LOG_DIR.create();
var LOG_FILE = new File(LOG_DIR.fsName + "/process_va_back_logs.txt");

function log(m) {
    LOG_FILE.open("a");
    var time = new Date().toTimeString().split(' ')[0];
    LOG_FILE.writeln("[" + time + "] " + m);
    LOG_FILE.close();
}

// =============================================================================
// HELPERS
// =============================================================================

function setMagnesiumFont(layer) {
    try {
        app.activeDocument.activeLayer = layer;
        var cTID = function(s) { return app.charIDToTypeID(s); };
        var sTID = function(s) { return app.stringIDToTypeID(s); };

        var desc1 = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putProperty(cTID('Prpr'), cTID('TxtS'));
        ref1.putEnumerated(cTID('TxLr'), cTID('Ordn'), cTID('Trgt'));
        desc1.putReference(cTID('null'), ref1);

        var desc2 = new ActionDescriptor();
        desc2.putInteger(sTID("textOverrideFeatureName"), 808465457);
        desc2.putInteger(sTID("typeStyleOperationType"), 3);
        desc2.putString(sTID("fontPostScriptName"), "MagnesiumMVBStd");
        desc2.putString(cTID('FntN'), "Magnesium MVB Std");
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
        
        var desc3 = new ActionDescriptor();
        desc3.putDouble(cTID('Rd  '), 0);
        desc3.putDouble(cTID('Grn '), 0);
        desc3.putDouble(cTID('Bl  '), 0);
        desc2.putObject(cTID('Clr '), sTID("RGBColor"), desc3);
        
        desc2.putBoolean(cTID('Fl  '), true);
        desc2.putBoolean(cTID('Strk'), false);
        
        desc1.putObject(cTID('T   '), cTID('TxtS'), desc2);
        executeAction(cTID('setd'), desc1, DialogModes.NO);
        log("Applied Action Manager Magnesium Font to layer: " + layer.name);
    } catch(e) { log("Error in setMagnesiumFont: " + e); }
}

function setExoticFont(layer) {
    try {
        app.activeDocument.activeLayer = layer;
        var cTID = function(s) { return app.charIDToTypeID(s); };
        var sTID = function(s) { return app.stringIDToTypeID(s); };

        var desc1 = new ActionDescriptor();
        var ref1 = new ActionReference();
        ref1.putProperty(cTID('Prpr'), cTID('TxtS'));
        ref1.putEnumerated(cTID('TxLr'), cTID('Ordn'), cTID('Trgt'));
        desc1.putReference(cTID('null'), ref1);

        var desc2 = new ActionDescriptor();
        desc2.putInteger(sTID("textOverrideFeatureName"), 808465457);
        desc2.putInteger(sTID("typeStyleOperationType"), 3);
        
        // Font Specifics
        desc2.putString(sTID("fontPostScriptName"), "Exotic350BT-Bold");
        desc2.putString(cTID('FntN'), "Exotc350 Bd BT");
        desc2.putString(cTID('FntS'), "Bold");
        desc2.putUnitDouble(cTID('Sz  '), cTID('#Pnt'), 13.9999996948242);
        
        desc2.putInteger(cTID('Scrp'), 0);
        desc2.putInteger(cTID('FntT'), 1);
        desc2.putBoolean(sTID("fontAvailable"), true);
        desc2.putDouble(cTID('HrzS'), 100);
        desc2.putDouble(cTID('VrtS'), 100);
        desc2.putBoolean(sTID("autoLeading"), true);
        desc2.putInteger(cTID('Trck'), 0);
        desc2.putUnitDouble(cTID('Bsln'), cTID('#Pnt'), 0);
        desc2.putEnumerated(cTID('AtKr'), cTID('AtKr'), sTID("metricsKern"));
        
        // Color (Set to Black as per your source)
        var desc3 = new ActionDescriptor();
        desc3.putDouble(cTID('Rd  '), 0);
        desc3.putDouble(cTID('Grn '), 0);
        desc3.putDouble(cTID('Bl  '), 0);
        desc2.putObject(cTID('Clr '), sTID("RGBColor"), desc3);

        desc1.putObject(cTID('T   '), cTID('TxtS'), desc2);
        executeAction(cTID('setd'), desc1, DialogModes.NO);
        
        log("Applied Exotic Font to layer: " + layer.name);
    } catch(e) { log("Error in setExoticFont: " + e); }
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

function updateTextPreserveSpacing(p, n, newTxt) {
    // Replaces the *content* of the text but tries to keep leading spaces from original layer
    if(!p || !newTxt) return;
    try {
        var found = false;
        for(var i=0; i<p.artLayers.length; i++) {
            var l = p.artLayers[i];
            if(l.kind == LayerKind.TEXT && l.name.toLowerCase().indexOf(n.toLowerCase()) > -1) {
                var original = l.textItem.contents;
                
                // Regex to find leading spaces in the existing Photoshop layer
                var match = original.match(/^(\s+)/);
                var prefix = "";
                if (match) {
                    prefix = match[1];
                }
                
                // Combine original spacing prefix with new data
                var finalStr = prefix + newTxt;
                
                l.textItem.contents = finalStr;
                log("Update Text (Preserve Spacing) -> Layer: '" + l.name + "' | Org: [" + original + "] | New: [" + finalStr + "]");
                found = true;
                return;
            }
        }
        if(!found) log("WARNING: Text Layer matching '" + n + "' NOT FOUND in " + p.name);
    } catch(e) { log("Error updating text preserve spacing: " + e); }
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

function generateFrontSwirlSizes() {
    // Hardcoded "Original" character sizes in pt
    return [
        6.00, 7.00, 8.00, 9.00, 10.00, 11.00, 12.00, 12.00, 13.00, 15.00, 
        16.00, 17.00, 18.00, 17.00, 15.00, 14.00, 13.00, 12.00, 12.00, 12.00, 
        11.00, 10.00, 9.00, 7.50, 6.50, 6.20, 5.80, 5.80
    ];
}

function findArtLayer(parent, name) {
    try {
        var n = name.toLowerCase();
        for (var i = 0; i < parent.artLayers.length; i++) {
            if (parent.artLayers[i].name.toLowerCase().indexOf(n) > -1) {
                return parent.artLayers[i];
            }
        }
    } catch(e) {}
    return null;
}

function processDLSmartObject(txt) {
    try {
        // 1. Open Smart Object
        executeAction(stringIDToTypeID("placedLayerEditContents"), new ActionDescriptor(), DialogModes.NO);
        var soDoc = app.activeDocument;
        
        // 2. Find and Edit "DL" text layer
        var dlLayer = findArtLayer(soDoc, "DL");
        if (dlLayer) {
            dlLayer.textItem.contents = txt;
            // Select the layer to apply scale/tracking
            soDoc.activeLayer = dlLayer;
            applyTracking(1300); 
        }
        
        // 3. Close and Save
        soDoc.close(SaveOptions.SAVECHANGES);
    } catch(e) { log("Smart Object DL Error: " + e); }
}

function updateTextAtomic(layer, textContent, sizesArray, unitStr, fontName) {
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
            textStyle.putString(charIDToTypeID("FntN"), fontName); 
            textStyle.putString(charIDToTypeID("FntS"), "Regular"); // Often ignored if FntN is specific
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
            var rawVal = parts.slice(1).join(":"); 

            var val;
            // NEW LOGIC: Do not trim if it's the Name Swirl or DL 3 Chars
            if (key === "Name Swirl" || key === "DL 3 Chars") {
                // Remove only the single leading space used as a separator after the colon
                // and trim the carriage return/newline at the very end
                val = rawVal.replace(/^\s/, '').replace(/[\r\n]+$/, '');
            } else {
                val = rawVal.replace(/^\s+|\s+$/g, '');
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

        var NAME_VA_BACK = config.filenames.va_back || "VA Back.psd";
        var PATH_VA_BACK = findTemplatePath(NAME_VA_BACK, ROOT_PATH);

        if (PATH_VA_BACK) {
            openDocument(PATH_VA_BACK, NAME_VA_BACK);
            var doc = app.activeDocument;
            var backGroup = getLayerSet(doc, "Back");
            if (!backGroup) throw "Layer Group 'Back' not found.";

            // =================================================================
            // 1. BARCODES
            // =================================================================
            var g0001 = getLayerSet(backGroup, "00, 01");
            if (g0001) {
                // "00" Big Barcode (PDF417)
                var pdfPath = data["Load PDF417"];
                if (pdfPath && new File(pdfPath).exists) {
                    replaceSmartObject(g0001, "00", new File(pdfPath), false);
                }

                // "01" Small Barcode (Linear)
                var linPath = data["Load Linear"];
                if (linPath && new File(linPath).exists) {
                    replaceSmartObject(g0001, "01", new File(linPath), false);
                }
            }

            // =================================================================
            // 2. TEXT (Long Barcode Number)
            // =================================================================
            var g0203 = getLayerSet(backGroup, "02, 03");
            if (g0203) {
                var g03 = getLayerSet(g0203, "03");
                if (g03) {
                    // Format: 00619 001872704 23
                    updateText(g03, "Long barcode number", data["Long Barcode"]);
                }
            }

            // =================================================================
            // 3. SIGNATURES
            // =================================================================
            var g0405 = getLayerSet(backGroup, "04, 05");
            if (g0405) {
                var sigTextLayer = findArtLayer(g0405, "Signature Text");
                var sigLaserLayer = findArtLayer(g0405, "05"); // "05" - Laser Signature (Smart Object)
                var sigPath = data["Load Signature Image"];

                if (sigPath && new File(sigPath).exists) {
                    // IMAGE PROVIDED
                    if (sigTextLayer) sigTextLayer.visible = false;
                    if (sigLaserLayer) {
                        sigLaserLayer.visible = true;
                        // Replace Smart Object "05"
                        replaceSmartObject(g0405, "05", new File(sigPath), true);
                    }
                } else {
                    // TEXT ONLY
                    if (sigLaserLayer) sigLaserLayer.visible = false;
                    if (sigTextLayer) {
                        sigTextLayer.visible = true;
                        updateText(g0405, "Signature Text", data["Signature Text"]);
                    }
                }
            }

            // =================================================================
            // 4. DOB CIRCLE
            // =================================================================
            var g06 = getLayerSet(backGroup, "06");
            if (g06) {
                // Month chars
                updateText(g06, "dob month first char", data["DOB Month 1"]);
                updateText(g06, "dob month second char", data["DOB Month 2"]);
                updateText(g06, "dob month third char", data["DOB Month 3"]);
                
                // Month digits
                updateText(g06, "dob month first digit", data["DOB Month"] ? data["DOB Month"].charAt(0) : "0");
                var month1Layer = findArtLayer(g06, "dob month first digit");
                if (month1Layer) setExoticFont(month1Layer);

                updateText(g06, "dob month second digit", data["DOB Month"] ? data["DOB Month"].charAt(1) : "1");
                var month2Layer = findArtLayer(g06, "dob month second digit");
                if (month2Layer) setExoticFont(month2Layer);

                // Day digits
                updateText(g06, "dob day first digit", data["DOB Day 1"]);
                var day1Layer = findArtLayer(g06, "dob day first digit");
                if (day1Layer) setExoticFont(day1Layer);

                updateText(g06, "dob day second digit", data["DOB Day 2"]);
                var day2Layer = findArtLayer(g06, "dob day first digit");
                if (day2Layer) setExoticFont(day2Layer);

                // Year digits (last 2)
                updateText(g06, "dob year secondlast digit", data["DOB Year 3"]);
                var year1Layer = findArtLayer(g06, "dob year secondlast digit");
                if (year1Layer) setExoticFont(year1Layer);

                updateText(g06, "dob year last digit", data["DOB Year 4"]);
                var year2Layer = findArtLayer(g06, "dob year last digit");
                if (year2Layer) setExoticFont(year2Layer);
            }

            // =================================================================
            // 5. RAISED SWIRL (DL NUMBER)
            // =================================================================
            var g0708 = getLayerSet(backGroup, "07, 08");
            if (g0708) {
                var raisedSwirlLayer = findArtLayer(g0708, "08"); // "08" Raised on Swirl
                if (raisedSwirlLayer) {
                    var fullDL = data["DL Char 1"] + data["DL Char 2"] + data["DL Char 3"] + 
                                 data["DL Char 4"] + data["DL Char 5"] + data["DL Char 6"] + 
                                 data["DL Char 7"] + data["DL Char 8"] + data["DL Char 9"];
                    
                    // Sizes from instructions
                    var dlSizes = [5.2, 4.59, 4.0, 3.8, 3.7, 3.6, 3.0, 2.8, 2.97];
                    
                    // 1. Update Text & Atomic Sizing
                    updateTextAtomic(raisedSwirlLayer, fullDL, dlSizes, "pt", "MagnesiumMVBStd");
                    applyTracking(-150)
                    
                    // 2. Set Font explicitly (redundancy)
                    setMagnesiumFont(raisedSwirlLayer);
                    
                    // 3. Apply White Color
                    app.activeDocument.activeLayer = raisedSwirlLayer;
                    applyWhiteColor();
                }
            }

            // =================================================================
            // 6. NAME SWIRL (UPDATED LOGIC)
            // =================================================================
            var g09 = getLayerSet(backGroup, "09");
            if (g09) {
                var raisedNameSwirlLayer = findArtLayer(g09, "Raised Name Swirl");
                if (raisedNameSwirlLayer) {
                    // Construct text: 8 spaces + First + Space + Middle + Space + Last + Space + DL
                    // Python 'Name Swirl' already has [8 spaces + First + Middle + Last + DL].
                    // We just need to ensure atomic sizing matches that structure.
                    
                    var swirlText = data["Name Swirl"]; // Use data from python which includes 8 spaces
                    
                    var swirlSizes = [
                        4.59, 3.72, 3.67, 3.62, 3.56, 3.56, 3.56, 3.4, 
                        3.4, 3.4, 3.4, 3.4, 3.4, 3.4,
                        3.2, 3.0, 2.8, 2.6, 2.4, 2.2, 2.0, 1.8
                    ];                
                    
                    updateTextAtomic(raisedNameSwirlLayer, swirlText, swirlSizes, "pt", "MagnesiumMVBStd");

                    setMagnesiumFont(raisedNameSwirlLayer);
                }
            }


            // =================================================================
            // EXPORTS
            // =================================================================
            var baseOutputDir = data["Output Dir"];
            var outDirBack = baseOutputDir + "/Back";
            
            // Create the "Back" subfolder if it doesn't exist
            var fObj = new Folder(outDirBack);
            if (!fObj.exists) fObj.create();
            
            var baseName = data["Base Name"];
            
            log("--- Exporting Back Layers to: " + outDirBack + " ---");

            if (outDirBack) {
                // 1. Smart Object Layers (00 & 01) in Group "00, 01"
                if (g0001) {
                    exportLayer(doc, findArtLayer(g0001, "00"), outDirBack + "\\00 Big Barcode.png");
                    exportLayer(doc, findArtLayer(g0001, "01"), outDirBack + "\\01 Small Barcode.png");
                }

                // 2. Groups inside "02, 03"
                if (g0203) {
                    exportLayer(doc, getLayerSet(g0203, "03"), outDirBack + "\\03 Edit Text.png");
                    exportLayer(doc, getLayerSet(g0203, "02"), outDirBack + "\\02 Do Not Touch Text.png");
                }

                // 3. Root Groups inside Back
                if (g06) exportLayer(doc, g06, outDirBack + "\\06 - Laser - Big Left Dob Circle.png");
                if (g09) exportLayer(doc, g09, outDirBack + "\\09 - Laser -Swirl.png");
                if (g0708) exportLayer(doc, g0708, outDirBack + "\\07, 08 - Raise - Raised Swirl.png");
                if (g0405) exportLayer(doc, g0405, outDirBack + "\\04, 05 - Laser - Sigs.png");
                
                // Final PSD Save
                if (baseName) {
                    doc.saveAs(new File(outDirBack + "\\" + baseName + ".psd"));
                    log("VA Back Processing Complete.");
                }
            } else {
                log("Output Dir Back not defined.");
            }

        } else {
            log("Template not found: " + NAME_VA_BACK);
        }

    } catch(e) {
        log("Error: " + e);
    }
}

main();