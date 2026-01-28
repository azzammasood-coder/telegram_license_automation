# fl_module.py

import os
import re
from datetime import datetime
import shutil

def sanitize_filename(text: str) -> str:
    """Sanitizes text for use in filenames."""
    return re.sub(r'[<>:"/\\|?*]', '-', str(text)).strip()

def parse_date(date_str: str) -> datetime:
    """Attempts to parse a date string into a datetime object."""
    formats = ["%m/%d/%Y", "%m-%d-%Y", "%Y-%m-%d", "%Y.%m.%d"]
    for fmt in formats:
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    return None

def is_safe_driver_text_eligible(issue_date_str: str) -> str:
    """
    Checks if Issue Date is between Aug 2017 and Aug 2019 for the BLACK TEXT layer.
    Returns 'Visible' or 'Not Visible'.
    """
    dt = parse_date(issue_date_str)
    if dt:
        start_date = datetime(2017, 8, 1)
        end_date = datetime(2019, 8, 31)
        if start_date <= dt <= end_date:
            return "Visible"
    return "Not Visible"

def clean_path(path: str) -> str:
    """Forces forward slashes for Photoshop compatibility."""
    return str(path).replace("\\", "/")

def format_fl_dl_number(dl_string: str) -> str:
    """
    Formats a raw alphanumeric string into Florida DL format: A123-456-78-901-0
    """
    if not dl_string:
        return ""
    
    raw = re.sub(r'[^a-zA-Z0-9]', '', str(dl_string)).upper()
    
    if len(raw) == 13:
        return f"{raw[:4]}-{raw[4:7]}-{raw[7:9]}-{raw[9:12]}-{raw[12:]}"
    return dl_string

def extract_dd_from_raw(raw_text: str) -> str:
    """Extracts the Document Discriminator (DCF) from the raw barcode data."""
    if not raw_text:
        return ""
    match = re.search(r"DCF([A-Za-z0-9]+)", raw_text)
    if match:
        return match.group(1)
    return ""

def extract_dl_from_raw(raw_text: str) -> str:
    """Extracts the Customer ID/DL Number (DAQ) from the raw barcode data."""
    if not raw_text:
        return ""
    # Look for DAQ followed by alphanumeric characters
    match = re.search(r"DAQ([A-Za-z0-9]+)", raw_text)
    if match:
        return match.group(1)
    return ""

def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, big_tiff=None, small_tiff=None):
    """
    Creates the FL specific data.txt file and moves images.
    """
    
    # 1. Clean Data
    first_name = user_data.get('first_name', '').upper()
    last_name = user_data.get('last_name', '').upper()
    dob_clean = sanitize_filename(user_data.get('dob', '00000000'))
    unique_id = f"{first_name} {last_name} {dob_clean}"

    # 2. Logic Mappings
    real_id_input = user_data.get('real_id', 'NO').upper()
    real_id_star = "Visible" if "YES" in real_id_input or "VISIBLE" in real_id_input else "Not Visible"
    
    safe_driver_input = user_data.get('safe_driver', 'NO').upper()
    safe_driver_graphic = "Visible" if "YES" in safe_driver_input else "Not Visible"
    
    safe_driver_text = is_safe_driver_text_eligible(user_data.get('issue_date', ''))

    replaced_input = user_data.get('replaced', 'NO').upper()
    replaced_visible = "Visible" if "YES" in replaced_input else "Not Visible"

    # Microtext
    f_init = first_name[0] if first_name else ""
    l_init = last_name[0] if last_name else ""
    try:
        dob_dt = datetime.strptime(user_data.get('dob', ''), "%m/%d/%Y")
        dob_yy = dob_dt.strftime("%y")
    except:
        dob_yy = "00"
    micro_text = f"{f_init}{l_init}{dob_yy}"

    full_zip = user_data.get('zip_code', '')
    short_zip = full_zip[:5] if len(full_zip) >= 5 else full_zip

    # 3. Setup Paths
    job_output_dir = os.path.join(FINAL_DIR, unique_id)
    os.makedirs(job_output_dir, exist_ok=True)

    out_front_color = clean_path(os.path.join(job_output_dir, f"Front_Color_Only.tif"))
    out_front_black = clean_path(os.path.join(job_output_dir, f"Front_Black_Only.tif"))
    
    # 4. Handle Images & Signature Logic
    sig_path_source = user_data.get('signature_path')
    face_path_source = user_data.get('face_path')

    final_sig_path = ""
    final_sig_text = ""
    
    ## Signature Decision Tree
    if sig_path_source and os.path.exists(sig_path_source):
        # Use existing temp path directly
        final_sig_path = clean_path(sig_path_source)
    else:
        # Use Text
        raw_sig = user_data.get('signature_text', '') or user_data.get('signature', '')
        if raw_sig and raw_sig.upper() not in ["SKIP", "NO", "NONE"]:
            final_sig_text = raw_sig
        else:
            fn = user_data.get('first_name', '').strip().title()
            ln = user_data.get('last_name', '').strip().title()
            li = ln[0] if ln else ""
            final_sig_text = f"{fn} {li}"

    final_face_path = ""
    if face_path_source and os.path.exists(face_path_source):
        # Use existing temp path directly
        final_face_path = clean_path(face_path_source)

    # 5. Save Barcodes (4 Files Total)
    # [UPDATED] Save Big+Small as both TIFF+SVG with specific names
    if big_tiff:
        with open(os.path.join(job_output_dir, "barcode.tiff"), "wb") as f:
            f.write(big_tiff)
    if big_svg:
        with open(os.path.join(job_output_dir, "barcode.svg"), "wb") as f:
            f.write(big_svg)
            
    if small_tiff:
        with open(os.path.join(job_output_dir, "linear barcode.tiff"), "wb") as f:
            f.write(small_tiff)
    if small_svg:
        with open(os.path.join(job_output_dir, "linear barcode.svg"), "wb") as f:
            f.write(small_svg)

    dd_value = extract_dd_from_raw(raw_text)

    final_dl_number = user_data.get('custom_dl', '')
    if not final_dl_number:
        final_dl_number = extract_dl_from_raw(raw_text)

    # 6. Build Text Content
    lines = [
        f"State Code: FL",
        f"Output Color: {out_front_color}",
        f"Output Black: {out_front_black}",
        f"Sig Path: {final_sig_path}",
        f"Sig Text: {final_sig_text}",
        f"Face Path: {final_face_path}",
        
        f"Top Micro Text: {micro_text}",
        f"Driver License Number: {format_fl_dl_number(final_dl_number)}",
        f"License Class: {user_data.get('class', 'E')}",
        f"Last Name: {last_name}",
        f"First Middle: {first_name} {user_data.get('middle_name', '').upper()}",
        f"Street Address Apt/Unit: {user_data.get('address', '').upper()}",
        f"City State Zip: {user_data.get('city', '').upper()} FL {short_zip}",
        f"Dob: {user_data.get('dob', '')}",
        f"Sex: {user_data.get('gender', 'M')}",
        f"Exp: {user_data.get('expires_date', '')}",
        f"Height: {visual_height}",
        f"Restriction: {user_data.get('restrictions', 'NONE')}",
        f"End: {user_data.get('endorsements', 'NONE')}",
        f"Issue Date: {user_data.get('issue_date', '')}",
        f"DD: {dd_value}",
        f"Bottom Micro Text: {micro_text}",
        f"REPLACED DATE: {user_data.get('issue_date', '')}",
        
        f"Real ID Star: {real_id_star}",
        f"Safe Driver Color: {safe_driver_graphic}",
        f"Safe Driver Black: {safe_driver_text}", 
        f"Show Replaced: {replaced_visible}"
    ]

    data_file_path = os.path.join(TEMP_DIR, f"fl_job_{sanitize_filename(unique_id)}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    return unique_id, data_file_path, out_front_color, out_front_black, "dummy.psd", clean_path(os.path.join(BASE_DIR, "modules", "process_fl.jsx"))