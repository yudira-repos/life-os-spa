// KidsOS Studies — server-side progress engine. This is the one place that
// touches Mastery/PracticeSession/PointsEntry/Streak/EarnedBadge together,
// so the rules (mastery threshold, point values, badge conditions) are
// applied consistently whether called from the practice API route or later
// from anywhere else.

import { db } from "@/lib/db";
import { MASTERY_THRESHOLD, getConcept } from "./curriculum";
import {
  POINT_VALUES,
  isRushed,
  touchStreak,
  streakBonusDue,
  badgeForConceptBase,
  badgeForSubjectMastery,
  levelForPoints,
  isoWeek,
  BADGE_CATALOG,
  type PointReason,
} from "./gamification";

export interface RecordPracticeInput {
  childId: string;
  conceptCode: string;
  correct: number;
  total: number;
  durationSeconds: number;
}

export interface RecordPracticeResult {
  passed: boolean;
  newLevel: number;
  masteredNow: boolean;
  pointsAwarded: { reason: PointReason; points: number }[];
  totalPoints: number;
  levelName: string;
  newBadges: { key: string; name: string; emoji: string }[];
  streak: { currentDays: number; longestDays: number };
}

async function awardPoints(childId: string, reason: PointReason, tx: typeof db = db) {
  await tx.pointsEntry.create({ data: { childId, reason, points: POINT_VALUES[reason] } });
  return POINT_VALUES[reason];
}

async function awardBadge(childId: string, badgeKey: string, tx: typeof db = db) {
  const existing = await tx.earnedBadge.findUnique({
    where: { childId_badgeKey: { childId, badgeKey } },
  });
  if (existing) return false;
  await tx.earnedBadge.create({ data: { childId, badgeKey } });
  return true;
}

export async function recordPracticeResult(input: RecordPracticeInput): Promise<RecordPracticeResult> {
  const { childId, conceptCode, correct, total, durationSeconds } = input;
  const concept = getConcept(conceptCode);
  if (!concept) throw new Error("Unknown concept");

  const sessionScore = total > 0 ? correct / total : 0;
  const rushed = isRushed(total, correct, durationSeconds);
  const passed = sessionScore >= MASTERY_THRESHOLD;

  const existingMastery = await db.mastery.findUnique({
    where: { childId_conceptCode: { childId, conceptCode } },
  });
  const priorLevel = existingMastery?.level ?? 0;
  const wasMastered = priorLevel >= MASTERY_THRESHOLD;

  // Exponential moving average, weighted so mastery (>=0.85) needs roughly
  // two strong sessions in a row — enough to reward a great single session
  // without letting one lucky guess "master" a concept, and without making
  // a genuinely strong kid grind the same concept five+ times to see it.
  const newLevel = priorLevel * 0.35 + sessionScore * 0.65;

  await db.mastery.upsert({
    where: { childId_conceptCode: { childId, conceptCode } },
    create: { childId, conceptCode, subject: concept.subject, level: newLevel, attempts: 1 },
    update: { level: newLevel, attempts: { increment: 1 } },
  });

  await db.practiceSession.create({
    data: { childId, subject: concept.subject, conceptCode, correct, total, passed },
  });

  const pointsAwarded: { reason: PointReason; points: number }[] = [];
  const newBadges: { key: string; name: string; emoji: string }[] = [];

  if (!rushed) {
    const masteredNow = newLevel >= MASTERY_THRESHOLD && !wasMastered;

    if (masteredNow) {
      const wasStuck = existingMastery && existingMastery.attempts >= 2 && priorLevel < 0.5;
      const reason: PointReason = wasStuck ? "IMPROVEMENT" : "CONCEPT_MASTERY";
      pointsAwarded.push({ reason, points: await awardPoints(childId, reason) });

      const skillBadge = badgeForConceptBase(concept.base);
      if (skillBadge && (await awardBadge(childId, skillBadge))) {
        const def = BADGE_CATALOG.find((b) => b.key === skillBadge);
        if (def) newBadges.push({ key: def.key, name: def.name, emoji: def.emoji });
      }
      const subjectBadge = badgeForSubjectMastery(concept.subject);
      if (subjectBadge && (await awardBadge(childId, subjectBadge))) {
        const def = BADGE_CATALOG.find((b) => b.key === subjectBadge);
        if (def) newBadges.push({ key: def.key, name: def.name, emoji: def.emoji });
      }
    }

    if (total >= 8 && sessionScore >= 0.9) {
      pointsAwarded.push({ reason: "CHALLENGE", points: await awardPoints(childId, "CHALLENGE") });
    }
  }

  // Streak — touched once per practice session regardless of score; a kid
  // showing up and trying is what the streak rewards.
  const existingStreak = await db.streak.findUnique({ where: { childId } });
  const touched = touchStreak({
    currentDays: existingStreak?.currentDays ?? 0,
    longestDays: existingStreak?.longestDays ?? 0,
    lastActive: existingStreak?.lastActive ?? null,
  });

  let bonusPaidWeek = existingStreak?.bonusPaidWeek ?? null;
  if (streakBonusDue(touched.currentDays, bonusPaidWeek)) {
    pointsAwarded.push({ reason: "STREAK_BONUS", points: await awardPoints(childId, "STREAK_BONUS") });
    bonusPaidWeek = isoWeek(new Date());
  }

  await db.streak.upsert({
    where: { childId },
    create: {
      childId,
      currentDays: touched.currentDays,
      longestDays: touched.longestDays,
      lastActive: touched.lastActive,
      bonusPaidWeek,
    },
    update: {
      currentDays: touched.currentDays,
      longestDays: touched.longestDays,
      lastActive: touched.lastActive,
      bonusPaidWeek,
    },
  });

  // Milestone badges that depend on aggregate state, not just this session.
  const allSessions = await db.practiceSession.findMany({ where: { childId } });
  if (allSessions.length === 1 && (await awardBadge(childId, "first_steps"))) {
    newBadges.push({ key: "first_steps", name: "First Steps", emoji: "👟" });
  }
  const totalCorrect = allSessions.reduce((sum, s) => sum + s.correct, 0);
  if (totalCorrect >= 10 && (await awardBadge(childId, "problem_solver"))) {
    newBadges.push({ key: "problem_solver", name: "Problem Solver", emoji: "🧩" });
  }
  const distinctSubjects = new Set(allSessions.map((s) => s.subject));
  if (distinctSubjects.size >= 3 && (await awardBadge(childId, "subject_sweep"))) {
    newBadges.push({ key: "subject_sweep", name: "Subject Sweep", emoji: "🌟" });
  }
  if (touched.currentDays >= 5 && (await awardBadge(childId, "week_one"))) {
    newBadges.push({ key: "week_one", name: "Week One", emoji: "🔥" });
  }
  if (touched.currentDays >= 30 && (await awardBadge(childId, "consistency_king"))) {
    newBadges.push({ key: "consistency_king", name: "Consistency Champion", emoji: "👑" });
  }

  const pointsSum = await db.pointsEntry.aggregate({ where: { childId }, _sum: { points: true } });
  const totalPoints = pointsSum._sum.points ?? 0;
  if (totalPoints >= 300 && (await awardBadge(childId, "scholar"))) {
    newBadges.push({ key: "scholar", name: "Scholar", emoji: "🎓" });
  }

  return {
    passed,
    newLevel,
    masteredNow: newLevel >= MASTERY_THRESHOLD && !wasMastered,
    pointsAwarded,
    totalPoints,
    levelName: levelForPoints(totalPoints),
    newBadges,
    streak: { currentDays: touched.currentDays, longestDays: touched.longestDays },
  };
}

export async function getChildProgressSummary(childId: string) {
  const [masteries, pointsSum, streak, badges] = await Promise.all([
    db.mastery.findMany({ where: { childId } }),
    db.pointsEntry.aggregate({ where: { childId }, _sum: { points: true } }),
    db.streak.findUnique({ where: { childId } }),
    db.earnedBadge.findMany({ where: { childId }, orderBy: { earnedAt: "desc" } }),
  ]);

  const masteryByCode: Record<string, number> = {};
  for (const m of masteries) masteryByCode[m.conceptCode] = m.level;

  const totalPoints = pointsSum._sum.points ?? 0;

  return {
    masteries,
    masteryByCode,
    totalPoints,
    levelName: levelForPoints(totalPoints),
    streak: streak ?? { currentDays: 0, longestDays: 0, lastActive: null },
    badges,
  };
}
