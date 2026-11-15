/** Shared constants for E2E runs. Everything here is local-only test data. */
export const ANVIL_PORT = 8546;
export const ANVIL_URL = `http://127.0.0.1:${ANVIL_PORT}`;
export const WEB_PORT = 4310;
/** Local indexer Worker (wrangler dev) reading the anvil chain (ADR 0036). */
export const INDEXER_PORT = 8787;
export const INDEXER_URL = `http://127.0.0.1:${INDEXER_PORT}`;
/** Fuji's chain id, so the app treats the local chain as its target network. */
export const CHAIN_ID = 43113;

/**
 * Anvil's well-known dev accounts (from the public test mnemonic). They hold fake AVAX
 * on the local chain only. Account 0 deploys the factory, so its address is deterministic.
 */
export const ACCOUNTS = {
  deployer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  alice: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  bob: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  carol: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  dave: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
} as const;

/** The deployer's first contract (nonce 0): the linked Membership library (ADR 0031). */
export const MEMBERSHIP_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
/** The deployer's second contract (nonce 1): CircleFactory, linked to MEMBERSHIP_ADDRESS. */
export const FACTORY_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
