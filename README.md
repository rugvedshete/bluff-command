# Bluff & Command

A real-time multiplayer bluffing trivia game about cars, aviation, naval, space and military knowledge. Players invent believable fake answers, try to spot the real one, and spend earned energy on tactical abilities to outmanoeuvre each other.

- **2–8 players** per room, joined with a 4-letter room code
- **5 rounds**, highest score wins
- Runs in the browser on desktop and mobile

## How to play

1. One player creates a room and shares the code. Others join with the code.
2. The host starts the game once at least 2 players are in.
3. Each round has four phases:
   1. **Bluff (30s)**: you see a question. Write a convincing fake answer.
   2. **Vote (20s)**: the real answer and everyone's bluffs are shuffled together. Pick the one you think is true (you can't vote for your own bluff).
   3. **Reveal (8s)**: see the real answer, who wrote each bluff, and who voted for what.
   4. **Command (15s)**: spend energy on one ability, or pass. (Skipped after the last round.)
4. After round 5, the results screen shows the winner and awards. The host can start a new game.

A phase ends early as soon as every connected player has acted.

### Scoring

| Event | Score | Energy |
|---|---|---|
| Vote for the real answer | +100 | +20 |
| Each player who votes for your bluff | +50 | +10 |
| First correct vote of the round | +25 bonus | none |

### Abilities (one per Command phase)

| Ability | Cost | Effect |
|---|---|---|
| Shield | 50 | Blocks the next sabotage against you (used up when it blocks) |
| Recon | 40 | Reveals every player's energy until the next Command phase |
| Sabotage | 75 | Steals up to 50 points from a chosen player |
| EMP | 100 | Jams every other player's ability this round; their energy is refunded |

Abilities resolve in this order: EMP, Shield, Recon, Sabotage.

### Awards

Winner (top score), Greatest Deceiver (most players fooled), Sharpest Mind (most correct answers), Fastest Thinker (most fastest-correct bonuses), Top Saboteur (most successful sabotages).

## Tech stack

- **Client:** Next.js 15, React 19, TypeScript
- **Server:** Node.js, Express, Socket.IO, TypeScript (run with `tsx`)
- **State:** in server memory. The server is authoritative, so clients never send scores, only actions (bluff, vote, ability).

## Project structure

```
bluff-command/
├── package.json            # root scripts (install: all, dev)
├── client/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx        # the whole game UI (all phases)
│   │   └── globals.css
│   ├── .env.local          # NEXT_PUBLIC_SOCKET_URL
│   └── package.json
└── server/
    ├── src/
    │   ├── index.ts        # rooms, phase machine, scoring, abilities
    │   └── questions.json  # question bank
    └── package.json
```

## Run locally

Requirements: Node.js 20 or newer.

```bash
npm run install: all   # installs root, server and client dependencies
npm run dev           # starts server (port 4000) and client (port 3000)
```

Open http://localhost:3000. To test multiplayer alone, open a second **incognito/private window** (a normal second tab shares the same player ID, so it counts as the same player).

## Configuration

| Variable | Where | Default | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SOCKET_URL` | client | `http://localhost:4000` | URL of the game server |
| `PORT` | server | `4000` | Port the server listens on (hosting platforms set this automatically) |

The server exposes `GET /health`, which returns `ok`.

## Deploy

**Server (Render, Railway or similar)**
- Root directory: `server`
- Build command: `npm install`
- Start command: `npm start`

**Client (Vercel)**
- Root directory: `client`
- Environment variable: `NEXT_PUBLIC_SOCKET_URL` = your server's public `https://` URL, with no trailing slash

Free hosting tiers may sleep when idle, so the first load can take up to about a minute.

## Adding questions

Edit `server/src/questions.json`. Each entry looks like this:

```json
{ "category": "Space", "prompt": "Which company developed the Starship rocket?", "answer": "SpaceX" }
```

Questions are shuffled for each game. With fewer than 5 questions, they repeat.

## Troubleshooting

- **"Room not found" or buttons do nothing:** the server isn't running, or `NEXT_PUBLIC_SOCKET_URL` points to the wrong address.
- **Second player is treated as the first:** use an incognito window or a different browser.
- **Port already in use:** stop whatever is using port 3000 or 4000, or change the ports.
- **Refreshing mid-game:** the game reconnects you automatically to your room.

## Known limitations

- Rooms are stored in memory and are lost when the server restarts.
- No accounts, database, sound effects or animations yet.
- Players can't join a game that has already started.

## Ideas for next steps

- Persist match history (for example, with Supabase)
- Larger question bank with more categories
- Sound effects and animations
- Docker setup
