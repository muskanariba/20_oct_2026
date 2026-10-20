# LangGraph Customer Support & Refund Agent — CSV Edition

Uses **Groq + LangGraph + FastAPI**, with `data/orders.csv` for orders and `data/refunds.csv` for a demo refund ledger. **No SQLite.**

## Windows PowerShell setup

```powershell
py -3.11 -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
```

Edit `.env` and set `GROQ_API_KEY`. Run:

```powershell
uvicorn main:app --reload
```

Open http://127.0.0.1:8000/docs.

## Examples

POST `/support`:

```json
{"thread_id":"demo-1","message":"Please refund ORD-1002"}
```

`ORD-1002` costs $120 and triggers human approval. Resume by POSTing to `/review/demo-1`:

```json
{"approved":true}
```

Other scenarios: `ORD-1001` ($75, auto-approved); `ORD-1003` ($350, human review); `ORD-1004` (expired refund window); `ORD-1005` (already refunded). Use a new `thread_id` per request.

## Data files

On first server startup, the project automatically creates 20 demo orders in `data/orders.csv` and an empty `data/refunds.csv`. Subsequent startups preserve edits and refunds. To reset, stop the server, delete the two CSV files, and restart.

## Important limitations

- LangGraph uses `InMemorySaver` for checkpoints: **pending approvals are lost on server restart**. CSV data remains.
- CSV writes are protected by a Python thread lock only within a single process. Run one server worker; do not edit the CSV while the server is running.
- CSV storage is educational and is **not transactional** across multiple files. A crash between writing the refund ledger and updating the order may leave inconsistent records, though the ledger helps block duplicate refunds.
- The demo only records refunds locally. No real payments are made.
- The review endpoint has no authentication; add it before any deployment.


## UI dashboard

A ready-to-run responsive dashboard is included in the `ui/` folder. It uses plain HTML, CSS, and JavaScript (no Node/npm install required).

1. Start the API from this project folder: `uvicorn main:app --reload`
2. Ensure `.env` contains a valid `GROQ_API_KEY`.
3. Open `ui/index.html` in your browser. If your browser blocks requests from a local file, serve the UI from this project folder with `python -m http.server 5173 --directory ui` and open `http://localhost:5173`.
4. Keep the API running at `http://localhost:8000` (or update the Base URL field in the dashboard).

The dashboard supports API health status, refund request submission, request history for the current page session, and approve/reject actions for requests waiting on human review. The API's `/support` endpoint requires both `message` and a unique `thread_id`; the UI generates one automatically.
