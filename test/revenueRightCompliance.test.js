const { expect } = require("chai");
const { ethers } = require("hardhat");

/**
 * The four compliance cases from the proposal, against the mock ATS token.
 * On testnet ATS enforces the same rules natively.
 */
describe("MockRevenueRightToken — compliance", function () {
  let token, owner, investorA, investorB;

  beforeEach(async function () {
    [owner, investorA, investorB] = await ethers.getSigners();
    const T = await ethers.getContractFactory("MockRevenueRightToken");
    token = await T.deploy();
    await token.setKyc(investorA.address, true);
    await token.issue(investorA.address, 1000);
  });

  it("1. KYC-approved investor receives tokens → succeeds", async function () {
    await token.setKyc(investorB.address, true);
    await expect(token.connect(investorA).transfer(investorB.address, 100)).to.not.be.reverted;
    expect(await token.balanceOf(investorB.address)).to.equal(100);
  });

  it("2. unverified account tries to receive → rejected", async function () {
    await expect(
      token.connect(investorA).transfer(investorB.address, 100)
    ).to.be.revertedWithCustomError(token, "ReceiverNotKyc");
  });

  it("3. frozen investor tries to transfer → rejected", async function () {
    await token.setKyc(investorB.address, true);
    await token.setFrozen(investorA.address, true);
    await expect(
      token.connect(investorA).transfer(investorB.address, 100)
    ).to.be.revertedWithCustomError(token, "SenderFrozen");
  });

  it("4. unfrozen investor transfers again → succeeds", async function () {
    await token.setKyc(investorB.address, true);
    await token.setFrozen(investorA.address, true);
    await token.setFrozen(investorA.address, false);
    await expect(token.connect(investorA).transfer(investorB.address, 100)).to.not.be.reverted;
  });

  it("only the owner can set KYC / freeze / issue", async function () {
    await expect(token.connect(investorA).setKyc(investorB.address, true)).to.be.reverted;
    await expect(token.connect(investorA).setFrozen(investorB.address, true)).to.be.reverted;
    await expect(token.connect(investorA).issue(investorA.address, 1)).to.be.reverted;
  });
});
