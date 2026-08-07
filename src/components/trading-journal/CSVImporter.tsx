import { useState } from "react";
import { CloudLightning } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import TraderLoader from "@/components/trading-journal/TraderLoader";

interface ImportStatus {
  type: "success" | "error" | null;
  message: string;
}

interface CSVImporterProps {
  onImportComplete: (count: number) => void;
  addNotification: (message: string, type: "success" | "error") => void;
}

export default function CSVImporter({
  onImportComplete,
  addNotification,
}: CSVImporterProps) {
  const [dragActive, setDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [importStatus, setImportStatus] = useState<ImportStatus>({ type: null, message: "" });

  const handleDrag = (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    if (isUploading) return;
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith(".csv")) {
        processCsvFile(file);
      } else {
        addNotification("Please upload a valid CSV file.", "error");
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isUploading) return;
    if (e.target.files && e.target.files[0]) {
      processCsvFile(e.target.files[0]);
    }
  };

  const processCsvFile = (file: File) => {
    setIsUploading(true);
    setImportStatus({ type: null, message: "" });
    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvText = e.target?.result as string;
      try {
        const response = await fetch("/api/trades/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csvText })
        });
        const resData = await response.json();
        
        if (response.ok) {
          setImportStatus({
            type: "success",
            message: `Successfully imported ${resData.count} new trade records!`
          });
          addNotification(`Imported ${resData.count} trades.`, "success");
          onImportComplete(resData.count);
        } else {
          setImportStatus({
            type: "error",
            message: `Import failed: ${resData.error}`
          });
        }
      } catch (err: any) {
        setImportStatus({
          type: "error",
          message: `Network error during import: ${err.message}`
        });
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      
      <Card className="glass border-slate-800 p-8 flex flex-col justify-between">
        <div>
          <h3 className="font-Outfit text-lg font-bold text-white mb-1.5">Drag & Drop CSV Upload</h3>
          <p className="text-slate-400 text-xs leading-relaxed mb-6">
            Drop your realized trade execution CSV file here. The database will automatically parse entries, compute conversions, and merge new trades into your journal.
          </p>
        </div>
        
        <div 
          className={`border-2 border-dashed rounded-2xl p-12 flex flex-col items-center justify-center gap-3 text-center transition-all min-h-[220px] ${
            isUploading 
              ? "border-slate-800 bg-slate-900/5 cursor-not-allowed opacity-60"
              : dragActive 
                ? "border-violet-500 bg-violet-500/5 cursor-pointer" 
                : "border-slate-800 bg-slate-900/10 hover:border-violet-500/50 hover:bg-violet-500/5 cursor-pointer"
          }`}
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={() => {
            if (!isUploading) {
              document.getElementById("hidden-file-input")?.click();
            }
          }}
        >
          {isUploading ? (
            <TraderLoader 
              message="Processing CSV" 
              subMessages={[
                "Uploading execution file...",
                "Parsing execution strings...",
                "Running duplicate checks...",
                "Syncing database records..."
              ]} 
            />
          ) : (
            <>
              <CloudLightning className="text-violet-500 filter drop-shadow-[0_0_8px_rgba(124,77,255,0.4)]" size={44} />
              <p className="text-slate-200 text-sm font-semibold">Drag and drop your trade CSV file here, or click to upload</p>
              <input 
                type="file" 
                id="hidden-file-input" 
                accept=".csv" 
                className="hidden" 
                disabled={isUploading}
                onChange={handleFileChange}
              />
            </>
          )}
        </div>

        {importStatus.type && (
          <div className={`mt-5 p-4 rounded-xl text-sm font-semibold border ${
            importStatus.type === "success" 
              ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" 
              : "bg-rose-500/10 text-rose-500 border-rose-500/20"
          }`}>
            {importStatus.message}
          </div>
        )}
      </Card>

      <Card className="glass border-slate-800 p-8">
        <h3 className="font-Outfit text-lg font-bold text-white mb-1.5">Supported Format Template</h3>
        <p className="text-slate-400 text-xs leading-relaxed mb-6">
          Ensure your CSV matches the standard format with the following headers:
        </p>
        
        <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl font-mono text-[11px] text-amber-300 overflow-x-auto mb-6">
          <code>Time,Balance before,Balance after,Realized PnL (value),Realized PnL (currency),Action</code>
        </div>
        
        <h4 className="text-sm font-bold text-white mb-3">Example Action Strings parsed:</h4>
        <ul className="list-disc pl-5 flex flex-col gap-3 text-xs text-slate-400 font-medium">
          <li>
            <code className="text-slate-300 font-semibold bg-slate-900 px-1 py-0.5 rounded">&quot;Close short position for symbol BINANCE:ETHUSDT at price 1896.86 for 100 units. Position AVG Price was 1919.530000, currency: USDT...&quot;</code>
          </li>
          <li>
            <code className="text-slate-300 font-semibold bg-slate-900 px-1 py-0.5 rounded">&quot;Close long position for symbol OANDA:XAUUSD at price 4237.320 for 100 units. Position AVG Price was 4248.500000&quot;</code>
          </li>
        </ul>
      </Card>

    </div>
  );
}
