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
  siteUrl: typeof window !== "undefined" ? window.location.origin : "https://broker-mancer.vercel.app"
};
