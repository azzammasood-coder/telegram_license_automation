import os
import base64
import re
import xml.etree.ElementTree as ET
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

def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, big_png=None, small_png=None):
    first = user_data.get('first_name', 'Unknown').strip()
    middle = user_data.get('middle_name', '').strip()
    last = user_data.get('last_name', 'Unknown').strip()
    dob = user_data.get('dob', '01/01/1980')
    exp = user_data.get('expires_date', '01/01/2030')
    
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    temp_id = f"va_{first}_{timestamp}"
    
    # --- SAVE BARCODES ---
    pdf417_path = os.path.join(TEMP_DIR, f"va_pdf417_{timestamp}.png")
    linear_path = os.path.join(TEMP_DIR, f"va_linear_{timestamp}.png")
    
    if big_png:
        with open(pdf417_path, "wb") as f: f.write(big_png)
    if small_png:
        with open(linear_path, "wb") as f: f.write(small_png)

    # --- DATA EXTRACTION ---
    daq_match = re.search(r'DAQ([^\n\r]+)', raw_text)
    raw_dl = daq_match.group(1).strip().replace(" ", "") if daq_match else "A00000000"

    dd_match = re.search(r'DCF([^\n\r]+)', raw_text)
    dd_val = dd_match.group(1).strip() if dd_match else "00000000000000000000"
    
    # --- DATE PARSING ---
    dt_dob = datetime.strptime(dob, "%m/%d/%Y")
    dt_exp = datetime.strptime(exp, "%m/%d/%Y")
    
    # DOB Strings for Back Circle
    month_str = dt_dob.strftime("%b").upper() # JAN
    day_str = dt_dob.strftime("%d")           # 01
    year_str = dt_dob.strftime("%Y")          # 1980
    
    # --- STRINGS FOR BACK ---
    # Long Barcode: Zip(5) + Inventory Control + ExpYear(2) -> "00619 001872704 23"
    exp_yy = dt_exp.strftime("%y")

    # Priority: DCK (Inventory Control) -> DCF (Document Discriminator) -> Default
    dck_match = re.search(r'DCK([^\n\r]+)', raw_text)
    inv_val = dck_match.group(1).strip()

    if len(inv_val) == 16:
        inv_val = f"{inv_val[:5]} {inv_val[5:14]} {inv_val[14:]}"


    # Name Swirl: "        ARTHUR S JARINGT12345687"
    # Leading spaces required by template
    mid_initial = f"{middle}" if middle else ""
    full_swirl = f"{first}{mid_initial}{last}{raw_dl}".upper().replace("  ", " ")

    # Micro Text
    full_name_clean = f"{first}{middle}{last}".upper().replace(" ", "")
    exp_clean = exp.replace("/", "") 
    micro_base = f"{exp_clean}{full_name_clean}"
    micro_text = (micro_base * 3)[:40]

    # Signature
    sig_input = user_data.get('signature', '').strip()
    sig_text_final = sig_input.title() if sig_input and sig_input.lower() != "none" else f"{first.capitalize()} {last[0].upper()}."

    # Assets
    gray_face = process_grayscale_image(user_data.get("face_path", ""), TEMP_DIR)
    
    # Height & Gender
    h_nums = re.findall(r'\d+', visual_height)
    if len(h_nums) >= 2:
        va_height = f"{h_nums[0]} -{h_nums[1].zfill(2)}"
    else:
        va_height = visual_height
    
    raw_gender = user_data.get('gender', 'M').upper()
    va_gender = "F" if raw_gender in ["2", "F", "FEMALE"] else "M"
    full_zip = user_data.get('zip_code', '').strip()

    # Paths
    safe_dob = dob.replace("/", "-")
    main_target_dir = os.path.join(FINAL_DIR, f"{first} {last} VA {safe_dob}")
    front_dir = os.path.join(main_target_dir, "Front")
    back_dir = os.path.join(main_target_dir, "Back")
    os.makedirs(front_dir, exist_ok=True)
    os.makedirs(back_dir, exist_ok=True)
    os.makedirs(main_target_dir, exist_ok=True)
    
    lines = [
        "--- SYSTEM CONFIG ---",
        f"Output Dir: {main_target_dir.replace('\\', '\\\\')}",
        f"Output Dir Front: {front_dir.replace('\\', '\\\\')}",
        f"Output Dir Back: {back_dir.replace('\\', '\\\\')}",
        f"Base Name: {first}_{last}_VA",
        f"Load Face Image: {gray_face.replace('\\', '\\\\')}",
        f"Load PDF417: {pdf417_path.replace('\\', '\\\\')}",
        f"Load Linear: {linear_path.replace('\\', '\\\\')}",
    ]
    if user_data.get("signature_path"):
        lines.append(f"Load Signature Image: {user_data['signature_path'].replace('\\', '\\\\')}")

    lines.extend([
        "",
        "--- VA FRONT DATA ---",
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
        f"Dob Day: {day_str}",
        f"Dob Year: {year_str}",
        f"Dob Year Last 2: {dt_dob.strftime('%y')}",
        f"Dob Short Month: {month_str}",
        f"Exp Month: {dt_exp.strftime('%m')}",
        f"Exp Year Last 2: {exp_yy}",
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
        "",
        "--- VA BACK DATA ---",
        f"Long Barcode: {inv_val}",
        f"Name Swirl: {full_swirl}",
        f"DOB Month 1: {month_str[0]}",
        f"DOB Month 2: {month_str[1]}",
        f"DOB Month 3: {month_str[2]}",
        f"DOB Day 1: {day_str[0]}",
        f"DOB Day 2: {day_str[1]}",
        f"DOB Year 3: {year_str[2]}",
        f"DOB Year 4: {year_str[3]}",
    ])

    data_file_path = os.path.join(TEMP_DIR, f"data_{temp_id}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f: f.write("\n".join(lines))
    
    jsx_front = os.path.join(BASE_DIR, "modules", "process_va_front.jsx")
    jsx_back = os.path.join(BASE_DIR, "modules", "process_va_back.jsx")
    
    # Return 7 items so the bot can unpack jsx_paths properly
    return temp_id, data_file_path, "", "", "", jsx_front, jsx_back


def generate_lightburn_lbrn(data_map, base_dir):
    try:
        main_dir = data_map.get("Output Dir")
        front_dir = data_map.get("Output Dir Front")
        back_dir = data_map.get("Output Dir Back")
        
        if not main_dir or not front_dir or not back_dir:
            print("❌ LightBurn Error: Missing directory paths.")
            return

        lb_out_dir = os.path.join(main_dir, "Lightburn")
        os.makedirs(lb_out_dir, exist_ok=True)
        
        def process_template(template_name, png_dir, layer_map):
            src_path = os.path.join(base_dir, "Lightburn", template_name)
            dst_path = os.path.join(lb_out_dir, template_name)
            
            if not os.path.exists(src_path):
                print(f"⚠️ Template missing: {src_path}")
                return

            try:
                tree = ET.parse(src_path)
                root = tree.getroot()
                
                print(f"\n🔵 --- Processing {template_name} ---")
                
                for shape in root.findall(".//Shape[@Type='Bitmap']"):
                    cut_index = int(shape.get('CutIndex', -1))
                    
                    if cut_index in layer_map:
                        png_filename = layer_map[cut_index]
                        png_full_path = os.path.join(png_dir, png_filename)

                        if not os.path.exists(png_full_path):
                            print(f"          ⚠️ FILE MISSING: {png_full_path}")
                            continue
                            
                        try:
                            with open(png_full_path, "rb") as image_file:
                                raw_data = image_file.read()
                                encoded_string = base64.b64encode(raw_data).decode('utf-8')
                        except Exception as img_err:
                            print(f"          ❌ Read Error: {img_err}")
                            continue
                        
                        shape.set('Data', encoded_string)
                        shape.set('File', os.path.abspath(png_full_path).replace("\\", "/"))
                        
                        if 'SourceHash' in shape.attrib:
                            del shape.attrib['SourceHash']
                        if 'RelativePath' in shape.attrib:
                            del shape.attrib['RelativePath']

                        for child in list(shape):
                            if child.tag in ['data', 'Data']:
                                shape.remove(child)

                tree.write(dst_path)
                print(f"💾 Saved: {dst_path}")

            except Exception as e:
                print(f"❌ Error processing {template_name}: {e}")

        # VA FRONT TEMPLATE MAP
        front_map = {
            1: "1 Laser Light Text DO Not Touch.png",
            4: "4 Laser Edited Bold Text.png",
            5: "5 Laser Edited Semi Bold.png",
            6: "6 Laser Exp Name Micro.png",
            7: "7 Laser Dob Under.png",
            8: "8 Laser Big Face.png",
            9: "9 Small Circle Window.png",
            10: "10 Lens Image Face.png",
            11: "11 Lens Image Dob.png",
            22: "12- 17 RAISED.png",
            23: "18 -21.png"
        }
        process_template("VA Template Front 'ME' CIRCLE.lbrn2", front_dir, front_map)

        # VA BACK TEMPLATE MAP
        back_map = {
            0: "00 Big Barcode.png",
            1: "01 Small Barcode.png",
            3: "03 Edit Text.png",
            5: "04, 05 - Laser - Sigs.png",
            6: "06 - Laser - Big Left Dob Circle.png",
            7: "07, 08 - Raise - Raised Swirl.png",
            9: "09 - Laser -Swirl.png"
        }
        process_template("VA Template Back.lbrn2", back_dir, back_map)

    except Exception as e:
        print(f"❌ VA LightBurn Generation Logic Failed: {e}")