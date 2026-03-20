import os
import json
import requests
import logging

# Configure logging for console output
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - [%(levelname)s] - %(message)s"
)
logger = logging.getLogger(__name__)

def test_real_id_compliance():
    config_path = os.path.join(os.path.dirname(__file__), "config.json")
    try:
        with open(config_path, "r") as f:
            config = json.load(f)
        api_key = config['api']['fis_key']
        api_url = config['api']['fis_url']
    except Exception as e:
        logger.error(f"Error loading config.json: {e}")
        return

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/x-www-form-urlencoded"
    }

    # We will test both scenarios: Visible (Compliant) and Not Visible (Non-Compliant)
    scenarios = [
        {"name": "Real ID VISIBLE (Compliant)", "dda_value": "F", "expected": "DDAF"},
        {"name": "Real ID NOT VISIBLE (Non-compliant)", "dda_value": "N", "expected": "DDAN"}
    ]

    for scenario in scenarios:
        logger.info("="*60)
        logger.info(f"🧪 RUNNING TEST: {scenario['name']}")
        logger.info("="*60)

        # Base Payload
        payload = {
            "jurisdiction": "NJ",
            "document": "DL", 
            "save": "true",
            "data[DAC]": "HARROLD",
            "data[DCS]": "FINCH",
            "data[DAG]": "100 EYES",
            "data[DAI]": "NEWARK",
            "data[DAJ]": "NJ",
            "data[DAK]": "071011234",
            "data[DBC]": "1", 
            "data[DBB]": "1980-01-01",
            "data[DAU]": "071", 
            "data[DAY]": "BRO",
            "data[DDA]": scenario["dda_value"], # <-- This is the Real ID Toggle
            "data[DDF]": "N",
            "data[DDE]": "N",
            "data[DCA]": "D", 
            "data[DCB]": "NONE",
            "data[DBA]": "2030-01-01",
            "data[DBD]": "2023-01-01",
            "data[ZNA]": "WX",
            "data[ZNB]": "11.00",
            "data[ZNC]": "DUP",
            "data[DDC]": "1"
        }

        try:
            resp = requests.post(f"{api_url}/barcode", headers=headers, data=payload, timeout=30)
            resp.raise_for_status()
            barcode_id = resp.headers.get("X-Barcode-ID")
            logger.info(f"Barcode successfully generated. ID: {barcode_id}")
        except requests.exceptions.RequestException as e:
            logger.error(f"API Request failed: {e}")
            if hasattr(e, 'response') and e.response is not None:
                logger.error(e.response.text)
            continue

        # Fetch Raw Text
        params = {"barcode_id": barcode_id}
        try:
            raw_resp = requests.get(
                f"{api_url}/export", 
                headers={"Authorization": f"Bearer {api_key}", "Accept": "text/plain"}, 
                params=params, 
                timeout=15
            )
            raw_resp.raise_for_status()
            raw_text = raw_resp.text
        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch raw text: {e}")
            continue

        # Verify Real ID Compliance
        clean_text = raw_text.replace('\n', '').replace('\r', '')
        
        logger.info("--- Verification Results ---")
        if scenario["expected"] in clean_text:
            logger.info(f"✅ PASS: Correctly generated '{scenario['expected']}' in raw text.")
        else:
            logger.error(f"❌ FAIL: Expected '{scenario['expected']}' but it was not found in the raw text.")
            
        logger.info("\n\n")

if __name__ == "__main__":
    test_real_id_compliance()