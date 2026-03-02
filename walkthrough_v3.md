# User & Account Management Architecture (v3)

## Hierarchical Structure
The system now follows a strict hierarchy for account management:
1. **User**: The top-level entity (e.g., "Saurabh").
2. **Broker Account (Credential)**: A connection to a specific broker (e.g., Apex, TakeProfitTrader) with a unique Login ID and Password.
3. **Sub-Accounts**: Individual trading accounts (e.g., "Apex-01", "PA-005") that belong to a specific Broker Account.

## Key Changes
- **"Add Account" Button**: Located on the User card, this now adds a **Broker Connection** (Credential).
- **"Add Sub-Account" Button**: Located inside the Broker card, this adds individual trading accounts linked to that broker.
- **Data Model**:
  - `Account` table no longer stores `broker`, `platform`, or `user_id`.
  - `Account` table now has `credential_id` FK linking it to the parent Broker Account.
  - This ensures all accounts under a broker share the same connection details.
- **UI Update**:
  - Nested card layout: User -> Broker Card -> Sub-Accounts Table.
  - Simplified management of multiple accounts under one login.

## Usage Guide
1. **Create User**: Add a new user.
2. **Add Broker Account**: Click **+ Add Account** on the user card. Enter Broker, Login, Password.
3. **Add Sub-Accounts**: Expand the user card, find the broker card, and click **+ Add Sub-Account**. Enter Account Name and Number.
4. **Manage Status**: You can toggle the active status of the entire Broker Connection (which affects all sub-accounts logically) or individual Sub-Accounts.

## Technical Details
- **Lazy/Eager Loading**: The User API now eager-loads the entire tree (User -> Credentials -> Accounts) for efficient display.
- **Schema**:
  - `BrokerCredential` stores: `broker`, `login_id`, `password`, `is_active`.
  - `Account` stores: `name`, `account_number`, `is_active` (linked via `credential_id`).
