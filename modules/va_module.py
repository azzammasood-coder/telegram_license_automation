import os
import re
from datetime import datetime, timezone
from PIL import Image

def process_grayscale_image(input_path: str, temp_dir: str) -> str:
    try:
        if not os.path.exists(input_path): return ""
        name = os.path.basename(input_path)
        out_path = os.path.join(temp_dir, "gray_va_" + name)
        img = Image.open(input_path).convert("RGBA")
        r, g, b, alpha = img.split()
        gray_img = Image.merge("RGB", (r, g, b)).convert("L")
        final_img = Image.merge("RGBA", (gray_img, gray_img, gray_img, alpha))
        final_img.save(out_path)
        return out_path
    except: return input_path

def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR):
    first = user_data.get('first_name', 'Unknown').strip()
    middle = user_data.get('middle_name', '').strip()
    last = user_data.get('last_name', 'Unknown').strip()
    dob = user_data.get('dob', '01/01/1980')
    exp = user_data.get('expires_date', '01/01/2030')
    
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    temp_id = f"va_{first}_{timestamp}"
    
    # DL Extraction
    daq_match = re.search(r'DAQ([^\n\r]+)', raw_text)
    raw_dl = daq_match.group(1).strip().replace(" ", "") if daq_match else "A00000000"

    # DD Extraction (Document Discriminator)
    # Usually found in PDF417 'DD' field, or generate random if missing
    dd_match = re.search(r'DCF([^\n\r]+)', raw_text)
    dd_val = dd_match.group(1).strip() if dd_match else "00000000000000000000"
    
    # Date Formatting
    dt_dob = datetime.strptime(dob, "%m/%d/%Y")
    dt_exp = datetime.strptime(exp, "%m/%d/%Y")
    short_month = dt_dob.strftime("%b").upper() # JAN
    
    # Micro Text: Exp date + Full name repeated 40 chars
    full_name = f"{first}{middle}{last}".upper().replace(" ", "")
    exp_clean = exp.replace("/", "") # 01012030
    micro_base = f"{exp_clean}{full_name}"
    micro_text = (micro_base * 3)[:40]

    # Signature Text Fallback
    sig_input = user_data.get('signature', '').strip()
    sig_text_final = sig_input.title() if sig_input and sig_input.lower() != "none" else f"{first.capitalize()} {last[0].upper()}."

    # Asset Preparation
    gray_face = process_grayscale_image(user_data.get("face_path", ""), TEMP_DIR)
    
    # Height Formatting (Guide: "6 - 00")
    # visual_height comes in as "5' 11"" or similar from main bot. We need "5 - 11"
    # Parse numbers
    h_nums = re.findall(r'\d+', visual_height)
    if len(h_nums) >= 2:
        va_height = f"{h_nums[0]} -{h_nums[1].zfill(2)}"
    else:
        va_height = visual_height # Fallback

    # Gender Formatting (M/F)
    raw_gender = user_data.get('gender', 'M').upper()
    va_gender = "F" if raw_gender in ["2", "F", "FEMALE"] else "M"

    # Zip Formatting
    full_zip = user_data.get('zip_code', '').strip()
    # Ensure standard format XXXXX-YYYY if possible, or just pass through
    
    # Paths
    safe_dob = dob.replace("/", "-")
    main_target_dir = os.path.join(FINAL_DIR, f"{first} {last} VA {safe_dob}")
    os.makedirs(main_target_dir, exist_ok=True)
    
    # Construct Lines
    lines = [
        "--- SYSTEM CONFIG ---",
        f"Output Dir: {main_target_dir.replace('\\', '\\\\')}",
        f"Base Name: {first}_{last}_VA",
        f"Load Face Image: {gray_face.replace('\\', '\\\\')}",
    ]
    if user_data.get("signature_path"):
        lines.append(f"Load Signature Image: {user_data['signature_path'].replace('\\', '\\\\')}")

    lines.extend([
        "",
        "--- VA DATA ---",
        f"DL Char 1: {raw_dl[0]}", 
        f"DL Char 2: {raw_dl[1]}", 
        f"DL Char 3: {raw_dl[2]}",
        f"DL Char 4: {raw_dl[3]}", 
        f"DL Char 5: {raw_dl[4]}", 
        f"DL Char 6: {raw_dl[5]}",
        f"DL Char 7: {raw_dl[6]}", 
        f"DL Char 8: {raw_dl[7]}", 
        f"DL Char 9: {raw_dl[8]}",
        f"DD Val: {dd_val}",
        f"Dob Month: {dt_dob.strftime('%m')}",
        f"Dob Day: {dt_dob.strftime('%d')}",
        f"Dob Year: {dt_dob.strftime('%Y')}",
        f"Dob Year Last 2: {dt_dob.strftime('%y')}",
        f"Dob Short Month: {short_month}",
        f"Exp Month: {dt_exp.strftime('%m')}",
        f"Exp Year Last 2: {dt_exp.strftime('%y')}",
        f"Exp Full: {exp}",
        f"First Middle: {first} {middle}",
        f"First Name: {first}",
        f"Middle Name: {middle}",
        f"Last Name: {last}",
        f"Address 1: {user_data.get('address', '').upper()}",
        f"Address 2: {user_data.get('city', '').upper()}, VA {full_zip}",
        f"Gender: {va_gender}",
        f"Height: {va_height}",
        f"Eyes: {user_data.get('eyes', 'BRN').upper()[:3]}",
        f"Micro Text: {micro_text}",
        f"Signature Text: {sig_text_final}",
        f"Initials: {first[0].upper()}{last[0].upper()}",
        f"Issue Date: {user_data.get('issue_date', '')}",
    ])

    data_file_path = os.path.join(TEMP_DIR, f"data_{temp_id}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f: f.write("\n".join(lines))
    
    jsx_front = os.path.join(BASE_DIR, "modules", "process_va_front.jsx")
    return temp_id, data_file_path, "", "", "", jsx_front