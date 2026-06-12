import os
from datetime import datetime

from dotenv import load_dotenv
from langchain.tools import tool
from tavily import TavilyClient

load_dotenv()

tavily_api_key = os.getenv("TAVILY_API_KEY")
tavily = TavilyClient(api_key=tavily_api_key) if tavily_api_key else None


@tool
def calculator(expression: str) -> str:
    """Use this tool for mathematical calculations like addition, subtraction, multiplication, division."""
    try:
        return str(eval(expression))
    except Exception:
        return "Invalid calculation"


@tool
def current_time(_: str = "") -> str:
    """Use this tool when the user asks for the current time or date."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@tool
def web_search(query: str) -> str:
    """Use this tool for real-time web search and fresh information."""
    if not tavily:
        return "TAVILY_API_KEY is missing."

    try:
        results = tavily.search(query=query, max_results=3)
        items = results.get("results", [])

        if not items:
            return "No search results found."

        parts = []
        for item in items:
            title = item.get("title", "No title")
            content = item.get("content", "No content")
            url = item.get("url", "")
            parts.append(f"Title: {title}\nContent: {content}\nURL: {url}")

        return "\n\n".join(parts)
    except Exception as e:
        return f"Search error: {str(e)}"