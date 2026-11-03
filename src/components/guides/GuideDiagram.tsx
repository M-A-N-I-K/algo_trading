import type { DiagramTone, GuideDiagram as Diagram } from "@/guides";

const W = 600;
const H = 300;
const PAD_X = 16;
const PAD_TOP = 26;
const PAD_BOTTOM = 18;

const TONE: Record<DiagramTone, string> = {
  gain: "var(--gain)",
  loss: "var(--loss)",
  signal: "var(--signal)",
  fees: "var(--fees)",
  muted: "var(--mist)",
};

const px = (x: number) => PAD_X + (x / 100) * (W - PAD_X * 2);
const py = (y: number) => H - PAD_BOTTOM - (y / 100) * (H - PAD_TOP - PAD_BOTTOM);
const path = (points: [number, number][]) => points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${px(x).toFixed(1)},${py(y).toFixed(1)}`).join(" ");

// A schematic of a strategy's long setup: a price path with the zones,
// levels and moments the guide's steps refer to. Not to scale.
export default function GuideDiagram({ diagram }: { diagram: Diagram }) {
  return (
    <figure className="min-w-0 max-w-3xl">
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[34rem]" role="img" aria-label={diagram.caption}>
          {diagram.zones?.map((z, i) => (
            <g key={`z${i}`}>
              <rect x={px(z.x1)} y={py(z.y2)} width={px(z.x2) - px(z.x1)} height={py(z.y1) - py(z.y2)} fill={TONE[z.tone]} opacity={0.14} rx={3} />
              <text
                x={z.labelAt === "end" ? px(z.x2) - 6 : px(z.x1) + 6}
                y={py(z.y2) + 14}
                textAnchor={z.labelAt === "end" ? "end" : "start"}
                fontSize={11}
                fill={TONE[z.tone]}
              >
                {z.label}
              </text>
            </g>
          ))}

          {diagram.verticals?.map((v, i) => (
            <g key={`v${i}`}>
              <line x1={px(v.x)} x2={px(v.x)} y1={PAD_TOP - 8} y2={H - PAD_BOTTOM} stroke="var(--mist)" strokeDasharray="3 4" />
              <text x={px(v.x) + 6} y={PAD_TOP - 10} fontSize={11} fill="var(--fog)">
                {v.label}
              </text>
            </g>
          ))}

          {diagram.levels?.map((l, i) => (
            <g key={`l${i}`}>
              <line x1={px(l.x1 ?? 0)} x2={px(l.x2 ?? 100)} y1={py(l.y)} y2={py(l.y)} stroke={TONE[l.tone]} strokeWidth={1.25} strokeDasharray="5 4" />
              <text
                x={l.labelAt === "start" ? px(l.x1 ?? 0) + 4 : px(l.x2 ?? 100) - 4}
                y={py(l.y) - 5}
                textAnchor={l.labelAt === "start" ? "start" : "end"}
                fontSize={11}
                fill={TONE[l.tone]}
              >
                {l.label}
              </text>
            </g>
          ))}

          {diagram.lines?.map((l, i) => (
            <g key={`ln${i}`}>
              <path d={path(l.points)} fill="none" stroke={TONE[l.tone]} strokeWidth={1.75} />
              <text x={px(l.points[0][0]) + 4} y={py(l.points[0][1]) - 6} fontSize={11} fill={TONE[l.tone]}>
                {l.label}
              </text>
            </g>
          ))}

          <path d={path(diagram.price)} fill="none" stroke="var(--paper)" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />

          {diagram.marks?.map((m, i) => {
            const anchor = m.anchor ?? (m.x > 70 ? "end" : m.x < 20 ? "start" : "middle");
            const dx = anchor === "start" ? 8 : anchor === "end" ? -8 : 0;
            return (
              <g key={`m${i}`}>
                <circle cx={px(m.x)} cy={py(m.y)} r={4.5} fill={TONE[m.tone]} stroke="var(--deck)" strokeWidth={2} />
                <text x={px(m.x) + dx} y={py(m.y) + (m.below ? 18 : -10)} textAnchor={anchor} fontSize={11} fontWeight={500} fill="var(--paper)">
                  {m.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <figcaption className="mt-2 text-xs text-mist">{diagram.caption} Schematic, not to scale.</figcaption>
    </figure>
  );
}
