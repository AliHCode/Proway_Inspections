# Cloudflare R2 Setup For RFI Archive

This repo now expects a private R2 bucket for scanned RFI PDFs.

## 1. Create bucket

Create a private Cloudflare R2 bucket for archived RFI scans, for example:

- `proway-rfi-scans`

## 2. Set Supabase Edge Function secrets

Set these secrets in Supabase:

- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_RFI_BUCKET`

Example:

```bash
supabase secrets set \
  R2_ACCOUNT_ID=your-cloudflare-account-id \
  R2_ACCESS_KEY_ID=your-r2-access-key \
  R2_SECRET_ACCESS_KEY=your-r2-secret \
  R2_RFI_BUCKET=proway-rfi-scans
```

## 3. Deploy the Edge Function

```bash
supabase functions deploy r2-rfi-documents
```

## 4. Add R2 CORS rules

Allow your app origin to upload with signed URLs.

Suggested CORS rule:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:5173",
      "https://your-app-domain.com"
    ],
    "AllowedMethods": ["GET", "PUT", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Type"],
    "MaxAgeSeconds": 3600
  }
]
```

## 5. Apply the database migration

Run the new migration that adds `rfi_scanned_documents` and its RLS rules.

## Notes

- The archive page currently accepts PDF uploads only.
- The browser uploads directly to R2 using short-lived signed URLs.
- Supabase stores only metadata, permissions, and RFI links for each document.
