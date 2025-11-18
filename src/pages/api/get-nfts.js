const MCC = "6KU393ZrMnU9Ct4asJxSvSiqGGqmHbhhbna7j9CJW5ve"; // Replace with your MCC

export default async function handler(req, res) {
  if (!process.env.HELIUS_API) {
    console.error("HELIUS_API environment variable is not set");
    return res.status(500).json({ error: "API configuration error" });
  }

  const { ownerAddress } = req.query;

  if (!ownerAddress) {
    return res.status(400).json({ error: "ownerAddress parameter is required" });
  }

  try {
    console.log("Fetching NFTs for owner:", ownerAddress);
    console.log("Using API key (first 10 chars):", process.env.HELIUS_API.substring(0, 10) + "...");

    const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'search-assets',
        method: 'searchAssets',
        params: {
          ownerAddress: ownerAddress,
          page: 1,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message);
    }

    res.status(200).json(data.result.items);
  } catch (error) {
    console.error("Failed to fetch NFTs:", error);
    console.error("Error details:", error.message);
    res.status(500).json({ error: "Failed to fetch NFTs", details: error.message });
  }
}
