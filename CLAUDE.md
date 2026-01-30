# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Lyric Atlas API (SpotiEase) - A high-performance lyrics fetching service for NetEase Cloud Music songs. Fetches lyrics from a GitHub repository (primary) or external NCM API (fallback), supporting multiple formats (TTML, YRC, LRC, ESLRC).

**Runtime:** Vercel Edge Functions with Hono web framework.

## Commands

```bash
pnpm install          # Install dependencies
pnpm run start        # Run local dev server (vercel dev)
pnpm run deploy       # Deploy to Vercel production
```

## Architecture

```
api/
├── index.ts              # Hono app entry point, route handlers
├── lyricService.ts       # LyricProvider class - orchestrates fetch logic
├── httpClient.ts         # HTTP client with retry & concurrency limiting (p-limit, max 15)
├── cache.ts              # In-memory TTL cache (lyrics: 60min, metadata: 30min)
├── utils.ts              # Logger factory, URL builders, validators
├── workers.ts            # Format checking with Promise.all
├── fetchers/
│   ├── repositoryFetcher.ts   # Primary: GitHub repo (Steve-XMH/amll-ttml-db)
│   └── externalApiFetcher.ts  # Fallback: External NCM API
└── interfaces/
    ├── fetcher.ts        # Fetcher interface definitions
    └── lyricTypes.ts     # FetchResult, SearchResult types
```

**Request Flow:** API Layer (index.ts) → LyricProvider (lyricService.ts) → Fetcher (repository or external) → HTTP Client → Cache

**Key Patterns:**
- Strategy pattern for fetchers (repository vs external API)
- Discriminated unions for result types (`status: 'found' | 'notfound' | 'error'`)
- Global 6-second timeout for search operations with AbortController
- Dual-tier caching with automatic TTL cleanup

**Repository Format Priority:** When fetching from the GitHub repository, formats are checked sequentially in priority order (TTML first, then fallbacks). Once a format is found, the search returns immediately without checking lower-priority formats.

## API Endpoints

- `GET /api/search?id={songId}&fallback={formats}` - Fetch lyrics content
- `GET /api/lyrics/meta?id={songId}` - Get available formats (lightweight)
- `GET /api` - Health check

## Environment Variables

```
EXTERNAL_NCM_API_URL    # Required: Base URL for fallback NCM API
PORT                    # Optional: Server port (default: 3000)
```

## Data Sources

- **Primary:** `https://raw.githubusercontent.com/Steve-XMH/amll-ttml-db/main/ncm-lyrics/{id}.{format}`
- **Fallback:** External NCM API configured via `EXTERNAL_NCM_API_URL`

## Key Types

```typescript
type LyricFormat = 'ttml' | 'yrc' | 'lrc' | 'eslrc' | 'tlyric' | 'romalrc';

type FetchResult =
  | { status: 'found'; format; content; source }
  | { status: 'notfound'; format? }
  | { status: 'error'; statusCode?; error };
```

## Logging

Use `getLogger('CategoryName')` factory from `utils.ts`. Format: `[LEVEL][CATEGORY] message`
