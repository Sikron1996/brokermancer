const API_BASE = "https://trade-api.gateway.uniswap.org/v1";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const apiKey = process.env.UNISWAP_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "UNISWAP_API_KEY is not configured on the server."
    });
  }

  const { action, payload } = req.body || {};
  if (!["quote", "swap", "check_approval"].includes(action)) {
    return res.status(400).json({ error: "Unsupported action" });
  }

  try {
    const response = await fetch(`${API_BASE}/${action}`, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "content-type": "application/json",
        "accept": "application/json",
        // Robinhood Chain supports Universal Router 2.1.1.
        "x-universal-router-version": "2.1.1",
        // Native ETH input can use supported UniswapX routes on Robinhood Chain.
        "x-erc20eth-enabled": "true"
      },
      body: JSON.stringify(payload)
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }

    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error?.message || "Uniswap API request failed" });
  }
}
