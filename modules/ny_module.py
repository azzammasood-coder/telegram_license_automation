import os
import re
import json
import random
from datetime import datetime, timezone
from PIL import Image

def sanitize_filename(text: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '-', text).strip()

def process_grayscale_image(input_path: str, temp_dir: str) -> str:
    """Converts image to grayscale while preserving transparency (Alpha channel)."""
    try:
        if not os.path.exists(input_path): return ""
        
        name = os.path.basename(input_path)
        out_name = "gray_transparent_" + name
        out_path = os.path.join(temp_dir, out_name)
        
        # Open image and ensure it's in RGBA mode
        img = Image.open(input_path).convert("RGBA")
        
        # Split into R, G, B, and Alpha channels
        r, g, b, alpha = img.split()
        
        # Convert RGB part to grayscale (L)
        gray_img = Image.merge("RGB", (r, g, b)).convert("L")
        
        # Re-attach the original Alpha channel to the grayscale image
        final_img = Image.merge("RGBA", (gray_img, gray_img, gray_img, alpha))
        
        final_img.save(out_path)
        return out_path
    except Exception as e:
        print(f"Grayscale Error: {e}")
        return input_path

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

    # --- DL SPLIT LOGIC (STRICT 9 DIGITS) ---
    raw_dl = user_data.get('custom_dl', '000000000').replace(" ", "").replace("-", "")
    if len(raw_dl) < 9: raw_dl = raw_dl.ljust(9, '0')
    raw_dl = raw_dl[:9] # Strict 9 chars

    # 1. RAISED DL (Positions 3, 9, 13)
    dl_3_chars = f"  {raw_dl[1]}     {raw_dl[4]}     {raw_dl[7]}  "             

    # 2. LASER REMAINING (Default: "4  7 1  9 0  0")
    dl_remaining = f"{raw_dl[0]}  {raw_dl[2]} {raw_dl[3]}  {raw_dl[5]} {raw_dl[6]}  {raw_dl[8]}"

    # --- SWIRL NAME LOGIC (Fixed 26 chars) ---
    full_name_clean = f"{first}{middle}{last}".upper().replace(" ", "")
    swirl_text_26 = full_name_clean
    while len(swirl_text_26) < 26:
        swirl_text_26 += full_name_clean
    swirl_text_26 = swirl_text_26[:26]

    # --- ADDRESS SPLIT ---
    addr1 = user_data.get('address', '').upper()
    city = user_data.get('city', '').upper()
    state = user_data.get('state_code', 'NY').upper()
    zip_code = user_data.get('zip_code', '').split('-')[0]
    addr2 = f"{city}, {state} {zip_code}"

    # --- MICRO TEXT ---
    # Format: MM DD YYYY First Middle Last (Repeated to 65 chars)
    exp_date = user_data.get('expires_date', '').replace("/", " ").replace("-", " ")
    
    # Build base string ensuring single spaces (handles empty middle name)
    micro_parts = [exp_date, first, middle, last]
    micro_base = " ".join([p for p in micro_parts if p])

    # Repeat enough times and slice to strictly 65 chars
    micro_text = (micro_base + " ") * 10 
    micro_text = micro_text[:65]

    # --- DATE PARTS ---
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

    try:
        dt_exp = datetime.strptime(user_data.get('expires_date', ''), "%m/%d/%Y")
        exp_day = dt_exp.strftime("%d")
        exp_month = dt_exp.strftime("%m")
        exp_year_last2 = dt_exp.strftime("%y")
    except:
        exp_day, exp_month, exp_year_last2 = "01", "01", "30"

    # --- BACK DOC DISCRIMINATOR ---
    dcf_match = re.search(r'DCF([^\n\r]+)', raw_text)
    doc_discriminator = dcf_match.group(1).strip() if dcf_match else "XF1F6X3S93"

    # --- BARCODE NUMBER ---
    barcode_num_text = f"01223 {raw_dl} 94"

    # --- GRAYSCALE PROCESSING ---
    face_path = user_data.get("face_path", "")
    gray_face_path = ""
    if face_path:
        gray_face_path = process_grayscale_image(face_path, TEMP_DIR)

    # --- FILES ---
    with open(os.path.join(TEMP_DIR, f"barcode_{temp_id}.svg"), "wb") as f: f.write(big_svg)
    with open(os.path.join(TEMP_DIR, f"linear_{temp_id}.svg"), "wb") as f: f.write(small_svg)
    
    # --- SUBFOLDER LOGIC & PATH DEFINITIONS (FIXED HERE) ---
    safe_dob = dob.replace("/", "-")
    folder_name = f"{first} {last} {safe_dob}"
    target_dir = os.path.join(FINAL_DIR, folder_name)
    os.makedirs(target_dir, exist_ok=True)

    front_final = os.path.join(target_dir, f"Front_{base_name}.png")
    back_final  = os.path.join(target_dir, f"Back_{base_name}.png")
    psd_final   = os.path.join(target_dir, f"{base_name}.psd")
    
    # --- DATA FILE ---
    lines = [
        "--- SYSTEM CONFIG ---",
        f"Output Dir: {target_dir.replace('\\', '\\\\')}", # Use target_dir here
        f"Base Name: {base_name}",
        f"Load Big Barcode: {os.path.join(TEMP_DIR, f'barcode_{temp_id}.svg').replace('\\', '\\\\')}",
        f"Load Small Barcode: {os.path.join(TEMP_DIR, f'linear_{temp_id}.svg').replace('\\', '\\\\')}",
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
        f"Eyes: {'BRO' if user_data.get('eyes', '').upper().strip() in ['BRN', 'BROWN'] else user_data.get('eyes', 'BRO')}",
        f"Dob Month: {dob_month}",
        f"Dob Day: {dob_day}",
        f"Dob Year Last 2: {dob_year_last2}",
        f"Raised EXP: {user_data.get('expires_date')}",
        f"Raised DOB: {dob}",
        f"Issue Full: {user_data.get('issue_date')}",
        f"Exp Day: {exp_day}",
        f"Exp Month: {exp_month}",
        f"Exp Year Last 2: {exp_year_last2}",
        f"Dob Swirl: {dob_swirl}",     
        f"Dob Compact: {dob_compact}", 
        f"Class: {user_data.get('class', 'D')}",
        f"Full Name: {first} {middle} {last}",
        f"First Middle: {first} {middle}",
        f"Last Name: {last}",
        f"Address 1: {addr1}",
        f"Address 2: {addr2}",
        
        "",
        "--- BACK DATA ---",
        f"Doc Discriminator: {doc_discriminator}", 
        f"Back Barcode Num: {barcode_num_text}",
        f"Back Swirl Month 1: {dob_swirl[:1]}", # J
        f"Back Swirl Month 2: {dob_swirl[1:2]}", # U
        f"Back Swirl Month 3: {dob_swirl[2:3]}", # N
        f"Back Swirl Day: {dob_day}",
        f"Back Swirl Year: {dob_year_last2}",
        f"Back Raised Text: {swirl_text_26}", 
        f"Raw DL: {raw_dl}"
    ])

    data_file_path = os.path.join(TEMP_DIR, f"data_{temp_id}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f: f.write("\n".join(lines))
    
    jsx_front = os.path.join(BASE_DIR, "modules", "process_ny_front.jsx")
    jsx_back  = os.path.join(BASE_DIR, "modules", "process_ny_back.jsx")

    return temp_id, data_file_path, front_final, back_final, psd_final, jsx_front, jsx_back