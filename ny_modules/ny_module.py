import os
import re
import json
import random
from datetime import datetime, timezone
from PIL import Image

def sanitize_filename(text: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '-', text).strip()

def process_grayscale_image(input_path: str, temp_dir: str) -> str:
    """Converts image to grayscale and saves to temp."""
    try:
        if not os.path.exists(input_path): return ""
        
        name = os.path.basename(input_path)
        out_name = "gray_" + name
        out_path = os.path.join(temp_dir, out_name)
        
        img = Image.open(input_path).convert('L') # Convert to Grayscale
        img.save(out_path)
        return out_path
    except Exception as e:
        print(f"Grayscale Error: {e}")
        return input_path # Fallback

def format_date_ny_swirl(date_str: str) -> str:
    """06/11/1987 -> JUN 11 87"""
    try:
        dt = datetime.strptime(date_str, "%m/%d/%Y")
        return dt.strftime("%b %d %y").upper()
    except: return date_str

def format_date_ny_compact(date_str: str) -> str:
    """06/11/1987 -> JUN87"""
    try:
        dt = datetime.strptime(date_str, "%m/%d/%Y")
        return dt.strftime("%b%y").upper()
    except: return date_str

def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR):
    """NY Specific Logic."""
    first = user_data.get('first_name', 'Unknown').strip()
    middle = user_data.get('middle_name', '').strip()
    last = user_data.get('last_name', 'Unknown').strip()
    dob = user_data.get('dob', '') # MM/DD/YYYY
    
    issue_clean = sanitize_filename(user_data.get('issue_date', '00-00-0000'))
    base_name = f"{first} {last}_{issue_clean}"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    temp_id = f"{first}_{timestamp}"

    # --- SAVE RAW DATA ---
    raw_data_path = os.path.join(TEMP_DIR, f"raw_data_{temp_id}.txt")
    with open(raw_data_path, "w", encoding="utf-8") as f: f.write(raw_text)

    # --- DL SPLIT LOGIC ---
    # Input: 9 digits (e.g., 919698127)
    # Layer "16 RAISED DL" needs digits at indices 1, 4, 7 -> "  1      9    2  "
    # Layer "10... DL remaining" needs indices 0, 2, 3, 5, 6, 8 -> "9  9 6  8 1  7"
    
    raw_dl = user_data.get('custom_dl', '000000000').replace(" ", "").replace("-", "")
    if len(raw_dl) < 9: raw_dl = raw_dl.ljust(9, '0')
    raw_dl = raw_dl[:9]

    # Indices: 0 1 2 3 4 5 6 7 8
    # 3 Chars:   ^     ^     ^
    dl_3_chars = f"  {raw_dl[1]}      {raw_dl[4]}    {raw_dl[7]}  "
    
    # Remaining: ^   ^ ^   ^ ^   ^
    # Default format visual: "4  7 1  9 0  0"
    dl_remaining = f"{raw_dl[0]}  {raw_dl[2]} {raw_dl[3]}  {raw_dl[5]} {raw_dl[6]}  {raw_dl[8]}"

    # --- SWIRL NAME LOGIC (Fixed 26 chars) ---
    # Template default: ANNARDIESSLINANNARDIESSLIN (26 chars)
    # We must generate exactly 26 characters to map to the font size arrays
    full_name_clean = f"{first}{middle}{last}".upper().replace(" ", "")
    swirl_text_26 = full_name_clean
    while len(swirl_text_26) < 26:
        swirl_text_26 += full_name_clean
    swirl_text_26 = swirl_text_26[:26]

    # --- MICRO TEXT ---
    # "06 11 2032 Anna R Diesslin..."
    exp_date = user_data.get('expires_date', '').replace("/", " ")
    micro_base = f"{exp_date} {first} {middle} {last}"
    micro_text = (micro_base + " ") * 4 
    micro_text = micro_text.strip()[:100]

    # --- DATE PARTS ---
    # DOB: 05/09/1959
    try:
        dt_dob = datetime.strptime(dob, "%m/%d/%Y")
        dob_day = dt_dob.strftime("%d")
        dob_month = dt_dob.strftime("%m")
        dob_year = dt_dob.strftime("%Y")
        dob_year_last2 = dt_dob.strftime("%y")
        dob_year_first2 = dob_year[:2]
        dob_swirl = dt_dob.strftime("%b %d %y").upper() # JUN 11 87
        dob_compact = dt_dob.strftime("%b%y").upper()   # JUN87
    except:
        dob_day, dob_month, dob_year, dob_year_last2, dob_year_first2 = "01", "01", "2000", "00", "20"
        dob_swirl = "JAN 01 00"
        dob_compact = "JAN00"

    # EXP:
    try:
        dt_exp = datetime.strptime(user_data.get('expires_date', ''), "%m/%d/%Y")
        exp_day = dt_exp.strftime("%d")
        exp_month = dt_exp.strftime("%m")
        exp_year_last2 = dt_exp.strftime("%y")
    except:
        exp_day, exp_month, exp_year_last2 = "01", "01", "30"

    # --- BACK DOC DISCRIMINATOR ---
    # Find DCF in raw text or use random/default
    dcf_match = re.search(r'DCF([^\n\r]+)', raw_text)
    doc_discriminator = dcf_match.group(1).strip() if dcf_match else "XF1F6X3S93"

    # --- BARCODE NUMBER ---
    # Default: 01223 003211301 94
    # Mocking format: 01223 [DL] 94
    barcode_num_text = f"01223 {raw_dl} 94"

    # --- GRAYSCALE PROCESSING ---
    face_path = user_data.get("face_path", "")
    gray_face_path = ""
    if face_path:
        gray_face_path = process_grayscale_image(face_path, TEMP_DIR)

    # --- BARCODES ---
    big_name, small_name = f"barcode_{temp_id}.svg", f"linear_{temp_id}.svg"
    with open(os.path.join(TEMP_DIR, big_name), "wb") as f: f.write(big_svg)
    with open(os.path.join(TEMP_DIR, small_name), "wb") as f: f.write(small_svg)
    
    front_final = os.path.join(FINAL_DIR, f"Front_{base_name}.png")
    back_final  = os.path.join(FINAL_DIR, f"Back_{base_name}.png")
    psd_final   = os.path.join(FINAL_DIR, f"{base_name}.psd")

    # --- DATA FILE CONSTRUCTION ---
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

    if gray_face_path:
        lines.append(f"Load Face Image: {gray_face_path.replace('\\', '\\\\')}")

    lines.extend([
        "",
        "--- FRONT DATA ---",
        f"DL 3 Chars: {dl_3_chars}",
        f"DL Remaining: {dl_remaining}",
        f"Swirl Text 26: {swirl_text_26}",
        f"Micro Text: {micro_text}",
        f"First 2 Digits Year: {dob_year_first2}",
        f"Gender: {user_data.get('gender', 'M')}",
        f"Height: {visual_height}",
        f"Eyes: {user_data.get('eyes', 'BRN')}",
        f"Dob Month: {dob_month}",
        f"Dob Day: {dob_day}",
        f"Dob Year Last 2: {dob_year_last2}",
        f"Raised EXP: {user_data.get('expires_date')}",
        f"Raised DOB: {dob}",
        f"Issue Full: {user_data.get('issue_date')}",
        f"Exp Day: {exp_day}",
        f"Exp Month: {exp_month}",
        f"Exp Year Last 2: {exp_year_last2}",
        f"Dob Swirl: {dob_swirl}",     # JUN 11 87
        f"Dob Compact: {dob_compact}", # JUN87
        f"Class: {user_data.get('class', 'D')}",
        
        "",
        "--- BACK DATA ---",
        f"Doc Discriminator: {doc_discriminator}", 
        f"Back Barcode Num: {barcode_num_text}",
        f"Back Swirl Month 1: {dob_swirl[:1]}", # J
        f"Back Swirl Month 2: {dob_swirl[1:2]}", # U
        f"Back Swirl Month 3: {dob_swirl[2:3]}", # N
        f"Back Swirl Day: {dob_day}",
        f"Back Swirl Year: {dob_year_last2}",
        f"Back Raised Text: {swirl_text_26}", # Same 26 char logic
        f"Raw DL: {raw_dl}"
    ])

    data_file_path = os.path.join(TEMP_DIR, f"data_{temp_id}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f: f.write("\n".join(lines))
    
    jsx_path = os.path.join(BASE_DIR, "process_ny.jsx")
    return temp_id, data_file_path, front_final, back_final, psd_final, jsx_path