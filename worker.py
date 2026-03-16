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
# Replace with your actual PythonAnywhere URL
WEB_SERVER_URL = "https://ghostautomation.pythonanywhere.com" 
API_KEY = "worker-secret-123"

# Load local config.json
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
with open(CONFIG_PATH, "r") as f:
    config = json.load(f)

FIS_API_KEY = config['api']['fis_key']
API_BASE_URL = config['api']['fis_url']
REMOVEBG_API_KEY = config['api']['removebg_key']
BASE_DIR = config['paths']['base_dir']
PHOTOSHOP_EXE_PATH = config['paths']['photoshop_exe']

# Setup Directories
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

# Add a visual separator to the log file for every new run
with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
    f.write("\n" + "="*70 + "\n")
    f.write(f"🚀 NEW WORKER RUN STARTED AT: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
    f.write("="*70 + "\n")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [WORKER] - %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE_PATH, encoding="utf-8"),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# ==========================================
# HELPERS (Ported from Telegram Bot)
# ==========================================
def remove_bg_removebg(input_path: str, output_path: str):
    if not REMOVEBG_API_KEY or "YOUR_KEY" in REMOVEBG_API_KEY:
        logger.error("Remove.bg API Key missing.")
        return False
    url = "https://api.remove.bg/v1.0/removebg"
    headers = {"X-Api-Key": REMOVEBG_API_KEY}
    try:
        with open(input_path, "rb") as img_file:
            response = requests.post(url, files={'image_file': img_file}, data={'size': 'auto', 'format': 'png'}, headers=headers)
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
    
    eye_map = {"BRN": "BRO", "BROWN": "BRO", "BLU": "BLU", "BLUE": "BLU", "GRN": "GRN", "GREEN": "GRN", "HZL": "HAZ", "HAZEL": "HAZ", "BLK": "BLK", "BLACK": "BLK", "GRY": "GRY", "GRAY": "GRY"}
    api_eyes = eye_map.get(user_data.get("eyes", "BRO").upper().strip(), "BRO")[:3] 
    
    fn_len = len(user_data.get("first_name", "").strip())
    mn_len = len(user_data.get("middle_name", "").strip())
    ln_len = len(user_data.get("last_name", "").strip())
    
    trunc_first = "T" if fn_len == 1 else "N"
    trunc_last = "T" if ln_len == 1 else "N"
    trunc_middle = "T" if mn_len == 1 else "N" if mn_len > 1 else ""
    real_id_status = "F" if "VISIBLE" in user_data.get("real_id", "").upper() or "YES" in user_data.get("real_id", "").upper() else "N"

    if state == "FL":
        safe_driver_val = "1" if user_data.get("safe_driver", "").upper() in ["YES", "VISIBLE"] else "2"
        replaced_date_val = format_date_for_api(user_data.get("issue_date", "")) if user_data.get("replaced", "").upper() == "YES" else ""
        payload = {
            "jurisdiction": state, "document": "DL", "save": "true",
            "data[DAC]": user_data.get("first_name", "").upper(), "data[DCS]": user_data.get("last_name", "").upper(),
            "data[DAG]": user_data.get("address", "").upper(), "data[DAI]": user_data.get("city", "").upper(),
            "data[DAJ]": user_data.get("state_code", state).upper(), "data[DAK]": user_data.get("zip_code", ""),
            "data[DBC]": "1" if user_data.get("gender", "M").upper() in ["M", "1", "MALE"] else "2", 
            "data[DBB]": format_date_for_api(user_data.get("dob", "")), "data[DAU]": api_height, 
            "data[DAY]": api_eyes, "data[DDA]": real_id_status, "data[DDF]": trunc_first, "data[DDE]": trunc_last, 
            "data[DCA]": user_data.get("class", "E").upper(), "data[DCB]": user_data.get("restrictions", "NONE").upper(),
            "data[DCD]": user_data.get("endorsements", "NONE").upper(), "data[DBA]": format_date_for_api(user_data.get("expires_date", "")),
            "data[DBD]": format_date_for_api(user_data.get("issue_date", "")),
            "data[ZFA]": replaced_date_val, "data[ZFB]": "", "data[ZFC]": safe_driver_val, "data[ZFD]": "N",
            "data[ZFE]": "N", "data[ZFF]": "N", "data[ZFG]": "N", "data[ZFH]": "N", "data[ZFI]": "None",
            "data[ZFJ]": f"{random.randint(0, 9999999999):010d}", "data[ZFK]": "",
            "data[ZNA]": "WX", "data[ZNB]": "11.00", "data[ZNC]": "ORI" 
        }
    else:
        payload = {
            "jurisdiction": state, "document": "DL", "save": "true",
            "data[DAC]": user_data.get("first_name", "").upper(), "data[DCS]": user_data.get("last_name", "").upper(),
            "data[DAG]": user_data.get("address", "").upper(), "data[DAI]": user_data.get("city", "").upper(),
            "data[DAJ]": user_data.get("state_code", state).upper(), "data[DAK]": user_data.get("zip_code", ""),
            "data[DBC]": "1" if user_data.get("gender", "M").upper() in ["M", "1", "MALE"] else "2",
            "data[DBB]": format_date_for_api(user_data.get("dob", "")), "data[DAU]": api_height, 
            "data[DAY]": api_eyes, "data[DDA]": real_id_status, "data[DDF]": trunc_first, "data[DDE]": trunc_last, 
            "data[DCA]": user_data.get("class", "D").upper(), "data[DCB]": user_data.get("restrictions", "NONE").upper(),
            "data[DBA]": format_date_for_api(user_data.get("expires_date", "")),
            "data[DBD]": format_date_for_api(user_data.get("issue_date", "")),
            "data[ZNA]": "WX", "data[ZNB]": "11.00", "data[ZNC]": "DUP", "data[DDC]": "1"
        }
        if state == "TX":
            payload["revision"] = "0900-2021"
            payload["data[DDB]"] = "2021-07-16"

    if user_data.get("custom_dl"): payload["data[DAQ]"] = user_data["custom_dl"].upper().replace(" ", "")
    if mn_len > 0:
        payload["data[DAD]"] = user_data.get("middle_name", "").upper()
        payload["data[DDG]"] = trunc_middle

    resp = requests.post(f"{API_BASE_URL}/barcode", headers=headers, data=payload, timeout=60)
    resp.raise_for_status()
    barcode_id = resp.headers.get("X-Barcode-ID")
    
    params = {"barcode_id": barcode_id}
    auth_head = {"Authorization": f"Bearer {FIS_API_KEY}"}
    
    big_svg = requests.get(f"{API_BASE_URL}/export", headers={**auth_head, "Accept": "image/svg+xml"}, params=params).content
    small_svg = requests.get(f"{API_BASE_URL}/linear", headers={**auth_head, "Accept": "image/svg+xml"}, params=params).content
    big_tiff = requests.get(f"{API_BASE_URL}/export", headers={**auth_head, "Accept": "image/tiff"}, params=params).content
    small_tiff = requests.get(f"{API_BASE_URL}/linear", headers={**auth_head, "Accept": "image/tiff"}, params=params).content
    raw_text = requests.get(f"{API_BASE_URL}/export", headers={**auth_head, "Accept": "text/plain"}, params=params).text
    big_png = requests.get(f"{API_BASE_URL}/export", headers={**auth_head, "Accept": "image/png"}, params=params).content
    small_png = requests.get(f"{API_BASE_URL}/linear", headers={**auth_head, "Accept": "image/png"}, params=params).content

    return barcode_id, big_svg, small_svg, raw_text, big_tiff, small_tiff, big_png, small_png

def download_file(filename):
    """Downloads files from the Flask server securely."""
    if not filename: return None
    url = f"{WEB_SERVER_URL}/uploads/{filename}"
    local_path = os.path.join(TEMP_DIR, filename)
    try:
        resp = requests.get(url)
        if resp.status_code == 200:
            # Check if the server accidentally returned an HTML redirect page
            content_type = resp.headers.get('Content-Type', '')
            if 'text/html' in content_type:
                logger.error(f"❌ Download Error for {filename}: Server returned an HTML web page instead of an image. "
                             f"Did you forget to reload PythonAnywhere?")
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
            # 1. Ask server for jobs
            resp = requests.get(f"{WEB_SERVER_URL}/api/worker/get_job?api_key={API_KEY}")
            if resp.status_code != 200 or 'job_id' not in resp.json():
                time.sleep(10)
                continue
                
            data = resp.json()
            job_id = data['job_id']
            cart = data['payload']
            logger.info(f"🚨 New Job Received! ID: {job_id} | Items: {len(cart)}")

            JOB_OUT_DIR = os.path.join(FINAL_DIR, f"ORDER_{job_id}")
            os.makedirs(JOB_OUT_DIR, exist_ok=True)

            # 2. Process each item
            for idx, user_data in enumerate(cart):
                jurisdiction = user_data.get('jurisdiction', 'NJ').strip().upper()
                logger.info(f"⚙️ Processing Item {idx+1}/{len(cart)}: {jurisdiction}")

                # Download and Remove BG for Face
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
                        user_data['face_path'] = "" # Clear path if download failed

                # Download and Remove BG for Signature
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

                # Generate Barcodes via FIS API
                logger.info("Generating Barcodes...")
                api_height, visual_height = parse_height_logic(user_data.get('height', '5-00'))
                b_res = generate_barcodes(user_data, api_height)
                barcode_id, big_svg, small_svg, raw_text, big_tiff, small_tiff, big_png, small_png = b_res

                # Route to State Module
                if jurisdiction == 'PA':
                    results = pa_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, JOB_OUT_DIR, BASE_DIR, big_png=big_png, small_png=small_png)
                elif jurisdiction == 'GA':
                    results = ga_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, JOB_OUT_DIR, BASE_DIR)
                elif jurisdiction == 'FL':
                    results = fl_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, JOB_OUT_DIR, BASE_DIR, big_tiff=big_tiff, small_tiff=small_tiff)
                elif jurisdiction == 'NY':
                    results = ny_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, JOB_OUT_DIR, BASE_DIR)
                elif jurisdiction == 'VA':
                    results = va_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, JOB_OUT_DIR, BASE_DIR, big_png, small_png)
                elif jurisdiction == 'TX':
                    results = tx_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, JOB_OUT_DIR, BASE_DIR)
                else: # NJ
                    results = nj_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, JOB_OUT_DIR, BASE_DIR)

                unique_id, data_path, out_front, out_back, out_psd = results[:5]
                jsx_paths = results[5:]

                # Write active job ticket
                with open(JOB_TICKET_PATH, "w", encoding="utf-8") as f:
                    f.write(data_path)
                
                # Setup Lightburn Data map
                data_map = {}
                with open(data_path, "r", encoding="utf-8") as f:
                    for line in f:
                        if ":" in line:
                            k, v = line.split(":", 1)
                            data_map[k.strip()] = v.strip()

                # Trigger Photoshop
                logger.info(f"🎨 Firing Photoshop for {unique_id}...")
                for jsx in jsx_paths:
                    subprocess.Popen([PHOTOSHOP_EXE_PATH, "-r", jsx])
                    time.sleep(2)

                # Wait Loop
                timeout = 1800
                start_time = time.time()
                success = False

                while (time.time() - start_time) < timeout:
                    if jurisdiction in ["NY", "VA", "GA", "TX"]:
                        base_name = data_map.get("Base Name", "")
                        front_dir = data_map.get("Output Dir Front", "")
                        back_dir = data_map.get("Output Dir Back", "")
                        
                        def is_psd_saved(directory, match_name):
                            if not os.path.exists(directory): return False
                            for f in os.listdir(directory):
                                if f.endswith(".psd") and match_name in f and os.path.getsize(os.path.join(directory, f)) > 0:
                                    return True
                            return False

                        if is_psd_saved(front_dir, base_name) and is_psd_saved(back_dir, base_name):
                            time.sleep(2)
                            success = True
                            break
                    else:
                        if os.path.exists(out_psd) and os.path.getsize(out_psd) > 0:
                            target_dir = os.path.dirname(out_psd)
                            if os.path.exists(target_dir):
                                all_files = os.listdir(target_dir)
                                found_front = any("Front" in f and unique_id.split('_')[0] in f for f in all_files)
                                found_back = any("Back" in f and unique_id.split('_')[0] in f for f in all_files)
                                if found_front and found_back:
                                    time.sleep(2)
                                    success = True
                                    break
                    
                    time.sleep(3)

                if success:
                    logger.info("✅ PSD Generation Complete.")
                    # Trigger Lightburn
                    lb_modules = {"NY": ny_module, "VA": va_module, "GA": ga_module, "TX": tx_module}
                    if jurisdiction in lb_modules:
                        logger.info("🔥 Generating Lightburn files...")
                        lb_modules[jurisdiction].generate_lightburn_lbrn(data_map, BASE_DIR)

            # 3. Notify Server that Job is done
            logger.info("📡 Notifying Web Server that job is complete...")
            post_url = f"{WEB_SERVER_URL}/api/worker/submit/{job_id}?api_key={API_KEY}"
            upload_resp = requests.post(post_url)
                
            if upload_resp.status_code == 200:
                logger.info(f"🎉 Job {job_id} fully completed and saved locally in Final_Documents!")
            else:
                logger.error(f"Failed to notify server: {upload_resp.text}")

        except Exception as e:
            logger.error(f"Worker Loop Error: {e}")
            time.sleep(10)

if __name__ == "__main__":
    run_worker()