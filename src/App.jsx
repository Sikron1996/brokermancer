import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits } from "ethers";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider
} from "@reown/appkit/react";
import {
  BRCER_ADDRESS,
  CHAIN_ID,
  ERC20_ABI,
  EXPLORER,
  MANCER_ADDRESS,
  MAX_SUPPLY,
  NFT_ABI,
  NFT_ADDRESS,
  RENDERER_ABI,
  RENDERER_ADDRESS,
  RPC_URL
} from "./constants";
import { robinhoodChain } from "./appkit";
import "./styles.css";

const readProvider = new JsonRpcProvider(RPC_URL);

function short(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "";
}

function svgData(svg) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function fmt(value, decimals = 18, max = 2) {
  try {
    return Number(formatUnits(value, decimals)).toLocaleString(undefined, {
      maximumFractionDigits: max
    });
  } catch {
    return "0";
  }
}

function PixelLogo() {
  return (
    <div className="pixel-logo">
      <span>BROKER</span>
      <strong>MANCER</strong>
    </div>
  );
}

export default function App() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider("eip155");

  const [status, setStatus] = useState("");
  const [minted, setMinted] = useState(0n);
  const [mintPrice, setMintPrice] = useState(250n * 10n ** 18n);
  const [mintOpen, setMintOpen] = useState(false);
  const [brcerSupply, setBrcerSupply] = useState(0n);
  const [mancerBalance, setMancerBalance] = useState(0n);
  const [brcerBalance, setBrcerBalance] = useState(0n);
  const [nftBalance, setNftBalance] = useState(0n);
  const [allowance, setAllowance] = useState(0n);
  const [qty, setQty] = useState(1);
  const [previews, setPreviews] = useState([]);
  const [busy, setBusy] = useState(false);

  const totalCost = useMemo(
    () => mintPrice * BigInt(Math.max(1, Number(qty) || 1)),
    [mintPrice, qty]
  );

  const refreshStats = useCallback(async (addr = address) => {
    const nft = new Contract(NFT_ADDRESS, NFT_ABI, readProvider);
    const brcer = new Contract(BRCER_ADDRESS, ERC20_ABI, readProvider);
    const mancer = new Contract(MANCER_ADDRESS, ERC20_ABI, readProvider);

    const [supply, price, openState, bSupply] = await Promise.all([
      nft.totalSupply(),
      nft.mintPrice(),
      nft.publicMintOpen(),
      brcer.totalSupply()
    ]);

    setMinted(supply);
    setMintPrice(price);
    setMintOpen(openState);
    setBrcerSupply(bSupply);

    if (addr) {
      const [mb, bb, nb, al] = await Promise.all([
        mancer.balanceOf(addr),
        brcer.balanceOf(addr),
        nft.balanceOf(addr),
        mancer.allowance(addr, NFT_ADDRESS)
      ]);
      setMancerBalance(mb);
      setBrcerBalance(bb);
      setNftBalance(nb);
      setAllowance(al);
    } else {
      setMancerBalance(0n);
      setBrcerBalance(0n);
      setNftBalance(0n);
      setAllowance(0n);
    }
  }, [address]);

  useEffect(() => {
    refreshStats().catch(console.error);
    const id = setInterval(() => refreshStats().catch(() => {}), 12000);
    return () => clearInterval(id);
  }, [refreshStats]);

  useEffect(() => {
    const renderer = new Contract(RENDERER_ADDRESS, RENDERER_ABI, readProvider);
    Promise.all(
      [777n, 1313n, 2222n, 3333n, 4444n, 5555n].map((seed) => renderer.svg(seed))
    )
      .then((svgs) => setPreviews(svgs.map(svgData)))
      .catch(console.error);
  }, []);

  async function ensureRobinhood() {
    if (Number(chainId) !== CHAIN_ID) {
      await switchNetwork(robinhoodChain);
    }
  }

  async function signer() {
    if (!walletProvider || !address) {
      await open({ view: "Connect" });
      throw new Error("Wallet not connected");
    }
    await ensureRobinhood();
    const provider = new BrowserProvider(walletProvider);
    return provider.getSigner();
  }

  async function connect() {
    setStatus("");
    if (!isConnected) {
      await open({ view: "Connect" });
    } else {
      await open({ view: "Account" });
    }
  }

  async function approve() {
    try {
      setBusy(true);
      setStatus("Approving $MANCER…");
      const s = await signer();
      const mancer = new Contract(MANCER_ADDRESS, ERC20_ABI, s);
      const tx = await mancer.approve(NFT_ADDRESS, totalCost);
      setStatus("Approval sent. Waiting for confirmation…");
      await tx.wait();
      await refreshStats(address);
      setStatus("$MANCER approved ✓");
    } catch (e) {
      if (e.message !== "Wallet not connected") {
        setStatus(e.shortMessage || e.reason || e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function mint() {
    if (!mintOpen) return setStatus("Public mint is currently closed.");

    try {
      setBusy(true);
      if (allowance < totalCost) {
        setStatus("Approve $MANCER first.");
        return;
      }

      const s = await signer();
      setStatus(`Minting ${qty} Broker Mancer…`);

      const nft = new Contract(NFT_ADDRESS, NFT_ABI, s);
      const tx = await nft.mint(BigInt(qty));

      setStatus("Mint sent. Waiting for confirmation…");
      await tx.wait();
      await refreshStats(address);
      setStatus(`Mint complete ✓ +${Number(qty) * 5000} $BRCER`);
    } catch (e) {
      if (e.message !== "Wallet not connected") {
        setStatus(e.shortMessage || e.reason || e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const remaining = MAX_SUPPLY > minted ? MAX_SUPPLY - minted : 0n;
  const pct = (Number(minted) / Number(MAX_SUPPLY)) * 100;
  const canMint = mancerBalance >= totalCost;
  const approved = allowance >= totalCost;

  const uniswapUrl = `https://app.uniswap.org/swap?outputCurrency=${MANCER_ADDRESS}`;

  return (
    <main>
      <div className="noise" />

      <header>
        <PixelLogo />
        <nav>
          <a href="#mint">MINT</a>
          <a href="#collection">ONCHAIN</a>
          <a href={`${EXPLORER}/address/${NFT_ADDRESS}`} target="_blank" rel="noreferrer">CONTRACT</a>
        </nav>
        <button className="wallet" onClick={connect}>
          {isConnected && address ? short(address) : "CONNECT WALLET"}
        </button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">ROBINHOOD CHAIN // FULLY ON-CHAIN</div>
          <h1>BROKER<br/><em>MANCER</em></h1>
          <p>
            4,444 pixel brokers assembled directly from on-chain SVG traits.
            Mint with <b>$MANCER</b>. Receive the NFT and <b>5,000 $BRCER</b>.
          </p>

          <div className="hero-stats">
            <div><b>{minted.toString()}</b><span>MINTED</span></div>
            <div><b>{remaining.toString()}</b><span>REMAINING</span></div>
            <div><b>{fmt(brcerSupply, 18, 0)}</b><span>$BRCER MINTED</span></div>
          </div>
        </div>

        <div className="hero-art">
          <div className="art-stack">
            {previews.slice(0, 3).map((src, i) => (
              <img key={i} src={src} className={`stack-card card-${i}`} alt="Broker Mancer on-chain preview" />
            ))}
          </div>
          <div className="terminal-tag">SVG://ONCHAIN_RENDERER</div>
        </div>
      </section>

      <section className="progress-wrap">
        <div className="progress-label">
          <span>COLLECTION PROGRESS</span>
          <span>{minted.toString()} / 4444</span>
        </div>
        <div className="progress"><i style={{ width: `${Math.min(100, pct)}%` }} /></div>
      </section>

      <section id="mint" className="action-grid">
        <article className="panel swap-panel">
          <div className="panel-num">01</div>
          <div className="panel-title">
            <span>GET THE MINT TOKEN</span>
            <h2>BUY $MANCER</h2>
          </div>

          <div className="token-box">
            <div className="token-icon">M</div>
            <div><b>Mancer</b><span>$MANCER · Robinhood Chain</span></div>
            <div className="token-address">{short(MANCER_ADDRESS)}</div>
          </div>

          <p className="muted">
            Need $MANCER? Open the Uniswap swap interface with MANCER selected,
            buy the amount you need, then return here to mint.
          </p>

          <a className="primary linkbtn" target="_blank" rel="noreferrer" href={uniswapUrl}>
            BUY $MANCER ↗
          </a>

          <div className="balance-line">
            <span>Your MANCER</span>
            <b>{isConnected ? fmt(mancerBalance) : "—"}</b>
          </div>
        </article>

        <article className="panel mint-panel">
          <div className="panel-num">02</div>
          <div className="panel-title">
            <span>MINT THE COLLECTION</span>
            <h2>250 $MANCER / NFT</h2>
          </div>

          <div className="qty-row">
            <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <div><b>{qty}</b><span>NFT</span></div>
            <button onClick={() => setQty(qty + 1)}>+</button>
          </div>

          <div className="receipt">
            <div><span>Mint cost</span><b>{fmt(totalCost)} $MANCER</b></div>
            <div><span>You receive</span><b>{(qty * 5000).toLocaleString()} $BRCER</b></div>
            <div><span>Wallet NFTs</span><b>{isConnected ? nftBalance.toString() : "—"}</b></div>
          </div>

          {!isConnected ? (
            <button className="primary" onClick={() => open({ view: "Connect" })}>
              CONNECT WALLET
            </button>
          ) : !approved ? (
            <button className="primary" disabled={busy || !canMint} onClick={approve}>
              {canMint ? "APPROVE $MANCER" : "NOT ENOUGH $MANCER"}
            </button>
          ) : (
            <button
              className="primary mint-button"
              disabled={busy || !canMint || !mintOpen}
              onClick={mint}
            >
              {!mintOpen
                ? "MINT CLOSED"
                : canMint
                  ? `MINT ${qty} BROKER${qty > 1 ? "S" : ""}`
                  : "NOT ENOUGH $MANCER"}
            </button>
          )}

          {isConnected && address && (
            <button className="account-button" onClick={() => open({ view: "Account" })}>
              CONNECTED: {short(address)}
            </button>
          )}

          <div className={`live ${mintOpen ? "on" : ""}`}>
            <i /> {mintOpen ? "PUBLIC MINT LIVE" : "PUBLIC MINT CLOSED"}
          </div>
        </article>
      </section>

      {status && <div className="status">{status}</div>}

      <section className="wallet-strip">
        <div><span>YOUR $MANCER</span><b>{isConnected ? fmt(mancerBalance) : "CONNECT"}</b></div>
        <div><span>YOUR $BRCER</span><b>{isConnected ? fmt(brcerBalance, 18, 0) : "CONNECT"}</b></div>
        <div><span>YOUR BROKERS</span><b>{isConnected ? nftBalance.toString() : "CONNECT"}</b></div>
      </section>

      <section id="collection" className="collection">
        <div className="section-heading">
          <span>GENERATED BY THE CONTRACT</span>
          <h2>ON-CHAIN BROKERS</h2>
          <p>
            No PNG gallery is used here. These previews are requested directly
            from the deployed renderer contract.
          </p>
        </div>

        <div className="gallery">
          {previews.map((src, i) => (
            <div className="nft-card" key={i}>
              <img src={src} alt="On-chain Broker Mancer SVG" />
              <div>
                <b>SEED // {String([777, 1313, 2222, 3333, 4444, 5555][i]).padStart(4, "0")}</b>
                <span>SVG</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="mechanics">
        <div className="section-heading">
          <span>THE LOOP</span>
          <h2>MANCER → NFT + BRCER</h2>
        </div>

        <div className="loop">
          <div><strong>250</strong><span>$MANCER</span></div>
          <i>→</i>
          <div><strong>1</strong><span>BROKER MANCER</span></div>
          <i>+</i>
          <div><strong>5,000</strong><span>$BRCER</span></div>
        </div>
      </section>

      <footer>
        <PixelLogo />
        <div>
          <a href={`${EXPLORER}/address/${NFT_ADDRESS}`} target="_blank" rel="noreferrer">NFT CONTRACT ↗</a>
          <a href={`${EXPLORER}/token/${BRCER_ADDRESS}`} target="_blank" rel="noreferrer">$BRCER ↗</a>
          <a href={`${EXPLORER}/token/${MANCER_ADDRESS}`} target="_blank" rel="noreferrer">$MANCER ↗</a>
        </div>
        <span>BUILT ON ROBINHOOD CHAIN</span>
      </footer>
    </main>
  );
}
