import logging
import os 
from typing import Any, Dict, Optional

from fastapi import Depends, Header, HTTPException
from modal import App, Image, Secret, web_endpoint
from supabase import Client, create_client

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger("backend-app")

image = Image.debian_slim(python_version="3.12").pip_install(
    "supabase",
    "fastapi"
)

app = App("backend-app", image=image)

def get_supabase_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"], 
        os.environ["SUPABASE_API_KEY"]
    )

def handle_exception(e: Exception, default_msg: str, status: int = 400) -> None:
    logger.error(default_msg, exc_info=e)
    raise HTTPException(status_code=status, detail=default_msg)

def verify_token(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")
    
    token = authorization.split("Bearer ")[1]
    
    try:
        supabase_client = get_supabase_client()
        user = supabase_client.auth.get_user(token)
        return {
            "id": user.user.id,
            "email": user.user.email
        }
    except Exception as e:
        handle_exception(e, "Invalid or expired token", 401)


@app.function(
    secrets=[Secret.from_name("supabase-secret")]
)
@web_endpoint(method="POST")
def create_item(item: Dict[str,Any], user: Dict[str, Any] = Depends(verify_token)) -> Dict[str, Any]:
    try:
        supabase_client = get_supabase_client()
        result = supabase_client.table("items").insert(item).execute()
        return {"success": True, "user": user, "data": result.data}
    except Exception as e:
        handle_exception(e, "Error inserting item.")

@app.function(
    secrets=[Secret.from_name("supabase-secret")]
)
@web_endpoint(method="GET")
def get_items(user: Dict[str, Any] = Depends(verify_token)) -> Dict[str, Any]:
    """Example: Get all items from Supabase"""
    try:
        supabase_client = get_supabase_client()
        result = supabase_client.table("items").select("*").execute()
        return {"success": True,  "user": user, "data": result.data}
    except Exception as e:
        handle_exception(e, "Error fetching items.")

@app.function(
    secrets=[Secret.from_name("supabase-secret")]
)
@web_endpoint(method="POST")
def signup(data: Dict[str,str]) -> Dict[str, Any]: 
    try:
        supabase_client = get_supabase_client()
        
        response = supabase_client.auth.sign_up(
            {
                "email": data["email"],
                "password": data["password"]
            }
        )
        return {
            "message": "Signup successful - check your email.",
             "user": {
                    "id": response.user.id,
                    "email": response.user.email
                },
            "requiresEmailConfirmation": True
        }
    except Exception as e:
       handle_exception(e, "failed to sign up.")

@app.function(
    secrets=[Secret.from_name("supabase-secret")]
)
@web_endpoint(method="POST")
def login(data: Dict[str,str]) -> Dict[str, Any]: 
    try:
        supabase_client = get_supabase_client()
        
        response = supabase_client.auth.sign_in_with_password(
            {
                "email": data["email"],
                "password": data["password"]
            }
        )
        return {
            "message": "Login successful!",
            "user": {
                "id": response.user.id,
                "email": response.user.email
            },
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token
        }
    except Exception as e:
        handle_exception(e, "failed to log in.", status=401)

@app.function(
    secrets=[Secret.from_name("supabase-secret")]
)
@web_endpoint(method="POST")
def refresh_token(data:dict[str,str]) -> Dict[str, Any]:
    try:
        supabase_client = get_supabase_client()
        
        response = supabase_client.auth.refresh_session(data["refresh_token"])
        return {
            "message": "Token refresh successful!",
            "user": {
                "id": response.user.id,
                "email": response.user.email
            },
            "access_token": response.session.access_token,
            "refresh_token": response.session.refresh_token,
        }
    except Exception as e:
        handle_exception(e, "failed to refresh token.", status=401)