import ReactMarkdown from "react-markdown";

import { cn } from "@/lib/utils";

export function Md({ children, className }: { children: string; className?: string }) {
  return (
    <div
      className={cn(
        "space-y-3 text-sm leading-relaxed text-foreground/85",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_ol]:list-decimal [&_ol]:space-y-1.5 [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5",
        "[&_blockquote]:rounded-lg [&_blockquote]:border-l-4 [&_blockquote]:border-lime [&_blockquote]:bg-muted [&_blockquote]:px-4 [&_blockquote]:py-2",
        "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-4",
        className,
      )}
    >
      <ReactMarkdown>{children}</ReactMarkdown>
    </div>
  );
}
