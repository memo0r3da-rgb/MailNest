# MailNest Security Notes

## Current Static-Site Limits

MailNest currently runs as a static frontend. This is suitable for the public website, content pages, AdSense review, and a simple local admin demo.

The current admin page stores content in browser `localStorage`, so it should not be treated as a production CMS or a secure source of truth.

## Implemented Frontend Hardening

- Security headers for Cloudflare Pages in `_headers`.
- Content Security Policy limiting scripts, frames, images, forms, and API connections.
- Admin page marked `noindex` and `no-store`.
- HTML output from dynamic content is escaped before rendering.
- No paid access flow or entitlement logic is included.

## Recommended Production Upgrades

Before using the admin area commercially, move these features server-side:

- Admin authentication.
- Content database.
- Audit log for admin actions.
- Rate limiting and bot protection.
- Form spam protection.

Recommended low-cost stack:

- Cloudflare Workers for API routes.
- Cloudflare D1 or Supabase for content storage.
- Cloudflare Turnstile on contact/admin forms.
- Cloudflare Web Analytics for traffic insights.
