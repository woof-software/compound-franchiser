import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function deployFixture() {
    const [owner, delegatee, subDelegatee, other] = await ethers.getSigners();

    const token = await ethers.deployContract("MockVotingToken");
    const factory = await ethers.deployContract("FranchiserFactory", [
        await token.getAddress(),
    ]);

    const AMOUNT = ethers.parseEther("1000");
    await token.mint(owner.address, AMOUNT * 10n);
    await token.connect(owner).approve(await factory.getAddress(), ethers.MaxUint256);

    return { owner, delegatee, subDelegatee, other, token, factory, AMOUNT };
}

async function fundedFranchiserFixture() {
    const base = await deployFixture();
    const { owner, delegatee, factory, AMOUNT } = base;

    await factory.connect(owner).fund(delegatee.address, AMOUNT);
    const franchiserAddr = await factory.getFranchiser(owner.address, delegatee.address);
    const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);

    return { ...base, franchiser, franchiserAddr };
}

const restore = async () => await networkHelpers.loadFixture(fundedFranchiserFixture);

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Franchiser", function () {
    describe("constants", function () {
        it("DECAY_FACTOR is 2", async function () {
            const { franchiser } = await restore();
            expect(await franchiser.DECAY_FACTOR()).to.equal(2n);
        });

        it("franchiserImplementation is set", async function () {
            const { franchiser, factory } = await restore();

            const implAddr = await franchiser.franchiserImplementation();
            expect(implAddr).to.not.equal(ethers.ZeroAddress);

            // Each clone points to the factory's implementation
            const factoryImpl = await factory.franchiserImplementation();
            expect(implAddr).to.equal(factoryImpl);
        });
    });

    describe("initialize", function () {
        it("reverts with AlreadyInitialized on second call", async function () {
            const { franchiser, delegatee } = await restore();

            await expect(
                franchiser.connect(delegatee)["initialize(address,uint96)"](delegatee.address, 1n)
            ).to.be.revertedWithCustomError(franchiser, "AlreadyInitialized");
        });

        it("sets delegatee correctly", async function () {
            const { franchiser, delegatee } = await restore();

            expect(await franchiser.delegatee()).to.equal(delegatee.address);
        });

        it("sets owner to the factory", async function () {
            const { franchiser, factory } = await restore();

            expect(await franchiser.owner()).to.equal(await factory.getAddress());
        });

        it("sets maximumSubDelegatees from factory constant", async function () {
            const { franchiser, factory } = await restore();

            const expected = await factory.INITIAL_MAXIMUM_SUBDELEGATEES();
            expect(await franchiser.maximumSubDelegatees()).to.equal(expected);
        });

        it("emits Initialized event", async function () {
            const { owner, delegatee, factory, AMOUNT } = await networkHelpers.loadFixture(deployFixture);

            const franchiserAddr = await factory.getFranchiser(
                owner.address,
                delegatee.address
            );

            const franchiser = await ethers.getContractAt("Franchiser", franchiserAddr);

            await expect(factory.connect(owner).fund(delegatee.address, AMOUNT))
                .to.emit(franchiser, "Initialized")
                .withArgs(
                    await factory.getAddress(),
                    owner.address,
                    delegatee.address,
                    1n
                );
        });

        it("delegates voting power to delegatee", async function () {
            const { token, delegatee, AMOUNT } = await restore();

            // The franchiser's balance counts as voting power for the delegatee
            const votes = await token.getCurrentVotes(delegatee.address);
            expect(votes).to.eq(AMOUNT);
        });
    });

    describe("delegator", function () {
        it("returns the explicit delegator set at initialization", async function () {
            const { franchiser, owner } = await restore();
            expect(await franchiser.delegator()).to.equal(owner.address);
        });

        it("sub-franchiser delegator is derived from parent franchiser's delegatee", async function () {
            const { franchiser, delegatee, subDelegatee, token, AMOUNT } = await restore();

            const mainDelegateeVotesBefore = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesBefore = await token.getCurrentVotes(subDelegatee.address);

            await franchiser.connect(delegatee).subDelegate(subDelegatee.address, AMOUNT / 2n);

            const mainDelegateeVotesAfter = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesAfter = await token.getCurrentVotes(subDelegatee.address);

            // Delegatee loses votes, sub-delegatee gains votes
            expect(mainDelegateeVotesAfter).to.be.equal(mainDelegateeVotesBefore - AMOUNT / 2n);
            expect(subDelegateeVotesAfter).to.be.equal(subDelegateeVotesBefore + AMOUNT / 2n);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);
            const subFranchiser = await ethers.getContractAt(
                "Franchiser",
                subAddr
            );

            // Sub-franchiser has no explicit delegator, derives it from parent
            expect(await subFranchiser.delegator()).to.equal(delegatee.address);
        });
    });

    describe("subDelegate", function () {
        it("reverts if caller is not the delegatee", async function () {
            const { franchiser, other, subDelegatee } = await restore();
            await expect(
                franchiser
                    .connect(other)
                    .subDelegate(subDelegatee.address, 100n)
            )
                .to.be.revertedWithCustomError(franchiser, "NotDelegatee")
                .withArgs(other.address, await franchiser.delegatee());
        });

        it("creates a clone franchiser for the sub-delegatee", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            const predictedAddr = await franchiser.getFranchiser(subDelegatee.address);

            // No contract
            expect(
                (await ethers.provider.getCode(predictedAddr)).length
            ).to.equal(2); // "0x"

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            // Now there is code at the predicted address
            expect(
                (await ethers.provider.getCode(predictedAddr)).length
            ).to.be.gt(2);
        });

        it("transfers tokens to the sub-franchiser", async function () {
            const { franchiser, delegatee, subDelegatee, token, AMOUNT } = await restore();

            const subAmount = AMOUNT / 2n;
            const subAddr = await franchiser.getFranchiser(subDelegatee.address);

            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegate(subDelegatee.address, subAmount)
            ).to.changeTokenBalances(
                ethers,
                token,
                [franchiser, subAddr],
                [-subAmount, subAmount]
            );
        });

        it("emits SubDelegateeActivated on first sub-delegation", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegate(subDelegatee.address, AMOUNT / 2n)
            )
                .to.emit(franchiser, "SubDelegateeActivated")
                .withArgs(subDelegatee.address);
        });

        it("does not re-emit SubDelegateeActivated on repeated sub-delegation", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            // Second sub-delegation to same address should NOT emit SubDelegateeActivated
            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegate(subDelegatee.address, AMOUNT / 2n)
            ).to.not.emit(franchiser, "SubDelegateeActivated");
        });

        it("reverts at the maximumSubDelegatees cap", async function () {
            const { franchiser, delegatee, subDelegatee, other, AMOUNT } = await restore();

            // First sub-delegation fills the single slot (max = 1)
            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            // Second to a different address should revert
            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegate(other.address, AMOUNT / 2n)
            )
                .to.be.revertedWithCustomError(
                    franchiser,
                    "CannotExceedMaximumSubDelegatees"
                )
                .withArgs(1n);
        });

        it("sub-franchiser receives zero maximumSubDelegatees (1 / DECAY_FACTOR)", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);
            const subFranchiser = await ethers.getContractAt(
                "Franchiser",
                subAddr
            );
            expect(await subFranchiser.maximumSubDelegatees()).to.equal(0n);
        });

        it("adds sub-delegatee to the subDelegatees set", async function () {
            const { franchiser, delegatee, subDelegatee, AMOUNT } = await restore();

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            const subs = await franchiser.subDelegatees();
            expect(subs).to.include(subDelegatee.address);
        });
    });

    describe("subDelegateMany", function () {
        it("reverts when array lengths differ", async function () {
            const { franchiser, delegatee, subDelegatee } = await restore();

            await expect(
                franchiser
                    .connect(delegatee)
                    .subDelegateMany([subDelegatee.address], [100n, 200n])
            )
                .to.be.revertedWithCustomError(franchiser, "ArrayLengthMismatch")
                .withArgs(1n, 2n);
        });

        it("delegates to multiple sub-delegatees in one call", async function () {
            const { franchiser, delegatee, subDelegatee, token, AMOUNT } = await restore();

            const mainDelegateeVotesBefore = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesBefore = await token.getCurrentVotes(subDelegatee.address);

            // Only one sub-delegatee allowed (max=1), so just test with one
            await franchiser
                .connect(delegatee)
                .subDelegateMany([subDelegatee.address], [AMOUNT / 2n]);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);

            expect(await token.balanceOf(subAddr)).to.equal(AMOUNT / 2n);

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(mainDelegateeVotesBefore - AMOUNT / 2n);
            expect(await token.getCurrentVotes(subDelegatee.address)).to.be.equal(subDelegateeVotesBefore + AMOUNT / 2n);
        });
    });

    describe("unSubDelegate", function () {
        async function subDelegatedFixture() {
            const base = await fundedFranchiserFixture();

            const { franchiser, delegatee, subDelegatee, AMOUNT } = base;

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            return base;
        }

        it("reverts if caller is not the delegatee", async function () {
            const { franchiser, other, subDelegatee } = await networkHelpers.loadFixture(subDelegatedFixture);

            await expect(
                franchiser.connect(other).unSubDelegate(subDelegatee.address)
            )
                .to.be.revertedWithCustomError(franchiser, "NotDelegatee")
                .withArgs(other.address, await franchiser.delegatee());
        });

        it("returns tokens from the sub-franchiser to the parent", async function () {
            const { franchiser, delegatee, subDelegatee, token } = await networkHelpers.loadFixture(subDelegatedFixture);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);
            const subBalance = await token.balanceOf(subAddr);

            await expect(
                franchiser.connect(delegatee).unSubDelegate(subDelegatee.address)
            ).to.changeTokenBalances(
                ethers,
                token,
                [subAddr, franchiser],
                [-subBalance, subBalance]
            );
        });

        it("emits SubDelegateeDeactivated", async function () {
            const { franchiser, delegatee, subDelegatee } = await networkHelpers.loadFixture(subDelegatedFixture);

            await expect(
                franchiser.connect(delegatee).unSubDelegate(subDelegatee.address)
            )
                .to.emit(franchiser, "SubDelegateeDeactivated")
                .withArgs(subDelegatee.address);
        });

        it("removes sub-delegatee from the subDelegatees set", async function () {
            const { franchiser, delegatee, subDelegatee } = await networkHelpers.loadFixture(subDelegatedFixture);

            await franchiser
                .connect(delegatee)
                .unSubDelegate(subDelegatee.address);

            expect(await franchiser.subDelegatees()).to.not.include(subDelegatee.address);
        });

        it("is a no-op for an address that was never a sub-delegatee", async function () {
            const { franchiser, delegatee, other } = await networkHelpers.loadFixture(subDelegatedFixture);

            // Should not revert, just does nothing
            await franchiser.connect(delegatee).unSubDelegate(other.address);
        });
    });

    describe("unSubDelegateMany", function () {
        it("un-delegates multiple sub-delegatees", async function () {
            const { franchiser, delegatee, subDelegatee, token, AMOUNT } = await restore();

            await franchiser.connect(delegatee).subDelegate(subDelegatee.address, AMOUNT / 2n);

            const mainDelegateeVotesBefore = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesBefore = await token.getCurrentVotes(subDelegatee.address);
            expect(subDelegateeVotesBefore).to.be.equal(AMOUNT / 2n);

            await franchiser.connect(delegatee).unSubDelegateMany([subDelegatee.address]);

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(mainDelegateeVotesBefore + subDelegateeVotesBefore);
            expect(await token.getCurrentVotes(subDelegatee.address)).to.be.equal(0);

            expect(await franchiser.subDelegatees()).to.be.empty;
        });

        it("reverts if caller is not the delegatee", async function () {
            const { franchiser, other, subDelegatee } = await restore();

            await expect(
                franchiser.connect(other).unSubDelegateMany([subDelegatee.address])
            ).to.be.revertedWithCustomError(franchiser, "NotDelegatee")
                .withArgs(other.address, await franchiser.delegatee());
        });
    });

    describe("recall", function () {
        it("reverts if caller is not the owner (factory)", async function () {
            const { franchiser, other } = await restore();

            await expect(
                franchiser.connect(other).recall(other.address)
            ).to.be.revertedWithCustomError(
                franchiser,
                "OwnableUnauthorizedAccount"
            );
        });

        it("transfers the full balance and votes to the recipient", async function () {
            const { franchiser, owner, delegatee, factory, token, AMOUNT } = await restore();

            const delegateeVotesBefore = await token.getCurrentVotes(delegatee.address);

            await expect(
                factory.connect(owner).recall(delegatee.address, owner.address)
            ).to.changeTokenBalances(
                ethers,
                token,
                [franchiser, owner],
                [-AMOUNT, AMOUNT]
            );

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(delegateeVotesBefore - AMOUNT);
        });

        it("also recalls tokens from active sub-franchisers", async function () {
            const {
                franchiser,
                owner,
                delegatee,
                subDelegatee,
                factory,
                token,
                AMOUNT,
            } = await restore();
          
            const mainDelegateeVotesBefore = await token.getCurrentVotes(delegatee.address);
            const subDelegateeVotesBefore = await token.getCurrentVotes(subDelegatee.address);

            await franchiser
                .connect(delegatee)
                .subDelegate(subDelegatee.address, AMOUNT / 2n);

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(mainDelegateeVotesBefore - AMOUNT / 2n);
            expect(await token.getCurrentVotes(subDelegatee.address)).to.be.equal(subDelegateeVotesBefore + AMOUNT / 2n);

            const subAddr = await franchiser.getFranchiser(subDelegatee.address);

            const ownerBalanceBefore = await token.balanceOf(owner.address);

            await factory.connect(owner).recall(delegatee.address, owner.address);

            expect(await token.getCurrentVotes(delegatee.address)).to.be.equal(0);
            expect(await token.getCurrentVotes(subDelegatee.address)).to.be.equal(0);

            // Both balances should be drained
            expect(await token.balanceOf(owner.address)).to.equal(ownerBalanceBefore + AMOUNT);
            expect(await token.balanceOf(await franchiser.getAddress())).to.equal(0n);
            expect(await token.balanceOf(subAddr)).to.equal(0n);
        });
    });
});
