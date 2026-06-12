import os

from dotenv import load_dotenv
from langchain_community.document_loaders import TextLoader
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import Chroma

load_dotenv()

os.makedirs("rag_db", exist_ok=True)

embeddings = OpenAIEmbeddings(
    model="openai/text-embedding-3-small",
    api_key=os.getenv("OPENROUTER_API_KEY"),
    check_embedding_ctx_length=False,
    base_url="https://openrouter.ai/api/v1"
)

rag_store = Chroma(
    persist_directory="rag_db",
    embedding_function=embeddings
)


def add_document(file_path: str, user_id: str) -> None:
    loader = TextLoader(file_path, encoding="utf-8")
    docs = loader.load()

    texts = [doc.page_content for doc in docs]
    metadatas = [{"user_id": user_id, "source": file_path} for _ in texts]

    try:
        rag_store.add_texts(texts=texts, metadatas=metadatas)
    except Exception:
        pass


def query_document(user_id: str, query: str, k: int = 3) -> str:
    try:
        docs = rag_store.similarity_search(
            query,
            k=k,
            filter={"user_id": user_id}
        )
        return "\n".join([doc.page_content for doc in docs])
    except Exception:
        return ""