import "dotenv/config";
import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import hardhatMarkup from "@solarity/hardhat-markup";

export default defineConfig({
    plugins: [hardhatMarkup, hardhatToolboxMochaEthersPlugin],
    solidity: {
        profiles: {
            default: {
                version: "0.8.35",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    }
                }
            },
            production: {
                version: "0.8.35",
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 200
                    }
                }
            }
        }
    },
    networks: {
        hardhatMainnet: {
            type: "edr-simulated",
            chainType: "l1",
            forking: {
                // Tests fork mainnet to interact with the real COMP token, so this is
                // read directly from .env (via dotenv) rather than the keystore-backed
                // configVariable used by the deployment networks below.
                url: process.env.MAINNET_RPC_URL ?? "",
            }
        },
        hardhatOp: {
            type: "edr-simulated",
            chainType: "op"
        },
        sepolia: {
            type: "http",
            chainType: "l1",
            url: configVariable("SEPOLIA_RPC_URL"),
            accounts: [configVariable("SEPOLIA_PRIVATE_KEY")]
        },
        mainnet: {
            type: "http",
            chainType: "l1",
            url: configVariable("MAINNET_RPC_URL"),
            accounts: [configVariable("MAINNET_PRIVATE_KEY")]
        }
    },
    verify: {
        etherscan: {
            apiKey: configVariable("ETHERSCAN_API_KEY")
        }
    }
});
