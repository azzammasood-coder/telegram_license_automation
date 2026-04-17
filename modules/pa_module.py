# pa_module.py

import os
import re
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

def clean_path(path: str) -> str:
    """Forces forward slashes for Photoshop compatibility."""
    return str(path).replace("\\", "/")

def sanitize_filename(text: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '-', str(text)).strip()

def extract_dl_from_raw(raw_text: str) -> str:
    if not raw_text: return ""
    match = re.search(r"DAQ([A-Za-z0-9]+)", raw_text)
    if match: return match.group(1)
    return ""

def extract_date_from_raw(raw_text: str, prefix: str) -> str:
    """Extracts date from raw barcode text and returns MM/DD/YYYY."""
    if not raw_text: return ""
    # Looks for prefix (DBA/DBD) followed by 8 digits
    match = re.search(f"{prefix}([0-9]{{8}})", raw_text)
    # print(f"date raw match: {match}")
    if match:
        d = match.group(1) # This is MMDDYYYY from the API string
        try:
            # The API usually returns MMDDYYYY for these fields
            # Format it to MM/DD/YYYY
            return f"{d[0:2]}/{d[2:4]}/{d[4:]}"
        except:
            return d
    return ""

def extract_dd_from_raw(raw_text: str) -> str:
    if not raw_text: return ""
    match = re.search(r"DCF([A-Za-z0-9]+)", raw_text)
    if match: return match.group(1)
    return ""

def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, big_png=None, small_png=None):
    
    # 1. Setup Data & Handle Blanks via API Barcode
    first_name = user_data.get('first_name', '').strip()
    last_name = user_data.get('last_name', '').strip()
    middle_name = user_data.get('middle_name', '').strip()
    logger.info(f"📄 Preparing PA job files and PSD instructions for: {first_name} {last_name}")
    
    dob_val = user_data.get('dob', '').strip() or extract_date_from_raw(raw_text, "DBB") or "01/01/2000"
    final_iss = user_data.get('issue_date', '').strip() or extract_date_from_raw(raw_text, "DBD") or "01/01/2020"
    final_exp = user_data.get('expires_date', '').strip() or extract_date_from_raw(raw_text, "DBA") or "01/01/2030"
    
    dob_clean = sanitize_filename(dob_val)
    unique_id = f"{first_name} {last_name} {dob_clean}"

    # 2. Setup Paths
    job_output_dir = os.path.join(FINAL_DIR, unique_id)
    os.makedirs(job_output_dir, exist_ok=True)

    out_front_color = clean_path(os.path.join(job_output_dir, f"Front Color Only.tif"))
    out_front_black = clean_path(os.path.join(job_output_dir, f"Front Black Only.png"))
    
    # 3. Handle Images & Unified Signature
    sig_path_source = user_data.get('signature_path')
    face_path_source = user_data.get('face_path')

    final_sig_path = clean_path(sig_path_source) if sig_path_source and os.path.exists(sig_path_source) else ""
    use_sig_image = "TRUE" if final_sig_path else "FALSE"
    final_sig_text = user_data.get('signature', '').strip()

    final_face_path = clean_path(face_path_source) if face_path_source and os.path.exists(face_path_source) else ""

    # 4. Save Barcodes (Back is just the PNG)
    if big_png:
        with open(os.path.join(job_output_dir, "barcode.png"), "wb") as f:
            f.write(big_png)
    if small_png:
        with open(os.path.join(job_output_dir, "linear_barcode.png"), "wb") as f:
            f.write(small_png)

    # 5. Logic Mappings
    # Zip: Use the full zip code instead of truncating
    full_zip = user_data.get('zip_code', '').strip().replace('-', '')[:5]

    # Real ID
    real_id_input = user_data.get('real_id', 'NO').upper()
    is_real_id = "YES" if "YES" in real_id_input else "NO"

    # DL Number
    final_dl_number = user_data.get('custom_dl', '').strip()
    if not final_dl_number:
        final_dl_number = extract_dl_from_raw(raw_text)
        
    # Format DL
    clean_dl = re.sub(r'[^a-zA-Z0-9]', '', final_dl_number)
    if len(clean_dl) == 8:
        formatted_dl = f"{clean_dl[:2]} {clean_dl[2:5]} {clean_dl[5:]}"
    else:
        formatted_dl = final_dl_number

    dd_value = extract_dd_from_raw(raw_text)
    
    # MICRO TEXT (Simple: AM98)
    try:
        f_init = first_name[0].upper() if first_name else ""
        l_init = last_name[0].upper() if last_name else ""
        dob_dt = datetime.strptime(dob_val, "%m/%d/%Y")
        dob_yy = dob_dt.strftime("%y")
        micro_text = f"{f_init}{l_init}{dob_yy}"
    except Exception as e:
        logger.error(f"PA Micro Text Error: {e}")
        micro_text = "ERROR"

    # --- GENDER LOGIC (Fix 1/0 -> M/F) ---
    raw_gen = str(user_data.get('gender', '1')).strip().upper()
    if raw_gen in ["1", "M", "MALE", "TRUE"]:
        final_sex = "M"
    else:
        final_sex = "F"

    # --- PA SPECIFIC HEIGHT FORMATTING ---
    # Converts shared format "5’ 08”" or "5' 08" into PA format "5'-08""
    pa_height = visual_height.replace("’ ", "'-").replace("' ", "'-").replace("”", '"')

    # 6. Build Text Content (PA Specific)
    lines = [
        f"Jurisdiction: PA",
        f"Output Color: {out_front_color}",
        f"Output Black: {out_front_black}",
        f"Sig Path: {final_sig_path}",
        f"Sig Text: {final_sig_text}",
        f"Use Sig Image: {use_sig_image}",
        f"Face Path: {final_face_path}",
        
        # Color Group
        f"Micro Top: {micro_text}",
        f"Real ID: {is_real_id}",
        
        # Black Group
        f"Top Micro Initials: {micro_text}",
        f"DL: {formatted_dl}",
        f"DOB: {dob_val}",
        f"Last Name: {last_name.upper()}",
        f"First Middle: {first_name.upper()} {middle_name.upper()}".strip(),
        f"Street 1: {user_data.get('address', '').upper()}",
        f"City State Zip: {user_data.get('city', '').upper()}, PA {full_zip}",
        f"Exp Date: {final_exp}",  
        f"Iss Date: {final_iss}",
        f"Sex: {final_sex}",
        f"Eye Color: {user_data.get('eyes', 'BRO')}",
        f"Height: {pa_height}",
        f"Class: {user_data.get('class', 'C')}",
        f"DD Line 1: {dd_value[:13] if dd_value else ''}",
        f"DD Line 2: {dd_value[13:] if dd_value else ''}",
        f"Bottom Micro Initials: {micro_text}"
    ]

    data_file_path = os.path.join(TEMP_DIR, f"pa_job_{sanitize_filename(unique_id)}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return unique_id, data_file_path, out_front_color, out_front_black, "dummy.psd", clean_path(os.path.join(BASE_DIR, "modules", "process_pa.jsx"))