import sqlite3
import os
from dotenv import load_dotenv
from langchain_openai import OpenAIEmbeddings
from langchain_chroma import Chroma

load_dotenv()

chat_conn = sqlite3.connect("chat_history.db")
chat_cursor = chat_conn.cursor()
chat_cursor.execute("""
CREATE TABLE IF NOT EXISTS chat_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL
)
""")
chat_conn.commit()
chat_conn.close()

embeddings = OpenAIEmbeddings(
    model="openai/text-embedding-3-small",
    api_key=os.getenv("OPENROUTER_API_KEY"),
    check_embedding_ctx_length=False,
    base_url="https://openrouter.ai/api/v1"
)

vector_store = Chroma(
    persist_directory="chroma_db",
    embedding_function=embeddings
)


def save_message(user_id: str, role: str, content) -> None:
    if isinstance(content, list):
        parts = []
        for block in content:
            if isinstance(block, dict):
                parts.append(block.get("text", ""))
            elif isinstance(block, str):
                parts.append(block)
        content = "".join(parts)
    elif not isinstance(content, str):
        content = str(content)

    with sqlite3.connect("chat_history.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO chat_history (user_id, role, content) VALUES (?, ?, ?)",
            (user_id, role, content)
        )
        conn.commit()

    try:
        vector_store.add_texts(
            texts=[content],
            metadatas=[{"user_id": user_id, "role": role}]
        )
    except Exception:
        pass


def get_recent_history(user_id: str, limit: int = 8) -> list[dict]:
    with sqlite3.connect("chat_history.db", timeout=10.0) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            SELECT role, content
            FROM chat_history
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (user_id, limit)
        )
        rows = cursor.fetchall()
    
    rows.reverse()
    return [{"role": role, "content": content} for role, content in rows]


def get_semantic_memory(user_id: str, query: str, k: int = 4) -> str:
    try:
        docs = vector_store.similarity_search(
            query,
            k=k,
            filter={"user_id": user_id}
        )
        return "\n".join([doc.page_content for doc in docs])
    except Exception:
        return ""