"""Typed request contracts for the Gate 2 capability fixture."""

from pydantic import BaseModel


class SubmitRequest(BaseModel):
    amount: int
    description: str
    reference: str | None = None


class MutationResponse(BaseModel):
    state: str
    request_id: int
