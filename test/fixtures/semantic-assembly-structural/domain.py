class JobContext:
    pass


class BuildingModelDocument:
    pass


def load_context(job_id):
    return JobContext()


def ensure_document(ctx):
    # Unannotated wrapper: the only proof of the subject is the constructed return.
    return BuildingModelDocument()


def update_structural_type(document):
    # The real domain mutation. Reached only as a callable value.
    return document


def preview_structural_type(document):
    return document


def run_operation(ctx, document, callback):
    # Neutral name: not a mutation by itself. Applies the callback to the aggregate.
    return callback(document)


def perform(ctx, document, operation):
    # Higher-order: the mutation is passed in as a value and closed over.
    def callback(current_document):
        return operation(current_document)

    return run_operation(ctx, document, callback)
