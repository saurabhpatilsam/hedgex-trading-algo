from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from database import get_db
from models import Account, Group, GroupMembership, PotType
from schemas import (
    GroupCreate,
    GroupMembershipCreate,
    GroupMembershipResponse,
    GroupResponse,
    GroupUpdate,
)

router = APIRouter(prefix="/api/groups", tags=["groups"])


def _group_response(group: Group) -> dict:
    """Build GroupResponse manually to properly serialize memberships."""
    members = [
        GroupMembershipResponse.from_membership(m) for m in group.memberships
    ]
    return GroupResponse(
        id=group.id,
        name=group.name,
        is_active=group.is_active,
        created_at=group.created_at,
        members=members,
    )


@router.get("/")
def list_groups(db: Session = Depends(get_db)):
    groups = (
        db.query(Group)
        .options(joinedload(Group.memberships).joinedload(GroupMembership.account))
        .all()
    )
    return [_group_response(g) for g in groups]


@router.get("/{group_id}")
def get_group(group_id: int, db: Session = Depends(get_db)):
    group = (
        db.query(Group)
        .options(joinedload(Group.memberships).joinedload(GroupMembership.account))
        .filter(Group.id == group_id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return _group_response(group)


@router.post("/")
def create_group(payload: GroupCreate, db: Session = Depends(get_db)):
    existing = db.query(Group).filter(Group.name == payload.name).first()
    if existing:
        raise HTTPException(
            status_code=400, detail=f"Group '{payload.name}' already exists"
        )
    group = Group(name=payload.name)
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_response(group)


@router.put("/{group_id}")
def update_group(group_id: int, payload: GroupUpdate, db: Session = Depends(get_db)):
    group = (
        db.query(Group)
        .options(joinedload(Group.memberships).joinedload(GroupMembership.account))
        .filter(Group.id == group_id)
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(group, key, value)
    db.commit()
    db.refresh(group)
    return _group_response(group)


@router.delete("/{group_id}", status_code=204)
def delete_group(group_id: int, db: Session = Depends(get_db)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    db.delete(group)  # cascade deletes memberships
    db.commit()


@router.post("/{group_id}/members")
def add_member(
    group_id: int,
    payload: GroupMembershipCreate,
    db: Session = Depends(get_db),
):
    """Add an account to a group with a specific pot assignment."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    account = db.query(Account).filter(Account.id == payload.account_id).first()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    # Check if already a member of this group
    existing = (
        db.query(GroupMembership)
        .filter(
            GroupMembership.group_id == group_id,
            GroupMembership.account_id == payload.account_id,
        )
        .first()
    )
    if existing:
        # Update the pot assignment
        existing.pot = PotType(payload.pot)
        db.commit()
    else:
        membership = GroupMembership(
            group_id=group_id,
            account_id=payload.account_id,
            pot=PotType(payload.pot),
        )
        db.add(membership)
        db.commit()

    # Return updated group
    group = (
        db.query(Group)
        .options(joinedload(Group.memberships).joinedload(GroupMembership.account))
        .filter(Group.id == group_id)
        .first()
    )
    return _group_response(group)


@router.delete("/{group_id}/members/{account_id}")
def remove_member(
    group_id: int, account_id: int, db: Session = Depends(get_db)
):
    """Remove an account from a group."""
    membership = (
        db.query(GroupMembership)
        .filter(
            GroupMembership.group_id == group_id,
            GroupMembership.account_id == account_id,
        )
        .first()
    )
    if not membership:
        raise HTTPException(
            status_code=404, detail="Account not found in this group"
        )
    db.delete(membership)
    db.commit()

    # Return updated group
    group = (
        db.query(Group)
        .options(joinedload(Group.memberships).joinedload(GroupMembership.account))
        .filter(Group.id == group_id)
        .first()
    )
    return _group_response(group)
