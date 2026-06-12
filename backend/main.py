import logging
import os
import time

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel

from agent.agent import run_agent
from agent.rag import add_document
from auth import (
    authenticate_user,
    create_token,
    get_current_user,
    get_total_messages,
    get_total_users,
    get_usage_count,
    get_user_plan,
    increment_usage,
    register_user,
    create_reset_token,
    verify_and_reset_password,
    send_reset_email,
)

load_dotenv()
logging.basicConfig(level=logging.INFO)

os.makedirs("uploads", exist_ok=True)
os.makedirs("chroma_db", exist_ok=True)
os.makedirs("rag_db", exist_ok=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class ChatRequest(BaseModel):
    message: str


class UserRequest(BaseModel):
    username: str
    password: str
    email: str = None


class ForgotPasswordRequest(BaseModel):
    email: str


class ResetPasswordRequest(BaseModel):
    token: str
    password: str


FREE_LIMIT = 50
last_request_time = {}


def is_allowed(user_id: str) -> bool:
    now = time.time()

    if user_id not in last_request_time:
        last_request_time[user_id] = now
        return True

    if now - last_request_time[user_id] < 5:
        return False

    last_request_time[user_id] = now
    return True


def can_user_chat(user_id: str) -> bool:
    plan = get_user_plan(user_id)

    if plan == "pro":
        return True

    return get_usage_count(user_id) < FREE_LIMIT


@app.get("/")
def home():
    return {"message": "Backend is running"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/register")
def register(user: UserRequest):
    try:
        ok = register_user(user.username, user.email, user.password)

        if not ok:
            return JSONResponse(
                status_code=400,
                content={"message": "Username already exists"}
            )

        return {"message": "Registered successfully"}

    except ValueError as ve:
        return JSONResponse(
            status_code=400,
            content={"message": str(ve)}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Register error: {str(e)}"}
        )

@app.post("/login")
def login(user: UserRequest):
    try:
        ok = authenticate_user(user.username, user.password)

        if not ok:
            return JSONResponse(
                status_code=401,
                content={"message": "Invalid credentials"}
            )

        token = create_token({"sub": user.username})
        return {"token": token, "access_token": token}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Login error: {str(e)}"}
        )


@app.post("/forgot-password")
def forgot_password(request: ForgotPasswordRequest):
    try:
        token = create_reset_token(request.email)
        send_reset_email(request.email, token)
        return {"message": "Password reset link sent to email"}
    except ValueError as ve:
        return JSONResponse(
            status_code=400,
            content={"message": str(ve)}
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Forgot password error: {str(e)}"}
        )


@app.post("/reset-password")
def reset_password(request: ResetPasswordRequest):
    try:
        ok = verify_and_reset_password(request.token, request.password)
        if not ok:
            return JSONResponse(
                status_code=400,
                content={"message": "Invalid or expired reset token"}
            )
        return {"message": "Password reset successfully"}
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"message": f"Reset password error: {str(e)}"}
        )


@app.get("/usage")
def usage(user_id: str = Depends(get_current_user)):
    return {
        "user_id": user_id,
        "plan": get_user_plan(user_id),
        "messages_used": get_usage_count(user_id),
        "free_limit": FREE_LIMIT,
    }


@app.get("/stats")
def stats():
    return {
        "total_users": get_total_users(),
        "total_messages": get_total_messages(),
    }


@app.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user),
):
    file_location = os.path.join("uploads", file.filename)

    with open(file_location, "wb") as f:
        f.write(await file.read())

    add_document(file_location, user_id)

    return {"message": "File uploaded and processed"}


@app.post("/chat")
def chat(
    request: ChatRequest,
    user_id: str = Depends(get_current_user),
):
    if not is_allowed(user_id):
        return StreamingResponse(
            iter(["⚠️ Slow down. Please wait a few seconds."]),
            media_type="text/plain",
        )

    if not can_user_chat(user_id):
        return StreamingResponse(
            iter(["🚫 Free plan limit reached. Upgrade to Pro to continue."]),
            media_type="text/plain",
        )

    increment_usage(user_id)
    logging.info("User %s input: %s", user_id, request.message)

    def generate():
        try:
            result = run_agent(request.message, user_id)

            # Pseudo-streaming for frontend typing effect
            for char in result:
                yield char
                time.sleep(0.003)

        except Exception as e:
            msg = str(e)

            if "429" in msg or "quota" in msg.lower():
                yield "⚠️ Too many requests. Please wait a little and try again."
            else:
                yield f"Error: {msg}"

    return StreamingResponse(generate(), media_type="text/plain")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=False)