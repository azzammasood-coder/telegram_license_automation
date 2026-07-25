#target photoshop
var scriptFile = new File($.fileName);
#include "shared/common.jsx"

// Standalone print-upsheet builder. Takes the same CSV used by
// complete-automation.jsx plus the destination folder it wrote per-person
// PSD/PNG output into, and assembles 8-up Teslin print sheets:
//   - Perforated states (config.ini "Perforated=true") each get their own
//     dedicated upsheet template and never share a sheet with anything else.
//   - Non-perforated states share a single generic upsheet template
//     (config.ini [GLOBAL] NonPerforatedUpsheetPSD), either kept one state
//     per sheet-run or merged together, per the checkbox below.
// This same core (runUpsheetAutomation, in shared/common.jsx) is also called
// directly by complete-automation.jsx as an optional follow-up step.
(function() {
    initLog("Upsheet Automation");
    log("Initializing script and UI...");
    loadConfig();

    // --- 1. UI SETUP ---
    var win = new Window("dialog", "Build Print Upsheets");
    win.orientation = "column";
    win.alignChildren = ["fill", "top"];

    var csvPanel = win.add("panel", undefined, "CSV Data File (same one used to generate the cards)");
    csvPanel.orientation = "column";
    csvPanel.alignChildren = ["fill", "top"];
    var csvRow = csvPanel.add("group");
    csvRow.add("statictext", [0, 0, 50, 20], "CSV:");
    var csvTxt = csvRow.add("edittext", [0, 0, 300, 20], "");
    var csvBtn = csvRow.add("button", undefined, "Browse");
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
        }
    };

    var destPanel = win.add("panel", undefined, "Cards Folder (where complete-automation.jsx wrote its output)");
    var destRow = destPanel.add("group");
    var destTxt = destRow.add("edittext", [0, 0, 355, 20], "");
    var destBtn = destRow.add("button", undefined, "Browse");

    destBtn.onClick = function() {
        var f = Folder.selectDialog("Select the folder containing the generated per-person card folders");
        if (f) {
            destTxt.text = f.fsName;
            log("Selected cards folder: " + f.fsName);
        }
    };

    var optionsPanel = win.add("panel", undefined, "Options");
    optionsPanel.orientation = "column";
    optionsPanel.alignChildren = ["left", "top"];
    var separateNonPerfChk = optionsPanel.add("checkbox", undefined, "Separate non-perforated states into separate print pages");

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
        if (!csvData || csvData.length === 0) {
            log("Execution halted: No CSV loaded.");
            alert("Please select a CSV file first.");
            return;
        }

        var destPath = destTxt.text;
        if (!destPath) {
            log("Execution halted: Cards folder missing.");
            alert("Cards folder is required.");
            return;
        }
        var destFolder = new Folder(destPath);
        if (!destFolder.exists) {
            log("Execution halted: Cards folder does not exist.");
            alert("Cards folder does not exist.");
            return;
        }

        var separateNonPerforated = separateNonPerfChk.value;

        log("Starting upsheet automation...");
        win.close();

        var originalRulerUnits = app.preferences.rulerUnits;
        var originalDialogMode = app.displayDialogs;
        app.preferences.rulerUnits = Units.PIXELS;
        app.displayDialogs = DialogModes.NO;

        var sheetsBuilt = runUpsheetAutomation(csvData, destFolder, separateNonPerforated);

        app.preferences.rulerUnits = originalRulerUnits;
        app.displayDialogs = originalDialogMode;
        log("--- Script Finished ---");

        if (sheetsBuilt > 0) {
            alert(sheetsBuilt + " upsheet(s) built. Check log for details.");
        } else {
            alert("0 upsheets built. Check log for errors.");
        }
    };

    win.show();
    log("UI Displayed to user.");
})();
