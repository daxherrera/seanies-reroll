import { createSignerFromKeypair, keypairPayer, signerIdentity, signerPayer, publicKey, keypairIdentity, createNoopSigner } from '@metaplex-foundation/umi'
import { findMetadataDelegateRecordPda, mplTokenMetadata, updateAsDataDelegateV2, fetchMetadataFromSeeds } from '@metaplex-foundation/mpl-token-metadata';
import { Connection, PublicKey, Keypair, Transaction } from '@solana/web3.js';
import * as bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { toWeb3JsTransaction } from '@metaplex-foundation/umi-web3js-adapters'
import { getIrys } from './utils';
import seanNames from '../../utils/seanNames.json';

const delegateAddress = new PublicKey('7T2R49BKKYwZi5ju5u2cpTxiUXBa8yyridRh696Vnfko');
const collectionAddress = new PublicKey('6KU393ZrMnU9Ct4asJxSvSiqGGqmHbhhbna7j9CJW5ve');
const updateAuthority = new PublicKey('HWPRgtDGpBm8mByTGS57BWCsijMo53qPPSbskWDukfTc');
const delegatePDAcollection = new PublicKey('HtP2UpbTF22A2aGDDyhqbUYe6fFKmEcGUv8ZGfJDs2wG');

async function getDelegate(umi, delegateAddress, collectionAddress, updateAuthority) {
    try {
        const delegateRecordPda = await findMetadataDelegateRecordPda(umi, {
            delegate: delegateAddress,
            delegateRole: "data_delegate",
            mint: collectionAddress,
            updateAuthority: updateAuthority,
        });
        console.log("getDelegate", delegateRecordPda)
        return delegateRecordPda;
        //console.log(`Metadata Delegate Record PDA: ${delegateRecordPda.toString()}`);
    } catch (error) {
        console.error('Error generating PDA:', error);
    }
}

export default async function handler(req, res) {
    const { nftAddress, ownerPublicKey } = req.body;
    const newName = "test";

    if (!nftAddress) {
        return res.status(400).json({ error: 'NFT address and new name are required' });
    }
    try {

        // Create or import the keypair for your wallet
        const umi = createUmi(process.env.REACT_APP_SOLANA_RPC_HOST).use(mplTokenMetadata())
        const secretKey = process.env.WALLET_SECRET_KEY;
        const keypair = umi.eddsa.createKeypairFromSecretKey(bs58.decode(secretKey))
        console.log(keypair.publicKey.toString());
        const mySigner = createNoopSigner(ownerPublicKey);

        const myKeypairSigner = createSignerFromKeypair(umi, keypair);
        umi.use(signerIdentity(myKeypairSigner));

        const connection = new Connection(process.env.REACT_APP_SOLANA_RPC_HOST);
        const mint = new PublicKey(nftAddress);
        const payer = new PublicKey(ownerPublicKey);

        //get the chain metadata
        const initialMetadata = await fetchMetadataFromSeeds(umi, { mint: mint })

        //get the off chain metadata
        const response = await fetch(initialMetadata.uri);
        if (!response.ok) {
            throw new Error(`Failed to fetch data from ${url}: ${response.statusText}`);
        }
        const attributeMetadata = await response.json();

        //pick the new name
        const newName = seanNames[Math.floor(Math.random() * seanNames.length)];
        console.log("data", attributeMetadata)

        attributeMetadata.name = newName;

        const tags = [{ name: "Content-Type", value: "application/json" }];
        const irys = await getIrys();
        const receiptOne = await irys.upload(JSON.stringify(attributeMetadata), { tags: tags });

        console.log(`TX 1 uploaded https://gateway.irys.xyz/mutable/${receiptOne.id}`);
        const newUrl = `https://gateway.irys.xyz/mutable/${receiptOne.id}`
        console.log("New URL:", newUrl)

        //const delegatePDA = getDelegate(umi, delegateAddress, collectionAddress, updateAuthority);

        const transaction = await updateAsDataDelegateV2(umi, {
            mint: mint,
            authority: delegateAddress,
            delegateRecord: delegatePDAcollection,
            data: { ...initialMetadata, name: newName, uri: newUrl },
        }).setFeePayer(mySigner).buildAndSign(umi);
        //console.log(transaction)

        console.log("Transaction")
        const web3jsTransaction = toWeb3JsTransaction(transaction)

        console.log(web3jsTransaction)
        const serializedTransaction = web3jsTransaction.serialize()
        const base64EncodedTransaction = Buffer.from(serializedTransaction).toString('base64');
        console.log("base64EncodedTransaction")
        console.log(base64EncodedTransaction)

        res.status(200).json({ transaction: base64EncodedTransaction, newMetadata: attributeMetadata, newUrl: newUrl });
    } catch (error) {
        console.error('Failed to update NFT name:', error);
        res.status(500).json({ error: 'Failed to update NFT name' });
    }
}
