import { thing } from "@/lib/a-very-long-module-path";

export default function Page() {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <h1>Ship the thing — today, not tomorrow.</h1>
      <p>{"This sentence is fine and has no tells in it."}</p>
      <button>{"Next —"}</button>
    </div>
  );
}
