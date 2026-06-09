import re

def test_decode_linear_barcode(svg_path: str):
    """
    Reads a linear barcode SVG and prints the barcode value
    using the same logic as ny_module.py.
    """

    extracted_barcode_val = ""

    try:
        with open(svg_path, "rb") as f:
            small_svg = f.read()

        small_svg_str = small_svg.decode("utf-8", errors="ignore")

        match = re.search(r"<desc>(.*?)</desc>", small_svg_str)
        if match:
            extracted_barcode_val = match.group(1).strip()

    except Exception as e:
        print(f"Error parsing SVG: {e}")
        return None

    if extracted_barcode_val and len(extracted_barcode_val) == 16:
        barcode_num_text = (
            f"{extracted_barcode_val[:5]} "
            f"{extracted_barcode_val[5:14]} "
            f"{extracted_barcode_val[14:]}"
        )
    elif extracted_barcode_val:
        barcode_num_text = extracted_barcode_val
    else:
        barcode_num_text = "No barcode found"

    print("Barcode:", barcode_num_text)
    return barcode_num_text


if __name__ == "__main__":
    svg_file = r"C:\Users\LENOVO\Documents\personal\Fiver\Telegram License Automation\temp_files\barcode.svg"
    test_decode_linear_barcode(svg_file)