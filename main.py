import os
import uuid
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.types import Command
from database import seed_db
from graph import build_graph
from schemas import CustomerRequest, ReviewRequest

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.getenv('GROQ_API_KEY'):
        raise RuntimeError('Set GROQ_API_KEY in .env before starting.')
    seed_db()
    app.state.graph = build_graph(InMemorySaver())
    yield


app = FastAPI(title='LangGraph Refund Agent', lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=['http://localhost:5173', 'http://127.0.0.1:5173', 'null'],
    allow_credentials=True,
    allow_methods=['*'],
    allow_headers=['*'],
)


def format_result(graph, thread_id, result):
    snapshot = graph.get_state({'configurable': {'thread_id': thread_id}})
    interrupts = [i.value for i in result.get('__interrupt__', ())]
    return {'thread_id': thread_id, 'status': 'awaiting_approval' if interrupts else 'completed',
            'interrupts': interrupts, 'decision': snapshot.values.get('decision'),
            'response': snapshot.values.get('response') if not interrupts else None}


@app.post('/support')
def support(body: CustomerRequest):
    graph = app.state.graph
    config = {'configurable': {'thread_id': body.thread_id}}
    existing = graph.get_state(config)
    if existing.values:
        raise HTTPException(409, 'Thread already exists. Use a new thread_id for a new request.')
    result = graph.invoke({'message': body.message, 'request_id': str(uuid.uuid4())}, config=config)
    return format_result(graph, body.thread_id, result)


@app.post('/review/{thread_id}')
def review(thread_id: str, body: ReviewRequest):
    graph = app.state.graph
    config = {'configurable': {'thread_id': thread_id}}
    snapshot = graph.get_state(config)
    if not snapshot.next or 'human_review' not in snapshot.next:
        raise HTTPException(409, 'No pending human review for this thread.')
    result = graph.invoke(Command(resume={'approved': body.approved}), config=config)
    return format_result(graph, thread_id, result)


@app.get('/health')
def health():
    return {'status': 'ok'}
