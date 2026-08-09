export const CHAIN_ID = 4663;
export const CHAIN_ID_HEX = "0x1237";
export const RPC_URL = "https://rpc.mainnet.chain.robinhood.com";
export const EXPLORER = "https://robinhoodchain.blockscout.com";

export const NFT_ADDRESS = "0x79735e269682710ADA3A8B1783eAAa6617b60E7e";
export const RENDERER_ADDRESS = "0x67Ac4Bae060cBa34e3A5c0886000f59433Ea6cBe";
export const MANCER_ADDRESS = "0xc72F232a6869e6CF34dC06129AfFD07F8a2a246A";
export const BRCER_ADDRESS = "0x217a31E1B645a8Dd532e2e3A22703804eB8FE09a";

export const MAX_SUPPLY = 4444n;
export const BRCER_PER_NFT = 5000n;

export const NFT_ABI = [
  "function totalSupply() view returns (uint256)",
  "function maxSupply() view returns (uint256)",
  "function mintPrice() view returns (uint256)",
  "function publicMintOpen() view returns (bool)",
  "function mint(uint256 quantity)",
  "function tokenURI(uint256 tokenId) view returns (string)",
  "function balanceOf(address owner) view returns (uint256)"
];

export const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
  "function totalSupply() view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

export const RENDERER_ABI = [
  "function svg(uint256 seed) view returns (string)"
];
