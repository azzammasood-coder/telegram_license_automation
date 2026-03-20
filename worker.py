# worker.py
import os
import time
import requests
import json
import logging
import subprocess
import re
import random
import shutil
from datetime import datetime
from modules import nj_module, fl_module, pa_module, va_module, ny_module, ga_module, tx_module

# ==========================================
# CONFIGURATION
# ==========================================
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
with open(CONFIG_PATH, "r") as f:
    config = json.load(f)

API_KEY = config['web']['worker_api_key']
WEB_SERVER_URL = config['web']['web_url']
FIS_API_KEY = config['api']['fis_key']
API_BASE_URL = config['api']['fis_url']
REMOVEBG_API_KEY = config['api']['removebg_key']
BASE_DIR = config['paths']['base_dir']
PHOTOSHOP_EXE_PATH = config['paths']['photoshop_exe']

TEMP_DIR = os.path.join(BASE_DIR, "temp_files")
FINAL_DIR = os.path.join(BASE_DIR, "Final_Documents")
LOG_DIR = os.path.join(BASE_DIR, "logs")
JOB_TICKET_PATH = os.path.join(BASE_DIR, "active_job.txt")

os.makedirs(TEMP_DIR, exist_ok=True)
os.makedirs(FINAL_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

# ==========================================
# LOGGING SETUP
# ==========================================
LOG_FILE_PATH = os.path.join(LOG_DIR, "worker.log")

with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
    f.write("\n" + "="*70 + "\n")
    f.write(f"🚀 NEW WORKER RUN STARTED AT: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write("="*70 + "\n")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [WORKER] - %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE_PATH, mode='w', encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ==========================================
# HELPERS
# ==========================================
def cleanup_temp_files():
    """Deletes files in TEMP_DIR older than 5 days."""
    cutoff = time.time() - (5 * 86400)
    for filename in os.listdir(TEMP_DIR):
        file_path = os.path.join(TEMP_DIR, filename)
        if os.path.isfile(file_path) and os.stat(file_path).st_mtime < cutoff:
            try:
                os.remove(file_path)
            except Exception as e:
                logger.error(f"Cleanup Error for {filename}: {e}")

def remove_bg_removebg(input_path: str, output_path: str):
    if not REMOVEBG_API_KEY or "YOUR_KEY" in REMOVEBG_API_KEY:
        logger.error("Remove.bg API Key missing.")
        return False
    url = "https://api.remove.bg/v1.0/removebg"
    headers = {"X-Api-Key": REMOVEBG_API_KEY}
    try:
        with open(input_path, "rb") as img_file:
            response = requests.post(url, files={'image_file': img_file}, data={'size': 'auto', 'format': 'png'}, headers=headers, timeout=60)
        if response.status_code == 200:
            with open(output_path, "wb") as out: out.write(response.content)
            return True
        logger.error(f"Remove.bg Failed: {response.status_code} - {response.text}")
        return False
    except Exception as e:
        logger.error(f"Remove.bg Request Failed: {e}")
        return False

def parse_height_logic(height_input: str):
    clean = height_input.replace('"', '').replace("'", "").replace("’", "").replace("”", "")
    parts = re.split(r'[- ]', clean)
    ft, inch = 5, 0
    if len(parts) >= 2:
        try: ft, inch = int(parts[0]), int(parts[1])
        except: pass
    elif len(parts) == 1 and parts[0].isdigit():
        val = int(parts[0])
        if val < 10: ft = val
        elif val > 12: ft, inch = val // 12, val % 12
    total_inches = (ft * 12) + inch
    return f"{total_inches:03d}", f"{ft}’ {inch:02d}”"

def format_date_for_api(date_str: str):
    clean = re.sub(r"[^0-9]", "", date_str)
    if len(clean) == 8: return f"{clean[4:]}-{clean[0:2]}-{clean[2:4]}"
    return date_str

def generate_barcodes(user_data: dict, api_height: str):
    headers = {"Authorization": f"Bearer {FIS_API_KEY}", "Content-Type": "application/x-www-form-urlencoded"}
    state = user_data.get("jurisdiction", "NJ").upper().strip()
    if state == "FL": state = "FL"

    # --- DEBUG LOGGING ---
    logger.info(f"🔍 Processing user_data for Barcode: {json.dumps(user_data, indent=2)}")

    # --- COMMON PREP ---
    eye_map = {
        "BRN": "BRO", "BROWN": "BRO", "BLU": "BLU", "BLUE": "BLU",
        "GRN": "GRN", "GREEN": "GRN", "HZL": "HAZ", "HAZEL": "HAZ", 
        "BLK": "BLK", "BLACK": "BLK", "GRY": "GRY", "GRAY": "GRY"
    }
    raw_eyes = user_data.get("eyes", "BRO").upper().strip()
    api_eyes = eye_map.get(raw_eyes, raw_eyes)[:3] 

    api_weight = user_data.get("weight", "").strip()
    if api_weight.isdigit(): api_weight = f"{int(api_weight):03d}"
    
    hair_map = { "BLACK": "BLK", "BROWN": "BRO", "BLONDE": "BLO", "RED": "RED", "WHITE": "WHI", "GRAY": "GRY", "BALD": "BAL" }
    raw_hair = user_data.get("hair_color", "").upper().strip()
    api_hair = hair_map.get(raw_hair, raw_hair)[:3] if raw_hair else ""
    
    race_map = { "WHITE": "W", "BLACK": "B", "ASIAN": "A", "HISPANIC": "H", "INDIAN": "I", "NATIVE": "I" }
    raw_race = user_data.get("race", "").upper().strip()
    api_race = race_map.get(raw_race, raw_race)[:1] if raw_race else ""

    # Truncation Calculation
    fn_len = len(user_data.get("first_name", "").strip())
    mn_len = len(user_data.get("middle_name", "").strip())
    ln_len = len(user_data.get("last_name", "").strip())
    trunc_first = "T" if fn_len == 1 else "N"
    trunc_last = "T" if ln_len == 1 else "N"
    trunc_middle = "T" if mn_len == 1 else "N" if mn_len > 1 else ""

    # ==========================================================================
    # REAL ID COMPLIANCE LOGIC (All States)
    # F = Compliant (Visible) | N = Non-compliant (Not Visible)
    # ==========================================================================
    real_val = user_data.get("real_id", "").strip().upper()
    not_real_val = user_data.get("not_real_id", "").strip().upper()

    # 1. If they explicitly made 'Not Real ID' visible
    if "VISIBLE" in not_real_val and "NOT" not in not_real_val:
        real_id_status = "N"
    # 2. If they explicitly made 'Real ID' Not Visible/No
    elif "NOT" in real_val or "NON" in real_val or real_val == "NO":
        real_id_status = "N"
    # 3. If they explicitly made 'Real ID' Visible/Yes
    elif "VISIBLE" in real_val or "YES" in real_val:
        real_id_status = "F"
    # 4. Default Fallback
    else:
        real_id_status = "N"

    logger.info(f"🛡️ Real ID Status Computed as: '{real_id_status}' (Compliant=F, Non=N)")

    # --- DETERMINE DOCUMENT TYPE FOR API ---
    nj_doc_val = str(user_data.get("nj_doc_type", "")).upper()
    doc_class = str(user_data.get("class", "")).upper()
    
    # Robust check: Looks for Telegram's 'nj_id', Flask's 'ID', or if Class is explicitly 'NONE'
    if "ID" in nj_doc_val or "IDENTIFICATION" in nj_doc_val:
        doc_type = "ID"
    elif state == "NJ" and doc_class == "NONE":
        doc_type = "ID"
    else:
        doc_type = "DL"

    logger.info(f"🔍 Computed Document Type for API: '{doc_type}'")

    # ==========================================================================
    # FLORIDA SPECIFIC LOGIC
    # ==========================================================================
    if state == "FL":
        safe_driver_val = "2"
        val_safe = user_data.get("safe_driver", "").strip().upper()
        if val_safe == "YES" or val_safe == "VISIBLE":
            safe_driver_val = "1"

        replaced_date_val = ""
        if user_data.get("replaced", "").upper() == "YES":
            replaced_date_val = format_date_for_api(user_data.get("issue_date", ""))

        customer_id = f"{random.randint(0, 9999999999):010d}"

        payload = {
            "jurisdiction": state, 
            "document": doc_type, 
            "save": "true",
            "data[DAC]": user_data.get("first_name", "").upper(),
            "data[DCS]": user_data.get("last_name", "").upper(),
            "data[DAG]": user_data.get("address", "").upper(), 
            "data[DAI]": user_data.get("city", "").upper(),
            "data[DAJ]": user_data.get("state_code", state).upper(), 
            "data[DAK]": user_data.get("zip_code", ""),
            "data[DBC]": "1" if user_data.get("gender", "M").upper() in ["M", "1", "MALE"] else "2", 
            "data[DBB]": format_date_for_api(user_data.get("dob", "")),
            "data[DAU]": api_height, 
            "data[DAY]": api_eyes,        
            "data[DDA]": real_id_status,    
            "data[DDF]": trunc_first,  
            "data[DDE]": trunc_last,  
            "data[DCA]": user_data.get("class", "E").upper(), 
            "data[DCB]": user_data.get("restrictions", "NONE").upper(),
            "data[DCD]": user_data.get("endorsements", "NONE").upper(),
            "data[DBA]": format_date_for_api(user_data.get("expires_date", "")),
            "data[DBD]": format_date_for_api(user_data.get("issue_date", "")),
            "data[DCK]": user_data.get("inventory_control", "")
        }

        if api_weight: payload["data[DAW]"] = api_weight
        if api_hair: payload["data[DAZ]"] = api_hair
        if api_race: payload["data[DCL]"] = api_race
        if user_data.get("custom_dl"): payload["data[DAQ]"] = user_data["custom_dl"].upper().replace(" ", "")
        if mn_len > 0:
            payload["data[DAD]"] = user_data.get("middle_name", "").upper()
            payload["data[DDG]"] = trunc_middle

        payload["data[ZFA]"] = replaced_date_val   
        payload["data[ZFB]"] = ""          
        payload["data[ZFC]"] = safe_driver_val    
        payload["data[ZFD]"] = "N"          
        payload["data[ZFE]"] = "N"          
        payload["data[ZFF]"] = "N"          
        payload["data[ZFG]"] = "N"          
        payload["data[ZFH]"] = "N"          
        payload["data[ZFI]"] = "None"        
        payload["data[ZFJ]"] = customer_id      
        payload["data[ZFK]"] = ""          
        payload["data[ZNA]"] = "WX"
        payload["data[ZNB]"] = "11.00"
        payload["data[ZNC]"] = "ORI" 

    # ==========================================================================
    # STANDARD SPECIFIC LOGIC (Legacy Payload)
    # ==========================================================================
    else:
        payload = {
            "jurisdiction": state, 
            "document": doc_type, 
            "save": "true",
            "data[DAC]": user_data.get("first_name", "").upper(),
            "data[DCS]": user_data.get("last_name", "").upper(),
            "data[DAG]": user_data.get("address", "").upper(), 
            "data[DAI]": user_data.get("city", "").upper(),
            "data[DAJ]": user_data.get("state_code", state).upper(), 
            "data[DAK]": user_data.get("zip_code", ""),
            "data[DBC]": "1" if user_data.get("gender", "M").upper() in ["M", "1", "MALE"] else "2",
            "data[DBB]": format_date_for_api(user_data.get("dob", "")),
            "data[DAU]": api_height, 
            "data[DAY]": api_eyes,        
            "data[DDA]": real_id_status,    
            "data[DDF]": trunc_first, 
            "data[DDE]": trunc_last,  
            "data[DCA]": user_data.get("class", "D").upper(), 
            "data[DCB]": user_data.get("restrictions", "NONE").upper(),
            "data[DBA]": format_date_for_api(user_data.get("expires_date", "")),
            "data[DBD]": format_date_for_api(user_data.get("issue_date", "")),
            "data[ZNA]": "WX", 
            "data[ZNB]": "11.00", 
            "data[ZNC]": "DUP", 
            "data[DDC]": "1"
        }

        if state == "TX":
            payload["revision"] = "0900-2021" 
            payload["data[DDB]"] = "2021-07-16"
            
        if api_weight: payload["data[DAW]"] = api_weight
        if api_hair: payload["data[DAZ]"] = api_hair
        if api_race: payload["data[DCL]"] = api_race
        if user_data.get("custom_dl"): payload["data[DAQ]"] = user_data["custom_dl"].upper().replace(" ", "")
        if mn_len > 0:
            payload["data[DAD]"] = user_data.get("middle_name", "").upper()
            payload["data[DDG]"] = trunc_middle

    # --- LOGGING PAYLOAD ---
    logger.info(f"🚀 Sending payload to FIS API for state: {state}")
    logger.info(f"--- Exact Payload Sent to API ---\n{json.dumps(payload, indent=2)}")

    # --- EXECUTE REQUEST ---
    try:
        resp = requests.post(f"{API_BASE_URL}/barcode", headers=headers, data=payload, timeout=60)
        resp.raise_for_status()
    except Exception as e:
        logger.error(f"❌ FIS API POST Failed: {e}")
        if hasattr(e, 'response') and e.response is not None:
            logger.error(e.response.text)
        raise e
        
    barcode_id = resp.headers.get("X-Barcode-ID")
    logger.info(f"✅ Barcode successfully generated! Barcode ID: {barcode_id}")

    # Fetch all formats
    params = {"barcode_id": barcode_id}
    auth_head = {"Authorization": f"Bearer {FIS_API_KEY}"}
    
    big_svg, small_svg, big_tiff, small_tiff, big_png, small_png = b"", b"", None, None, None, None
    
    logger.info("⬇️ Fetching raw_text...")
    raw_text = requests.get(f"{API_BASE_URL}/export", headers={**auth_head, "Accept": "text/plain"}, params=params, timeout=60).text
    
    # --- LOGGING RAW TEXT & VERIFICATION ---
    logger.info(f"--- Returned Raw Barcode Text ---\n{raw_text}\n---------------------------------")
    clean_text = raw_text.replace('\n', '').replace('\r', '')
    
    if "IDDAQ" in clean_text:
        logger.info("✅ VERIFIED: Document Type correctly set to 'Identification Card' (IDDAQ found).")
    elif "DLDAQ" in clean_text:
        logger.info("✅ VERIFIED: Document Type correctly set to 'Driver License' (DLDAQ found).")
    else:
        logger.warning("⚠️ UNKNOWN: Could not definitively determine document type from raw text.")

    if f"DDA{real_id_status}" in clean_text:
        logger.info(f"✅ VERIFIED: Real ID Compliance correctly set to '{real_id_status}' (DDA{real_id_status} found).")
    else:
        logger.warning(f"❌ FAIL: Real ID Compliance 'DDA{real_id_status}' was NOT found in the raw text.")

    if state in ["NJ", "NY", "GA", "TX", "FL"]:
        logger.info("⬇️ Fetching big_svg...")
        big_svg = requests.get(f"{API_BASE_URL}/export", headers={**auth_head, "Accept": "image/svg+xml"}, params=params, timeout=60).content
        logger.info("⬇️ Fetching small_svg...")
        small_svg = requests.get(f"{API_BASE_URL}/linear", headers={**auth_head, "Accept": "image/svg+xml"}, params=params, timeout=60).content
        
    if state == "FL":
        logger.info("⬇️ Fetching big_tiff...")
        big_tiff = requests.get(f"{API_BASE_URL}/export", headers={**auth_head, "Accept": "image/tiff"}, params=params, timeout=60).content
        logger.info("⬇️ Fetching small_tiff...")
        small_tiff = requests.get(f"{API_BASE_URL}/linear", headers={**auth_head, "Accept": "image/tiff"}, params=params, timeout=60).content
        
    if state in ["PA", "VA"]:
        logger.info("⬇️ Fetching big_png...")
        big_png = requests.get(f"{API_BASE_URL}/export", headers={**auth_head, "Accept": "image/png"}, params=params, timeout=60).content
        logger.info("⬇️ Fetching small_png...")
        small_png = requests.get(f"{API_BASE_URL}/linear", headers={**auth_head, "Accept": "image/png"}, params=params, timeout=60).content

    logger.info("✅ Selected barcode files downloaded successfully!")
    return barcode_id, big_svg, small_svg, raw_text, big_tiff, small_tiff, big_png, small_png

def download_file(filename):
    """Downloads files from the Flask server securely."""
    if not filename: return None
    url = f"{WEB_SERVER_URL}/uploads/{filename}"
    local_path = os.path.join(TEMP_DIR, filename)
    try:
        resp = requests.get(url, timeout=30)
        if resp.status_code == 200:
            content_type = resp.headers.get('Content-Type', '')
            if 'text/html' in content_type:
                logger.error(f"❌ Download Error for {filename}: Server returned HTML. Ensure PythonAnywhere is reloaded.")
                return None
            with open(local_path, 'wb') as f:
                f.write(resp.content)
            return local_path
        else:
            logger.error(f"Download failed for {filename}. Status Code: {resp.status_code}")
    except Exception as e:
        logger.error(f"Download exception for {filename}: {e}")
    return None

# ==========================================
# MAIN WORKER LOOP
# ==========================================
def run_worker():
    logger.info(f"👷 Windows Worker Started. Polling {WEB_SERVER_URL} for jobs...")
    
    while True:
        try:
            cleanup_temp_files()
            
            resp = requests.get(f"{WEB_SERVER_URL}/api/worker/get_job?api_key={API_KEY}", timeout=30)
            if resp.status_code != 200 or 'job_id' not in resp.json():
                time.sleep(10)
                continue
                
            data = resp.json()
            job_id = data['job_id']
            cart = data['payload']
            logger.info(f"🚨 New Job Received! ID: {job_id} | Items: {len(cart)}")

            for idx, user_data in enumerate(cart):
                jurisdiction = user_data.get('jurisdiction', 'NJ').strip().upper()
                logger.info(f"⚙️ Processing Item {idx+1}/{len(cart)}: {jurisdiction}")

                # Download Face
                face_filename = user_data.get('face_path')
                if face_filename:
                    logger.info("Downloading Face Image...")
                    raw_face = download_file(face_filename)
                    if raw_face:
                        clean_face = os.path.join(TEMP_DIR, f"clean_{face_filename}.png")
                        if remove_bg_removebg(raw_face, clean_face):
                            user_data['face_path'] = clean_face
                        else:
                            user_data['face_path'] = raw_face
                    else:
                        user_data['face_path'] = ""

                # Download Signature
                sig_filename = user_data.get('signature_path')
                if sig_filename:
                    logger.info("Downloading Signature Image...")
                    raw_sig = download_file(sig_filename)
                    if raw_sig:
                        clean_sig = os.path.join(TEMP_DIR, f"clean_{sig_filename}.png")
                        if remove_bg_removebg(raw_sig, clean_sig):
                            user_data['signature_path'] = clean_sig
                        else:
                            user_data['signature_path'] = raw_sig
                    else:
                        user_data['signature_path'] = ""

                # Barcode Generation
                api_height, visual_height = parse_height_logic(user_data.get('height', '5-00'))
                b_res = generate_barcodes(user_data, api_height)
                barcode_id, big_svg, small_svg, raw_text, big_tiff, small_tiff, big_png, small_png = b_res

                # State Routing: Pass FINAL_DIR so modules save directly to the main root folder
                if jurisdiction == 'PA':
                    results = pa_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, big_png=big_png, small_png=small_png)
                elif jurisdiction == 'GA':
                    results = ga_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR)
                elif jurisdiction == 'FL':
                    results = fl_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, big_tiff=big_tiff, small_tiff=small_tiff)
                elif jurisdiction == 'NY':
                    results = ny_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR)
                elif jurisdiction == 'VA':
                    results = va_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, big_png, small_png)
                elif jurisdiction == 'TX':
                    results = tx_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR)
                else: # NJ
                    results = nj_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR)

                unique_id, data_path, out_front, out_back, out_psd = results[:5]
                jsx_paths = results[5:]

                with open(JOB_TICKET_PATH, "w", encoding="utf-8") as f:
                    f.write(data_path)
                
                data_map = {}
                with open(data_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if ":" in line:
                            k, v = line.split(":", 1)
                            data_map[k.strip()] = v.strip()

                # Trigger Photoshop
                logger.info(f"🎨 Triggering Photoshop for {unique_id}...")
                for jsx in jsx_paths:
                    subprocess.Popen([PHOTOSHOP_EXE_PATH, "-r", jsx])
                    time.sleep(2)

                # Intelligent Wait Loop (State Specific)
                timeout = 1800
                start_time = time.time()
                success = False

                while (time.time() - start_time) < timeout:
                    if jurisdiction in ["NY", "VA", "GA", "TX"]:
                        front_dir = data_map.get("Output Dir Front", "")
                        back_dir = data_map.get("Output Dir Back", "")
                        
                        def has_psd(directory):
                            if not directory or not os.path.exists(directory): return False
                            for f in os.listdir(directory):
                                if f.endswith(".psd") and os.path.getsize(os.path.join(directory, f)) > 0:
                                    return True
                            return False

                        if has_psd(front_dir) and has_psd(back_dir):
                            time.sleep(2)
                            success = True
                            break
                            
                    elif jurisdiction in ["FL", "PA"]:
                        out_color = data_map.get("Output Color", "")
                        out_black = data_map.get("Output Black", "")
                        
                        if (out_color and os.path.exists(out_color) and os.path.getsize(out_color) > 0 and 
                            out_black and os.path.exists(out_black) and os.path.getsize(out_black) > 0):
                            time.sleep(2)
                            success = True
                            break
                            
                    elif jurisdiction == "NJ":
                        out_psd = data_map.get("Output PSD", "")
                        if out_psd and os.path.exists(out_psd) and os.path.getsize(out_psd) > 0:
                            time.sleep(2)
                            success = True
                            break
                    
                    time.sleep(3)

                if success:
                    logger.info(f"✅ PSD Generation Complete for {jurisdiction}.")
                    
                    # Trigger Lightburn
                    lb_modules = {"NY": ny_module, "VA": va_module, "GA": ga_module, "TX": tx_module}
                    if jurisdiction in lb_modules:
                        logger.info("🔥 Generating Lightburn files...")
                        lb_modules[jurisdiction].generate_lightburn_lbrn(data_map, BASE_DIR)

                    # Folder Renaming to Exact Spec: FIRST NAME LAST NAME DOB (ORDER <id>)
                    created_dir = ""
                    if "Output Dir" in data_map:
                        created_dir = data_map["Output Dir"]
                    elif "Output Color" in data_map:
                        created_dir = os.path.dirname(data_map["Output Color"])
                    elif "Output Front" in data_map:
                        created_dir = os.path.dirname(data_map["Output Front"])
                    elif "Output PSD" in data_map:
                        created_dir = os.path.dirname(data_map["Output PSD"])

                    if created_dir and os.path.exists(created_dir):
                        dob_clean = user_data.get('dob', '').replace('/', '-')
                        first_name = user_data.get('first_name', '').upper()
                        last_name = user_data.get('last_name', '').upper()
                        
                        new_folder_name = f"{first_name} {last_name} {dob_clean} (ORDER {job_id})"
                        new_dir = os.path.join(FINAL_DIR, new_folder_name)
                        
                        if os.path.exists(new_dir):
                            new_dir = os.path.join(FINAL_DIR, f"{first_name} {last_name} {dob_clean} (ORDER {job_id}_{idx})")
                            
                        # WinError 5 Fix: Retry loop to give Photoshop time to release the file handles
                        rename_success = False
                        for attempt in range(15):  # Try 15 times (30 seconds total)
                            try:
                                os.rename(created_dir, new_dir)
                                logger.info(f"📁 Renamed output folder to: {os.path.basename(new_dir)}")
                                rename_success = True
                                break
                            except OSError as e:
                                logger.warning(f"⚠️ Folder locked by Photoshop (Attempt {attempt+1}/15). Waiting 2s...")
                                time.sleep(2)
                        
                        if not rename_success:
                            logger.error("❌ Failed to rename folder after 15 attempts. File is permanently locked by another process.")

                else:
                    logger.error(f"❌ Timeout reached waiting for {jurisdiction} files to generate.")

            # Notify Server
            logger.info("📡 Notifying Web Server that job is complete...")
            post_url = f"{WEB_SERVER_URL}/api/worker/submit/{job_id}?api_key={API_KEY}"
            upload_resp = requests.post(post_url, timeout=30)
                
            if upload_resp.status_code == 200:
                logger.info(f"🎉 Job {job_id} fully completed and marked green on the dashboard!")
            else:
                logger.error(f"Failed to notify server: {upload_resp.text}")

        except Exception as e:
            logger.error(f"Worker Loop Error: {e}")
            time.sleep(10)

if __name__ == "__main__":
    run_worker()