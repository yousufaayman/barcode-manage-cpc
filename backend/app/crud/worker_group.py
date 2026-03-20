from sqlalchemy.orm import Session

from .. import models, schemas


def get_worker_groups(db: Session, skip: int = 0, limit: int = 500):
    return (
        db.query(models.WorkersGroup)
        .order_by(models.WorkersGroup.group_id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def get_worker_group_by_id(db: Session, group_id: int):
    return (
        db.query(models.WorkersGroup)
        .filter(models.WorkersGroup.group_id == group_id)
        .first()
    )


def create_worker_group(db: Session, group: schemas.WorkerGroupCreate):
    db_group = models.WorkersGroup(
        group_name=group.group_name,
        working_hours=group.working_hours,
    )
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group


def update_worker_group(
    db: Session,
    group_id: int,
    group_in: schemas.WorkerGroupUpdate,
):
    db_group = get_worker_group_by_id(db, group_id)
    if not db_group:
        return None

    if group_in.group_name is not None:
        db_group.group_name = group_in.group_name
    if group_in.working_hours is not None:
        db_group.working_hours = group_in.working_hours

    db.commit()
    db.refresh(db_group)
    return db_group

