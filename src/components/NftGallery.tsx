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
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchNFTs = async () => {
      if (!publicKey) return;

      setIsLoadingNFTs(true);
      setError(null);

      try {
        const response = await fetch(
          `/api/get-nfts?ownerAddress=${publicKey.toBase58()}`
        );

        if (!response.ok) {
          let errorMessage = `Server error: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.details || errorMessage;
          } catch (e) {
            // Failed to parse error JSON, use status text
            errorMessage = response.statusText || errorMessage;
          }
          throw new Error(errorMessage);
        }

        const data = await response.json();
        const nftsArray = Array.isArray(data) ? data : (data.items || data.results || []);

        if (!Array.isArray(nftsArray)) {
          throw new Error("API returned invalid data format");
        }

        if (nftsArray.length === 0) {
          setNfts([]);
          setError("No Seanies found in this wallet");
          return;
        }

        const nftsWithMetadata = await Promise.all(
          nftsArray.map(async (nft: Nft) => {
            try {
              if (nft.content?.json_uri) {
                const metadataResponse = await fetch(nft.content.json_uri);
                if (metadataResponse.ok) {
                  const metadata = await metadataResponse.json();
                  nft.content.links.image = metadata.image;
                }
              }
            } catch (metaError) {
              console.warn(`Failed to fetch metadata for ${nft.id}:`, metaError);
              // Continue with other NFTs even if one fails
            }
            return nft;
          })
        );

        setNfts(nftsWithMetadata);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
        console.error("Failed to fetch NFTs:", error);
        setError(errorMessage);
        notify({
          type: "error",
          message: errorMessage
        });
      } finally {
        setIsLoadingNFTs(false);
      }
    };

    fetchNFTs();
  }, [publicKey]);

  const updateNftName = async (nftAddress: string) => {
    setLoading((prev) => ({ ...prev, [nftAddress]: true }));

    try {
      const response = await fetch(`/api/change-nft-name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nftAddress,
          ownerPublicKey: publicKey.toBase58(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Request failed: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.transaction || !data.newMetadata || !data.newUrl) {
        throw new Error("Invalid response from server");
      }

      const { transaction: base64Transaction, newMetadata, newUrl } = data;
      const connection = new Connection(process.env.REACT_APP_SOLANA_RPC_HOST);
      const decodedTransaction = VersionedTransaction.deserialize(
        new Uint8Array(Buffer.from(base64Transaction, "base64"))
      );

      const signature = await sendTransaction(decodedTransaction, connection);
      await connection.confirmTransaction(signature, "confirmed");

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
      const errorMessage = error instanceof Error ? error.message : "Failed to update NFT";
      console.error("Failed to update NFT name:", error);
      notify({ type: "error", message: errorMessage });
    } finally {
      setLoading((prev) => ({ ...prev, [nftAddress]: false }));
    }
  };

  const remixNft = async (nftAddress: string) => {
    setLoading((prev) => ({ ...prev, [nftAddress]: true }));

    if (!publicKey) {
      notify({ type: "error", message: "Wallet not connected!" });
      setLoading((prev) => ({ ...prev, [nftAddress]: false }));
      return;
    }

    if (!signMessage) {
      notify({ type: "error", message: "Wallet does not support message signing!" });
      setLoading((prev) => ({ ...prev, [nftAddress]: false }));
      return;
    }

    const message = `Sign this to remix your Seanie. It doesn't cost anything.`;
    const encodedMessage = new TextEncoder().encode(message);

    try {
      const signature = await signMessage(encodedMessage);

      const response = await fetch(`/api/upgrade-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nftAddress,
          ownerPublicKey: publicKey.toBase58(),
          message,
          signature: bs58.encode(signature),
        }),
      });

      if (!response.ok) {
        const errorResponse = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorResponse.error || `Request failed: ${response.statusText}`);
      }

      const ret = await response.json();
      const data = ret.metadata;

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
      const errorMessage = error instanceof Error ? error.message : "Failed to remix NFT";
      console.error("Failed to remix NFT:", error);
      notify({ type: "error", message: errorMessage });
    } finally {
      setLoading((prev) => ({ ...prev, [nftAddress]: false }));
    }
  };

  return (
    <div>
      {!publicKey && <p>Connect wallet to see your Seanies</p>}
      {isLoadingNFTs && <p>Loading Seanies...</p>}
      {error && !isLoadingNFTs && <p className="error-message">{error}</p>}
      {publicKey && !isLoadingNFTs && !error && (
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
