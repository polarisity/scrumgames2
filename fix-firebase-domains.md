# Fix Firebase Email Authentication Domain Error

## The Problem
You're getting the error: `Firebase: Domain not whitelisted by project (auth/unauthorized-continue-uri)`

This happens because Firebase requires all domains used for email link authentication to be explicitly whitelisted.

## Solution

### Option 1: Whitelist via Firebase Console (Recommended - Takes 2 minutes)

1. Go to: https://console.firebase.google.com/project/scrumptious-73bc9/authentication/settings

2. Scroll down to the **"Authorized domains"** section

3. Click **"Add domain"**

4. Add the following domains (one at a time):
   - `localhost` (for local development)
   - Any production domain you're using (e.g., `yourdomain.com`)

5. Click **"Add"** for each

6. Try sending the OTP email again

### Option 2: Whitelist via Firebase CLI

If you have Firebase CLI installed and authenticated:

```bash
# Install Firebase CLI if you haven't
npm install -g firebase-tools

# Login to Firebase
firebase login

# This will open your project settings where you can add domains
firebase open auth
```

## What Domains to Whitelist

Based on your setup:
- **localhost** - For local development (port 3000)
- **127.0.0.1** - Alternative local address
- Your production domain when you deploy

## After Whitelisting

Once you've whitelisted the domains:
1. Refresh your application
2. Try sending the OTP email again
3. It should work immediately

## Notes

- `*.firebaseapp.com` domains are automatically whitelisted
- Changes take effect immediately
- You can whitelist multiple domains for different environments
