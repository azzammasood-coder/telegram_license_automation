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
import sqlite3
import uuid
from datetime import datetime
from telegram import Update, ReplyKeyboardMarkup, ReplyKeyboardRemove, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import (Application, CommandHandler, ContextTypes, ConversationHandler, MessageHandler, CallbackQueryHandler, filters,)
from modules import nj_module, fl_module, pa_module, va_module, ny_module

# ==============================================================================
# CONFIGURATION & SETTINGS
# ==============================================================================

# Load JSON
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "config.json")
with open(CONFIG_PATH, "r") as f:
  config = json.load(f)

# Map Variables
TELEGRAM_BOT_TOKEN = config['telegram']['bot_token']
FIS_API_KEY     = config['api']['fis_key']
API_BASE_URL    = config['api']['fis_url']
REMOVEBG_API_KEY  = config['api']['removebg_key']

# Paths
BASE_DIR      = config['paths']['base_dir']
PHOTOSHOP_EXE_PATH = config['paths']['photoshop_exe']

# Toggles
ADMIN_CHAT_ID    = config['telegram'].get('admin_chat_id')
ADMIN_MODE     = config['toggles'].get('admin_mode', False)

# --- Database Setup ---
DB_PATH = os.path.join(BASE_DIR, "jobs.db")
def init_db():
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute('''CREATE TABLE IF NOT EXISTS jobs (
                            job_id TEXT PRIMARY KEY,
                            chat_id INTEGER,
                            user_data TEXT,
                            status TEXT
                        )''')
        # Table for blocked users
        conn.execute('''CREATE TABLE IF NOT EXISTS blocked_users (
                            chat_id INTEGER PRIMARY KEY
                        )''')
        # Table to track usernames for admin commands
        conn.execute('''CREATE TABLE IF NOT EXISTS users (
                            chat_id INTEGER PRIMARY KEY,
                            username TEXT
                        )''')
init_db()

def track_user(user):
    if not user: return
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("INSERT OR REPLACE INTO users (chat_id, username) VALUES (?, ?)", 
                     (user.id, user.username.lower() if user.username else None))

def resolve_user(user_input):
    clean_input = user_input.replace('@', '').strip()
    if clean_input.isdigit():
        return int(clean_input)
    
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT chat_id FROM users WHERE username = ?", (clean_input.lower(),))
        row = cursor.fetchone()
        if row:
            return row[0]
    raise ValueError("User not found in database. They must interact with the bot first.")

def is_blocked(chat_id):
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT 1 FROM blocked_users WHERE chat_id = ?", (chat_id,))
        return cursor.fetchone() is not None

def set_blocked(chat_id, block_status=True):
    with sqlite3.connect(DB_PATH) as conn:
        if block_status:
            conn.execute("INSERT OR IGNORE INTO blocked_users (chat_id) VALUES (?)", (chat_id,))
        else:
            conn.execute("DELETE FROM blocked_users WHERE chat_id = ?", (chat_id,))
        conn.commit()

init_db()

# ==============================================================================
# INITIALIZATION
# ==============================================================================

# States
(
  DISCLAIMER_WAIT, MAIN_MENU, SHOP_MENU, PREVIEW_STATE_SELECT, STATE_SELECT,
  NJ_DL_ID_CHECK, NJ_GRADE_CHECK, SECOND_FORM_CHECK,
  BUY_CHECK, BULK_INPUT, CUSTOM_DL_CHECK, CUSTOM_DL_INPUT,
  SIGNATURE_CHECK, SIGNATURE_INPUT, 
  FL_REAL_ID, FL_RESTRICTION, FL_ENDORSEMENT, FL_SAFE_DRIVER, FL_REPLACED,
  PA_DL_CHECK, PA_DL_INPUT, PA_ISS_CHECK, PA_ISS_INPUT, PA_EXP_CHECK, PA_EXP_INPUT,
  PA_SIG_CHECK, PA_SIG_UPLOAD, PA_REAL_ID,
  FACE_CHECK, FACE_UPLOAD, PAYMENT_UPLOAD, CART_MENU   
) = range(32)

# Logging Setup
os.makedirs(os.path.join(BASE_DIR, "logs"), exist_ok=True)
LOG_FILE_PATH = os.path.join(BASE_DIR, "logs", "bot.log")
logging.basicConfig(
    format="%(asctime)s - [BOT] - %(levelname)s - %(message)s",
    level=logging.INFO,
    handlers=[logging.FileHandler(LOG_FILE_PATH, encoding="utf-8"), logging.StreamHandler()]
)
logger = logging.getLogger(__name__)
logging.getLogger("httpx").setLevel(logging.WARNING) # Suppress HTTPX (Telegram API) INFO logs to hide 'getUpdates' spam


FINAL_DIR = os.path.join(BASE_DIR, "Final_Documents")
TEMP_DIR = os.path.join(BASE_DIR, "temp_files")
JOB_TICKET_PATH = os.path.join(BASE_DIR, "active_job.txt")

os.makedirs(FINAL_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)
processing_queue = asyncio.Queue()


# ==============================================================================
# BACKGROUND WORKER
# ==============================================================================

async def process_queue_worker(app: Application):
  logger.info("👷 Queue Worker is active.")
  while True:
    item = await processing_queue.get()
    bot, chat_id, unique_id, data_path, out_front, out_back, out_psd, jsx_paths, jurisdiction = item

    try:
      # 1. Write Ticket
      with open(JOB_TICKET_PATH, "w", encoding="utf-8") as f:
        f.write(data_path)

      # 2. Parse Data File to get data_map (needed for Lightburn)
      data_map = {}
      if os.path.exists(data_path):
        with open(data_path, "r", encoding="utf-8") as f:
          for line in f:
            if ":" in line:
              k, v = line.split(":", 1)
              data_map[k.strip()] = v.strip()

      # 3. Trigger Photoshop
      if os.path.exists(PHOTOSHOP_EXE_PATH):
        logger.info(f"⚙️  Triggering Photoshop for {unique_id}. Running {len(jsx_paths)} JSX script(s).")
        for jsx in jsx_paths:
          logger.info(f"   -> Executing JSX: {os.path.basename(jsx)}")
          subprocess.Popen([PHOTOSHOP_EXE_PATH, "-r", jsx])
          await asyncio.sleep(2)
      else:
        await bot.send_message(chat_id, "⚠️ Error: Photoshop path incorrect.")
        continue

      # 4. Wait Loop
      timeout = 1800
      start_time = time.time()
      success = False

      while (time.time() - start_time) < timeout:
        
        # --- NY / VA SPECIFIC SUCCESS CONDITION ---
        if jurisdiction in ["NY", "VA"]:
          # NY/VA saves PSDs inside the Front and Back subfolders
          base_name = data_map.get("Base Name", "")
          front_dir = data_map.get("Output Dir Front", "")
          back_dir = data_map.get("Output Dir Back", "")
          
          def is_psd_saved(directory, match_name):
            if not os.path.exists(directory): return False
            for f in os.listdir(directory):
              # Check if it's a PSD, contains the base name, and has file size > 0
              if f.endswith(".psd") and match_name in f:
                if os.path.getsize(os.path.join(directory, f)) > 0:
                  return True
            return False

          # Check if BOTH exist dynamically
          if is_psd_saved(front_dir, base_name) and is_psd_saved(back_dir, base_name):
            await asyncio.sleep(2) # Cooldown for save completion
            success = True
            break

        # --- STANDARD SUCCESS CONDITION ---
        else:
          # Check for main PSD (out_psd passed in queue)
          if os.path.exists(out_psd) and os.path.getsize(out_psd) > 0:
            
            target_dir = os.path.dirname(out_psd)
            if os.path.exists(target_dir):
              all_files = os.listdir(target_dir)
              found_front = any("Front" in f and unique_id.split('_')[0] in f for f in all_files)
              found_back = any("Back" in f and unique_id.split('_')[0] in f for f in all_files)

              if found_front and found_back:
                await asyncio.sleep(2)
                success = True
                break
        
        if int(time.time() - start_time) % 20 == 0:
          logger.info(f"⏳ Syncing {unique_id}... ({jurisdiction} Mode)")
        
        await asyncio.sleep(3)

      if success:
        logger.info(f"✅ PSD Generation successful for {unique_id}!")
        # --- LIGHTBURN TRIGGER ---
        if jurisdiction == "NY":
          try:
            logger.info(f"🔥 Generating LightBurn files for NY: {unique_id}")
            await bot.send_message(chat_id, "Generating LightBurn Files...")
            await asyncio.get_running_loop().run_in_executor(
              None, ny_module.generate_lightburn_lbrn, data_map, BASE_DIR
            )
            logger.info(f"✅ NY LightBurn generation complete for {unique_id}")
          except Exception as e:
            logger.error(f"LightBurn Logic Error: {e}")
            await bot.send_message(chat_id, f"⚠️ LightBurn Error: {e}")
            
        elif jurisdiction == "VA":
          try:
            logger.info(f"🔥 Generating LightBurn files for VA: {unique_id}")
            await bot.send_message(chat_id, "Generating LightBurn Files...")
            await asyncio.get_running_loop().run_in_executor(
              None, va_module.generate_lightburn_lbrn, data_map, BASE_DIR
            )
            logger.info(f"✅ VA LightBurn generation complete for {unique_id}")
          except Exception as e:
            logger.error(f"VA LightBurn Logic Error: {e}")
            await bot.send_message(chat_id, f"⚠️ VA LightBurn Error: {e}")

        await bot.send_message(chat_id, "🎉 Job Done!")
      else:
        await bot.send_message(chat_id, "😔 Job took very long...")

    except Exception as e:
      logger.error(f"Worker Error: {e}")
    finally:
      processing_queue.task_done()

# ==============================================================================
# COMMON HELPERS
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

def parse_fl_data(text: str) -> dict:
  data = {}
  lines = text.split('\n')
  key_map = {
    "First Name": "first_name", "Middle Name": "middle_name", "Last Name": "last_name",
    "Address": "address", "City": "city", "State Code": "state_code",
    "Full Zip Code + 4 Digits": "zip_code", "Dob": "dob", "Gender": "gender",
    "Height": "height", "Eyes": "eyes", "Issue Date": "issue_date",
    "Expires Date": "expires_date", "Class": "class", "Signature": "signature_text",
    "Driver License Number": "custom_dl", "DL Number": "custom_dl", "DL": "custom_dl"
  }
  for line in lines:
    if ":" in line:
      parts = line.split(":", 1)
      key, val = parts[0].strip(), parts[1].strip()
      # Match case-insensitively for flexibility
      for k, v in key_map.items():
          if key.lower() == k.lower():
              data[v] = val

  return data

def parse_bulk_input(text: str) -> dict:
  data = {}
  lines = text.split('\n')
  key_map = {
    "jurisdiction": "jurisdiction", "state": "jurisdiction",
    "first name": "first_name", "middle name": "middle_name", "last name": "last_name",
    "address": "address", "city": "city", "state code": "state_code", 
    "full zip code + 4 digits": "zip_code", "zip code": "zip_code",
    "gender": "gender", "dob": "dob", "height": "height", "eyes": "eyes",
    "class": "class", "endorsements": "endorsements", "restrictions": "restrictions",
    "issue date": "issue_date", "expires date": "expires_date", "real id": "real_id",
    "not real id": "not_real_id", "signature": "signature",
    "dl number": "custom_dl", "license number": "custom_dl", "dl": "custom_dl"
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

  return data

# ==============================================================================
# CORE LOGIC (API)
# ==============================================================================

import random # Add this import at top if missing

def generate_barcodes(user_data: dict, api_height: str):
  headers = {"Authorization": f"Bearer {FIS_API_KEY}", "Content-Type": "application/x-www-form-urlencoded"}
  state = user_data.get("jurisdiction", "NJ").upper().strip()
  if state == "FL": state = "FL"

  # --- COMMON PREP ---
  eye_map = {
    "BRN": "BRO", "BROWN": "BRO", "BLU": "BLU", "BLUE": "BLU",
    "GRN": "GRN", "GREEN": "GRN", "HZL": "HAZ", "HAZEL": "HAZ", 
    "BLK": "BLK", "BLACK": "BLK", "GRY": "GRY", "GRAY": "GRY"
  }
  raw_eyes = user_data.get("eyes", "BRO").upper().strip()
  api_eyes = eye_map.get(raw_eyes, raw_eyes)[:3] 

  # Truncation Calculation (Common)
  fn_len = len(user_data.get("first_name", "").strip())
  mn_len = len(user_data.get("middle_name", "").strip())
  ln_len = len(user_data.get("last_name", "").strip())
  trunc_first = "T" if fn_len == 1 else "N"
  trunc_last = "T" if ln_len == 1 else "N"
  trunc_middle = "T" if mn_len == 1 else "N" if mn_len > 1 else ""

  # Real ID (Common)
  real_id_status = "N"
  if "VISIBLE" in user_data.get("real_id", "").upper() or "YES" in user_data.get("real_id", "").upper():
    real_id_status = "F"

  # ==========================================================================
  # FLORIDA SPECIFIC LOGIC (Strict Ordering + Safe Driver Fix)
  # ==========================================================================
  if state == "FL":
    # 1. FL Specific Variables
    safe_driver_val = "2"
    val_safe = user_data.get("safe_driver", "").strip().upper()
    if val_safe == "YES" or val_safe == "VISIBLE":
      safe_driver_val = "1"

    replaced_date_val = ""
    if user_data.get("replaced", "").upper() == "YES":
      replaced_date_val = format_date_for_api(user_data.get("issue_date", ""))

    customer_id = f"{random.randint(0, 9999999999):010d}"

    # 2. FL Payload Construction
    payload = {
      "jurisdiction": state, 
      "document": "DL", 
      "save": "true",
      
      # Standard D-Fields
      "data[DAC]": user_data.get("first_name", "").upper(),
      "data[DCS]": user_data.get("last_name", "").upper(),
      "data[DAG]": user_data.get("address", "").upper(), 
      "data[DAI]": user_data.get("city", "").upper(),
      "data[DAJ]": user_data.get("state_code", state).upper(), 
      "data[DAK]": user_data.get("zip_code", ""),
      "data[DBC]": "1" if user_data.get("gender", "M").upper() in ["M", "1", "MALE"] else "2", 
      "data[DBB]": format_date_for_api(user_data.get("dob", "")),
      "data[DAU]": api_height, 
      "data[DAY]": api_eyes,       
      "data[DDA]": real_id_status,    
      "data[DDF]": trunc_first,  
      "data[DDE]": trunc_last,  
      "data[DCA]": user_data.get("class", "E").upper(), 
      "data[DCB]": user_data.get("restrictions", "NONE").upper(),
      "data[DCD]": user_data.get("endorsements", "NONE").upper(),
      "data[DBA]": format_date_for_api(user_data.get("expires_date", "")),
      "data[DBD]": format_date_for_api(user_data.get("issue_date", "")),
      "data[DCK]": user_data.get("inventory_control", "")
    }

    # Optional D-Fields (MUST be added BEFORE Z-Fields)
    if user_data.get("custom_dl"):
      payload["data[DAQ]"] = user_data["custom_dl"].upper().replace(" ", "")

    if mn_len > 0:
      payload["data[DAD]"] = user_data.get("middle_name", "").upper()
      payload["data[DDG]"] = trunc_middle

    # Auxiliary Z-Fields (Strict Order)
    payload["data[ZFA]"] = replaced_date_val   
    payload["data[ZFB]"] = ""          
    payload["data[ZFC]"] = safe_driver_val    
    payload["data[ZFD]"] = "N"          
    payload["data[ZFE]"] = "N"          
    payload["data[ZFF]"] = "N"          
    payload["data[ZFG]"] = "N"          
    payload["data[ZFH]"] = "N"          
    payload["data[ZFI]"] = "None"        
    payload["data[ZFJ]"] = customer_id      
    payload["data[ZFK]"] = ""          

    # Manufacturer Data (Using ORI to fix Safe Driver)
    payload["data[ZNA]"] = "WX"
    payload["data[ZNB]"] = "11.00"
    payload["data[ZNC]"] = "ORI" 

  # ==========================================================================
  # NJ / NY SPECIFIC LOGIC (Legacy Payload)
  # ==========================================================================
  else:
    payload = {
      "jurisdiction": state, 
      "document": "DL", "save": "true",
      "data[DAC]": user_data.get("first_name", "").upper(),
      "data[DCS]": user_data.get("last_name", "").upper(),
      "data[DAG]": user_data.get("address", "").upper(), 
      "data[DAI]": user_data.get("city", "").upper(),
      "data[DAJ]": user_data.get("state_code", state).upper(), 
      "data[DAK]": user_data.get("zip_code", ""),
      # NJ/NY logic often passes '1' or '2' directly or defaults to '1'
      "data[DBC]": user_data.get("gender", "1"),
      "data[DBB]": format_date_for_api(user_data.get("dob", "")),
      "data[DAU]": api_height, 
      "data[DAY]": api_eyes,       
      "data[DDA]": real_id_status,    
      "data[DDF]": trunc_first, 
      "data[DDE]": trunc_last,  
      "data[DCA]": user_data.get("class", "D").upper(), 
      "data[DCB]": user_data.get("restrictions", "NONE").upper(),
      "data[DBA]": format_date_for_api(user_data.get("expires_date", "")),
      "data[DBD]": format_date_for_api(user_data.get("issue_date", "")),
      
      # Legacy Manufacturer Data
      "data[ZNA]": "WX", 
      "data[ZNB]": "11.00", 
      "data[ZNC]": "DUP", 
      "data[DDC]": "1"
    }

    if user_data.get("custom_dl"):
      payload["data[DAQ]"] = user_data["custom_dl"].upper().replace(" ", "")

    if mn_len > 0:
      payload["data[DAD]"] = user_data.get("middle_name", "").upper()
      payload["data[DDG]"] = trunc_middle

  logger.info(f"🚀 Sending payload to FIS API for state: {state}")

  # --- EXECUTE REQUEST ---
  resp = requests.post(f"{API_BASE_URL}/barcode", headers=headers, data=payload, timeout=60)
  resp.raise_for_status()
  barcode_id = resp.headers.get("X-Barcode-ID")
  
  logger.info(f"✅ Barcode successfully generated! Barcode ID: {barcode_id}")

  # Fetch all formats
  params = {"barcode_id": barcode_id}
  
  big_svg = requests.get(f"{API_BASE_URL}/export", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "image/svg+xml"}, params=params, timeout=60).content
  small_svg = requests.get(f"{API_BASE_URL}/linear", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "image/svg+xml"}, params=params, timeout=60).content
  
  big_tiff = requests.get(f"{API_BASE_URL}/export", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "image/tiff"}, params=params, timeout=60).content
  small_tiff = requests.get(f"{API_BASE_URL}/linear", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "image/tiff"}, params=params, timeout=60).content
  
  raw_text = requests.get(f"{API_BASE_URL}/export", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "text/plain"}, params=params, timeout=60).text
  
  big_png = requests.get(f"{API_BASE_URL}/export", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "image/png"}, params=params, timeout=60).content
  small_png = requests.get(f"{API_BASE_URL}/linear", headers={"Authorization": f"Bearer {FIS_API_KEY}", "Accept": "image/png"}, params=params, timeout=60).content

  return barcode_id, big_svg, small_svg, raw_text, big_tiff, small_tiff, big_png, small_png

# ==============================================================================
# TELEGRAM FLOW
# ==============================================================================

# ==============================================================================
# UI HELPERS
# ==============================================================================
def get_yes_no_kb():
  return InlineKeyboardMarkup([
    [InlineKeyboardButton("✅ Yes", callback_data="yes"), 
    InlineKeyboardButton("❌ No", callback_data="no")]
  ])

def get_options_kb(options):
  return InlineKeyboardMarkup([[InlineKeyboardButton(opt, callback_data=opt)] for opt in options])

# ==============================================================================
# TELEGRAM FLOW
# ==============================================================================

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    track_user(update.effective_user)
    if is_blocked(update.effective_chat.id):
        return ConversationHandler.END

    context.user_data.clear()
    text = (
        "PLEASE!\n\n"
        "Novelty & Film Props ONLY!\n"
        "Nothing Here Is For Illegal Use!\n"
        "Props Are Strictly For Movie(s) Video(s) Production & Content Creating Only! "
        "Nothing Here Is Used Or Should Be Used For Illegal Purposes!\n\n"
        "Use /Enter to visit."
    )
    await update.message.reply_text(text)
    return DISCLAIMER_WAIT

async def enter_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    track_user(update.effective_user)
    chat_id = update.effective_chat.id if update.effective_chat else update.callback_query.message.chat_id
    if is_blocked(chat_id):
        return ConversationHandler.END

    cart = context.user_data.get('cart', [])
    cart_text = f"🛒 View Cart ({len(cart)} items)" if cart else "🛒 Cart (Empty)"

    text = "👋WELCOME!\n\n📇Underground Express Store📇\n\nMain Menu"
    keyboard = [
        [InlineKeyboardButton("Shop", callback_data="menu_shop"), InlineKeyboardButton("Rules", callback_data="menu_rules")],
        [InlineKeyboardButton("Preview", callback_data="menu_preview"), InlineKeyboardButton("Price", callback_data="menu_price")],
        [InlineKeyboardButton(cart_text, callback_data="menu_cart")]
    ]
    
    markup = InlineKeyboardMarkup(keyboard)
    if update.message:
        await update.message.reply_text(text, reply_markup=markup)
    elif update.callback_query:
        await update.callback_query.message.edit_text(text, reply_markup=markup)
    return MAIN_MENU

async def main_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  data = query.data
  
  back_kb = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back to Main Menu", callback_data="back_main")]])
  
  if data == "menu_shop":
    keyboard = [
      [InlineKeyboardButton("Physical Eyes", callback_data="shop_physical")],
      [InlineKeyboardButton("Scan Eyes", callback_data="shop_scan")],
      [InlineKeyboardButton("2nd Form", callback_data="shop_2nd")]
    ]
    await query.message.edit_text("Select a Category:", reply_markup=InlineKeyboardMarkup(keyboard))
    return SHOP_MENU
  
  elif data == "menu_cart":
    return await show_cart(update, context)
  
  elif data == "menu_rules":
    msg_path = os.path.join(BASE_DIR, "Automated Messages", "Messages", "rules.txt")
    text = "Rules:\n\n"
    if os.path.exists(msg_path):
      with open(msg_path, "r", encoding="utf-8") as f:
        text += f.read()
    else:
      text += "Rules file not found."
    await query.message.edit_text(text, reply_markup=back_kb)
    return MAIN_MENU
    
  elif data == "menu_price":
    msg_path = os.path.join(BASE_DIR, "Automated Messages", "Messages", "price.txt")
    text = "Pricing:\n\n"
    if os.path.exists(msg_path):
      with open(msg_path, "r", encoding="utf-8") as f:
        text += f.read()
    else:
      text += "Price file not found."
    await query.message.edit_text(text, reply_markup=back_kb)
    return MAIN_MENU
    
  elif data == "menu_preview":
    keyboard = [
      [InlineKeyboardButton("FL - Florida", callback_data="prev_FL")],
      [InlineKeyboardButton("NJ - New Jersey", callback_data="prev_NJ")],
      [InlineKeyboardButton("NY - New York", callback_data="prev_NY")],
      [InlineKeyboardButton("PA - Pennsylvania", callback_data="prev_PA")],
      [InlineKeyboardButton("VA - Virginia", callback_data="prev_VA")],
      [InlineKeyboardButton("🔙 Back to Main Menu", callback_data="back_main")]
    ]
    await query.message.edit_text("Please Choose A State", reply_markup=InlineKeyboardMarkup(keyboard))
    return PREVIEW_STATE_SELECT
    
  elif data == "back_main":
    return await enter_command(update, context)
    
  return MAIN_MENU

async def show_cart(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    cart = context.user_data.get('cart', [])
    
    if not cart:
        await query.message.edit_text("🛒 *Your cart is empty.*", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back to Main Menu", callback_data="back_main")]]), parse_mode="Markdown")
        return CART_MENU
        
    text = "🛒 *Your Cart:*\n\n"
    keyboard = []
    
    for i, item in enumerate(cart):
        state = item.get('jurisdiction', 'Unknown')
        fn = item.get('first_name', '')
        ln = item.get('last_name', '')
        text += f"{i+1}. {state} - {fn} {ln}\n"
        keyboard.append([InlineKeyboardButton(f"❌ Remove: {state} ({fn})", callback_data=f"cart_del_{i}")])
        
    text += "\nReady to submit?"
    keyboard.append([InlineKeyboardButton("💳 Checkout & Pay", callback_data="cart_checkout")])
    keyboard.append([InlineKeyboardButton("🔙 Back to Main Menu", callback_data="back_main")])
    
    await query.message.edit_text(text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
    return CART_MENU

async def cart_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    data = query.data
    
    if data == "back_main":
        return await enter_command(update, context)
        
    elif data.startswith("cart_del_"):
        idx = int(data.split("_")[2])
        cart = context.user_data.get('cart', [])
        if 0 <= idx < len(cart):
            cart.pop(idx)
            context.user_data['cart'] = cart
        return await show_cart(update, context)
        
    elif data == "cart_checkout":
        if ADMIN_MODE:
            await query.message.edit_text("🛡️ *Admin Mode Active:* Skipping payment. Processing started...", parse_mode="Markdown")
            cart = context.user_data.get('cart', [])
            for item in cart:
                asyncio.create_task(execute_generation(context.bot, update.effective_chat.id, item))
            context.user_data['cart'] = [] # Clear cart
            return ConversationHandler.END
        else:
            msg_path = os.path.join(BASE_DIR, "Automated Messages", "Messages", "payment_message.txt")
            payment_msg = "💳 *Please send the payment screenshot for your entire order.*"
            if os.path.exists(msg_path):
                with open(msg_path, "r", encoding="utf-8") as f:
                    payment_msg = f.read()
            await query.message.edit_text(payment_msg, parse_mode="Markdown")
            return PAYMENT_UPLOAD

async def shop_menu_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  data = query.data
  
  if data in ["shop_scan", "shop_2nd"]:
    await query.answer("Coming soon!", show_alert=True)
    return SHOP_MENU
  elif data == "shop_physical":
    await query.answer()
    keyboard = get_50_states_keyboard()
    await query.message.edit_text("Please Choose A State", reply_markup=InlineKeyboardMarkup(keyboard))
    return STATE_SELECT
  elif data == "back_main":
    await query.answer()
    return await enter_command(update, context)
  
  return SHOP_MENU

async def preview_state_select_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  data = query.data
  
  if data == "back_main":
    return await enter_command(update, context)
  
  state = data.replace("prev_", "")
  preview_dir = os.path.join(BASE_DIR, "Automated Messages", "Previews", state)
  back_kb = InlineKeyboardMarkup([[InlineKeyboardButton("🔙 Back to Main Menu", callback_data="back_main")]])
  
  await query.message.reply_text(f"🔍 Here is the front and back preview for {state}:")
  
  if os.path.exists(preview_dir):
    images = os.listdir(preview_dir)
    front_img = next((img for img in images if "front" in img.lower()), None)
    back_img = next((img for img in images if "back" in img.lower()), None)

    if front_img:
      await context.bot.send_photo(chat_id=query.message.chat_id, photo=open(os.path.join(preview_dir, front_img), 'rb'))
    if back_img:
      await context.bot.send_photo(chat_id=query.message.chat_id, photo=open(os.path.join(preview_dir, back_img), 'rb'))
  else:
    await query.message.reply_text("Preview images not found for this state.")
    
  await query.message.reply_text("Select an option below:", reply_markup=back_kb)
  return MAIN_MENU

async def handle_buy_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()

  if query.data.lower() != "yes":
    await query.message.edit_text("🚫 *Process cancelled.*", parse_mode="Markdown")
    return ConversationHandler.END

  msg = context.user_data.get('bulk_prompt_msg', "Please enter details.")
  await query.message.edit_text(msg, parse_mode="Markdown")
  return BULK_INPUT

async def handle_bulk_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  current_state = context.user_data.get('jurisdiction')
  raw_text = update.message.text

  if current_state == "FL":
    parsed_data = parse_fl_data(raw_text)
  else:
    parsed_data = parse_bulk_input(raw_text)

  if parsed_data is None:
      parsed_data = {}
  
  context.user_data.update(parsed_data)
  context.user_data['jurisdiction'] = current_state 
  
  logger.info(f"📥 Payload received from User ID {update.effective_chat.id} for State: {current_state}. Keys parsed: {list(parsed_data.keys())}")

  await update.message.reply_text("✍️ *Custom Signature?*\n\nSelect Yes to upload an image or type text. Select No to auto-generate.", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return SIGNATURE_CHECK

async def ask_custom_dl(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()

  if query.data.lower() == "yes":
    await query.message.edit_text("⌨️ *Enter DL Number:*", parse_mode="Markdown")
    return CUSTOM_DL_INPUT
  else:
    await query.message.edit_text("✍️ *Upload Signature Image?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
    return SIGNATURE_CHECK

async def get_custom_dl_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  context.user_data["custom_dl"] = update.message.text.strip()
  await update.message.reply_text("✍️ *Upload Signature Image?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return SIGNATURE_CHECK


# --- FL SPECIFIC HANDLERS ---
async def fl_ask_real_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  context.user_data['real_id'] = query.data.upper()
  await query.message.edit_text("🌴 *FL: Restriction?*", reply_markup=get_options_kb(["A", "B", "NONE"]), parse_mode="Markdown")
  return FL_RESTRICTION

async def fl_ask_restriction(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  context.user_data['restrictions'] = query.data.upper()
  await query.message.edit_text("🌴 *FL: Endorsement?*", reply_markup=get_options_kb(["A", "NONE"]), parse_mode="Markdown")
  return FL_ENDORSEMENT

async def fl_ask_endorsement(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  context.user_data['endorsements'] = query.data.upper()
  await query.message.edit_text("🌴 *FL: Safe Driver?*", reply_markup=get_options_kb(["YES", "NO"]), parse_mode="Markdown")
  return FL_SAFE_DRIVER

async def fl_ask_safe_driver(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  context.user_data['safe_driver'] = query.data.upper()
  await query.message.edit_text("🌴 *FL: Replaced?*", reply_markup=get_options_kb(["YES", "NO"]), parse_mode="Markdown")
  return FL_REPLACED

async def fl_ask_replaced(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  context.user_data['replaced'] = query.data.upper()
  await query.message.edit_text("📸 *Upload Face Picture?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return FACE_CHECK

# --- PA SPECIFIC HANDLERS ---
async def pa_dl_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  if query.data.lower() == "yes":
    await query.message.edit_text("⌨️ *Enter Custom DL:*", parse_mode="Markdown")
    return PA_DL_INPUT
  await query.message.edit_text("📅 *Custom Iss Date?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return PA_ISS_CHECK

async def pa_dl_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  context.user_data["custom_dl"] = update.message.text.strip()
  await update.message.reply_text("📅 *Custom Iss Date?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return PA_ISS_CHECK

async def pa_iss_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  if query.data.lower() == "yes":
    await query.message.edit_text("⌨️ *Enter Custom Issue Date (MM/DD/YYYY):*", parse_mode="Markdown")
    return PA_ISS_INPUT
  await query.message.edit_text("📅 *Custom Exp Date?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return PA_EXP_CHECK

async def pa_iss_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  context.user_data["issue_date"] = update.message.text.strip()
  await update.message.reply_text("📅 *Custom Exp Date?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return PA_EXP_CHECK

async def pa_exp_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  if query.data.lower() == "yes":
    await query.message.edit_text("⌨️ *Enter Custom Exp Date (MM/DD/YYYY):*", parse_mode="Markdown")
    return PA_EXP_INPUT
  await query.message.edit_text("✍️ *Custom Signature?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return PA_SIG_CHECK

async def pa_exp_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  context.user_data["expires_date"] = update.message.text.strip()
  await update.message.reply_text("✍️ *Custom Signature?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return PA_SIG_CHECK

async def pa_sig_check(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  if query.data.lower() == "yes":
    await query.message.edit_text("📤 *Upload Signature Image:*", parse_mode="Markdown")
    return PA_SIG_UPLOAD
  await query.message.edit_text("⭐ *Real ID?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return PA_REAL_ID

async def pa_sig_upload(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    return await get_signature_input(update, context)

async def pa_real_id(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  context.user_data['real_id'] = "YES" if query.data.lower() == "yes" else "NO"
  await query.message.edit_text("📸 *Upload Face Picture?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return FACE_CHECK

async def request_payment(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  msg_path = os.path.join(BASE_DIR, "Automated Messages", "Messages", "payment_message.txt")
  payment_msg = "💳 *Please send the payment screenshot.*"
  if os.path.exists(msg_path):
    with open(msg_path, "r", encoding="utf-8") as f:
      payment_msg = f.read()
  await update.message.reply_text(payment_msg, parse_mode="Markdown")
  return PAYMENT_UPLOAD

async def handle_payment_upload(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    if not update.message.photo and not update.message.document:
        await update.message.reply_text("❌ Please upload a screenshot image of your payment.")
        return PAYMENT_UPLOAD
        
    chat_id = update.effective_chat.id
    job_id = str(uuid.uuid4())[:8]
    
    cart = context.user_data.get('cart', [])
    if not cart:
        await update.message.reply_text("🛒 Your cart is empty.")
        return ConversationHandler.END
    
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("INSERT INTO jobs (job_id, chat_id, user_data, status) VALUES (?, ?, ?, ?)",
                     (job_id, chat_id, json.dumps(cart), "PENDING"))
        conn.commit()
    finally:
        conn.close()
                     
    photo_file = update.message.photo[-1].file_id if update.message.photo else update.message.document.file_id
    keyboard = [
        [InlineKeyboardButton("✅ Approve All", callback_data=f"approve_{job_id}"),
         InlineKeyboardButton("❌ Reject", callback_data=f"reject_{job_id}")],
        [InlineKeyboardButton("🚫 Block User", callback_data=f"block_{job_id}")]
    ]
    
    username = f"@{update.effective_user.username}" if update.effective_user.username else "No Username"
    
    # Build a text list of all items ordered
    admin_text = f"🚨 New Order [{job_id}] - {len(cart)} Items\n"
    for i, item in enumerate(cart):
        admin_text += f"- {item.get('jurisdiction')}: {item.get('first_name')} {item.get('last_name')}\n"
    admin_text += f"\nUser ID: `{chat_id}`\nUsername: {username}"
    
    if ADMIN_CHAT_ID:
        await context.bot.send_photo(chat_id=ADMIN_CHAT_ID, photo=photo_file, caption=admin_text, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
    
    # Empty cart
    context.user_data['cart'] = []
    
    await update.message.reply_text("⏳ *Order submitted. Please wait for approval.*", parse_mode="Markdown")
    return ConversationHandler.END

async def admin_callback(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    
    action, job_id = query.data.split("_")
    
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT chat_id, user_data FROM jobs WHERE job_id = ?", (job_id,))
        row = cursor.fetchone()
    finally:
        conn.close()
        
    if not row:
        await query.edit_message_caption(caption=f"{query.message.caption}\n\n⚠️ Job not found in database.")
        return
        
    chat_id, user_data_json = row
    cart_items = json.loads(user_data_json)
    
    # Helper to clean up previous status tags so they don't stack
    clean_caption = query.message.caption.replace("\n\n🚫 BLOCKED", "").replace("\n\n🔓 UNBLOCKED", "")
    
    if action == "approve":
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.execute("UPDATE jobs SET status = 'APPROVED' WHERE job_id = ?", (job_id,))
            conn.commit()
        finally:
            conn.close()
        
        await query.edit_message_caption(caption=f"{clean_caption}\n\n✅ APPROVED", reply_markup=None)
        
        # Determine how many items are being processed
        total_items = len(cart_items) if isinstance(cart_items, list) else 1
        await context.bot.send_message(chat_id, f"✅ *Your payment was approved!* Processing {total_items} item(s).", parse_mode="Markdown")
        
        # Loop through list of cart items
        if isinstance(cart_items, list):
            for item in cart_items:
                asyncio.create_task(execute_generation(context.bot, chat_id, item))
        else:
            # Fallback just in case an older database job was a single dictionary
            asyncio.create_task(execute_generation(context.bot, chat_id, cart_items))
            
    elif action == "reject":
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.execute("UPDATE jobs SET status = 'REJECTED' WHERE job_id = ?", (job_id,))
            conn.commit()
        finally:
            conn.close()
        
        await query.edit_message_caption(caption=f"{clean_caption}\n\n❌ REJECTED", reply_markup=None)
        await context.bot.send_message(chat_id, "❌ *Your payment was rejected.* Process cancelled.", parse_mode="Markdown")
        
    elif action == "block":
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.execute("UPDATE jobs SET status = 'BLOCKED' WHERE job_id = ?", (job_id,))
            conn.commit()
        finally:
            conn.close()
        
        set_blocked(chat_id, True)
        
        # Swap the button to an "Unblock" button
        keyboard = [[InlineKeyboardButton("🔓 Unblock User", callback_data=f"unblock_{job_id}")]]
        await query.edit_message_caption(caption=f"{clean_caption}\n\n🚫 BLOCKED", reply_markup=InlineKeyboardMarkup(keyboard))
        try:
            await context.bot.send_message(chat_id, "❌ *Your request was rejected.*", parse_mode="Markdown")
        except:
            pass # Ignore if the user already blocked the bot

    elif action == "unblock":
        conn = sqlite3.connect(DB_PATH)
        try:
            conn.execute("UPDATE jobs SET status = 'UNBLOCKED' WHERE job_id = ?", (job_id,))
            conn.commit()
        finally:
            conn.close()
        
        set_blocked(chat_id, False)
        
        # Swap the button back to a "Block" button
        keyboard = [[InlineKeyboardButton("🚫 Block User", callback_data=f"block_{job_id}")]]
        await query.edit_message_caption(caption=f"{clean_caption}\n\n🔓 UNBLOCKED", reply_markup=InlineKeyboardMarkup(keyboard))

async def show_unified_prompt(query, context, state_code):
    dl_formats = {
        "NJ": "H5901 59055 59481",
        "NY": "689 995 677",
        "VA": "T67256730",
        "FL": "O425-10-46-516-0",
        "PA": "19 059 959"
    }
    sample_dl = dl_formats.get(state_code.upper(), "H5901 59055 59481")

    msg = (
       "Please only edit and replace the sample information with your information details exactly in this format.\n\n"
       "```text\n"
       f"DL: {sample_dl}\n"
       "First Name: HARROLD\n"
       "Middle Name: EYES\n"
       "Last Name: FINCH\n"
       "Address: 100 EYES \n"
       "City: NEWARK\n"
       f"State Code: {state_code.upper()}\n"
       "Full Zip Code + 4 Digits: 07101-1234\n"
       "Gender: M\n"
       "Dob: 01/01/1980\n"
       "Height: 5'-11\"\n"
       "Eyes: BRN\n"
       "Class: D\n"
       "Endorsements: NONE\n"
       "Restrictions: NONE\n"
       "Issue Date: 01/01/2023\n"
       "Expires Date: 01/01/2030\n"
       "Real ID: Visible\n"
       "Not Real ID: Not Visible\n"
       "```"
    )
    context.user_data['bulk_prompt_msg'] = msg 
    await query.message.edit_text(msg, parse_mode="Markdown")
    return BULK_INPUT

def get_50_states_keyboard(prefix=""):
    states_str = (
        "AL - Alabama\nAK - Alaska\nAZ - Arizona\nAR - Arkansas\nCA - California\n"
        "CO - Colorado\nCT - Connecticut\nDE - Delaware\nDC - District of Columbia\n"
        "FL - Florida\nGA - Georgia\nHI - Hawaii\nID - Idaho\nIL - Illinois\n"
        "IN - Indiana\nIA - Iowa\nKS - Kansas\nKY - Kentucky\nLA - Louisiana\n"
        "ME - Maine\nMD - Maryland\nMA - Massachusetts\nMI - Michigan\nMN - Minnesota\n"
        "MS - Mississippi\nMO - Missouri\nMT - Montana\nNE - Nebraska\nNV - Nevada\n"
        "NH - New Hampshire\nNJ - New Jersey\nNM - New Mexico\nNY - New York\n"
        "NC - North Carolina\nND - North Dakota\nOH - Ohio\nOK - Oklahoma\nOR - Oregon\n"
        "PA - Pennsylvania\nRI - Rhode Island\nSC - South Carolina\nSD - South Dakota\n"
        "TN - Tennessee\nTX - Texas\nUT - Utah\nVT - Vermont\nVA - Virginia\n"
        "WA - Washington\nWV - West Virginia\nWI - Wisconsin\nWY - Wyoming"
    )
    keyboard = []
    row = []
    for s in states_str.split("\n"):
        code = s.split(" - ")[0].strip()
        name = s.strip()
        row.append(InlineKeyboardButton(name, callback_data=f"{prefix}{code}"))
        if len(row) == 2:  # Changed to 2 columns so full names fit on mobile
            keyboard.append(row)
            row = []
    if row:
        keyboard.append(row)
    keyboard.append([InlineKeyboardButton("🔙 Back to Main Menu", callback_data="back_main")])
    return keyboard

async def select_state(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    
    if query.data == "back_main":
        await query.answer()
        return await enter_command(update, context)
        
    selected = query.data.upper()
    implemented_states = ["NJ", "NY", "FL", "PA", "VA"]
    
    if selected not in implemented_states:
        await query.answer("Coming Soon!", show_alert=True)
        return STATE_SELECT
        
    await query.answer()
    context.user_data['jurisdiction'] = selected

    if selected == "NJ":
        keyboard = [[InlineKeyboardButton("🪪 ID", callback_data="nj_id"), InlineKeyboardButton("🚗 DL", callback_data="nj_dl")]]
        await query.message.edit_text("📍 *NJ Selected*\n\nPlease select document type:", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
        return NJ_DL_ID_CHECK
    else:
        return await show_unified_prompt(query, context, selected)

async def nj_dl_id_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data['nj_doc_type'] = query.data
    keyboard = [[InlineKeyboardButton("Grade - 🅰️", callback_data="nj_grade_a"), InlineKeyboardButton("Grade - 🅱️", callback_data="nj_grade_b")]]
    await query.message.edit_text("Select Grade:", reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
    return NJ_GRADE_CHECK

async def nj_grade_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    query = update.callback_query
    await query.answer()
    context.user_data['nj_grade'] = query.data
    return await show_unified_prompt(query, context, "NJ")

async def ask_signature(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()

  if query.data.lower() == "yes":
    await query.message.edit_text("📤 *Please type your signature text or upload a signature image.*", parse_mode="Markdown")
    return SIGNATURE_INPUT
  else:
    fn = context.user_data.get('first_name', 'Unknown')
    ln = context.user_data.get('last_name', 'User')
    f_init = fn[0].upper() if fn else ""
    context.user_data['signature'] = f"{f_init}{ln.title()}"
    
    state = context.user_data.get('jurisdiction')
    if state == "FL":
      await query.message.edit_text("🌴 *FL: Real ID?*", reply_markup=get_options_kb(["YES", "NO"]), parse_mode="Markdown")
      return FL_REAL_ID
    elif state == "PA":
      await query.message.edit_text("⭐ *PA: Real ID?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
      return PA_REAL_ID
      
    await query.message.edit_text("📸 *Upload Face Picture?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
    return FACE_CHECK

async def get_signature_input(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  if update.message.text:
      context.user_data["signature"] = update.message.text.strip()
  else:
      file_obj = None
      if update.message.document:
        file_obj = await update.message.document.get_file()
      elif update.message.photo:
        file_obj = await update.message.photo[-1].get_file()
      
      if file_obj:
        ext = os.path.splitext(file_obj.file_path)[1] or ".png"
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        raw_path = os.path.join(TEMP_DIR, f"sig_raw_{timestamp}{ext}")
        await file_obj.download_to_drive(raw_path)
        
        clean_path = os.path.join(TEMP_DIR, f"sig_{timestamp}.png")

        success = remove_bg_removebg(raw_path, clean_path)
        
        context.user_data["signature_path"] = clean_path if success else raw_path
      else:
        await update.message.reply_text("❌ Couldn't download image or read text.")

  state = context.user_data.get('jurisdiction')
  if state == "FL":
    await update.message.reply_text("🌴 *FL: Real ID?*", reply_markup=get_options_kb(["YES", "NO"]), parse_mode="Markdown")
    return FL_REAL_ID
  elif state == "PA":
    await update.message.reply_text("⭐ *PA: Real ID?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
    return PA_REAL_ID

  await update.message.reply_text("📸 *Upload Face Picture?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return FACE_CHECK

async def ask_face(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  if query.data.lower() == "yes":
    await query.message.edit_text("📤 *Please upload the face image.*", parse_mode="Markdown")
    return FACE_UPLOAD
  else:
    await query.message.edit_text("📄 *2nd Form?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
    return SECOND_FORM_CHECK

async def get_face_upload(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  file_obj = None
  if update.message.document:
    file_obj = await update.message.document.get_file()
  elif update.message.photo:
    file_obj = await update.message.photo[-1].get_file()
  
  if file_obj:
    ext = os.path.splitext(file_obj.file_path)[1] or ".png"
    timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
    raw_path = os.path.join(TEMP_DIR, f"face_raw_{timestamp}{ext}")
    await file_obj.download_to_drive(raw_path)
    
    clean_path = os.path.join(TEMP_DIR, f"face_{timestamp}.png")

    success = remove_bg_removebg(raw_path, clean_path)
    
    context.user_data["face_path"] = clean_path if success else raw_path
  else:
    await update.message.reply_text("❌ Couldn't download face image.")
  
  await update.message.reply_text("Face received & processed\n\n📄 *2nd Form?*", reply_markup=get_yes_no_kb(), parse_mode="Markdown")
  return SECOND_FORM_CHECK

async def handle_second_form(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  query = update.callback_query
  await query.answer()
  
  # 1. Get existing cart
  cart = context.user_data.get('cart', [])
  
  # 2. Package current item data
  current_item = {k: v for k, v in context.user_data.items() if k != 'cart'}
  cart.append(current_item)
  
  # 3. Reset user session but keep the cart
  context.user_data.clear()
  context.user_data['cart'] = cart
  
  await query.message.edit_text("✅ *Item saved to your cart!*\n\nReturning to Main Menu...", parse_mode="Markdown")
  await asyncio.sleep(1.5)
  
  return await enter_command(update, context)

async def execute_generation(bot, chat_id, user_data):
  try:
    raw_height = user_data.get('height', '5-00')
    api_height, visual_height = parse_height_logic(raw_height)
    
    loop = asyncio.get_running_loop()
    barcode_results = await loop.run_in_executor(None, generate_barcodes, user_data, api_height)
    barcode_id, big_svg, small_svg, raw_text, big_tiff, small_tiff, big_png, small_png = barcode_results
    
    jurisdiction = user_data.get('jurisdiction', 'NJ').strip().upper()
    logger.info(f"🎨 Routing data to {jurisdiction} module to prepare job files and PSD instructions...")
    
    if jurisdiction == 'PA':
      results = pa_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, big_png=big_png, small_png=small_png)
    elif jurisdiction == 'FL':
      results = fl_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR,big_tiff=big_tiff, small_tiff=small_tiff)
    elif jurisdiction == 'NY':
      results = ny_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR)
    elif jurisdiction == 'VA':
      results = va_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR, big_png, small_png)
    else: # NJ
      results = nj_module.prepare_job_files(user_data, big_svg, small_svg, raw_text, visual_height, TEMP_DIR, FINAL_DIR, BASE_DIR)

    unique_id, data_path, front_path, back_path, psd_path = results[:5]
    jsx_paths = results[5:]

    await processing_queue.put((bot, chat_id, unique_id, data_path, front_path, back_path, psd_path, jsx_paths, jurisdiction))
    
  except Exception as e:
    logger.error(f"Failed: {e}")
    await bot.send_message(chat_id, f"😓 Error: {e}")

async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
  await update.message.reply_text("🚫 Cancelled.")
  return ConversationHandler.END

async def cleanup_worker():
 """Runs in the background to delete temp files older than 5 days."""
 while True:
  try:
   now = time.time()
   cutoff = now - (5 * 86400) # 5 days in seconds
   for f in os.listdir(TEMP_DIR):
    file_path = os.path.join(TEMP_DIR, f)
    if os.path.isfile(file_path) and os.stat(file_path).st_mtime < cutoff:
     os.remove(file_path)
  except Exception as e:
   logger.error(f"Cleanup Error: {e}")
  
  await asyncio.sleep(86400) # Sleep for 24 hours before checking again

async def post_init(application: Application):
 asyncio.create_task(process_queue_worker(application))
 asyncio.create_task(cleanup_worker())

# --- ADMIN COMMANDS ---
async def block_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.id != ADMIN_CHAT_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ Usage: /block <user_id or @username>")
        return
    
    user_input = context.args[0]
    try:
        target_id = resolve_user(user_input)
        set_blocked(target_id, True)
        await update.message.reply_text(f"✅ User {user_input} (ID: `{target_id}`) has been permanently blocked.", parse_mode="Markdown")
    except Exception as e:
        await update.message.reply_text(f"⚠️ {e}")

async def unblock_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.id != ADMIN_CHAT_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ Usage: /unblock <user_id or @username>")
        return
    
    user_input = context.args[0]
    try:
        target_id = resolve_user(user_input)
        set_blocked(target_id, False)
        await update.message.reply_text(f"✅ User {user_input} (ID: `{target_id}`) has been unblocked.", parse_mode="Markdown")
    except Exception as e:
        await update.message.reply_text(f"⚠️ {e}")

async def status_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.effective_chat.id != ADMIN_CHAT_ID:
        return
    if not context.args:
        await update.message.reply_text("⚠️ Usage: /status <user_id or @username>")
        return
    
    user_input = context.args[0]
    try:
        target_id = resolve_user(user_input)
        if is_blocked(target_id):
            await update.message.reply_text(f"🛑 User {user_input} (ID: `{target_id}`) is currently BLOCKED.", parse_mode="Markdown")
        else:
            await update.message.reply_text(f"✅ User {user_input} (ID: `{target_id}`) is currently ACTIVE (Not Blocked).", parse_mode="Markdown")
    except Exception as e:
        await update.message.reply_text(f"⚠️ {e}")

# ==============================================================================
# MAIN FUNCTION
# ==============================================================================

def main():
    app = Application.builder().token(TELEGRAM_BOT_TOKEN).post_init(post_init).build()

    conv_handler = ConversationHandler(
        entry_points=[CommandHandler("start", start)],
        states={
            DISCLAIMER_WAIT: [CommandHandler("enter", enter_command)],
            MAIN_MENU: [CallbackQueryHandler(main_menu_handler)],
            SHOP_MENU: [CallbackQueryHandler(shop_menu_handler)],
            PREVIEW_STATE_SELECT: [CallbackQueryHandler(preview_state_select_handler)],
            CART_MENU: [CallbackQueryHandler(cart_menu_handler)], # <--- THIS LINE IS ADDED
            
            # STANDARD FLOW
            STATE_SELECT: [CallbackQueryHandler(select_state, pattern="^([A-Z]{2}|back_main)$")],
            NJ_DL_ID_CHECK: [CallbackQueryHandler(nj_dl_id_handler)],
            NJ_GRADE_CHECK: [CallbackQueryHandler(nj_grade_handler)],
            BUY_CHECK: [CallbackQueryHandler(handle_buy_check)],
            BULK_INPUT: [MessageHandler(filters.TEXT & ~filters.COMMAND, handle_bulk_input)],
            SIGNATURE_CHECK: [CallbackQueryHandler(ask_signature)],
            SIGNATURE_INPUT: [MessageHandler(filters.TEXT | filters.Document.ALL | filters.PHOTO, get_signature_input)],
            FACE_CHECK: [CallbackQueryHandler(ask_face)],
            FACE_UPLOAD: [MessageHandler(filters.Document.ALL | filters.PHOTO, get_face_upload)],
            SECOND_FORM_CHECK: [CallbackQueryHandler(handle_second_form)],
            PAYMENT_UPLOAD: [MessageHandler(filters.ALL & ~filters.COMMAND, handle_payment_upload)],

            # FL SPECIFIC FLOW
            FL_REAL_ID: [CallbackQueryHandler(fl_ask_real_id)],
            FL_RESTRICTION: [CallbackQueryHandler(fl_ask_restriction)],
            FL_ENDORSEMENT: [CallbackQueryHandler(fl_ask_endorsement)],
            FL_SAFE_DRIVER: [CallbackQueryHandler(fl_ask_safe_driver)],
            FL_REPLACED: [CallbackQueryHandler(fl_ask_replaced)],
            
            # PA SPECIFIC FLOW (Retained paths internally if needed)
            PA_REAL_ID: [CallbackQueryHandler(pa_real_id)],
        },
        fallbacks=[CommandHandler("cancel", cancel)],
        allow_reentry=True
    )

    app.add_handler(conv_handler)
    app.add_handler(CallbackQueryHandler(admin_callback, pattern="^(approve|reject|block|unblock)_"))
    
    app.add_handler(CommandHandler("block", block_command))
    app.add_handler(CommandHandler("unblock", unblock_command))
    app.add_handler(CommandHandler("status", status_command))
    
    print(f"✅ Bot is active and polling! (Token ends in: ...{TELEGRAM_BOT_TOKEN[-5:]})")
    print("📝 Waiting for messages in Telegram...")
    
    app.run_polling()

if __name__ == "__main__":
  main()