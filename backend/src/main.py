from modal import App, web_endpoint, Secret, Image
import os 
from supabase import create_client, Client

image = Image.debian_slim(python_version="3.12").pip_install(
    "supabase",
    "fastapi"
)

app = App("backend-app", image=image)



def get_supabase_client() -> Client:
    url = os.environ["SUPABASE_URL"]
    key = os.environ["SUPABASE_API_KEY"]
    return create_client(url, key)

@app.function(
    secrets=[Secret.from_name("supabase-secret")]
)
@web_endpoint(method="POST")
def create_item(item: dict):
    try:
        supabase_client = get_supabase_client()
        result = supabase_client.table("items").insert(item).execute()
        return {"success": True, "data": result.data}
    except Exception as exc:
        return {"success": False, "error": str(exc)}, 400 

@app.function(
    secrets=[Secret.from_name("supabase-secret")]
)
@web_endpoint(method="GET")
def get_items():
    """Example: Get all items from Supabase"""
    try:
        supabase_client = get_supabase_client()
        result = supabase_client.table("items").select("*").execute()
        return {"success": True, "data": result.data}
    except Exception as e:
        return {"success": False, "error": str(e)}, 400
