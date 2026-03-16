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
    """Converts image to grayscale while preserving transparency (Alpha channel)."""
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
        logger.error(f"GA Grayscale Image Error: {e}")
        return input_path

def extract_date_from_raw(raw_text: str, prefix: str) -> str:
    if not raw_text: return ""
    match = re.search(f"{prefix}([0-9]{{8}})", raw_text)
    if match:
        d = match.group(1)
        return f"{d[0:2]}/{d[2:4]}/{d[4:]}"
    return ""

def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR):
    """GA Specific Logic."""
    first = user_data.get('first_name', 'Unknown').strip().upper()
    middle = user_data.get('middle_name', '').strip().upper()
    last = user_data.get('last_name', 'Unknown').strip().upper()
    logger.info(f"📄 Preparing GA job files and PSD instructions for: {first} {last}")
    
    # Dates
    dob_val = user_data.get('dob', '').strip() or extract_date_from_raw(raw_text, "DBB") or "01/01/2000"
    iss_val = user_data.get('issue_date', '').strip() or extract_date_from_raw(raw_text, "DBD") or "01/01/2020"
    exp_val = user_data.get('expires_date', '').strip() or extract_date_from_raw(raw_text, "DBA") or "01/01/2030"
    
    issue_clean = sanitize_filename(iss_val)
    base_name = f"{first} {last}_{issue_clean}"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    temp_id = f"{first}_{timestamp}"

    # Gender
    raw_gender = str(user_data.get('gender', '1')).upper()
    gender_disp = "M" if raw_gender in ["1", "M", "MALE"] else "F"

    # Signature
    sig_text_final = user_data.get('signature', '').strip()
          
    # Save Raw Data
    raw_data_path = os.path.join(TEMP_DIR, f"raw_data_{temp_id}.txt")
    with open(raw_data_path, "w", encoding="utf-8") as f: f.write(raw_text)

    # Document Discriminator / DL / Inventory
    daq_match = re.search(r'DAQ([^\n\r]+)', raw_text)
    extracted_dl = daq_match.group(1).strip().replace(" ", "").replace("-", "") if daq_match else "000000000"
    raw_dl = user_data.get('custom_dl', '').strip().replace(" ", "").replace("-", "") or extracted_dl

    dcf_match = re.search(r'DCF([^\n\r]+)', raw_text)
    doc_discriminator = dcf_match.group(1).strip() if dcf_match else "Not found"

    dck_match = re.search(r'DCK([^\n\r]+)', raw_text)
    inv_control = dck_match.group(1).strip() if dck_match else "Not found"

    # Text Splitting 
    first_middle = f"{first} {middle}".strip()
    addr1 = user_data.get('address', '').upper()
    city = user_data.get('city', '').upper()
    state = user_data.get('state_code', 'GA').upper()
    zip_code = user_data.get('zip_code', '')
    city_state_zip = f"{city}, {state} {zip_code}"
    
    county = user_data.get('county', 'FULTON').upper()
    weight = user_data.get('weight', '160')
    restrictions = user_data.get('restrictions', 'NONE').upper()
    endorsements = user_data.get('endorsements', 'NONE').upper()

    # Back restrictions formatting (e.g., A-NONE)
    back_restrictions = f"{restrictions}-NONE" if restrictions != "NONE" else "NONE"

    # Height Parsing (e.g., from visual_height "5' 04\"")
    feet, inches = "5", "00"
    height_match = re.search(r"(\d+)['’]\s*(\d+)", visual_height)
    if height_match:
        feet = height_match.group(1)
        inches = height_match.group(2)

    # Grayscale Face Processing
    face_path = user_data.get("face_path", "")
    gray_face_path = process_grayscale_image(face_path, TEMP_DIR) if face_path else ""

    # Write SVGs
    with open(os.path.join(TEMP_DIR, f"barcode_{temp_id}.svg"), "wb") as f: f.write(big_svg)
    with open(os.path.join(TEMP_DIR, f"linear_{temp_id}.svg"), "wb") as f: f.write(small_svg)
    
    # Subfolder Structure
    safe_dob = dob_val.replace("/", "-")
    folder_name = f"{first} {last} GA {safe_dob}"
    main_target_dir = os.path.join(FINAL_DIR, folder_name)
    
    front_dir = os.path.join(main_target_dir, "Front")
    back_dir = os.path.join(main_target_dir, "Back")
    os.makedirs(front_dir, exist_ok=True)
    os.makedirs(back_dir, exist_ok=True)

    front_final = os.path.join(front_dir, f"Front_{base_name}.png")
    back_final  = os.path.join(back_dir, f"Back_{base_name}.png")
    psd_final   = os.path.join(main_target_dir, f"{base_name}.psd")
    
    # Data Map Construction
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
        f"County: {county}",
        f"Restrictions: {restrictions}",
        f"Endorsements: {endorsements}",
        f"Issue Date: {iss_val}",
        f"Gender: {gender_disp}",
        f"Feet: {feet}",
        f"Inches: {inches}",
        f"Eyes: {'BRO' if user_data.get('eyes', '').upper().strip() in ['BRN', 'BROWN'] else user_data.get('eyes', 'BRO').upper()[:3]}",
        f"Weight: {weight} lb",
        f"DD: {doc_discriminator}",
        f"Signature Text: {sig_text_final}", 
        "",
        "--- BACK DATA ---",
        f"Back Restrictions: {back_restrictions}",
        f"Inv Control: {inv_control}"
    ])

    data_file_path = os.path.join(TEMP_DIR, f"data_{temp_id}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f: f.write("\n".join(lines))
    
    jsx_front = os.path.join(BASE_DIR, "modules", "process_ga_front.jsx")
    jsx_back  = os.path.join(BASE_DIR, "modules", "process_ga_back.jsx")

    return temp_id, data_file_path, front_final, back_final, psd_final, jsx_front, jsx_back

import base64
import os
import xml.etree.ElementTree as ET
import logging

def generate_lightburn_lbrn(data_map, base_dir):
    base_name = data_map.get("Base Name", "Unknown")
    logging.info(f"Starting LightBurn Base64 generation for GA: {base_name}")
    
    main_dir = data_map.get("Output Dir", "")
    front_dir = data_map.get("Output Dir Front", "")
    back_dir = data_map.get("Output Dir Back", "")

    # 1. Create a dedicated Lightburn folder inside the main job directory
    lightburn_out_dir = os.path.join(main_dir, "Lightburn")
    os.makedirs(lightburn_out_dir, exist_ok=True)

    # 2. Path definitions
    template_front = os.path.join(base_dir, "Lightburn", "GA Laser Front.lbrn2")
    template_back = os.path.join(base_dir, "Lightburn", "GA Laser Back.lbrn2")

    out_front = os.path.join(lightburn_out_dir, f"{base_name}_Front.lbrn2")
    out_back = os.path.join(lightburn_out_dir, f"{base_name}_Back.lbrn2")

    # 3. Mappings (CutIndex integers & String fallback)
    front_mapping = {
        2: "2 Do Not Touch.png",
        3: "3 Star.png",
        4: "4 Text Edit.png",
        5: "5 Raised.png",
        6: "6 Big Photo.png",
        7: "7 Lens Photo.png",
        "8 Lens Dob": "8 Dob Lens.png"
    }

    back_mapping = {
        1: "1 Big Barcode.png",
        2: "2 Small barcode.png",
        4: "4 Edit Text.png"
    }

    def process_template(template_path, out_path, mapping, img_dir, side):
        logging.info(f"[{side}] Loading template: {template_path}")
        if not os.path.exists(template_path):
            logging.error(f"[{side}] LightBurn Template NOT FOUND at: {template_path}")
            return
        
        try:
            logging.info(f"[{side}] Parsing XML...")
            tree = ET.parse(template_path)
            root = tree.getroot()
            
            shapes = root.findall(".//Shape[@Type='Bitmap']")
            logging.info(f"[{side}] Found {len(shapes)} Bitmap shapes in template.")
            
            updated_count = 0
            for shape in shapes:
                cut_index_attr = shape.get("CutIndex")
                name_attr = shape.get("Name")
                
                match_key = None
                
                # Check integer CutIndex first
                if cut_index_attr and cut_index_attr.isdigit() and int(cut_index_attr) in mapping:
                    match_key = int(cut_index_attr)
                # Fallback check for exact Name attribute match (for "8 Lens Dob")
                elif name_attr and name_attr in mapping:
                    match_key = name_attr
                
                if match_key is not None:
                    png_filename = mapping[match_key]
                    png_full_path = os.path.join(img_dir, png_filename)
                    
                    if not os.path.exists(png_full_path):
                        logging.warning(f"[{side}] ⚠️ FILE MISSING for key {match_key}: {png_full_path}")
                        continue

                    # 1. READ IMAGE & CONVERT TO BASE64
                    try:
                        with open(png_full_path, "rb") as image_file:
                            raw_data = image_file.read()
                            encoded_string = base64.b64encode(raw_data).decode('utf-8')
                    except Exception as img_err:
                        logging.error(f"[{side}] ❌ Read Error for {png_full_path}: {img_err}")
                        continue
                        
                    # 2. INJECT DATA
                    shape.set('Data', encoded_string)
                    shape.set('File', os.path.abspath(png_full_path).replace("\\", "/"))
                    
                    # 3. CLEANUP CONFLICTS
                    if 'SourceHash' in shape.attrib:
                        del shape.attrib['SourceHash']
                    if 'RelativePath' in shape.attrib:
                        del shape.attrib['RelativePath']

                    # 4. Remove legacy elements (forces LightBurn to use the Data attribute)
                    for child in list(shape):
                        if child.tag in ['data', 'Data', 'ImagePath']:
                            shape.remove(child)

                    # logging.info(f"[{side}] ✅ Updated key {match_key} with Base64 data from {png_filename}")
                    updated_count += 1
                else:
                    pass
                    # logging.info(f"[{side}] ⏭️ Shape CutIndex {cut_index_attr} / Name '{name_attr}' not in mapping, skipping.")
            
            # Write final XML output
            tree.write(out_path, encoding="utf-8", xml_declaration=True)
            logging.info(f"[{side}] Successfully saved {updated_count} updates to: {out_path}")
            
        except Exception as e:
            logging.error(f"[{side}] Error processing LightBurn template: {e}")

    # Execute
    process_template(template_front, out_front, front_mapping, front_dir, "Front")
    process_template(template_back, out_back, back_mapping, back_dir, "Back")