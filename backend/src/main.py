import logging
import os 
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional, Tuple

from fastapi import Depends, Header, HTTPException
from fastapi.responses import JSONResponse
from modal import App, Image, Secret, fastapi_endpoint
from supabase import Client, create_client

from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.store.postgres import PostgresStore

import sys
sys.path.append("/root/src")

from utils import create_chat_graph, get_stored_context


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s - %(message)s"
)
logger = logging.getLogger("backend-app")

image = Image.debian_slim(python_version="3.12").pip_install(
    "supabase",
    "fastapi",
    "langchain",
    "langchain-openai",
    "langchain-anthropic",
    "langgraph",
    "langgraph-checkpoint-postgres",
    "psycopg[binary]"
).add_local_dir(".", remote_path="/root/src")

app = App("backend-app", 
          image=image)

def utcnow():
    return datetime.now(timezone.utc)

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
@fastapi_endpoint(method="POST")
def signup(data: Dict[str,str]) -> Dict[str, Any]: 
    logger.info(f"signup called for email={data.get('email')}")
    try:
        supabase_client = get_supabase_client()
        
        response = supabase_client.auth.sign_up(
            {
                "email": data["email"],
                "password": data["password"]
            }
        )
        return JSONResponse(
            content={
                "message": "Signup successful - check your email.",
                "user": {
                    "id": response.user.id,
                    "email": response.user.email
                },
                "requiresEmailConfirmation": True
            },
            status_code=200,
        )
    except Exception as e:
       handle_exception(e, "failed to sign up.")

@app.function(
    secrets=[Secret.from_name("supabase-secret")]
)
@fastapi_endpoint(method="POST")
def login(data: Dict[str,str]) -> Dict[str, Any]: 
    logger.info(f"login called for email={data.get('email')}")
    try:
        supabase_client = get_supabase_client()
        
        response = supabase_client.auth.sign_in_with_password(
            {
                "email": data["email"],
                "password": data["password"]
            }
        )
        return JSONResponse(
            content={
                "message": "Login successful!",
                "user": {
                    "id": response.user.id,
                    "email": response.user.email
                },
                "access_token": response.session.access_token,
                "refresh_token": response.session.refresh_token
            },
            status_code=200,
        )
    except Exception as e:
        handle_exception(e, "failed to log in.", status=401)

@app.function(
    secrets=[Secret.from_name("supabase-secret")]
)
@fastapi_endpoint(method="POST")
def refresh_token(data:dict[str,str]) -> Dict[str, Any]:
    logger.info("refresh_token called")
    try:
        supabase_client = get_supabase_client()
        
        response = supabase_client.auth.refresh_session(data["refresh_token"])
        return JSONResponse(
            content={
                "message": "Token refresh successful!",
                "user": {
                    "id": response.user.id,
                    "email": response.user.email
                },
                "access_token": response.session.access_token,
                "refresh_token": response.session.refresh_token,
            },
            status_code=200,
        )
    except Exception as e:
        handle_exception(e, "failed to refresh token.", status=401)


@app.function(
    secrets=[Secret.from_name("supabase-secret"),
             Secret.from_name("database_url"),
             Secret.from_name("llm")],
    timeout=300  # 5 minutes for LLM responses
)
@fastapi_endpoint(method="POST")
def chat_endpoint(data: Dict, user: Dict[str, Any] = Depends(verify_token)) -> Dict:
    """
    POST /chat - Chat with LLM (Claude or GPT)
    
    Request body:
    {
        "message": "Your question here",
        "user_id": "user-123",
        "session_id": "session-456",
        "model": "gpt"  // or "claude"
    }
    """
    message = data.get("message")
    model_type = data.get("model", "gpt").lower()
    session_id = data.get("session_id")
    user_id = data.get("user_id")
    verified_user_id = user.get("id")
    
    logger.info(f"chat_endpoint called for user={user_id} session={session_id} model={model_type}")
    
    # Validation
    if not user_id or verified_user_id != user_id:
        return JSONResponse(
            content={
                "error": "valid user_id is required",
                "status": "error",
            },
            status_code=400,
        )
    if not message:
        return JSONResponse(
            content={
                "error": "message is required",
                "status": "error",
            },
            status_code=400,
        )
    if not session_id:
        return JSONResponse(
            content={
                "error": "session_id is required",
                "status": "error",
            },
            status_code=400,
        )
    
    # Validate model type
    if model_type not in ["gpt", "claude"]:
        return JSONResponse(
            content={
                "error": "model must be 'gpt' or 'claude'",
                "status": "error"
            },
            status_code=400,
        )
    
    # Validate message length
    if len(message) > 10000:
        return JSONResponse(
            content={
                "error": "Message too long (max 10,000 characters)",
                "status": "error"
            },
            status_code=400,
        )
    
    db_uri = os.getenv("SUPABASE_DB_URL")
    if not db_uri:
        logger.error("SUPABASE_DB_URL environment variable not set")
        return JSONResponse(
            content={
                "error": "Database configuration error",
                "status": "error"
            },
            status_code=500,
        )
    
    try:
        config = {"configurable": {"thread_id": session_id, "user_id": user_id}}
        
        with (
             PostgresStore.from_conn_string(db_uri) as store,
             PostgresSaver.from_conn_string(db_uri) as checkpointer,
        ):
            # check for rate limit 
            rate_limit_items = list(store.search(("rate_limits",), filter={"user_id": user_id}))

            if rate_limit_items:
                rate_limit_data = rate_limit_items[0].value
                limit_expires_at = datetime.fromisoformat(rate_limit_data["expires_at"]).replace(tzinfo=timezone.utc)

                if utcnow() < limit_expires_at:
                    time_remaining = (limit_expires_at - utcnow()).total_seconds()
                    hours_remaining = int(time_remaining // 3600)
                    minutes_remaining = int((time_remaining % 3600) // 60)
                    return JSONResponse(
                        content={
                            "error": f"Rate limit exceeded. Try again in {hours_remaining} hours and {minutes_remaining} minutes.",
                            "status": "error",
                            "rate_limited": True,
                            "expires_at": limit_expires_at.isoformat(),
                            "conversation_length": rate_limit_data.get("conversation_length", 10)
                        },
                        status_code=429,
                    )
                else:
                    # Rate limit expired, remove it
                    store.delete(namespace=("rate_limits",), key=user_id)

            # Get top 3 most relevant past messages for context
            relevant_context = get_stored_context(db_uri, user_id, message, limit=3)
            
            # Optionally enhance message with context
            enhanced_message = message
            if relevant_context:
                context_str = "\n".join(f"- {ctx}" for ctx in relevant_context)
                logger.info(f"Found {len(relevant_context)} relevant context items for user {user_id}")
                
                enhanced_message = f"""Previous relevant context:
{context_str}

Current question: {message}"""
            
            input_state = {
                "messages": [HumanMessage(content=enhanced_message)],
                "model_type": model_type
            }
            
            compiled_graph = create_chat_graph().compile(
                checkpointer=checkpointer,
                store=store,  
            )
            
            result = compiled_graph.invoke(input_state, config)
            
            # Store the current message for future context retrieval
            store.put(
                namespace=(user_id,),
                key=str(uuid.uuid4()), 
                value={
                    "data": message,
                    "timestamp": utcnow().isoformat(),  # Changed to utcnow() for consistency
                    "session_id": session_id
                }
            )
            
            last_message = result["messages"][-1]
            conversation_length = len(result["messages"])

            rate_limited = False
            expires_at = None

            if conversation_length > 10:
                # Apply rate limit for 4 hour
                expires_at = (utcnow() + timedelta(hours=4)).isoformat()
                store.put(
                    namespace=("rate_limits",),
                    key=user_id,
                    value={
                        "user_id": user_id,
                        "conversation_length": conversation_length,
                        "expires_at": expires_at,
                        "set_at": utcnow().isoformat()
                    }
                )
                rate_limited = True 
            
            return JSONResponse(
                content={
                    "message": last_message.content,
                    "session_id": session_id,
                    "user_id": user_id,
                    "model": model_type,
                    "conversation_length": conversation_length,
                    "context_items_found": len(relevant_context),
                    "rate_limited": rate_limited,
                    "status": "success",
                    "expires_at": expires_at,
                },
                status_code=200,
            )
            
    except Exception as e:
        logger.error(f"Chat error: {str(e)}", exc_info=True)
        return JSONResponse(
            content={
                "error": "An error occurred during chat",
                "detail": str(e),
                "status": "error",
                "rate_limited": False,
            },
            status_code=500,
        )


@app.function(
    secrets=[
        Secret.from_name("supabase-secret"),
        Secret.from_name("database_url")],
    timeout=60
)
@fastapi_endpoint(method="DELETE")
def clear_history_endpoint(session_id: str, user=Depends(verify_token)):
    """
    DELETE /history - Clear conversation history for a session
    
    query_parameter 
    "session_id": "session-456"
    """
    user_id = user.get("id")

    # Log entry for debugging to ensure requests reach this function
    logger.info(f"clear_history_endpoint called for user={user_id} session_id={session_id}")
    
    if not session_id:
        return JSONResponse(
            content={
                "error":"session_id is required",
                "status": "error"},
            status_code=400)
    db_uri = os.getenv("SUPABASE_DB_URL")
    if not db_uri:
        logger.error("SUPABASE_DB_URL environment variable not set")
        return JSONResponse(
            content={
                "error":"Database configuration error",
                "status": "error"
            },
            status_code=500
        )
    try:
        with (
            PostgresStore.from_conn_string(db_uri) as store,
            PostgresSaver.from_conn_string(db_uri) as checkpointer
        ):
            rate_limit_items = list(store.search(("rate_limits",), filter={"user_id": user_id}))

            if rate_limit_items:
                rate_limit_data = rate_limit_items[0].value
                limit_expires_at = datetime.fromisoformat(rate_limit_data["expires_at"]).replace(tzinfo=timezone.utc)

                if utcnow() < limit_expires_at:
                    payload = {
                        "error": "Cannot clear history while rate limited.",
                        "status": "error",
                        "rate_limited": True,
                        "expires_at": limit_expires_at.isoformat(),
                    }
                    return JSONResponse(content=payload, status_code=429)
                else:
                    # Rate limit expired, remove it
                    store.delete(namespace=("rate_limits",), key=user_id)

            checkpointer.delete_thread(thread_id=session_id)
        
        return JSONResponse(
            content={
                "message": "Session history cleared",
                "session_id": session_id,
                "status": "success",
                "rate_limited": False,
            },
            status_code=200,
        )
        
    except Exception as e:
        logger.error(f"Clear history error: {str(e)}", exc_info=True)
        return JSONResponse(
            content={
                "error": "clear history error",
                "status": "error",
                "rate_limited": False
            },
            status_code=500
        )
    
@app.function(
    secrets=[
        Secret.from_name("supabase-secret"),
        Secret.from_name("database_url")],
    timeout=60
)
@fastapi_endpoint(method="DELETE")
def clear_user_data_endpoint(user_id: str, user=Depends(verify_token)):
    """
    DELETE /user_data - Remove all stored context for a user
    
    Request body:
    {
        "user_id": "user-123"
    }
    """
    logger.info(f"clear_user_data_endpoint called for user={user_id}")
    verified_user_id = user.get("id")
    if not user_id or user_id != verified_user_id:
        return JSONResponse(
            content={
                "error": "valid user_id is required",
                "status": "error"
            },
            status_code=400,
        )
    
    db_uri = os.getenv("SUPABASE_DB_URL")
    if not db_uri:
        logger.error("SUPABASE_DB_URL environment variable not set")
        return JSONResponse(
            content={
                "error": "Database configuration error",
                "status": "error"
            },
            status_code=500,
        )
    
    try:
        with PostgresStore.from_conn_string(db_uri) as store:
            # Get all items for user
            items = store.search((user_id,))
            
            # Delete each item
            deleted_count = 0
            for item in items:
                store.delete(namespace=(user_id,), key=item.key)
                deleted_count += 1
        
        return JSONResponse(
            content={
                "message": f"Cleared {deleted_count} stored items for user",
                "user_id": user_id,
                "deleted_count": deleted_count,
                "status": "success"
            },
            status_code=200,
        )
        
    except Exception as e:
        logger.error(f"Clear user data error: {str(e)}", exc_info=True)
        return JSONResponse(
            content={
                "error": str(e),
                "status": "error"
            },
            status_code=500,
        )
