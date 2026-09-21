# LAUNCH TIME backend update (cumulative)

Copy these folders into your backend project root (controllers/, middleware/, models/,
routes/, utils/, database/) and overwrite when asked. Only changed/new files are
included. No new npm packages. Deploy this BEFORE the frontend.

## Getting the database changes onto your database (in this order)
Your backend already talks to your existing database (DATABASE_URL). The new tables and
columns are all in database/schema.sql, applied by your existing migrate script.
1. DRY RUN (recommended). From the backend folder, with DATABASE_URL set (your .env, or
   `railway run ...`):
       node database/check-migration.js
   It applies schema.sql inside a transaction, checks everything the new features
   need, tries a few test inserts, and ROLLS BACK. Nothing is saved. You want to see
   "All checks passed". If a line shows a red X, send it to me.
2. Back up the database (Railway backup / pg_dump).
3. Apply for real, once:
       node database/migrate.js
   (If your deploy already runs migrate.js automatically, this happens on deploy.)
4. Deploy the backend, then the frontend.
Existing vendors and orders are not changed: every existing vendor stays open with
free delivery until they set otherwise. The only thing replaced is the ads
"placement" rule (see section 2), so hero and tile ads are allowed.

## 3. NEW: everything on the website is editable (Admin > Site content)
Ten editable parts of the public site, each defined once in utils/contentSchema.js:
Brand and logo, Header and menus, Home banner, Home promo tiles, Home sections,
Footer, Login and sign-up pages, Vendors page, Page names, Search-engine titles.
- New table site_content (one row per section). Only what an admin saves is stored;
  anything not saved falls back to built-in defaults that equal what the site showed
  before, so nothing changes until someone edits it. Deleting a row = reset.
- GET  /api/settings/content        public: the site's content, defaults filled in
- GET  /api/admin/content           admin: the form definitions + current content
- PUT  /api/admin/content/:section  admin: validated save
- DELETE /api/admin/content/:section admin: back to the original
- POST /api/admin/content/image     admin: logo upload (images only) to Cloudinary
- Server-side validation for every field: lengths, allowed choices, whole numbers in
  range, https-only images, and links limited to pages on the site, #anchors,
  https:// addresses, mailto: and tel: (javascript:, data:, //evil.com are refused).
- New/changed files: utils/contentSchema.js, models/siteContentModel.js,
  controllers/contentController.js, routes/settingsRoutes.js, routes/adminRoutes.js.
- No changes to app.js / server.js are needed (the new routes live in existing files).

## 2. Homepage ad slots (the earlier update, now complete)
- New placements "hero" and "tile". schema.sql replaces the ads.placement CHECK
  constraint (found by definition, so it works whatever it was named).
- middleware/validators.js (adCreateRules / adUpdateRules) and
  controllers/adminController.js now accept hero and tile. (This was the piece that
  would have rejected new hero/tile ads before.)

## 1. Earlier updates (still included)
Opening hours + pause, delivery fees, ratings and reviews, HTML-escaped emails,
privacy fix on public vendor endpoints (see the earlier notes).

## Not covered
- The SQL was reviewed and the logic tested with a stubbed database, but never run
  against a real PostgreSQL. Try it on a copy of your database first.
- Reviews can't be edited/deleted/replied to; no admin moderation screen.
