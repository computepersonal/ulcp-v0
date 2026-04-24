import { readFileSync } from "fs";
import { join } from "path";
import { Namespace, Socket } from "socket.io";
import { Redis } from "ioredis";
import { logger } from "./lib/logger";

const QUESTION_COUNT = 5;
const ANSWER_TIME_SECS = 30;
const VOTE_TIME_SECS = 30;

interface TriviaQuestion {
  question: string;
  answer: string;
  fun_fact: string;
}

interface TriviaGame {
  status: "voting" | "countdown" | "question" | "revealing" | "finished";
  topic: string;
  questions: TriviaQuestion[];
  current_question: number;
  scores: Record<string, { alias: string; score: number }>;
  votes: { start: string[]; skip: string[] };
  answered_by?: string; // socket_id of first correct answer this round
}

// ── Pre-loaded trivia packs (in-memory, loaded once at startup) ──

const TOPIC_MAP: Record<string, string> = {
  "general knowledge": "general-knowledge",
  "food and drinks": "food-and-drinks",
  "cricket": "cricket",
  "bollywood movies": "bollywood",
  "bollywood": "bollywood",
  "music": "music",
  "world geography": "geography",
  "geography": "geography",
  "football soccer": "football",
  "football": "football",
  "science": "science",
  "tv shows and ott content": "tv-and-ott",
  "tv and ott": "tv-and-ott",
  "sports": "sports",
};

const triviaPacks: Map<string, TriviaQuestion[]> = new Map();

function loadTriviaPacks(): void {
  const packsDir = join(__dirname, "trivia-packs");
  for (const [, filename] of Object.entries(TOPIC_MAP)) {
    if (triviaPacks.has(filename)) continue; // already loaded
    try {
      const raw = readFileSync(join(packsDir, `${filename}.json`), "utf-8");
      const questions = JSON.parse(raw) as TriviaQuestion[];
      triviaPacks.set(filename, questions);
    } catch {
      // pack file missing — skip silently
    }
  }
}

// Load all packs into memory immediately
loadTriviaPacks();
logger.info({ packsLoaded: triviaPacks.size, topics: [...triviaPacks.keys()] }, "Trivia packs loaded");

/** Available topic keys the client can request */
export function getAvailableTopics(): string[] {
  return [...new Set(Object.values(TOPIC_MAP))].filter(f => triviaPacks.has(f));
}

function getQuestions(topic: string): TriviaQuestion[] {
  const key = TOPIC_MAP[topic.toLowerCase()] ?? topic.toLowerCase().replace(/\s+/g, "-");
  const pack = triviaPacks.get(key);

  if (!pack || pack.length === 0) {
    // Fallback to general-knowledge if requested topic not found
    const fallback = triviaPacks.get("general-knowledge");
    if (fallback && fallback.length > 0) {
      return shuffleAndPick(fallback, QUESTION_COUNT);
    }
    // Ultimate fallback — should never hit if packs are loaded
    return [
      { question: "What is the capital of France?", answer: "paris", fun_fact: "Paris has been the capital of France since 987 AD." },
      { question: "How many continents are there?", answer: "7", fun_fact: "Antarctica is the only continent with no permanent human residents." },
      { question: "What is H2O?", answer: "water", fun_fact: "Water covers about 71% of Earth's surface." },
      { question: "Who painted the Mona Lisa?", answer: "leonardo da vinci", fun_fact: "It took Leonardo da Vinci approximately 4 years to paint the Mona Lisa." },
      { question: "What is the largest planet in our solar system?", answer: "jupiter", fun_fact: "Jupiter is so large that all other planets in our solar system could fit inside it." },
    ];
  }

  return shuffleAndPick(pack, QUESTION_COUNT);
}

/** Fisher-Yates shuffle + pick first N */
function shuffleAndPick(arr: TriviaQuestion[], n: number): TriviaQuestion[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy.slice(0, n);
}

function isCorrectAnswer(userAnswer: string, correctAnswer: string): boolean {
  const normalize = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9\s]/g, "");
  const ua = normalize(userAnswer);
  const ca = normalize(correctAnswer);
  return ua === ca || ua.includes(ca) || ca.includes(ua);
}

export function setupTriviaHandlers(social: Namespace, redis: Redis): void {
  const gameTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();

  async function getGame(tenant_id: string, branch_id: string): Promise<TriviaGame | null> {
    const raw = await redis.get(`trivia:${tenant_id}:${branch_id}`);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as TriviaGame;
    } catch {
      return null;
    }
  }

  async function saveGame(tenant_id: string, branch_id: string, game: TriviaGame): Promise<void> {
    await redis.set(`trivia:${tenant_id}:${branch_id}`, JSON.stringify(game), "EX", 3600);
  }

  async function clearGame(tenant_id: string, branch_id: string): Promise<void> {
    await redis.del(`trivia:${tenant_id}:${branch_id}`);
    const key = `${tenant_id}:${branch_id}`;
    const timer = gameTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      gameTimers.delete(key);
    }
  }

  async function startQuestion(tenant_id: string, branch_id: string): Promise<void> {
    const room = `social:${tenant_id}:${branch_id}`;
    const game = await getGame(tenant_id, branch_id);
    if (!game || game.current_question >= game.questions.length) {
      await endGame(tenant_id, branch_id);
      return;
    }

    const q = game.questions[game.current_question];
    if (!q) {
      await endGame(tenant_id, branch_id);
      return;
    }
    game.status = "question";
    game.answered_by = undefined;
    await saveGame(tenant_id, branch_id, game);

    social.to(room).emit("social:trivia:update", {
      status: "question",
      question_number: game.current_question + 1,
      total_questions: game.questions.length,
      question: q.question,
      topic: game.topic,
      scores: game.scores,
      timer_secs: ANSWER_TIME_SECS,
    });

    // Inject question into chat so everyone sees it
    social.to(room).emit("social:bot:message", {
      message: `🎯 **Q${game.current_question + 1}/${game.questions.length}:** ${q.question}`,
      type: "info",
    });

    const key = `${tenant_id}:${branch_id}`;
    const timer = setTimeout(() => {
      void (async () => {
        const current = await getGame(tenant_id, branch_id);
        if (!current || current.status !== "question") return;
        // Time's up — reveal with no winner
        current.status = "revealing";
        current.current_question++;
        await saveGame(tenant_id, branch_id, current);

        social.to(room).emit("social:trivia:update", {
          status: "reveal",
          correct_answer: q.answer,
          fun_fact: q.fun_fact,
          no_winner: true,
          scores: current.scores,
        });

        // Inject reveal into chat
        social.to(room).emit("social:bot:message", {
          message: `⏰ Time's up! The answer was **${q.answer}**\n💡 ${q.fun_fact}`,
          type: "info",
        });

        setTimeout(() => void startQuestion(tenant_id, branch_id), 3000);
      })();
    }, ANSWER_TIME_SECS * 1000);
    gameTimers.set(key, timer);
  }

  async function endGame(tenant_id: string, branch_id: string): Promise<void> {
    const room = `social:${tenant_id}:${branch_id}`;
    const game = await getGame(tenant_id, branch_id);
    if (!game) return;

    game.status = "finished";
    const sorted = Object.entries(game.scores).sort((a, b) => b[1].score - a[1].score);
    await saveGame(tenant_id, branch_id, game);

    const scoreList = sorted.map(([, v]) => v);
    social.to(room).emit("social:trivia:end", {
      scores: scoreList,
      winner: sorted[0]?.[1] ?? null,
    });

    // Inject final podium into chat
    const medals = ["🥇", "🥈", "🥉"];
    const podiumLines = scoreList.slice(0, 3).map((s, i) => `${medals[i]} ${s.alias} — ${s.score} pts`);
    const podiumMsg = podiumLines.length > 0
      ? `🏆 **TRIVIA OVER!** Topic: ${game.topic}\n\n${podiumLines.join("\n")}`
      : `🏆 **TRIVIA OVER!** No one scored any points.`;
    social.to(room).emit("social:bot:message", { message: podiumMsg, type: "info" });

    // Floating celebration for winner
    if (sorted[0]) {
      social.to(room).emit("social:reaction:floatup", {
        emoji: "🎊",
        from_alias: sorted[0][1].alias,
      });
    }

    await clearGame(tenant_id, branch_id);
  }

  async function launchGame(tenant_id: string, branch_id: string, topic: string, room: string): Promise<void> {
    const questions = getQuestions(topic);
    const game = await getGame(tenant_id, branch_id);
    if (!game) return;

    game.status = "countdown";
    game.questions = questions;
    game.scores = {};
    game.current_question = 0;
    await saveGame(tenant_id, branch_id, game);

    social.to(room).emit("social:trivia:update", {
      status: "countdown",
      topic,
      total_questions: questions.length,
      timer_secs: ANSWER_TIME_SECS,
    });

    social.to(room).emit("social:bot:message", {
      message: `🎮 **TRIVIA TIME!** Starting in 5 seconds...\nTopic: **${topic}** • ${questions.length} questions • ${ANSWER_TIME_SECS}s each\nType your answer in the chat!`,
      type: "trivia_start",
    });

    setTimeout(() => void startQuestion(tenant_id, branch_id), 5000);
  }

  // Attach trivia event handlers to each connecting socket
  social.on("connection", (socket: Socket) => {
    logger.info({ socket_id: socket.id }, "Trivia handlers attached to socket");
    socket.on(
      "social:trivia:command",
      async (data: { topic?: string; tenant_id: string; branch_id: string }) => {
        const room = `social:${data.tenant_id}:${data.branch_id}`;
        const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;

        logger.info({ topic: data.topic, tenant_id: data.tenant_id, branch_id: data.branch_id, socket_id: socket.id, room }, "Trivia command received");

        const existing = await getGame(data.tenant_id, data.branch_id);
        if (existing && existing.status !== "finished") {
          logger.info({ status: existing.status }, "Trivia game already in progress");
          socket.emit("social:bot:message", {
            message: "🎮 A trivia game is already in progress! Join in by answering in the chat.",
            type: "info",
          });
          return;
        }

        const userRaw = await redis.hget(roomKey, socket.id);
        const user = userRaw ? (JSON.parse(userRaw) as { alias: string; emoji: string }) : null;
        logger.info({ userRaw: !!userRaw, user, roomKey, socket_id: socket.id }, "Trivia user lookup");
        if (!user) return;

        const topic = data.topic ?? "general knowledge";

        // Start vote
        const game: TriviaGame = {
          status: "voting",
          topic,
          questions: [],
          current_question: 0,
          scores: {},
          votes: { start: [socket.id], skip: [] },
        };
        await saveGame(data.tenant_id, data.branch_id, game);

        const roomSockets = await social.in(room).fetchSockets();
        logger.info({ room, socketCount: roomSockets.length, socketIds: roomSockets.map(s => s.id) }, "Trivia emitting vote to room");

        social.to(room).emit("social:bot:message", {
          message: `🎮 **${user.alias}** wants to play trivia! Topic: **${topic}** 🎯\nVote to start! [▶️ Let's play!] [⏭️ Skip]`,
          type: "trivia_vote",
          data: { tenant_id: data.tenant_id, branch_id: data.branch_id, topic },
        });

        // Auto-start after vote window if no explicit skip majority
        const key = `${data.tenant_id}:${data.branch_id}`;
        const voteTimer = setTimeout(() => {
          void (async () => {
            const current = await getGame(data.tenant_id, data.branch_id);
            if (!current || current.status !== "voting") return;
            await launchGame(data.tenant_id, data.branch_id, topic, room);
          })();
        }, VOTE_TIME_SECS * 1000);
        gameTimers.set(`vote:${key}`, voteTimer);
      }
    );

    socket.on(
      "social:trivia:vote",
      async (data: { vote: "start" | "skip"; tenant_id: string; branch_id: string }) => {
        const room = `social:${data.tenant_id}:${data.branch_id}`;
        const game = await getGame(data.tenant_id, data.branch_id);
        if (!game || game.status !== "voting") return;

        if (data.vote === "start" && !game.votes.start.includes(socket.id)) {
          game.votes.start.push(socket.id);
        } else if (data.vote === "skip" && !game.votes.skip.includes(socket.id)) {
          game.votes.skip.push(socket.id);
        }
        await saveGame(data.tenant_id, data.branch_id, game);

        social.to(room).emit("social:trivia:vote:updated", {
          start: game.votes.start.length,
          skip: game.votes.skip.length,
        });

        // If majority start (3+) launch early
        if (game.votes.start.length >= 3) {
          const voteTimerKey = `vote:${data.tenant_id}:${data.branch_id}`;
          const voteTimer = gameTimers.get(voteTimerKey);
          if (voteTimer) {
            clearTimeout(voteTimer);
            gameTimers.delete(voteTimerKey);
          }
          await launchGame(data.tenant_id, data.branch_id, game.topic, room);
        }
      }
    );

    socket.on(
      "social:trivia:answer",
      async (data: { answer: string; tenant_id: string; branch_id: string }) => {
        const room = `social:${data.tenant_id}:${data.branch_id}`;
        const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;
        const game = await getGame(data.tenant_id, data.branch_id);
        if (!game || game.status !== "question") return;
        if (game.answered_by) return; // already answered

        const q = game.questions[game.current_question];
        if (!q) return;

        const userRaw = await redis.hget(roomKey, socket.id);
        const user = userRaw ? (JSON.parse(userRaw) as { alias: string }) : null;
        if (!user) return;

        if (isCorrectAnswer(data.answer, q.answer)) {
          // Cancel timer
          const key = `${data.tenant_id}:${data.branch_id}`;
          const timer = gameTimers.get(key);
          if (timer) {
            clearTimeout(timer);
            gameTimers.delete(key);
          }

          game.answered_by = socket.id;
          game.status = "revealing";
          if (!game.scores[socket.id]) {
            game.scores[socket.id] = { alias: user.alias, score: 0 };
          }
          game.scores[socket.id]!.score += 10;
          game.current_question++;
          await saveGame(data.tenant_id, data.branch_id, game);

          social.to(room).emit("social:trivia:update", {
            status: "reveal",
            correct_answer: q.answer,
            fun_fact: q.fun_fact,
            winner_alias: user.alias,
            scores: game.scores,
            no_winner: false,
          });

          // Inject winner reveal into chat
          social.to(room).emit("social:bot:message", {
            message: `🎉 **${user.alias}** got it right! Answer: **${q.answer}** (+10 pts)\n💡 ${q.fun_fact}`,
            type: "info",
          });

          setTimeout(() => void startQuestion(data.tenant_id, data.branch_id), 3000);
        }
      }
    );
  });
}
