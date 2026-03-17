# app.py
import os
import re
import json
import uuid
import hashlib
import hmac
import requests
from datetime import datetime
from flask import Flask, request, render_template, redirect, url_for, session, jsonify, send_from_directory, flash
from flask_sqlalchemy import SQLAlchemy
from werkzeug.utils import secure_filename

app = Flask(__name__)
app.secret_key = 'super-secret-key-change-this'

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(BASE_DIR, 'jobs.db')
app.config['UPLOAD_FOLDER'] = os.path.join(BASE_DIR, 'uploads')
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

db = SQLAlchemy(app)
WEB_URL = "https://ghostautomation.pythonanywhere.com/"
WORKER_API_KEY = "worker-secret-123"
WEB_ADMIN_USERNAME = "Barcodenapster66"
WEB_ADMIN_PASSWORD = "Password63"

# Load Config for Telegram
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
if os.path.exists(CONFIG_PATH):
    with open(CONFIG_PATH, "r") as f:
        config_data = json.load(f)
        TELEGRAM_BOT_TOKEN = config_data.get('telegram', {}).get('bot_token', '')
        ADMIN_CHAT_ID = config_data.get('telegram', {}).get('admin_chat_id', '')
else:
    TELEGRAM_BOT_TOKEN = ""
    ADMIN_CHAT_ID = ""

# ==========================================
# CONSTANTS & HELPERS
# ==========================================
ALL_STATES = { "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California", "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "DC": "District of Columbia", "FL": "Florida", "GA": "Georgia", "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa", "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland", "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri", "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey", "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio", "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina", "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont", "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming" }
IMPLEMENTED_STATES = ["NJ", "NY", "FL", "PA", "VA", "GA", "TX"]

def parse_bulk_input(text: str) -> dict:
    data = {}
    lines = text.split('\n')
    key_map = { "jurisdiction": "jurisdiction", "state": "jurisdiction", "first name": "first_name", "middle name": "middle_name", "last name": "last_name", "address": "address", "city": "city", "state code": "state_code", "full zip code + 4 digits": "zip_code", "zip code": "zip_code", "county": "county", "gender": "gender", "dob": "dob", "height": "height", "weight": "weight", "eyes": "eyes", "class": "class", "endorsements": "endorsements", "restrictions": "restrictions", "issue date": "issue_date", "expires date": "expires_date", "real id": "real_id", "not real id": "not_real_id", "signature": "signature", "dl number": "custom_dl", "license number": "custom_dl", "dl": "custom_dl" }
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

def parse_fl_data(text: str) -> dict:
    data = {}
    lines = text.split('\n')
    key_map = { "First Name": "first_name", "Middle Name": "middle_name", "Last Name": "last_name", "Address": "address", "City": "city", "State Code": "state_code", "Full Zip Code + 4 Digits": "zip_code", "Dob": "dob", "Gender": "gender", "Height": "height", "Eyes": "eyes", "Issue Date": "issue_date", "Expires Date": "expires_date", "Class": "class", "Signature": "signature_text", "Driver License Number": "custom_dl", "DL Number": "custom_dl", "DL": "custom_dl" }
    for line in lines:
        if ":" in line:
            parts = line.split(":", 1)
            key, val = parts[0].strip(), parts[1].strip()
            for k, v in key_map.items():
                if key.lower() == k.lower(): data[v] = val
    return data

# ==========================================
# DATABASE MODELS
# ==========================================
class User(db.Model):
    id = db.Column(db.String(50), primary_key=True) # Will now store Telegram ID
    username = db.Column(db.String(100)) # Stores Telegram @username
    is_blocked = db.Column(db.Boolean, default=False)

class Invite(db.Model):
    token = db.Column(db.String(50), primary_key=True)
    is_used = db.Column(db.Boolean, default=False)

class Job(db.Model):
    job_id = db.Column(db.String(50), primary_key=True)
    user_id = db.Column(db.String(50))
    user_data = db.Column(db.Text)
    status = db.Column(db.String(20))
    payment_image = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

class Setting(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    admin_mode = db.Column(db.Boolean, default=False)

with app.app_context():
    db.create_all()
    if not Setting.query.first():
        db.session.add(Setting(admin_mode=False))
        db.session.commit()

# ==========================================
# MIDDLEWARE (Access Control)
# ==========================================
def verify_telegram_auth(auth_data, bot_token):
    """Cryptographically verifies the login payload came from Telegram."""
    check_hash = auth_data.pop('hash', None)
    if not check_hash:
        return False
        
    data_check_arr = [f"{k}={v}" for k, v in sorted(auth_data.items())]
    data_check_string = "\n".join(data_check_arr)
    
    secret_key = hashlib.sha256(bot_token.encode()).digest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    
    return expected_hash == check_hash

@app.before_request
def check_auth():
    allowed_routes = ['start', 'telegram_auth', 'admin', 'admin_action', 'clear_queue', 'unblock_user', 'generate_invite', 'toggle_admin_mode', 'worker_get_job', 'worker_submit', 'static', 'serve_upload']

    if request.endpoint in allowed_routes: return

    user_id = session.get('user_id')
    if not user_id: return redirect(url_for('start'))

    user = User.query.get(user_id)
    if user and user.is_blocked: return "🚫 You have been blocked from using this service.", 403

# Pass admin_mode to all templates globally
@app.context_processor
def inject_globals():
    settings = Setting.query.first()
    cart_count = len(session.get('cart', []))
    return dict(
        admin_mode=settings.admin_mode if settings else False,
        cart_count=cart_count
    )

# ==========================================
# ROUTES: AUTH, MENU, PREVIEWS
# ==========================================
@app.route('/', methods=['GET', 'POST'])
def start():
    # Pass bot username to the template so the widget knows which bot to invoke
    BOT_USERNAME = "GhostAuthLoginBot" # <-- REPLACE WITH YOUR ACTUAL BOT USERNAME (no @)
    
    if request.method == 'POST':
        token = request.form.get('token', '').strip()
        invite = Invite.query.get(token)
        
        # Check if token exists and is not used
        if invite and not invite.is_used:
            # Token is valid! Save it temporarily and show the Telegram Widget
            session['pending_token'] = token
            return render_template('auth.html', step="telegram", bot_username=BOT_USERNAME)
        else:
            flash("❌ Invalid, expired, or previously used token.", "danger")
            
    return render_template('auth.html', step="token", bot_username=BOT_USERNAME)

@app.route('/telegram_auth')
def telegram_auth():
    pending_token = session.get('pending_token')
    if not pending_token:
        flash("❌ Session expired. Please enter your invite token again.", "danger")
        return redirect(url_for('start'))
        
    auth_data = request.args.to_dict()
    
    # Verify data actually came from Telegram
    if verify_telegram_auth(auth_data.copy(), TELEGRAM_BOT_TOKEN):
        tg_id = str(auth_data.get('id'))
        tg_username = auth_data.get('username', f"Unknown_{tg_id}")
        tg_first_name = auth_data.get('first_name', '')
        tg_last_name = auth_data.get('last_name', '')
        
        # Fallback to initials if user has no Telegram profile picture
        fallback_url = f"https://ui-avatars.com/api/?name={tg_first_name}+{tg_last_name}&background=0D8ABC&color=fff"
        tg_photo_url = auth_data.get('photo_url', fallback_url)
        
        user = User.query.get(tg_id)
        if user and user.is_blocked:
            session.pop('pending_token', None) 
            return "<h1>🚫 Access Denied</h1><p>You have been permanently blocked from using this service.</p>", 403
            
        invite = Invite.query.get(pending_token)
        if not invite or invite.is_used:
            flash("❌ Token has already been used.", "danger")
            return redirect(url_for('start'))
            
        if not user:
            user = User(id=tg_id, username=tg_username)
            db.session.add(user)
        else:
            user.username = tg_username
            
        invite.is_used = True
        db.session.commit()
        
        # Log them in and store profile details
        session.pop('pending_token', None)
        session['user_id'] = tg_id
        session['username'] = tg_username
        session['name'] = f"{tg_first_name} {tg_last_name}".strip() or tg_username
        session['photo_url'] = tg_photo_url
        session['cart'] = []
        
        return redirect(url_for('disclaimer'))
    else:
        return "<h1>⚠️ Authentication Failed</h1><p>Invalid Telegram Hash.</p>", 403

@app.route('/logout')
def logout():
    session.clear()
    flash("You have been successfully logged out.", "success")
    return redirect(url_for('start'))
    
@app.route('/disclaimer', methods=['GET', 'POST'])
def disclaimer():
    if request.method == 'POST': return redirect(url_for('main_menu'))
    return render_template('auth.html', step="disclaimer")

@app.route('/menu')
def main_menu(): return render_template('menu.html', step="main", cart_count=len(session.get('cart', [])))

@app.route('/shop')
def shop(): return render_template('menu.html', step="shop")

@app.route('/states')
def states(): return render_template('menu.html', step="states", all_states=ALL_STATES, implemented=IMPLEMENTED_STATES, target_route="/form/")

@app.route('/info/<doc_type>')
def info_page(doc_type):
    if doc_type not in ['rules', 'price']: return redirect(url_for('main_menu'))
    file_name = "rules.txt" if doc_type == "rules" else "price.txt"
    path = os.path.join(BASE_DIR, "Automated Messages", "Messages", file_name)
    content = "File not found. Please ensure the Automated Messages folder is uploaded correctly."
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f: content = f.read()
    title = "📜 Rules" if doc_type == "rules" else "💰 Pricing"
    return render_template('info.html', title=title, content=content)

@app.route('/preview')
def preview_select(): return render_template('menu.html', step="states", all_states=ALL_STATES, implemented=ALL_STATES.keys(), target_route="/preview/")

@app.route('/preview/<state>')
def preview_state(state):
    state = state.upper()
    preview_dir = os.path.join(BASE_DIR, "Automated Messages", "Previews", state)
    images = []
    if os.path.exists(preview_dir):
        valid_extensions = ('.png', '.jpg', '.jpeg', '.gif')
        images = [f for f in os.listdir(preview_dir) if f.lower().endswith(valid_extensions)]
    if not images:
        flash(f"Previews for {state} coming soon!", "warning")
        return redirect(url_for('preview_select'))
    return render_template('preview.html', state=state, images=images)

@app.route('/preview_img/<state>/<filename>')
def serve_preview(state, filename):
    return send_from_directory(os.path.join(BASE_DIR, "Automated Messages", "Previews", state.upper()), filename)

# ==========================================
# ROUTES: ORDER FLOW (NO UPLOADS FOR DOCS)
# ==========================================
@app.route('/form/<state>', methods=['GET', 'POST'])
def unified_form(state):
    state = state.upper()
    if state not in IMPLEMENTED_STATES:
        flash("State coming soon!", "warning")
        return redirect(url_for('states'))

    if request.method == 'POST':
        raw_text = request.form.get('bulk_text', '')
        parsed_data = parse_fl_data(raw_text) if state == "FL" else parse_bulk_input(raw_text)
        parsed_data['jurisdiction'] = state

        if state == "FL":
            parsed_data['real_id'] = request.form.get('fl_real_id', 'NO')
            parsed_data['restrictions'] = request.form.get('fl_restriction', 'NONE')
            parsed_data['endorsements'] = request.form.get('fl_endorsement', 'NONE')
            parsed_data['safe_driver'] = request.form.get('fl_safe_driver', 'NO')
            parsed_data['replaced'] = request.form.get('fl_replaced', 'NO')
        elif state == "PA":
            parsed_data['real_id'] = request.form.get('pa_real_id', 'NO')
        elif state == "NJ":
            parsed_data['nj_doc_type'] = request.form.get('nj_doc_type', 'DL')
            parsed_data['nj_grade'] = request.form.get('nj_grade', 'A')

        # Helper to save uploaded images
        def save_file(file_obj, prefix):
            if file_obj and file_obj.filename:
                filename = secure_filename(f"{prefix}_{uuid.uuid4().hex[:8]}_{file_obj.filename}")
                file_obj.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))
                return filename
            return None

        # Process Face Upload
        face_file = save_file(request.files.get('face_img'), 'face')
        if face_file:
            parsed_data['face_path'] = face_file

        # Process Signature
        sig_type = request.form.get('sig_type')
        if sig_type == 'upload':
            sig_file = save_file(request.files.get('sig_img'), 'sig')
            if sig_file: parsed_data['signature_path'] = sig_file
        elif sig_type == 'text':
            parsed_data['signature'] = request.form.get('sig_text', '')
        else:
            f_init = parsed_data.get('first_name', 'U')[0].upper()
            parsed_data['signature'] = f"{f_init}{parsed_data.get('last_name', 'User').title()}"

        cart = session.get('cart', [])
        cart.append(parsed_data)
        session['cart'] = cart
        session.modified = True
        flash("✅ Item added to cart! Proceed to checkout or add another.", "success")
        return redirect(url_for('main_menu'))

    dl_formats = {"NJ": "H5901 59055 59481", "NY": "689 995 677", "VA": "T67256730", "FL": "F425-104-65-162-0", "PA": "19 059 959", "GA": "049559674", "TX": "96136059"}
    sample_dl = dl_formats.get(state, "H5901 59055 59481")
    
    if state == "GA":
        sample_text = f"DL: {sample_dl}\nFirst Name: HARROLD\nMiddle Name: EYES\nLast Name: FINCH\nAddress: 100 EYES \nCity: ATLANTA\nState Code: GA\nFull Zip Code + 4 Digits: 39999-1234\nCounty: Fulton\nGender: M\nDob: 01/01/1980\nHeight: 5'-11\"\nWeight: 160\nEyes: BRO\nClass: D\nEndorsements: NONE\nRestrictions: NONE\nIssue Date: 01/01/2023\nExpires Date: 01/01/2030\nReal ID: Visible\nNot Real ID: Not Visible"
    else:
        sample_text = f"DL: {sample_dl}\nFirst Name: HARROLD\nMiddle Name: EYES\nLast Name: FINCH\nAddress: 100 EYES\nCity: NEWARK\nState Code: {state}\nFull Zip Code + 4 Digits: 07101-1234\nGender: M\nDob: 01/01/1980\nHeight: 5'-11\"\nEyes: BRN\nClass: D\nEndorsements: NONE\nRestrictions: NONE\nIssue Date: 01/01/2023\nExpires Date: 01/01/2030\nReal ID: Visible\nNot Real ID: Not Visible"
        
    return render_template('form.html', state=state, sample_text=sample_text)
# ==========================================
# ROUTES: TRACK ORDER, CART, CHECKOUT, TELEGRAM NOTIFY
# ==========================================

@app.route('/track', methods=['GET', 'POST'])
def track_order():
    job = None
    search_attempted = False

    if request.method == 'POST':
        search_attempted = True
        order_id = request.form.get('order_id', '').strip()
        job = Job.query.filter_by(job_id=order_id).first()

        if not job:
            flash(f"Order ID '{order_id}' not found. Please check and try again.", "danger")

    return render_template('track.html', job=job, search_attempted=search_attempted, parse_json=json.loads)

@app.route('/cart')
def view_cart():
    return render_template('cart.html', cart=session.get('cart', []))

@app.route('/cart/remove/<int:index>')
def remove_cart(index):
    cart = session.get('cart', [])
    if 0 <= index < len(cart):
        cart.pop(index)
        session['cart'] = cart
        session.modified = True
    return redirect(url_for('view_cart'))

@app.route('/checkout', methods=['POST'])
def checkout():
    cart = session.get('cart', [])
    if not cart: return redirect(url_for('main_menu'))

    job_id = str(uuid.uuid4())[:8]
    settings = Setting.query.first()

    if settings.admin_mode:
        new_job = Job(job_id=job_id, user_id=session.get('user_id'), user_data=json.dumps(cart), status="APPROVED")
        db.session.add(new_job)
        db.session.commit()
        session['cart'] = []
        flash("🛡️ Admin Mode Active: Order automatically approved and processing started.", "success")
        return render_template('cart.html', success_id=job_id, auto_approved=True)
    else:
        payment_file = request.files.get('payment_screenshot')
        if not payment_file or not payment_file.filename:
            flash("❌ Payment screenshot is required.", "danger")
            return redirect(url_for('view_cart'))

        filename = secure_filename(f"pay_{uuid.uuid4().hex[:8]}_{payment_file.filename}")
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        payment_file.save(filepath)

        new_job = Job(job_id=job_id, user_id=session.get('user_id'), user_data=json.dumps(cart), status="PENDING_APPROVAL", payment_image=filename)
        db.session.add(new_job)
        db.session.commit()

        session['cart'] = []
        return render_template('cart.html', success_id=job_id, auto_approved=False)

# Telegram Webhook Action Link
@app.route('/tg_action/<action>/<job_id>')
def telegram_action(action, job_id):
    if request.args.get('key') != WORKER_API_KEY:
        return "Unauthorized", 401

    job = Job.query.get_or_404(job_id)
    if action == "approve":
        job.status = "APPROVED"
        msg = f"✅ Order {job_id} APPROVED successfully. The Windows Worker will now process it."
    elif action == "reject":
        job.status = "REJECTED"
        msg = f"❌ Order {job_id} REJECTED."
    elif action == "block":
        job.status = "BLOCKED"
        if job.user_id:
            user = User.query.get(job.user_id)
            if user: user.is_blocked = True
            else: db.session.add(User(id=job.user_id, is_blocked=True))
        msg = f"🚫 Order {job_id} REJECTED and User BLOCKED."

    db.session.commit()
    return f"<h3>{msg}</h3><br><a href='/admin'>Go to Admin Dashboard</a>"

# ==========================================
# ADMIN DASHBOARD
# ==========================================
@app.route('/admin', methods=['GET', 'POST'])
def admin():
    if request.method == 'POST':
        # Check if both the username and password match
        if request.form.get('username') == WEB_ADMIN_USERNAME and request.form.get('password') == WEB_ADMIN_PASSWORD:
            session['is_admin'] = True
        else: 
            flash("Incorrect Username or Password", "danger")

    if not session.get('is_admin'): return render_template('admin.html', login=True)

    jobs = Job.query.order_by(Job.created_at.desc()).all()
    blocked_users = User.query.filter_by(is_blocked=True).all()
    return render_template('admin.html', jobs=jobs, blocked_users=blocked_users, parse_json=json.loads)

@app.route('/admin/toggle_mode', methods=['POST'])
def toggle_admin_mode():
    if not session.get('is_admin'): return redirect(url_for('admin'))
    settings = Setting.query.first()
    settings.admin_mode = not settings.admin_mode
    db.session.commit()
    flash(f"Admin Mode is now {'ON' if settings.admin_mode else 'OFF'}", "success")
    return redirect(url_for('admin'))

@app.route('/admin/clear_queue', methods=['POST'])
def clear_queue():
    if not session.get('is_admin'): return redirect(url_for('admin'))
    # Delete all jobs waiting to be processed to clear the backlog
    deleted = Job.query.filter(Job.status.in_(['APPROVED', 'PENDING_APPROVAL'])).delete(synchronize_session=False)
    db.session.commit()
    flash(f"🗑️ Queue cleared! Deleted {deleted} pending/approved jobs.", "success")
    return redirect(url_for('admin'))

@app.route('/admin/<action>/<job_id>')
def admin_action(action, job_id):
    if not session.get('is_admin'): return redirect(url_for('admin'))
    job = Job.query.get_or_404(job_id)
    
    if action == "approve": 
        job.status = "APPROVED"
    elif action == "reject": 
        job.status = "REJECTED"
    elif action == "block":
        job.status = "BLOCKED"
        if job.user_id:
            user = User.query.get(job.user_id)
            if user: 
                user.is_blocked = True
            else:
                # Fallback: Create the user object strictly to block it
                db.session.add(User(id=job.user_id, is_blocked=True))
                
    db.session.commit()
    return redirect(url_for('admin'))

@app.route('/admin/unblock_user/<user_id>')
def unblock_user(user_id):
    if not session.get('is_admin'): return redirect(url_for('admin'))
    user = User.query.get_or_404(user_id)
    user.is_blocked = False
    db.session.commit()
    flash(f"✅ User {user_id} has been unblocked.", "success")
    return redirect(url_for('admin'))

@app.route('/admin/generate_invite')
def generate_invite():
    if not session.get('is_admin'): return redirect(url_for('admin'))
    token = uuid.uuid4().hex[:10]
    db.session.add(Invite(token=token))
    db.session.commit()
    flash(f"New Invite Token Generated: <b>{token}</b>", "success")
    return redirect(url_for('admin'))

# ==========================================
# WORKER API (For Windows PC)
# ==========================================
@app.route('/api/worker/get_job', methods=['GET'])
def worker_get_job():
    if request.args.get('api_key') != WORKER_API_KEY: return jsonify({"error": "Unauthorized"}), 401
    job = Job.query.filter_by(status="APPROVED").first()
    if not job: return jsonify({"message": "No jobs available"}), 200
    return jsonify({"job_id": job.job_id, "payload": json.loads(job.user_data)})

@app.route('/api/worker/submit/<job_id>', methods=['POST'])
def worker_submit(job_id):
    if request.args.get('api_key') != WORKER_API_KEY: return jsonify({"error": "Unauthorized"}), 401
    job = Job.query.get_or_404(job_id)
    job.status = "COMPLETED"
    db.session.commit()
    return jsonify({"message": "Success"}), 200

@app.route('/uploads/<filename>')
def serve_upload(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)

if __name__ == '__main__':
    app.run(debug=True)