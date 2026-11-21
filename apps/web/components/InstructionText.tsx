"use client";

import { Fragment, type CSSProperties } from "react";

import { parseInstructionBlocks } from "../lib/petunjuk";
import { MathText } from "./MathContent";

// Tampilan teks petunjuk guru (penugasan & LKPD): poin bernomor per baris
// menjadi daftar bernomor yang rata, baris lain menjadi paragraf dengan
// jeda baris yang dihormati. Tiap baris/butir tetap melewati MathText agar
// rumus di dalam petunjuk ter-render seperti sebelumnya. Gaya daftar ada
// di globals.css (.instruction-text); warna & tinggi baris mengikuti
// konteks lewat style/className dari pemanggil, sama seperti <p> lama.
export function InstructionText({ text, className, style }: { text: string; className?: string; style?: CSSProperties }) {
  const blocks = parseInstructionBlocks(text);
  if (blocks.length === 0) return null;

  return (
    <div className={className ? `instruction-text ${className}` : "instruction-text"} style={style}>
      {blocks.map((block, blockIndex) =>
        block.type === "list" ? (
          <ol key={blockIndex} start={block.start !== 1 ? block.start : undefined}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>
                <MathText text={item} />
              </li>
            ))}
          </ol>
        ) : (
          <p key={blockIndex}>
            {block.lines.map((line, lineIndex) => (
              <Fragment key={lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                <MathText text={line} />
              </Fragment>
            ))}
          </p>
        ),
      )}
    </div>
  );
}
