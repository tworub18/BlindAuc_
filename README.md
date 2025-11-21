# BlindAuc: A FHE-based Blind Auction System

BlindAuc is a privacy-preserving auction application powered by Zama's Fully Homomorphic Encryption (FHE) technology. It enables bidders to submit encrypted bids, ensuring that sensitive information remains confidential while allowing for secure computation of the highest bid, effectively preventing bidding sniping and maintaining fairness throughout the auction process.

## The Problem

In traditional auction systems, bids are often submitted in cleartext, exposing sensitive financial information that can lead to unfair practices such as sniping or collusion. This lack of privacy not only undermines the integrity of the auction process but also discourages participants from taking part due to the fear of their bids being exposed. Moreover, intermediaries often have access to clear data, raising concerns about data breaches and misuse.

## The Zama FHE Solution

BlindAuc leverages Fully Homomorphic Encryption to ensure that all bids are processed in an encrypted format. By using Zama's advanced technology, the system can compute the highest bid without ever revealing the individual bids in cleartext. This is accomplished through:

- **Computation on Encrypted Data**: Using fhevm to process encrypted inputs, BlindAuc can efficiently determine the winning bid while ensuring that no one has access to the actual bid values.
- **Privacy-Preserving Bidding**: All bids remain confidential throughout the auction lifecycle, empowering participants to engage with confidence.

## Key Features

- 🔐 **Encryption**: Every bid is encrypted, ensuring privacy and security.
- 🤝 **Vickrey Auction Model**: Implementing a Vickrey auction format promotes fair competition among bidders.
- ⚙️ **Automatic Settlement**: Complete automation of bid evaluation and winner determination.
- 📈 **Fair Bidding**: Shield bidders from external influences and potential sniping attacks.
- 🎨 **NFT Integration**: Seamlessly integrate with NFT items for unique auction experiences.

## Technical Architecture & Stack

BlindAuc utilizes the following technical stack:

- **Core Privacy Engine**: Zama’s FHE technology
- **Smart Contract Development**: fhevm
- **Frontend**: React for user interface
- **Backend**: Node.js for server-side operations

## Smart Contract / Core Logic

The core logic of BlindAuc is encapsulated in a smart contract that securely handles bid submissions and auction management. Below is a simplified example of how the contract might look:solidity
pragma solidity ^0.8.0;

contract BlindAuc {
    struct Bid {
        uint64 encryptedBid;
        address bidder;
    }
    
    function submitBid(uint64 encryptedBid) public {
        // Process the encrypted bid
        // store in the auction's bid list
    }
    
    function determineWinner() public view returns (address) {
        // Logic to determine the highest encrypted bid
        // Decrypt bids using TFHE libraries
    }
}

## Directory Structure

The following directory structure outlines the organization of files within the BlindAuc project:
BlindAuc/
├── contracts/
│   └── BlindAuc.sol
├── scripts/
│   └── bid_submission.py
├── frontend/
│   ├── src/
│   └── public/
└── README.md

## Installation & Setup

### Prerequisites

To get started with BlindAuc, ensure you have the following installed:

- Node.js
- npm
- Python 3.x

### Dependencies Installation

Install the necessary dependencies using the following commands:bash
npm install --save fhevm
pip install concrete-ml

You may also need to install additional packages for your chosen frontend framework and backend if required.

## Build & Run

To compile the smart contracts and run the application, use the following commands:

1. Compile smart contracts:bash
   npx hardhat compile

2. Start the backend server:bash
   node server.js

3. Run the frontend application:bash
   npm start

## Acknowledgements

This project would not be possible without the pioneering work of Zama in the field of Fully Homomorphic Encryption. Their open-source FHE primitives provided the necessary tools and frameworks that enable BlindAuc to deliver a secure and private auction experience.

---
With BlindAuc, experience a revolutionized way to participate in auctions, where privacy is paramount, and competition is fair. Join us in redefining auction integrity with the power of Zama's FHE technology!