// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IHermesReputation {
    function updateReputation(
        bytes32 agentId,
        uint256 jobId,
        uint256 milestoneId,
        bool wasPositive,
        string calldata notes
    ) external;
}

/**
 * @title HermesEscrow
 * @notice Core escrow and milestone payment contract for HERMES.
 *         Client deposits USDC up-front; a trusted AI verifier releases
 *         or rejects each milestone after evaluating the deliverable.
 *
 *         USDC Fuji testnet: 0x5425890298aed601595a70AB815c96711a31Bc65
 */
contract HermesEscrow is ReentrancyGuard {
    // ─── Enums ────────────────────────────────────────────────────────────────

    enum JobStatus {
        Open,
        Active,
        Completed,
        Disputed,
        Cancelled
    }

    enum MilestoneStatus {
        Pending,
        Submitted,
        Verified,
        Released,
        Rejected
    }

    // ─── Structs ──────────────────────────────────────────────────────────────

    struct Milestone {
        string description;
        uint256 amount;          // USDC with 6 decimals
        MilestoneStatus status;
        string deliverableUrl;
        uint256 submittedAt;
        uint256 releasedAt;
    }

    /**
     * @dev Job contains a mapping so it must remain in storage only.
     *      Getter functions return individual fields rather than the whole struct.
     */
    struct Job {
        uint256 id;
        address client;
        address freelancer;
        string title;
        string description;
        uint256 totalAmount;
        uint256 releasedAmount;  // cumulative USDC paid to freelancer
        JobStatus status;
        uint256 createdAt;
        uint256 milestoneCount;
        mapping(uint256 => Milestone) milestones;
        bytes32 erc8004FreelancerId;
        bytes32 erc8004ClientId;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    IERC20 public immutable usdc;
    IHermesReputation public immutable reputation;
    address public verifier;

    uint256 public jobCounter;
    mapping(uint256 => Job) private jobs;
    mapping(address => uint256[]) private clientJobs;
    mapping(address => uint256[]) private freelancerJobs;

    // ─── Events ───────────────────────────────────────────────────────────────

    event JobCreated(
        uint256 indexed jobId,
        address indexed client,
        address indexed freelancer,
        string title,
        uint256 totalAmount,
        bytes32 freelancerERC8004Id,
        bytes32 clientERC8004Id
    );

    event MilestoneSubmitted(
        uint256 indexed jobId,
        uint256 indexed milestoneId,
        address indexed freelancer,
        string deliverableUrl,
        uint256 submittedAt
    );

    event MilestoneReleased(
        uint256 indexed jobId,
        uint256 indexed milestoneId,
        address indexed freelancer,
        uint256 amount
    );

    event MilestoneRejected(
        uint256 indexed jobId,
        uint256 indexed milestoneId,
        address indexed freelancer
    );

    event JobCompleted(uint256 indexed jobId, address indexed client, address indexed freelancer);

    event JobCancelled(uint256 indexed jobId, address indexed client);

    event ClientRefunded(
        uint256 indexed jobId,
        address indexed client,
        uint256 amount
    );

    event VerifierUpdated(address indexed oldVerifier, address indexed newVerifier);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyVerifier() {
        require(msg.sender == verifier, "HermesEscrow: caller is not the verifier");
        _;
    }

    modifier jobExists(uint256 jobId) {
        require(jobs[jobId].client != address(0), "HermesEscrow: job does not exist");
        _;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    /**
     * @param _usdc       USDC token address (Fuji: 0x5425890298aed601595a70AB815c96711a31Bc65)
     * @param _reputation HermesReputation contract address
     * @param _verifier   Trusted AI agent wallet that approves/rejects milestones
     */
    constructor(
        address _usdc,
        address _reputation,
        address _verifier
    ) {
        require(_usdc != address(0), "HermesEscrow: invalid USDC address");
        require(_reputation != address(0), "HermesEscrow: invalid reputation address");
        require(_verifier != address(0), "HermesEscrow: invalid verifier address");
        usdc = IERC20(_usdc);
        reputation = IHermesReputation(_reputation);
        verifier = _verifier;
    }

    // ─── Core Functions ───────────────────────────────────────────────────────

    /**
     * @notice Create a new escrow job. Client must have approved USDC beforehand.
     * @param freelancer              Freelancer wallet address
     * @param title                   Short job title
     * @param description             Detailed job description
     * @param milestoneDescriptions   Array of milestone descriptions
     * @param milestoneAmounts        Array of USDC amounts (6 decimals) per milestone
     * @param freelancerERC8004Id     Freelancer's HermesReputation bytes32 id (0 if unregistered)
     * @param clientERC8004Id         Client's HermesReputation bytes32 id (0 if unregistered)
     * @return jobId                  Unique job identifier
     */
    function createJob(
        address freelancer,
        string calldata title,
        string calldata description,
        string[] calldata milestoneDescriptions,
        uint256[] calldata milestoneAmounts,
        bytes32 freelancerERC8004Id,
        bytes32 clientERC8004Id
    ) external nonReentrant returns (uint256) {
        require(freelancer != address(0), "HermesEscrow: invalid freelancer address");
        require(freelancer != msg.sender, "HermesEscrow: client cannot be freelancer");
        require(bytes(title).length > 0, "HermesEscrow: title required");
        require(milestoneDescriptions.length > 0, "HermesEscrow: at least one milestone required");
        require(
            milestoneDescriptions.length == milestoneAmounts.length,
            "HermesEscrow: milestone arrays length mismatch"
        );
        require(milestoneDescriptions.length <= 20, "HermesEscrow: too many milestones");

        uint256 total = 0;
        for (uint256 i = 0; i < milestoneAmounts.length; i++) {
            require(milestoneAmounts[i] > 0, "HermesEscrow: milestone amount must be > 0");
            total += milestoneAmounts[i];
        }

        // Pull USDC from client into escrow
        require(
            usdc.transferFrom(msg.sender, address(this), total),
            "HermesEscrow: USDC transfer failed - check approval"
        );

        uint256 jobId = ++jobCounter;
        Job storage job = jobs[jobId];
        job.id = jobId;
        job.client = msg.sender;
        job.freelancer = freelancer;
        job.title = title;
        job.description = description;
        job.totalAmount = total;
        job.releasedAmount = 0;
        job.status = JobStatus.Active;
        job.createdAt = block.timestamp;
        job.milestoneCount = milestoneDescriptions.length;
        job.erc8004FreelancerId = freelancerERC8004Id;
        job.erc8004ClientId = clientERC8004Id;

        for (uint256 i = 0; i < milestoneDescriptions.length; i++) {
            job.milestones[i] = Milestone({
                description: milestoneDescriptions[i],
                amount: milestoneAmounts[i],
                status: MilestoneStatus.Pending,
                deliverableUrl: "",
                submittedAt: 0,
                releasedAt: 0
            });
        }

        clientJobs[msg.sender].push(jobId);
        freelancerJobs[freelancer].push(jobId);

        emit JobCreated(
            jobId,
            msg.sender,
            freelancer,
            title,
            total,
            freelancerERC8004Id,
            clientERC8004Id
        );

        return jobId;
    }

    /**
     * @notice Freelancer submits a deliverable URL for a specific milestone.
     *         Milestone must be Pending (or Pending after a prior rejection).
     */
    function submitMilestone(
        uint256 jobId,
        uint256 milestoneId,
        string calldata deliverableUrl
    ) external jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(msg.sender == job.freelancer, "HermesEscrow: only the freelancer");
        require(job.status == JobStatus.Active, "HermesEscrow: job is not active");
        require(milestoneId < job.milestoneCount, "HermesEscrow: milestone index out of range");
        require(bytes(deliverableUrl).length > 0, "HermesEscrow: deliverable URL required");

        Milestone storage milestone = job.milestones[milestoneId];
        require(
            milestone.status == MilestoneStatus.Pending,
            "HermesEscrow: milestone must be in Pending status to submit"
        );

        milestone.status = MilestoneStatus.Submitted;
        milestone.deliverableUrl = deliverableUrl;
        milestone.submittedAt = block.timestamp;

        emit MilestoneSubmitted(jobId, milestoneId, msg.sender, deliverableUrl, block.timestamp);
    }

    /**
     * @notice Verifier (AI agent) releases payment after milestone passes verification.
     *         Transfers USDC to freelancer. Marks job Completed when all milestones released.
     */
    function releaseMilestone(
        uint256 jobId,
        uint256 milestoneId
    ) external nonReentrant onlyVerifier jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Active, "HermesEscrow: job is not active");
        require(milestoneId < job.milestoneCount, "HermesEscrow: milestone index out of range");

        Milestone storage milestone = job.milestones[milestoneId];
        require(
            milestone.status == MilestoneStatus.Submitted,
            "HermesEscrow: milestone must be Submitted before release"
        );

        uint256 amount = milestone.amount;
        address freelancer = job.freelancer;

        milestone.status = MilestoneStatus.Released;
        milestone.releasedAt = block.timestamp;
        job.releasedAmount += amount;

        require(usdc.transfer(freelancer, amount), "HermesEscrow: USDC payout failed");

        emit MilestoneReleased(jobId, milestoneId, freelancer, amount);

        // Update freelancer reputation - silently skip if reputation call fails
        if (job.erc8004FreelancerId != bytes32(0)) {
            try reputation.updateReputation(
                job.erc8004FreelancerId,
                jobId,
                milestoneId,
                true,
                "Milestone verified and payment released by HERMES agent"
            ) {} catch {}
        }

        // Check if every milestone has been released
        bool allDone = true;
        for (uint256 i = 0; i < job.milestoneCount; i++) {
            if (job.milestones[i].status != MilestoneStatus.Released) {
                allDone = false;
                break;
            }
        }
        if (allDone) {
            job.status = JobStatus.Completed;
            emit JobCompleted(jobId, job.client, freelancer);
        }
    }

    /**
     * @notice Verifier (AI agent) rejects a milestone, resetting it to Pending
     *         so the freelancer can revise and resubmit.
     */
    function rejectMilestone(
        uint256 jobId,
        uint256 milestoneId
    ) external onlyVerifier jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(job.status == JobStatus.Active, "HermesEscrow: job is not active");
        require(milestoneId < job.milestoneCount, "HermesEscrow: milestone index out of range");

        Milestone storage milestone = job.milestones[milestoneId];
        require(
            milestone.status == MilestoneStatus.Submitted,
            "HermesEscrow: milestone must be Submitted to reject"
        );

        // Reset to Pending so freelancer can revise and resubmit
        milestone.status = MilestoneStatus.Pending;

        emit MilestoneRejected(jobId, milestoneId, job.freelancer);

        // Negative reputation event - silently skip on failure
        if (job.erc8004FreelancerId != bytes32(0)) {
            try reputation.updateReputation(
                job.erc8004FreelancerId,
                jobId,
                milestoneId,
                false,
                "Milestone rejected by HERMES agent - resubmission required"
            ) {} catch {}
        }
    }

    /**
     * @notice Client cancels the job. Only allowed when no milestones are
     *         in Submitted or Released state (nothing in-flight or paid).
     */
    function cancelJob(uint256 jobId) external jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client, "HermesEscrow: only the client");
        require(
            job.status == JobStatus.Active || job.status == JobStatus.Open,
            "HermesEscrow: job cannot be cancelled in its current state"
        );

        for (uint256 i = 0; i < job.milestoneCount; i++) {
            require(
                job.milestones[i].status != MilestoneStatus.Submitted &&
                job.milestones[i].status != MilestoneStatus.Released,
                "HermesEscrow: cannot cancel while a milestone is submitted or released"
            );
        }

        job.status = JobStatus.Cancelled;
        emit JobCancelled(jobId, msg.sender);
    }

    /**
     * @notice Client reclaims remaining locked USDC after job is cancelled.
     *         Only the unreleased portion is returned.
     */
    function refundClient(uint256 jobId) external nonReentrant jobExists(jobId) {
        Job storage job = jobs[jobId];
        require(msg.sender == job.client, "HermesEscrow: only the client");
        require(job.status == JobStatus.Cancelled, "HermesEscrow: job must be cancelled first");

        uint256 refundAmount = job.totalAmount - job.releasedAmount;
        require(refundAmount > 0, "HermesEscrow: nothing to refund");

        // Mark fully settled before transfer to prevent re-entrancy
        job.releasedAmount = job.totalAmount;

        require(usdc.transfer(job.client, refundAmount), "HermesEscrow: USDC refund failed");

        emit ClientRefunded(jobId, job.client, refundAmount);
    }

    // ─── Admin ────────────────────────────────────────────────────────────────

    /**
     * @notice Transfer the verifier role to a new address (e.g. rotated agent wallet).
     */
    function updateVerifier(address newVerifier) external onlyVerifier {
        require(newVerifier != address(0), "HermesEscrow: invalid verifier address");
        emit VerifierUpdated(verifier, newVerifier);
        verifier = newVerifier;
    }

    // ─── Views ────────────────────────────────────────────────────────────────

    /**
     * @notice Returns all scalar fields of a job (excludes the milestones mapping).
     */
    function getJob(uint256 jobId)
        external
        view
        jobExists(jobId)
        returns (
            uint256 id,
            address client,
            address freelancer,
            string memory title,
            string memory description,
            uint256 totalAmount,
            uint256 releasedAmount,
            JobStatus status,
            uint256 createdAt,
            uint256 milestoneCount,
            bytes32 erc8004FreelancerId,
            bytes32 erc8004ClientId
        )
    {
        Job storage job = jobs[jobId];
        return (
            job.id,
            job.client,
            job.freelancer,
            job.title,
            job.description,
            job.totalAmount,
            job.releasedAmount,
            job.status,
            job.createdAt,
            job.milestoneCount,
            job.erc8004FreelancerId,
            job.erc8004ClientId
        );
    }

    /**
     * @notice Returns all fields for a specific milestone within a job.
     */
    function getMilestone(uint256 jobId, uint256 milestoneId)
        external
        view
        jobExists(jobId)
        returns (
            string memory description,
            uint256 amount,
            MilestoneStatus status,
            string memory deliverableUrl,
            uint256 submittedAt,
            uint256 releasedAt
        )
    {
        require(
            milestoneId < jobs[jobId].milestoneCount,
            "HermesEscrow: milestone index out of range"
        );
        Milestone storage m = jobs[jobId].milestones[milestoneId];
        return (m.description, m.amount, m.status, m.deliverableUrl, m.submittedAt, m.releasedAt);
    }

    /**
     * @notice Returns all job IDs created by a client address.
     */
    function getJobsByClient(address client) external view returns (uint256[] memory) {
        return clientJobs[client];
    }

    /**
     * @notice Returns all job IDs assigned to a freelancer address.
     */
    function getJobsByFreelancer(address freelancer) external view returns (uint256[] memory) {
        return freelancerJobs[freelancer];
    }

    /**
     * @notice Convenience view: how much USDC is currently held in escrow
     *         for a given job (totalAmount minus what has already been paid out).
     */
    function lockedAmount(uint256 jobId) external view jobExists(jobId) returns (uint256) {
        Job storage job = jobs[jobId];
        return job.totalAmount - job.releasedAmount;
    }
}
