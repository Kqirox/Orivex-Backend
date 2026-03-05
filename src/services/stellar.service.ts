/**
 * StellarService
 *
 * Thin abstraction over the Stellar / Soroban SDK so the rest of the
 * application is not coupled to network details. In production this class
 * would use @stellar/stellar-sdk; for now it provides the interface needed
 * by RewardService so everything can be tested with mocks.
 */
export class StellarService {
  /**
   * Send an XLM payment to `destinationAddress`.
   * Returns the transaction hash on success.
   */
  async sendPayment(
    destinationAddress: string,
    amount: number,
    memo: string,
  ): Promise<string> {
    // Production: build & submit a Stellar transaction via stellar-sdk
    throw new Error(
      `StellarService.sendPayment not implemented. ` +
        `Would send ${amount} XLM to ${destinationAddress} with memo "${memo}"`,
    );
  }

  /**
   * Look up the wallet address stored for a given user.
   * Returns undefined when the user has no wallet on record.
   */
  async getWalletAddress(userId: string): Promise<string | undefined> {
    // Production: query the database for user.walletAddress
    throw new Error(
      `StellarService.getWalletAddress not implemented for user "${userId}"`,
    );
  }

  /**
   * Verify that a transaction hash exists and is confirmed on the network.
   */
  async verifyTransaction(txHash: string): Promise<boolean> {
    throw new Error(
      `StellarService.verifyTransaction not implemented for hash "${txHash}"`,
    );
  }
}
