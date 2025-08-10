Universal Single-to-Multiplayer Game Upgrades
## Core Constraint

Every game is a single HTML file, making them easy to store and embed in iframes for a consistent runtime environment. Our games might be generated as separate modules/files down the road, but they would still be stored/served as a single file.

## Tech Stack

- Frontend: Vite, React 19, and most TanStack libraries (router, query, store, etc)
- Backend: infrastructure configured in Typescript with the AWS CDK and Amplify; using S3, Lambda functions, AppSync + DynamoDB (realtime db), and cognito (auth)
- AI Framework: Langfuse for tracing + prompt management, Vercel’s AI SDK for LLM clients + agentic primitives (we recommend you use these as well)


## Problem Statement

DreamUp games are limited to singleplayer; we challenge you to build a system that can transform these games into a multiplayer experience. Along with the rewritten game HTML, it should generate and deploy server-side code in an isolated environment; your focus should be making this netcode reliable and resistant to jailbreaking.

There may not be a one-to-one correspondence between singleplayer and multiplayer game mechanics. 


## Business Context

Multiplayer is fundamental to how children naturally play and create games together, and its absence is a critical gap in fulfilling our vision.

Key Impact Metrics:
- Increase in user retention (kids returning to play their games with friends)
- Growth in viral user acquisition (kids inviting friends to play their creations)
- Enhanced psychological ownership through collaborative creation

Potential ROI: Multiplayer capability reinforces DreamUp's SPOV that user-created games drive more genuine engagement than AAA titles. It enables kids to share their creative expressions socially, creating network effects that amplify the platform's collaborative potential.
## Technical Requirements

### Required Tech Stack:

Languages: Client-side library in JavaScript (w/ JSDoc types) and Typescript. 

Infrastructure: Deployable solution on AWS. CDK, Dynamo DB, 

Core Deliverables:
- AI agent that intelligently rewrites game code for multiplayer
- A button that reads "make it multiplayer" and converts the single player to multiplayer 
- Single-file, dependency-free JavaScript library (loadable via <script> tag)
- Server implementation for game state synchronization
- Support for post-creation conversion to multiplayer. 
- Turn-based game. 
- A simple interface for the HTML games to send/receive network events while being decoupled from the multiplayer code.
- event system with four types that our game code emits to the iframe’s parent document

Technical Constraints:
- Should work with DreamUp's existing iframe-based game architecture
- Must handle the variety and unpredictability of AI-generated game code
- Must work for turn-based (discrete) and realtime (continuous) games

## Project Context & Environment
- Implementation Type: Greenfield project in isolated environment

### Event System
The structures we build atop LLMs must be lightweight, yet generalizable. This is especially true of the event system with four types that our game code emits to the iframe’s parent document:

- TRANSITION - between levels or game states
- INTERACTION - actor does action (ie. player, enemy, physical object)
- UPDATE - passive system update (ie. timer, score, achievements)
- ERROR - something went wrong
each with standard metadata attributes we’ll add to over time

The DreamUp SPA listens for these events and sends batches to our backend with additional metadata: { createdAt, sessionId, gameId }. We’d like you to develop a lightweight, client-side JavaScript library (w/ JSDoc) provides a simple interface for the HTML games to send/receive network events while being decoupled from the multiplayer code. 

## Success Criteria

Functional Requirements:
- 95% success rate adding multiplayer to browser games from any genre (20,000 tokens)
- Automatically deployed server-side game code in an isolated environment
- Client-side networking code is abstracted into a JavaScript library w/ simple interface

Performance Requirements:
- Support minimum 10 concurrent players
- Conversion process completes within reasonable time (<2 minute agent invocation)
- Resulting games have smooth a multiplayer experience


## Additional Context

Remember that DreamUp users are primarily kids who are natural game creators. Your solution should enhance their creative expression, not constrain it. The best solution will feel magical - kids should be able to say "make it multiplayer" and have it just work, opening up new possibilities for playing and creating with friends.

