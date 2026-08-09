import { useCallback, useEffect, useMemo, useState } from "react";
import { BrowserProvider, Contract, JsonRpcProvider, formatUnits, parseEther, parseUnits } from "ethers";
import {
  useAppKit,
  useAppKitAccount,
  useAppKitNetwork,
  useAppKitProvider
} from "@reown/appkit/react";
import {
  BRCER_ADDRESS, CHAIN_ID, ERC20_ABI, EXPLORER, MANCER_ADDRESS, USDG_ADDRESS,
  MAX_SUPPLY, NFT_ABI, NFT_ADDRESS, RENDERER_ABI, RENDERER_ADDRESS, RPC_URL
} from "./constants";
import { robinhoodChain } from "./appkit";
import { SITE_CONFIG } from "./config";
import "./styles.css";

const readProvider = new JsonRpcProvider(RPC_URL);
const ZERO = "0x0000000000000000000000000000000000000000";

const short = (a) => a ? `${a.slice(0,6)}…${a.slice(-4)}` : "";
const svgData = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const fmt = (v,d=18,max=2) => {
  try { return Number(formatUnits(v,d)).toLocaleString(undefined,{maximumFractionDigits:max}); }
  catch { return "0"; }
};

function Logo(){
  return <div className="logo"><b>BROKER</b><strong>MANCER</strong></div>;
}
function Stat({label,value,accent=false}){
  return <div className={"stat "+(accent?"accent":"")}><span>{label}</span><b>{value}</b></div>;
}
async function uni(action,payload){
  const response = await fetch("/api/uniswap",{
    method:"POST",
    headers:{"content-type":"application/json"},
    body:JSON.stringify({action,payload})
  });
  const data = await response.json();
  if(!response.ok) throw new Error(data?.detail || data?.error || data?.message || "Swap API error");
  return data;
}

export default function App(){
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { chainId, switchNetwork } = useAppKitNetwork();
  const { walletProvider } = useAppKitProvider("eip155");

  const [minted,setMinted] = useState(0n);
  const [mintPrice,setMintPrice] = useState(250n*10n**18n);
  const [mintOpen,setMintOpen] = useState(false);
  const [brcerSupply,setBrcerSupply] = useState(0n);
  const [mancerBalance,setMancerBalance] = useState(0n);
  const [brcerBalance,setBrcerBalance] = useState(0n);
  const [nftBalance,setNftBalance] = useState(0n);
  const [allowance,setAllowance] = useState(0n);
  const [qty,setQty] = useState(1);
  const [previews,setPreviews] = useState([]);
  const [status,setStatus] = useState("");
  const [busy,setBusy] = useState(false);
  const [activity,setActivity] = useState([]);
  const [activityLoading,setActivityLoading] = useState(true);

  const [payToken,setPayToken] = useState("ETH");
  const [swapAmount,setSwapAmount] = useState("0.01");
  const [usdgDecimals,setUsdgDecimals] = useState(6);
  const [quote,setQuote] = useState(null);
  const [quoting,setQuoting] = useState(false);
  const [swapping,setSwapping] = useState(false);

  const totalCost = useMemo(()=>mintPrice*BigInt(Math.max(1,qty||1)),[mintPrice,qty]);

  const refresh = useCallback(async(addr=address)=>{
    const nft = new Contract(NFT_ADDRESS,NFT_ABI,readProvider);
    const mancer = new Contract(MANCER_ADDRESS,ERC20_ABI,readProvider);
    const brcer = new Contract(BRCER_ADDRESS,ERC20_ABI,readProvider);
    const [s,p,o,b] = await Promise.all([
      nft.totalSupply(), nft.mintPrice(), nft.publicMintOpen(), brcer.totalSupply()
    ]);
    setMinted(s); setMintPrice(p); setMintOpen(o); setBrcerSupply(b);
    if(addr){
      const [mb,bb,nb,al] = await Promise.all([
        mancer.balanceOf(addr), brcer.balanceOf(addr),
        nft.balanceOf(addr), mancer.allowance(addr,NFT_ADDRESS)
      ]);
      setMancerBalance(mb); setBrcerBalance(bb); setNftBalance(nb); setAllowance(al);
    }
  },[address]);

  useEffect(()=>{
    refresh().catch(console.error);
    const id=setInterval(()=>refresh().catch(()=>{}),12000);
    return()=>clearInterval(id);
  },[refresh]);

  useEffect(()=>{
    const r = new Contract(RENDERER_ADDRESS,RENDERER_ABI,readProvider);
    Promise.all([777n,1313n,2222n,3333n].map(seed=>r.svg(seed)))
      .then(x=>setPreviews(x.map(svgData))).catch(console.error);
  },[]);

  useEffect(()=>{
    const usdg = new Contract(USDG_ADDRESS, ERC20_ABI, readProvider);
    usdg.decimals().then(d=>setUsdgDecimals(Number(d))).catch(()=>setUsdgDecimals(6));
  },[]);

  async function getSigner(){
    if(!walletProvider || !address){
      await open({view:"Connect"});
      throw new Error("Wallet not connected");
    }
    if(Number(chainId)!==CHAIN_ID) await switchNetwork(robinhoodChain);
    const p = new BrowserProvider(walletProvider);
    return p.getSigner();
  }

  async function sendBuiltTx(txData, signer, label){
    if(!txData?.to || !txData?.data) return;
    setStatus(label);
    const tx = await signer.sendTransaction({
      to: txData.to,
      data: txData.data,
      value: BigInt(txData.value || "0"),
      ...(txData.gasLimit ? {gasLimit: BigInt(txData.gasLimit)} : {})
    });
    await tx.wait();
  }

  async function getQuote(){
    try{
      if(!isConnected || !address) return open({view:"Connect"});
      const amount = payToken === "ETH"
        ? parseEther(swapAmount || "0")
        : parseUnits(swapAmount || "0", usdgDecimals);

      if(amount<=0n) throw new Error(`Enter ${payToken} amount.`);

      setQuoting(true);
      setStatus(`Getting live ${payToken} → $MANCER quote…`);

      // ERC-20 input needs Permit2 approval check before quote/swap.
      if(payToken === "USDG"){
        const approval = await uni("check_approval",{
          walletAddress: address,
          token: USDG_ADDRESS,
          amount: amount.toString(),
          chainId: CHAIN_ID,
          tokenOut: MANCER_ADDRESS,
          tokenOutChainId: CHAIN_ID
        });

        if(approval.cancel || approval.approval){
          const s = await getSigner();
          if(approval.cancel){
            await sendBuiltTx(approval.cancel, s, "Resetting USDG approval…");
          }
          if(approval.approval){
            await sendBuiltTx(approval.approval, s, "Approving USDG for swap…");
          }
        }
      }

      const data = await uni("quote",{
        swapper: address,
        tokenInChainId: CHAIN_ID,
        tokenOutChainId: CHAIN_ID,
        tokenIn: payToken === "ETH" ? ZERO : USDG_ADDRESS,
        tokenOut: MANCER_ADDRESS,
        amount: amount.toString(),
        type: "EXACT_INPUT",
        routingPreference: "BEST_PRICE",
        slippageTolerance: 0.5
      });

      setQuote(data);
      setStatus("Quote ready ✓");
    }catch(e){
      setQuote(null);
      setStatus(e.shortMessage || e.reason || e.message);
    }finally{
      setQuoting(false);
    }
  }

  async function swapToMancer(){
    try{
      if(!quote) return getQuote();
      setSwapping(true); setStatus("Preparing swap…");
      const s = await getSigner();

      let signature;
      if(quote.permitData){
        signature = await s.signTypedData(
          quote.permitData.domain,
          quote.permitData.types,
          quote.permitData.values
        );
      }

      const payload = { quote: quote.quote };
      if(quote.permitData){
        payload.signature = signature;
        payload.permitData = quote.permitData;
      }

      const built = await uni("swap",payload);
      if(!built.swap?.to || !built.swap?.data) throw new Error("Invalid swap transaction.");

      setStatus("Confirm swap in wallet…");
      const tx = await s.sendTransaction({
        to: built.swap.to,
        data: built.swap.data,
        value: BigInt(built.swap.value || "0"),
        ...(built.swap.gasLimit ? {gasLimit: BigInt(built.swap.gasLimit)} : {})
      });
      setStatus("Swap sent. Waiting…");
      await tx.wait();
      setQuote(null);
      await refresh(address);
      setStatus("$MANCER received ✓");
    }catch(e){
      setStatus(e.shortMessage||e.reason||e.message);
    }finally{
      setSwapping(false);
    }
  }

  async function approve(){
    try{
      setBusy(true); setStatus("Approving $MANCER…");
      const s=await getSigner();
      const token=new Contract(MANCER_ADDRESS,ERC20_ABI,s);
      const tx=await token.approve(NFT_ADDRESS,totalCost);
      await tx.wait();
      await refresh(address);
      setStatus("$MANCER approved ✓");
    }catch(e){ if(e.message!=="Wallet not connected") setStatus(e.shortMessage||e.reason||e.message); }
    finally{ setBusy(false); }
  }

  async function mint(){
    try{
      if(!mintOpen) return setStatus("Mint is closed.");
      if(allowance<totalCost) return setStatus("Approve $MANCER first.");
      setBusy(true); setStatus(`Minting ${qty} NFT…`);
      const s=await getSigner();
      const nft=new Contract(NFT_ADDRESS,NFT_ABI,s);
      const tx=await nft.mint(BigInt(qty));
      await tx.wait();
      await refresh(address);
      setStatus(`Minted ✓ +${qty*5000} $BRCER`);
    }catch(e){ if(e.message!=="Wallet not connected") setStatus(e.shortMessage||e.reason||e.message); }
    finally{ setBusy(false); }
  }

  const remaining = MAX_SUPPLY>minted ? MAX_SUPPLY-minted : 0n;
  const pct = Math.min(100,(Number(minted)/4444)*100);
  const approved = allowance>=totalCost;
  const canMint = mancerBalance>=totalCost;

  // Quote schema can vary by routing type. This helper tries common output fields.
  const quotedMancer = (() => {
    try {
      const q = quote?.quote;
      const raw =
        q?.output?.amount ||
        q?.outputAmount ||
        q?.amountOut ||
        q?.aggregatedOutputs?.[0]?.amount ||
        q?.route?.[0]?.[0]?.amountOut;
      return raw ? fmt(BigInt(raw),18,2) : null;
    } catch { return null; }
  })();

  const activityAbi = [
    "event Minted(address indexed to,uint256 indexed tokenId,uint256 seed)"
  ];

  function ago(ts){
    if(!ts) return "";
    const sec = Math.max(0, Math.floor(Date.now()/1000) - Number(ts));
    if(sec < 10) return "just now";
    if(sec < 60) return `${sec}s ago`;
    if(sec < 3600) return `${Math.floor(sec/60)}m ago`;
    return `${Math.floor(sec/3600)}h ago`;
  }

  const loadActivity = useCallback(async()=>{
    try{
      const nft = new Contract(NFT_ADDRESS, activityAbi, readProvider);
      const latest = await readProvider.getBlockNumber();
      const fromBlock = Math.max(0, latest - 25000);
      const events = await nft.queryFilter(nft.filters.Minted(), fromBlock, latest);
      const recent = events.slice(-8).reverse();

      const rows = await Promise.all(recent.map(async(ev)=>{
        let blockTs = 0;
        try{
          const block = await readProvider.getBlock(ev.blockNumber);
          blockTs = block?.timestamp || 0;
        }catch{}

        return {
          to: ev.args?.to,
          tokenId: ev.args?.tokenId?.toString?.() || "",
          seed: ev.args?.seed?.toString?.() || "",
          txHash: ev.transactionHash,
          blockNumber: ev.blockNumber,
          timestamp: blockTs
        };
      }));

      setActivity(rows);
    }catch(e){
      console.error("Activity load failed", e);
    }finally{
      setActivityLoading(false);
    }
  },[]);

  useEffect(()=>{
    loadActivity();
    const nft = new Contract(NFT_ADDRESS, activityAbi, readProvider);

    const onMint = async(to, tokenId, seed, event)=>{
      let blockTs = 0;
      try{
        const block = await readProvider.getBlock(event.log.blockNumber);
        blockTs = block?.timestamp || 0;
      }catch{}

      setActivity(prev => [{
        to,
        tokenId: tokenId.toString(),
        seed: seed.toString(),
        txHash: event.log.transactionHash,
        blockNumber: event.log.blockNumber,
        timestamp: blockTs
      }, ...prev.filter(x=>x.txHash!==event.log.transactionHash || x.tokenId!==tokenId.toString())].slice(0,8));
    };

    nft.on("Minted", onMint);
    const timer = setInterval(loadActivity, 20000);

    return ()=>{
      clearInterval(timer);
      nft.off("Minted", onMint);
    };
  },[loadActivity]);

  return <main className="premium-shell">
    <div className="ambient ambient-a"/>
    <div className="ambient ambient-b"/>
    <div className="grain"/>

    <header className="premium-header">
      <Logo/>
      <div className="nav-center">
        <span className={mintOpen?"live":"closed"}>{mintOpen?"● MINT LIVE":"● CLOSED"}</span>
        <span>{minted.toString()} / 4,444</span>
      </div>
      <div className="head-actions">
        <a className="icon-link" href={SITE_CONFIG.openSeaUrl} target="_blank" rel="noreferrer">OS</a>
        <a className="icon-link" href={SITE_CONFIG.xUrl} target="_blank" rel="noreferrer">𝕏</a>
        <button className="connect-premium" onClick={()=>open({view:isConnected?"Account":"Connect"})}>
          <i/>{isConnected&&address?short(address):"CONNECT"}
        </button>
      </div>
    </header>

    <div className="premium-page">
      <section className="hero-premium">
        <div className="hero-copy-premium">
          <div className="micro-label"><i/> 4,444 FULLY ON-CHAIN BROKERS</div>
          <h1>BROKER<br/><em>MANCER</em></h1>
          <p>Born on-chain. Minted with <b>$MANCER</b>.<br/>Every Broker unlocks <b>5,000 $BRCER</b>.</p>

          <div className="hero-numbers">
            <div><span>MINTED</span><b>{minted.toString()}</b></div>
            <div><span>REMAINING</span><b>{remaining.toString()}</b></div>
            <div><span>$BRCER ISSUED</span><b>{fmt(brcerSupply,18,0)}</b></div>
          </div>
          <div className="premium-progress"><i style={{width:`${pct}%`}}/></div>
        </div>

        <div className="hero-gallery">
          {previews.slice(0,4).map((src,i)=>
            <div className={`premium-nft nft-${i}`} key={i}>
              <img src={src} alt={`Broker Mancer ${i+1}`}/>
              <span>ON-CHAIN // {String([777,1313,2222,3333][i]).padStart(4,"0")}</span>
            </div>
          )}
        </div>
      </section>

      <section className="trade-deck">
        <article className="glass-card swap-premium">
          <div className="card-head">
            <div><small>01</small><h2>Acquire $MANCER</h2></div>
            <span>SWAP ON-SITE</span>
          </div>

          <div className="token-tabs">
            <button className={payToken==="ETH"?"active":""} onClick={()=>{setPayToken("ETH");setSwapAmount("0.01");setQuote(null)}}>ETH</button>
            <button className={payToken==="USDG"?"active":""} onClick={()=>{setPayToken("USDG");setSwapAmount("10");setQuote(null)}}>USDG</button>
          </div>

          <div className="premium-swap-box">
            <div className="amount-side">
              <small>YOU PAY</small>
              <input value={swapAmount} onChange={e=>{setSwapAmount(e.target.value);setQuote(null)}} inputMode="decimal"/>
            </div>
            <div className="asset-pill">{payToken}</div>
          </div>

          <div className="swap-divider"><span>↓</span></div>

          <div className="premium-swap-box output">
            <div className="amount-side">
              <small>YOU RECEIVE</small>
              <strong>{quotedMancer || (quote ? "LIVE QUOTE" : "—")}</strong>
            </div>
            <div className="asset-pill mancer">$MANCER</div>
          </div>

          <div className="fine-row">
            <span>Balance <b>{isConnected?fmt(mancerBalance):"—"}</b></span>
            <span>Slippage <b>0.5%</b></span>
          </div>

          {!isConnected ? (
            <button className="premium-cta dark" onClick={()=>open({view:"Connect"})}>CONNECT WALLET</button>
          ) : !quote ? (
            <button className="premium-cta dark" disabled={quoting} onClick={getQuote}>{quoting?"FETCHING QUOTE…":"GET LIVE QUOTE"}</button>
          ) : (
            <button className="premium-cta dark" disabled={swapping} onClick={swapToMancer}>{swapping?"SWAPPING…":`SWAP ${payToken} → $MANCER`}</button>
          )}
        </article>

        <article className="glass-card mint-premium">
          <div className="card-head">
            <div><small>02</small><h2>Mint Broker</h2></div>
            <span className="reward-chip">+5,000 $BRCER</span>
          </div>

          <div className="mint-price">
            <small>PRICE PER NFT</small>
            <strong>250 <em>$MANCER</em></strong>
          </div>

          <div className="qty-premium">
            <button onClick={()=>setQty(Math.max(1,qty-1))}>−</button>
            <div><b>{qty}</b><small>QUANTITY</small></div>
            <button onClick={()=>setQty(qty+1)}>+</button>
          </div>

          <div className="mint-summary">
            <div><span>TOTAL</span><b>{fmt(totalCost)} $MANCER</b></div>
            <div><span>REWARD</span><b>{(qty*5000).toLocaleString()} $BRCER</b></div>
          </div>

          {!isConnected
            ? <button className="premium-cta" onClick={()=>open({view:"Connect"})}>CONNECT TO MINT</button>
            : !approved
              ? <button className="premium-cta" disabled={busy||!canMint} onClick={approve}>{canMint?"APPROVE $MANCER":"INSUFFICIENT $MANCER"}</button>
              : <button className="premium-cta" disabled={busy||!canMint||!mintOpen} onClick={mint}>{mintOpen?`MINT ${qty} BROKER${qty>1?"S":""}`:"MINT CLOSED"}</button>
          }
        </article>
      </section>

      <section className="activity-card">
        <div className="activity-head">
          <div>
            <small>LIVE</small>
            <h2>Mint Activity</h2>
          </div>
          <span><i/> ON-CHAIN EVENTS</span>
        </div>

        <div className="activity-list">
          {activityLoading && activity.length===0 ? (
            <div className="activity-empty">LOADING RECENT MINTS…</div>
          ) : activity.length===0 ? (
            <div className="activity-empty">NO PUBLIC MINTS YET</div>
          ) : activity.map((item,i)=>(
            <a
              className="activity-row"
              href={`${EXPLORER}/tx/${item.txHash}`}
              target="_blank"
              rel="noreferrer"
              key={`${item.txHash}-${item.tokenId}-${i}`}
            >
              <div className="activity-avatar">
                {previews.length > 0 && <img src={previews[Number(BigInt(item.seed || "0") % BigInt(previews.length))]} alt="Broker"/>}
              </div>
              <div className="activity-wallet">
                <b>{short(item.to)}</b>
                <span>{ago(item.timestamp)}</span>
              </div>
              <div className="activity-token">
                <span>MINTED</span>
                <b>Broker #{item.tokenId}</b>
              </div>
              <div className="activity-value">
                <span>PAID</span>
                <b>250 $MANCER</b>
              </div>
              <div className="activity-reward">
                <span>REWARD</span>
                <b>+5,000 $BRCER</b>
              </div>
              <div className="activity-open">↗</div>
            </a>
          ))}
        </div>
      </section>

      <section className="portfolio-bar">
        <div><span>YOUR $MANCER</span><b>{isConnected?fmt(mancerBalance):"—"}</b></div>
        <div><span>YOUR $BRCER</span><b>{isConnected?fmt(brcerBalance,18,0):"—"}</b></div>
        <div><span>YOUR BROKERS</span><b>{isConnected?nftBalance.toString():"—"}</b></div>
        <div className="portfolio-links">
          <a href={SITE_CONFIG.openSeaUrl} target="_blank" rel="noreferrer">OPENSEA ↗</a>
          <a href={SITE_CONFIG.xUrl} target="_blank" rel="noreferrer">X ↗</a>
        </div>
      </section>

      <footer className="premium-footer">
        <Logo/>
        <span>250 $MANCER → 1 BROKER + 5,000 $BRCER</span>
        <div>
          <a href={`${EXPLORER}/address/${NFT_ADDRESS}`} target="_blank" rel="noreferrer">CONTRACT</a>
          <a href={`${EXPLORER}/token/${BRCER_ADDRESS}`} target="_blank" rel="noreferrer">$BRCER</a>
        </div>
      </footer>
    </div>

    {status&&<div className="status">{status}</div>}
  </main>;
}
