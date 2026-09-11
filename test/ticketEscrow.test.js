const { expect } = require("chai");
const { ethers } = require("hardhat");

const USD = (n) => BigInt(Math.round(n * 1e6)); // 6-decimal stablecoin
const BPS = 1800; // 18%

describe("TicketEscrow", function () {
  let usd, escrow;
  let admin, organizer, fan, fan2, investorA, investorB, outsider;

  beforeEach(async function () {
    [admin, organizer, fan, fan2, investorA, investorB, outsider] = await ethers.getSigners();

    const USDC = await ethers.getContractFactory("MockStableCoin");
    usd = await USDC.deploy(6);

    const Escrow = await ethers.getContractFactory("TicketEscrow");
    escrow = await Escrow.deploy(
      await usd.getAddress(),
      admin.address,
      organizer.address,
      USD(50),
      BPS,
      6000
    );

    for (const who of [fan, fan2, investorA, investorB]) {
      await usd.mint(who.address, USD(10_000));
      await usd.connect(who).approve(await escrow.getAddress(), ethers.MaxUint256);
    }
  });

  describe("access control", function () {
    it("grants ADMIN_ROLE to admin and ORGANIZER_ROLE to organizer", async function () {
      expect(await escrow.hasRole(await escrow.ADMIN_ROLE(), admin.address)).to.equal(true);
      expect(await escrow.hasRole(await escrow.ORGANIZER_ROLE(), organizer.address)).to.equal(true);
    });

    it("only ADMIN_ROLE can open sales", async function () {
      await expect(escrow.connect(outsider).setSalesOpen(true)).to.be.reverted;
      await expect(escrow.connect(organizer).setSalesOpen(true)).to.be.reverted;
      await expect(escrow.connect(admin).setSalesOpen(true)).to.not.be.reverted;
    });

    it("only ADMIN_ROLE can configure the event, and only before the first sale", async function () {
      await expect(escrow.connect(outsider).configureEvent(USD(60), 2000, 5000)).to.be.reverted;
      await escrow.connect(admin).configureEvent(USD(60), 2000, 5000);
      expect(await escrow.ticketPrice()).to.equal(USD(60));

      await escrow.connect(admin).setSalesOpen(true);
      await escrow.connect(fan).buyTicket();
      await expect(escrow.connect(admin).configureEvent(USD(70), 2000, 5000)).to.be.revertedWithCustomError(
        escrow,
        "ConfigLocked"
      );
    });

    it("only ADMIN_ROLE can settle / allocate / sweep", async function () {
      await expect(escrow.connect(outsider).closeAndSettle(3000)).to.be.reverted;
      await expect(escrow.connect(outsider).allocatePayouts([outsider.address], [1])).to.be.reverted;
      await expect(escrow.connect(outsider).sweepDust(outsider.address)).to.be.reverted;
    });
  });

  describe("primary sale split", function () {
    beforeEach(async () => escrow.connect(admin).setSalesOpen(true));

    it("reverts when sales are closed", async function () {
      await escrow.connect(admin).setSalesOpen(false);
      await expect(escrow.connect(fan).buyTicket()).to.be.revertedWithCustomError(escrow, "SalesClosed");
    });

    it("sends the organizer share out immediately and locks the investor share", async function () {
      const orgBefore = await usd.balanceOf(organizer.address);
      await expect(escrow.connect(fan).buyTicket())
        .to.emit(escrow, "TicketPurchased")
        .withArgs(fan.address, 1, USD(50), USD(41), USD(9));

      expect(await usd.balanceOf(organizer.address)).to.equal(orgBefore + USD(41));
      expect(await usd.balanceOf(await escrow.getAddress())).to.equal(USD(9));
      expect(await escrow.poolBalance()).to.equal(USD(9));
      expect(await escrow.ticketsSold()).to.equal(1);
    });

    it("returns an incrementing serial and respects maxTickets", async function () {
      const Escrow = await ethers.getContractFactory("TicketEscrow");
      const small = await Escrow.deploy(await usd.getAddress(), admin.address, organizer.address, USD(50), BPS, 2);
      await small.connect(admin).setSalesOpen(true);
      await usd.connect(fan).approve(await small.getAddress(), ethers.MaxUint256);
      await small.connect(fan).buyTicket();
      await small.connect(fan).buyTicket();
      await expect(small.connect(fan).buyTicket()).to.be.revertedWithCustomError(small, "SoldOut");
    });

    it("buyTicketFor assigns the NFT recipient but still charges the caller", async function () {
      const callerBefore = await usd.balanceOf(fan.address);
      await expect(escrow.connect(fan).buyTicketFor(outsider.address))
        .to.emit(escrow, "TicketPurchased")
        .withArgs(outsider.address, 1, USD(50), USD(41), USD(9));
      expect(await usd.balanceOf(fan.address)).to.equal(callerBefore - USD(50));
    });
  });

  describe("resale royalty sync", function () {
    beforeEach(async () => {
      await escrow.connect(admin).setSalesOpen(true);
      await escrow.connect(fan).buyTicket(); // pool = 9
    });

    it("folds surplus stablecoin into the pool (permissionless)", async function () {
      await usd.mint(await escrow.getAddress(), USD(8)); // simulate a royalty payment
      await expect(escrow.connect(outsider).syncRoyalties())
        .to.emit(escrow, "RoyaltiesSynced");
      expect(await escrow.poolBalance()).to.equal(USD(17));
      expect(await escrow.royaltiesCollected()).to.equal(USD(8));
    });

    it("is a no-op when there is no surplus", async function () {
      await escrow.connect(outsider).syncRoyalties();
      expect(await escrow.royaltiesCollected()).to.equal(0n);
    });
  });

  describe("settlement (escrow fallback path)", function () {
    beforeEach(async () => {
      await escrow.connect(admin).setSalesOpen(true);
      for (let i = 0; i < 10; i++) await escrow.connect(fan).buyTicket(); // pool = 90
    });

    it("snapshots the pool, allocates pro-rata, and pays claims", async function () {
      // supply 3000: investorA holds 2000, investorB holds 1000
      await escrow.connect(admin).closeAndSettle(3000);
      expect(await escrow.settled()).to.equal(true);
      expect(await escrow.poolAtSettlement()).to.equal(USD(90));

      await escrow.connect(admin).allocatePayouts(
        [investorA.address, investorB.address],
        [2000, 1000]
      );
      expect(await escrow.claimable(investorA.address)).to.equal(USD(60));
      expect(await escrow.claimable(investorB.address)).to.equal(USD(30));

      const aBefore = await usd.balanceOf(investorA.address);
      await escrow.connect(investorA).claim();
      expect(await usd.balanceOf(investorA.address)).to.equal(aBefore + USD(60));
      await expect(escrow.connect(investorA).claim()).to.be.revertedWithCustomError(escrow, "NothingClaimable");
    });

    it("rejects allocations exceeding the pool", async function () {
      await escrow.connect(admin).closeAndSettle(3000);
      await expect(
        escrow.connect(admin).allocatePayouts([investorA.address], [4000])
      ).to.be.revertedWithCustomError(escrow, "AllocationExceedsPool");
    });

    it("blocks a second settlement", async function () {
      await escrow.connect(admin).closeAndSettle(3000);
      await expect(escrow.connect(admin).closeAndSettle(3000)).to.be.revertedWithCustomError(
        escrow,
        "AlreadySettled"
      );
    });
  });

  it("estimatedPayoutPerToken tracks the live pool", async function () {
    await escrow.connect(admin).setSalesOpen(true);
    for (let i = 0; i < 100; i++) await escrow.connect(fan).buyTicket(); // pool = 900
    expect(await escrow.estimatedPayoutPerToken(3000)).to.equal(USD(0.3));
  });
});
