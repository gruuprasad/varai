from fastapi import HTTPException


def get_ctx(job_id):
    return {"job_id": job_id}


def _load_item(ctx):
    document = read_from_disk(ctx)
    return document


def assert_revision(document, base):
    if document is None:
        raise HTTPException(status_code=409, detail="conflict")


def persist_document(document):
    _atomic_json_dump(document, "item.json")


def push_undo_snapshot(document):
    save_snapshot(document)


def apply_mutation(ctx, document, base, fn):
    assert_revision(document, base)
    persist_document(document)
    push_undo_snapshot(document)
    return document
