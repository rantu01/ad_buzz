# Setup Guide — Meta API Integration

## Test Results (June 26, 2026)

| # | Test | Status | Details |
|---|------|--------|---------|
| 1 | Token Debug | ✅ Pass | Valid System User token, `ads_management` + `ads_read` + `business_management` scopes present. Never expires. |
| 2 | BM Owned Ad Accounts | ✅ Pass | 4 accounts fetched from BM `2807843926112851` |
| 3 | Read Ad Account (`act_1165617994976863`) | ✅ Pass | `spend_cap: 20925`, `balance: 4900`, `amount_spent: 14833` |
| 4 | Update Spend Cap (POST) | ❌ Fail | `Permissions error` — read works but write blocked |

---

## Current Problem

**System User can read ad account data but cannot update the Spend Cap.**

The token has the `ads_management` scope, and the System User belongs to the Business Manager that owns these ad accounts — but the System User has **not been explicitly assigned** to the ad accounts with write permissions.

Error details:
```
(#200) Permissions error
Subcode: 1815066
Message: The user doesn't have permission to create ads with this ad account
```

---

## Fix: Assign System User to Each Ad Account

This must be done in **Business Manager settings** (not in the app).

### Step-by-Step

1. Go to [business.facebook.com/settings](https://business.facebook.com/settings)
2. Navigate to **Accounts → Ad Accounts** (left sidebar)
3. Click on each ad account (one at a time):

| Account ID | Name | Current Status |
|-----------|------|---------------|
| `act_1042582997629764` | ADS_Adsbuzz_Agency_551 | Disabled (status 2) |
| `act_1165617994976863` | ADS_ADSBUZZ_AGENCY_B_550 | ✅ Active |
| `act_747294736946759` | ADS_MIT_Buyzone_510 | Pending (status 3) |
| `act_6555630064464318` | ADS_trends by hena_679 | ✅ Active |

4. Click **Assign Partner**
5. Select the **System User** tab
6. Find your System User (the one whose token you generated)
7. Set permission to **Manage Ad Account**
8. Click **Save**
9. **Repeat for all 4 accounts**

### Verification

After assigning, run this command to verify write access:

```bash
curl.exe -s -X GET "https://graph.facebook.com/v22.0/act_1165617994976863?fields=id,name,spend_cap,balance,amount_spent&access_token=YOUR_TOKEN"
```

Then test write:

```bash
curl.exe -s -X POST "https://graph.facebook.com/v22.0/act_1165617994976863?access_token=YOUR_TOKEN" -H "Content-Type: application/json" -d "{\"spend_cap\": 2092500}"
```

Expected success response: `{"success": true}`

---

## Application Setup

### 1. Save Meta API Settings

After fixing the permission, go to:

```
http://localhost:3000/admin/meta-api
```

Fill in:

| Field | Value |
|-------|-------|
| Business Manager ID | `2807843926112851` |
| App ID | `4365143347134318` |
| Access Token | `EAAZBCEyKZAf24...` (the full token) |

Click **Save Settings**, then **Test Connection**.

### 2. Fetch Ad Accounts

Click **Fetch from Meta BM** on the same page. This will import all 4 accounts into the local database and cache their meta data.

### 3. Assign Accounts to Users

Go to `/admin/ad-accounts` and assign accounts to users (e.g., `testuser@gmail.com`).

---

## Meta API Endpoints Used

| Endpoint | Purpose | Status |
|----------|---------|--------|
| `GET /{bmId}/owned_ad_accounts` | Fetch all accounts from BM | ✅ Working |
| `GET /act_{id}` | Read account details (balance, spend cap) | ✅ Working |
| `POST /act_{id} { spend_cap: N }` | Update Spend Cap | ❌ Needs fix |
| `GET /act_{id}/insights` | Fetch spend/insights data | Untested |

---

## Notes

- 4 ad accounts found under BM `2807843926112851`
- `act_747294736946759` (ADS_MIT_Buyzone_510) has status **3 (Pending Review)** — may not be fully usable
- `act_1042582997629764` (ADS_Adsbuzz_Agency_551) has status **2 (Disabled)** — cannot be used
- Only 2 accounts are currently **active** (status 1): `act_1165617994976863` and `act_6555630064464318`
