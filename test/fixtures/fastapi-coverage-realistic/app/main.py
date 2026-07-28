from fastapi import Depends, FastAPI, Header, HTTPException
from sqlalchemy.orm import Session

from .db import get_db, init_db
from .models import (
    Booking,
    BookingRequest,
    BookingResponse,
    OutboxEntry,
    Slot,
    SlotResponse,
)

app = FastAPI(title="Realistic Coverage")


@app.on_event("startup")
def startup():
    init_db()


def queue_notification(db: Session, kind: str, recipient: str, payload: str) -> None:
    db.add(OutboxEntry(kind=kind, recipient=recipient, payload=payload))


@app.get("/api/slots", response_model=list[SlotResponse])
def list_slots(db: Session = Depends(get_db)):
    return db.query(Slot).all()


@app.post("/api/bookings", response_model=BookingResponse, status_code=201)
def book_slot(request: BookingRequest, db: Session = Depends(get_db)):
    slot = db.get(Slot, request.slot_id)
    if slot is None:
        raise HTTPException(status_code=404, detail="slot not found")
    if not slot.available:
        raise HTTPException(status_code=409, detail="slot is not available")
    slot.available = False
    booking = Booking(slot_id=slot.id, member_email=request.member_email)
    db.add(booking)
    db.flush()
    queue_notification(db, "booking_created", request.member_email, f"booked slot {slot.id}")
    db.commit()
    return BookingResponse(id=booking.id, slot_id=booking.slot_id, member_email=booking.member_email)


@app.post("/api/bookings/{booking_id}/cancel", response_model=BookingResponse)
def cancel_booking(
    booking_id: int,
    x_member_email: str | None = Header(default=None),
    x_admin: str | None = Header(default=None),
    db: Session = Depends(get_db),
):
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="booking not found")
    is_admin = (x_admin or "").lower() == "true"
    if not is_admin and booking.member_email != x_member_email:
        raise HTTPException(status_code=403, detail="not allowed to cancel this booking")
    slot = db.get(Slot, booking.slot_id)
    slot.available = True
    queue_notification(db, "booking_cancelled", booking.member_email, f"cancelled booking {booking.id}")
    response = BookingResponse(id=booking.id, slot_id=booking.slot_id, member_email=booking.member_email)
    db.delete(booking)
    db.commit()
    return response
