"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { gradeProblem } from "@/lib/kidsos/grading";
import type { Problem } from "@/lib/kidsos/problem-bank";

interface ServerResult {
  passed: boolean;
  masteredNow: boolean;
  newLevel: number;
  pointsAwarded: { reason: string; points: number }[];
  totalPoints: number;
  levelName: string;
  newBadges: { key: string; name: string; emoji: string }[];
  streak: { currentDays: number; longestDays: number };
}

export function PracticeSession({
  childId,
  conceptCode,
  conceptName,
  problems,
}: {
  childId: string;
  conceptCode: string;
  conceptName: string;
  problems: Problem[];
}) {
  const router = useRouter();
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState("");
  const [feedback, setFeedback] = useState<null | { correct: boolean; answerText: string }>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const [submitting, setSubmitting] = useState(false);
  const [serverResult, setServerResult] = useState<ServerResult | null>(null);

  const problem = problems[index];
  const isLast = index === problems.length - 1;
  const isDone = index >= problems.length;

  function answerText(p: Problem) {
    if (p.type === "mc") return p.options[p.correctIndex];
    if (p.type === "numeric") return p.answer;
    return p.sampleAnswer || "(open-ended)";
  }

  async function submitAnswer(value: string) {
    if (feedback) return; // already answered this one
    const result = gradeProblem(problem, value);
    if (result.correct) setCorrectCount((c) => c + 1);
    setFeedback({ correct: result.correct, answerText: answerText(problem) });
  }

  async function next() {
    setFeedback(null);
    setResponse("");
    if (isLast) {
      const durationSeconds = Math.round((Date.now() - startedAt) / 1000);
      setSubmitting(true);
      const res = await fetch("/api/kids/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId, conceptCode, correct: correctCount, total: problems.length, durationSeconds }),
      });
      const data = await res.json();
      setServerResult(data);
      setSubmitting(false);
      setIndex((i) => i + 1);
      router.refresh();
    } else {
      setIndex((i) => i + 1);
    }
  }

  if (isDone) {
    const pct = Math.round((correctCount / problems.length) * 100);
    return (
      <Card className="mt-6">
        <p className="text-lg font-semibold">
          {submitting ? "Saving…" : serverResult?.passed ? "🎉 Nice work!" : "Good effort!"}
        </p>
        <p className="mt-1 text-sm text-neutral-400">
          {correctCount} of {problems.length} correct ({pct}%) on {conceptName}.
        </p>

        {serverResult && (
          <div className="mt-4 flex flex-col gap-2 text-sm">
            {serverResult.masteredNow && (
              <p className="text-emerald-300">✅ Concept mastered!</p>
            )}
            {serverResult.pointsAwarded.length > 0 && (
              <p className="text-amber-300">
                +{serverResult.pointsAwarded.reduce((s, p) => s + p.points, 0)} points (
                {serverResult.pointsAwarded.map((p) => p.reason.replace(/_/g, " ").toLowerCase()).join(", ")})
              </p>
            )}
            {serverResult.newBadges.length > 0 && (
              <p className="text-indigo-300">
                New badge{serverResult.newBadges.length > 1 ? "s" : ""}:{" "}
                {serverResult.newBadges.map((b) => `${b.emoji} ${b.name}`).join(", ")}
              </p>
            )}
            <p className="text-neutral-500">
              Total: ⭐ {serverResult.totalPoints} pts · {serverResult.levelName} · 🔥{" "}
              {serverResult.streak.currentDays}-day streak
            </p>
          </div>
        )}

        <div className="mt-5 flex gap-3">
          <Button variant="secondary" onClick={() => router.push(`/app/kids/${childId}/study/${conceptCode}`)}>
            Practice again
          </Button>
          <Button variant="ghost" onClick={() => router.push(`/app/kids/${childId}/study`)}>
            Back to Study
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="mt-6">
      <p className="text-xs text-neutral-500">
        Question {index + 1} of {problems.length}
      </p>
      <p className="mt-2 text-base font-medium">{problem.prompt}</p>

      {problem.type === "mc" ? (
        <div className="mt-4 flex flex-col gap-2">
          {problem.options.map((option, i) => {
            const chosen = feedback && response === String(i);
            return (
              <button
                key={i}
                disabled={Boolean(feedback)}
                onClick={() => {
                  setResponse(String(i));
                  submitAnswer(String(i));
                }}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition-colors disabled:cursor-default ${
                  feedback && i === problem.correctIndex
                    ? "border-emerald-400/60 bg-emerald-500/10"
                    : chosen
                    ? "border-red-400/60 bg-red-500/10"
                    : "border-white/10 bg-white/[0.02] hover:border-white/20"
                }`}
              >
                {option}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <input
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            disabled={Boolean(feedback)}
            placeholder="Your answer"
            className="flex-1 rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-indigo-400"
            onKeyDown={(e) => {
              if (e.key === "Enter" && response.trim()) submitAnswer(response);
            }}
          />
          {!feedback && (
            <Button onClick={() => response.trim() && submitAnswer(response)} disabled={!response.trim()}>
              Check
            </Button>
          )}
        </div>
      )}

      {feedback && (
        <div className="mt-4 rounded-lg border border-white/10 bg-black/20 p-3 text-sm">
          <p className={feedback.correct ? "text-emerald-300" : "text-red-300"}>
            {feedback.correct ? "Correct!" : `Not quite. Answer: ${feedback.answerText}`}
          </p>
          <Button className="mt-3" variant="secondary" onClick={next}>
            {isLast ? "Finish" : "Next question"}
          </Button>
        </div>
      )}
    </Card>
  );
}
