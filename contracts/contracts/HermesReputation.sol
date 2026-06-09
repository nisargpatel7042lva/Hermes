// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title HermesReputation
 * @notice Simplified ERC-8004 inspired on-chain identity and reputation registry
 *         for HERMES freelancer payment platform. Scores range 0–1000, starting at 500.
 */
contract HermesReputation {
    // ─── Structs ──────────────────────────────────────────────────────────────

    struct AgentIdentity {
        bytes32 id;
        address wallet;
        string name;
        string role;          // "freelancer" or "client"
        string metadataUri;
        uint256 reputationScore; // 0–1000
        uint256 totalJobs;
        uint256 completedJobs;
        uint256 registeredAt;
        bool isVerified;
    }

    struct ReputationEvent {
        uint256 jobId;
        uint256 milestoneId;
        bool wasPositive;
        uint256 timestamp;
        string notes;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    address public owner;
    address public escrowContract;

    mapping(bytes32 => AgentIdentity) private agents;
    mapping(address => bytes32) private walletToAgentId;
    mapping(bytes32 => ReputationEvent[]) private reputationHistory;

    // ─── Events ───────────────────────────────────────────────────────────────

    event AgentRegistered(
        bytes32 indexed agentId,
        address indexed wallet,
        string name,
        string role
    );

    event ReputationUpdated(
        bytes32 indexed agentId,
        uint256 indexed jobId,
        uint256 milestoneId,
        bool wasPositive,
        uint256 newScore
    );

    event EscrowContractSet(address indexed escrowContract);

    event AgentVerified(bytes32 indexed agentId, address indexed wallet);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "HermesReputation: only owner");
        _;
    }

    modifier onlyEscrow() {
        require(
            msg.sender == escrowContract,
            "HermesReputation: only escrow contract"
        );
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor() {
        owner = msg.sender;
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Wire up the escrow contract after it is deployed.
     *         Can only be called once.
     */
    function setEscrowContract(address _escrow) external onlyOwner {
        require(_escrow != address(0), "HermesReputation: invalid address");
        require(escrowContract == address(0), "HermesReputation: already set");
        escrowContract = _escrow;
        emit EscrowContractSet(_escrow);
    }

    /**
     * @notice Mark an agent as verified (e.g. KYC'd off-chain).
     */
    function verifyAgent(bytes32 agentId) external onlyOwner {
        require(
            agents[agentId].wallet != address(0),
            "HermesReputation: agent not found"
        );
        agents[agentId].isVerified = true;
        emit AgentVerified(agentId, agents[agentId].wallet);
    }

    // ─── Registration ─────────────────────────────────────────────────────────

    /**
     * @notice Register a new agent identity. Each wallet can only register once.
     * @param name       Display name
     * @param role       "freelancer" or "client"
     * @param metadataUri IPFS URI pointing to extended profile JSON
     * @return agentId   Unique bytes32 identifier
     */
    function registerAgent(
        string calldata name,
        string calldata role,
        string calldata metadataUri
    ) external returns (bytes32) {
        require(
            walletToAgentId[msg.sender] == bytes32(0),
            "HermesReputation: wallet already registered"
        );
        require(bytes(name).length > 0, "HermesReputation: name required");
        require(
            keccak256(bytes(role)) == keccak256(bytes("freelancer")) ||
                keccak256(bytes(role)) == keccak256(bytes("client")),
            "HermesReputation: role must be freelancer or client"
        );

        bytes32 agentId = keccak256(
            abi.encodePacked(msg.sender, block.timestamp, block.number, block.chainid)
        );

        // Extremely unlikely collision, but guard it
        require(
            agents[agentId].wallet == address(0),
            "HermesReputation: id collision, retry"
        );

        agents[agentId] = AgentIdentity({
            id: agentId,
            wallet: msg.sender,
            name: name,
            role: role,
            metadataUri: metadataUri,
            reputationScore: 500,
            totalJobs: 0,
            completedJobs: 0,
            registeredAt: block.timestamp,
            isVerified: false
        });

        walletToAgentId[msg.sender] = agentId;

        emit AgentRegistered(agentId, msg.sender, name, role);
        return agentId;
    }

    // ─── Reputation Updates (escrow only) ────────────────────────────────────

    /**
     * @notice Called by HermesEscrow when a milestone is released (positive)
     *         or rejected (negative).
     *         Positive: score += 10 (capped at 1000), completedJobs++
     *         Negative: score -= 20 (floored at 0)
     *         totalJobs always increments.
     */
    function updateReputation(
        bytes32 agentId,
        uint256 jobId,
        uint256 milestoneId,
        bool wasPositive,
        string calldata notes
    ) external onlyEscrow {
        AgentIdentity storage agent = agents[agentId];
        require(agent.wallet != address(0), "HermesReputation: agent not found");

        if (wasPositive) {
            uint256 next = agent.reputationScore + 10;
            agent.reputationScore = next > 1000 ? 1000 : next;
            agent.completedJobs += 1;
        } else {
            agent.reputationScore = agent.reputationScore >= 20
                ? agent.reputationScore - 20
                : 0;
        }
        agent.totalJobs += 1;

        reputationHistory[agentId].push(
            ReputationEvent({
                jobId: jobId,
                milestoneId: milestoneId,
                wasPositive: wasPositive,
                timestamp: block.timestamp,
                notes: notes
            })
        );

        emit ReputationUpdated(agentId, jobId, milestoneId, wasPositive, agent.reputationScore);
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    function getAgent(bytes32 agentId) external view returns (AgentIdentity memory) {
        require(agents[agentId].wallet != address(0), "HermesReputation: agent not found");
        return agents[agentId];
    }

    function getAgentByWallet(address wallet) external view returns (AgentIdentity memory) {
        bytes32 agentId = walletToAgentId[wallet];
        require(agentId != bytes32(0), "HermesReputation: wallet not registered");
        return agents[agentId];
    }

    function getReputationHistory(bytes32 agentId)
        external
        view
        returns (ReputationEvent[] memory)
    {
        return reputationHistory[agentId];
    }

    function isRegistered(address wallet) external view returns (bool) {
        return walletToAgentId[wallet] != bytes32(0);
    }

    function getAgentId(address wallet) external view returns (bytes32) {
        return walletToAgentId[wallet];
    }
}
