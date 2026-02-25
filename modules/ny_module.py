# ny_module.py

import os
import re
import logging
from datetime import datetime, timezone
from PIL import Image
import xml.etree.ElementTree as ET
import base64

logger = logging.getLogger(__name__)

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
        logger.error(f"NY Grayscale Image Error: {e}")
        return input_path

def extract_date_from_raw(raw_text: str, prefix: str) -> str:
    """Extracts date from raw barcode text and returns MM/DD/YYYY."""
    if not raw_text: return ""
    match = re.search(f"{prefix}([0-9]{{8}})", raw_text)
    if match:
        d = match.group(1)
        return f"{d[0:2]}/{d[2:4]}/{d[4:]}"
    return ""

def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR):
    """NY Specific Logic."""
    first = user_data.get('first_name', 'Unknown').strip()
    middle = user_data.get('middle_name', '').strip()
    last = user_data.get('last_name', 'Unknown').strip()
    logger.info(f"📄 Preparing NY job files and PSD instructions for: {first} {last}")
    
    # Handle Blanks via API Barcode
    dob_val = user_data.get('dob', '').strip() or extract_date_from_raw(raw_text, "DBB") or "01/01/2000"
    iss_val = user_data.get('issue_date', '').strip() or extract_date_from_raw(raw_text, "DBD") or "01/01/2020"
    exp_val = user_data.get('expires_date', '').strip() or extract_date_from_raw(raw_text, "DBA") or "01/01/2030"
    
    issue_clean = sanitize_filename(iss_val)
    base_name = f"{first} {last}_{issue_clean}"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    temp_id = f"{first}_{timestamp}"

    # --- GENDER LOGIC (1 -> M, 2 -> F) ---
    raw_gender = str(user_data.get('gender', '1')).upper()
    gender_disp = "M"
    if raw_gender == "2" or raw_gender == "F" or raw_gender == "FEMALE":
        gender_disp = "F"
    elif raw_gender == "1" or raw_gender == "M" or raw_gender == "MALE":
        gender_disp = "M"

    # --- UNIFIED SIGNATURE TEXT LOGIC ---
    sig_text_final = user_data.get('signature', '').strip()
         
    # --- SAVE RAW DATA ---
    raw_data_path = os.path.join(TEMP_DIR, f"raw_data_{temp_id}.txt")
    with open(raw_data_path, "w", encoding="utf-8") as f: f.write(raw_text)

    # --- DL EXTRACTION & SPLIT LOGIC (STRICT 9 DIGITS) ---
    daq_match = re.search(r'DAQ([^\n\r]+)', raw_text)
    extracted_dl = daq_match.group(1).strip().replace(" ", "").replace("-", "") if daq_match else "000000000"
    raw_dl = user_data.get('custom_dl', '').strip().replace(" ", "").replace("-", "") or extracted_dl

    # 1. RAISED DL
    dl_3_chars = f"  {raw_dl[1]}     {raw_dl[4]}     {raw_dl[7]}  "            

    # 2. LASER REMAINING
    dl_remaining = f"{raw_dl[0]}  {raw_dl[2]} {raw_dl[3]}  {raw_dl[5]} {raw_dl[6]}  {raw_dl[8]}"

    # --- SWIRL NAME LOGIC ---
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
    exp_date_micro = exp_val.replace("/", " ").replace("-", " ")
    micro_parts = [exp_date_micro, first, middle, last]
    micro_base = " ".join([p for p in micro_parts if p])
    micro_text = (micro_base + " ") * 10 
    micro_text = micro_text[:63]

    # --- DATE PARTS ---
    try:
        dt_dob = datetime.strptime(dob_val, "%m/%d/%Y")
        dob_day = dt_dob.strftime("%d")
        dob_month = dt_dob.strftime("%m")
        dob_year = dt_dob.strftime("%Y")
        dob_year_last2 = dt_dob.strftime("%y")
        dob_year_first2 = dob_year[:2]
        dob_swirl = dt_dob.strftime("%b %d %y").upper()
        dob_compact = dt_dob.strftime("%b%y").upper()
    except:
        dob_day, dob_month, dob_year, dob_year_last2, dob_year_first2 = "01", "01", "2000", "00", "20"
        dob_swirl = "JAN 01 00"
        dob_compact = "JAN00"

    try:
        dt_exp = datetime.strptime(exp_val, "%m/%d/%Y")
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
    
    # --- SUBFOLDER LOGIC ---
    safe_dob = dob_val.replace("/", "-")
    folder_name = f"{first} {last} NY {safe_dob}"
    main_target_dir = os.path.join(FINAL_DIR, folder_name)
    
    # Create Front and Back subfolders
    front_dir = os.path.join(main_target_dir, "Front")
    back_dir = os.path.join(main_target_dir, "Back")
    os.makedirs(front_dir, exist_ok=True)
    os.makedirs(back_dir, exist_ok=True)

    front_final = os.path.join(front_dir, f"Front_{base_name}.png")
    back_final  = os.path.join(back_dir, f"Back_{base_name}.png")
    psd_final   = os.path.join(main_target_dir, f"{base_name}.psd")
    
    # --- DATA FILE ---
    lines = [
        "--- SYSTEM CONFIG ---",
        f"Output Dir: {main_target_dir.replace('\\', '\\\\')}",
        f"Output Dir Front: {front_dir.replace('\\', '\\\\')}",
        f"Output Dir Back: {back_dir.replace('\\', '\\\\')}",
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
        f"Gender: {gender_disp}", 
        f"Height: {visual_height}",
        f"Eyes: {'BRO' if user_data.get('eyes', '').upper().strip() in ['BRN', 'BROWN'] else user_data.get('eyes', 'BRO')}",
        f"Dob Month: {dob_month}",
        f"Dob Day: {dob_day}",
        f"Dob Year Last 2: {dob_year_last2}",
        f"Raised EXP: {exp_val}",
        f"Raised DOB: {dob_val}",
        f"Issue Full: {iss_val}",
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
        f"Signature Text: {sig_text_final}", 
        
        "",
        "--- BACK DATA ---",
        f"Doc Discriminator: {doc_discriminator}", 
        f"Back Barcode Num: {barcode_num_text}",
        f"Back Swirl Month 1: {dob_swirl[:1]}",
        f"Back Swirl Month 2: {dob_swirl[1:2]}",
        f"Back Swirl Month 3: {dob_swirl[2:3]}",
        f"Back Swirl Day: {dob_day}",
        f"Back Swirl Year: {dob_year_last2}",
        f"Back Raised Text: {swirl_text_26[:25]}", 
        f"Raw DL: {raw_dl}"
    ])

    data_file_path = os.path.join(TEMP_DIR, f"data_{temp_id}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f: f.write("\n".join(lines))
    
    jsx_front = os.path.join(BASE_DIR, "modules", "process_ny_front.jsx")
    jsx_back  = os.path.join(BASE_DIR, "modules", "process_ny_back.jsx")

    return temp_id, data_file_path, front_final, back_final, psd_final, jsx_front, jsx_back

def generate_lightburn_lbrn(data_map, base_dir):
    """
    Generates LightBurn project files with DEBUG LOGGING.
    Fixes:
    1. OFFSETS -> Strictly preserves XForm (Position) and W/H (Size).
    2. INVISIBLE LAYER -> Embeds Base64 data directly.
    3. LOGGING -> Prints detailed attributes for debugging.
    """
    try:
        main_dir = data_map.get("Output Dir")
        front_dir = data_map.get("Output Dir Front")
        back_dir = data_map.get("Output Dir Back")
        
        if not main_dir or not front_dir or not back_dir:
            logger.error("❌ NY LightBurn Error: Missing directory paths in data_map.")
            return

        lb_out_dir = os.path.join(main_dir, "Lightburn")
        os.makedirs(lb_out_dir, exist_ok=True)
        
        def process_template(template_name, png_dir, layer_map):
            src_path = os.path.join(base_dir, "Lightburn", template_name)
            dst_path = os.path.join(lb_out_dir, template_name)
            
            if not os.path.exists(src_path):
                logger.warning(f"⚠️ NY LightBurn Template missing: {src_path}")
                return

            try:
                tree = ET.parse(src_path)
                root = tree.getroot()
                
                logger.info(f"🔵 --- Processing NY LightBurn Template: {template_name} ---")
                
                # Check which layers we expect vs which we found
                found_layers = []
                
                for shape in root.findall(".//Shape[@Type='Bitmap']"):
                    cut_index = int(shape.get('CutIndex', -1))
                    found_layers.append(cut_index)
                    
                    if cut_index in layer_map:
                        png_filename = layer_map[cut_index]
                        png_full_path = os.path.join(png_dir, png_filename)
                        
                        if not os.path.exists(png_full_path):
                            logger.warning(f"          ⚠️ FILE MISSING for CutIndex {cut_index}: {png_full_path}")
                            continue
                            
                        # 1. READ IMAGE & CONVERT TO BASE64
                        try:
                            with open(png_full_path, "rb") as image_file:
                                raw_data = image_file.read()
                                encoded_string = base64.b64encode(raw_data).decode('utf-8')
                        except Exception as img_err:
                            logger.error(f"          ❌ Read Error for {png_full_path}: {img_err}")
                            continue
                        
                        # 2. INJECT DATA (The Fix for Invisibility)
                        shape.set('Data', encoded_string)
                        
                        # 3. UPDATE METADATA (Optional, but good for reference)
                        # We use forward slashes just in case LB looks at it
                        shape.set('File', os.path.abspath(png_full_path).replace("\\", "/"))
                        
                        # 4. CLEANUP ONLY CONFLICTS
                        # We strictly DO NOT touch 'W', 'H', or 'XForm' -> Fixes Offsets
                        if 'SourceHash' in shape.attrib:
                            del shape.attrib['SourceHash']
                        if 'RelativePath' in shape.attrib:
                            del shape.attrib['RelativePath']

                        # Remove legacy <data> tags if present
                        for child in list(shape):
                            if child.tag in ['data', 'Data']:
                                shape.remove(child)

                # Check for missing layers
                missing = [k for k in layer_map.keys() if k not in found_layers]
                if missing:
                    logger.warning(f"⚠️ WARNING: The following CutIndices were NOT found in the NY template: {missing}")

                tree.write(dst_path)
                logger.info(f"💾 NY LightBurn File Saved: {dst_path}")

            except Exception as e:
                logger.error(f"❌ Error processing NY template {template_name}: {e}")

        # --- CONFIGURATION ---
        front_map = {
            9:  "09 Laser Swirl name.png",
            10: "10 Laser Edited BOLD Text.png",
            11: "11 LIGHT.png",
            12: "12 Laser Dob Text Under Pic.png",
            15: "13 Big Photo.png",
            16: "14 Lens Face.png",
            17: "15 Lens Dob.png",
            18: "2nd_Full_PNG_Front.png"
        }
        process_template("NY Front.lbrn2", front_dir, front_map)

        back_map = {
            1: "1 Barcode.png",
            3: "3 Regular Print Top Window.png",
            2: "2 Regular Print Doc#.png",
            4: "4 Regular Print Swirl.png",
            5: "5 Raised text.png",
            6: "6 Regular Print Light Black.png",
            7: "7 Bottom Barcode.png"
        }
        process_template("NY BACK.lbrn2", back_dir, back_map)

    except Exception as e:
        logger.error(f"❌ NY LightBurn Generation Logic Failed completely: {e}")