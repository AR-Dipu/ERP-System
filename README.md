# ERP System — Product Directory & Stock

A private Next.js + TypeScript ERP for one business and one stock location, with Supabase PostgreSQL, email/password authentication, and private product photos. Existing `hello.js` and `.vscode` files have been preserved.

## Start locally (no hosting account needed for the preview)

Requires Node.js 20.9 or later and npm.

```powershell
cd "D:\irinfo\Test new"
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase configuration, the app shows a **read-only sample preview**. Sample data is never written to your database. Saving and real logins require the configuration below. Both environment values must be present to leave preview mode; an invalid configured database shows an error rather than falling back to sample records.

## Configure your database and authentication

1. Create a Supabase project. Keep the service-role key private.
2. Open its SQL editor and run every SQL file in `supabase/migrations/` once, in filename order. For an existing installation that has applied the initial migration, apply only `202610250002_product_trash.sql`. It creates the application tables, indexes, row-level security policies, stock functions, and a private `product-photos` bucket. For later schema changes, add new migrations; do not rerun or edit an already applied migration.
3. Copy `.env.example` to `.env.local`, then fill in:

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your project's HTTPS API URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Project publishable key, safe for the browser with the supplied RLS policies |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only legacy service-role key, used only for invitations and membership creation |
| `APP_URL` | `http://localhost:3000` locally, your exact HTTPS origin in production |

Do not commit `.env.local` or prefix the service-role key with `NEXT_PUBLIC_`. Restart the server after changing configuration.

4. In Supabase Authentication settings, **disable new user signups**. Enable email/password login, require at least 10-character passwords, and configure production SMTP for invitation and recovery delivery.
5. Set Site URL to the same value as `APP_URL`. Add the following allowed redirect URL for each environment you use:

```text
http://localhost:3000/auth/callback?next=/password
https://YOUR-DOMAIN/auth/callback?next=/password
```

Use the exact host you use in the browser (localhost and 127.0.0.1 are different hosts).

6. Configure authentication email templates to verify the token on this application's callback route, including invitations opened in a different browser. Set the **Invite user** template link to:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=invite">Accept invitation and set password</a>
```

Set the **Reset password** template link to:

```html
<a href="{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery">Reset password</a>
```

The app always supplies `/auth/callback?next=/password` as RedirectTo for these operations. The callback also supports PKCE `code` links, but the token-hash templates above avoid relying on the inviting administrator's browser verifier. Do not put links through analytics redirects or expose tokens in logs. If a link is expired, request a new recovery email from the sign-in screen.

## Bootstrap the first administrator

In Supabase Authentication → Users, create a user with your own email, a strong password, and email confirmation enabled. Then run the following in the SQL editor, replacing the email with your actual account:

```sql
insert into public.members (id, email, role, active)
select id, email, 'admin', true
from auth.users
where lower(email) = lower('YOUR-EMAIL@example.com')
on conflict (id) do update
set email = excluded.email, role = 'admin', active = true;
```

Verify exactly one intended user was added, then sign in at `/login`. There is no default password and no public signup form. Additional accounts are invited through **Team & access**. Admins can change roles or deactivate members; the final active admin cannot be demoted or deactivated. Membership is checked in server operations and PostgreSQL policies on every request. Deactivation blocks new requests even with a previously issued session. Private photo signed URLs expire after one hour; an already issued URL remains usable until it expires.

## How to use

1. Add manufacturers and suppliers under **Companies**. Select one or both relationship types and a company country.
2. Add a **Product** with a unique code, manufacturing country, stock unit, category, optional manufacturer, and any suppliers. Category names are created as needed. Prices are optional, USD, with two decimal places. Stock quantities support three decimals.
3. Open product details and record **Opening stock** if this is the first movement. Otherwise use **Receipt**, **Issue**, or a signed **Adjustment**. Reasons are required. The server records the acting user and time automatically.
4. Search product names, codes, companies, or notes. Use the single Origin filter before Company, Category, and Stock status. Origin matches the product manufacturing country or any linked manufacturer/supplier country; selected filters combine with AND. Product and company country fields remain separate in saved records. Low stock includes zero-stock products. Export the current filtered results as CSV.
5. Use **Stock movements** to filter and export permanent history, including archived products. Dates display in Asia/Dhaka. Receipt and opening values add stock, issue values subtract it, and adjustments accept positive or negative changes.
6. Use the row actions under each product name to View, Edit, Archive, or Move to Trash. Active, Archived, and Trash tabs show counts. Archived products can be restored or moved to Trash. Trashed products can be viewed and restored; their former active/archived state is preserved. Archive and Trash show confirmation dialogs. Trashed products are excluded from normal search, dashboard totals, and stock-entry choices. They cannot be edited or receive stock movements. Quantities, photos, company links, and history remain intact; there is no permanent deletion. Company records continue to support archiving and restoration. A product's stock unit cannot change once movements exist, so historical quantities keep their meaning.

Viewers can read all workspace products, quantities, company contacts, prices, and history, and export records. Only admins can change data or membership. There are no separate customer or tenant workspaces in this version.

## Deploy to Vercel

1. Put the project in your own Git repository, excluding `.env.local`, `.next`, and `node_modules`.
2. Import it into Vercel as a Next.js application. Set the four environment variables above for the intended deployment environment; point them at the correct Supabase project.
3. Set `APP_URL` to your stable HTTPS production origin. Configure Supabase Site URL, redirect allowlist, and email templates for that origin before sending invitations.
4. Run `npm test` and `npm run build`, then deploy. Avoid using the production database for temporary preview deployments.
5. Complete the live acceptance checks below before entering business stock. Configure database backups in your Supabase project and verify the restore process appropriate to your chosen service plan. CSV export is useful for records but is not a complete database/photo backup.

No cloud accounts, resources, or deployment were created automatically. You can develop the sample preview without hosting, but real shared persistence and account flows require configured Supabase resources.

## Verification

```powershell
npm test
npm run typecheck
npm run build
```

The tests use the actual migration in isolated PGlite PostgreSQL, with local stubs for Supabase Auth and Storage metadata. They verify filtering, CSV escaping/formula protection, numeric validation, product-code uniqueness, stock arithmetic, idempotency, insufficient-stock rollback, overlapping submitted issues, archiving, membership policies, private photo policies, and last-admin protection. No real user data or email service is used. Tests also cover the additive Trash migration, preservation and restoration of archived state, denied edits/stock operations while trashed, admin-only trash/restore, unified Origin matching, and exports matching the visible view.

PGlite is a single-connection runtime: its overlapping-request test verifies queued calls, not two independent PostgreSQL sessions. The deployed stock RPC additionally uses per-request advisory locks and product-row locks. Verify competing requests on the configured PostgreSQL service as part of live acceptance.

### Live acceptance checklist

- Sign in as the bootstrapped admin; save a company and product with a photo; verify it on a second browser or device.
- Confirm duplicate product codes and invalid numbers show errors without creating partial records.
- Send a viewer invitation, open it in a separate browser, set a password, and verify login and password recovery. Expired links must show a usable error.
- Confirm viewers cannot change products, stock, members, or photos through the UI or direct API/RPC calls. An uninvited or deactivated user must see no business records.
- Receive stock, issue it, adjust it, and retry the same stock request ID. Confirm exactly one ledger entry for a repeated request.
- From two admin sessions, issue quantities that together exceed available stock; only one must succeed, and the balance must never be negative.
- Confirm a failed save preserves form values and shows an error. Refresh and verify no partial stock change exists.
- Combine Origin with Company, Category, and Stock status, then check CSV rows match the visible status tab and filtered results. Test product, manufacturer, and supplier countries separately.
- Test navigation, forms, and tables on a phone; verify keyboard dialog focus, Escape-to-close, and horizontal table scrolling.

## Structure and boundaries

- `app/` — routes, account callback, responsive styles, error/loading screens.
- `components/` — workspace UI and accessible dialog/forms.
- `lib/` — server-only Supabase access, membership checks, actions, types, search and validation.
- `supabase/migrations/` — transactional stock functions, schema, indexes and authorization.
- `tests/` — domain and PostgreSQL integration tests.

The first version loads shared records in explicit 1,000-row database batches, then filters them in the browser; it does not silently truncate at the Supabase default limit. For substantially larger catalogs, move filtering and table pagination to server queries. Product photos are private JPEG/PNG/WebP files up to 5 MB. Replaced/removed photo objects are retained to avoid deleting files still referenced by concurrent edits; an admin maintenance process can clean unreferenced objects later.

Out of scope: purchasing, sales, invoicing, accounting, multiple warehouses, batches/expiry, product variants, spreadsheet imports, and currency conversion.

## Interface updates

The application is named **ERP System**. Navigation is Overview → Companies → Products → Stock movements. Overview is read-only apart from navigation; Add product lives on Products. The interface uses a professional light theme with white panels, a cool-gray background, blue navigation and primary actions, and green/amber/red reserved for status. Product tables use a dedicated action column at 1280px and above; smaller screens show cards with readable details and visible actions. Forms and dialogs share a consistent Cancel/Save footer. CSV downloads use the `erp-system-` prefix and include product state. Historical movements stay visible with Archived or In Trash labels. GitHub upload remains postponed.
