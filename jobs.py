import threading
import uuid
from collections.abc import Callable
from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

executor = ThreadPoolExecutor(max_workers=1) # the server will only ever run
                                             # locally and we don't expect to
                                             # need multiple concurrent jobs.

class JobMeta:
    def __init__(self):
        self._lock = threading.Lock()
        self._data: dict[str, Any] = {}

    def update(self, **kwargs: Any) -> None:
        with self._lock:
            self._data.update(kwargs)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return dict(self._data)

@dataclass
class Job:
    future: Future
    meta: JobMeta

jobs: dict[str, Job] = {}
jobs_lock = threading.Lock()

class JobStatus(StrEnum):
    NOT_FOUND = "not found"
    RUNNING   = "not finished"
    ERROR     = "errored"
    FINISHED  = "finished"


def start_job(fn: Callable, *args: Any) -> str:
    """Defer a function call to a worker. `fn` MUST accept kwargs.

    Injects `job_meta` (:class:`JobMeta`) as a keyword argument. The function
    may use its `update` method to track its progress.

    Returns:
        The job ID to poll for results/errors.
    """
    job_id = str(uuid.uuid4())
    meta = JobMeta()
    future = executor.submit(fn, *args, job_meta=meta)
    with jobs_lock:
        jobs[job_id] = Job(future, meta)
    return job_id


def get_job_status(
        job_id: str
        ) -> tuple[JobStatus, dict[str, Any], Exception | Any | None]:
    """Used for polling a job's status and result.

    Returns:
        A tuple of the job's status, its `meta` dictionary and its result or\
        exception (if already finished).
    """
    with jobs_lock:
        job = jobs.get(job_id)

    # unknown job
    if job is None:
        return JobStatus.NOT_FOUND, {}, None

    # job hasn't completed yet, successfully or otherwise
    if not job.future.done():
        return JobStatus.RUNNING, job.meta.snapshot(), None

    # the job isn't running anymore -> remove it from the registry
    jobs.pop(job_id)

    # Fuck.
    exc = job.future.exception()
    if exc is not None:
        return JobStatus.ERROR, job.meta.snapshot(), exc

    # job most likely succeeded
    return JobStatus.FINISHED, job.meta.snapshot(), job.future.result()
