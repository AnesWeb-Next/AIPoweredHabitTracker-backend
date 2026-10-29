import Habit from "../models/Habit.js";
import HabitLog from "../models/HabitLog.js";
import AIInsight from "../models/AIInsight.js";

import {
  chatCompletion,
  SYSTEM_PROMPTS,
  parseJSON,
} from "../utils/aiService.js";

import { lastNDays, calcStreak, todayKey } from "../utils/dateHalpers.js";

const buildWeeklyContext = async (userId) => {
  const habits = await Habit.find({ userId, isArchived: false });
  const days = lastNDays(7);
  const logs = await HabitLog.find({
    userId,
    completedDate: { $gte: days[0], $lte: days[days.length - 1] },
  });

  const perHabit = habits.map((habit) => {
    const completed = logs.filter(
      (log) => String(log.habitId) === String(habit._id),
    ).length;

    return {
      name: habit.name,
      category: habit.category,
      frequency: habit.frequency,
      completedDays: completed,
      targetDays: habit.targetDays,
    };
  });

  return { days, perHabit };
};

export const weeklyReport = async (req, res) => {
  try {
    const ctx = await buildWeeklyContext(req.user._id);

    if (!ctx.perHabit.length) {
      return res.json({
        content:
          "You don't have any active habits yet. Create your first habit to start tracking. I'll generate a weekly review once you have a few entries.",
      });
    }

    const userMsg = `Here is the user's habit data for the past 7 days (${ctx.days[0]} to ${ctx.days[ctx.days.length - 1]}):\n${ctx.perHabit
      .map(
        (habit) =>
          `${habit.name} (${habit.category}, ${habit.frequency}): completed ${habit.completedDays} of the past 7 days, target ${habit.targetDays} days`,
      )
      .join("\n")}\n\nPlease write the personalized weekly report now.`;

    const result = await chatCompletion({
      system: SYSTEM_PROMPTS.weekly,
      user: userMsg,
    });

    const content = result?.content || "I couldn't generate your weekly report right now.";

    await AIInsight.create({
      userId: req.user._id,
      type: "weekly",
      content,
    });

    return res.json({ content });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const suggestHabits = async (req, res) => {
  try {
    const { goals, productiveTime, struggles } = req.body;

    const userMsg = `User goals: ${goals || "not provided"}\nMost productive time: ${productiveTime || "not provided"}\nPast struggles: ${struggles || "not provided"}\n\nSuggest 3 practical, low-friction habits that fit this person and their routine.`;

    const result = await chatCompletion({
      system: SYSTEM_PROMPTS.suggestion,
      user: userMsg,
    });

    let suggestions = [];

    try {
      const parsed = parseJSON(result?.content || "");
      if (parsed && Array.isArray(parsed.suggestions)) {
        suggestions = parsed.suggestions;
      }
    } catch {
      suggestions = [];
    }

    if (!suggestions.length) {
      suggestions = [
        {
          name: "10-minute morning walk",
          description: "Start the day with light movement and fresh air.",
          frequency: "daily",
          category: "Fitness",
          icon: "🚶",
          reason: "Low-friction way to build consistency early in the day.",
        },
        {
          name: "Read 5 pages",
          description: "Short daily reading to build a learning routine.",
          frequency: "daily",
          category: "Learning",
          icon: "📚",
          reason: "Compounds into significant knowledge over weeks.",
        },
        {
          name: "2 minutes of mindful breathing",
          description: "Pause and breathe to reset focus and reduce stress.",
          frequency: "daily",
          category: "Mindfulness",
          icon: "🧘",
          reason: "Tiny anchor habit that fits any schedule.",
        },
      ];
    }

    await AIInsight.create({
      userId: req.user._id,
      type: "suggestion",
      content: JSON.stringify(suggestions),
      meta: { goals, productiveTime, struggles },
    });

    return res.json({ suggestions });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const recoveryPlan = async (req, res) => {
  try {
    const { habitId } = req.body;

    const habit = await Habit.findOne({
      _id: habitId,
      userId: req.user._id,
    });

    if (!habit) {
      return res.status(404).json({ message: "Habit not found" });
    }

    const logs = await HabitLog.find({
      userId: req.user._id,
      habitId,
    }).sort({ completedDate: -1 });

    const keys = logs.map((log) => log.completedDate);
    const { current, longest } = calcStreak(keys);

    const userMsg = `Habit: ${habit.name} (${habit.category}).\nDescription: ${habit.description || "none"}.\nCurrent streak: ${current} days. Longest streak: ${longest} days.\nWrite a 3-day recovery plan that is realistic, encouraging, and tailored to rebuilding consistency.`;

    const result = await chatCompletion({
      system: SYSTEM_PROMPTS.recovery,
      user: userMsg,
    });

    const content = result?.content || "I couldn't generate a recovery plan right now.";

    await AIInsight.create({
      userId: req.user._id,
      type: "recovery",
      content,
      meta: { habitId },
    });

    return res.json({ content });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const chatAnalysis = async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) {
      return res.status(400).json({ message: "Question is required" });
    }

    const habits = await Habit.find({
      userId: req.user._id,
      isArchived: false,
    });

    const days = lastNDays(30);
    const logs = await HabitLog.find({
      userId: req.user._id,
      completedDate: { $gte: days[0], $lte: days[days.length - 1] },
    });

    const context = habits
      .map((habit) => {
        const hLogs = logs.filter(
          (log) => String(log.habitId) === String(habit._id),
        );

        const byDow = [0, 0, 0, 0, 0, 0, 0];
        for (const log of hLogs) {
          const dow = new Date(log.completedDate).getDay();
          byDow[dow] += 1;
        }

        return `${habit.name} (${habit.category}): ${hLogs.length}/30 in last 30 days, by weekday [Sun, Mon, Tue, Wed, Thu, Fri, Sat]: ${byDow.join(", ")}`;
      })
      .join("\n");

    const userMsg = `User question: "${question}"\n\nUser data (last 30 days):\n${context}\n\nAnswer now.`;

    const result = await chatCompletion({
      system: SYSTEM_PROMPTS.chat,
      user: userMsg,
    });

    const content = result?.content || "I couldn't answer that question right now.";

    await AIInsight.create({
      userId: req.user._id,
      type: "chat",
      content,
      meta: { question },
    });

    return res.json({ content });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};

export const morningMotivation = async (req, res) => {
  try {
    const habits = await Habit.find({
      userId: req.user._id,
      isArchived: false,
    });

    if (!habits.length) {
      return res.json({
        content:
          "Good morning! Add your first habit today and let's get the momentum started.",
      });
    }

    const days = lastNDays(30);
    const logs = await HabitLog.find({
      userId: req.user._id,
      completedDate: { $gte: days[0], $lte: days[days.length - 1] },
    });

    const ctx = habits
      .map((habit) => {
        const hLogs = logs
          .filter((log) => String(log.habitId) === String(habit._id))
          .map((log) => log.completedDate)
          .sort()
          .reverse();

        const { current } = calcStreak(hLogs);
        return `${habit.name}: current streak ${current}`;
      })
      .join("\n");

    const today = todayKey();
    const todayLogs = logs.filter((log) => log.completedDate === today);
    const done = todayLogs.length;
    const total = habits.length;

    const userMsg = `Today's habits and streaks:\n${ctx}\n\nDone today: ${done}/${total}. Write a short morning motivation message in 30-60 words using the user's progress and creating a positive, encouraging tone.`;

    const result = await chatCompletion({
      system: SYSTEM_PROMPTS.morning,
      user: userMsg,
      temperature: 0.8,
    });

    const content = result?.content || "You’ve got this. Keep moving one small step at a time.";

    await AIInsight.create({
      userId: req.user._id,
      type: "morning",
      content,
    });

    return res.json({ content });
  } catch (err) {
    return res.status(500).json({ message: err.message });
  }
};
