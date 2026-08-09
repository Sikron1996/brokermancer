export const SITE_CONFIG = {
  walletConnectProjectId: "4f71172824a0ea69b0270161482356fe",

  chainId: 4663,
  chainIdHex: "0x1237",
  caipNetworkId: "eip155:4663",
  chainName: "Robinhood Chain",
  rpcUrl: "https://rpc.mainnet.chain.robinhood.com/",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18
  },

  explorerBaseUrl: "https://robinhoodchain.blockscout.com",
  xUrl: import.meta.env.VITE_X_URL || "https://x.com/BrokerMancer",
  openSeaUrl: import.meta.env.VITE_OPENSEA_URL || "https://opensea.io/collection/broker-mancer",
  siteUrl: typeof window !== "undefined" ? window.location.origin : "https://broker-mancer.vercel.app"
};
