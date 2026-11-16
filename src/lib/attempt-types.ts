import type { Types } from "mongoose";

export type AttemptAnswer = {
  questionId: Types.ObjectId;
  questionKey: string;
  selectedOption?: string | null;
  status: "not_attempted" | "attempted" | "marked";
};
