"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CodeBlock({ code }: { code: string; lang?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="group relative">
      <pre className="max-h-96 overflow-auto rounded-md bg-zinc-950 p-4 text-sm leading-relaxed text-zinc-50 dark:bg-zinc-900">
        <code className="font-mono">{code.trim()}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-2 top-2 h-7 w-7 text-zinc-400 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-50 group-hover:opacity-100"
      >
        {copied ? <Check /> : <Copy />}
      </Button>
    </div>
  );
}
