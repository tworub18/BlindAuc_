pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract BlindAuction is ZamaEthereumConfig {
    struct Bid {
        address bidder;
        euint32 encryptedBid;
        uint256 deposit;
        bool revealed;
    }

    struct Auction {
        string nftId;
        uint256 startTime;
        uint256 endTime;
        uint256 highestBid;
        address highestBidder;
        bool isActive;
        mapping(address => Bid) bids;
        address[] bidders;
    }

    mapping(string => Auction) public auctions;
    string[] public auctionIds;

    event AuctionCreated(string indexed nftId, uint256 startTime, uint256 endTime);
    event BidPlaced(string indexed nftId, address indexed bidder, euint32 encryptedBid);
    event BidRevealed(string indexed nftId, address indexed bidder, uint32 decryptedBid);
    event AuctionFinalized(string indexed nftId, address winner, uint256 highestBid);
    event BidWithdrawn(string indexed nftId, address indexed bidder);

    modifier auctionActive(string calldata nftId) {
        require(auctions[nftId].isActive, "Auction not active");
        _;
    }

    modifier auctionEnded(string calldata nftId) {
        require(block.timestamp > auctions[nftId].endTime, "Auction not ended");
        _;
    }

    constructor() ZamaEthereumConfig() {}

    function createAuction(
        string calldata nftId,
        uint256 duration
    ) external {
        require(bytes(auctions[nftId].nftId).length == 0, "Auction already exists");
        auctions[nftId] = Auction({
            nftId: nftId,
            startTime: block.timestamp,
            endTime: block.timestamp + duration,
            highestBid: 0,
            highestBidder: address(0),
            isActive: true
        });
        auctionIds.push(nftId);
        emit AuctionCreated(nftId, block.timestamp, block.timestamp + duration);
    }

    function placeBid(
        string calldata nftId,
        externalEuint32 encryptedBid,
        bytes calldata inputProof
    ) external payable auctionActive(nftId) {
        Auction storage auction = auctions[nftId];
        require(block.timestamp < auction.endTime, "Bidding period ended");
        require(msg.value > 0, "Bid amount must be positive");
        require(FHE.isInitialized(FHE.fromExternal(encryptedBid, inputProof)), "Invalid encrypted bid");

        if (auction.bids[msg.sender].deposit > 0) {
            require(msg.value > auction.bids[msg.sender].deposit, "New bid must be higher than previous");
            payable(msg.sender).transfer(auction.bids[msg.sender].deposit);
        }

        auction.bids[msg.sender] = Bid({
            bidder: msg.sender,
            encryptedBid: FHE.fromExternal(encryptedBid, inputProof),
            deposit: msg.value,
            revealed: false
        });
        FHE.allowThis(auction.bids[msg.sender].encryptedBid);
        FHE.makePubliclyDecryptable(auction.bids[msg.sender].encryptedBid);

        if (!auction.bidders.contains(msg.sender)) {
            auction.bidders.push(msg.sender);
        }

        emit BidPlaced(nftId, msg.sender, auction.bids[msg.sender].encryptedBid);
    }

    function revealBid(
        string calldata nftId,
        uint32 decryptedBid,
        bytes memory decryptionProof
    ) external auctionEnded(nftId) {
        Auction storage auction = auctions[nftId];
        require(!auction.bids[msg.sender].revealed, "Bid already revealed");
        require(block.timestamp > auction.endTime, "Reveal period not started");

        bytes memory abiEncodedClearValue = abi.encode(decryptedBid);
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(auction.bids[msg.sender].encryptedBid);

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);

        auction.bids[msg.sender].revealed = true;

        if (decryptedBid > auction.highestBid) {
            auction.highestBid = decryptedBid;
            auction.highestBidder = msg.sender;
        }

        emit BidRevealed(nftId, msg.sender, decryptedBid);
    }

    function finalizeAuction(string calldata nftId) external auctionEnded(nftId) {
        Auction storage auction = auctions[nftId];
        require(auction.isActive, "Auction already finalized");
        require(block.timestamp > auction.endTime + 1 days, "Reveal period not ended");

        auction.isActive = false;

        if (auction.highestBidder != address(0)) {
            payable(auction.highestBidder).transfer(auction.bids[auction.highestBidder].deposit);
            emit AuctionFinalized(nftId, auction.highestBidder, auction.highestBid);
        }

        for (uint256 i = 0; i < auction.bidders.length; i++) {
            address bidder = auction.bidders[i];
            if (bidder != auction.highestBidder && auction.bids[bidder].deposit > 0) {
                payable(bidder).transfer(auction.bids[bidder].deposit);
                emit BidWithdrawn(nftId, bidder);
            }
        }
    }

    function withdrawBid(string calldata nftId) external {
        Auction storage auction = auctions[nftId];
        require(block.timestamp > auction.endTime + 1 days, "Withdrawal period not started");
        require(auction.bids[msg.sender].deposit > 0, "No deposit to withdraw");
        require(msg.sender != auction.highestBidder, "Highest bidder cannot withdraw");

        uint256 deposit = auction.bids[msg.sender].deposit;
        auction.bids[msg.sender].deposit = 0;
        payable(msg.sender).transfer(deposit);
        emit BidWithdrawn(nftId, msg.sender);
    }

    function getAuction(string calldata nftId) external view returns (
        string memory,
        uint256,
        uint256,
        uint256,
        address,
        bool
    ) {
        Auction storage auction = auctions[nftId];
        return (
            auction.nftId,
            auction.startTime,
            auction.endTime,
            auction.highestBid,
            auction.highestBidder,
            auction.isActive
        );
    }

    function getBid(string calldata nftId, address bidder) external view returns (
        address,
        euint32,
        uint256,
        bool
    ) {
        Auction storage auction = auctions[nftId];
        Bid storage bid = auction.bids[bidder];
        return (bid.bidder, bid.encryptedBid, bid.deposit, bid.revealed);
    }

    function getAllAuctionIds() external view returns (string[] memory) {
        return auctionIds;
    }

    function getBidders(string calldata nftId) external view returns (address[] memory) {
        return auctions[nftId].bidders;
    }
}

library ArrayUtils {
    function contains(address[] storage arr, address value) internal view returns (bool) {
        for (uint256 i = 0; i < arr.length; i++) {
            if (arr[i] == value) {
                return true;
            }
        }
        return false;
    }
}

