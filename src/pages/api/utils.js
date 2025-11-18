export const getIrys = async () => {
  // Use dynamic import to avoid module loading issues
  const { default: Irys } = await import('@irys/sdk');

  const network = 'mainnet';
  const token = "solana";
  const providerUrl = process.env.REACT_APP_SOLANA_RPC_HOST;

  const irys = new Irys({
    network,
    token,
    key: process.env.WALLET_SECRET_KEY,
    config: { providerUrl },
  });
  return irys;
};