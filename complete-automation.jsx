#target photoshop
var scriptFile = new File($.fileName);
#include "shared/common.jsx"

(function() {
    initLog("License Generator");
    log("Initializing script and UI...");
    loadConfig();

    // --- FORMATTING HELPERS (specific to CA FRONT/BACK field layouts) ---
    function formatMicrotext(firstName, lastName, dob) {
        var firstInitial = firstName ? firstName.trim().charAt(0).toUpperCase() : "";
        var lastInitial = lastName ? lastName.trim().charAt(0).toUpperCase() : "";
        var yearMatch = dob.match(/\d{4}/);
        var yearLast2 = yearMatch ? yearMatch[0].slice(-2) : "";
        if (firstInitial && lastInitial && yearLast2) {
            return firstInitial + lastInitial + yearLast2;
        }
        return "";
    }

    // MMDDYY (2-digit year)
    function formatDOB_MMDDYY(dob) {
        var match = dob.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (match) {
            var mm = match[1].padStart(2, '0');
            var dd = match[2].padStart(2, '0');
            var yy = match[3].slice(-2);
            return mm + dd + yy;
        }
        var compactMatch = dob.match(/^(\d{2})(\d{2})(\d{4})$/);
        if (compactMatch) {
            return compactMatch[1] + compactMatch[2] + compactMatch[3].slice(-2);
        }
        return "";
    }

    // MMDDYYYY (4-digit year)
    function formatDOB_MMDDYYYY(dob) {
        var match = dob.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (match) {
            var mm = match[1].padStart(2, '0');
            var dd = match[2].padStart(2, '0');
            var yyyy = match[3];
            return mm + dd + yyyy;
        }
        var compactMatch = dob.match(/^(\d{2})(\d{2})(\d{4})$/);
        if (compactMatch) {
            return compactMatch[1] + compactMatch[2] + compactMatch[3];
        }
        return "";
    }

    // MM/DD/YYYY
    function formatDateSlash(dateStr) {
        if (!dateStr) return "";
        var match = dateStr.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (match) {
            var mm = match[1].padStart(2, '0');
            var dd = match[2].padStart(2, '0');
            return mm + "/" + dd + "/" + match[3];
        }
        var compactMatch = dateStr.match(/^(\d{2})(\d{2})(\d{4})$/);
        if (compactMatch) {
            return compactMatch[1] + "/" + compactMatch[2] + "/" + compactMatch[3];
        }
        return "";
    }

    // Total inches -> "F'II" (feet, apostrophe, 2-digit remaining inches)
    function formatHeight(totalInches) {
        var n = parseInt(totalInches, 10);
        if (isNaN(n)) return "";
        var feet = Math.floor(n / 12);
        var inches = n % 12;
        return feet + "'" + String(inches).padStart(2, '0');
    }

    // Pounds -> "### lb"
    function formatWeight(lbs) {
        if (!lbs) return "";
        return lbs + " lb";
    }

    // Normalizes CSV Sex values to "M"/"F". Accepts the AAMVA numeric codes
    // (1=Male, 2=Female) as well as "M"/"Male"/"F"/"Female" text, compared
    // case-insensitively.
    function formatSex(value) {
        if (!value) return "";
        var v = value.trim().toLowerCase();
        if (v === "m" || v === "male" || v === "1") return "M";
        if (v === "f" || v === "female" || v === "2") return "F";
        log("Unrecognized Sex value '" + value + "', passing through unchanged");
        return value;
    }

    // --- 1. UI SETUP (dark theme) ---
    function rgba(r, g, b, a) { return [r, g, b, a === undefined ? 1 : a]; }

    var COLOR_BG = rgba(0.12, 0.12, 0.14);
    var COLOR_PANEL_BG = rgba(0.17, 0.17, 0.19);
    var COLOR_FIELD_BG = rgba(0.22, 0.22, 0.24);
    var COLOR_TEXT = rgba(0.95, 0.95, 0.96);
    var COLOR_MUTED_TEXT = rgba(0.68, 0.68, 0.72);
    var COLOR_STATUS_TEXT = rgba(0.55, 0.80, 0.55);
    var COLOR_OK_BG = rgba(0.55, 0.78, 0.55);
    var COLOR_OK_TEXT = rgba(0.06, 0.18, 0.06);
    var COLOR_CANCEL_BG = rgba(0.82, 0.52, 0.52);
    var COLOR_CANCEL_TEXT = rgba(0.22, 0.05, 0.05);

    // Best-effort theming: ScriptUI's graphics API can recolor most controls,
    // but native OS-drawn widgets (esp. buttons/edittext on Windows) may only
    // partially respect this depending on the Photoshop/OS version.
    function paint(ctrl, bgColor, fgColor) {
        try {
            var g = ctrl.graphics;
            if (bgColor) g.backgroundColor = g.newBrush(g.BrushType.SOLID_COLOR, bgColor);
            if (fgColor) g.foregroundColor = g.newBrush(g.BrushType.SOLID_COLOR, fgColor);
        } catch (e) {}
    }

    function setFont(ctrl, size, bold) {
        try {
            var g = ctrl.graphics;
            var baseFont = g.font;
            g.font = ScriptUIGraphics.newFont(baseFont.name, bold ? ScriptUIGraphics.FontStyle.BOLD : ScriptUIGraphics.FontStyle.REGULAR, size);
        } catch (e) {}
    }

    function themedPanel(parent, title) {
        var p = parent.add("panel", undefined, title);
        p.orientation = "column";
        p.alignChildren = ["fill", "top"];
        p.margins = 14;
        p.spacing = 8;
        paint(p, COLOR_PANEL_BG, COLOR_TEXT);
        return p;
    }

    function themedStatic(parent, text, muted) {
        var t = parent.add("statictext", undefined, text);
        paint(t, null, muted ? COLOR_MUTED_TEXT : COLOR_TEXT);
        return t;
    }

    function themedEdit(parent, bounds, text) {
        var e = parent.add("edittext", bounds, text || "");
        paint(e, COLOR_FIELD_BG, COLOR_TEXT);
        return e;
    }

    function themedButton(parent, label, bgColor, fgColor, name) {
        var b = name ? parent.add("button", undefined, label, { name: name }) : parent.add("button", undefined, label);
        paint(b, bgColor, fgColor);
        return b;
    }

    function themedCheckbox(parent, label) {
        var c = parent.add("checkbox", undefined, label);
        paint(c, null, COLOR_TEXT);
        return c;
    }

    var win = new Window("dialog", "CA License Card Generator");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];
    win.margins = 20;
    win.spacing = 14;
    paint(win, COLOR_BG, COLOR_TEXT);

    var subheading = themedStatic(win, "Batch-generates driver's license cards from a CSV and can build print upsheets.", true);
    setFont(subheading, 12, false);

    // --- CSV panel (auto-selects data.csv next to the script, if present) ---
    var csvPanel = themedPanel(win, "CSV Data File (Required)");
    var csvRow = csvPanel.add("group");
    themedStatic(csvRow, "CSV:");
    var csvTxt = themedEdit(csvRow, [0, 0, 300, 20]);
    var csvBtn = themedButton(csvRow, "Browse");
    var csvStatus = null;

    var defaultCsvFile = new File(scriptFile.parent.fsName + "/data.csv");
    if (defaultCsvFile.exists) {
        csvTxt.text = defaultCsvFile.fsName;
        csvData = parseCSV(defaultCsvFile);
        log("Auto-selected default CSV: " + defaultCsvFile.fsName + (csvData ? " (" + csvData.length + " records)" : " (failed to parse)"));
        csvStatus = themedStatic(csvPanel, "✓ data.csv found next to the script and auto-selected", false);
        paint(csvStatus, null, COLOR_STATUS_TEXT);
    }

    csvBtn.onClick = function() {
        var f = File.openDialog("Select CSV data file", "CSV Files:*.csv");
        if (f) {
            csvTxt.text = f.fsName;
            csvData = parseCSV(f);
            if (csvData) {
                log("Loaded CSV with " + csvData.length + " records. Headers: " + csvHeaders.join(", "));
            } else {
                log("Failed to parse CSV file");
            }
            if (csvStatus) csvStatus.visible = false;
        }
    };

    // --- Destination panel (auto-selects ./final-documents next to the script) ---
    var destPanel = themedPanel(win, "Destination Folder");
    var destRow = destPanel.add("group");
    var destTxt = themedEdit(destRow, [0, 0, 355, 20]);
    var destBtn = themedButton(destRow, "Browse");

    var defaultDestFolder = new Folder(scriptFile.parent.fsName + "/final-documents");
    destTxt.text = defaultDestFolder.fsName;
    var destStatus = themedStatic(destPanel, "✓ final-documents folder auto-selected (created automatically if it doesn't exist yet)", false);
    paint(destStatus, null, COLOR_STATUS_TEXT);

    destBtn.onClick = function() {
        var f = Folder.selectDialog("Select destination folder for output folders");
        if (f) {
            destTxt.text = f.fsName;
            log("Selected destination folder: " + f.fsName);
            destStatus.visible = false;
        }
    };

    // --- Logs panel (optional - defaults to the project's logs/ folder) ---
    var logsPanel = themedPanel(win, "Logs Folder (Optional)");
    var logsRow = logsPanel.add("group");
    var logsTxt = themedEdit(logsRow, [0, 0, 300, 20]);
    var logsBtn = themedButton(logsRow, "Browse");

    logsTxt.text = logFolder.fsName;
    var logsStatus = themedStatic(logsPanel, "✓ default logs folder auto-selected (next to the script)", false);
    paint(logsStatus, null, COLOR_STATUS_TEXT);

    logsBtn.onClick = function() {
        var f = Folder.selectDialog("Select folder to save logs to");
        if (f) {
            logsTxt.text = f.fsName;
            logsStatus.visible = false;
        }
    };

    // --- Upsheets panel ---
    var upsheetPanel = themedPanel(win, "Print Upsheets (Optional)");
    var buildUpsheetsChk = themedCheckbox(upsheetPanel, "Also build print upsheets after processing");
    var separateNonPerfChk = themedCheckbox(upsheetPanel, "Separate non-perforated states into separate print pages");

    var btnGroup = win.add("group");
    btnGroup.alignment = ["center", "top"];
    btnGroup.spacing = 12;
    var btnOk = themedButton(btnGroup, "OK", COLOR_OK_BG, COLOR_OK_TEXT, "ok");
    var btnCancel = themedButton(btnGroup, "Cancel", COLOR_CANCEL_BG, COLOR_CANCEL_TEXT, "cancel");

    btnCancel.onClick = function() {
        log("User cancelled script execution.");
        win.close();
    };

    // --- 2. PER-TEMPLATE PROCESSORS ---

    // CA FRONT.psd: personal-data text layers, photo, laser signature, microtext, donor/real-id visibility
    function processFrontPSD(doc, cardData, cardIndex) {
        var firstName = cardData["DAC"] || "";
        var lastName = cardData["DCS"] || "";
        var dob = cardData["DBB"] || "";
        var realIdCompliancy = cardData["DDA"] || "";
        var organDonorIndicator = cardData["DDK"] || "";

        // Personal-data text layers
        updateAllTextLayers(doc, "DRIVER LICENSE NUMBR A1234567", cardData["DAQ"] || "");
        updateAllTextLayers(doc, "EXPIRATION MM/DD/YYYY", formatDateSlash(cardData["DBA"] || ""));
        updateAllTextLayers(doc, "LASTNAME", lastName);
        updateAllTextLayers(doc, "FIRSTNAME", firstName);

        var city = cardData["city"] || "";
        var state = cardData["DAJ"] || "";
        var zip = cardData["DAK"] || "";
        var zip5 = zip ? zip.substring(0, 5) : "";
        updateAllTextLayers(doc, "CITY, CA 5 DIGIT ZIP CODE", city + ", " + state + " " + zip5);

        var streetAddress = cardData["DAG"] || "";
        updateAllTextLayers(doc, "STREET ADDRESS", streetAddress.toUpperCase());

        updateAllTextLayers(doc, "DOB MM/DD/YYYY", formatDateSlash(dob));
        updateAllTextLayers(doc, "M OR F", formatSex(cardData["DBC"] || ""));
        updateAllTextLayers(doc, "HAIR COLOR", cardData["DAZ"] || "");
        updateAllTextLayers(doc, "EYES COLOR", cardData["DAY"] || "");
        updateAllTextLayers(doc, "HEIGHT #'-##''", formatHeight(cardData["DAU"] || ""));
        updateAllTextLayers(doc, "WEIGHT # lb", formatWeight(cardData["DAW"] || ""));
        updateAllTextLayers(doc, "DOCUMENT DISCRIMINATOR", cardData["DCF"] || "");
        updateAllTextLayers(doc, "ISSUE DATE MM/DD/YYYY", formatDateSlash(cardData["DBD"] || ""));

        // Photo group: "big photo" and "big photo copy" Smart Objects
        var photoPath = cardData["photo"] ? stripQuotes(cardData["photo"]).trim() : "";
        if (photoPath) {
            var photoFile = new File(photoPath);
            if (photoFile.exists) {
                var photoGroup = findLayerRecursive(doc, "photo");
                if (photoGroup && photoGroup.typename === "LayerSet") {
                    replaceSmartObject(photoGroup, "big photo", photoFile, false, "cover");
                    replaceSmartObject(photoGroup, "big photo copy", photoFile, false, "cover");
                } else {
                    log("Row " + cardIndex + ": 'photo' group not found");
                }
            } else {
                log("Row " + cardIndex + ": Photo not found: " + photoPath);
            }
        }

        // Laser signature (image/text/auto-generated)
        var sigData = getSignatureData(cardData);
        log("Row " + cardIndex + ": Front signature source = " + sigData.type + " (" + sigData.value + ")");
        applySignatureToGroup(doc, "LASER SIGNATURES", "LASER SIGNATURE IMAGE", "LASER SIGNATURE TEXT", sigData, cardIndex);

        var microtext = formatMicrotext(firstName, lastName, dob);
        if (microtext) {
            updateAllTextLayers(doc, "MICROTEXT ABYY", microtext);
        }

        if (organDonorIndicator === "1" || organDonorIndicator === "true" || organDonorIndicator === "TRUE") {
            setGroupVisibility(doc, "DONOR", true);
        } else {
            setGroupVisibility(doc, "DONOR", false);
        }

        var realIdValue = realIdCompliancy.toUpperCase();
        if (realIdValue === "F" || realIdValue === "FALSE") {
            setGroupVisibility(doc, "NO REAL ID COMPLIANCE", true);
            setGroupVisibility(doc, "REAL ID COMPLAINT", false);
        } else if (realIdValue === "T" || realIdValue === "TRUE") {
            setGroupVisibility(doc, "NO REAL ID COMPLIANCE", false);
            setGroupVisibility(doc, "REAL ID COMPLAINT", false);
        }
    }

    // CA FRONT UV.psd: UV DOB layer + inverted holder photo in "PHOTO OF DL HOLDER" SO
    function processFrontUVPSD(doc, cardData, cardIndex) {
        var dob = cardData["DBB"] || "";
        var uvDob = formatDOB_MMDDYYYY(dob);
        if (uvDob) {
            updateAllTextLayers(doc, "UV DOB MMDDYYYY", uvDob);
        }

        var photoPath = cardData["photo"] ? stripQuotes(cardData["photo"]).trim() : "";
        if (!photoPath) {
            log("Row " + cardIndex + ": No photo in CSV, skipping PHOTO OF DL HOLDER");
            return;
        }
        var photoFile = new File(photoPath);
        if (!photoFile.exists) {
            log("Row " + cardIndex + ": Photo not found: " + photoPath);
            return;
        }

        replaceSmartObjectCore(doc, "PHOTO OF DL HOLDER", photoFile, {
            deleteLayerNames: ["Layer 3"],
            invert: true,
            moveToTop: true,
            ensureVisibleLayerNames: ["GREEN BG"],
            scaleMode: "cover"
        });
    }

    // CA FRONT LASER.psd: laser signature + LASER DOB MMDDYYYY
    function processFrontLaserPSD(doc, cardData, cardIndex) {
        var sigData = getSignatureData(cardData);
        log("Row " + cardIndex + ": Front laser signature source = " + sigData.type + " (" + sigData.value + ")");
        applySignatureToGroup(doc, "LASER SIGNATURES", "LASER SIGNATURE IMAGE", "LASER SIGNATURE TEXT", sigData, cardIndex);

        var dob = cardData["DBB"] || "";
        var laserDob = formatDOB_MMDDYYYY(dob);
        if (laserDob) {
            updateAllTextLayers(doc, "LASER DOB MMDDYYYY", laserDob);
        }
    }

    // CA BACK.psd: PDF417 + CODE128 barcodes, back signature, LASER DOB MMDDYY, inventory control number
    function processBackPSD(doc, cardData, cardIndex) {
        try {
            var barcodeGroup = doc.layerSets.getByName("BARCODES - EDIT HERE");

            var barcodePath = cardData["barcode"] ? stripQuotes(cardData["barcode"]).trim() : "";
            if (barcodePath) {
                var barcodeFile = new File(barcodePath);
                if (barcodeFile.exists) {
                    replaceSmartObjectCore(barcodeGroup, "PDF417", barcodeFile, {
                        deleteLayerNames: ["Layer 1"],
                        moveToTop: true
                    });
                } else {
                    log("Row " + cardIndex + ": Barcode file not found: " + barcodePath);
                }
            }

            var linearPath = cardData["linear"] ? stripQuotes(cardData["linear"]).trim() : "";
            if (linearPath) {
                var linearFile = new File(linearPath);
                if (linearFile.exists) {
                    replaceSmartObjectCore(barcodeGroup, "CODE 128", linearFile, {
                        deleteLayerNames: ["Layer 1"],
                        moveToTop: true
                    });
                } else {
                    log("Row " + cardIndex + ": Linear barcode file not found: " + linearPath);
                }
            }
        } catch (e) {
            log("Row " + cardIndex + ": Error processing barcodes: " + e.message);
        }

        var sigData = getSignatureData(cardData);
        log("Row " + cardIndex + ": Back signature source = " + sigData.type + " (" + sigData.value + ")");
        applySignatureToGroup(doc, "SIGNATURES", "SIGNATURE IMAGE", "SIGNATURE TEXT", sigData, cardIndex);

        var dob = cardData["DBB"] || "";
        var laserDob = formatDOB_MMDDYY(dob);
        if (laserDob) {
            updateAllTextLayers(doc, "LASER DOB MMDDYY", laserDob);
        }

        var invControlNumber = cardData["DCK"] || "";
        if (invControlNumber) {
            updateAllTextLayers(doc, "INVENTORY CONTROL NUMBER", invControlNumber);
        }
    }

    // CA BACK LASER.psd: DOB MMDDYY
    function processBackLaserPSD(doc, cardData, cardIndex) {
        var dob = cardData["DBB"] || "";
        var laserDob = formatDOB_MMDDYY(dob);
        if (laserDob) {
            updateAllTextLayers(doc, "DOB MMDDYY", laserDob);
        }
    }

    // --- 3. EXECUTION LOGIC ---
    btnOk.onClick = function() {
        var destPath = destTxt.text;
        if (!destPath) {
            log("Execution halted: Destination folder missing.");
            alert("Destination folder is required.");
            return;
        }
        var destFolder = new Folder(destPath);
        if (!destFolder.exists) {
            destFolder.create();
            log("Destination folder did not exist, created it: " + destFolder.fsName);
        }

        var logsPath = logsTxt.text;
        if (logsPath && logsPath !== logFolder.fsName) {
            var newLogFolder = new Folder(logsPath);
            if (!newLogFolder.exists) newLogFolder.create();
            logFolder = newLogFolder;
            logFile = new File(logFolder.fsName + "/card_generator.log");
            initLog("License Generator (custom log folder)");
            log("Log folder set by user to: " + logFolder.fsName);
        }

        var buildUpsheets = buildUpsheetsChk.value;
        var separateNonPerforated = separateNonPerfChk.value;

        log("Starting batch processing...");
        win.close();
        processBatch(destFolder, buildUpsheets, separateNonPerforated);
    };

    // Each CA record is made up of these separate PSDs, opened/processed/
    // saved/closed one at a time. HologramPSD has no processFn since it
    // requires no edits - it's opened and saved through unchanged.
    var TEMPLATE_JOBS = [
        { key: "FrontPSD", suffix: "FRONT", processFn: processFrontPSD },
        { key: "FrontUVPSD", suffix: "FRONT_UV", processFn: processFrontUVPSD },
        { key: "FrontLaserPSD", suffix: "FRONT_LASER", processFn: processFrontLaserPSD },
        { key: "HologramPSD", suffix: "HOLOGRAM", processFn: null },
        { key: "BackPSD", suffix: "BACK", processFn: processBackPSD },
        { key: "BackLaserPSD", suffix: "BACK_LASER", processFn: processBackLaserPSD }
    ];

    function processBatch(destFolder, buildUpsheets, separateNonPerforated) {
        var originalRulerUnits = app.preferences.rulerUnits;
        var originalDialogMode = app.displayDialogs;

        app.preferences.rulerUnits = Units.PIXELS;
        app.displayDialogs = DialogModes.NO;

        if (!csvData || csvData.length === 0) {
            log("Error: No CSV data loaded");
            alert("Please select a CSV file first");
            return;
        }

        log("Processing " + csvData.length + " records from CSV");

        var cardsProcessed = 0;
        var errors = 0;

        for (var rowIndex = 0; rowIndex < csvData.length; rowIndex++) {
            var cardData = csvData[rowIndex];
            var cardIndex = rowIndex + 1;

            var state = cardData["DAJ"];
            if (!state) {
                log("Row " + cardIndex + ": No state (DAJ) in CSV, skipping");
                errors++;
                continue;
            }
            state = state.toUpperCase();

            var templates = getTemplatePaths(state);
            if (!templates) {
                log("Row " + cardIndex + ": No template config for state " + state + " in config.ini");
                errors++;
                continue;
            }

            var folderName = computePersonFolderName(cardData, state, cardIndex);
            var personFolder = new Folder(destFolder.fsName + "/" + folderName);
            if (!personFolder.exists) personFolder.create();

            var jobsSucceeded = 0;

            for (var j = 0; j < TEMPLATE_JOBS.length; j++) {
                var job = TEMPLATE_JOBS[j];
                var templatePath = templates[job.key];
                if (!templatePath) {
                    log("Row " + cardIndex + ": No '" + job.key + "' configured for state " + state + ", skipping " + job.suffix);
                    continue;
                }

                var templateFile = new File(templatePath);
                if (!templateFile.exists) {
                    log("Row " + cardIndex + ": Template not found (" + job.suffix + "): " + templateFile.fsName);
                    continue;
                }

                var doc = null;
                try {
                    doc = app.open(templateFile);
                    log("Row " + cardIndex + ": Opened " + job.suffix + " template: " + doc.name);

                    if (job.processFn) {
                        job.processFn(doc, cardData, cardIndex);
                    }

                    var outputName = doc.name.replace(/\.[^\.]+$/, "");

                    var psdFile = new File(personFolder.fsName + "/" + outputName + ".psd");
                    var psdOptions = new PhotoshopSaveOptions();
                    psdOptions.embedColorProfile = true;
                    psdOptions.alphaChannels = true;
                    psdOptions.layers = true;
                    doc.saveAs(psdFile, psdOptions, true, Extension.LOWERCASE);
                    log("Saved PSD: " + psdFile.fsName);

                    var pngFile = new File(personFolder.fsName + "/" + outputName + ".png");
                    var pngOptions = new PNGSaveOptions();
                    doc.saveAs(pngFile, pngOptions, true, Extension.LOWERCASE);
                    log("Saved PNG: " + pngFile.fsName);

                    doc.close(SaveOptions.DONOTSAVECHANGES);
                    doc = null;
                    jobsSucceeded++;
                } catch (e) {
                    log("Row " + cardIndex + ": Error processing " + job.suffix + ": " + e.message);
                    if (doc) {
                        try { doc.close(SaveOptions.DONOTSAVECHANGES); } catch (e2) {}
                    }
                }
            }

            closeAllOpenDocuments();

            if (jobsSucceeded > 0) {
                cardsProcessed++;
            } else {
                log("Row " + cardIndex + ": No PSDs were processed for this record");
                errors++;
            }
        }

        closeAllOpenDocuments();

        if (cardsProcessed > 0) {
            log("Batch process complete. Total cards processed: " + cardsProcessed);
            if (errors > 0) log("Errors: " + errors);
        } else {
            log("Batch process aborted. 0 cards processed.");
        }

        var upsheetsBuilt = 0;
        if (buildUpsheets && cardsProcessed > 0) {
            upsheetsBuilt = runUpsheetAutomation(csvData, destFolder, separateNonPerforated);
        }

        app.preferences.rulerUnits = originalRulerUnits;
        app.displayDialogs = originalDialogMode;
        log("--- Script Finished ---");

        if (cardsProcessed > 0) {
            var msg = cardsProcessed + " Cards done\n" + (errors > 0 ? errors + " errors\n" : "");
            if (buildUpsheets) msg += upsheetsBuilt + " upsheet(s) built";
            alert(msg);
        } else {
            alert("0 Cards done. Check log for errors.");
        }
    }

    win.show();
    log("UI Displayed to user.");
})();
