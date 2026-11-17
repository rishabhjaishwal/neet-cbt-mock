import { Schema, models, model, type InferSchemaType, Types } from "mongoose";

const AppMetaSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    contentVersion: { type: Number, required: true },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: false },
);

const UserSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["student", "examiner"], required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const PaperSchema = new Schema(
  {
    year: { type: Number, required: true, unique: true, index: true },
    code: { type: String, required: true },
    title: { type: String, required: true },
    candidateCount: { type: Number, required: true },
    durationMinutes: { type: Number, required: true },
    totalQuestions: { type: Number, required: true },
    attemptLimit: { type: Number, required: true },
    structure: { type: String, required: true },
    sourceNote: { type: String, required: true },
    gaps: { type: [String], default: [] },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const QuestionSchema = new Schema(
  {
    questionKey: { type: String, required: true, unique: true },
    year: { type: Number, required: true, index: true },
    number: { type: Number, required: true },
    subject: { type: String, required: true },
    section: { type: String, required: true },
    topic: { type: String, required: true },
    stem: { type: String, required: true },
    options: {
      type: Schema.Types.Mixed,
      required: true,
    },
    correctOption: { type: String, required: true },
    /** All correct option codes for multi-correct items (e.g. ["1","3"]). */
    correctOptions: { type: [String], default: undefined },
    multiCorrect: { type: Boolean, default: false },
    isPlaceholder: { type: Boolean, default: false },
    answerEstimated: { type: Boolean, default: false },
    figureSrc: { type: String },
    figureKind: { type: String },
  },
  { timestamps: false },
);
QuestionSchema.index({ year: 1, number: 1 }, { unique: true });

const AttemptAnswerSchema = new Schema(
  {
    questionId: { type: Schema.Types.ObjectId, required: true },
    questionKey: { type: String, required: true },
    /** Denormalized for fast checkpoint limits (avoids Question.find per save). */
    number: { type: Number },
    subject: { type: String },
    section: { type: String },
    selectedOption: { type: String, default: null },
    selectedOptions: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["not_attempted", "attempted", "marked"],
      default: "not_attempted",
    },
  },
  { _id: false },
);

const AttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    year: { type: Number, required: true, index: true },
    attemptNumber: { type: Number, default: 1, index: true },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "approved"],
      required: true,
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    submittedAt: { type: Date },
    approvedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    score: { type: Number },
    correctCount: { type: Number },
    wrongCount: { type: Number },
    unattemptedCount: { type: Number },
    subjectStats: { type: Schema.Types.Mixed },
    topicStats: { type: Schema.Types.Mixed },
    percentile: { type: Number },
    estimatedRank: { type: Number },
    screenSwitchCount: { type: Number, default: 0 },
    screenSwitchEvents: {
      type: [
        {
          at: { type: Date, default: Date.now },
          reason: { type: String, required: true },
        },
      ],
      default: [],
    },
    /** CBT resume position — timer always uses endsAt (never extended by client). */
    currentQuestionIndex: { type: Number, default: 0 },
    subjectFilter: { type: String, default: "ALL" },
    sectionFilter: { type: String, default: "ALL" },
    checkpointAt: { type: Date },
    answers: { type: [AttemptAnswerSchema], default: [] },
  },
  { timestamps: false },
);
AttemptSchema.index({ userId: 1, year: 1, attemptNumber: 1 }, { unique: true });
AttemptSchema.index({ userId: 1, status: 1 });

export type UserDoc = InferSchemaType<typeof UserSchema> & { _id: Types.ObjectId };
export type PaperDoc = InferSchemaType<typeof PaperSchema> & { _id: Types.ObjectId };
export type QuestionDoc = InferSchemaType<typeof QuestionSchema> & {
  _id: Types.ObjectId;
};
export type AttemptDoc = InferSchemaType<typeof AttemptSchema> & {
  _id: Types.ObjectId;
};

const TopicAnswerSchema = new Schema(
  {
    questionKey: { type: String, required: true },
    selectedOption: { type: String, default: null },
    selectedOptions: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["not_attempted", "attempted", "marked"],
      default: "not_attempted",
    },
  },
  { _id: false },
);

const TopicQuestionSnapSchema = new Schema(
  {
    questionKey: { type: String, required: true },
    number: { type: Number, required: true },
    subject: { type: String, required: true },
    section: { type: String, default: "A" },
    topic: { type: String, required: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
    stem: { type: String, required: true },
    options: { type: Schema.Types.Mixed, required: true },
    correctOption: { type: String },
    correctOptions: { type: [String], default: undefined },
    multiCorrect: { type: Boolean, default: false },
    figureSrc: { type: String },
    figureKind: { type: String },
    answerEstimated: { type: Boolean, default: false },
  },
  { _id: false },
);

const TopicAttemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    topicId: { type: String, required: true, index: true },
    subject: { type: String, required: true },
    topic: { type: String, required: true },
    difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], required: true },
    status: {
      type: String,
      enum: ["in_progress", "submitted", "approved"],
      required: true,
      index: true,
    },
    startedAt: { type: Date, default: Date.now },
    endsAt: { type: Date, required: true },
    submittedAt: { type: Date },
    score: { type: Number },
    correctCount: { type: Number },
    wrongCount: { type: Number },
    unattemptedCount: { type: Number },
    subjectStats: { type: Schema.Types.Mixed },
    topicStats: { type: Schema.Types.Mixed },
    currentQuestionIndex: { type: Number, default: 0 },
    checkpointAt: { type: Date },
    questions: { type: [TopicQuestionSnapSchema], default: [] },
    answers: { type: [TopicAnswerSchema], default: [] },
  },
  { timestamps: false },
);
TopicAttemptSchema.index({ userId: 1, topicId: 1, difficulty: 1, startedAt: -1 });

export const AppMeta = models.AppMeta || model("AppMeta", AppMetaSchema);
export const User = models.User || model("User", UserSchema);
export const Paper = models.Paper || model("Paper", PaperSchema);
export const Question = models.Question || model("Question", QuestionSchema);
export const Attempt = models.Attempt || model("Attempt", AttemptSchema);
export const TopicAttempt =
  models.TopicAttempt || model("TopicAttempt", TopicAttemptSchema);

export type TopicAttemptDoc = InferSchemaType<typeof TopicAttemptSchema> & {
  _id: Types.ObjectId;
};
