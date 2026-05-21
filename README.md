# Shop Inventory AI

AI-assisted inventory and ordering app for a small shop. It is designed for iPhone use and deploys on Cloudflare Pages with Pages Functions and D1.

## Features

- Item quantity controls with plus/minus buttons
- SMS/group-chat order message generation
- Daily record saving for learning
- Inventory prediction using recent history, weekday pattern, and trend
- Apply predicted quantities to the current list
- Add custom items
- Drinks section included
- Cloudflare D1 database storage
- Local fallback mode before Cloudflare DB is connected

## Project Structure

```text
public/                 Frontend
functions/api/           Cloudflare Pages Functions backend
migrations/              D1 database schema
wrangler.toml            Cloudflare configuration
```

## Open Locally

Open `index.html` in a browser to use local fallback mode. Buttons work without Cloudflare, and data is saved in the browser.

## Cloudflare Deploy

1. Push this repository to GitHub.
2. In Cloudflare Dashboard, go to Workers & Pages.
3. Create a Pages project from this GitHub repository.
4. Leave Build command empty.
5. Set Build output directory to `public`.
6. Create a D1 database.
7. Add a Pages Functions binding in the Cloudflare dashboard:
   - Binding name: `DB`
   - Database: your D1 database
8. Run `migrations/0001_initial.sql` in the D1 console or with Wrangler.
9. Redeploy the Pages project.

## Wrangler

```bash
npm install
npm run db:create
npm run db:migrate:remote
```

This project is set up for dashboard-managed Cloudflare Pages settings. There is no committed `wrangler.toml`, so bindings can be added from the Cloudflare dashboard.

## Prediction Logic

The app starts simple and improves as daily records build up. The prediction combines:

- Recent 5-record average
- Same weekday average
- Last saved quantity
- Recent trend

Before sending an order, check the predicted quantities, adjust anything wrong, then save again. That feedback loop is how the app learns the shop's real pattern.

## Cloudflare Docs

- Pages Functions bindings: https://developers.cloudflare.com/pages/functions/bindings/
- Pages Wrangler configuration: https://developers.cloudflare.com/pages/functions/wrangler-configuration/
