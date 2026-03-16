import os
import logging
import ga_module

# Setup basic console logging to view the output directly in your terminal
logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

def run_test():
    # 1. Define Absolute Paths
    # This must be the ROOT directory that contains the "Lightburn" folder where your templates live.
    ABSOLUTE_BASE_DIR = r"C:\Users\LENOVO\Documents\personal\Fiver\Telegram License Automation"
    
    # This is the master output directory where the script will create the final "Lightburn" subfolder.
    ABSOLUTE_OUTPUT_DIR = r"C:\Users\LENOVO\Documents\personal\Fiver\Telegram License Automation\Final_Documents\HARROLD FINCH GA 01-01-1980"
    
    # The folders where the Photoshop script normally saves the PNGs
    FRONT_IMG_DIR = os.path.join(ABSOLUTE_OUTPUT_DIR, "Front")
    BACK_IMG_DIR = os.path.join(ABSOLUTE_OUTPUT_DIR, "Back")

    # Ensure output directories exist for the test
    os.makedirs(FRONT_IMG_DIR, exist_ok=True)
    os.makedirs(BACK_IMG_DIR, exist_ok=True)

    # 2. Build the mock data dictionary exactly as the worker extracts it from the text file
    mock_data_map = {
        "Output Dir": ABSOLUTE_OUTPUT_DIR,
        "Output Dir Front": FRONT_IMG_DIR,
        "Output Dir Back": BACK_IMG_DIR,
        "Base Name": "TEST_HARROLD_FINCH_01-01-2023"
    }

    logging.info("--- Starting Standalone LightBurn Test ---")
    logging.info(f"Looking for templates in: {os.path.join(ABSOLUTE_BASE_DIR, 'Lightburn')}")
    logging.info(f"Target Output Directory: {ABSOLUTE_OUTPUT_DIR}")
    
    # 3. Execute the function
    try:
        ga_module.generate_lightburn_lbrn(mock_data_map, ABSOLUTE_BASE_DIR)
        
        # Verify the files were actually created
        expected_front = os.path.join(ABSOLUTE_OUTPUT_DIR, "Lightburn", f"{mock_data_map['Base Name']}_Front.lbrn2")
        expected_back = os.path.join(ABSOLUTE_OUTPUT_DIR, "Lightburn", f"{mock_data_map['Base Name']}_Back.lbrn2")
        
        if os.path.exists(expected_front) and os.path.exists(expected_back):
            logging.info("--- Test Completed Successfully! ---")
            logging.info(f"Files saved to: {os.path.join(ABSOLUTE_OUTPUT_DIR, 'Lightburn')}")
        else:
            logging.warning("Function ran without crashing, but output files are missing. Check XML parsing logic.")
            
    except Exception as e:
        logging.error(f"Test Failed with exception: {e}")

if __name__ == "__main__":
    run_test()