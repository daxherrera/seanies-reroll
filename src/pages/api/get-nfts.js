import { createHelius } from "helius-sdk";

const MCC = "6KU393ZrMnU9Ct4asJxSvSiqGGqmHbhhbna7j9CJW5ve"; // Replace with your MCC

export default async function handler(req, res) {
  if (!process.env.HELIUS_API) {
    console.error("HELIUS_API environment variable is not set");
    return res.status(500).json({ error: "API configuration error" });
  }

  const helius = createHelius(process.env.HELIUS_API);
  const { ownerAddress } = req.query;

  if (!ownerAddress) {
    return res.status(400).json({ error: "ownerAddress parameter is required" });
  }

  try {
    console.log("Fetching NFTs for owner:", ownerAddress);
    console.log("Using API key (first 10 chars):", process.env.HELIUS_API.substring(0, 10) + "...");

    const response = await helius.searchAssets({
      ownerAddress: ownerAddress,
      grouping: ["collection", MCC],
      page: 1,
    });
    res.status(200).json(response.items);
  } catch (error) {
    console.error("Failed to fetch NFTs:", error);
    console.error("Error details:", error.cause);
    res.status(500).json({ error: "Failed to fetch NFTs", details: error.message });
  }
}
