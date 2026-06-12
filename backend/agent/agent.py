import os
from langchain.agents import create_agent
from langchain_openai import ChatOpenAI

from agent.memory import get_recent_history, get_semantic_memory, save_message
from agent.rag import query_document
from agent.tools import calculator, current_time, web_search

llm = ChatOpenAI(
    model="meta-llama/llama-3.3-70b-instruct",
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1"
)

tools = [calculator, current_time, web_search]

agent = create_agent(
    model=llm,
    tools=tools,
    system_prompt=(
        "You are Chatly, a production-grade AI assistant. "
        "Be accurate, structured, and use tools when needed."
    ),
)


def run_agent(user_input: str, user_id: str) -> str:
    recent_history = get_recent_history(user_id, limit=8)
    semantic_memory = get_semantic_memory(user_id, user_input, k=4)
    rag_context = query_document(user_id, user_input, k=3)

    messages = []

    for item in recent_history:
        role = "user" if item["role"] == "user" else "assistant"
        messages.append({"role": role, "content": item["content"]})

    messages.append(
        {
            "role": "user",
            "content": (
                f"Semantic Memory:\n{semantic_memory or 'No semantic memory found.'}\n\n"
                f"Document Context:\n{rag_context or 'No relevant document context found.'}\n\n"
                f"User Request:\n{user_input}"
            ),
        }
    )

    result = agent.invoke({"messages": messages})

    output = result["messages"][-1].content if result.get("messages") else "No response generated."

    if isinstance(output, list):
        parts = []
        for block in output:
            if isinstance(block, dict):
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        output = "".join(parts)
    elif not isinstance(output, str):
        output = str(output)

    save_message(user_id, "user", user_input)
    save_message(user_id, "assistant", output)

    return output