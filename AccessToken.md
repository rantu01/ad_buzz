# How to Get a Meta Access Token for the Marketing API

This guide walks you through creating a **System User** access token for the Meta (Facebook) Marketing API with `ads_management` permission. This token is required to update the **Spend Cap** on your ad accounts via API.

---

## Prerequisites

- A **Facebook personal account** that is an admin of your Business Manager
- Access to **Meta Business Manager** ([business.facebook.com](https://business.facebook.com))
- A **Business Manager ID** (numeric, e.g. `123456789012345`)

---

## Step 1: Create (or use) a Meta App

1. Go to [developers.facebook.com/apps](https://developers.facebook.com/apps)
2. Click **Create App**
3. Choose **Business** as the app type (this is the only type that supports the Marketing API)
4. Give your app a name (e.g. `AdBuzz Marketing`)
5. Select your **Business Manager** when prompted (or create one)
6. Click **Create App**

---

## Step 2: Add the Marketing API Product

1. In your app dashboard, go to **Dashboard** (left sidebar)
2. Scroll to **Add Product**
3. Click **Set Up** on the **Marketing API** card
4. The Marketing API section will appear in your left sidebar

---

## Step 3: Note Your App Credentials

1. Go to **Settings → Basic**
2. Copy the **App ID** and **App Secret** — you will need them later
3. Go to **Settings → Advanced**
4. Confirm your Business Manager is linked under **Business Manager ID**

---

## Step 4: Create a System User in Business Manager

System User tokens are the recommended approach for server-to-server integrations — they do not expire unless revoked.

1. Go to [business.facebook.com/settings](https://business.facebook.com/settings)
2. Navigate to **Users → System Users** (left sidebar)
3. Click **Add** → choose a name (e.g. `AdBuzz API Bot`)
4. Select **Admin** role
5. Click **Create**

---

## Step 5: Assign the System User to Your App

1. In the System Users list, click on the user you just created
2. Click **Assign Assets**
3. Select **Apps** tab
4. Find your app and check the box
5. Toggle on **Manage App** permission
6. Click **Save Changes**

---

## Step 6: Generate a Token for the System User

1. In the same System User detail page, click **Generate New Token**
2. Select your app from the dropdown
3. Select the following permissions:
   - **`ads_management`** — **REQUIRED** for updating Spend Cap, creating/editing campaigns
   - **`ads_read`** — for reading ad account data and insights
   - **`business_management`** — for accessing Business Manager assets
4. Click **Generate**
5. **Copy the token immediately** — it will only be shown once
6. Store it securely (e.g. in your `.env` file or password manager)

> **Important:** If you see only `ads_read` without `ads_management`, go back to **App Settings → Advanced** and ensure your app is linked to the correct Business Manager, then repeat this step.

---

## Step 7: Grant the System User Access to Ad Accounts

1. In Business Manager settings, go to **Accounts → Ad Accounts**
2. Click the ad account you want to manage
3. Click **Assign Partner**
4. Select **System User** and choose the user you created
5. Set permission to **Manage Ad Account** (or **Admin**)
6. Click **Save**
7. Repeat for every ad account this token needs to update

---

## Step 8: Configure in the Application

1. Go to `http://localhost:3000/admin/meta-api`
2. Fill in the fields:
   - **Business Manager ID** — your numeric BM ID (e.g. `123456789012345`)
   - **App ID** — from Step 3
   - **Access Token** — the token from Step 6
3. Click **Test Connection** to verify
4. Click **Save Settings**
5. Click **Fetch from Meta BM** to import your ad accounts

---

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Permissions error` | Token missing `ads_management` scope | Regenerate token with `ads_management` checked (Step 6) |
| `Token invalid` | Token was revoked or expired | Generate a new token (Step 6) |
| `Access denied` | System User not assigned to ad account | Grant access in Business Manager (Step 7) |
| `(#100) parameter value is invalid` | Spend cap value incorrect | Ensure value is in cents and positive |

### Testing Your Token

```bash
curl -X GET \
  "https://graph.facebook.com/v22.0/act_YOUR_AD_ACCOUNT_ID?fields=id,name,spend_cap&access_token=YOUR_TOKEN"
```

Replace `YOUR_AD_ACCOUNT_ID` (e.g. `act_123456789`) and `YOUR_TOKEN`. If the response includes `spend_cap`, the token has read access. To test write access:

```bash
curl -X POST \
  "https://graph.facebook.com/v22.0/act_YOUR_AD_ACCOUNT_ID?access_token=YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"spend_cap": 100000}'
```

A successful response returns `{"success": true}`.

---

## About Business Verification

If your app is in **Development Mode** (default), it can call the API only for users/admins of the app itself. For a production deployment:

1. **Business Verification** — required to get `ads_management` Advanced Access
   - Go to **App Dashboard → Settings → Business Verification**
   - Submit your business documents (registration certificate, VAT number, etc.)
   - Usually takes 1–5 business days
2. **App Review** — required only if you need Advanced Access for other advertisers' accounts
   - Submit use case screenshots and privacy policy
   - Select `ads_management` permission for review

Without verification, Standard Access still works for ad accounts you own or administer in your Business Manager.
