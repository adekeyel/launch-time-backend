# LAUNCH TIME — Backend API

Backend for **LAUNCH TIME**, a local food ordering system. Built with
**Node.js + Express** and **PostgreSQL**, designed to deploy on **Railway**.

> This delivers the backend only. The frontend (React + Vite) is a separate
> build that will consume this API.

---

## 1. Tech Stack

| Layer      | Choice |
|------------|--------|
| Runtime    | Node.js 18+ / Express.js |
| Database   | PostgreSQL (raw `pg`, hand-written SQL — no ORM black box) |
| Auth       | JWT (short-lived access token + rotating httpOnly refresh cookie) |
| Email      | [Resend](https://resend.com) (password reset + order emails) |
| Security   | helmet, cors, hpp, express-mongo-sanitize, xss-clean, express-rate-limit, bcryptjs |
| Media      | [Cloudinary](https://cloudinary.com) — images and short videos, uploaded directly from the user's device (multer memory storage → streamed buffer, never a client-supplied URL) |
| Deployment | Railway (Nixpacks + Railway PostgreSQL plugin) |

---

## 2. Roles & Permissions

- **customer** — browse vendors/foods, manage own cart, checkout, view own order history.
- **vendor** — manage own profile, own foods (CRUD), view/update status of own incoming orders.
- **admin (super admin)** — full CRUD over **users**, **vendors**, and **every vendor's foods** (create/edit/delete on their behalf), oversight of **all orders**, full CRUD over **ads** (top/middle/bottom placements), plus a lightweight analytics endpoint. Admins are never self-registered — the first admin is created via the seed script, and only an existing admin can promote/create further admins.

---

## 3. Project Structure

```
server/
  app.js               Express app (middleware + route mounting)
  server.js             Entrypoint, graceful shutdown
  config/db.js           PostgreSQL pool
  controllers/           Route handlers (auth, vendor, food, cart, order, admin)
  routes/                 Route definitions per resource
  middleware/            auth, ownership guards, rate limiters, validators, error handler, upload
  models/                 Hand-written SQL data-access layer
  database/schema.sql     Full schema (tables, indexes, triggers)
  database/migrate.js     Applies schema.sql to DATABASE_URL
  database/seed.js        Bootstraps the first super admin
  utils/                  jwt, email (Resend), response helpers
  uploads/                Local image storage (food/vendor images)
```

---

## 4. Local Setup

```bash
cd server
npm install
cp .env.example .env      # fill in real values (see below)

# Create the schema
npm run migrate

# Create the first super admin (uses SUPER_ADMIN_* vars from .env)
npm run seed

# Start in dev mode
npm run dev
```

### Required environment variables (`.env`)

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Postgres connection string. Railway injects this automatically once you attach the PostgreSQL plugin. |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Long random strings, **must differ** from each other. |
| `JWT_ACCESS_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Defaults: `15m` / `7d`. |
| `RESEND_API_KEY` | From resend.com dashboard. |
| `EMAIL_FROM` | e.g. `LAUNCH TIME <onboarding@resend.dev>` (use `resend.dev` sandbox sender until you verify your own domain in Resend). |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | From your Cloudinary dashboard home page (cloudinary.com/console). Used to store every food/vendor/ad image and short video. |
| `CLIENT_URL` | Frontend origin — used for CORS and for building the password-reset link. |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` / `SUPER_ADMIN_FULLNAME` | Used once by `npm run seed`. |

---

## 5. Security Checklist

- **Password hashing**: bcryptjs, 12 salt rounds.
- **JWT**: short-lived access token (returned in JSON, kept in memory on the frontend) + long-lived refresh token in an `httpOnly`, `sameSite=strict`, `secure`(prod) cookie, scoped to `/api/auth`. Refresh tokens are hashed before storage and rotated (old one revoked) on every refresh — a stolen DB dump can't be replayed as a live session.
- **Rate limiting**: global API limiter (300 req/15 min/IP), a tight login/register limiter (10 req/15 min), and an even tighter forgot-password limiter (5 req/hour) to stop credential stuffing and email-bombing.
- **Forgot password**: generates a random 32-byte token, stores only its SHA-256 hash with a 30-minute expiry, emails the raw token as a link, and the endpoint always returns the same generic message whether or not the email exists (no account enumeration). Resetting a password revokes all existing refresh tokens for that user (forces re-login everywhere).
- **Input validation**: express-validator on every mutating route.
- **Headers/hardening**: helmet, hpp (param pollution), express-mongo-sanitize + xss-clean (input sanitization), body size limits (10kb), CORS locked to `CLIENT_URL` with credentials.
- **Authorization**: role-based (`authorize('vendor','admin')`) plus ownership checks (`loadOwnVendorOrAdmin`, `canModifyFood`) so a vendor can only touch their own resources, while admin routes and admin-role requests bypass ownership by design.
- **SQL injection**: every query is parameterized (`$1, $2...`), no string concatenation.
- **Media uploads**: images/videos come in as an in-memory buffer (multer memory storage, 50MB cap, MIME-type allowlist) and are streamed directly to Cloudinary server-side — the API never accepts a client-supplied media URL, and old assets are deleted from Cloudinary when replaced or removed so nothing orphans.

---

## 6. API Endpoints

Base URL: `/api`

### Auth (`/api/auth`)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/register` | Public | `role: customer\|vendor`. Vendors must also send `businessName`. |
| POST | `/login` | Public | |
| POST | `/refresh` | Public (cookie) | Rotates refresh token, returns new access token. |
| POST | `/logout` | Public | Revokes the current refresh token. |
| POST | `/forgot-password` | Public | Rate-limited. Sends reset email via Resend. |
| POST | `/reset-password` | Public | `{ token, password }`. |
| GET | `/me` | Authenticated | Current user profile. |

### Vendors (`/api/vendors`)
| Method | Path | Access |
|---|---|---|
| GET | `/` | Public — approved vendors only |
| GET | `/:id` | Public |
| GET | `/me` | Vendor — own profile |
| PUT | `/me` | Vendor — update own profile (text fields) |
| PUT | `/me/logo` | Vendor — `multipart/form-data`, `media` field, **image only**, uploaded to Cloudinary |
| PUT | `/me/banner` | Vendor — `multipart/form-data`, `media` field, image **or short video**, uploaded to Cloudinary |

### Foods (`/api/foods`)
| Method | Path | Access |
|---|---|---|
| GET | `/` | Public — filter by `search`, `category`, `vendorId` |
| GET | `/:id` | Public |
| POST | `/` | Vendor (own) / Admin — `multipart/form-data`, optional `media` file (image or short video, uploaded directly to Cloudinary) |
| PUT | `/:id` | Owning vendor / Admin — same `media` field to replace |
| DELETE | `/:id` | Owning vendor / Admin — also removes the Cloudinary asset |

### Cart (`/api/cart`) — customer only
| Method | Path |
|---|---|
| POST | `/` `{ foodId, quantity }` |
| GET | `/` |
| PUT | `/:id` `{ quantity }` (0 removes the item) |
| DELETE | `/:id` |

### Orders (`/api/orders`)
| Method | Path | Access | Notes |
|---|---|---|---|
| POST | `/` | Customer | Checks out the whole cart; splits into one order per vendor. |
| GET | `/` | Any authenticated role | Role-scoped: customer→own, vendor→own vendor's, admin→all. |
| GET | `/:id` | Owner / owning vendor / admin | |
| PUT | `/:id` | Vendor (own) / Admin | `{ status }` — vendors restricted to valid transitions (`pending→preparing→ready→delivered`, or `→cancelled`); admin can force any status. |

### Admin (`/api/admin`) — super admin only
Full CRUD, including **override control of every vendor's products**:

- `GET/POST /users`, `GET/PUT /users/:id`, `PUT /users/:id/role`, `PUT /users/:id/status`, `DELETE /users/:id`
- `GET/POST /vendors`, `PUT /vendors/:id`, `PUT /vendors/:id/status` (approve/suspend/reject), `DELETE /vendors/:id`
- `GET/POST /foods`, `PUT /foods/:id`, `DELETE /foods/:id` — works on **any** vendor's food via `vendorId`, `multipart/form-data` with a `media` field (image or short video)
- `GET /orders`, `PUT /orders/:id` — force-update any order's status
- `GET/POST /ads`, `PUT /ads/:id`, `DELETE /ads/:id` — `multipart/form-data` with a `media` field; body: `title`, `placement` (`top`/`middle`/`bottom`, required), `page` (defaults to `all`), `linkUrl`, `displayOrder`, `startsAt`/`endsAt` (optional scheduling window)
- `GET /analytics` — counts by role/status + total revenue

All list endpoints support `?page=&limit=` pagination.

### Ads (`/api/ads`) — public
| Method | Path | Notes |
|---|---|---|
| GET | `/?placement=top&page=home` | Returns currently-active ads for a placement/page. `placement` is one of `top`, `middle`, `bottom`. Ads with `page = 'all'` are returned for every page requested; omit `page` to get all placements' global ads. |

**Placement convention** — the frontend is expected to render a top/middle/bottom ad slot on every page **except the registration page**, calling this endpoint per slot (e.g. `GET /api/ads?placement=top&page=vendors`). Excluding registration is a frontend rendering decision; the API itself is page-agnostic and simply won't be called from that page.

---

## 7. Deploying to Railway

1. Push this `server/` folder to a GitHub repo.
2. In Railway: **New Project → Deploy from GitHub repo**.
3. **Add a PostgreSQL plugin** to the project — Railway auto-injects `DATABASE_URL`.
4. In the service's **Variables** tab, add: `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `CLIENT_URL`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, `SUPER_ADMIN_FULLNAME`, `NODE_ENV=production`, `PGSSL=true`.
5. Set the **start command** to `node server.js` (already declared in `railway.json`).
6. After the first deploy, open a Railway shell (or a one-off run) and execute `npm run migrate` then `npm run seed` to create the schema and the first super admin.
7. **Media storage**: all images and short videos (food photos, vendor logos/banners, ads) are uploaded straight from the client's device to Cloudinary — nothing is written to Railway's disk, so there's no ephemeral-storage concern to work around.

---

## 8. Database Schema Summary

`users` (role: customer/vendor/admin) → `vendors` (1:1, status: pending/approved/suspended/rejected) → `foods` → `cart_items` / `orders` → `order_items`, plus `password_reset_tokens` and `refresh_tokens` for auth flows, and a standalone `ads` table (placement: top/middle/bottom) for admin-managed ad slots. See `database/schema.sql` for full DDL, constraints, and indexes.
