# BadExplorer

BadExplorer is the official blockchain explorer for the Badcoin network.

It provides a public interface for searching and viewing Badcoin blockchain data, including blocks, transactions, addresses, network information, and Badcoin-specific transaction data.

**Live Explorer:** https://explorer.badcoin.dev

## About BadExplorer

BadExplorer began as a fork of the open-source eIquidus block explorer and was originally based on eIquidus commit `b624707`.

The project has since been adapted and extended specifically for Badcoin. BadExplorer retains the core explorer architecture inherited from eIquidus while incorporating Badcoin-specific blockchain support, operational changes, reliability improvements, and public presentation features.

BadExplorer is maintained as part of the Badcoin project.

## Badcoin Network Support

BadExplorer supports the Badcoin mainnet and its multi-algorithm proof-of-work blockchain.

Badcoin uses five mining algorithms:

* SHA256d
* Scrypt
* Groestl
* Skein
* Yescrypt

BadExplorer provides public access to blockchain information including:

* blocks by height or hash
* transactions by transaction ID
* address balances and transaction history
* recent blocks and transactions
* blockchain and network statistics
* multi-algorithm block information
* multi-algorithm difficulty information
* OP_RETURN data
* BadGlyph transaction presentation
* public blockchain API functionality

## Architecture

BadExplorer is a Node.js application built around:

* Express
* MongoDB and Mongoose
* Pug templates
* Sass

The explorer communicates with Badcoin Core through its RPC interface and maintains indexed blockchain data in MongoDB for explorer queries and presentation.

The application supports multiple worker processes through its cluster launcher.

## Configuration

BadExplorer uses an external configuration file in production:

`/etc/badexplorer/settings.json`

Production configuration is intentionally kept outside the repository so that credentials and environment-specific settings are not stored with the source code.

A `settings.json.template` file is provided with the source tree for development and deployment reference.

Do not commit production RPC credentials, database credentials, private keys, or other secrets to the repository.

## Development

Install dependencies:

```bash
npm install
```

Start BadExplorer:

```bash
npm start
```

The start command launches BadExplorer through its Node.js cluster runner.

Run the Jasmine test suite:

```bash
npm test
```

Some explorer functionality requires access to a Badcoin Core RPC endpoint and MongoDB database. Tests or features that depend on external services may also require those services to be available.

Production deployment and service management are environment-specific and are intentionally kept separate from the basic development instructions in this README.

## Project Status

BadExplorer is actively maintained as part of the Badcoin public infrastructure.

Current development emphasizes blockchain-data correctness, explorer stability, Badcoin-specific functionality, and progressive modernization of the public explorer experience.

## Project History and Upstream Attribution

BadExplorer is derived from [eIquidus](https://github.com/team-exor/eiquidus), which itself developed from the original [Iquidus block explorer](https://github.com/iquidus/explorer).

The Badcoin project acknowledges the developers and contributors of eIquidus, Iquidus, and the projects represented in the repository's existing copyright notices. Their work forms the foundation on which BadExplorer was built.

BadExplorer has since diverged from its upstream base to support the Badcoin network and the requirements of the current Badcoin explorer infrastructure.

Applicable upstream copyright and licensing notices remain in effect.

## License

BadExplorer is distributed under the BSD 3-Clause license.

See [LICENSE](LICENSE) for the complete copyright notices, license terms, and disclaimer.
