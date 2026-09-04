import { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

interface PlaceholderPageProps {
  icon: LucideIcon;
  title: string;
  description: string;
  plannedCapabilities: string[];
}

// A clean, honest placeholder — not a fake feature. Used for sections whose
// data model exists (see prisma/schema.prisma) but whose UI/engine is
// intentionally out of scope for this phase.
export default function PlaceholderPage({ icon: Icon, title, description, plannedCapabilities }: PlaceholderPageProps) {
  return (
    <Card className="glass border-slate-800">
      <CardContent className="flex flex-col items-center text-center gap-4 py-16 px-6">
        <div className="w-14 h-14 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center">
          <Icon className="text-violet-500" size={26} />
        </div>
        <div>
          <h2 className="font-Outfit text-xl font-bold text-white">{title}</h2>
          <p className="text-sm text-slate-400 mt-1.5 max-w-md">{description}</p>
        </div>
        <div className="text-left w-full max-w-sm bg-slate-900/50 border border-slate-800 rounded-xl p-4 mt-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Planned for a future phase</span>
          <ul className="mt-2 flex flex-col gap-1.5">
            {plannedCapabilities.map((item) => (
              <li key={item} className="text-xs text-slate-400 flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-slate-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
