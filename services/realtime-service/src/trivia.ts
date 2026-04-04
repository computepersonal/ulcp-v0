import Anthropic from "@anthropic-ai/sdk";
import { Namespace, Socket } from "socket.io";
import { Redis } from "ioredis";

const client = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] ?? "" });
const TRIVIA_CACHE_TTL = parseInt(process.env["TRIVIA_CACHE_TTL_SECS"] ?? "86400", 10);
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

async function getQuestions(topic: string, redis: Redis): Promise<TriviaQuestion[]> {
  const cacheKey = `trivia:questions:${topic.toLowerCase().replace(/\s+/g, "_")}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as TriviaQuestion[];
    } catch {
      // regenerate
    }
  }

  if (!process.env["ANTHROPIC_API_KEY"]) {
    // Fallback questions when no API key
    return [
      { question: "What is the most popular pizza topping in the world?", answer: "cheese", fun_fact: "Mozzarella cheese is used on over 80% of all pizzas worldwide." },
      { question: "Which country invented pasta?", answer: "china", fun_fact: "Pasta was brought to Italy from China by Marco Polo in the 13th century." },
      { question: "What is the world's most expensive spice by weight?", answer: "saffron", fun_fact: "Saffron costs up to $5,000 per pound because harvesting it is entirely done by hand." },
      { question: "Which fruit has its seeds on the outside?", answer: "strawberry", fun_fact: "A strawberry is not actually a berry — it's an accessory fruit." },
      { question: "What is the main ingredient in guacamole?", answer: "avocado", fun_fact: "Avocados are technically berries, and they ripen faster when placed next to bananas." },
    ];
  }

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{
      role: "user",
      content: `Generate ${QUESTION_COUNT} trivia questions about "${topic}" for a fun pub quiz game.
Return ONLY a valid JSON array, no markdown, no explanation:
[{"question":"...","answer":"...","fun_fact":"one interesting sentence about the answer"}]
Make questions moderately challenging. Answers should be short (1-4 words ideally).`,
    }],
  });

  const text = message.content[0]?.type === "text" ? message.content[0].text.trim() : "[]";
  let questions: TriviaQuestion[] = [];
  try {
    // Extract JSON array from response
    const match = text.match(/\[[\s\S]*\]/);
    questions = match ? (JSON.parse(match[0]) as TriviaQuestion[]) : [];
  } catch {
    questions = [];
  }

  if (questions.length >= QUESTION_COUNT) {
    await redis.set(cacheKey, JSON.stringify(questions.slice(0, QUESTION_COUNT)), "EX", TRIVIA_CACHE_TTL);
    return questions.slice(0, QUESTION_COUNT);
  }
  // Return fallback if generation failed
  return [
    { question: "What is the capital of France?", answer: "paris", fun_fact: "Paris has been the capital of France since 987 AD." },
    { question: "How many continents are there?", answer: "7", fun_fact: "Antarctica is the only continent with no permanent human residents." },
    { question: "What is H2O?", answer: "water", fun_fact: "Water covers about 71% of Earth's surface." },
    { question: "Who painted the Mona Lisa?", answer: "leonardo da vinci", fun_fact: "It took Leonardo da Vinci approximately 4 years to paint the Mona Lisa." },
    { question: "What is the largest planet in our solar system?", answer: "jupiter", fun_fact: "Jupiter is so large that all other planets in our solar system could fit inside it." },
  ];
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

    social.to(room).emit("social:trivia:end", {
      scores: sorted.map(([, v]) => v),
      winner: sorted[0]?.[1] ?? null,
    });

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
    social.to(room).emit("social:bot:message", {
      message: `🎮 TRIVIA TIME! Generating questions about **${topic}**... ⏳`,
      type: "info",
    });

    const questions = await getQuestions(topic, redis);
    const game = await getGame(tenant_id, branch_id);
    if (!game) return;

    game.status = "countdown";
    game.questions = questions;
    game.scores = {};
    game.current_question = 0;
    await saveGame(tenant_id, branch_id, game);

    social.to(room).emit("social:bot:message", {
      message: `🎮 **TRIVIA TIME!** Starting in 5 seconds...\nTopic: **${topic}**\n${questions.length} questions • 30 seconds each\nType your answer in the chat!`,
      type: "trivia_start",
    });

    setTimeout(() => void startQuestion(tenant_id, branch_id), 5000);
  }

  // Attach trivia event handlers to each connecting socket
  social.on("connection", (socket: Socket) => {
    socket.on(
      "social:trivia:command",
      async (data: { topic?: string; tenant_id: string; branch_id: string }) => {
        const room = `social:${data.tenant_id}:${data.branch_id}`;
        const roomKey = `social:room:${data.tenant_id}:${data.branch_id}`;

        const existing = await getGame(data.tenant_id, data.branch_id);
        if (existing && existing.status !== "finished") {
          socket.emit("social:bot:message", {
            message: "🎮 A trivia game is already in progress! Join in by answering in the chat.",
            type: "info",
          });
          return;
        }

        const userRaw = await redis.hget(roomKey, socket.id);
        const user = userRaw ? (JSON.parse(userRaw) as { alias: string; emoji: string }) : null;
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

          setTimeout(() => void startQuestion(data.tenant_id, data.branch_id), 3000);
        }
      }
    );
  });
}
