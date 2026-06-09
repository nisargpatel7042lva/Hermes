# ⚡ HERMES — Autonomous Milestone Payment Agent

> *"I am Hermes, messenger of the gods and patron of commerce."*

HERMES is a Web3 autonomous agent that manages milestone-based payments for freelancers on **Avalanche Fuji** testnet. Smart contracts hold USDC in escrow; an AI agent (Gemini) evaluates submitted work and automatically releases payment when milestones are verified.

---

## Architecture

```
hermes/
├── contracts/   Solidity escrow contracts (Hardhat + Avalanche Fuji)
├── frontend/    React + Vite + Tailwind + shadcn/ui (Greek/Colosseum theme)
└── agent/       Node.js + TypeScript autonomous payment agent (Gemini AI)
```

## Quick Start

### 1. Environment

```bash
cp .env.example .env
# Fill in PRIVATE_KEY and GEMINI_API_KEY
```

### 2. Contracts

```bash
cd contracts
npm install
npm run compile
npm run deploy   # deploys to Avalanche Fuji
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev      # http://localhost:5173
```

### 4. Agent

```bash
cd agent
npm install
npm run dev      # starts autonomous agent
```

---

## Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Chain     | Avalanche Fuji C-Chain (chainId 43113)  |
| Token     | USDC (Fuji testnet)                     |
| Contracts | Solidity 0.8.24 · Hardhat · OpenZeppelin|
| Frontend  | React 18 · Vite · Tailwind · shadcn/ui  |
| Agent     | Node.js · TypeScript · Gemini AI        |

---

## Theme

Ancient Greek / Colosseum — dark obsidian backgrounds, antique gold (#D4AF37) accents, marble textures, Cinzel serif typography.
