import React, { useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Metaplex } from "@metaplex-foundation/js";
import {
  Connection,
  VersionedTransaction,
} from "@solana/web3.js";
import { notify } from "../utils/notifications";
import * as bs58 from 'bs58';
import Image from 'next/image';

interface Nft {
  id: string;
  content: {
    json_uri: string;
    links: {
      image: string;
    };
    metadata: {
      name: string;
    };
  };
}

export const NftGallery = () => {
  const { publicKey, sendTransaction, signMessage } = useWallet();
  const [nfts, setNfts] = useState<Nft[]>([]);
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false); // Added

  useEffect(() => {
    const fetchNFTs = async () => {
      if (publicKey) {
        setIsLoadingNFTs(true); // Start loading

        const connection = new Connection(process.env.REACT_APP_SOLANA_RPC_HOST);
        //const metaplex = Metaplex.make(connection).use(walletAdapterIdentity(wallet));
        const metaplex = Metaplex.make(connection);

        try {
          const response = await fetch(
            `/api/get-nfts?ownerAddress=${publicKey.toBase58()}`
          );

          const nfts = await response.json();
          console.log(nfts);

          const nftsWithMetadata = await Promise.all(
            nfts.map(async (nft: Nft) => {
              if (nft.content.json_uri) {
                const metadataResponse = await fetch(nft.content.json_uri);
                if (!metadataResponse.ok) {
                  throw new Error(
                    `Failed to fetch metadata from ${nft.content.json_uri}`
                  );
                }
                const metadata = await metadataResponse.json();
                nft.content.links.image = metadata.image;
                //console.log(metadata.image);

              }
              return nft;
            })
          );

          setNfts(nftsWithMetadata);
        } catch (error) {
          console.error("Failed to fetch NFTs:", error);
        } finally {
          setIsLoadingNFTs(false); // Stop loading
        }
      }
    };
    fetchNFTs();
  }, [publicKey]);


  const updateNftName = async (nftAddress: string) => {
    setLoading((prev) => ({ ...prev, [nftAddress]: true }));
    console.log("Updating NFT:", nftAddress);

    try {
      // Step 1: Fetch transaction and new metadata from backend
      const response = await fetch(`/api/change-nft-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nftAddress,
          ownerPublicKey: publicKey.toBase58(),
        }),
      });

      const data = await response.json();

      if (!data.transaction || !data.newMetadata || !data.newUrl) {
        throw new Error("Invalid response from server");
      }

      const { transaction: base64Transaction, newMetadata, newUrl } = data;

      console.log("Transaction received from API:", base64Transaction);

      // Step 2: Decode the transaction
      const connection = new Connection(process.env.REACT_APP_SOLANA_RPC_HOST);
      const decodedTransaction = VersionedTransaction.deserialize(
        new Uint8Array(Buffer.from(base64Transaction, "base64"))
      );

      console.log("Decoded transaction:", decodedTransaction);

      // Step 3: Prompt user to sign and send the transaction
      const signature = await sendTransaction(decodedTransaction, connection);

      console.log("Transaction signature:", signature);

      // Step 4: Confirm the transaction on the blockchain
      await connection.confirmTransaction(signature, "confirmed");
      console.log("Transaction confirmed!");

      // Step 5: Update the NFT in the state with new metadata and image
      setNfts((prevNfts) =>
        prevNfts.map((nft) => {
          if (nft.id === nftAddress) {
            return {
              ...nft,
              content: {
                ...nft.content,
                json_uri: newUrl,
                metadata: {
                  ...nft.content.metadata,
                  name: newMetadata.name,
                },
                links: {
                  ...nft.content.links,
                  image: newMetadata.image,
                },
              },
            };
          }
          return nft;
        })
      );

      notify({ type: "success", message: "NFT name and metadata updated!" });
    } catch (error) {
      console.error("Failed to update NFT name:", error);
      notify({ type: "error", message: "Failed to update NFT. Please try again." });
    } finally {
      setLoading((prev) => ({ ...prev, [nftAddress]: false }));
    }
  };


  const remixNft = async (nftAddress: string) => {
    setLoading((prev) => ({ ...prev, [nftAddress]: true }));

    // Check wallet connection and message signing
    if (!publicKey) {
      notify({ type: "error", message: "Wallet not connected!" });
      throw new Error("Wallet not connected!");
    }
    if (!signMessage) {
      notify({ type: "error", message: "Wallet does not support message signing!" });
      throw new Error("Wallet does not support message signing!");
    }

    // Message to sign
    const message = `Sign this to remix your Seanie. It doesn't cost anything.`;
    const encodedMessage = new TextEncoder().encode(message);
    let signature;

    try {
      signature = await signMessage(encodedMessage);
    } catch (signError) {
      setLoading((prev) => ({ ...prev, [nftAddress]: false }));
      console.error("Message signing failed:", signError);
      notify({ type: "error", message: "Message signing failed. Please try again." });
      return;
    }

    try {
      // Send request to API
      const response = await fetch(`/api/upgrade-nft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          nftAddress,
          ownerPublicKey: publicKey.toBase58(),
          message,
          signature: bs58.encode(signature),
        }),
      });

      // Check for a 400 error response
      if (!response.ok) {
        const errorResponse = await response.json();
        if (response.status === 400) {
          notify({ type: "error", message: errorResponse.error || "Bad Request" });
          console.error("400 Error:", errorResponse.error);
        } else {
          notify({ type: "error", message: `Error ${response.status}: ${response.statusText}` });
        }
        throw new Error(`API Error: ${response.statusText}`);
      }

      const ret = await response.json();
      const data = ret.metadata;

      console.log(data);

      // Update the NFT state
      setNfts((prevNfts) =>
        prevNfts.map((nft) => {
          if (nft.id === nftAddress) {
            return {
              ...nft,
              content: {
                ...nft.content,
                links: {
                  ...nft.content.links,
                  image: data.image,
                },
              },
            };
          }
          return nft;
        })
      );

      notify({ type: "success", message: "Your Seanie has been remixed." });
    } catch (error) {
      console.error("Failed to update NFT:", error);
      notify({ type: "error", message: "Failed to remix NFT. Please try again later." });
    } finally {
      setLoading((prev) => ({ ...prev, [nftAddress]: false }));
    }
  };

  return (
    <div>
      {!publicKey && <p>Connect wallet to see your Seanies</p>}
      {isLoadingNFTs && <p>Loading Seanies...</p>}
      {publicKey && !isLoadingNFTs && (
        <div>
          <div className="nft-grid">
            {nfts.map((nft, index) => (
              <div key={index} className="nft-card">
                <Image
                  src={nft.content.links.image || '/placeholder.png'}
                  alt={nft.content.metadata.name || 'NFT Image'}
                  width={200}
                  height={200}
                />
                <p>{nft.content.metadata.name}</p>
                {loading[nft.id] ? (
                  <div className="spinner"></div>
                ) : nft.content.json_uri.includes("irys") ? (
                  <button onClick={() => remixNft(nft.id)}>Remix</button>
                ) : (
                  <button onClick={() => updateNftName(nft.id)}>
                    Get a Name
                  </button>
                )}
                <a
                  href={nft.content.json_uri}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Metadata
                </a>
                <a
                  href={`https://explorer.solana.com/address/${nft.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Explorer
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
