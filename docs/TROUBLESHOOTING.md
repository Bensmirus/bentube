# Ben.Tube Troubleshooting Guide

Common problems and solutions for development and production.

---

## Table of Contents

- [Development Server Issues](#development-server-issues)
- [Environment Configuration](#environment-configuration)
- [Authentication & OAuth](#authentication--oauth)
- [Database & Supabase](#database--supabase)
- [YouTube API](#youtube-api)
- [Build & Deployment](#build--deployment)
- [Browser-Specific Issues](#browser-specific-issues)

---

## Development Server Issues

### Port 3002 is already in use

**Symptom:** `Error: listen EADDRINUSE: address already in use :::3002`

**Solution 1 - Use built-in script:**
```bash
npm run kill-port
```

**Solution 2 - Manual cleanup:**
```bash
# Find process using port 3002
lsof -ti:3002

# Kill the process
lsof -ti:3002 | xargs kill -9

# Or both in one command
npm run restart
```

**Solution 3 - Change port:**
```bash
# Edit package.json scripts to use a different port
"dev": "next dev --port 3003"
```

---

### Server starts but page won't load

**Symptom:** Browser shows loading spinner forever, no errors in console

**Check:**
1. Make sure you're using the correct URL: `http://localhost:3002` (not 3000)
2. Check browser developer console for errors (F12)
3. Verify environment variables are set:
   ```bash
   npm run validate-env
   ```
4. Check health endpoint:
   ```bash
   curl http://localhost:3002/api/health
   ```

**Solution:**
```bash
# Clean build and restart
npm run dev:clean
```

---

### "Module not found" errors

**Symptom:** Import errors or module not found during build

**Solution:**
```bash
# Delete node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Next.js cache
rm -rf .next

# Restart dev server
npm run dev
```

---

## Environment Configuration

### "Auth session missing!" error

**Symptom:** Console shows `AuthSessionMissingError: Auth session missing!`

**This is NORMAL when not logged in!** The app should automatically show the login page.

**If the login page doesn't appear:**
1. Clear browser cookies for localhost
2. Clear browser localStorage for localhost
3. Hard refresh (Cmd+Shift+R or Ctrl+Shift+R)
4. Try a different browser or incognito mode

---

### Environment validation fails

**Symptom:** `npm run dev` exits with environment validation errors

**Solution:**
```bash
# Make sure .env.local exists
cp .env.example .env.local

# Edit .env.local and fill in all required values
# See .env.example for comments about each variable

# Test validation
npm run validate-env
```

**Required variables:**
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `CRON_SECRET`

---

### Placeholder values detected

**Symptom:** Validation warns about placeholder values like `your-project.supabase.co`

**Solution:**
Replace all placeholder values in `.env.local` with real values from:
- **Supabase:** [Dashboard → Settings → API](https://supabase.com/dashboard)
- **Google OAuth:** [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)

---

## Authentication & OAuth

### Google OAuth redirect error

**Symptom:** After clicking "Sign in with Google", redirects to error page:
- `redirect_uri_mismatch`
- `invalid_client`
- `access_denied`

**Solution for `redirect_uri_mismatch`:**
1. Go to [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Click your OAuth 2.0 Client ID
3. Under "Authorized redirect URIs", add:
   - Development: `http://localhost:3002/auth/callback`
   - Production: `https://your-domain.com/auth/callback`
4. Click Save
5. Wait 5 minutes for changes to propagate
6. Try logging in again

**Solution for `invalid_client`:**
- Check that `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local` exactly match the values in Google Cloud Console
- Make sure there are no extra spaces or quotes

**Solution for `access_denied`:**
- Make sure you're granting all requested permissions during OAuth flow
- Check that YouTube Data API v3 is enabled in Google Cloud Console

---

### Login succeeds but redirects to login again

**Symptom:** Successfully authenticate with Google but immediately get sent back to login page

**Possible causes:**
1. **Supabase configuration issue** - Check that Supabase URL and keys are correct
2. **Cookie issue** - Browser blocking cookies
3. **Redirect loop** - Middleware configuration problem

**Solution:**
```bash
# 1. Verify Supabase configuration
curl http://localhost:3002/api/health

# 2. Clear all cookies for localhost
# Browser → Developer Tools → Application → Cookies → Clear all

# 3. Check Supabase dashboard
# Go to Authentication → Users
# Verify user was created after login attempt

# 4. Check browser console for errors
# Look for auth-related error messages
```

---

### Session expires immediately

**Symptom:** Can't stay logged in, constantly asked to re-authenticate

**Solution:**
1. Check Supabase Auth settings:
   - Go to Supabase Dashboard → Authentication → Settings
   - Verify "Session duration" is reasonable (default: 7 days)
2. Check for clock sync issues on your machine
3. Clear all browser data for localhost and try again

---

## Database & Supabase

### "Failed to fetch" from Supabase

**Symptom:** Network errors when trying to connect to Supabase

**Check:**
1. Supabase project is not paused (free tier pauses after inactivity)
2. Your IP is not blocked by Supabase
3. Network/firewall allows connections to Supabase
4. Supabase project URL is correct

**Solution:**
```bash
# Test Supabase connection directly
curl https://your-project.supabase.co/rest/v1/

# Should return: {"message":"The schema must be one of the following: public"}
# If connection times out or fails, check:
# - Supabase dashboard shows project is active
# - Try from different network (mobile hotspot)
# - Check firewall settings
```

---

### Database migration errors

**Symptom:** SQL errors when running migrations, missing tables/columns

**Solution:**
1. Make sure migrations are run **in order** (00001 → 00002 → 00003...)
2. Check which migrations have already been applied:
   ```sql
   -- In Supabase SQL Editor
   SELECT * FROM schema_migrations ORDER BY version;
   ```
3. If a migration failed partway through:
   - Manually fix the database state
   - Or drop the database and re-run all migrations from scratch (⚠️ loses data)

**Fresh start (development only):**
```bash
# WARNING: This deletes all data!
# 1. In Supabase Dashboard, go to Settings → Database
# 2. Click "Reset Database" (only available in development)
# 3. Re-run all migrations in order
```

---

### RLS (Row Level Security) errors

**Symptom:** `permission denied for table X` or `new row violates row-level security policy`

**Check:**
1. Make sure user is logged in (RLS policies require auth)
2. Check that migration `00002_rls_policies.sql` was applied
3. Verify user ID matches the policy conditions

**Debug:**
```sql
-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';

-- View policies for a table
SELECT * FROM pg_policies WHERE tablename = 'videos';
```

---

## YouTube API

### YouTube quota exceeded

**Symptom:** `quotaExceeded` error, sync fails

**Explanation:**
YouTube Data API has a daily quota of 10,000 units. Ben.Tube uses ~1 unit per 50 videos synced.

**Solution:**
1. Wait until tomorrow (quota resets at midnight Pacific Time)
2. Reduce sync frequency in production
3. Request quota increase from Google Cloud Console

**Check current usage:**
```bash
curl http://localhost:3002/api/quota
```

---

### Channel sync fails

**Symptom:** Specific channels won't sync, others work fine

**Possible causes:**
1. **Channel deleted** - Channel no longer exists on YouTube
2. **Channel private** - Made private or unlisted
3. **Playlist ID changed** - YouTube occasionally changes playlist IDs

**Solution:**
```bash
# Check channel health
curl http://localhost:3002/api/channels/health

# Dead channels are automatically retried with exponential backoff
# (24h → 48h → 96h → 192h)
```

---

### "Invalid credentials" from YouTube API

**Symptom:** YouTube API returns 401 Unauthorized

**Solution:**
1. **Token expired** - Re-authenticate by logging out and back in
2. **Scopes changed** - Make sure OAuth includes `youtube.readonly` scope
3. **API not enabled** - Enable YouTube Data API v3 in Google Cloud Console

---

## Build & Deployment

### Build fails with TypeScript errors

**Symptom:** `npm run build` fails with type errors that don't show in dev

**Solution:**
```bash
# Run type checker
npx tsc --noEmit

# Fix type errors shown
# Common issues:
# - Missing type imports
# - Implicit 'any' types
# - Unused variables
```

---

### Production build larger than expected

**Symptom:** `.next` folder is several hundred MB

**Check:**
```bash
# Analyze bundle size
npm run build

# Look for large dependencies in output
# Common culprits: googleapis, @supabase/supabase-js
```

**Solution:**
- Make sure dependencies are correctly split between `dependencies` and `devDependencies`
- Use dynamic imports for heavy components
- Enable compression in production

---

## Browser-Specific Issues

### Works in Chrome but not Safari

**Common Safari issues:**
1. **Third-party cookies blocked** - Safari blocks by default
   - Solution: Disable "Prevent cross-site tracking" in Safari settings
2. **LocalStorage in private mode** - Doesn't persist
   - Solution: Use regular browsing mode
3. **Stricter CORS** - Safari enforces CORS more strictly
   - Check: Network tab shows CORS errors

**Safari debugging:**
```bash
# Enable Safari Developer Tools
# Safari → Preferences → Advanced → Show Develop menu

# Then: Develop → Show Web Inspector
```

---

### Works on desktop but not mobile

**Common mobile issues:**
1. **Viewport meta tag** - Check `layout.tsx` has proper viewport settings
2. **Touch events** - Make sure UI is touch-friendly
3. **Service workers** - Mobile Safari has limitations

**Mobile debugging:**
```bash
# For iOS (with Mac):
# Safari → Develop → [Your iPhone] → localhost

# For Android:
# Chrome → chrome://inspect → Remote devices
```

---

## General Debugging Tips

### Enable verbose logging

```bash
# Start in debug mode
npm run dev:verbose

# Check logs
tail -f /path/to/logs
```

### Check all health endpoints

```bash
# App health
curl http://localhost:3002/api/health

# Supabase status
curl https://status.supabase.com/api/v2/status.json

# Google OAuth status
curl https://www.google.com/appsstatus/dashboard/
```

### Clear everything and start fresh

```bash
# Nuclear option - clears all caches and state
rm -rf node_modules .next
npm install
npm run dev:clean
```

### Still stuck?

1. Check [docs/SYSTEM-ARCHITECTURE.md](./SYSTEM-ARCHITECTURE.md) for how things work
2. Check [docs/PRD.md](./PRD.md) for expected behavior
3. Enable debug logging in relevant files
4. Check browser console for errors (F12)
5. Check server terminal for errors
6. Try incognito mode (rules out extension issues)

---

## Quick Reference

### Useful Commands

```bash
# Environment check
npm run validate-env

# Health check
curl http://localhost:3002/api/health

# Kill port
npm run kill-port

# Clean restart
npm run dev:clean

# Check what's on port 3002
lsof -i:3002

# View logs in real-time
tail -f .next/server.log  # if exists
```

### Important URLs

- **Supabase Dashboard:** https://supabase.com/dashboard
- **Google Cloud Console:** https://console.cloud.google.com
- **Local App:** http://localhost:3002
- **Local Health Check:** http://localhost:3002/api/health

### File Locations

- Environment config: `.env.local` (not committed)
- Environment template: `.env.example` (committed)
- Database migrations: `supabase/migrations/`
- Logs: Browser console + server terminal
- API routes: `src/app/api/`

---

**Updated:** January 24, 2026
