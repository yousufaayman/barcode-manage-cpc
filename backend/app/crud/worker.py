from sqlalchemy.orm import Session
from .. import models, schemas


def get_workers(db: Session, skip: int = 0, limit: int = 500, active_only: bool = False):
    q = db.query(models.Worker).order_by(models.Worker.worker_id.asc())
    if active_only:
        q = q.filter(models.Worker.active.is_(True))
    return q.offset(skip).limit(limit).all()


def get_worker_by_id(db: Session, worker_id: int):
    return db.query(models.Worker).filter(models.Worker.worker_id == worker_id).first()


def create_worker(db: Session, worker: schemas.WorkerCreate):
    kwargs = dict(
        worker_name=worker.worker_name,
        active=worker.active,
    )
    if getattr(worker, "worker_group_id", None) is not None:
        kwargs["worker_group_id"] = worker.worker_group_id
    if worker.worker_id is not None:
        kwargs["worker_id"] = worker.worker_id
    db_worker = models.Worker(**kwargs)
    db.add(db_worker)
    db.commit()
    db.refresh(db_worker)
    return db_worker


def update_worker(
    db: Session,
    worker_id: int,
    worker_in: schemas.WorkerUpdate,
):
    db_worker = get_worker_by_id(db, worker_id)
    if not db_worker:
        return None

    if worker_in.worker_name is not None:
        db_worker.worker_name = worker_in.worker_name
    if worker_in.active is not None:
        db_worker.active = worker_in.active
    if worker_in.worker_group_id is not None:
        db_worker.worker_group_id = worker_in.worker_group_id

    db.commit()
    db.refresh(db_worker)
    return db_worker
