# nj_module.py

import os
import re
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

def sanitize_filename(text: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '-', text).strip()

def get_ic_from_raw(raw_text: str) -> list:
    match = re.search(r'\nDCK(.*?)\r?\n', raw_text)
    found = match.group(1).strip() if match else ""
    if not found:
        match = re.search(r'DCK([^\n\r]+)', raw_text)
        found = match.group(1).strip() if match else "UNKNOWN"
    found = found.replace('-', '')
    return [found, found]

def calculate_chief_logic(issue_date_str: str) -> dict:
    results = {
        "Chief Sig July 1 2022 +": "Not Visible", "Chief Administrator +": "Not Visible",
        "Chief Sig July 1 2022 -": "Visible", "Chief administrator -": "Visible"
    }
    try:
        clean_date = issue_date_str.replace("-", "/")
        dt = datetime.strptime(clean_date, "%m/%d/%Y")
        if dt >= datetime(2022, 7, 1):
            results = {
                "Chief Sig July 1 2022 +": "Visible", "Chief Administrator +": "Visible",
                "Chief Sig July 1 2022 -": "Not Visible", "Chief administrator -": "Not Visible"
            }
    except ValueError: pass
    return results

def extract_date_from_raw(raw_text: str, prefix: str) -> str:
    """Extracts date from raw barcode text and returns MM/DD/YYYY."""
    if not raw_text: return ""
    match = re.search(f"{prefix}([0-9]{{8}})", raw_text)
    if match:
        d = match.group(1)
        return f"{d[0:2]}/{d[2:4]}/{d[4:]}"
    return ""

def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR):
    """NJ Specific Logic."""
    first = user_data.get('first_name', 'Unknown').strip()
    last = user_data.get('last_name', 'Unknown').strip()
    logger.info(f"📄 Preparing NJ job files and PSD instructions for: {first} {last}")
    
    # Handle Blanks via API Barcode
    dob_val = user_data.get('dob', '').strip() or extract_date_from_raw(raw_text, "DBB") or "01/01/2000"
    iss_val = user_data.get('issue_date', '').strip() or extract_date_from_raw(raw_text, "DBD") or "01/01/2020"
    exp_val = user_data.get('expires_date', '').strip() or extract_date_from_raw(raw_text, "DBA") or "01/01/2030"
    
    issue_clean = sanitize_filename(iss_val)
    dob_clean = sanitize_filename(dob_val)

    # Format: First Last NJ DOB
    folder_name = f"{first} {last} NJ {dob_clean}"
    base_name = folder_name 

    # Create the specific sub-folder in the Final Directory
    job_output_dir = os.path.join(FINAL_DIR, folder_name)
    os.makedirs(job_output_dir, exist_ok=True)
    
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    temp_id = f"{first}_{timestamp}"

    # Save raw data
    raw_data_path = os.path.join(TEMP_DIR, f"raw_data_{temp_id}.txt")
    with open(raw_data_path, "w", encoding="utf-8") as f: f.write(raw_text)

    # Extract Elements & Priority override with Custom DL
    daq_match = re.search(r'DAQ([^\n\r]+)', raw_text)
    dcf_match = re.search(r'DCF([^\n\r]+)', raw_text)
    
    extracted_dl = daq_match.group(1).strip() if daq_match else "NOT_FOUND"
    final_dl = user_data.get('custom_dl', '').strip() or extracted_dl
    
    extracted_dd = dcf_match.group(1).strip() if dcf_match else "NOT_FOUND"

    dl_clean = final_dl.replace(" ", "")
    formatted_dl = " ".join([dl_clean[i:i+5] for i in range(0, len(dl_clean), 5)]).strip()

    ic_raw = get_ic_from_raw(raw_text)[0]
    if "NJ" in ic_raw:
        parts = ic_raw.partition("NJ")
        ic_line_1 = parts[0]
        ic_line_2 = parts[1] + parts[2]
    else:
        ic_line_1 = ic_raw
        ic_line_2 = f"NJ{ic_raw}"

    full_first_name = first
    if user_data.get("middle_name"):
        full_first_name = f"{first} {user_data.get('middle_name')}"

    # Save SVGs
    big_name, small_name = f"barcode_{temp_id}.svg", f"linear_{temp_id}.svg"
    with open(os.path.join(TEMP_DIR, big_name), "wb") as f: f.write(big_svg)
    with open(os.path.join(TEMP_DIR, small_name), "wb") as f: f.write(small_svg)
    
    front_final = os.path.join(job_output_dir, f"Front_{base_name}.png")
    back_final  = os.path.join(job_output_dir, f"Back_{base_name}.png")
    psd_final   = os.path.join(job_output_dir, f"{base_name}.psd")
    
    # NJ Specific Logic
    logic = calculate_chief_logic(iss_val)

    # Unified Signature Logic
    sig_text_final = user_data.get('signature', '').strip()

    lines = [
        "--- SYSTEM CONFIG ---",
        f"Output Front: {front_final.replace('\\', '\\\\')}",
        f"Output Back: {back_final.replace('\\', '\\\\')}",
        f"Output PSD: {psd_final.replace('\\', '\\\\')}",
        f"Load Big Barcode: {os.path.join(TEMP_DIR, big_name).replace('\\', '\\\\')}",
        f"Load Small Barcode: {os.path.join(TEMP_DIR, small_name).replace('\\', '\\\\')}",
    ]

    if user_data.get("signature_path"):
        sig_path = user_data["signature_path"].replace('\\', '\\\\')
        lines.append(f"Load Signature Image: {sig_path}")

    if user_data.get("face_path"):
        face_path = user_data["face_path"].replace('\\', '\\\\')
        lines.append(f"Load Face Image: {face_path}")

    # Date Formatting: Replace slashes with dashes
    issue_fmt = iss_val.replace('/', '-')
    expires_fmt = exp_val.replace('/', '-')
    dob_fmt = dob_val.replace('/', '-')

    # Zip Formatting: Convert 070423819 to 07042-3819
    zip_raw = user_data.get('zip_code', '').strip()
    zip_fmt = f"{zip_raw[:5]}-{zip_raw[5:]}" if len(zip_raw) == 9 and '-' not in zip_raw else zip_raw

    lines.extend([
        "",
        "--- FRONT DATA ---",
        f"DL edit: {formatted_dl}", 
        f"DD: {extracted_dd}",
        f"Real ID Marker: {user_data.get('real_id', 'Visible')}",
        f"Not For Real Id: {user_data.get('not_real_id', 'Not Visible')}",
        f"Signature Edit: {sig_text_final}",
        f"Micro: ", 
        f"Chief Sig July 1 2022 +: {logic['Chief Sig July 1 2022 +']}",
        f"Chief Administrator +: {logic['Chief Administrator +']}",
        f"Chief Sig July 1 2022 -: {logic['Chief Sig July 1 2022 -']}",
        f"Chief administrator -: {logic['Chief administrator -']}",
        f"Class edit: {user_data.get('class', 'D')}",
        f"Issue edit: {issue_fmt}",
        f"Expires edit: {expires_fmt}",
        f"Last Edit: {last}",
        f"First Edit: {full_first_name}",
        f"Address Edit: {user_data.get('address', '')}",
        f"City state zip edit: {user_data.get('city', '')}, {user_data.get('state_code', 'NJ')} {user_data.get('zip_code', '')}",
        f"End edit: {user_data.get('endorsements', 'NONE')}",
        f"Restriction edit: {user_data.get('restrictions', 'NONE')}",
        f"Sex edit: {'M' if user_data.get('gender') == '1' else 'F' if user_data.get('gender') == '2' else user_data.get('gender')}",
        f"Eyes edit: {'BRN' if user_data.get('eyes', '').upper().strip() in ['BRO', 'BROWN'] else user_data.get('eyes', 'BRN')}",
        f"Height edit: {visual_height}", 
        "",
        "--- BACK DATA ---",
        f"Ic Line 1: {ic_line_1}", 
        f"Ic Line 2: {ic_line_2}", 
        f"Dob: {dob_fmt}",
    ])

    data_file_path = os.path.join(TEMP_DIR, f"data_{temp_id}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f: f.write("\n".join(lines))
    
    # Return path to NJ JSX
    jsx_path = os.path.join(BASE_DIR, "modules", "process_nj.jsx")
    
    return temp_id, data_file_path, front_final, back_final, psd_final, jsx_path