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

  return <main>
    <div className="bg-grid"/>
    <header>
      <Logo/>
      <div className="header-meta">
        <span className={mintOpen?"live":"closed"}>{mintOpen?"● LIVE":"● CLOSED"}</span>
        <span>{minted.toString()}/4444</span>
      </div>
      <div className="head-actions">
        <a className="social-btn" href={SITE_CONFIG.openSeaUrl} target="_blank" rel="noreferrer">OS</a>
        <a className="social-btn" href={SITE_CONFIG.xUrl} target="_blank" rel="noreferrer">X</a>
        <button className="wallet-btn" onClick={()=>open({view:isConnected?"Account":"Connect"})}>
          {isConnected&&address?short(address):"CONNECT"}
        </button>
      </div>
    </header>

    <div className="page">
      <section className="top">
        <div className="intro card">
          <div className="tag">FULLY ON-CHAIN · ROBINHOOD CHAIN</div>
          <div className="intro-row">
            <div>
              <h1>BROKER <em>MANCER</em></h1>
              <p>Mint pixel brokers with <b>$MANCER</b> and receive <b>5,000 $BRCER</b> per NFT.</p>
            </div>
            <div className="mini-art">
              {previews[0] && <img src={previews[0]} alt="Broker Mancer"/>}
            </div>
          </div>
          <div className="stats-row">
            <Stat label="MINTED" value={minted.toString()} accent/>
            <Stat label="LEFT" value={remaining.toString()}/>
            <Stat label="$BRCER" value={fmt(brcerSupply,18,0)}/>
          </div>
          <div className="progress"><i style={{width:`${pct}%`}}/></div>
        </div>

        <div className="preview-strip card">
          <div className="bar"><span>ON-CHAIN SVG</span><a href={`${EXPLORER}/address/${NFT_ADDRESS}`} target="_blank" rel="noreferrer">CONTRACT ↗</a></div>
          <div className="thumbs">
            {previews.map((src,i)=><img src={src} key={i} alt={`Preview ${i+1}`}/>)}
          </div>
        </div>
      </section>

      <section className="actions">
        <article className="card action-card swap-card">
          <div className="bar"><span>01 / SWAP TO $MANCER</span><b>ON-SITE</b></div>

          <div className="pay-selector">
            <button className={payToken==="ETH"?"active":""} onClick={()=>{setPayToken("ETH");setSwapAmount("0.01");setQuote(null)}}>ETH</button>
            <button className={payToken==="USDG"?"active":""} onClick={()=>{setPayToken("USDG");setSwapAmount("10");setQuote(null)}}>USDG</button>
          </div>

          <div className="swap-input">
            <div>
              <small>YOU PAY</small>
              <input
                value={swapAmount}
                onChange={e=>{setSwapAmount(e.target.value);setQuote(null)}}
                inputMode="decimal"
                placeholder={payToken==="ETH"?"0.01":"10"}
              />
            </div>
            <b>{payToken}</b>
          </div>

          <div className="swap-arrow">↓</div>

          <div className="swap-output">
            <div>
              <small>YOU RECEIVE</small>
              <strong>{quotedMancer || (quote ? "LIVE QUOTE" : "—")}</strong>
            </div>
            <b>$MANCER</b>
          </div>

          <div className="swap-meta">
            <span>Balance <b>{isConnected?fmt(mancerBalance):"—"} $MANCER</b></span>
            <span>Slippage <b>0.5%</b></span>
          </div>

          {!isConnected ? (
            <button className="action-btn secondary" onClick={()=>open({view:"Connect"})}>CONNECT WALLET</button>
          ) : !quote ? (
            <button className="action-btn secondary" disabled={quoting} onClick={getQuote}>
              {quoting?"GETTING QUOTE…":"GET LIVE QUOTE"}
            </button>
          ) : (
            <button className="action-btn secondary swap-now" disabled={swapping} onClick={swapToMancer}>
              {swapping?"SWAPPING…":`SWAP ${payToken} → $MANCER`}
            </button>
          )}
        </article>

        <article className="card action-card mint-card">
          <div className="bar"><span>02 / MINT</span><b>+5,000 $BRCER</b></div>
          <div className="mint-controls">
            <button onClick={()=>setQty(Math.max(1,qty-1))}>−</button>
            <div><strong>{qty}</strong><small>NFT</small></div>
            <button onClick={()=>setQty(qty+1)}>+</button>
          </div>
          <div className="compact-info">
            <span>COST <b>{fmt(totalCost)} $MANCER</b></span>
            <span>REWARD <b>{(qty*5000).toLocaleString()} $BRCER</b></span>
          </div>
          {!isConnected
            ? <button className="action-btn" onClick={()=>open({view:"Connect"})}>CONNECT WALLET</button>
            : !approved
              ? <button className="action-btn" disabled={busy||!canMint} onClick={approve}>{canMint?"APPROVE $MANCER":"NOT ENOUGH $MANCER"}</button>
              : <button className="action-btn" disabled={busy||!canMint||!mintOpen} onClick={mint}>{mintOpen?`MINT ${qty}`:"MINT CLOSED"}</button>
          }
        </article>
      </section>

      <section className="wallet-grid">
        <Stat label="YOUR $MANCER" value={isConnected?fmt(mancerBalance):"—"} accent/>
        <Stat label="YOUR $BRCER" value={isConnected?fmt(brcerBalance,18,0):"—"}/>
        <Stat label="YOUR NFTs" value={isConnected?nftBalance.toString():"—"}/>
      </section>

      <section className="bottom card">
        <div className="bar"><span>MECHANICS</span><span>250 $MANCER → 1 NFT + 5,000 $BRCER</span></div>
        <div className="contracts">
          <a href={SITE_CONFIG.openSeaUrl} target="_blank" rel="noreferrer">OPENSEA ↗</a>
          <a href={SITE_CONFIG.xUrl} target="_blank" rel="noreferrer">X ↗</a>
          <a href={`${EXPLORER}/address/${NFT_ADDRESS}`} target="_blank" rel="noreferrer">NFT ↗</a>
          <a href={`${EXPLORER}/token/${BRCER_ADDRESS}`} target="_blank" rel="noreferrer">$BRCER ↗</a>
          <a href={`${EXPLORER}/token/${MANCER_ADDRESS}`} target="_blank" rel="noreferrer">$MANCER ↗</a>
        </div>
      </section>
    </div>

    {status&&<div className="status">{status}</div>}
  </main>;
}
