# tx_module.py

import os
import re
import logging
from datetime import datetime, timezone
from PIL import Image
import xml.etree.ElementTree as ET

logger = logging.getLogger(__name__)

def sanitize_filename(text: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '-', text).strip()

def process_grayscale_image(input_path: str, temp_dir: str) -> str:
    try:
        if not os.path.exists(input_path): return ""
        
        name = os.path.basename(input_path)
        out_name = "gray_transparent_" + name
        out_path = os.path.join(temp_dir, out_name)
        
        img = Image.open(input_path).convert("RGBA")
        r, g, b, alpha = img.split()
        gray_img = Image.merge("RGB", (r, g, b)).convert("L")
        final_img = Image.merge("RGBA", (gray_img, gray_img, gray_img, alpha))
        
        final_img.save(out_path)
        return out_path
    except Exception as e:
        logger.error(f"TX Grayscale Image Error: {e}")
        return input_path

def extract_date_from_raw(raw_text: str, prefix: str) -> str:
    if not raw_text: return ""
    match = re.search(f"{prefix}([0-9]{{8}})", raw_text)
    if match:
        d = match.group(1)
        return f"{d[0:2]}/{d[2:4]}/{d[4:]}"
    return ""

def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR):
    first = user_data.get('first_name', 'Unknown').strip().upper()
    middle = user_data.get('middle_name', '').strip().upper()
    last = user_data.get('last_name', 'Unknown').strip().upper()
    logger.info(f"📄 Preparing TX job files and PSD instructions for: {first} {last}")
    
    dob_val = user_data.get('dob', '').strip() or extract_date_from_raw(raw_text, "DBB") or "01/01/2000"
    iss_val = user_data.get('issue_date', '').strip() or extract_date_from_raw(raw_text, "DBD") or "01/01/2020"
    exp_val = user_data.get('expires_date', '').strip() or extract_date_from_raw(raw_text, "DBA") or "01/01/2030"
    
    issue_clean = sanitize_filename(iss_val)
    base_name = f"{first} {last}_{issue_clean}"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    temp_id = f"{first}_{timestamp}"

    raw_gender = str(user_data.get('gender', '1')).upper()
    gender_disp = "M" if raw_gender in ["1", "M", "MALE"] else "F"

    sig_text_final = user_data.get('signature', '').strip()
          
    raw_data_path = os.path.join(TEMP_DIR, f"raw_data_{temp_id}.txt")
    with open(raw_data_path, "w", encoding="utf-8") as f: f.write(raw_text)

    daq_match = re.search(r'DAQ([^\n\r]+)', raw_text)
    extracted_dl = daq_match.group(1).strip().replace(" ", "").replace("-", "") if daq_match else "000000000"
    raw_dl = user_data.get('custom_dl', '').strip().replace(" ", "").replace("-", "") or extracted_dl

    dcf_match = re.search(r'DCF([^\n\r]+)', raw_text)
    doc_discriminator = dcf_match.group(1).strip() if dcf_match else "Not found"

    dck_match = re.search(r'DCK([^\n\r]+)', raw_text)
    inv_control = dck_match.group(1).strip() if dck_match else "Not found"

    first_middle = f"{first} {middle}".strip()
    addr1 = user_data.get('address', '').upper()
    city = user_data.get('city', '').upper()
    state = user_data.get('state_code', 'TX').upper()
    zip_code = user_data.get('zip_code', '').strip().replace('-', '')[:5]
    city_state_zip = f"{city}, {state} {zip_code}"
    
    restrictions = user_data.get('restrictions', 'NONE').upper()
    endorsements = user_data.get('endorsements', 'NONE').upper()

    feet, inches = "5", "00"
    height_match = re.search(r"(\d+)['’]\s*(\d+)", visual_height)
    if height_match:
        feet = height_match.group(1)
        inches = height_match.group(2)

    face_path = user_data.get("face_path", "")
    gray_face_path = process_grayscale_image(face_path, TEMP_DIR) if face_path else ""

    with open(os.path.join(TEMP_DIR, f"barcode_{temp_id}.svg"), "wb") as f: f.write(big_svg)
    with open(os.path.join(TEMP_DIR, f"linear_{temp_id}.svg"), "wb") as f: f.write(small_svg)
    
    safe_dob = dob_val.replace("/", "-")
    folder_name = f"{first} {last} TX {safe_dob}"
    main_target_dir = os.path.join(FINAL_DIR, folder_name)
    
    front_dir = os.path.join(main_target_dir, "Front")
    back_dir = os.path.join(main_target_dir, "Back")
    os.makedirs(front_dir, exist_ok=True)
    os.makedirs(back_dir, exist_ok=True)

    front_final = os.path.join(front_dir, f"Front_{base_name}.png")
    back_final  = os.path.join(back_dir, f"Back_{base_name}.png")
    psd_final   = os.path.join(main_target_dir, f"{base_name}.psd")
    
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
        lines.append(f"Load Signature Image: {user_data['signature_path'].replace('\\', '\\\\')}")
    if gray_face_path:
        lines.append(f"Load Face Image: {gray_face_path.replace('\\', '\\\\')}")

    lines.extend([
        "",
        "--- FRONT DATA ---",
        f"DL: {raw_dl}",
        f"Class: {user_data.get('class', 'C').upper()}",
        f"Dob: {dob_val}",
        f"Exp Date: {exp_val}",
        f"First Middle: {first_middle}",
        f"Last Name: {last}",
        f"Address 1: {addr1}",
        f"City State Zip: {city_state_zip}",
        f"Restrictions: {restrictions}",
        f"Endorsements: {endorsements}",
        f"Issue Date: {iss_val}",
        f"Gender: {gender_disp}",
        f"Feet: {feet}",
        f"Inches: {inches}",
        f"Eyes: {'BRO' if user_data.get('eyes', '').upper().strip() in ['BRN', 'BROWN'] else user_data.get('eyes', 'BRO').upper()[:3]}",
        f"DD: {doc_discriminator}",
        f"Signature Text: {sig_text_final}", 
        "",
        "--- BACK DATA ---",
        f"Inv Control: {inv_control}"
    ])

    data_file_path = os.path.join(TEMP_DIR, f"data_{temp_id}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f: f.write("\n".join(lines))
    
    jsx_front = os.path.join(BASE_DIR, "modules", "process_tx_front.jsx")
    jsx_back  = os.path.join(BASE_DIR, "modules", "process_tx_back.jsx")

    return temp_id, data_file_path, front_final, back_final, psd_final, jsx_front, jsx_back

import base64
import os
import xml.etree.ElementTree as ET

def generate_lightburn_lbrn(data_map, base_dir):
    main_dir = data_map.get("Output Dir", "")
    front_dir = data_map.get("Output Dir Front", "")
    back_dir = data_map.get("Output Dir Back", "")
    base_name = data_map.get("Base Name", "Unknown")

    logger.info(f"🔥 [TX LightBurn] Starting generation for: {base_name}")
    logger.info(f"🔥 [TX LightBurn] Main Directory: {main_dir}")
    logger.info(f"🔥 [TX LightBurn] Front Directory: {front_dir}")
    logger.info(f"🔥 [TX LightBurn] Back Directory: {back_dir}")

    # Create Lightburn output directory next to Front and Back
    lb_out_dir = os.path.join(main_dir, "Lightburn")
    try:
        os.makedirs(lb_out_dir, exist_ok=True)
        logger.info(f"🔥 [TX LightBurn] Ensured output directory exists: {lb_out_dir}")
    except Exception as e:
        logger.error(f"❌ [TX LightBurn] Failed to create Lightburn output directory: {e}")
        return

    # Pointing to the template files in the root project directory
    template_front = os.path.join(base_dir, "Lightburn", "TX Lasering Front.lbrn2")
    template_back = os.path.join(base_dir, "Lightburn", "TX Lasering Back.lbrn2")

    # Set the destination paths to the new Lightburn subfolder
    out_front = os.path.join(lb_out_dir, f"{base_name}_Front.lbrn2")
    out_back = os.path.join(lb_out_dir, f"{base_name}_Back.lbrn2")

    # Map the CutIndex integers to the PNGs
    front_mapping = {
        1: "1 Bold Text.png",
        2: "2 Light Text.png",
        3: "3 Raised Text.png",
        5: "5 Big Pik.png",
        6: "6 lens pik.png",
        7: "7 lens dob.png"
    }

    back_mapping = {
        1: "1 Bold Text.png",
        2: "2 Side Code.png",
        3: "3 barcode.png",
        4: "4 Light Text.png"
    }

    def process_template(template_path, out_path, mapping, img_dir, side):
        logger.info(f"--- Processing {side} Template ---")
        logger.info(f"[{side}] Loading template from: {template_path}")
        
        if not os.path.exists(template_path):
            logger.error(f"❌ [{side}] LightBurn Template NOT FOUND at: {template_path}")
            return
        
        try:
            tree = ET.parse(template_path)
            root = tree.getroot()
            logger.info(f"✅ [{side}] Successfully parsed XML tree for template.")
            
            shapes = root.findall(".//Shape[@Type='Bitmap']")
            logger.info(f"[{side}] Found {len(shapes)} Bitmap shapes in template.")
            
            processed_count = 0
            for shape in shapes:
                cut_index = int(shape.get("CutIndex", -1))
                
                if cut_index in mapping:
                    png_filename = mapping[cut_index]
                    png_full_path = os.path.join(img_dir, png_filename)
                    
                    logger.info(f"[{side}] Processing CutIndex {cut_index} -> Expected File: {png_filename}")
                    
                    if not os.path.exists(png_full_path):
                        logger.warning(f"⚠️ [{side}] FILE MISSING for CutIndex {cut_index}: {png_full_path}")
                        continue

                    # 1. READ IMAGE & CONVERT TO BASE64
                    try:
                        with open(png_full_path, "rb") as image_file:
                            raw_data = image_file.read()
                            encoded_string = base64.b64encode(raw_data).decode('utf-8')
                            logger.info(f"✅ [{side}] Successfully read and base64 encoded: {png_filename}")
                    except Exception as img_err:
                        logger.error(f"❌ [{side}] Read/Encode Error for {png_full_path}: {img_err}")
                        continue
                        
                    # 2. INJECT DATA
                    shape.set('Data', encoded_string)
                    shape.set('File', os.path.abspath(png_full_path).replace("\\", "/"))
                    
                    # 3. CLEANUP CONFLICTS
                    if 'SourceHash' in shape.attrib: 
                        del shape.attrib['SourceHash']
                    if 'RelativePath' in shape.attrib: 
                        del shape.attrib['RelativePath']

                    removed_children = 0
                    for child in list(shape):
                        if child.tag in ['data', 'Data', 'ImagePath']:
                            shape.remove(child)
                            removed_children += 1
                            
                    if removed_children > 0:
                        logger.info(f"🔧 [{side}] Cleaned up {removed_children} conflicting child tags for CutIndex {cut_index}.")

                    processed_count += 1
                    logger.info(f"✅ [{side}] Successfully injected data for CutIndex {cut_index}.")

            logger.info(f"[{side}] Total shapes successfully processed: {processed_count}/{len(mapping)}")

            # 4. WRITE FILE
            try:
                tree.write(out_path, encoding="utf-8", xml_declaration=True)
                logger.info(f"🎉 [{side}] Successfully saved finalized Lightburn file to: {out_path}")
            except Exception as write_err:
                logger.error(f"❌ [{side}] Failed to write output file to {out_path}: {write_err}")
            
        except Exception as e:
            logger.error(f"❌ [{side}] Critical Error processing LightBurn template: {e}")

    process_template(template_front, out_front, front_mapping, front_dir, "Front")
    process_template(template_back, out_back, back_mapping, back_dir, "Back")
    logger.info(f"[TX LightBurn] Generation complete for {base_name}.")