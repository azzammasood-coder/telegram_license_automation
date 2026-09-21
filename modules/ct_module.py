# ct_module.py

import os
import re
import logging

logger = logging.getLogger(__name__)


def clean_path(path: str) -> str:
    """Forces forward slashes for Photoshop compatibility."""
    return str(path).replace("\\", "/")


def sanitize_filename(text: str) -> str:
    return re.sub(r'[<>:"/\\|?*]', '-', str(text)).strip()


def extract_dl_from_raw(raw_text: str) -> str:
    if not raw_text:
        return ""
    match = re.search(r"DAQ([A-Za-z0-9]+)", raw_text)
    if match:
        return match.group(1)
    return ""


def extract_date_from_raw(raw_text: str, prefix: str) -> str:
    """Extracts date from raw barcode text and returns MM/DD/YYYY."""
    if not raw_text:
        return ""
    match = re.search(f"{prefix}([0-9]{{8}})", raw_text)
    if match:
        d = match.group(1)
        try:
            return f"{d[0:2]}/{d[2:4]}/{d[4:]}"
        except Exception:
            return d
    return ""


def extract_dd_from_raw(raw_text: str) -> str:
    if not raw_text:
        return ""
    match = re.search(r"DCF([A-Za-z0-9]+)", raw_text)
    if match:
        return match.group(1)
    return ""


def extract_ic_lines(raw_text: str) -> tuple:
    """
    Split DCK inventory control like NJ does with 'NJ'.
    Example: 123456789CT77SL01 -> ('123456789', 'CT77SL01')
    Falls back to first 9 / next 9 digits if no 'CT' marker.
    """
    if not raw_text:
        return "", ""
    match = re.search(r"DCK([^\n\r]+)", raw_text)
    found = match.group(1).strip() if match else ""
    found = found.replace("-", "")
    if not found:
        return "", ""
    if "CT" in found:
        parts = found.partition("CT")
        return parts[0], parts[1] + parts[2]
    digits = re.sub(r"[^0-9]", "", found)
    return digits[:9], digits[9:18]


def format_ct_height(visual_height: str, raw_height: str = "") -> str:
    """CT format: '5 -02' (space around hyphen)."""
    source = raw_height or visual_height or "5-00"
    clean = (
        source.replace('"', '')
        .replace("'", "")
        .replace("’", "")
        .replace("”", "")
        .replace("′", "")
        .replace("″", "")
    )
    parts = re.split(r'[- ]+', clean.strip())
    ft, inch = 5, 0
    if len(parts) >= 2:
        try:
            ft, inch = int(parts[0]), int(parts[1])
        except ValueError:
            pass
    elif len(parts) == 1 and parts[0].isdigit():
        val = int(parts[0])
        if val < 10:
            ft = val
        elif val > 12:
            ft, inch = val // 12, val % 12
        else:
            inch = val
    return f"{ft} -{inch:02d}"


def format_zip(zip_code: str) -> str:
    digits = re.sub(r"[^0-9]", "", zip_code or "")
    if len(digits) >= 9:
        return f"{digits[:5]}-{digits[5:9]}"
    if len(digits) >= 5:
        return digits[:5]
    return (zip_code or "").strip()


def prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, big_png=None, small_png=None):
    first_name = user_data.get('first_name', '').strip()
    last_name = user_data.get('last_name', '').strip()
    middle_name = user_data.get('middle_name', '').strip()
    logger.info(f"📄 Preparing CT job files and PSD instructions for: {first_name} {last_name}")

    dob_val = user_data.get('dob', '').strip() or extract_date_from_raw(raw_text, "DBB") or "01/01/2000"
    final_iss = user_data.get('issue_date', '').strip() or extract_date_from_raw(raw_text, "DBD") or "01/01/2020"
    final_exp = user_data.get('expires_date', '').strip() or extract_date_from_raw(raw_text, "DBA") or "01/01/2030"

    dob_clean = sanitize_filename(dob_val)
    unique_id = f"{first_name} {last_name} {dob_clean}"

    job_output_dir = os.path.join(FINAL_DIR, unique_id)
    os.makedirs(job_output_dir, exist_ok=True)

    out_front = clean_path(os.path.join(job_output_dir, f"Front_{sanitize_filename(unique_id)}.png"))
    out_back = clean_path(os.path.join(job_output_dir, f"Back_{sanitize_filename(unique_id)}.png"))
    out_psd = clean_path(os.path.join(job_output_dir, f"{sanitize_filename(unique_id)}.psd"))

    sig_path_source = user_data.get('signature_path')
    face_path_source = user_data.get('face_path')

    final_sig_path = clean_path(sig_path_source) if sig_path_source and os.path.exists(sig_path_source) else ""
    final_sig_text = user_data.get('signature', '').strip()
    # If neither text nor image provided, auto-generate like other states
    if not final_sig_text and not final_sig_path:
        f_init = first_name[0].upper() if first_name else ""
        final_sig_text = f"{f_init}{last_name.title()}" if (f_init or last_name) else "Signature"
    # Prefer typed signature text when present; otherwise use image
    use_sig_image = "TRUE" if (not final_sig_text and final_sig_path) else "FALSE"

    final_face_path = clean_path(face_path_source) if face_path_source and os.path.exists(face_path_source) else ""

    big_barcode_path = clean_path(os.path.join(job_output_dir, "barcode.png"))
    linear_barcode_path = clean_path(os.path.join(job_output_dir, "linear_barcode.png"))
    if big_png:
        with open(os.path.join(job_output_dir, "barcode.png"), "wb") as f:
            f.write(big_png)
    if small_png:
        with open(os.path.join(job_output_dir, "linear_barcode.png"), "wb") as f:
            f.write(small_png)

    final_dl_number = user_data.get('custom_dl', '').strip() or extract_dl_from_raw(raw_text)
    dd_value = re.sub(r'[^A-Za-z0-9]', '', extract_dd_from_raw(raw_text) or "")

    ic_line_1, ic_line_2 = extract_ic_lines(raw_text)

    raw_gen = str(user_data.get('gender', '1')).strip().upper()
    if raw_gen in ["1", "M", "MALE", "TRUE"]:
        final_sex = "M"
    else:
        final_sex = "F"

    eyes_val = (user_data.get('eyes', 'BRO') or 'BRO').upper().strip()
    if eyes_val in ["BROWN", "BRN"]:
        eyes_val = "BRO"
    elif eyes_val in ["GREEN"]:
        eyes_val = "GRN"
    elif eyes_val in ["BLUE", "BLU"]:
        eyes_val = "BLU"

    ct_height = format_ct_height(visual_height, user_data.get('height', ''))

    first_middle = f"{first_name} {middle_name}".strip()
    city = user_data.get('city', '').strip()
    zip_fmt = format_zip(user_data.get('zip_code', ''))
    city_state_zip = f"{city}, CT  {zip_fmt}".strip()

    # Back DOB in PSD uses spaces (e.g. 12 03 1998)
    dob_back = dob_val.replace("/", " ")

    # Real ID STAR visibility
    real_raw = str(user_data.get('real_id', '')).strip().upper()
    is_real_id = "YES" if real_raw in ["YES", "Y", "TRUE", "VISIBLE", "F"] else "NO"

    # Organ donor symbol visibility
    donor_raw = str(user_data.get('donor', user_data.get('organ_donor', 'NO'))).strip().upper()
    is_donor = "YES" if donor_raw in ["YES", "Y", "TRUE", "VISIBLE"] else "NO"

    restrictions = (user_data.get('restrictions') or 'NONE').strip() or "NONE"
    endorsements = (user_data.get('endorsements') or 'NONE').strip() or "NONE"

    lines = [
        f"Jurisdiction: CT",
        f"Output Front: {out_front}",
        f"Output Back: {out_back}",
        f"Output PSD: {out_psd}",
        f"Sig Path: {final_sig_path}",
        f"Sig Text: {final_sig_text}",
        f"Use Sig Image: {use_sig_image}",
        f"Face Path: {final_face_path}",
        f"Load Big Barcode: {big_barcode_path}",
        f"Load Linear Barcode: {linear_barcode_path}",
        f"DL: {final_dl_number}",
        f"DOB: {dob_val}",
        f"DOB Back: {dob_back}",
        f"Exp Date: {final_exp}",
        f"Iss Date: {final_iss}",
        f"Sex: {final_sex}",
        f"Eyes: {eyes_val}",
        f"Height: {ct_height}",
        f"Class: {user_data.get('class', 'D')}",
        f"DD: {dd_value}",
        f"Last Name: {last_name}",
        f"First Middle: {first_middle}",
        f"Street 1: {user_data.get('address', '').strip()}",
        f"City State Zip: {city_state_zip}",
        f"IC Line 1: {ic_line_1}",
        f"IC Line 2: {ic_line_2}",
        f"Real ID: {is_real_id}",
        f"Donor: {is_donor}",
        f"Restrictions: {restrictions}",
        f"Endorsements: {endorsements}",
    ]

    data_file_path = os.path.join(TEMP_DIR, f"ct_job_{sanitize_filename(unique_id)}.txt")
    with open(data_file_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))

    jsx_path = clean_path(os.path.join(BASE_DIR, "modules", "process_ct.jsx"))
    return unique_id, data_file_path, out_front, out_back, out_psd, jsx_path
