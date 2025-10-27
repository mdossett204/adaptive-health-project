import modal
import os
from supabase import create_client, Client

# Modal app
app = modal.App("adaptive-health")

# Define image with dependencies
image = modal.Image.debian_slim().pip_install(
    "supabase",
    "python-dotenv"
)

# Supabase client initialization
def get_supabase() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_API_KEY")
    return create_client(url, key)

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("supabase-secrets")]
)
@modal.web_endpoint(method="POST")
def process_message(data: dict):
    """Simple endpoint that processes a message"""
    
    # Get message from request
    message = data.get("message", "")
    
    # Example: Use Supabase
    supabase = get_supabase()
    
    # Simple processing
    result = f"Processed: {message}"
    
    # Could save to Supabase here
    # supabase.table('health_records').insert({...}).execute()
    
    return {"result": result, "status": "success"}

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("supabase-secrets")]
)
@modal.web_endpoint(method="GET")
def health_check():
    """Health check endpoint"""
    return {"status": "healthy"}

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("supabase-secrets")]
)
@modal.web_endpoint(method="GET")
def get_fake_data(client):
    """Get all fake data from Supabase"""
    
    
    response = client.table('fake_data').select("*").execute()
    
    return {
        "data": response.data,
        "count": len(response.data)
    }