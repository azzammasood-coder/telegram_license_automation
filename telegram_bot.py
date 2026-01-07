#!/usr/bin/env python3
import os
import logging
import asyncio
import time
import subprocess
import requests
import re
import json
import base64
from datetime import datetime
from telegram import Update, ReplyKeyboardMarkup, ReplyKeyboardRemove
from telegram.ext import (
    Application,
    CommandHandler,
    ContextTypes,
    ConversationHandler,
    MessageHandler,
    filters,
)
from openai import OpenAI

# --- IMPORT JURISDICTION MODULES ---
from modules import nj_module, ny_module


# ==============================================================================
#  CONFIGURATION & SETTINGS
# ==============================================================================

# Load JSON
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
with open(CONFIG_PATH, "r") as f:
    config = json.load(f)

# Map Variables
TELEGRAM_BOT_TOKEN  = config['telegram']['bot_token']
FIS_API_KEY         = config['api']['fis_key']
API_BASE_URL        = config['api']['fis_url']
REMOVEBG_API_KEY    = config['api']['removebg_key']

BASE_DIR            = config['paths']['base_dir']
PHOTOSHOP_EXE_PATH  = config['paths']['photoshop_exe']

# Toggles
ENABLE_BG_REMOVAL   = config['toggles']['enable_bg_removal']

# Testing Modes
OFFLINE_TEST_MODE   = config['toggles']['offline_test_mode']
TEST_BARCODE_ONLY   = config['testing']['barcode_only']
TEST_JSX_ONLY       = config['testing']['jsx_only']

# ==============================================================================
#  MOCK CLASSES (FOR OFFLINE MODE)
# ==============================================================================

class MockMessage:
    def __init__(self):
        self.text = ""
        self.document = None
        self.photo = []
    
    async def reply_text(self, text, **kwargs):
        print(f"\n🤖 [BOT REPLY]: {text}")

class MockChat:
    def __init__(self):
        self.id = 12345

class MockUpdate:
    def __init__(self):
        self.message = MockMessage()
        self.effective_chat = MockChat()

class MockBot:
    async def send_message(self, chat_id, text, **kwargs):
        print(f"\n🤖 [BOT SEND]: {text}")

class MockContext:
    def __init__(self):
        self._user_data = {}
        self.bot = MockBot()
    
    @property
    def user_data(self):
        return self._user_data

# ==============================================================================
#  INITIALIZATION
# ==============================================================================

# States
(
    BULK_INPUT, 
    CUSTOM_DL_CHECK, 
    CUSTOM_DL_INPUT, 
    SIGNATURE_CHECK, 
    SIGNATURE_UPLOAD,
    FACE_CHECK,      
    FACE_UPLOAD       
) = range(7)

# Logging
logging.basicConfig(format="%(asctime)s - [BOT] - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)


FINAL_DIR = os.path.join(BASE_DIR, "Final_Documents")
TEMP_DIR  = os.path.join(BASE_DIR, "temp_files")
JOB_TICKET_PATH = os.path.join(BASE_DIR, "active_job.txt")

os.makedirs(FINAL_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
processing_queue = asyncio.Queue()


# ==============================================================================
#  BACKGROUND WORKER
# ==============================================================================

async def process_queue_worker(app: Application):
    logger.info("👷 Queue Worker is active.")
    while True:
        item = await processing_queue.get()
        # Item now includes jsx_path at the end
        update, context, unique_id, data_path, out_front, out_back, out_psd, jsx_path = item
        chat_id = update.effective_chat.id

        try:
            # Write the data file path to active_job.txt
            with open(JOB_TICKET_PATH, "w", encoding="utf-8") as f:
                f.write(data_path)

            if os.path.exists(PHOTOSHOP_EXE_PATH):
                # Run the specific JSX for this template
                subprocess.Popen([PHOTOSHOP_EXE_PATH, "-r", jsx_path])
            else:
                await context.bot.send_message(chat_id, "⚠️ Error: Photoshop path incorrect.")
                continue

            timeout = 600
            start_time = time.time()
            success = False

            while (time.time() - start_time) < timeout:
                # Check for PSD (Primary indicator)
                psd_ready = os.path.exists(out_psd) and os.path.getsize(out_psd) > 0
                
                # Check for Front/Back (Flexible matching)
                all_files = os.listdir(FINAL_DIR)
                found_front = any("Front" in f and unique_id.split('_')[0] in f for f in all_files)
                found_back = any("Back" in f and unique_id.split('_')[0] in f for f in all_files)

                if psd_ready and found_front and found_back:
                    await asyncio.sleep(2)
                    success = True
                    break
                
                if int(time.time() - start_time) % 20 == 0:
                    logger.info(f"⏳ Syncing {unique_id}... Found PSD: {psd_ready}")
                
                await asyncio.sleep(3)

            if success:
                await context.bot.send_message(chat_id, "🎉 Job Done!")
            else:
                await context.bot.send_message(chat_id, "😔 Timeout: Files created but Python couldn't verify filenames.")

        except Exception as e:
            logger.error(f"Worker Error: {e}")
        finally:
            processing_queue.task_done()

# ==============================================================================
#  COMMON HELPERS
# ==============================================================================

def remove_bg_removebg(input_path: str, output_path: str):
    if not REMOVEBG_API_KEY or "YOUR_KEY" in REMOVEBG_API_KEY:
        logging.error("Remove.bg API Key is missing.")
        return False

    url = "https://api.remove.bg/v1.0/removebg"
    headers = {"X-Api-Key": REMOVEBG_API_KEY}
    
    try:
        with open(input_path, "rb") as img_file:
            files = {'image_file': img_file}
            data = {'size': 'auto', 'format': 'png'}
            response = requests.post(url, files=files, data=data, headers=headers)

        if response.status_code == 200:
            with open(output_path, "wb") as out:
                out.write(response.content)
            return True
        else:
            logging.error(f"Remove.bg Error: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        logging.error(f"Remove.bg Request Failed: {e}")
        return False

def parse_height_logic(height_input: str):
    clean = height_input.replace('"', '').replace("'", "").replace("’", "").replace("”", "")
    parts = re.split(r'[- ]', clean)
    ft, inch = 5, 0
    if len(parts) >= 2:
        try: ft, inch = int(parts[0]), int(parts[1])
        except: pass
    elif len(parts) == 1 and parts[0].isdigit():
        val = int(parts[0])
        if val < 10: ft = val
        elif val > 12: ft, inch = val // 12, val % 12
    total_inches = (ft * 12) + inch
    return f"{total_inches:03d}", f"{ft}’ {inch:02d}”"

def format_date_for_api(date_str: str) -> str:
    clean = re.sub(r"[^0-9]", "", date_str)
    if len(clean) == 8:
        return f"{clean[4:]}-{clean[0:2]}-{clean[2:4]}"
    return date_str

def parse_bulk_input(text: str) -> dict | None:
    data = {}
    lines = text.split('\n')
    key_map = {
        "jurisdiction": "jurisdiction", "urisdiction": "jurisdiction", "state": "jurisdiction",
        "first name": "first_name", "middle name": "middle_name", "last name": "last_name",
        "address": "address", "city": "city", "state code": "state_code", 
        "full zip code + 4 digits": "zip_code", "zip code": "zip_code",
        "gender": "gender", "dob": "dob", "height": "height", "eyes": "eyes",
        "class": "class", "endorsements": "endorsements", "restrictions": "restrictions",
        "issue date": "issue_date", "expires date": "expires_date", "real id": "real_id",
        "not real id": "not_real_id", "signature": "signature",
        "dl number": "custom_dl", "license number": "custom_dl"
    }
    
    for line in lines:
        if ":" in line:
            parts = line.split(":", 1)
            label = parts[0].strip().lower()
            value = parts[1].strip()
            if label in key_map:
                mapped_key = key_map[label]
                if mapped_key == "gender":
                    val_low = value.lower()
                    if val_low in ["1", "m", "male"]: value = "1"
                    elif val_low in ["2", "f", "female"]: value = "2"
                data[mapped_key] = value

    required = ["jurisdiction", "first_name", "last_name", "dob", "gender"]
    for req in required:
        if req not in data:
            return None
    return data

# ==============================================================================
#  CORE LOGIC (API)
# ==============================================================================

def generate_barcodes(user_data: dict, api_height: str):
    headers = {"Authorization": f"Bearer {FIS_API_KEY}", "Content-Type": "application/x-www-form-urlencoded"}
    state = user_data.get("jurisdiction", "NJ").upper().strip()

    # --- 1. EYE COLOR MAPPING ---
    # Maps common user inputs to strict AAMVA (3-char) codes
    eye_map = {
        "BRN": "BRO", "BROWN": "BRO",
        "BLU": "BLU", "BLUE": "BLU",
        "GRN": "GRN", "GREEN": "GRN",
        "HZL": "HAZ", "HAZEL": "HAZ", "HAZ": "HAZ",
        "BLK": "BLK", "BLACK": "BLK",
        "GRY": "GRY", "GRAY": "GRY", "GREY": "GRY"
    }
    raw_eyes = user_data.get("eyes", "BRO").upper().strip()
    api_eyes = eye_map.get(raw_eyes, raw_eyes)[:3] # Default to raw if not found, max 3 chars

    # --- 2. REAL ID LOGIC ---
    # AAMVA Standard: F = Compliant (Real ID), N = Non-Compliant
    real_id_status = "N"
    if "visible" in user_data.get("real_id", "").lower():
        real_id_status = "F" 

    payload = {
        "jurisdiction": state, 
        "document": "DL", "save": "true",
        "data[DAC]": user_data.get("first_name", "").upper(),
        "data[DAD]": user_data.get("middle_name", "").upper(),
        "data[DCS]": user_data.get("last_name", "").upper(),
        "data[DAG]": user_data.get("address", "").upper(), 
        "data[DAI]": user_data.get("city", "").upper(),
        "data[DAJ]": user_data.get("state_code", state).upper(), 
        "data[DAK]": user_data.get("zip_code", ""),
        "data[DBC]": user_data.get("gender", "1"),
        "data[DBB]": format_date_for_api(user_data.get("dob", "")),
        "data[DAU]": api_height, 
        "data[DAY]": api_eyes,              # <--- UPDATED
        "data[DDA]": real_id_status,        # <--- ADDED
        "data[DCA]": user_data.get("class", "D").upper(), 
        "data[DCB]": user_data.get("restrictions", "NONE").upper(),
        "data[DBA]": format_date_for_api(user_data.get("expires_date", "")),
        "data[DBD]": format_date_for_api(user_data.get("issue_date", "")),
        "data[ZNA]": "WX", "data[ZNB]": "11.00", "data[ZNC]": "DUP", "data[DDC]": "1"
    }

    if user_data.get("custom_dl"):
        payload["data[DAQ]"] = user_data["custom_dl"].upper().replace(" ", "")

    resp = requests.post(f"{API_BASE_URL}/barcode", headers=headers, data=payload, timeout=60)
    resp.raise_for_status()
    barcode_id = resp.headers.get("X-Barcode-ID")

    params = {"barcode_id": barcode_id}
    big_svg = requests.get(f"{API_BASE_URL}/export", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "image/svg+xml"}, params=params, timeout=60).content
    raw_text = requests.get(f"{API_BASE_URL}/export", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "text/plain"}, params=params, timeout=60).text
    small_svg = requests.get(f"{API_BASE_URL}/linear", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "image/svg+xml"}, params=params, timeout=60).content

    return barcode_id, big_svg, small_svg, raw_text

# ==============================================================================
#  TELEGRAM FLOW
# ==============================================================================

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text("👋 Hello! Use /newbarcode to start.")

async def new_barcode(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    context.user_data.clear()

    # --- OFFLINE TEST MODE LOGIC ---
    if OFFLINE_TEST_MODE:
        await update.message.reply_text("🤖 OFFLINE MODE: Reading from 'offline_test_data.txt'...")
        
        data_file = os.path.join(BASE_DIR, "offline_test_data.txt")
        if not os.path.exists(data_file):
            await update.message.reply_text(f"❌ Error: File not found at {data_file}")
            return ConversationHandler.END

        try:
            with open(data_file, "r", encoding="utf-8") as f:
                content = f.read()
            
            parsed_data = parse_bulk_input(content)
            if not parsed_data:
                await update.message.reply_text("❌ Error: Could not parse data format in text file.")
                return ConversationHandler.END
            
            context.user_data.update(parsed_data)
            context.user_data["signature_path"] = None 
            context.user_data["face_path"] = None
            
            return await execute_generation(update, context)

        except Exception as e:
            await update.message.reply_text(f"❌ File Read Error: {e}")
            return ConversationHandler.END

    # --- NORMAL MODE ---
    template = (
        "📋 **Please send your details below:**\n\n"
        "Jurisdiction: (NJ or NY)\nFirst Name: JOHN\nMiddle Name: ROBERT\nLast Name: DOE\nAddress: 123 MAIN ST\n"
        "City: NEWARK\nState Code: NJ\nFull Zip Code + 4 Digits: 07101\nGender: M\nDob: 01/01/1980\n"
        "Height: 5'-11\"\nEyes: BRN\nClass: D\nEndorsements: NONE\nRestrictions: NONE\n"
        "Issue Date: 01/01/2023\nExpires Date: 01/01/2030\nReal ID: Visible\n"
        "Not Real ID: Not Visible\nSignature: JOHN DOE"
    )
    await update.message.reply_text(template, reply_markup=ReplyKeyboardRemove(), parse_mode="Markdown")
    return BULK_INPUT

# ... (Existing Handlers: handle_bulk_input, ask_custom_dl, etc. Keep them as is) ...
async def handle_bulk_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    parsed_data = parse_bulk_input(update.message.text)
    if not parsed_data:
        await update.message.reply_text("🤔 I couldn't understand that format. Please check template.")
        return BULK_INPUT
    context.user_data.update(parsed_data)
    reply_keyboard = [["Yes", "No"]]
    await update.message.reply_text("Custom DL Number? (Yes or No)", reply_markup=ReplyKeyboardMarkup(reply_keyboard, one_time_keyboard=True, resize_keyboard=True))
    return CUSTOM_DL_CHECK

async def ask_custom_dl(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.lower()
    if text == "yes":
        await update.message.reply_text("Enter DL In Exact Format (e.g. S0000 00000 00000)", reply_markup=ReplyKeyboardRemove())
        return CUSTOM_DL_INPUT
    else:
        reply_keyboard = [["Yes", "No"]]
        await update.message.reply_text("Upload Signature? (Yes or No)", reply_markup=ReplyKeyboardMarkup(reply_keyboard, resize_keyboard=True))
        return SIGNATURE_CHECK

async def get_custom_dl_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    dl_input = update.message.text.strip()
    context.user_data["custom_dl"] = dl_input
    reply_keyboard = [["Yes", "No"]]
    await update.message.reply_text("Upload Signature? (Yes or No)", reply_markup=ReplyKeyboardMarkup(reply_keyboard, resize_keyboard=True))
    return SIGNATURE_CHECK

async def ask_signature(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.lower()
    if text == "yes":
        await update.message.reply_text("Please upload the signature image.", reply_markup=ReplyKeyboardRemove())
        return SIGNATURE_UPLOAD
    else:
        reply_keyboard = [["Yes", "No"]]
        await update.message.reply_text("Upload Face Picture? (Yes or No)", reply_markup=ReplyKeyboardMarkup(reply_keyboard, resize_keyboard=True))
        return FACE_CHECK

async def get_signature_upload(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    file_obj = None
    if update.message.document:
        file_obj = await update.message.document.get_file()
    elif update.message.photo:
        file_obj = await update.message.photo[-1].get_file()
    
    if file_obj:
        # 1. Download Original
        ext = os.path.splitext(file_obj.file_path)[1] or ".png"
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        raw_path = os.path.join(TEMP_DIR, f"sig_raw_{timestamp}{ext}")
        await file_obj.download_to_drive(raw_path)
        
        # 2. Define Output Path (Must be PNG for transparency)
        clean_path = os.path.join(TEMP_DIR, f"sig_{timestamp}.png")
        
        # 3. Call OpenAI BG Removal (CONDITIONAL)
        success = False
        if ENABLE_BG_REMOVAL:
            await update.message.reply_text("🤖 Removing background (Signature)...")
            success = remove_bg_removebg(raw_path, clean_path)
        
        # 4. Fallback if API fails OR disabled
        final_path = clean_path if success else raw_path
        
        context.user_data["signature_path"] = final_path
        await update.message.reply_text("✍️ Signature received & processed.")
    else:
        await update.message.reply_text("Couldn't download image.")
    
    reply_keyboard = [["Yes", "No"]]
    await update.message.reply_text("Upload Face Picture? (Yes or No)", reply_markup=ReplyKeyboardMarkup(reply_keyboard, resize_keyboard=True))
    return FACE_CHECK

async def ask_face(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    text = update.message.text.lower()
    if text == "yes":
        await update.message.reply_text("Please upload the face image.", reply_markup=ReplyKeyboardRemove())
        return FACE_UPLOAD
    else:
        return await execute_generation(update, context)

async def get_face_upload(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    file_obj = None
    if update.message.document:
        file_obj = await update.message.document.get_file()
    elif update.message.photo:
        file_obj = await update.message.photo[-1].get_file()
    
    if file_obj:
        # 1. Download Original
        ext = os.path.splitext(file_obj.file_path)[1] or ".png"
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        raw_path = os.path.join(TEMP_DIR, f"face_raw_{timestamp}{ext}")
        await file_obj.download_to_drive(raw_path)
        
        # 2. Define Output Path (Must be PNG)
        clean_path = os.path.join(TEMP_DIR, f"face_{timestamp}.png")
        
        # 3. Call OpenAI BG Removal (CONDITIONAL)
        success = False
        if ENABLE_BG_REMOVAL:
            await update.message.reply_text("🤖 Removing background (Face)...")
            success = remove_bg_removebg(raw_path, clean_path)
        
        # 4. Fallback if API fails OR disabled
        final_path = clean_path if success else raw_path
        
        context.user_data["face_path"] = final_path
        await update.message.reply_text("👤 Face received & processed.")
    else:
        await update.message.reply_text("Couldn't download face image.")
    
    return await execute_generation(update, context)

# --- EXECUTION ---
async def execute_generation(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    # ---------------------------------------------------------
    # MODE A: JSX ONLY (Skip generation, run existing job)
    # ---------------------------------------------------------
    if TEST_JSX_ONLY:
        await update.message.reply_text("🧪 TEST MODE: JSX ONLY. Skipping API & Data Generation...")
        
        if not os.path.exists(JOB_TICKET_PATH):
             await update.message.reply_text("❌ Error: active_job.txt not found.")
             return ConversationHandler.END

        with open(JOB_TICKET_PATH, "r") as f:
            existing_data_path = f.read().strip()

        if not os.path.exists(existing_data_path):
             await update.message.reply_text(f"❌ Error: Data file listed in job ticket not found: {existing_data_path}")
             return ConversationHandler.END

        data_map = {}
        with open(existing_data_path, "r", encoding="utf-8") as f:
            for line in f:
                if ":" in line:
                    k, v = line.split(":", 1)
                    data_map[k.strip()] = v.strip()
        
        jurisdiction = context.user_data.get('jurisdiction', 'NJ').strip().upper()
        
        if jurisdiction == 'NY':
            jsx_path = os.path.join(BASE_DIR, "modules", "process_ny.jsx")
        else:
            jsx_path = os.path.join(BASE_DIR, "modules", "process_nj.jsx")

        await update.message.reply_text(f"🚀 Re-triggering Photoshop on: {os.path.basename(existing_data_path)}")
        await processing_queue.put((
            update, context, "TEST_RERUN", existing_data_path, 
            data_map.get("Output Front"), data_map.get("Output Back"), data_map.get("Output PSD"), 
            jsx_path
        ))
        return ConversationHandler.END

    # ---------------------------------------------------------
    # STANDARD / BARCODE ONLY FLOW
    # ---------------------------------------------------------
    await update.message.reply_text("👍 Generating documents...", reply_markup=ReplyKeyboardRemove())
    try:
        raw_height = context.user_data.get('height', '5-00')
        api_height, visual_height = parse_height_logic(raw_height)
        
        # 1. Generate Barcodes
        barcode_id, big_svg, small_svg, raw_text = generate_barcodes(context.user_data, api_height)
        
        # 2. Select Module
        jurisdiction = context.user_data.get('jurisdiction', 'NJ').strip().upper()
        module = ny_module if jurisdiction == 'NY' else nj_module
            
        # 3. Prepare Files
        unique_id, data_path, front_path, back_path, psd_path, jsx_path = module.prepare_job_files(
            context.user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR
        )

        # ---------------------------------------------------------
        # MODE B: BARCODE ONLY (Stop here)
        # ---------------------------------------------------------
        if TEST_BARCODE_ONLY:
            msg = (
                f"🧪 TEST MODE: Barcode Generated Only.\n"
                f"📂 Data File: {os.path.basename(data_path)}\n"
                f"📝 Raw Text Len: {len(raw_text)}\n"
                f"⚠️ Photoshop was NOT triggered."
            )
            with open(JOB_TICKET_PATH, "w", encoding="utf-8") as f:
                f.write(data_path)
            await update.message.reply_text(msg)
            return ConversationHandler.END

        # 4. Standard Queue
        await processing_queue.put((update, context, unique_id, data_path, front_path, back_path, psd_path, jsx_path))
        
        q_pos = processing_queue.qsize()
        await update.message.reply_text(f"🚀 Processing {jurisdiction} License... Position #{q_pos}")
        
    except Exception as e:
        logger.error(f"Failed: {e}")
        await update.message.reply_text(f"😓 Error: {e}")

    return ConversationHandler.END

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    await update.message.reply_text("🚫 Cancelled.")
    return ConversationHandler.END

async def post_init(application: Application):
    asyncio.create_task(process_queue_worker(application))

# ==============================================================================
#  OFFLINE RUNNER
# ==============================================================================

async def run_offline_mode():
    print("--------------------------------------------------")
    print("      🚀 STARTING OFFLINE CONSOLE MODE 🚀         ")
    print("--------------------------------------------------")
    print("Telegram connection is DISABLED.")
    
    # 1. Setup Mocks
    mock_update = MockUpdate()
    mock_context = MockContext()
    
    # 2. Trigger the Logic
    print("Executing new_barcode()...")
    await new_barcode(mock_update, mock_context)
    
    # 3. Simulate Queue Worker (One-off)
    if not processing_queue.empty():
        print("📥 Picking item from queue...")
        item = await processing_queue.get()
        update, context, unique_id, data_path, out_front, out_back, out_psd, jsx_path = item
        
        try:
            with open(JOB_TICKET_PATH, "w", encoding="utf-8") as f:
                f.write(data_path)
            
            # Check if this is where we stop (JSX_ONLY or Standard run)
            if TEST_BARCODE_ONLY:
                print("🛑 TEST_BARCODE_ONLY is True. Script finished without Photoshop.")
                return

            print(f"🖥️ Launching Photoshop: {jsx_path}")
            if os.path.exists(PHOTOSHOP_EXE_PATH):
                subprocess.Popen([PHOTOSHOP_EXE_PATH, "-r", jsx_path])
                print("✅ Photoshop Command Sent. Please check Photoshop.")
            else:
                print("❌ Photoshop EXE Path not found.")
                
        except Exception as e:
            print(f"Offline Worker Error: {e}")
    else:
        # If queue is empty, it means execute_generation probably returned early (e.g. barcode_only mode)
        print("📭 Queue is empty. Job finished or stopped early.")

def main():
    if OFFLINE_TEST_MODE:
        asyncio.run(run_offline_mode())
    else:
        app = Application.builder().token(TELEGRAM_BOT_TOKEN).post_init(post_init).build()
        yes_no_filter = filters.Regex(r"(?i)^(yes|no)$")
        conv_handler = ConversationHandler(
            entry_points=[CommandHandler("newbarcode", new_barcode)],
            states={
                BULK_INPUT: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_bulk_input)],
                CUSTOM_DL_CHECK: [MessageHandler(yes_no_filter, ask_custom_dl)],
                CUSTOM_DL_INPUT: [MessageHandler(filters.TEXT & ~filters.COMMAND, get_custom_dl_input)],
                SIGNATURE_CHECK: [MessageHandler(yes_no_filter, ask_signature)],
                SIGNATURE_UPLOAD: [MessageHandler(filters.Document.ALL | filters.PHOTO, get_signature_upload)],
                FACE_CHECK: [MessageHandler(yes_no_filter, ask_face)],
                FACE_UPLOAD: [MessageHandler(filters.Document.ALL | filters.PHOTO, get_face_upload)]
            },
            fallbacks=[CommandHandler("cancel", cancel)],
        )
        app.add_handler(CommandHandler("start", start))
        app.add_handler(conv_handler)
        app.run_polling()

if __name__ == "__main__":
    main()