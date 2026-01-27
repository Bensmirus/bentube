# Ben.Tube

A personal YouTube content manager for research, learning, and content curation. Built with Next.js, Supabase, and TypeScript.

## What is Ben.Tube?

Ben.Tube is a cleaner, more organized way to manage YouTube subscriptions without the distractions of YouTube's algorithm-driven interface. It's:

- **🎯 Focused** - Organize channels into topic groups (Tech, Music, Learning, etc.)
- **🔒 Private** - Your data, your organization, no social features
- **📊 Progress-aware** - Track watch progress across all devices
- **🎨 Distraction-free** - No recommendations, no algorithm, just your content

## Quick Start

### Prerequisites

- **Node.js 20+** and npm
- **Supabase account** (free tier works)
- **Google Cloud account** (for OAuth)

### 1. Clone and Install

```bash
git clone <repository-url>
cd Ben.Tube
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings** → **API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key
3. Run the database migrations:
   - Open **SQL Editor** in Supabase dashboard
   - Copy and run each migration from `supabase/migrations/` in order
   - Start with `00001_initial_schema.sql` through the latest

### 3. Set Up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project (or select existing)
3. Enable **YouTube Data API v3**:
   - Go to **APIs & Services** → **Library**
   - Search for "YouTube Data API v3"
   - Click **Enable**
4. Create OAuth credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth 2.0 Client ID**
   - Application type: **Web application**
   - Add authorized redirect URI: `http://localhost:3002/auth/callback`
   - Copy the **Client ID** and **Client Secret**

### 4. Configure Environment Variables

```bash
# Copy the example file
cp .env.example .env.local

# Edit .env.local and fill in your values
```

Required variables:
```bash
# Supabase (from step 2)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Google OAuth (from step 3)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3002

# Cron Secret (generate with: openssl rand -hex 16)
CRON_SECRET=your-random-secret
```

### 5. Run the Development Server

```bash
npm run dev
```

Open [http://localhost:3002](http://localhost:3002) in your browser.

**First time?** You'll see the landing page. Click "Continue with Google" to sign in with YouTube access.

## Development Commands

```bash
# Start development server (with environment validation)
npm run dev

# Start with clean build
npm run dev:clean

# Start in debug mode
npm run dev:verbose

# Validate environment variables only
npm run validate-env

# Kill process on port 3002 and restart
npm run restart

# Build for production
npm run build

# Run production build
npm start

# Lint code
npm run lint
```

## Project Structure

```
Ben.Tube/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── api/          # API routes
│   │   ├── (dashboard)/  # Protected dashboard pages
│   │   └── auth/         # Authentication callbacks
│   ├── components/       # React components
│   ├── hooks/            # Custom React hooks
│   └── lib/              # Utilities and helpers
│       ├── supabase/     # Supabase client setup
│       ├── youtube/      # YouTube API integration
│       └── logger.ts     # Structured logging
├── supabase/
│   └── migrations/       # Database migrations (run in order!)
├── docs/                 # Documentation
│   ├── PRD.md           # Product requirements
│   ├── SYSTEM-ARCHITECTURE.md
│   ├── TROUBLESHOOTING.md
│   └── DEV-RELIABILITY-AUDIT.md
├── scripts/
│   └── validate-env.js   # Environment validation
└── public/               # Static assets
```

## Database Migrations

Migrations are located in `supabase/migrations/` and **must be applied in order**:

1. Open your Supabase project dashboard
2. Go to **SQL Editor**
3. Copy the contents of each migration file
4. Run them in order (00001, 00002, 00003, etc.)

**Latest migration:** Check the `supabase/migrations/` folder for the highest numbered file.

## Health Check

Check if the app is configured correctly:

```bash
curl http://localhost:3002/api/health
```

Healthy response:
```json
{
  "status": "healthy",
  "required": {
    "supabase_url": true,
    "supabase_anon_key": true,
    "supabase_service_key": true,
    "google_oauth_configured": true,
    "app_url_configured": true,
    "cron_secret_configured": true
  },
  "optional": {
    "youtube_api_key": false,
    "sentry_configured": false,
    "discord_configured": false
  }
}
```

## Common Issues

### Port 3002 already in use

```bash
npm run kill-port
# or manually:
lsof -ti:3002 | xargs kill -9
```

### "Auth session missing" error

This is normal when not logged in. The app should show the login page automatically. If it doesn't, clear your browser cache and cookies for localhost.

### Environment validation fails

Make sure you've copied `.env.example` to `.env.local` and filled in all required values. Run:

```bash
npm run validate-env
```

### Supabase connection errors

1. Check that your Supabase URL and keys are correct
2. Verify your Supabase project is active (not paused)
3. Check network/firewall settings

### Google OAuth redirect error

Make sure `http://localhost:3002/auth/callback` is added as an authorized redirect URI in Google Cloud Console.

**For more troubleshooting**, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## Documentation

- **[PRD.md](docs/PRD.md)** - Product vision and requirements
- **[SYSTEM-ARCHITECTURE.md](docs/SYSTEM-ARCHITECTURE.md)** - Technical architecture
- **[TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)** - Common problems and solutions
- **[DEV-RELIABILITY-AUDIT.md](docs/DEV-RELIABILITY-AUDIT.md)** - Development setup audit

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Database:** Supabase (PostgreSQL)
- **Authentication:** Supabase Auth + Google OAuth
- **Styling:** Tailwind CSS
- **State Management:** TanStack Query (React Query)
- **YouTube API:** googleapis
- **Language:** TypeScript

## Features

- ✅ Google OAuth login with YouTube access
- ✅ Import YouTube subscriptions
- ✅ Organize channels into topic groups
- ✅ Track watch progress across devices
- ✅ Watch later queue
- ✅ Infinite scroll video feed
- ✅ Real-time sync across devices
- ✅ Per-user data isolation
- ✅ Automatic video syncing
- ✅ Channel health monitoring
- ✅ Mobile responsive design

## Contributing

1. Make changes in a feature branch
2. Test thoroughly in development
3. Submit a pull request

## License

Private project - not for distribution

## Support

For issues and questions, see [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) or open an issue in the repository.

---

**Made for researchers, learners, and content curators who want a better way to organize YouTube.**
