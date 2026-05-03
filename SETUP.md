# Priora.AI Patent Prior Art Search — Setup Guide

## Prerequisites
- Node.js 18+ installed
- A free Clerk account (https://clerk.com)
- A free Neon PostgreSQL account (https://neon.tech)

---

## Step 1: Create a Clerk Account & Get API Keys

1. Go to https://clerk.com and sign up for a free account
2. Create a new application (name it "Priora.AI" or similar)
3. In the Clerk dashboard, navigate to **API Keys**
4. Copy the following values:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (starts with `pk_test_` or `pk_live_`)
   - `CLERK_SECRET_KEY` (starts with `sk_test_` or `sk_live_`)
5. Open `.env.local` in this project and replace the placeholder values:
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_your_actual_key_here
   CLERK_SECRET_KEY=sk_test_your_actual_key_here
   ```

---

## Step 2: Create a Neon PostgreSQL Database

1. Go to https://neon.tech and sign up for a free account
2. Create a new project (name it "priora-ai")
3. Once created, go to **Dashboard > Connection string**
4. Copy the connection string (looks like: `postgresql://user:password@ep-xxx.us-east-1.aws.neon.tech/neondb?sslmode=require`)
5. Open `.env.local` and replace the `DATABASE_URL` placeholder:
   ```
   DATABASE_URL=postgresql://your_actual_connection_string_here
   ```

---

## Step 3: Install Dependencies & Setup Database

Run these commands from the project root directory:

```bash
# Install all dependencies
npm install

# Generate Prisma client
npx prisma generate

# Push database schema to Neon
npx prisma db push

# Start the development server
npm run dev
```

The app will be available at http://localhost:3000

---

## Step 4: Verify Setup

1. Open http://localhost:3000 — you should see the landing page
2. Click "Get Started" and create an account (Clerk handles this)
3. After signing in, you'll be on the dashboard
4. Paste an invention description (at least 50 characters) and click "Search Prior Art"
5. Watch the progress indicator — search takes 2–4 minutes
6. Download your reports when complete

---

## Step 5: Deploy to Vercel

1. Push your code to a GitHub repository (make sure `.env.local` is in `.gitignore`)

2. Go to https://vercel.com and import your GitHub repository

3. In the Vercel deployment settings, add all environment variables from `.env.local`:
   ```
   GROQ_API_KEY=your_groq_api_key_from_console.groq.com
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=your_clerk_publishable_key
   CLERK_SECRET_KEY=your_clerk_secret_key
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/dashboard
   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/dashboard
   DATABASE_URL=your_neon_postgresql_url
   ```

4. Click **Deploy** — Vercel will build and deploy automatically

5. After deployment, update your Clerk dashboard:
   - Go to Clerk Dashboard > Domains
   - Add your Vercel domain (e.g., `https://patent-saas.vercel.app`)
   - Update allowed redirect URLs

---

## Useful Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npx prisma studio    # Open Prisma Studio (DB GUI)
npx prisma db push   # Sync schema changes to database
npx prisma generate  # Regenerate Prisma client after schema changes
```

---

## Troubleshooting

### "DATABASE_URL is not set" error
- Make sure `.env.local` exists with a valid `DATABASE_URL`
- Neon connection strings must include `?sslmode=require` at the end

### Clerk authentication not working
- Verify the publishable key starts with `pk_` (not `sk_`)
- Make sure your Clerk app's "Allowed redirect URLs" includes `http://localhost:3000`

### Search fails immediately
- Check that `GROQ_API_KEY` is correctly set in `.env.local`
- The Groq API key provided has a rate limit — if exhausted, you'll see failures

### SSE stream not updating
- This works best in Next.js dev mode with Node.js runtime
- On Vercel, SSE streams have a 30-second timeout — consider polling as fallback

---

## Architecture Notes

- **Background search**: When a user submits a search, the API immediately returns a `searchId` and starts the search asynchronously. The frontend polls progress via Server-Sent Events.
- **Search sources**: 8 different APIs are queried in parallel. Individual failures don't abort the overall search.
- **Report generation**: Groq's `llama-3.3-70b-versatile` model generates both reports based on consolidated search results.
- **Database**: Prisma ORM connects to Neon PostgreSQL. The schema has two tables: `Search` and `Report`.
