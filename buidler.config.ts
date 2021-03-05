require("dotenv").config();

import { BuidlerConfig, usePlugin, task, internalTask } from "@nomiclabs/buidler/config";
import { constants, utils } from "ethers";
import { BigNumber } from "ethers/utils";
import { fr } from "ethers/wordlists";
import { ArbFactory } from "./typechain/ArbFactory";
import { Ipv2SmartPoolFactory } from "./typechain/Ipv2SmartPoolFactory";
import CoinGecko from "coingecko-api";
import { Ierc20Factory } from "./typechain/Ierc20Factory";



interface ExtendedBuidlerConfig extends BuidlerConfig {
    [x:string]: any
}

usePlugin("@nomiclabs/buidler-waffle");

const config: ExtendedBuidlerConfig = {
  defaultNetwork: "buidlerevm",
  networks: {
    // buidlerevm: {

    // },
    frame: {
      url: "http://localhost:1248"
    },
    mainnet: {
      url: "https://mainnet.infura.io/v3/ffa6c1dc83e44e6c9971d4706311d5ab",
      accounts: [process.env.PRIVATE_KEY]
    }
  },
  solc: {
    version: "0.6.6",
    optimizer: {
      runs: 200,
      enabled: true,
    }
  },
}

task("deploy-arb")
  .addParam("factory")
  .addParam("router")
  .setAction(async(taskArgs, { ethers }) => {
    const signers = await ethers.getSigners();
    const arb = await new ArbFactory(signers[0]).deploy(taskArgs.factory, taskArgs.router);

    console.log(`contract deployed ${arb.address}`);
}); 

task("arb")
    .addParam("pie")
    .addParam("arb")
    .setAction(async(taskArgs, { ethers }) => {
      const signers = await ethers.getSigners();
      const account = await signers[0].getAddress();
      const api = new CoinGecko();

      const WETH = "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2";

      const pie = Ipv2SmartPoolFactory.connect(taskArgs.pie, signers[0]);
      const weth = Ierc20Factory.connect(WETH, signers[0]);

      const arb = ArbFactory.connect(taskArgs.arb, signers[0]);

      const tokensAndAmounts = await pie.calcTokensForAmount(constants.WeiPerEther);

      let ethValue = new BigNumber(0);

      for (let i = 0; i < tokensAndAmounts.tokens.length; i ++) {
        const token = tokensAndAmounts.tokens[i];
        // const coinData = await api.coins.fetchCoinContractMarketChart(token, "ethereum", {"vs_currency": "eth"});
        const coinData = await api.coins.fetchCoinContractInfo(token);
        const price = coinData.data["market_data"]["current_price"]["eth"]

        const tokenContract = Ierc20Factory.connect(token, signers[0]);
        const decimals = await tokenContract.decimals();

        console.log(decimals);

        console.log(price);

        const ethAmount = utils.parseEther(price.toString()).mul(tokensAndAmounts.amounts[i]).div((10 ** decimals).toString());

        ethValue = ethValue.add(ethAmount);
      }

      console.log(utils.formatEther(ethValue.toString()));

      const pieBalance = await pie.balanceOf(account);
      const wethBalance = await weth.balanceOf(account);

      const tx = await arb.swapToPrice(
        taskArgs.pie,
        WETH,
        constants.WeiPerEther,
        ethValue,
        pieBalance,
        wethBalance,
        account,
        Math.floor(Date.now() / 1000) + 300 //5 minutes from now is the deadline
      );

      tx.wait(1);
});



export default config;