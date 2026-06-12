import os
import sqlite3
import uuid
import hashlib
import secrets
from datetime import datetime, timedelta

from dotenv import load_dotenv
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials 
from jose import JWTError, jwt
from passlib.context import CryptContext

load_dotenv()

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "change_me")
ALGORITHM = "HS256"
security = HTTPBearer() 

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

conn = sqlite3.connect("auth.db", check_same_thread=False)
cursor = conn.cursor()

cursor.execute("""
CREATE TABLE IF NOT EXISTS users (
    username TEXT PRIMARY KEY,
    email TEXT,
    password TEXT NOT NULL,
    plan TEXT NOT NULL DEFAULT 'free'
)
""")

try:
    cursor.execute("ALTER TABLE users ADD COLUMN email TEXT")
except sqlite3.OperationalError:
    pass

cursor.execute("""
CREATE TABLE IF NOT EXISTS usage (
    username TEXT PRIMARY KEY,
    message_count INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY(username) REFERENCES users(username)
)
""")

cursor.execute("""
CREATE TABLE IF NOT EXISTS password_resets (
    username TEXT PRIMARY KEY,
    token TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL
)
""")

conn.commit()
conn.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    key = hashlib.pbkdf2_hmac(
        'sha256', 
        password.encode('utf-8'), 
        salt.encode('utf-8'), 
        100000
    )
    return f"{salt}${key.hex()}"


def verify_password(password: str, hashed: str) -> bool:
    if "$" in hashed:
        try:
            salt, key_hex = hashed.split('$')
            key = hashlib.pbkdf2_hmac(
                'sha256', 
                password.encode('utf-8'), 
                salt.encode('utf-8'), 
                100000
            )
            return secrets.compare_digest(key.hex(), key_hex)
        except Exception:
            return False
    else:
        try:
            return pwd_context.verify(password, hashed)
        except Exception:
            return False


def register_user(username: str, email: str, password: str) -> bool:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM users WHERE username = ?", (username,))
        existing = cursor.fetchone()

        if existing:
            return False

        if email:
            cursor.execute("SELECT username FROM users WHERE email = ?", (email,))
            existing_email = cursor.fetchone()
            if existing_email:
                raise ValueError("Email already in use")

        hashed = hash_password(password)

        cursor.execute(
            "INSERT INTO users (username, email, password, plan) VALUES (?, ?, ?, ?)",
            (username, email, hashed, "free")
        )
        cursor.execute(
            "INSERT INTO usage (username, message_count) VALUES (?, ?)",
            (username, 0)
        )
        conn.commit()
        return True


def authenticate_user(username: str, password: str) -> bool:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()

        if not row:
            return False

        return verify_password(password, row[0])


def create_token(data: dict) -> str:
    payload = data.copy()
    payload["exp"] = datetime.utcnow() + timedelta(hours=12)
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as e:
        raise HTTPException(status_code=401, detail="Invalid or expired token") from e


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> str:
    token = credentials.credentials
    payload = decode_token(token)

    username = payload.get("sub")
    if not username:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    return username


def increment_usage(username: str) -> None:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "UPDATE usage SET message_count = message_count + 1 WHERE username = ?",
            (username,)
        )
        conn.commit()


def get_usage_count(username: str) -> int:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT message_count FROM usage WHERE username = ?", (username,))
        row = cursor.fetchone()
        return row[0] if row else 0


def get_user_plan(username: str) -> str:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT plan FROM users WHERE username = ?", (username,))
        row = cursor.fetchone()
        return row[0] if row else "free"


def set_user_plan(username: str, plan: str) -> None:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET plan = ? WHERE username = ?", (plan, username))
        conn.commit()


def get_total_users() -> int:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) FROM users")
        row = cursor.fetchone()
        return row[0] if row else 0


def get_total_messages() -> int:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT SUM(message_count) FROM usage")
        row = cursor.fetchone()
        return row[0] if row and row[0] is not None else 0


def create_reset_token(email: str) -> str:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT username FROM users WHERE email = ?", (email,))
        row = cursor.fetchone()
        if not row:
            raise ValueError("No user registered with this email address")
        
        username = row[0]
        token = str(uuid.uuid4())
        expires_at = (datetime.utcnow() + timedelta(hours=1)).isoformat()
        
        cursor.execute(
            "INSERT OR REPLACE INTO password_resets (username, token, expires_at) VALUES (?, ?, ?)",
            (username, token, expires_at)
        )
        conn.commit()
        return token


def verify_and_reset_password(token: str, new_password: str) -> bool:
    with sqlite3.connect("auth.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT username, expires_at FROM password_resets WHERE token = ?", (token,))
        row = cursor.fetchone()
        if not row:
            return False
        
        username, expires_at_str = row
        expires_at = datetime.fromisoformat(expires_at_str)
        
        if datetime.utcnow() > expires_at:
            cursor.execute("DELETE FROM password_resets WHERE token = ?", (token,))
            conn.commit()
            return False
        
        hashed = hash_password(new_password)
        cursor.execute("UPDATE users SET password = ? WHERE username = ?", (hashed, username))
        cursor.execute("DELETE FROM password_resets WHERE token = ?", (token,))
        conn.commit()
        return True


def send_reset_email(email: str, token: str) -> None:
    reset_url = f"http://localhost:5173/?token={token}"
    
    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = os.getenv("SMTP_PORT")
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    smtp_from = os.getenv("SMTP_FROM", "no-reply@chatly.com")
    
    if smtp_server and smtp_port and smtp_username and smtp_password:
        import smtplib
        from email.mime.text import MIMEText
        from email.mime.multipart import MIMEMultipart
        
        msg = MIMEMultipart()
        msg["From"] = smtp_from
        msg["To"] = email
        msg["Subject"] = "Chatly - Reset your password"
        
        body = f"""
        <html>
        <body>
            <h2>Reset Your Password</h2>
            <p>You requested a password reset for your Chatly account.</p>
            <p>Click the link below to set a new password. This link is valid for 1 hour.</p>
            <p><a href="{reset_url}">{reset_url}</a></p>
            <br/>
            <p>If you did not request this, you can safely ignore this email.</p>
        </body>
        </html>
        """
        msg.attach(MIMEText(body, "html"))
        
        try:
            with smtplib.SMTP(smtp_server, int(smtp_port)) as server:
                server.starttls()
                server.login(smtp_username, smtp_password)
                server.sendmail(smtp_from, email, msg.as_string())
            print(f"Reset email successfully sent to {email}")
            return
        except Exception as e:
            print(f"Failed to send email via SMTP: {str(e)}. Falling back to local logging.")
            
    log_msg = f"--- PASSWORD RESET LINK FOR {email} ---\nLink: {reset_url}\n---------------------------------------\n"
    print(log_msg)
    
    with open("reset_links.txt", "a") as f:
        f.write(log_msg)