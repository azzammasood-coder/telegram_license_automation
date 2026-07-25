// Shared library, #included by license_generator.jsx and upsheet_automation.jsx.
// Not a standalone script - has no #target and does nothing on its own.

// --- POLYFILLS ---
if (!Object.keys) {
    Object.keys = function(obj) {
        var keys = [];
        for (var k in obj) {
            if (obj.hasOwnProperty(k)) keys.push(k);
        }
        return keys;
    };
}
if (!Array.prototype.map) {
    Array.prototype.map = function(fn, ctx) {
        var result = [];
        for (var i = 0, len = this.length; i < len; i++) {
            result.push(fn.call(ctx, this[i], i, this));
        }
        return result;
    };
}
if (!Array.prototype.filter) {
    Array.prototype.filter = function(fn, ctx) {
        var result = [];
        for (var i = 0, len = this.length; i < len; i++) {
            if (fn.call(ctx, this[i], i, this)) result.push(this[i]);
        }
        return result;
    };
}
if (!Array.prototype.forEach) {
    Array.prototype.forEach = function(fn, ctx) {
        for (var i = 0, len = this.length; i < len; i++) {
            fn.call(ctx, this[i], i, this);
        }
    };
}
if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(item) {
        for (var i = 0, len = this.length; i < len; i++) {
            if (this[i] === item) return i;
        }
        return -1;
    };
}
if (!String.prototype.trim) {
    String.prototype.trim = function() {
        return this.replace(/^\s+|\s+$/g, "");
    };
}
if (!String.prototype.padStart) {
    String.prototype.padStart = function(targetLength, padString) {
        var str = String(this);
        padString = String(padString || " ");
        while (str.length < targetLength) {
            str = padString + str;
        }
        return str.length > targetLength ? str.slice(str.length - targetLength) : str;
    };
}

// --- LOGGING SETUP ---
// scriptFile must already be set by the including script (its own $.fileName)
// before this #include - ExtendScript's #include tracks each statement's
// originating file, so $.fileName evaluated here would resolve to this file
// (shared/common.jsx) instead of the main script one directory up.
var logFolder = new Folder(scriptFile.parent.fsName + "/logs");
if (!logFolder.exists) {
    logFolder.create();
}
var logFile = new File(logFolder.fsName + "/card_generator.log");

function initLog(headerLabel) {
    logFile.open("w");
    logFile.writeln("--- " + (headerLabel || "Card Generator") + " Process Started: " + new Date().toLocaleString() + " ---");
    logFile.close();
}

function log(message) {
    logFile.open("a");
    var time = new Date().toTimeString().split(' ')[0];
    logFile.writeln("[" + time + "] " + message);
    logFile.close();
}

// --- CONFIG.INI PARSING ---
var configData = {};

function parseConfigIni(file) {
    if (!file.exists) {
        log("Config file not found: " + file.fsName);
        return {};
    }
    file.open("r");
    var content = file.read();
    file.close();

    if (typeof content !== "string") {
        content = String(content);
    }

    var lines = content.split(/\r\n|\n/);
    var currentSection = "";
    var result = {};
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (line && typeof line.toString === "function") {
            line = line.toString();
        } else {
            line = String(line);
        }
        line = line.replace(/^\s+|\s+$/g, "");
        if (line === "" || line.indexOf(";") === 0 || line.indexOf("#") === 0) continue;
        var sectionMatch = line.match(/^\[(.+)\]$/);
        if (sectionMatch) {
            currentSection = sectionMatch[1].replace(/^\s+|\s+$/g, "");
            result[currentSection] = {};
        } else {
            var eqIndex = line.indexOf("=");
            if (eqIndex > 0) {
                var key = line.substring(0, eqIndex).replace(/^\s+|\s+$/g, "");
                var val = line.substring(eqIndex + 1).replace(/^\s+|\s+$/g, "");
                if (currentSection) {
                    result[currentSection][key] = val;
                }
            }
        }
    }
    return result;
}

function loadConfig() {
    var configFile = new File(scriptFile.parent.fsName + "/config.ini");
    configData = parseConfigIni(configFile);
    log("Loaded config sections: " + Object.keys(configData).join(", "));
}

function getTemplatePaths(state) {
    var section = state.toUpperCase();
    if (configData[section]) {
        return configData[section];
    }
    for (var key in configData) {
        if (key.toUpperCase() === section) {
            return configData[key];
        }
    }
    return null;
}

function getGlobalConfigValue(key) {
    var section = configData["GLOBAL"] || configData["Global"] || configData["global"];
    return section ? section[key] : null;
}

// --- CSV PARSING ---
var csvData = null;
var csvHeaders = [];

function parseCSV(file) {
    if (!file.exists) return null;
    file.open("r");
    var content = file.read();
    file.close();

    if (content && typeof content.toString === "function") {
        content = content.toString();
    } else {
        content = String(content);
    }

    var lines = content.split(/\r\n|\n/);
    if (lines.length < 2) return null;

    csvHeaders = lines[0].split(",").map(function(h) {
        var s = h.toString ? h.toString() : String(h);
        return s.replace(/^\s+|\s+$/g, "");
    });
    var data = [];
    // Start from index 2 to skip header row (0) and description row (1)
    for (var i = 2; i < lines.length; i++) {
        var lineStr = lines[i];
        if (lineStr && typeof lineStr.toString === "function") {
            lineStr = lineStr.toString();
        } else {
            lineStr = String(lineStr);
        }
        if (!lineStr.replace(/^\s+|\s+$/g, "")) continue;
        var values = parseCSVLine(lines[i]);
        var row = {};
        for (var j = 0; j < csvHeaders.length && j < values.length; j++) {
            var val = stripQuotes(values[j]).replace(/^\s+|\s+$/g, "");
            row[csvHeaders[j]] = val;
        }
        data.push(row);
    }
    return data;
}

function parseCSVLine(line) {
    var result = [];
    var current = "";
    var inQuotes = false;
    for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') {
            if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

// Strips any number of leading/trailing quote chars (defensive against
// odd multi-quote CSV escaping - the plain single-quote-strip regex can
// leave a straggler quote on some fields).
function stripQuotes(str) {
    if (!str) return str;
    return str.replace(/^"+|"+$/g, "");
}

// Shared naming convention for each person's output subfolder:
// "FIRSTNAME LASTNAME STATE DOBYEAR" (space-separated, filesystem-safe).
// Used both when license_generator.jsx creates the folder and when
// upsheet_automation.jsx looks the rendered PNGs back up inside it.
function computePersonFolderName(cardData, state, cardIndex) {
    var firstName = cardData["DAC"] || "";
    var lastName = cardData["DCS"] || "";
    var dobYearMatch = (cardData["DBB"] || "").match(/\d{4}/);
    var dobYear = dobYearMatch ? dobYearMatch[0] : "";
    var folderName = (firstName + " " + lastName + " " + state + " " + dobYear)
        .replace(/[\\\/:*?"<>|]/g, "")
        .replace(/\s+/g, " ")
        .replace(/^\s+|\s+$/g, "");
    if (!folderName) folderName = "Card " + cardIndex;
    return folderName;
}

// --- LAYER HELPERS ---
// Name comparisons are case-insensitive (lowercased on both sides) so
// template layer/group naming drift doesn't silently no-op a lookup.
function findLayerRecursive(parentSet, layerName) {
    var targetLower = layerName.toLowerCase();
    for (var i = 0; i < parentSet.layers.length; i++) {
        var layer = parentSet.layers[i];
        if (layer.name.toLowerCase() === targetLower) {
            return layer;
        }
        if (layer.typename === "LayerSet") {
            var found = findLayerRecursive(layer, layerName);
            if (found) return found;
        }
    }
    return null;
}

function findSmartObjectRecursive(parentSet, layerName) {
    var targetLower = layerName.toLowerCase();
    for (var i = 0; i < parentSet.layers.length; i++) {
        var layer = parentSet.layers[i];
        if (layer.name.toLowerCase() === targetLower && layer.kind === LayerKind.SMARTOBJECT) {
            return layer;
        }
        if (layer.typename === "LayerSet") {
            var found = findSmartObjectRecursive(layer, layerName);
            if (found) return found;
        }
    }
    return null;
}

function updateAllTextLayers(doc, layerName, newText) {
    var count = 0;
    for (var i = 0; i < doc.layers.length; i++) {
        count += updateTextLayersRecursive(doc.layers[i], layerName, newText);
    }
    if (count === 0) log("Text layer '" + layerName + "' not found");
    return count;
}

function updateTextLayersRecursive(layer, targetName, newText) {
    var count = 0;
    if (layer.typename === "LayerSet") {
        for (var i = 0; i < layer.layers.length; i++) {
            count += updateTextLayersRecursive(layer.layers[i], targetName, newText);
        }
    } else if (layer.kind === LayerKind.TEXT && layer.name.toLowerCase() === targetName.toLowerCase()) {
        var oldText = layer.textItem.contents;
        layer.textItem.contents = newText;
        log("Text layer '" + layer.name + "' updated: '" + oldText + "' -> '" + newText + "'");
        count++;
    }
    return count;
}

function setGroupVisibility(doc, groupName, visible) {
    try {
        var group = findLayerRecursive(doc, groupName);
        if (group && group.typename === "LayerSet") {
            group.visible = visible;
            log("Set group '" + groupName + "' visibility to: " + visible);
            return true;
        } else {
            log("Group '" + groupName + "' not found or not a layer set");
        }
    } catch (e) {
        log("Error setting group visibility for '" + groupName + "': " + e.message);
    }
    return false;
}

function setLayerVisibility(parentSet, layerName, visible) {
    var layer = findLayerRecursive(parentSet, layerName);
    if (layer) {
        layer.visible = visible;
    } else {
        log("Layer '" + layerName + "' not found for visibility toggle");
    }
}

function setTextLayerContent(parentSet, layerName, text) {
    var layer = findLayerRecursive(parentSet, layerName);
    if (layer && layer.kind === LayerKind.TEXT) {
        var oldText = layer.textItem.contents;
        layer.textItem.contents = text;
        log("Text layer '" + layer.name + "' updated: '" + oldText + "' -> '" + text + "'");
    } else {
        log("Text layer '" + layerName + "' not found or not a text layer");
    }
}

// --- SMART OBJECT REPLACEMENT ---
// Core routine: open a Smart Object, place fileRef into it (scaled to fill
// the SO canvas), then either delete every other layer (legacy/default
// behavior) or only the named layers in opts.deleteLayerNames. Optionally
// inverts the placed layer and forces a list of layers visible before
// saving & closing the SO document.
function replaceSmartObjectCore(parentSet, layerName, fileRef, opts) {
    opts = opts || {};
    if (!parentSet || !fileRef.exists) {
        log("Replace SO Failed: Parent set missing or file doesn't exist (" + fileRef.fsName + ")");
        return false;
    }
    try {
        var foundLayer = findSmartObjectRecursive(parentSet, layerName);
        if (!foundLayer) {
            log("Error: Target Smart Object layer '" + layerName + "' not found.");
            return false;
        }

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
        var layerW = bounds[2].as("px") - bounds[0].as("px");
        var layerH = bounds[3].as("px") - bounds[1].as("px");
        if (opts.scaleMode === "cover") {
            // Uniform scale (zoom to fit) - preserves aspect ratio, crops overflow,
            // instead of stretching independently on each axis.
            var coverScale = Math.max(docW / layerW, docH / layerH) * 100;
            newLayer.resize(coverScale, coverScale, AnchorPosition.MIDDLECENTER);
        } else {
            var scaleX = (docW / layerW) * 100; var scaleY = (docH / layerH) * 100;
            newLayer.resize(scaleX, scaleY, AnchorPosition.MIDDLECENTER);
        }

        if (opts.invert) {
            newLayer.invert();
        }

        if (opts.doBg) {
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
            } catch (e) {}
        }

        if (opts.deleteLayerNames) {
            // Only remove the specifically named layers, keep everything else
            for (var n = 0; n < opts.deleteLayerNames.length; n++) {
                var toDelete = null;
                for (var k = soDoc.layers.length - 1; k >= 0; k--) {
                    if (soDoc.layers[k].name === opts.deleteLayerNames[n] && soDoc.layers[k] !== newLayer) {
                        toDelete = soDoc.layers[k];
                        break;
                    }
                }
                if (toDelete) {
                    toDelete.remove();
                } else {
                    log("SO '" + layerName + "': layer to delete '" + opts.deleteLayerNames[n] + "' not found");
                }
            }
        } else {
            // Legacy default: delete every layer except the newly placed one
            for (var j = soDoc.layers.length - 1; j >= 0; j--) {
                if (soDoc.layers[j] != newLayer) soDoc.layers[j].remove();
            }
        }

        if (opts.moveToTop) {
            newLayer.move(soDoc, ElementPlacement.PLACEATBEGINNING);
        }

        newLayer.visible = true;

        if (opts.ensureVisibleLayerNames) {
            for (var v = 0; v < opts.ensureVisibleLayerNames.length; v++) {
                var visLayer = findLayerRecursive(soDoc, opts.ensureVisibleLayerNames[v]);
                if (visLayer) {
                    visLayer.visible = true;
                } else {
                    log("SO '" + layerName + "': layer to keep visible '" + opts.ensureVisibleLayerNames[v] + "' not found");
                }
            }
        }

        soDoc.close(SaveOptions.SAVECHANGES);
        return true;
    } catch (e) {
        log("Replace SO Error for '" + layerName + "': " + e);
        return false;
    }
}

// Legacy-shaped wrapper (delete-all-others behavior), used for simple
// single-layer Smart Objects like the photo/barcode "Card N" placements.
function replaceSmartObject(parentSet, layerName, fileRef, doBg, scaleMode) {
    return replaceSmartObjectCore(parentSet, layerName, fileRef, { doBg: doBg, scaleMode: scaleMode });
}

// Force-closes any documents left open (e.g. a Smart Object temp doc left
// dangling by an error mid-replaceSmartObjectCore) without prompting or
// saving, so nothing lingers between cards or at the end of a batch.
function closeAllOpenDocuments() {
    while (app.documents.length > 0) {
        try {
            app.activeDocument = app.documents[app.documents.length - 1];
            app.activeDocument.close(SaveOptions.DONOTSAVECHANGES);
        } catch (e) {
            log("Error closing a leftover open document: " + e.message);
            break;
        }
    }
}

// --- SIGNATURE LOGIC ---
// Decide whether to use the signature image, the CSV signature text, or an
// auto-generated "FirstName L" fallback when both CSV fields are empty.
function getSignatureData(cardData) {
    var imgPath = cardData["signature image"] ? stripQuotes(cardData["signature image"]).trim() : "";
    if (imgPath) {
        return { type: "image", value: imgPath };
    }

    var text = cardData["signature text"] ? stripQuotes(cardData["signature text"]).trim() : "";
    if (text) {
        return { type: "text", value: text };
    }

    var firstName = (cardData["DAC"] || "").trim();
    var lastName = (cardData["DCS"] || "").trim();
    var lastInitial = lastName ? lastName.charAt(0).toUpperCase() : "";
    var autoText = firstName && lastInitial ? (firstName + " " + lastInitial) : (firstName || lastInitial);
    return { type: "text", value: autoText };
}

// Applies sigData to one signature group (LASER SIGNATURES on CA FRONT /
// CA FRONT LASER, SIGNATURES on CA BACK), each containing an image Smart
// Object and a text layer, toggling visibility between the two.
function applySignatureToGroup(doc, groupName, imageLayerName, textLayerName, sigData, cardIndex) {
    var group = findLayerRecursive(doc, groupName);
    if (!group || group.typename !== "LayerSet") {
        log("Row " + cardIndex + ": Signature group '" + groupName + "' not found");
        return;
    }

    if (sigData.type === "image") {
        var file = new File(sigData.value);
        if (!file.exists) {
            log("Row " + cardIndex + ": Signature image not found: " + sigData.value);
            return;
        }
        replaceSmartObjectCore(group, imageLayerName, file, { deleteLayerNames: null });
        setLayerVisibility(group, imageLayerName, true);
        setLayerVisibility(group, textLayerName, false);
    } else {
        setTextLayerContent(group, textLayerName, sigData.value);
        setLayerVisibility(group, textLayerName, true);
        setLayerVisibility(group, imageLayerName, false);
    }
}

// --- UPSHEET AUTOMATION (shared core, called by both scripts) ---

// Maps each upsheet group name to the config.ini key holding that side's
// per-state template, so we can derive the rendered PNG's basename
// (license_generator.jsx names output files after the template's own
// filename, so this stays in sync automatically).
var UPSHEET_SIDE_GROUPS = [
    { group: "FRONT", templateKey: "FrontPSD" },
    { group: "FRONT UV", templateKey: "FrontUVPSD" },
    { group: "LASER FRONT", templateKey: "FrontLaserPSD" },
    { group: "BACK", templateKey: "BackPSD" },
    { group: "LASER BACK", templateKey: "BackLaserPSD" }
];

function templateBaseName(path) {
    if (!path) return null;
    var f = new File(path);
    return f.name.replace(/\.[^\.]+$/, "");
}

// Groups CSV rows into upsheet "buckets": one bucket per perforated state
// (never merged with anything else), plus either one bucket per
// non-perforated state (separateNonPerforated = true) or a single combined
// bucket for all non-perforated states (separateNonPerforated = false).
// Each bucket is then chunked into groups of up to 8 and rendered onto the
// bucket's upsheet template (the state's own dedicated UpsheetPSD if
// perforated, otherwise the shared GLOBAL.NonPerforatedUpsheetPSD).
function runUpsheetAutomation(rows, destFolder, separateNonPerforated) {
    log("Starting upsheet automation on " + rows.length + " CSV record(s)...");

    var perforatedBuckets = {};
    var nonPerforatedSeparate = {};
    var nonPerforatedCombined = [];

    for (var i = 0; i < rows.length; i++) {
        var cardData = rows[i];
        var rowIndex = i + 1;
        var state = (cardData["DAJ"] || "").toUpperCase();
        if (!state) {
            log("Upsheet: Row " + rowIndex + " has no state (DAJ), skipping");
            continue;
        }
        var templates = getTemplatePaths(state);
        if (!templates) {
            log("Upsheet: Row " + rowIndex + " (" + state + ") has no config.ini section, skipping");
            continue;
        }

        var record = { cardData: cardData, state: state, templates: templates, rowIndex: rowIndex };
        var perforated = (templates["Perforated"] || "").toLowerCase() === "true";

        if (perforated) {
            if (!perforatedBuckets[state]) perforatedBuckets[state] = [];
            perforatedBuckets[state].push(record);
        } else if (separateNonPerforated) {
            if (!nonPerforatedSeparate[state]) nonPerforatedSeparate[state] = [];
            nonPerforatedSeparate[state].push(record);
        } else {
            nonPerforatedCombined.push(record);
        }
    }

    var sheetsBuilt = 0;
    var state;

    for (state in perforatedBuckets) {
        var perfRecords = perforatedBuckets[state];
        var perfUpsheetPath = perfRecords[0].templates["UpsheetPSD"];
        if (!perfUpsheetPath) {
            log("Upsheet: state '" + state + "' is Perforated but has no UpsheetPSD configured in config.ini, skipping " + perfRecords.length + " record(s)");
            continue;
        }
        sheetsBuilt += buildSheetsForBucket(perfRecords, perfUpsheetPath, state, destFolder);
    }

    var nonPerfUpsheetPath = getGlobalConfigValue("NonPerforatedUpsheetPSD");

    for (state in nonPerforatedSeparate) {
        if (!nonPerfUpsheetPath) {
            log("Upsheet: GLOBAL.NonPerforatedUpsheetPSD not configured, skipping state '" + state + "'");
            continue;
        }
        sheetsBuilt += buildSheetsForBucket(nonPerforatedSeparate[state], nonPerfUpsheetPath, state, destFolder);
    }

    if (nonPerforatedCombined.length > 0) {
        if (!nonPerfUpsheetPath) {
            log("Upsheet: GLOBAL.NonPerforatedUpsheetPSD not configured, skipping combined non-perforated bucket");
        } else {
            sheetsBuilt += buildSheetsForBucket(nonPerforatedCombined, nonPerfUpsheetPath, "Combined Non-Perforated", destFolder);
        }
    }

    closeAllOpenDocuments();
    log("Upsheet automation complete. Sheets built: " + sheetsBuilt);
    return sheetsBuilt;
}

function buildSheetsForBucket(records, upsheetTemplatePath, bucketLabel, destFolder) {
    var chunkSize = 8;
    var sheetsBuilt = 0;
    for (var offset = 0; offset < records.length; offset += chunkSize) {
        var chunk = records.slice(offset, offset + chunkSize);
        var sheetNum = Math.floor(offset / chunkSize) + 1;
        if (buildOneSheet(chunk, upsheetTemplatePath, bucketLabel, sheetNum, destFolder)) {
            sheetsBuilt++;
        }
    }
    return sheetsBuilt;
}

function buildOneSheet(chunk, upsheetTemplatePath, bucketLabel, sheetNum, destFolder) {
    var templateFile = new File(upsheetTemplatePath);
    if (!templateFile.exists) {
        log("Upsheet: template not found for bucket '" + bucketLabel + "': " + templateFile.fsName);
        return false;
    }

    var doc = null;
    try {
        doc = app.open(templateFile);
        log("Upsheet: opened '" + doc.name + "' for bucket '" + bucketLabel + "', sheet " + sheetNum + " (" + chunk.length + " card(s))");

        for (var g = 0; g < UPSHEET_SIDE_GROUPS.length; g++) {
            var groupName = UPSHEET_SIDE_GROUPS[g].group;
            var templateKey = UPSHEET_SIDE_GROUPS[g].templateKey;
            var group = findLayerRecursive(doc, groupName);
            if (!group || group.typename !== "LayerSet") {
                log("Upsheet: group '" + groupName + "' not found in " + doc.name + ", skipping side");
                continue;
            }

            for (var c = 0; c < chunk.length; c++) {
                var record = chunk[c];
                var cardSlot = c + 1;
                var baseName = templateBaseName(record.templates[templateKey]);
                if (!baseName) {
                    log("Upsheet: row " + record.rowIndex + " (" + record.state + ") has no '" + templateKey + "' configured, skipping " + groupName + " slot " + cardSlot);
                    continue;
                }
                var personFolderName = computePersonFolderName(record.cardData, record.state, record.rowIndex);
                var pngFile = new File(destFolder.fsName + "/" + personFolderName + "/" + baseName + ".png");
                if (!pngFile.exists) {
                    log("Upsheet: row " + record.rowIndex + " rendered PNG not found for '" + groupName + "': " + pngFile.fsName);
                    continue;
                }
                replaceSmartObject(group, "Card " + cardSlot, pngFile, false);
            }
        }

        var bucketFolder = new Folder(destFolder.fsName + "/Upsheets/" + bucketLabel);
        if (!bucketFolder.exists) bucketFolder.create();

        var outputName = "Sheet " + sheetNum;

        var psdFile = new File(bucketFolder.fsName + "/" + outputName + ".psd");
        var psdOptions = new PhotoshopSaveOptions();
        psdOptions.embedColorProfile = true;
        psdOptions.alphaChannels = true;
        psdOptions.layers = true;
        doc.saveAs(psdFile, psdOptions, true, Extension.LOWERCASE);
        log("Upsheet: saved PSD: " + psdFile.fsName);

        var pngFileOut = new File(bucketFolder.fsName + "/" + outputName + ".png");
        var pngOptions = new PNGSaveOptions();
        doc.saveAs(pngFileOut, pngOptions, true, Extension.LOWERCASE);
        log("Upsheet: saved PNG: " + pngFileOut.fsName);

        doc.close(SaveOptions.DONOTSAVECHANGES);
        doc = null;
        return true;
    } catch (e) {
        log("Upsheet: error building sheet for bucket '" + bucketLabel + "' sheet " + sheetNum + ": " + e.message);
        if (doc) {
            try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
        }
        return false;
    }
}
