import { expect } from "chai";
import {
    createMainnetConnection,
    deployFranchiserPoolFactory,
    getCreatedPoolAddress,
    parseCreatedPoolLog,
    GOVERNANCE_ADDRESS,
    FREEZE_PERIOD,
    MAXIMUM_FREEZE_PERIOD,
} from "./helpers.js";

const connection = await createMainnetConnection();
const { ethers, networkHelpers } = connection;

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function deployFixture() {
    const [, coordinator, guardian, other] = await ethers.getSigners();

    const AMOUNT = ethers.parseEther("10000");
    const { governance, token, franchiserImplementation, poolFactory: factory } =
        await deployFranchiserPoolFactory(connection, AMOUNT * 100n);

    return { governance, coordinator, guardian, other, token, factory, franchiserImplementation, AMOUNT };
}

async function poolCreatedFixture() {
    const base = await deployFixture();
    const { governance, coordinator, guardian, factory, AMOUNT } = base;

    const tx = await factory.connect(governance).createPool(
        coordinator.address,
        guardian.address,
        5n,
        FREEZE_PERIOD,
        AMOUNT
    );
    const receipt = await tx.wait();
    const poolAddr = getCreatedPoolAddress(factory, receipt);
    const pool = await ethers.getContractAt("FranchiserPool", poolAddr);

    return { ...base, pool, poolAddr };
}

const restore = async () => await networkHelpers.loadFixture(deployFixture);
const restorePool = async () => await networkHelpers.loadFixture(poolCreatedFixture);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FranchiserPoolFactory", function () {
    describe("deployment", function () {
        it("stores the voting token", async function () {
            const { factory, token } = await restore();

            expect(await factory.votingToken()).to.equal(await token.getAddress());
        });

        it("stores the governance address", async function () {
            const { factory } = await restore();

            expect(await factory.governance()).to.equal(GOVERNANCE_ADDRESS);
        });

        it("stores the franchiserImplementation address", async function () {
            const { factory, franchiserImplementation } = await restore();

            expect(await factory.franchiserImplementation()).to.equal(
                await franchiserImplementation.getAddress()
            );
        });

        it("reverts if franchiserImplementation is zero address", async function () {
            const { factory } = await restore();

            await expect(
                ethers.deployContract("FranchiserPoolFactory", [ethers.ZeroAddress])
            ).to.be.revertedWithCustomError(factory, "ZeroAddress");
        });

        it("reverts if franchiserImplementation voting token is different", async function () {
            const { factory } = await restore();

            const otherToken = await ethers.deployContract("MockVotingToken", []);
            const otherImpl = await ethers.deployContract("Franchiser", [
                    await otherToken.getAddress(),
            ]);

            await expect(
                ethers.deployContract("FranchiserPoolFactory", [await otherImpl.getAddress()])
            ).to.be.revertedWithCustomError(factory, "InvalidVotingToken")
                .withArgs(await otherImpl.getAddress(), await factory.votingToken(), await otherToken.getAddress());
        });
    });

    describe("createPool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, coordinator, guardian } = await restore();

            await expect(
                factory
                    .connect(other)
                    .createPool(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        0n
                    )
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if freeze period is below minimum", async function () {
            // FreezePeriodTooShort is a FranchiserPool error — use a pool instance for ABI lookup
            const { factory, governance, coordinator, guardian, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPool(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD - 1,
                        1n
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooShort");
        });

        it("reverts if freeze period is above maximum", async function () {
            // FreezePeriodTooLong is a FranchiserPool error — use a pool instance for ABI lookup
            const { factory, governance, coordinator, guardian, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPool(
                        coordinator.address,
                        guardian.address,
                        5n,
                        MAXIMUM_FREEZE_PERIOD + 1,
                        1n
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooLong");
        });

        it("deploys a new pool and registers it as known", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            const tx = await factory
                .connect(governance)
                .createPool(
                    coordinator.address,
                    guardian.address,
                    5n,
                    FREEZE_PERIOD,
                    1n
                );
            const receipt = await tx.wait();
            const poolAddr = getCreatedPoolAddress(factory, receipt);

            expect(await factory.isKnownPool(poolAddr)).to.be.true;
            expect(await factory.getAllPools()).to.include(poolAddr);
        });

        it("deploys several pools with different parameters", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            const params = [
                [coordinator.address, guardian.address, 5n, FREEZE_PERIOD, 1n],
                [coordinator.address, guardian.address, 10n, FREEZE_PERIOD * 2, ethers.parseEther("100")],
                [coordinator.address, guardian.address, 3n, FREEZE_PERIOD * 3 / 2, ethers.parseEther("50")],
            ];

            const poolAddresses: string[] = [];
            for (const [coordAddr, guardAddr, maxDel, freezePer, initAmt] of params) {
                const tx = await factory
                    .connect(governance)
                    .createPool(
                        coordAddr as string,
                        guardAddr as string,
                        maxDel as bigint,
                        freezePer as bigint,
                        initAmt as bigint
                    );
                const receipt = await tx.wait();
                const poolAddr = getCreatedPoolAddress(factory, receipt);

                expect(await factory.isKnownPool(poolAddr)).to.be.true;
                expect(await factory.getAllPools()).to.include(poolAddr);
                poolAddresses.push(poolAddr);
            }

            expect(await factory.getAllPools()).to.deep.equal(poolAddresses);
        });

        it("emits PoolCreated with coordinator, guardian, and pool parameters", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            const receipt = await (
                await factory
                    .connect(governance)
                    .createPool(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, 1n)
            ).wait();

            const parsed = parseCreatedPoolLog(factory, receipt);

            expect(parsed?.args[1]).to.equal(coordinator.address); // coordinator
            expect(parsed?.args[2]).to.equal(guardian.address);    // guardian
            expect(parsed?.args[3]).to.equal(5n);                  // maxDelegatees
            expect(parsed?.args[4]).to.equal(BigInt(FREEZE_PERIOD)); // freezePeriod
        });

        it("transfers initial tokens from governance to pool when amount > 0", async function () {
            const {
                factory,
                governance,
                coordinator,
                guardian,
                token,
                AMOUNT
            } = await restore();

            const receipt = await (
                await factory
                    .connect(governance)
                    .createPool(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, AMOUNT)
            ).wait();
            const poolAddr = getCreatedPoolAddress(factory, receipt);

            expect(await token.balanceOf(poolAddr)).to.equal(AMOUNT);
        });

        it("reverts if coordinator is zero address", async function () {
            const { factory, governance, guardian, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPool(
                        ethers.ZeroAddress,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        1n
                    )
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("reverts if guardian is zero address", async function () {
            const { factory, governance, coordinator, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPool(
                        coordinator.address,
                        ethers.ZeroAddress,
                        5n,
                        FREEZE_PERIOD,
                        1n
                    )
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("reverts with ZeroAmount when amount is 0", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .createPool(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        0n
                    )
            ).to.be.revertedWithCustomError(factory, "ZeroAmount");
        });

        it("reverts with FactoryAsActor when coordinator is the factory address", async function () {
            const { factory, governance, guardian } = await restore();
            const factoryAddr = await factory.getAddress();

            await expect(
                factory
                    .connect(governance)
                    .createPool(factoryAddr, guardian.address, 5n, FREEZE_PERIOD, 1n)
            )
                .to.be.revertedWithCustomError(factory, "FactoryAsActor")
                .withArgs(factoryAddr, guardian.address);
        });

        it("reverts with FactoryAsActor when guardian is the factory address", async function () {
            const { factory, governance, coordinator } = await restore();
            const factoryAddr = await factory.getAddress();

            await expect(
                factory
                    .connect(governance)
                    .createPool(coordinator.address, factoryAddr, 5n, FREEZE_PERIOD, 1n)
            )
                .to.be.revertedWithCustomError(factory, "FactoryAsActor")
                .withArgs(coordinator.address, factoryAddr);
        });

        it("emits PoolFunded with pool address and initial amount", async function () {
            const { factory, governance, coordinator, guardian, AMOUNT } = await restore();

            const poolAddr = await factory
                .connect(governance)
                .createPool.staticCall(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, AMOUNT);

            await expect(
                factory
                    .connect(governance)
                    .createPool(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, AMOUNT)
            )
                .to.emit(factory, "PoolFunded")
                .withArgs(poolAddr, AMOUNT);
        });
    });

    describe("createPoolAndFund", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, coordinator, guardian } = await restore();

            await expect(
                factory
                    .connect(other)
                    .createPoolAndFund(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        1n,
                        [other.address],
                        [1n]
                    )
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts with EmptyArray for empty delegatees array", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .createPoolAndFund(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        1n,
                        [],
                        []
                    )
            ).to.be.revertedWithCustomError(factory, "EmptyArray");
        });

        it("reverts if delegatees and amounts arrays have different lengths", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .createPoolAndFund(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        1n,
                        [coordinator.address],
                        []
                    )
            ).to.be.revertedWithCustomError(factory, "ArrayLengthMismatch");
        });

        it("reverts with MaxDelegateesExceeded when delegatees.length exceeds maxDelegatees_", async function () {
            const { factory, governance, coordinator, guardian, other } = await restore();
            const totalAmount = ethers.parseEther("200");

            await expect(
                factory
                    .connect(governance)
                    .createPoolAndFund(
                        coordinator.address,
                        guardian.address,
                        1n,
                        FREEZE_PERIOD,
                        totalAmount,
                        [coordinator.address, other.address],
                        [ethers.parseEther("100"), ethers.parseEther("100")]
                    )
            )
                .to.be.revertedWithCustomError(factory, "MaxDelegateesExceeded")
                .withArgs(2n, 1n);
        });

        it("reverts if freeze period is below minimum", async function () {
            const { factory, governance, coordinator, guardian, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPoolAndFund(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD - 1,
                        1n,
                        [other.address],
                        [1n]
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooShort");
        });

        it("reverts if freeze period is above maximum", async function () {
            const { factory, governance, coordinator, guardian, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .createPoolAndFund(
                        coordinator.address,
                        guardian.address,
                        5n,
                        MAXIMUM_FREEZE_PERIOD + 1,
                        1n,
                        [other.address],
                        [1n]
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooLong");
        });

        it("reverts with ZeroAmount if any individual amount is zero", async function () {
            const { factory, governance, coordinator, guardian, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .createPoolAndFund(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        1n,
                        [other.address],
                        [0n]
                    )
            ).to.be.revertedWithCustomError(factory, "ZeroAmount");
        });

        it("reverts with ZeroAmount when totalAmount is 0", async function () {
            const { factory, governance, coordinator, guardian, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .createPoolAndFund(
                        coordinator.address,
                        guardian.address,
                        5n,
                        FREEZE_PERIOD,
                        0n,
                        [other.address],
                        [1n]
                    )
            ).to.be.revertedWithCustomError(factory, "ZeroAmount");
        });

        it("emits PoolCreated with correct pool parameters", async function () {
            const { factory, governance, coordinator, guardian, other } = await restore();

            const receipt = await (
                await factory
                    .connect(governance)
                    .createPoolAndFund(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, 1n, [other.address], [1n])
            ).wait();

            const parsed = parseCreatedPoolLog(factory, receipt);

            expect(parsed?.args[1]).to.equal(coordinator.address);
            expect(parsed?.args[2]).to.equal(guardian.address);
            expect(parsed?.args[3]).to.equal(5n);
            expect(parsed?.args[4]).to.equal(BigInt(FREEZE_PERIOD));
        });

        it("transfers total amount from governance to pool and emits PoolFunded", async function () {
            const { factory, governance, coordinator, guardian, other, AMOUNT } = await restore();

            const delegatees = [other.address];
            const amounts = [AMOUNT];

            const poolAddr = await factory
                .connect(governance)
                .createPoolAndFund
                .staticCall(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, AMOUNT, delegatees, amounts);

            await expect(
                factory
                    .connect(governance)
                    .createPoolAndFund(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, AMOUNT, delegatees, amounts)
            )
                .to.emit(factory, "PoolFunded")
                .withArgs(poolAddr, AMOUNT);
        });

        it("delegates to each delegatee via the pool", async function () {
            const { factory, governance, coordinator, guardian, other, token, AMOUNT } = await restore();

            const amount1 = AMOUNT / 3n;
            const amount2 = AMOUNT - amount1;
            const delegatees = [other.address, guardian.address];
            const amounts = [amount1, amount2];

            const tx = await factory
                .connect(governance)
                .createPoolAndFund(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, AMOUNT, delegatees, amounts);
            const receipt = await tx.wait();
            const poolAddr = getCreatedPoolAddress(factory, receipt);
            const pool = await ethers.getContractAt("FranchiserPool", poolAddr);

            expect(await token.balanceOf(await pool.getFranchiser(other.address))).to.equal(amount1);
            expect(await token.balanceOf(await pool.getFranchiser(guardian.address))).to.equal(amount2);
        });
    });

    describe("fundPool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .fundPool(await pool.getAddress(), ethers.parseEther("100"))
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .fundPool(other.address, ethers.parseEther("100"))
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("reverts with ZeroAmount when amount is 0", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory.connect(governance).fundPool(await pool.getAddress(), 0n)
            ).to.be.revertedWithCustomError(factory, "ZeroAmount");
        });

        it("transfers tokens from governance to pool and emits PoolFunded", async function () {
            const { factory, governance, pool, token } = await restorePool();

            const fundAmount = ethers.parseEther("500");
            const poolAddr = await pool.getAddress();

            const poolBalanceBefore = await token.balanceOf(poolAddr);
            const govBalanceBefore = await token.balanceOf(governance.address);

            await expect(
                factory.connect(governance).fundPool(poolAddr, fundAmount)
            )
                .to.emit(factory, "PoolFunded")
                .withArgs(poolAddr, fundAmount);

            expect(await token.balanceOf(poolAddr)).to.equal(poolBalanceBefore + fundAmount);
            expect(await token.balanceOf(governance.address)).to.equal(govBalanceBefore - fundAmount);
        });
    });

    describe("transferToPool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .transferToPool(await pool.getAddress(), ethers.parseEther("100"))
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .transferToPool(other.address, ethers.parseEther("100"))
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("reverts with ZeroAmount when amount is 0", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory.connect(governance).transferToPool(await pool.getAddress(), 0n)
            ).to.be.revertedWithCustomError(factory, "ZeroAmount");
        });

        it("transfers tokens from factory own balance to pool and emits PoolFunded", async function () {
            const { factory, governance, pool, token } = await restorePool();

            const transferAmount = ethers.parseEther("500");
            const factoryAddr = await factory.getAddress();
            const poolAddr = await pool.getAddress();

            // Seed the factory contract itself with tokens (safeTransfer, not safeTransferFrom)
            await token.connect(governance).transfer(factoryAddr, transferAmount);

            const poolBalanceBefore = await token.balanceOf(poolAddr);

            await expect(
                factory.connect(governance).transferToPool(poolAddr, transferAmount)
            )
                .to.emit(factory, "PoolFunded")
                .withArgs(poolAddr, transferAmount);

            expect(await token.balanceOf(poolAddr)).to.equal(poolBalanceBefore + transferAmount);
            expect(await token.balanceOf(factoryAddr)).to.equal(0n);
        });

        it("pool can delegate tokens received via direct transfer", async function () {
            const {
                factory,
                governance,
                pool,
                token,
                coordinator,
                other
            } = await restorePool();

            const transferAmount = ethers.parseEther("500");
            const factoryAddr = await factory.getAddress();
            const poolAddr = await pool.getAddress();

            await token.connect(governance).transfer(factoryAddr, transferAmount);
            await factory.connect(governance).transferToPool(poolAddr, transferAmount);

            // Coordinator should be able to delegate the freshly-transferred tokens
            await pool.connect(coordinator).delegate(other.address, transferAmount);

            expect(await token.getCurrentVotes(other.address)).to.equal(transferAmount);
            expect(await token.balanceOf(await pool.getFranchiser(other.address))).to.equal(transferAmount);
        });
    });

    describe("haltPool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .haltPool(await pool.getAddress(), other.address)
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .haltPool(other.address, other.address)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("reverts if recipient is zero address", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .haltPool(await pool.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });

        it("drains pool balance to recipient and emits PoolHalted", async function () {
            const {
                factory,
                governance,
                pool,
                other,
                token,
                AMOUNT
            } = await restorePool();

            const poolAddr = await pool.getAddress();

            await expect(
                factory
                    .connect(governance)
                    .haltPool(poolAddr, other.address)
            )
                .to.emit(factory, "PoolHalted")
                .withArgs(poolAddr, other.address);

            expect(await token.balanceOf(poolAddr)).to.equal(0n);
            expect(await token.balanceOf(other.address)).to.equal(AMOUNT);
        });
    });

    describe("setCoordinator", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .setCoordinator(await pool.getAddress(), other.address)
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .setCoordinator(other.address, other.address)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("updates pool coordinator and emits CoordinatorUpdated", async function () {
            const { factory, governance, pool, other } = await restorePool();

            const poolAddr = await pool.getAddress();

            await expect(
                factory.connect(governance).setCoordinator(poolAddr, other.address)
            )
                .to.emit(factory, "CoordinatorUpdated")
                .withArgs(poolAddr, other.address);

            expect(await pool.coordinator()).to.equal(other.address);
        });

        it("reverts if new coordinator is zero address", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .setCoordinator(await pool.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });
    });

    describe("setGuardian", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .setGuardian(await pool.getAddress(), other.address)
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .setGuardian(other.address, other.address)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("updates pool guardian and emits GuardianUpdated", async function () {
            const { factory, governance, pool, other } = await restorePool();

            const poolAddr = await pool.getAddress();

            await expect(
                factory.connect(governance).setGuardian(poolAddr, other.address)
            )
                .to.emit(factory, "GuardianUpdated")
                .withArgs(poolAddr, other.address);

            expect(await pool.guardian()).to.equal(other.address);
        });

        it("reverts if new guardian is zero address", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .setGuardian(await pool.getAddress(), ethers.ZeroAddress)
            ).to.be.revertedWithCustomError(pool, "ZeroAddress");
        });
    });

    describe("setMaxDelegatees", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .setMaxDelegatees(await pool.getAddress(), 10n)
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .setMaxDelegatees(other.address, 10n)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("reverts if maxDelegatees is 0", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory.connect(governance).setMaxDelegatees(await pool.getAddress(), 0n)
            ).to.be.revertedWithCustomError(pool, "ZeroAmount");
        });

        it("reverts if maxDelegatees exceeds DELEGATEES_LIMIT", async function () {
            const { factory, governance, pool } = await restorePool();
            const limit = await pool.DELEGATEES_LIMIT();

            await expect(
                factory.connect(governance).setMaxDelegatees(await pool.getAddress(), limit + 1n)
            ).to.be.revertedWithCustomError(pool, "MaxDelegateesExceedsLimit");
        });

        it("reverts with SameValue when maxDelegatees is unchanged", async function () {
            const { factory, governance, pool } = await restorePool();
            const current = await pool.maxDelegatees();

            await expect(
                factory.connect(governance).setMaxDelegatees(await pool.getAddress(), current)
            )
                .to.be.revertedWithCustomError(pool, "SameValue")
                .withArgs(current);
        });

        it("updates pool maxDelegatees and emits MaxDelegateesUpdated", async function () {
            const { factory, governance, pool } = await restorePool();

            const poolAddr = await pool.getAddress();

            await expect(
                factory.connect(governance).setMaxDelegatees(poolAddr, 10n)
            )
                .to.emit(factory, "MaxDelegateesUpdated")
                .withArgs(poolAddr, 10n);

            expect(await pool.maxDelegatees()).to.equal(10n);
        });
    });

    describe("setFreezePeriod", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory
                    .connect(other)
                    .setFreezePeriod(
                        await pool.getAddress(),
                        BigInt(FREEZE_PERIOD)
                    )
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory
                    .connect(governance)
                    .setFreezePeriod(other.address, BigInt(FREEZE_PERIOD))
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("reverts if new freeze period is below minimum", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .setFreezePeriod(
                        await pool.getAddress(),
                        BigInt(FREEZE_PERIOD - 1)
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooShort");
        });

        it("reverts if new freeze period is above maximum", async function () {
            const { factory, governance, pool } = await restorePool();

            await expect(
                factory
                    .connect(governance)
                    .setFreezePeriod(
                        await pool.getAddress(),
                        BigInt(MAXIMUM_FREEZE_PERIOD + 1)
                    )
            ).to.be.revertedWithCustomError(pool, "FreezePeriodTooLong");
        });

        it("reverts with SameValue when freeze period is unchanged", async function () {
            const { factory, governance, pool } = await restorePool();
            const current = await pool.freezePeriod();

            await expect(
                factory.connect(governance).setFreezePeriod(await pool.getAddress(), current)
            )
                .to.be.revertedWithCustomError(pool, "SameValue")
                .withArgs(current);
        });

        it("updates pool freeze period and emits FreezePeriodUpdated", async function () {
            const { factory, governance, pool } = await restorePool();

            const poolAddr = await pool.getAddress();
            const newPeriod = BigInt(FREEZE_PERIOD * 2);

            await expect(
                factory.connect(governance).setFreezePeriod(poolAddr, newPeriod)
            )
                .to.emit(factory, "FreezePeriodUpdated")
                .withArgs(poolAddr, newPeriod);

            expect(await pool.freezePeriod()).to.equal(newPeriod);
        });
    });

    describe("unfreezePool", function () {
        it("reverts if caller is not governance", async function () {
            const { factory, other, pool } = await restorePool();

            await expect(
                factory.connect(other).unfreezePool(await pool.getAddress())
            )
                .to.be.revertedWithCustomError(factory, "NotGovernance")
                .withArgs(other.address, await factory.governance());
        });

        it("reverts if pool is unknown", async function () {
            const { factory, governance, other } = await restore();

            await expect(
                factory.connect(governance).unfreezePool(other.address)
            )
                .to.be.revertedWithCustomError(factory, "UnknownPool")
                .withArgs(other.address);
        });

        it("reverts with PoolNotFrozen when pool is not currently frozen", async function () {
            const { factory, governance, pool } = await restorePool();

            expect(await pool.frozenUntil()).to.equal(0n);

            await expect(
                factory.connect(governance).unfreezePool(await pool.getAddress())
            ).to.be.revertedWithCustomError(pool, "PoolNotFrozen");
        });

        it("unfreezes pool and emits PoolUnfrozen", async function () {
            const { factory, governance, pool } = await restorePool();

            const poolAddr = await pool.getAddress();

            // First freeze via guardian
            const guardian = await ethers.getSigner(await pool.guardian());
            await pool.connect(guardian).emergencyFreezePool();
            expect(await pool.frozenUntil()).to.be.gt(0n);

            await expect(
                factory.connect(governance).unfreezePool(poolAddr)
            )
                .to.emit(factory, "PoolUnfrozen")
                .withArgs(poolAddr);

            expect(await pool.frozenUntil()).to.equal(0n);
        });
    });

    describe("isKnownPool", function () {
        it("returns false for an address not deployed by this factory", async function () {
            const { factory, other } = await restore();

            expect(await factory.isKnownPool(other.address)).to.be.false;
        });

        it("returns true for a pool deployed by this factory", async function () {
            const { factory, pool } = await restorePool();

            expect(await factory.isKnownPool(await pool.getAddress())).to.be.true;
        });
    });

    describe("getAllPools", function () {
        it("returns an empty array when no pools have been created", async function () {
            const { factory } = await restore();

            expect(await factory.getAllPools()).to.deep.equal([]);
        });

        it("returns an array of all pool addresses created by this factory", async function () {
            const { factory, governance, coordinator, guardian } = await restore();

            const receipt1 = await (
                await factory
                    .connect(governance)
                    .createPool(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, 1n)
            ).wait();
            const poolAddr1 = getCreatedPoolAddress(factory, receipt1);

            const receipt2 = await (
                await factory
                    .connect(governance)
                    .createPool(coordinator.address, guardian.address, 5n, FREEZE_PERIOD, 1n)
            ).wait();
            const poolAddr2 = getCreatedPoolAddress(factory, receipt2);

            const pools = await factory.getAllPools();
            expect(pools).to.deep.equal([poolAddr1, poolAddr2]);
        });
    });
});
