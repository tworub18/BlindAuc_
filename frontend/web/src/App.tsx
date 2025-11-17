import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';

interface AuctionItem {
  id: string;
  name: string;
  encryptedBid: string;
  publicValue1: number;
  publicValue2: number;
  description: string;
  creator: string;
  timestamp: number;
  isVerified: boolean;
  decryptedValue: number;
}

interface BidHistory {
  id: string;
  bidder: string;
  timestamp: number;
  amount: number;
  status: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [auctions, setAuctions] = useState<AuctionItem[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingAuction, setCreatingAuction] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState({ 
    visible: false, 
    status: "pending", 
    message: "" 
  });
  const [newAuctionData, setNewAuctionData] = useState({ 
    name: "", 
    bidAmount: "", 
    description: "" 
  });
  const [selectedAuction, setSelectedAuction] = useState<AuctionItem | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [bidHistory, setBidHistory] = useState<BidHistory[]>([]);
  const [stats, setStats] = useState({
    totalAuctions: 0,
    activeAuctions: 0,
    totalBidVolume: 0,
    avgBidAmount: 0
  });

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting } = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized || fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        await initialize();
      } catch (error) {
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed" 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const auctionsList: AuctionItem[] = [];
      let totalVolume = 0;
      let bidCount = 0;
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          const bidAmount = Number(businessData.publicValue1) || 0;
          totalVolume += bidAmount;
          bidCount++;
          
          auctionsList.push({
            id: businessId,
            name: businessData.name,
            encryptedBid: businessId,
            publicValue1: bidAmount,
            publicValue2: Number(businessData.publicValue2) || 0,
            description: businessData.description,
            creator: businessData.creator,
            timestamp: Number(businessData.timestamp),
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });

          setBidHistory(prev => [...prev, {
            id: businessId,
            bidder: businessData.creator,
            timestamp: Number(businessData.timestamp),
            amount: bidAmount,
            status: businessData.isVerified ? "Verified" : "Pending"
          }]);
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setAuctions(auctionsList);
      setStats({
        totalAuctions: auctionsList.length,
        activeAuctions: auctionsList.filter(a => !a.isVerified).length,
        totalBidVolume: totalVolume,
        avgBidAmount: bidCount > 0 ? totalVolume / bidCount : 0
      });
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createAuction = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingAuction(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating blind auction with FHE encryption..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const bidValue = parseInt(newAuctionData.bidAmount) || 0;
      const businessId = `auction-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, bidValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newAuctionData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        bidValue,
        0,
        newAuctionData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Encrypting bid and submitting..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Blind bid placed successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewAuctionData({ name: "", bidAmount: "", description: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingAuction(false); 
    }
  };

  const decryptBid = async (businessId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(businessId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        setTransactionStatus({ visible: true, status: "success", message: "Bid already verified on-chain" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(businessId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(businessId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying decryption..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Bid decrypted and verified!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ visible: true, status: "success", message: "Bid already verified" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
        await loadData();
        return null;
      }
      
      setTransactionStatus({ visible: true, status: "error", message: "Decryption failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const available = await contract.isAvailable();
      setTransactionStatus({ 
        visible: true, 
        status: "success", 
        message: `Contract is ${available ? "available" : "unavailable"}` 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderStats = () => {
    return (
      <div className="stats-grid">
        <div className="stat-card neon-purple">
          <div className="stat-icon">🛍️</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalAuctions}</div>
            <div className="stat-label">Total Auctions</div>
          </div>
        </div>
        
        <div className="stat-card neon-blue">
          <div className="stat-icon">⚡</div>
          <div className="stat-content">
            <div className="stat-value">{stats.activeAuctions}</div>
            <div className="stat-label">Active Bids</div>
          </div>
        </div>
        
        <div className="stat-card neon-pink">
          <div className="stat-icon">💰</div>
          <div className="stat-content">
            <div className="stat-value">{stats.totalBidVolume}</div>
            <div className="stat-label">Total Volume</div>
          </div>
        </div>
        
        <div className="stat-card neon-green">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <div className="stat-value">{stats.avgBidAmount.toFixed(1)}</div>
            <div className="stat-label">Avg Bid</div>
          </div>
        </div>
      </div>
    );
  };

  const renderBidChart = () => {
    const bidData = auctions.map(auction => auction.publicValue1);
    const maxBid = Math.max(...bidData, 1);
    
    return (
      <div className="bid-chart">
        <h3>Bid Distribution</h3>
        <div className="chart-bars">
          {bidData.map((bid, index) => (
            <div key={index} className="chart-bar-container">
              <div 
                className="chart-bar neon-gradient"
                style={{ height: `${(bid / maxBid) * 100}%` }}
              >
                <span className="bar-value">{bid}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderFHEProcess = () => {
    return (
      <div className="fhe-process">
        <div className="process-step">
          <div className="step-number neon-glow">1</div>
          <div className="step-content">
            <h4>Encrypt Bid</h4>
            <p>Bid amount encrypted with FHE before submission</p>
          </div>
        </div>
        <div className="process-arrow">➤</div>
        <div className="process-step">
          <div className="step-number neon-glow">2</div>
          <div className="step-content">
            <h4>Blind Storage</h4>
            <p>Encrypted bid stored on-chain, hidden from all</p>
          </div>
        </div>
        <div className="process-arrow">➤</div>
        <div className="process-step">
          <div className="step-number neon-glow">3</div>
          <div className="step-content">
            <h4>Homomorphic Computation</h4>
            <p>FHE computes highest bid without decryption</p>
          </div>
        </div>
        <div className="process-arrow">➤</div>
        <div className="process-step">
          <div className="step-number neon-glow">4</div>
          <div className="step-content">
            <h4>Secure Reveal</h4>
            <p>Winner revealed with zero-knowledge proof</p>
          </div>
        </div>
      </div>
    );
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1 className="neon-text">FHE Blind Auction 🔒</h1>
          </div>
          <div className="header-actions">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="neon-icon">🔒</div>
            <h2>Connect to Enter Blind Auction</h2>
            <p>Private bidding with fully homomorphic encryption</p>
            <div className="connection-steps">
              <div className="step">
                <span className="neon-badge">1</span>
                <p>Connect wallet to initialize FHE system</p>
              </div>
              <div className="step">
                <span className="neon-badge">2</span>
                <p>Submit encrypted bids that remain hidden</p>
              </div>
              <div className="step">
                <span className="neon-badge">3</span>
                <p>Reveal winners with cryptographic proofs</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="neon-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p className="neon-pulse">Securing your bids with homomorphic encryption</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="neon-spinner"></div>
      <p>Loading blind auction platform...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1 className="neon-text">FHE Blind Auction 🔒</h1>
          <p>Bid in complete privacy with FHE encryption</p>
        </div>
        
        <div className="header-actions">
          <button className="neon-btn" onClick={checkAvailability}>
            Check Contract
          </button>
          <button 
            className="neon-btn primary" 
            onClick={() => setShowCreateModal(true)}
          >
            + Place Blind Bid
          </button>
          <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
        </div>
      </header>
      
      <div className="main-content">
        <div className="stats-section">
          {renderStats()}
        </div>
        
        <div className="content-panels">
          <div className="panel left-panel">
            <div className="panel-header">
              <h2>🔒 Active Blind Auctions</h2>
              <button 
                onClick={loadData} 
                className="neon-btn small"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            
            <div className="auctions-list">
              {auctions.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-icon">🔒</div>
                  <p>No blind auctions yet</p>
                  <button 
                    className="neon-btn"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Auction
                  </button>
                </div>
              ) : (
                auctions.map((auction) => (
                  <div 
                    key={auction.id}
                    className={`auction-item ${selectedAuction?.id === auction.id ? 'selected' : ''}`}
                    onClick={() => setSelectedAuction(auction)}
                  >
                    <div className="auction-header">
                      <h3>{auction.name}</h3>
                      <span className={`status ${auction.isVerified ? 'verified' : 'encrypted'}`}>
                        {auction.isVerified ? '✅ Verified' : '🔒 Encrypted'}
                      </span>
                    </div>
                    <p>{auction.description}</p>
                    <div className="auction-meta">
                      <span>Bidder: {auction.creator.substring(0, 8)}...</span>
                      <span>Time: {new Date(auction.timestamp * 1000).toLocaleString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div className="panel right-panel">
            <div className="panel-header">
              <h2>📊 Auction Analytics</h2>
            </div>
            
            {renderBidChart()}
            
            <div className="fhe-info">
              <h3>FHE Encryption Flow</h3>
              {renderFHEProcess()}
            </div>
            
            <div className="bid-history">
              <h3>Bid History</h3>
              <div className="history-list">
                {bidHistory.slice(0, 5).map((bid, index) => (
                  <div key={index} className="history-item">
                    <div className="bid-info">
                      <span className="bidder">{bid.bidder.substring(0, 6)}...{bid.bidder.substring(38)}</span>
                      <span className="amount">{bid.amount}</span>
                    </div>
                    <div className="bid-meta">
                      <span className="time">{new Date(bid.timestamp * 1000).toLocaleTimeString()}</span>
                      <span className={`status ${bid.status.toLowerCase()}`}>{bid.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <CreateAuctionModal 
          onSubmit={createAuction}
          onClose={() => setShowCreateModal(false)}
          creating={creatingAuction}
          auctionData={newAuctionData}
          setAuctionData={setNewAuctionData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedAuction && (
        <AuctionDetailModal 
          auction={selectedAuction}
          onClose={() => setSelectedAuction(null)}
          isDecrypting={isDecrypting || fheIsDecrypting}
          decryptBid={() => decryptBid(selectedAuction.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-toast">
          <div className={`toast-content ${transactionStatus.status}`}>
            <div className="toast-icon">
              {transactionStatus.status === "pending" && <div className="neon-spinner small"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="toast-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const CreateAuctionModal: React.FC<{
  onSubmit: () => void;
  onClose: () => void;
  creating: boolean;
  auctionData: any;
  setAuctionData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, auctionData, setAuctionData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'bidAmount') {
      const intValue = value.replace(/[^\d]/g, '');
      setAuctionData({ ...auctionData, [name]: intValue });
    } else {
      setAuctionData({ ...auctionData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Place Blind Bid 🔒</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice neon-border">
            <strong>FHE Encrypted Bidding</strong>
            <p>Your bid amount will be encrypted with FHE and remain hidden until reveal phase</p>
          </div>
          
          <div className="form-group">
            <label>Auction Item *</label>
            <input 
              type="text" 
              name="name" 
              value={auctionData.name} 
              onChange={handleChange} 
              placeholder="Enter item name..." 
              className="neon-input"
            />
          </div>
          
          <div className="form-group">
            <label>Bid Amount (ETH) *</label>
            <input 
              type="number" 
              name="bidAmount" 
              value={auctionData.bidAmount} 
              onChange={handleChange} 
              placeholder="Enter bid amount..." 
              min="0"
              step="0.001"
              className="neon-input"
            />
            <div className="input-hint">FHE Encrypted Integer</div>
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <textarea 
              name="description" 
              value={auctionData.description} 
              onChange={handleChange} 
              placeholder="Enter auction description..." 
              className="neon-input"
              rows={3}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="neon-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !auctionData.name || !auctionData.bidAmount}
            className="neon-btn primary"
          >
            {creating || isEncrypting ? "Encrypting Bid..." : "Place Blind Bid"}
          </button>
        </div>
      </div>
    </div>
  );
};

const AuctionDetailModal: React.FC<{
  auction: any;
  onClose: () => void;
  isDecrypting: boolean;
  decryptBid: () => Promise<number | null>;
}> = ({ auction, onClose, isDecrypting, decryptBid }) => {
  const [localDecrypted, setLocalDecrypted] = useState<number | null>(null);

  const handleDecrypt = async () => {
    const result = await decryptBid();
    setLocalDecrypted(result);
  };

  return (
    <div className="modal-overlay">
      <div className="detail-modal">
        <div className="modal-header">
          <h2>Auction Details</h2>
          <button onClick={onClose} className="close-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="auction-info">
            <div className="info-row">
              <span>Item:</span>
              <strong>{auction.name}</strong>
            </div>
            <div className="info-row">
              <span>Creator:</span>
              <strong>{auction.creator}</strong>
            </div>
            <div className="info-row">
              <span>Created:</span>
              <strong>{new Date(auction.timestamp * 1000).toLocaleString()}</strong>
            </div>
            <div className="info-row">
              <span>Status:</span>
              <strong className={auction.isVerified ? 'verified' : 'encrypted'}>
                {auction.isVerified ? 'Verified' : 'Encrypted'}
              </strong>
            </div>
          </div>
          
          <div className="bid-section">
            <h3>Blind Bid Information</h3>
            <div className="bid-data">
              <div className="data-item">
                <span>Encrypted Bid:</span>
                <span className="encrypted-value">🔒 FHE Encrypted</span>
              </div>
              <div className="data-item">
                <span>Decrypted Value:</span>
                <span className="decrypted-value">
                  {auction.isVerified ? auction.decryptedValue : 
                   localDecrypted !== null ? localDecrypted : 'Hidden'}
                </span>
              </div>
            </div>
            
            <button 
              className={`decrypt-btn ${auction.isVerified || localDecrypted !== null ? 'decrypted' : ''}`}
              onClick={handleDecrypt}
              disabled={isDecrypting}
            >
              {isDecrypting ? "Decrypting..." : 
               auction.isVerified ? "✅ Verified" : 
               localDecrypted !== null ? "🔓 Decrypted" : "🔒 Decrypt Bid"}
            </button>
          </div>
          
          <div className="fhe-explanation">
            <h4>FHE Blind Auction Process</h4>
            <p>Your bid is encrypted using Fully Homomorphic Encryption (FHE) and can be computed on without decryption. The highest bid is determined homomorphically, ensuring complete privacy until the reveal phase.</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="neon-btn">Close</button>
          {!auction.isVerified && (
            <button 
              onClick={handleDecrypt}
              disabled={isDecrypting}
              className="neon-btn primary"
            >
              {isDecrypting ? "Verifying..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;

