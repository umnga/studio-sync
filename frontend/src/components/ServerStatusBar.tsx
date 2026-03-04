import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Cpu, Activity, HardDrive, Zap, Layers, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

const API_BASE_URL = "http://localhost:8000";

interface ServerStatus {
  online: boolean;
  platform: string;
  python_version: string;
  pytorch_version: string;
  memory: {
    rss_mb: number;
    vms_mb: number;
    percent: number;
  };
  cpu_percent: number;
  models: {
    fast: {
      ready: boolean;
      model_name: string;
      stems: number;
      description: string;
      device: string;
    };
    detailed: {
      ready: boolean;
      model_name: string;
      stems: number;
      description: string;
      device: string;
    };
  };
  mps_available: boolean;
  cuda_available: boolean;
}

interface ServerStatusBarProps {
  className?: string;
  compact?: boolean;
}

export const ServerStatusBar = ({ className = "", compact = false }: ServerStatusBarProps) => {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/status`);
        if (!response.ok) throw new Error("Server offline");
        const data = await response.json();
        setStatus(data);
        setError(null);
      } catch {
        setError("Server offline");
        setStatus(null);
      } finally {
        setLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5 seconds
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-muted-foreground text-sm ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin" />
        <span className="font-mono">Connecting...</span>
      </div>
    );
  }

  if (error || !status) {
    return (
      <div className={`flex items-center gap-2 text-red-500 text-sm ${className}`}>
        <AlertCircle className="h-3 w-3" />
        <span className="font-mono">Server Offline</span>
      </div>
    );
  }

  const activeModel = status.models.detailed.ready 
    ? status.models.detailed 
    : status.models.fast.ready 
      ? status.models.fast 
      : null;

  if (compact) {
    return (
      <div className={`flex items-center gap-3 text-sm ${className}`}>
        {/* Online Indicator */}
        <div className="flex items-center gap-1.5">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-2 h-2 bg-green-500 rounded-full"
          />
          <span className="text-green-500 font-medium">Online</span>
        </div>

        {/* Model Info */}
        {activeModel && (
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Cpu className="h-3 w-3" />
            <span className="font-mono text-xs">
              {activeModel.stems}-Stem / {activeModel.device.toUpperCase()}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`bg-card/50 backdrop-blur-sm border border-border rounded-lg p-3 ${className}`}
    >
      <div className="flex flex-wrap items-center gap-4 text-sm">
        {/* Online Status */}
        <div className="flex items-center gap-2">
          <motion.div
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-lg shadow-green-500/50"
          />
          <span className="font-medium text-green-500">Server Online</span>
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-border" />

        {/* AI Engine */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <Cpu className="h-4 w-4" />
          <span className="font-mono text-xs">
            AI Engine: {activeModel ? `${activeModel.stems}-Stem` : "Loading"} / {activeModel?.device || "..."}
          </span>
        </div>

        {/* Memory */}
        <div className="flex items-center gap-2 text-muted-foreground">
          <HardDrive className="h-4 w-4" />
          <span className="font-mono text-xs">
            RAM: {status.memory.rss_mb.toFixed(0)} MB ({status.memory.percent}%)
          </span>
        </div>

        {/* Model Status */}
        <div className="flex items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5">
            <Zap className={`h-3.5 w-3.5 ${status.models.fast.ready ? 'text-yellow-500' : 'text-muted-foreground/50'}`} />
            <span className={`font-mono text-xs ${status.models.fast.ready ? 'text-foreground' : 'text-muted-foreground/50'}`}>
              Fast
            </span>
            {status.models.fast.ready ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
          
          <div className="flex items-center gap-1.5">
            <Layers className={`h-3.5 w-3.5 ${status.models.detailed.ready ? 'text-purple-500' : 'text-muted-foreground/50'}`} />
            <span className={`font-mono text-xs ${status.models.detailed.ready ? 'text-foreground' : 'text-muted-foreground/50'}`}>
              Pro
            </span>
            {status.models.detailed.ready ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};

export default ServerStatusBar;
