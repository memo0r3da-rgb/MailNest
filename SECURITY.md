# MailNest Security Notes

## Current Static-Site Limits

MailNest currently runs as a static frontend. This is suitable for the public website, content pages, AdSense review, and a manual payment-request workflow.

It is not a secure source of truth for paid entitlements because browser storage can be edited by the user. Any real Premium activation system should be moved to a backend.

## Implemented Frontend Hardening

- Security headers for Cloudflare Pages in `_headers`.
- Content Security Policy limiting scripts, frames, images, forms, and API connections.
- Admin page marked `noindex` and `no-store`.
- Payment proof images limited to PNG, JPG, and WebP with a 3MB max size.
- Payment request cooldown to reduce repeated spam submissions.
- Random payment request IDs generated with `crypto.getRandomValues`.
- HTML output from dynamic content is escaped before rendering.
- The payment UI does not collect or store card numbers.

## Production Payment Requirements

Before selling Premium at scale, move these features server-side:

- Admin authentication.
- Payment request database.
- Payment proof upload storage.
- Premium entitlement checks.
- Approval and rejection workflow.
- Audit log for admin actions.
- Rate limiting and bot protection.

Recommended low-cost stack:

- Cloudflare Workers for API routes.
- Cloudflare D1 or Supabase for payment requests and entitlements.
- Cloudflare R2 or Supabase Storage for proof images.
- Turnstile on payment/contact forms.

## Manual Payment Safety

- Never ask users for card numbers, OTPs, wallet PINs, or passwords.
- Ask only for transaction reference and transfer screenshot.
- Verify every transfer manually from the wallet/Instapay app before approving.
- Treat screenshots as untrusted evidence until checked against your account activity.
