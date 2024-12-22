import Irys from '@irys/sdk';

export const getIrys = async () => {
    const network = 'mainnet';
    const token = "solana";
    const providerUrl = process.env.REACT_APP_SOLANA_RPC_HOST;
  
    const irys = new Irys({
      network, // URL of the node you want to connect to
      token, // Token used for payment
      key: process.env.WALLET_SECRET_KEY, // SOL private key
      config: { providerUrl }, // Provider URL, only required when using Devnet
    });
    return irys;
  };