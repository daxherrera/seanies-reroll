import type { NextPage } from "next";
import Head from "next/head";
import { NftsView } from "../views";

const Home: NextPage = (props) => {
  return (
    <div>
      <Head>
        <title>Seanies Reborn</title>
        <meta
          name="description"
          content="Solana Scaffold"
        />
      </Head>
      <NftsView />
    </div>
  );
};

export default Home;
