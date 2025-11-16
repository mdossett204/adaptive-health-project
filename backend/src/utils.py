import os 

from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langgraph.graph import StateGraph, MessagesState, END
from langgraph.store.postgres import PostgresStore

class ChatState(MessagesState):
    model_type: str

def route_model(state: ChatState) -> str:
    """Route to appropriate model based on selection"""
    if "claude" == state["model_type"].lower():
        return "claude_chat"
    return "gpt_chat"

def gpt_chat_node(state: ChatState) -> ChatState:
    """Handle GPT model calls"""
    model_name = "gpt-4o-mini"
    llm = ChatOpenAI(
        model=model_name, 
        temperature=0.0, 
        api_key=os.environ["OPENAI_API_KEY"]
    )
    
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def claude_chat_node(state: ChatState) -> ChatState:
    """Handle Claude model calls"""
    model_name = "claude-3-5-haiku-latest"
    llm = ChatAnthropic(
        model=model_name, 
        temperature=0.0, 
        api_key=os.environ["CLAUDE_API_KEY"]
    )
    response = llm.invoke(state["messages"])
    return {"messages": [response]}

def create_chat_graph() -> StateGraph:
    """Create the LangGraph workflow"""
    workflow = StateGraph(ChatState)
    
    # Add nodes
    workflow.add_node("gpt_chat", gpt_chat_node)
    workflow.add_node("claude_chat", claude_chat_node)
    
    # Set entry point with conditional routing
    workflow.set_conditional_entry_point(
        route_model,
        {
            "gpt_chat": "gpt_chat",
            "claude_chat": "claude_chat"
        }
    )
    
    # Both end after processing
    workflow.add_edge("gpt_chat", END)
    workflow.add_edge("claude_chat", END)
    
    return workflow

def get_stored_context(db_uri: str, user_id: str, query: str, limit: int = 3) -> list:
    """
    Helper function to get relevant context from store
    Returns list of relevant past messages
    """
    try:
        with PostgresStore.from_conn_string(db_uri) as store:
            store_history = store.search(
                (user_id,), 
                query=query, 
                limit=limit
            )
            return [item.value["data"] for item in store_history]
    except Exception as e:
        print(f"Context retrieval failed: {e}")
        return []