# Rule sources

- `ai-phrases.tsv`: from Mackenzie Bowes's `deslop` skill. Phrases over-represented in LLM output,
  ranked by frequency multiple against human text. Only rows with an empty `note` column are used.
- Phrase rules marked `stop-slop` in `src/lib/rules.ts`: adapted from
  [hardikpandya/stop-slop](https://github.com/hardikpandya/stop-slop) `references/phrases.md` at
  commit `8da1f030185bdfe8471220585162991eaeb970e9`.

stop-slop is under the MIT License:

> MIT License
>
> Copyright (c) 2025 Hardik Pandya
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
> associated documentation files (the "Software"), to deal in the Software without restriction,
> including without limitation the rights to use, copy, modify, merge, publish, distribute,
> sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is
> furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT
> NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
> NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
> DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT
> OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
