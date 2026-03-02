# User & Account Management Update (v2)

## Changes Implemented

### 1. Broker Credentials & Status
- **Status Field**: Added `is_active` boolean to `BrokerCredential` model.
- **UI Update**: 
  - Credential cards now show a **Status Dot** (Green for Active, Grey for Inactive).
  - Added **Toggle Button** (Play/Pause icon) to quickly change status.
  - Added **Edit Button** (Pencil) to modify login, password, and status.

### 2. Simplified Accounts View
- **Columns Removed**: Broker, Platform, and Account Status columns removed from the Accounts table as requested.
- **Columns Kept**: 
  - **Name**: To identify the account.
  - **Account #**: To verify the ID.
  - **Actions**: Edit/Delete buttons.
- **Auto-Sync Logic**: 
  - Broker and Platform are now inferred from the User context or Credential context (though multiple brokers per user are supported).

### 3. Backend Updates
- `routers/users.py`: Updated to handle `is_active` field in credential creation and updates.
- `models.py`: Added `is_active` column to `BrokerCredential`.
- `schemas.py`: Updated Pydantic models.

## How to Test
1. **Add User**: Create a new user.
2. **Add Credential**: Add a credential (e.g. Apex).
3. **Toggle Status**: Click the Play/Pause button on the card.
4. **Edit Credential**: Click Pencil icon, change Login ID or Status.
5. **Add Account**: Create an account. Verify the table is clean (Name + Acct # only).
