require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { HEDERA_TESTNET_RPC_URL, EVM_OPERATOR_KEY } = process.env;

/**
 * The EVM_OPERATOR_KEY is the ECDSA private key of the Hedera account that pays
 * for contract deployment. On Hedera an ECDSA account has an EVM address derived
 * from its key; the JSON-RPC relay maps EVM transactions to that account.
 *
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    localhost: { url: "http://127.0.0.1:8545" },
    hederaTestnet: {
      url: HEDERA_TESTNET_RPC_URL || "https://testnet.hashio.io/api",
      chainId: 296,
      accounts: EVM_OPERATOR_KEY ? [EVM_OPERATOR_KEY] : [],
    },
  },
  mocha: {
    timeout: 120000,
  },
};
