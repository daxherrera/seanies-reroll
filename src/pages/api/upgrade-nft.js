import { createSignerFromKeypair, keypairPayer, signerIdentity, signerPayer, publicKey, keypairIdentity, createNoopSigner } from '@metaplex-foundation/umi'
import { mplTokenMetadata, updateAsDataDelegateV2, fetchMetadataFromSeeds } from '@metaplex-foundation/mpl-token-metadata';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import * as bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters'
import allAttributes from '../../utils/attributes.json';
import fetch from 'node-fetch';
import sharp from 'sharp';
import * as ed25519 from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import nacl from 'tweetnacl';
import { getIrys } from './utils';

// Set the hash function for ed25519 using the correct method
ed25519.etc.sha512Sync = (...m) => sha512(ed25519.etc.concatBytes(...m));

import * as Client from '@web3-storage/w3up-client'
import { StoreMemory } from '@web3-storage/w3up-client/stores/memory'
import * as Proof from '@web3-storage/w3up-client/proof'
import { Signer } from '@web3-storage/w3up-client/principal/ed25519'

// Function to upload image to web3.storage
const uploadToWeb3Storage = async (imageBuffer) => {

    const principal = Signer.parse(process.env.W3_KEY)
    const store = new StoreMemory()
    const client = await Client.create({ principal, store })
    //console.log(client);
    // Add proof that this agent has been delegated capabilities on the space
    const proof = await Proof.parse(process.env.PROOF)
    const space = await client.addSpace(proof)
    await client.setCurrentSpace(space.did())

    const blob = new Blob([imageBuffer], { type: 'image/jpeg' });

    //await client.setCurrentSpace('did:key:z6Mkh7gk3kUH92n5ec8FeTaLoFxs5rgRuc8kS3n7tRGBA13N') // select the relevant Space DID that is associated with your account
    const directoryCid = await client.uploadFile(blob)
    const url = `https://${directoryCid}.ipfs.w3s.link/`;
    console.log("uploaded image", url);

    return url;
};

// Function to fetch and buffer images
const fetchImageBufferOld = async (url) => {
    console.log("fetching", url)
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
    }
    return await response.arrayBuffer();
};
const fetchImageBuffer = async (localPath) => {
    const url = `${process.env.NEXT_PUBLIC_BASE_URL || ''}${localPath}`;
    console.log("Fetching image from:", url);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch image from ${url}: ${response.statusText}`);
    }
    return await response.arrayBuffer();
};


// Function to pick a weighted random image
const weightedRandom = (items) => {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    const randomWeight = Math.random() * totalWeight;
    let weightSum = 0;

    for (const item of items) {
        weightSum += item.weight;
        if (randomWeight <= weightSum) {
            return item;
        }
    }
    return null;
}

// Function to combine images and compress them to stay under 99KB
const combineAndCompressImages = async (layers, order) => {
    const images = [];
    const selectedAttributes = [];

    for (const layerName of order) {
        const layerItems = layers[layerName];
        const selectedItem = weightedRandom(layerItems);
        if (selectedItem.url) {
            const buffer = await fetchImageBuffer(selectedItem.url);
            images.push({ input: buffer, blend: 'over' });
        }
        if (selectedItem.name !== 'None')
            selectedAttributes.push({ trait_type: layerName.replace('Images', ''), value: selectedItem.name });
    }

    if (images.length === 0) {
        throw new Error('At least one image URL must be provided');
    }

    let combinedImage = await sharp(images[0].input)
        .composite(images.slice(1))
        .toBuffer();

    let quality = 80; // Start with a high quality
    while (combinedImage.length > 500000 && quality > 0) {
        combinedImage = await sharp(combinedImage).jpeg({ quality }).toBuffer();
        quality -= 5; // Decrease quality step by step to reduce size
    }

    const uploadedUrl = await uploadToWeb3Storage(combinedImage);

    return { uploadedUrl, selectedAttributes };
};

const COOLDOWN_PERIOD = 10 * 60 * 1000; // 10 minutes in milliseconds
async function getLastModifiedTimestamp(irysId) {
    const query = `
    query getLastEdit {
        transactions(
            limit: 1
            order: DESC
            owners: ["7T2R49BKKYwZi5ju5u2cpTxiUXBa8yyridRh696Vnfko"]
            tags: [{ name: "Root-TX", values: ["${irysId}"] }]
        ) {
            edges {
                node {
                    id
                    timestamp
                }
            }
        }
    }`;
    console.log("query", query);
    const response = await fetch("https://arweave.mainnet.irys.xyz/graphql", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
    });

    const data = await response.json();
    const edges = data?.data?.transactions?.edges;

    if (!edges || edges.length === 0) {
        console.log("No transactions found.");
        return null;
    }

    const { id, timestamp } = edges[0].node;
    console.log(`Latest transaction ID: ${id}, Timestamp: ${timestamp}`);
    return timestamp;
}

// Real Irys upload function
async function uploadToIrys(data, tags) {
    const irys = await getIrys();
    const receipt = await irys.upload(data, { tags });
    return { id: receipt.id };
}

export default async function handler(req, res) {
    const { message, signature, nftAddress, ownerPublicKey } = req.body;
    console.log('test', req.body);

    if (!nftAddress) {
        return res.status(400).json({ error: 'NFT address and new name are required' });
    }
    const pubKey = new PublicKey(ownerPublicKey);
    const encodedMessage = new TextEncoder().encode(message);
    const decodedSignature = bs58.decode(signature);

    const publicKeyBytes = typeof pubKey.toBytes === 'function'
        ? pubKey.toBytes()
        : new Uint8Array(pubKey.toBuffer());

    const isValid = nacl.sign.detached.verify(
        encodedMessage,
        decodedSignature,
        publicKeyBytes
    );

    if (!isValid) {
        return res.status(400).json({ error: "Signature doesn't match" });
    }
    // Create or import the keypair for your wallet
    const umi = createUmi(process.env.REACT_APP_SOLANA_RPC_HOST).use(mplTokenMetadata())
    const secretKey = process.env.WALLET_SECRET_KEY;
    const keypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secretKey))
    console.log(keypair.publicKey.toString());

    const myKeypairSigner = createSignerFromKeypair(umi, keypair);
    umi.use(signerIdentity(myKeypairSigner));

    const connection = new Connection(process.env.REACT_APP_SOLANA_RPC_HOST);
    const mint = new PublicKey(nftAddress);
    const payer = new PublicKey(ownerPublicKey);

    const initialMetadata = await fetchMetadataFromSeeds(umi, { mint: mint })
    console.log("onchain meta", initialMetadata)

    const uri = initialMetadata.uri;
    const parts = uri.split('/mutable/');
    console.log("uri", uri, parts)
    const irysId = parts[1]; // This will be 'wPNSH-bxg6JLufDquI0rfTROMdV9AXeBK0kDNfY84z8'
    console.log("irys id", irysId)

    const lastModified = await getLastModifiedTimestamp(irysId);
    console.log("time", lastModified)

    const twelveHoursAgo = (Date.now() - (12 * 60 * 60 * 1000));
    console.log("time", twelveHoursAgo)

    if (lastModified > twelveHoursAgo) return res.status(400).json({ error: "The NFT was updated less than 12 hours ago." });

    if (irysId === undefined) {
        console.log("irysId is undefined")
    }

    const layerOrder = ['Background', 'Background Props', 'Body', 'Shirt', 'Face', 'Mouth', 'Hat', 'Eyes', 'Extras'];
    const { uploadedUrl, selectedAttributes } = await combineAndCompressImages(allAttributes, layerOrder);
    console.log("attributes", selectedAttributes);

    const response = await fetch(initialMetadata.uri);
    if (!response.ok) {
        throw new Error(`Failed to fetch data from ${initialMetadata.uri}: ${response.statusText}`);
    }
    const data = await response.json(); // Assuming the data is text. Use response.buffer() for binary data.
    console.log("offchain meta", data)

    data.attributes = selectedAttributes;
    data.name = initialMetadata.name;
    //data.attributes.push({ trait_type: 'Remixes', value: remixesCount.toString() });

    data.image = uploadedUrl;
    console.log("new offchain meta", data)

    const tags = [{ name: "Root-TX", value: irysId }, { name: "Content-Type", value: "application/json" }];
    console.log(tags)
    const receiptOne = await uploadToIrys(JSON.stringify(data), tags);
    console.log("uploading new metadata")
    console.log(`TX 1 uploaded https://gateway.irys.xyz/mutable/${receiptOne.id}`);
    const newUrl = `https://gateway.irys.xyz/mutable/${receiptOne.id}`
    console.log("New URL:", newUrl)

    res.status(200).json({
        metadata: data,
        newUrl: newUrl
    });
}
