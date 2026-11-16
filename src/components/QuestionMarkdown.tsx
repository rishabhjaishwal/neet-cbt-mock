"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { optionToDisplayMarkdown, stemToDisplayMarkdown } from "@/lib/question-markdown";

type StemProps = {
  stem: string;
  className?: string;
};

export function QuestionStemMarkdown({ stem, className = "" }: StemProps) {
  const md = stemToDisplayMarkdown(stem);
  return (
    <div className={`q-md q-md-stem ${className}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
    </div>
  );
}

type OptionProps = {
  option: string;
  className?: string;
};

export function QuestionOptionMarkdown({ option, className = "" }: OptionProps) {
  const md = optionToDisplayMarkdown(option);
  return (
    <span className={`q-md q-md-option ${className}`.trim()}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <span className="q-md-option-line">{children}</span>,
        }}
      >
        {md}
      </ReactMarkdown>
    </span>
  );
}
