# Broker Mancer compact site — on-site MANCER swap

Added:
- Reown AppKit / WalletConnect
- Compact Skeleton-like UI
- On-site ETH -> MANCER swap panel
- Uniswap Trading API backend proxy in `api/uniswap.js`
- X and OpenSea buttons in header and footer
- Existing mint / approve / live on-chain SVG / balances / counters preserved

## Important: Uniswap API key

The direct swap uses the official Uniswap Trading API. The key is intentionally NOT included in frontend code.

1. Create an API key in the Uniswap Developer Platform.
2. In Vercel -> Project -> Settings -> Environment Variables add:
   `UNISWAP_API_KEY=...`
3. Redeploy.

Robinhood Chain is chainId 4663 and the integration requests Universal Router 2.1.1.

## X / OpenSea URLs

Set:
- `VITE_X_URL`
- `VITE_OPENSEA_URL`

The current `.env.example` contains placeholders because the final Broker Mancer X account and OpenSea collection URLs were not supplied.

## Local development

For the Vercel API route use:

npm install
npx vercel dev

Plain `npm run dev` starts Vite only and does not emulate `/api/uniswap`.


## Swap input tokens

The on-site swap now supports:
- Native ETH
- USDG on Robinhood Chain

Canonical Robinhood Chain USDG:
`0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168`

USDG decimals are read directly from the token contract at runtime.
For USDG swaps the site uses Uniswap `/check_approval` first, executes any returned Permit2 approval transaction, then requests the quote and builds the swap.
