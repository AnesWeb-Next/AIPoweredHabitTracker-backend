import "dotenv/config";

import mongoose from "mongoose";
import { format, subDays } from "date-fns";

import { connectDB } from "../config/db.js";
import User from "../models/User.js";
import Habit from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";
import AIInsight from "../models/AIInsight.js";

const EMAIL = "alex@timetoprogram.com";
const PASSWORD = "password123";
const NAME = "Alex Rivera";

const HABITS = [
  {
    name: "Drink 2L of water",
    description: "Stay hydrated throughout the day.",
    category: "Health",
    frequency: "daily",
    targetDays: 7,
    color: "#0ea5e9",
    icon: "",
    _streakProb: 0.95,
  },
  {
    name: "Morning run",
    description: "30-minute run before breakfast.",
    category: "Fitness",
    frequency: "daily",
    targetDays: 5,
    color: "#ef4444",
    icon: "",
    _streakProb: 0.7,
    _pattern: "weekdays",
  },
  {
    name: "Read 20 minutes",
    description: "Fiction or non-fiction, no phone.",
    category: "Learning",
    frequency: "daily",
    targetDays: 7,
    color: "#6366f1",
    icon: "",
    _streakProb: 0.82,
  },
  {
    name: "Meditate",
    description: "10 minutes of breath-focused meditation.",
    category: "Mindfulness",
    frequency: "daily",
    targetDays: 7,
    color: "#8b5cf6",
    icon: "A",
    _streakProb: 0.6,
  },
  {
    name: "Journal",
    description: "Write 3 things I'm grateful for.",
    category: "Mindfulness",
    frequency: "daily",
    targetDays: 5,
    color: "#ec4899",
    icon: "",
    _streakProb: 0.75,
    _pattern: "dropoff",
  },
  {
    name: "Strength training",
    description: "Push/pull/legs split.",
    category: "Fitness",
    frequency: "weekly",
    targetDays: 3,
    color: "#f59e0b",
    icon: "",
    _streakProb: 0.55,
    _pattern: "weekdays",
  },
  {
    name: "No phone after 10pm",
    description: "Leave phone outside the bedroom.",
    category: "Health",
    frequency: "daily",
    targetDays: 6,
    color: "#10b981",
    icon: "",
    _streakProb: 0.65,
  },
  {
    name: "Side project -1hr",
    description: "Ship something small every day.",
    category: "Productivity",
    frequency: "daily",
    targetDays: 6,
    color: "#14b8a6",
    icon: "",
    _streakProb: 0.78,
  },
];

const todayKey = () => format(new Date(), "yyyy-MM-dd");

const buildLogs = (habit, totalDays = 90) => {
  const logs = [];
  const today = new Date();

  for (let i = 0; i < totalDays; i++) {
    const date = subDays(today, i);
    const dayOfWeek = date.getDay();
    const key = format(date, "yyyy-MM-dd");
    let probability = habit._streakProb;

    if (habit._pattern === "weekdays" && (dayOfWeek === 0 || dayOfWeek === 6)) {
      probability *= 0.35;
    }

    if (habit._pattern === "dropoff" && i < 14) {
      probability *= 0.25;
    }

    if (habit._brokeAt && i >= habit._brokeAt - 2 && i <= habit._brokeAt + 2) {
      continue;
    }

    const value = Math.sin(i * 9301 + habit.name.length * 49297) * 233280;
    const random = value - Math.floor(value);

    if (random < probability) {
      logs.push({ completedDate: key });
    }
  }

  return logs;
};

const run = async () => {
  await connectDB();

  try {
    let user = await User.findOne({ email: EMAIL });

    if (user) {
      console.log(`Found existing user ${EMAIL} - clearing their data...`);
      await Habit.deleteMany({ userId: user._id });
      await HabitLog.deleteMany({ userId: user._id });
      await AIInsight.deleteMany({ userId: user._id });

      user.name = NAME;
      user.avatar = NAME.charAt(0).toUpperCase();
      user.morningMotivation = true;
      user.password = PASSWORD;
      await user.save();
    } else {
      user = await User.create({
        name: NAME,
        email: EMAIL,
        password: PASSWORD,
        avatar: NAME.charAt(0).toUpperCase(),
        morningMotivation: true,
      });
      console.log(`Created user ${EMAIL}`);
    }

    const createdHabits = [];

    for (let i = 0; i < HABITS.length; i++) {
      const config = HABITS[i];
      const habit = await Habit.create({
        userId: user._id,
        name: config.name,
        description: config.description,
        category: config.category,
        frequency: config.frequency,
        targetDays: config.targetDays,
        color: config.color,
        icon: config.icon,
        order: i,
      });

      habit.createdAt = subDays(new Date(), 89);
      await habit.save({ timestamps: false });
      createdHabits.push({ habit, config });
    }

    let totalLogs = 0;

    for (const { habit, config } of createdHabits) {
      const logs = buildLogs(config);
      if (logs.length === 0) continue;

      const documents = logs.map((log) => ({
        userId: user._id,
        habitId: habit._id,
        completedDate: log.completedDate,
      }));

      await HabitLog.insertMany(documents);
      totalLogs += documents.length;
    }

    const today = todayKey();
    const todayDoneHabits = createdHabits.slice(0, 4);

    for (const { habit } of todayDoneHabits) {
      await HabitLog.updateOne(
        { userId: user._id, habitId: habit._id, completedDate: today },
        {
          $setOnInsert: {
            userId: user._id,
            habitId: habit._id,
            completedDate: today,
          },
        },
        { upsert: true },
      );
    }

    console.log("\nSeed complete");
    console.log(`User: ${EMAIL}`);
    console.log(`Password: ${PASSWORD}`);
    console.log(`Habits: ${createdHabits.length}`);
    console.log(`Logs: ~${totalLogs}`);
  } finally {
    await mongoose.disconnect();
  }
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exitCode = 1;
});
