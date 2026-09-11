const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const USD = (n) => BigInt(Math.round(n * 1e6));

describe("FundingVault", function () {
  let usd, vault;
  let admin, organizer, investorA, investorB, outsider;
  let deadline;

  const TARGET = USD(30_000);
  const PRICE = USD(10);
  const FOR_SALE = 3000n;

  beforeEach(async function () {
    [admin, organizer, investorA, investorB, outsider] = await ethers.getSigners();

    const USDC = await ethers.getContractFactory("MockStableCoin");
    usd = await USDC.deploy(6);

    deadline = (await time.latest()) + 72 * 3600;
    const Vault = await ethers.getContractFactory("FundingVault");
    vault = await Vault.deploy(
      await usd.getAddress(),
      admin.address,
      organizer.address,
      TARGET,
      PRICE,
      FOR_SALE,
      deadline
    );

    for (const who of [investorA, investorB]) {
      await usd.mint(who.address, USD(50_000));
      await usd.connect(who).approve(await vault.getAddress(), ethers.MaxUint256);
    }
  });

  describe("access control", function () {
    it("only ADMIN_ROLE can set KYC", async function () {
      await expect(vault.connect(outsider).setKyc(investorA.address, true)).to.be.reverted;
      await expect(vault.connect(organizer).setKyc(investorA.address, true)).to.be.reverted;
      await expect(vault.connect(admin).setKyc(investorA.address, true)).to.not.be.reverted;
    });

    it("only ORGANIZER_ROLE can withdraw", async function () {
      await vault.connect(admin).setKyc(investorA.address, true);
      await vault.connect(investorA).invest(TARGET);
      await vault.finalize();
      await expect(vault.connect(outsider).withdrawOrganizerFunds()).to.be.reverted;
      await expect(vault.connect(admin).withdrawOrganizerFunds()).to.be.reverted;
      await expect(vault.connect(organizer).withdrawOrganizerFunds()).to.not.be.reverted;
    });

    it("only ADMIN_ROLE can mark tokens delivered", async function () {
      await vault.connect(admin).setKyc(investorA.address, true);
      await vault.connect(investorA).invest(TARGET);
      await vault.finalize();
      await expect(vault.connect(outsider).markTokensDelivered(investorA.address)).to.be.reverted;
      await expect(vault.connect(admin).markTokensDelivered(investorA.address)).to.emit(
        vault,
        "TokensDelivered"
      );
    });
  });

  describe("investing", function () {
    it("rejects non-KYC investors", async function () {
      await expect(vault.connect(investorA).invest(PRICE)).to.be.revertedWithCustomError(
        vault,
        "NotKyc"
      );
    });

    it("rejects amounts that are not a whole number of tokens", async function () {
      await vault.connect(admin).setKyc(investorA.address, true);
      await expect(vault.connect(investorA).invest(USD(15))).to.be.revertedWithCustomError(
        vault,
        "NotWholeToken"
      );
    });

    it("rejects investment past the token supply", async function () {
      await vault.connect(admin).setKyc(investorA.address, true);
      await usd.mint(investorA.address, USD(100_000));
      await expect(
        vault.connect(investorA).invest(PRICE * (FOR_SALE + 1n))
      ).to.be.revertedWithCustomError(vault, "ExceedsOffer");
    });

    it("records contribution and allocation", async function () {
      await vault.connect(admin).setKyc(investorA.address, true);
      await expect(vault.connect(investorA).invest(USD(5000)))
        .to.emit(vault, "Invested")
        .withArgs(investorA.address, USD(5000), 500, USD(5000));
      expect(await vault.tokenAllocation(investorA.address)).to.equal(500);
      expect(await vault.contributed(investorA.address)).to.equal(USD(5000));
    });

    it("rejects investment after the deadline", async function () {
      await vault.connect(admin).setKyc(investorA.address, true);
      await time.increaseTo(deadline + 1);
      await expect(vault.connect(investorA).invest(PRICE)).to.be.revertedWithCustomError(
        vault,
        "DeadlinePassed"
      );
    });
  });

  describe("all-or-nothing finalize", function () {
    beforeEach(async () => {
      await vault.connect(admin).setKyc(investorA.address, true);
      await vault.connect(admin).setKyc(investorB.address, true);
    });

    it("Funded early once the target is reached", async function () {
      await vault.connect(investorA).invest(TARGET);
      await expect(vault.finalize()).to.emit(vault, "Finalized").withArgs(1, TARGET);
      expect(await vault.status()).to.equal(1); // Funded
    });

    it("cannot finalize before the deadline while under target", async function () {
      await vault.connect(investorA).invest(USD(10_000));
      await expect(vault.finalize()).to.be.revertedWithCustomError(vault, "DeadlineNotReached");
    });

    it("Failed after the deadline while under target; investors refund fully", async function () {
      await vault.connect(investorA).invest(USD(10_000));
      await vault.connect(investorB).invest(USD(5000));
      await time.increaseTo(deadline + 1);
      await vault.finalize();
      expect(await vault.status()).to.equal(2); // Failed

      const aBefore = await usd.balanceOf(investorA.address);
      await vault.connect(investorA).refund();
      expect(await usd.balanceOf(investorA.address)).to.equal(aBefore + USD(10_000));
      await expect(vault.connect(investorA).refund()).to.be.revertedWithCustomError(
        vault,
        "NothingToRefund"
      );

      // organizer gets nothing
      await expect(vault.connect(organizer).withdrawOrganizerFunds()).to.be.revertedWithCustomError(
        vault,
        "WrongStatus"
      );
    });

    it("organizer withdraws exactly the raise once, on Funded", async function () {
      await vault.connect(investorA).invest(TARGET);
      await vault.finalize();
      const before = await usd.balanceOf(organizer.address);
      await vault.connect(organizer).withdrawOrganizerFunds();
      expect(await usd.balanceOf(organizer.address)).to.equal(before + TARGET);
      await expect(vault.connect(organizer).withdrawOrganizerFunds()).to.be.revertedWithCustomError(
        vault,
        "AlreadyWithdrawn"
      );
    });

    it("blocks refund on a Funded offering", async function () {
      await vault.connect(investorA).invest(TARGET);
      await vault.finalize();
      await expect(vault.connect(investorA).refund()).to.be.revertedWithCustomError(
        vault,
        "WrongStatus"
      );
    });
  });
});
