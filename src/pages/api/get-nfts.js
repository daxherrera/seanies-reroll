import { Helius } from "helius-sdk";
import { PublicKey } from "@solana/web3.js";

const MCC = "6KU393ZrMnU9Ct4asJxSvSiqGGqmHbhhbna7j9CJW5ve"; // Replace with your MCC

export default async function handler(req, res) {
  const helius = new Helius(process.env.HELIUS_API);
  const { ownerAddress } = req.query;
  
  try {

    
    const response = await helius.rpc.searchAssets({
      ownerAddress: ownerAddress,
      grouping: ["collection", MCC],
      page: 1,
    });
    res.status(200).json(response.items);
  } catch (error) {
    console.error("Failed to fetch NFTs:", error);
    res.status(500).json({ error: "Failed to fetch NFTs" });
  }
}
