"""Minimal purchase-approvals FastAPI app for independent scenario runtime proof.

Faults (VARAI_POC_FAULT):
  invert_auth  — non-owner withdraw succeeds
  corrupt_deny — non-owner withdraw returns 403 after mutating state
  omit_audit   — decisions do not write audit entries
"""

from __future__ import annotations

import os
import uuid
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

FAULT = os.environ.get("VARAI_POC_FAULT", "").strip()

app = FastAPI(title="Purchase Approval Runtime Fixture")

# In-memory store. Reset on process start — one runner process per verify run.
REQUESTS: dict[str, dict[str, Any]] = {}
AUDIT: dict[str, list[dict[str, Any]]] = {}


def _users() -> dict[str, dict[str, str]]:
  mapping = {}
  for env_name, user_id in (
    ("VARAI_POC_EMPLOYEE_1_TOKEN", "emp-1"),
    ("VARAI_POC_EMPLOYEE_2_TOKEN", "emp-2"),
    ("VARAI_POC_MANAGER_TOKEN", "mgr-1"),
  ):
    token = os.environ.get(env_name)
    if token:
      mapping[token] = {"id": user_id, "actor": "employee" if user_id.startswith("emp") else "manager"}
  return mapping


def current_user(authorization: str | None) -> dict[str, str]:
  if not authorization or not authorization.lower().startswith("bearer "):
    raise HTTPException(status_code=401, detail="missing bearer token")
  token = authorization.split(" ", 1)[1].strip()
  user = _users().get(token)
  if not user:
    raise HTTPException(status_code=401, detail="unknown token")
  return user


def write_audit(request_id: str, decision: str, actor_id: str) -> None:
  if FAULT == "omit_audit":
    return
  AUDIT.setdefault(request_id, []).append({
    "decision": decision,
    "actorId": actor_id,
  })


class SubmitBody(BaseModel):
  amount: float
  description: str = Field(default="")


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok"}


@app.post("/api/purchase-requests", status_code=201)
def submit_request(
  body: SubmitBody,
  authorization: str | None = Header(default=None),
) -> dict[str, Any]:
  user = current_user(authorization)
  request_id = str(uuid.uuid4())
  record = {
    "id": request_id,
    "amount": body.amount,
    "description": body.description,
    "state": "pending",
    "ownerId": user["id"],
    "purchaseOrder": None,
  }
  REQUESTS[request_id] = record
  return dict(record)


@app.get("/api/purchase-requests/{request_id}")
def get_request(
  request_id: str,
  authorization: str | None = Header(default=None),
) -> dict[str, Any]:
  current_user(authorization)
  record = REQUESTS.get(request_id)
  if not record:
    raise HTTPException(status_code=404, detail="not found")
  return dict(record)


@app.post("/api/purchase-requests/{request_id}/withdraw")
def withdraw_request(
  request_id: str,
  authorization: str | None = Header(default=None),
) -> dict[str, Any]:
  user = current_user(authorization)
  record = REQUESTS.get(request_id)
  if not record:
    raise HTTPException(status_code=404, detail="not found")
  if record["state"] != "pending":
    raise HTTPException(status_code=409, detail="not pending")

  is_owner = record["ownerId"] == user["id"]
  if not is_owner:
    if FAULT == "invert_auth":
      record["state"] = "withdrawn"
      write_audit(request_id, "withdrawn", user["id"])
      return dict(record)
    if FAULT == "corrupt_deny":
      record["state"] = "withdrawn"
      write_audit(request_id, "withdrawn", user["id"])
      raise HTTPException(status_code=403, detail="not allowed")
    raise HTTPException(status_code=403, detail="not allowed")

  record["state"] = "withdrawn"
  write_audit(request_id, "withdrawn", user["id"])
  return dict(record)


@app.get("/api/purchase-requests/{request_id}/audit")
def list_audit(
  request_id: str,
  authorization: str | None = Header(default=None),
) -> dict[str, Any]:
  current_user(authorization)
  if request_id not in REQUESTS:
    raise HTTPException(status_code=404, detail="not found")
  return {"entries": list(AUDIT.get(request_id, []))}
