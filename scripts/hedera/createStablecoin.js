"use strict";

/**
 * Create the Encore test stablecoin as an HTS fungible token.
 *
 *   - treasury + supply key = operator (so the demo can mint funds to accounts)
 *   - ERC-20 facade address is derived from the token id and written to .env as
 *     STABLECOIN_EVM_ADDRESS — this is what the contracts consume.
 *
 * Run:  npm run hedera:stablecoin
 */

const {
  TokenCreateTransaction,
  TokenType,
  TokenSupplyType,
} = require("@hashgraph/sdk");
const { operatorClient, parseKey, idToEvmAddress } = require("../lib/hedera");
const { writeEnv } = require("../lib/env");

async function main() {
  const client = operatorClient();
  const supplyKey = parseKey(process.env.OPERATOR_KEY);
  const decimals = Number(process.env.STABLECOIN_DECIMALS || 6);

  const tx = await new TokenCreateTransaction()
    .setTokenName("Encore Test USD")
    .setTokenSymbol("mUSD")
    .setTokenType(TokenType.FungibleCommon)
    .setDecimals(decimals)
    .setInitialSupply(0)
    .setSupplyType(TokenSupplyType.Infinite)
    .setTreasuryAccountId(client.operatorAccountId)
    .setSupplyKey(supplyKey)
    .setAdminKey(supplyKey)
    .freezeWith(client)
    .sign(supplyKey);

  const resp = await tx.execute(client);
  const receipt = await resp.getReceipt(client);
  const tokenId = receipt.tokenId.toString();
  const evm = idToEvmAddress(tokenId);

  console.log(`\n  stablecoin token id : ${tokenId}`);
  console.log(`  ERC-20 facade       : ${evm}`);
  console.log(`  https://hashscan.io/testnet/token/${tokenId}\n`);

  writeEnv({
    STABLECOIN_TOKEN_ID: tokenId,
    STABLECOIN_EVM_ADDRESS: evm,
    STABLECOIN_DECIMALS: decimals,
  });

  client.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
