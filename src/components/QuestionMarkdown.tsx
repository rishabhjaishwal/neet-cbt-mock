"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { optionToDisplayMarkdown, stemToDisplayMarkdown } from "@/lib/question-markdown";
import { normalizeScientificText } from "@/lib/symbol-normalize";
import "katex/dist/katex.min.css";

type StemProps = {
  stem: string;
  className?: string;
};

export function QuestionStemMarkdown({ stem, className = "" }: StemProps) {
  const md = stemToDisplayMarkdown(normalizeScientificText(stem));
  return (
    <div className={`q-md q-md-stem ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {md}
      </ReactMarkdown>
    </div>
  );
}

type OptionProps = {
  option: string;
  className?: string;
};

export function QuestionOptionMarkdown({ option, className = "" }: OptionProps) {
  const md = optionToDisplayMarkdown(normalizeScientificText(option));
  return (
    <span className={`q-md q-md-option ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          p: ({ children }) => <span className="q-md-option-line">{children}</span>,
        }}
      >
        {md}
      </ReactMarkdown>
    </span>
  );
}
