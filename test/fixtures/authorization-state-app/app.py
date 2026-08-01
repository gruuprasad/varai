"""Gate 2 capability fixture: authorization guards, state transitions,
outbox / external-HTTP emissions, and typed request contracts — the bounded
FastAPI slice that api.authorization, application.state, the emits effect
library, and data.contract qualifiers are proven against.
"""

from fastapi import Depends, FastAPI, HTTPException

from schemas import MutationResponse, SubmitRequest

app = FastAPI()


class PurchaseRequest:
    def __init__(self, request_id, amount, state="pending"):
        self.request_id = request_id
        self.amount = amount
        self.state = state


class OutboxEvent:
    def __init__(self, event_type, request_id):
        self.event_type = event_type
        self.request_id = request_id


REQUESTS = {}
OUTBOX = []
session = {}


def get_credentials():
    return {"user": "employee-1", "role": "employee"}


def current_user(credentials: dict = Depends(get_credentials)) -> dict:
    return credentials


def require_role(role: str):
    def gate(credentials: dict = Depends(get_credentials)) -> dict:
        if credentials["role"] != role:
            raise HTTPException(status_code=403, detail="role required")
        return credentials

    return gate


def find_request(request_id: int) -> PurchaseRequest:
    return REQUESTS[request_id]


def create_purchase(amount):
    # Constructors live inside helpers so handler bodies stay fully resolvable.
    return PurchaseRequest(len(REQUESTS) + 1, amount)


def record_event(event_type, request_id):
    OUTBOX.append(OutboxEvent(event_type, request_id))


@app.post("/api/purchase-requests", status_code=201)
def submit_request(request: SubmitRequest, credentials: dict = Depends(current_user)):
    purchase = create_purchase(request.amount)
    session.add(purchase)
    record_event("request.submitted", purchase.request_id)
    return {"id": purchase.request_id}


@app.post("/api/purchase-requests/{request_id}/withdraw", response_model=MutationResponse)
def withdraw_request(request_id: int, credentials: dict = Depends(current_user)):
    request = find_request(request_id)
    if request.state != "pending":
        raise HTTPException(status_code=409, detail="request is not pending")
    request.state = "withdrawn"
    record_event("request.withdrawn", request_id)
    return {"state": "withdrawn", "request_id": request_id}


@app.post("/api/purchase-requests/{request_id}/approve", response_model=MutationResponse)
def approve_request(request_id: int, credentials: dict = Depends(require_role("manager"))):
    request = find_request(request_id)
    if request.state != "pending":
        raise HTTPException(status_code=409, detail="request is not pending")
    request.state = "approved"
    httpx_post(request_id)
    return {"state": "approved", "request_id": request_id}


@app.post("/api/purchase-requests/{request_id}/cancel")
def cancel_request(request_id: int, credentials: dict = Depends(current_user)):
    request = find_request(request_id)
    request.state = "cancelled"
    return {"state": "cancelled"}


@app.get("/api/purchase-requests/{request_id}")
def get_request(request_id: int, credentials: dict = Depends(current_user)):
    return find_request(request_id)


def httpx_post(request_id):
    # External HTTP emission: recognized receiver + verb -> emits claim.
    import httpx

    httpx.post("https://orders.example.com/orders", json={"request_id": request_id})
