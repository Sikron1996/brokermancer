# Broker Mancer — Premium redesign

Preserved:
- Reown AppKit / WalletConnect
- ETH + USDG -> MANCER on-site swap
- Uniswap server API route
- live on-chain SVG renderer
- approve + mint
- 5,000 BRCER reward
- live supply/balances
- OpenSea / X configuration

Changed:
- complete premium visual redesign
- tighter high-end layout
- layered on-chain NFT hero
- refined typography / spacing / glass panels
- desktop and mobile responsive layouts
- custom pixel Broker Mancer favicon (`public/favicon.svg`)

Run on Vercel locally:
npm install
npx vercel dev


## Live Mint Activity
- Reads the existing `Minted(address,uint256,uint256)` event from the deployed NFT contract.
- Shows the latest 8 public mint events.
- Live listener adds new mints without a page reload.
- 20-second refresh is included as a fallback.
- Each activity row links directly to the Robinhood Chain transaction.
- No contract redeploy is required.
