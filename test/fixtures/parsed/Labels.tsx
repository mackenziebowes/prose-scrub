"use client";
import { cn } from "@/lib/cn";

type Mode = "it's not a type, it's a string";

export function Labels({ active }: { active: boolean }) {
  const dash = "Escaped — dash";
  return (
    <section className={cn("grid gap-4", active && "it's not a class, it's a list")} style={{ fontFamily: "it's not a style, it's a font" }}>
      <h2>A heading with no period</h2>
      <button>Read the docs</button>
      <div>FIG. A · LEARN THE CLI</div>
      <Field description="Command name, e.g. sync or list-users" />
      <p>
        This paragraph has <strong>five sentences</strong> in it, and the first of them runs on for a good while before it stops. Short one here. Three words now. The fourth sentence is a little longer than that. And the fifth sentence, which is the last one in the paragraph, goes on and on for quite a few words before it ends.
      </p>
      <Terminal commands={["it's not a command, it's a flag --json"]} />
    </section>
  );
}
