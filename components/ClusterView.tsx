import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ClusterState, Pod, ResourceStatus, K8sEvent, SchedulingConstraint } from '../types';
import { 
  Box, Server, ShieldCheck, Zap, Activity, Clock, Info, 
  AlertTriangle, Filter, ChevronDown, Network, Terminal as TerminalIcon, 
  Check, Magnet, Sparkles, Anchor, AlertCircle, Trash2, Globe, Cpu, Layout as LayoutIcon,
  Moon, Sun, Share2, Layers, Wand2, Hash
} from 'lucide-react';

interface ClusterViewProps {
  clusterState: ClusterState;
  onAction?: (action: string, pod: Pod) => void;
}

type ViewMode = 'mesh' | 'grid';
type Theme = 'light' | 'dark';

const STATUS_CONFIG = {
  [ResourceStatus.RUNNING]: {
    icon: Box,
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500',
    borderColor: 'border-emerald-100',
    lightBg: 'bg-emerald-50',
    glow: 'shadow-emerald-500/20'
  },
  [ResourceStatus.PENDING]: {
    icon: Clock,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500',
    borderColor: 'border-amber-100',
    lightBg: 'bg-amber-50',
    glow: 'shadow-amber-500/20'
  },
  [ResourceStatus.ERROR]: {
    icon: AlertCircle,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500',
    borderColor: 'border-rose-100',
    lightBg: 'bg-rose-50',
    glow: 'shadow-rose-500/20'
  },
  [ResourceStatus.TERMINATING]: {
    icon: Trash2,
    color: 'text-slate-400',
    bgColor: 'bg-slate-400',
    borderColor: 'border-slate-200',
    lightBg: 'bg-slate-100',
    glow: 'shadow-slate-400/20'
  }
};

const formatTimestamp = (ts: string) => {
  return new Date(ts).toLocaleTimeString([], { 
    hour: '2-digit', 
    minute: '2-digit'
  });
};

const ClusterView: React.FC<ClusterViewProps> = ({ clusterState, onAction }) => {
  const [selectedPod, setSelectedPod] = useState<Pod | null>(null);
  const [hoveredPod, setHoveredPod] = useState<string | null>(null);
  const [selectedNamespace, setSelectedNamespace] = useState<string>('all');
  const [viewMode, setViewMode] = useState<ViewMode>('mesh');
  const [theme, setTheme] = useState<Theme>('light');
  const [zoom, setZoom] = useState(0.8);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const initialOffset = useRef({ x: 0, y: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredPods = useMemo(() => {
    return selectedNamespace === 'all' 
      ? clusterState.pods 
      : clusterState.pods.filter(p => p.namespace === selectedNamespace);
  }, [clusterState.pods, selectedNamespace]);

  const nodes = useMemo(() => {
    const nodeSet = new Set<string>();
    filteredPods.forEach(p => nodeSet.add(p.node));
    return Array.from(nodeSet).sort();
  }, [filteredPods]);

  const podsByNode = useMemo(() => {
    const groups: Record<string, { pods: Pod[] }> = {};
    filteredPods.forEach(pod => {
      if (!groups[pod.node]) {
        groups[pod.node] = { pods: [] };
      }
      groups[pod.node].pods.push(pod);
    });
    return groups;
  }, [filteredPods]);

  const meshLayout = useMemo(() => {
    const podPos: Record<string, { x: number, y: number }> = {};
    const nodePos: Record<string, { x: number, y: number }> = {};
    const centerX = 0;
    const centerY = 0;
    
    const clusterToNodeRadius = nodes.length > 2 ? 650 : 500;
    const localPodRadius = 280;

    nodes.forEach((nodeName, nodeIdx) => {
      const nodeAngle = (nodeIdx / nodes.length) * 2 * Math.PI - Math.PI / 2;
      const nx = centerX + clusterToNodeRadius * Math.cos(nodeAngle);
      const ny = centerY + clusterToNodeRadius * Math.sin(nodeAngle);
      
      nodePos[nodeName] = { x: nx, y: ny };

      const podsInNode = filteredPods.filter(p => p.node === nodeName);
      podsInNode.forEach((pod, podIdx) => {
        const startAngle = nodeAngle - Math.PI / 1.5;
        const arcSpread = Math.PI * 1.3;
        const step = podsInNode.length > 1 ? arcSpread / (podsInNode.length - 1) : 0;
        const currentPodAngle = startAngle + (podIdx * step);

        podPos[pod.id] = {
          x: nx + localPodRadius * Math.cos(currentPodAngle),
          y: ny + localPodRadius * Math.sin(currentPodAngle)
        };
      });
    });
    return { nodePos, podPos };
  }, [nodes, filteredPods]);

  // Group pods globally by deployment/statefulset labels
  const podGroupOutlines = useMemo(() => {
    const groups: Array<{ pods: string[], label: string }> = [];
    const byApp: Record<string, string[]> = {};

    filteredPods.forEach(p => {
      const app = p.labels.app || p.labels['k8s-app'] || 'unlabeled';
      if (!byApp[app]) byApp[app] = [];
      byApp[app].push(p.id);
    });

    Object.entries(byApp).forEach(([app, podIds]) => {
      // Only draw grouping if there are multiple pods in the deployment
      if (podIds.length > 1 && app !== 'unlabeled') {
        groups.push({ pods: podIds, label: app });
      }
    });
    
    return groups;
  }, [filteredPods]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (viewMode !== 'mesh') return;
    setIsDragging(true);
    dragStart.current = { x: e.clientX, y: e.clientY };
    initialOffset.current = { ...offset };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || viewMode !== 'mesh') return;
    const dx = (e.clientX - dragStart.current.x) / zoom;
    const dy = (e.clientY - dragStart.current.y) / zoom;
    setOffset({
      x: initialOffset.current.x + dx,
      y: initialOffset.current.y + dy
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (viewMode !== 'mesh') return;
    const zoomDelta = e.deltaY * -0.001;
    setZoom(prevZoom => {
      const newZoom = Math.max(0.3, Math.min(2, prevZoom + zoomDelta));
      return newZoom;
    });
  };

  const isDark = theme === 'dark';

  return (
    <div 
      ref={containerRef}
      className={`h-full relative overflow-hidden transition-colors duration-500 ${isDark ? 'bg-slate-950' : 'bg-slate-50'} select-none`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      style={{ cursor: viewMode === 'mesh' ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
    >
      <style>{`
        @keyframes flow-line {
          to { stroke-dashoffset: -20; }
        }
        @keyframes group-dash {
          to { stroke-dashoffset: -100; }
        }
      `}</style>

      {/* Control Bar */}
      <div className="absolute top-6 left-6 right-6 z-20 flex flex-col md:flex-row justify-end items-start md:items-center gap-4 pointer-events-none">
        <div className="flex flex-wrap gap-3 pointer-events-auto">
          <div className={`flex p-1 rounded-2xl border backdrop-blur-md ${isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white/80 border-slate-200'}`}>
            <button 
              onClick={(e) => { e.stopPropagation(); setViewMode('mesh'); setOffset({x:0, y:0}); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'mesh' ? (isDark ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white shadow-md') : 'text-slate-400 hover:text-indigo-500'}`}
            >
              <Share2 className="w-3.5 h-3.5" /> Graph
            </button>
            <button 
              onClick={(e) => { e.stopPropagation(); setViewMode('grid'); }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 ${viewMode === 'grid' ? (isDark ? 'bg-indigo-600 text-white' : 'bg-indigo-600 text-white shadow-md') : 'text-slate-400 hover:text-indigo-500'}`}
            >
              <LayoutIcon className="w-3.5 h-3.5" /> Grid
            </button>
          </div>

          <button 
            onClick={(e) => { e.stopPropagation(); setTheme(isDark ? 'light' : 'dark'); }}
            className={`p-2.5 rounded-2xl border transition-all ${isDark ? 'bg-slate-900/80 border-white/10 text-amber-400' : 'bg-white/80 border-slate-200 text-slate-600 hover:text-indigo-600 shadow-sm'}`}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          <div className="relative group">
            <select 
              value={selectedNamespace}
              onChange={(e) => setSelectedNamespace(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              className={`appearance-none border text-xs font-bold py-2.5 pl-4 pr-10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all cursor-pointer shadow-xl backdrop-blur-md ${isDark ? 'bg-slate-900/80 border-white/10 text-white hover:bg-slate-700' : 'bg-white/80 border-slate-200 text-slate-700 hover:border-slate-300'}`}
            >
              <option value="all">All Namespaces</option>
              {clusterState.namespaces.map(ns => <option key={ns} value={ns}>{ns}</option>)}
            </select>
            <ChevronDown className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none text-slate-400`} />
          </div>
          
          <div className={`flex gap-1.5 p-1.5 rounded-2xl border backdrop-blur-md ${isDark ? 'bg-slate-900/80 border-white/10' : 'bg-white/80 border-slate-200'}`}>
            <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.max(0.3, z - 0.1)); }} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 text-slate-600'}`}>-</button>
            <div className="px-2 flex items-center text-xs font-bold text-slate-400 min-w-[3rem] justify-center">{Math.round(zoom * 100)}%</div>
            <button onClick={(e) => { e.stopPropagation(); setZoom(z => Math.min(2, z + 0.1)); }} className={`p-2 rounded-xl transition-colors ${isDark ? 'hover:bg-white/10 text-white' : 'hover:bg-slate-100 text-slate-600'}`}>+</button>
          </div>
        </div>
      </div>

      <div 
        className={`w-full h-full ${viewMode === 'mesh' ? 'flex items-center justify-center' : 'overflow-y-auto pt-24 pb-40'} ${isDragging ? '' : 'transition-transform duration-500 ease-out'}`}
        style={viewMode === 'mesh' ? { transform: `scale(${zoom}) translate(${offset.x}px, ${offset.y}px)` } : {}}
      >
        {viewMode === 'mesh' ? (
          <div className="relative w-1 h-1">
            <svg className="absolute inset-[-2000px] w-[4000px] h-[4000px] pointer-events-none overflow-visible">
              {/* Node Visualization Zones */}
              {nodes.map(nodeName => {
                const node = meshLayout.nodePos[nodeName];
                return (
                  <g key={`node-zone-${nodeName}`}>
                      <circle 
                      cx={2000 + node.x} cy={2000 + node.y} r="420" 
                      fill={isDark ? "rgba(2, 6, 23, 0.94)" : "rgba(226, 232, 240, 0.9)"}
                      stroke={isDark ? "rgba(99, 102, 241, 0.5)" : "rgba(71, 85, 105, 0.4)"}
                      strokeWidth="3"
                      className="transition-all duration-500 shadow-2xl"
                    />
                  </g>
                );
              })}

              {/* Resource Deployment/StatefulSet Group Outlines */}
              {podGroupOutlines.map((group, groupIdx) => {
                const points = group.pods.map(pid => meshLayout.podPos[pid]).filter(Boolean);
                if (points.length < 2) return null;
                
                const minX = Math.min(...points.map(p => p.x));
                const maxX = Math.max(...points.map(p => p.x));
                const minY = Math.min(...points.map(p => p.y));
                const maxY = Math.max(...points.map(p => p.y));
                
                const cx = (minX + maxX) / 2;
                const cy = (minY + maxY) / 2;
                
                // Determine a bounding radius/ellipse for the group
                const padding = 120;
                const rx = (maxX - minX) / 2 + padding;
                const ry = (maxY - minY) / 2 + padding;
                const isCircle = Math.abs(rx - ry) < 50;
                const r = Math.max(rx, ry);

                return (
                  <g key={`group-outline-${groupIdx}`} className="animate-in fade-in duration-700">
                    <ellipse 
                      cx={2000 + cx} cy={2000 + cy} rx={isCircle ? r : rx} ry={isCircle ? r : ry}
                      fill="none"
                      stroke={isDark ? "#3b82f6" : "#2563eb"}
                      strokeWidth="2.5"
                      strokeDasharray="12,12"
                      style={{ animation: 'group-dash 25s linear infinite' }}
                      opacity="0.35"
                    />
                    <rect 
                      x={2000 + cx - 60} y={2000 + cy - (isCircle ? r : ry) - 20} 
                      width="120" height="20" rx="10"
                      fill={isDark ? "#1e293b" : "#f1f5f9"} 
                      opacity="0.8"
                    />
                    <text 
                      x={2000 + cx} y={2000 + cy - (isCircle ? r : ry) - 7} 
                      textAnchor="middle" 
                      className={`text-[9px] font-black uppercase tracking-widest ${isDark ? 'fill-blue-400' : 'fill-blue-700'}`}
                    >
                      {group.label}
                    </text>
                  </g>
                );
              })}

              {/* Network Connection Mesh */}
              {filteredPods.map(pod => {
                const start = meshLayout.podPos[pod.id];
                return (pod.connections || []).map(targetId => {
                  const end = meshLayout.podPos[targetId];
                  if (!end) return null;
                  const isHovered = hoveredPod === pod.id || hoveredPod === targetId;
                  const midX = 2000 + (start.x + end.x) / 2;
                  const midY = 2000 + (start.y + end.y) / 2 - 140;
                  const path = `M ${2000 + start.x} ${2000 + start.y} Q ${midX} ${midY} ${2000 + end.x} ${2000 + end.y}`;
                  return (
                    <g key={`net-link-${pod.id}-${targetId}`} className="transition-opacity duration-300" style={{ opacity: isHovered ? 1 : (hoveredPod ? 0.05 : 0.6) }}>
                      <path 
                        d={path} fill="none" stroke={isDark ? "#818cf8" : "#4f46e5"} strokeWidth={isHovered ? 5 : 3}
                        strokeDasharray="8,6"
                        style={{ animation: 'flow-line 1s linear infinite' }}
                      />
                    </g>
                  );
                });
              })}
            </svg>

            {/* Node Identity Markers */}
            {Object.entries(meshLayout.nodePos).map(([name, pos]) => (
              <div key={name} className="absolute transition-all duration-500 ease-in-out" style={{ left: pos.x, top: pos.y + 340, transform: 'translate(-50%, -50%)' }}>
                <div className={`w-36 h-36 rounded-[42px] border-4 flex items-center justify-center shadow-2xl relative transition-all group ${isDark ? 'bg-slate-900 border-indigo-500/80' : 'bg-white border-slate-300 shadow-indigo-500/20'}`}>
                  <Server className={`w-20 h-20 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                  <div className={`absolute -top-16 px-6 py-2.5 rounded-full text-sm font-black uppercase tracking-widest whitespace-nowrap border-2 shadow-2xl ${isDark ? 'bg-slate-900 text-indigo-400 border-indigo-500/60' : 'bg-slate-800 text-white border-slate-700'}`}>
                    {name}
                  </div>
                </div>
              </div>
            ))}

            {/* Interactive Pod Units */}
            {filteredPods.map(pod => {
              const pos = meshLayout.podPos[pod.id];
              const config = STATUS_CONFIG[pod.status];
              const StatusIcon = config.icon;
              const isHovered = hoveredPod === pod.id;
              const isSelected = selectedPod?.id === pod.id;

              const connectedPodNames = (pod.connections || [])
                .map(cid => clusterState.pods.find(p => p.id === cid)?.name)
                .filter(Boolean);

              return (
                <div key={pod.id} className="absolute transition-all duration-500 ease-in-out" style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, -50%)' }}>
                  <div className="relative group/podcontainer">
                    {/* Floating Metadata Card */}
                    {isHovered && (
                      <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-8 px-5 py-4 rounded-2xl border backdrop-blur-xl shadow-2xl z-[60] w-72 animate-in fade-in zoom-in slide-in-from-bottom-2 duration-200 pointer-events-none ${isDark ? 'bg-slate-900/90 border-indigo-500/30 text-white' : 'bg-white/90 border-indigo-200 text-slate-800'}`}>
                        <div className="space-y-3">
                          <div className="flex items-center justify-between border-b border-indigo-500/10 pb-2">
                            <div className="flex flex-col">
                              <span className="text-[11px] font-black uppercase tracking-tight truncate max-w-[140px]">{pod.name}</span>
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{pod.namespace}</span>
                            </div>
                            <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${isDark ? 'bg-slate-800/50 border-white/5' : 'bg-slate-50 border-slate-200'}`}>
                              <div className={`w-1.5 h-1.5 rounded-full ${config.bgColor}`} />
                              <span className={`text-[9px] font-black uppercase tracking-tighter ${config.color}`}>{pod.status}</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between py-1">
                            <div className="flex items-center gap-2">
                              <Globe className="w-3 h-3 text-slate-400" />
                              <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">IP ADDRESS</span>
                            </div>
                            <span className="text-[10px] font-mono font-bold text-indigo-500">{pod.ip}</span>
                          </div>
                          {connectedPodNames.length > 0 && (
                            <div className="pt-2 border-t border-indigo-500/10">
                              <div className="flex items-center gap-2 mb-2">
                                <Network className="w-3.5 h-3.5 text-indigo-500" />
                                <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">ACTIVE LINKS</span>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {connectedPodNames.map((name, idx) => (
                                  <span key={idx} className={`text-[9px] font-bold px-2 py-0.5 rounded-md ${isDark ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-600'}`}>
                                    {name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <div className={`absolute top-full left-1/2 -translate-x-1/2 border-8 border-transparent ${isDark ? 'border-t-slate-900/90' : 'border-t-white/90'}`} />
                      </div>
                    )}

                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={() => setSelectedPod(pod)}
                      onMouseEnter={() => setHoveredPod(pod.id)}
                      onMouseLeave={() => setHoveredPod(null)}
                      className={`relative flex flex-col items-center transition-all duration-300 ${isHovered ? 'scale-125 z-50' : isSelected ? 'scale-110 z-40' : 'z-30'}`}
                    >
                      <div className={`p-6 rounded-[34px] border-3 shadow-2xl transition-all ${isSelected ? (isDark ? 'bg-indigo-900 border-indigo-400' : 'bg-indigo-50 border-indigo-600') : (isDark ? 'bg-slate-800 border-white/10' : 'bg-white border-slate-200')}`}>
                        <StatusIcon className={`w-12 h-12 ${config.color}`} />
                        <div className={`absolute top-3 right-3 w-6 h-6 rounded-full ${config.bgColor} shadow-md border-3 ${isDark ? 'border-slate-800' : 'border-white'}`} />
                      </div>
                      
                      <div className="mt-4 flex flex-col items-center pointer-events-none">
                        <div className={`flex flex-col items-center px-4 py-2.5 rounded-2xl shadow-2xl border backdrop-blur-md transition-all ${
                          isHovered || isSelected ? 'scale-110' : ''
                        } ${isDark ? 'bg-slate-900/95 border-white/20' : 'bg-white/98 border-slate-300'}`}>
                          <span className={`text-[12px] font-black leading-tight ${isDark ? 'text-white' : 'text-slate-800'} whitespace-nowrap uppercase tracking-tight`}>
                            {pod.name}
                          </span>
                          <span className="text-[10px] text-indigo-500 font-bold uppercase tracking-widest mt-1">
                            {pod.namespace}
                          </span>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* GRID VIEW REARRANGED */
          <div className="px-12 max-w-[1800px] mx-auto space-y-16 pb-40">
            {Object.entries(podsByNode).map(([nodeName, data]) => (
              <section key={nodeName} className="relative">
                {/* Node Header */}
                <div className="flex items-center justify-between mb-8 group">
                  <div className="flex items-center gap-6">
                    <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg transition-transform group-hover:scale-110 ${isDark ? 'bg-indigo-500/10 text-indigo-400 border border-indigo-500/20' : 'bg-white text-indigo-600 border border-slate-200'}`}>
                      <Server className="w-7 h-7" />
                    </div>
                    <div>
                      <h3 className={`text-3xl font-black tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>{nodeName}</h3>
                      <div className="flex items-center gap-4 mt-1">
                        <span className="text-[10px] font-black text-emerald-500 uppercase tracking-[0.2em] flex items-center gap-2">
                          <Check className="w-3 h-3" /> Ready
                        </span>
                        <span className={`text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-2 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                          <Hash className="w-3 h-3" /> {data.pods.length} Pods
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className={`h-px flex-1 mx-12 hidden lg:block ${isDark ? 'bg-white/5' : 'bg-slate-200'}`} />
                  <div className="hidden sm:flex gap-4">
                     <div className={`px-4 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest ${isDark ? 'bg-slate-900 border-white/5 text-slate-400' : 'bg-white border-slate-200 text-slate-500'}`}>
                        v1.28.4-gke.100
                     </div>
                  </div>
                </div>

                {/* Pod Cards Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-6">
                  {data.pods.map(pod => {
                    const config = STATUS_CONFIG[pod.status];
                    const isSelected = selectedPod?.id === pod.id;
                    const StatusIcon = config.icon;
                    return (
                      <button
                        key={pod.id}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={() => setSelectedPod(pod)}
                        className={`group/podcard relative p-6 rounded-3xl border-2 transition-all text-left flex flex-col gap-4 overflow-hidden ${
                          isSelected 
                            ? (isDark ? 'bg-indigo-600 border-indigo-400 text-white shadow-2xl scale-[1.02]' : 'bg-white border-indigo-500 shadow-2xl scale-[1.02] ring-4 ring-indigo-500/10') 
                            : (isDark ? 'bg-slate-900 border-white/5 hover:border-indigo-500/40 hover:bg-slate-800/80' : 'bg-white border-slate-100 hover:border-indigo-300 hover:shadow-xl')
                        }`}
                      >
                        <div className={`absolute top-0 left-0 right-0 h-1.5 ${config.bgColor} opacity-60`} />
                        <div className="flex justify-between items-start mb-1">
                          <div className={`p-2 rounded-xl ${isDark ? 'bg-white/5' : 'bg-slate-50'} group-hover/podcard:scale-110 transition-transform`}>
                            <StatusIcon className={`w-6 h-6 ${isSelected && isDark ? 'text-white' : config.color}`} />
                          </div>
                          <div className="flex flex-col items-end gap-1">
                             <span className={`text-[8px] font-black uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${isSelected ? 'bg-white/20 text-white' : (isDark ? 'bg-slate-800 text-slate-400' : 'bg-slate-100 text-slate-500')}`}>
                                {pod.namespace}
                             </span>
                          </div>
                        </div>

                        <div className="flex flex-col min-w-0">
                          <h4 className={`text-sm font-black truncate tracking-tight mb-0.5 ${isSelected ? 'text-white' : (isDark ? 'text-slate-100' : 'text-slate-800')}`}>
                            {pod.name}
                          </h4>
                          <div className="flex items-center justify-between mt-3 pt-3 border-t border-current border-opacity-5">
                             <div className="flex items-center gap-1.5">
                                <Activity className={`w-3 h-3 ${isSelected ? 'text-white/60' : 'text-slate-400'}`} />
                                <span className={`text-[9px] font-bold ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                                  {Math.round(pod.usage.cpu)}% CPU
                                </span>
                             </div>
                             <div className="flex items-center gap-1.5">
                                <Layers className={`w-3 h-3 ${isSelected ? 'text-white/60' : 'text-slate-400'}`} />
                                <span className={`text-[9px] font-bold ${isSelected ? 'text-white/80' : 'text-slate-400'}`}>
                                  {Math.round(pod.usage.memory)}% MEM
                                </span>
                             </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>

      {selectedPod && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-md"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <div className={`w-full max-w-xl rounded-[40px] border shadow-[0_0_150px_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh] animate-in zoom-in duration-300 ${isDark ? 'bg-slate-900 border-white/10' : 'bg-white border-slate-200'}`}>
            <div className={`p-10 border-b flex justify-between items-start shrink-0 rounded-t-[40px] ${isDark ? 'border-white/5 bg-indigo-500/5' : 'border-slate-100 bg-slate-50/50'}`}>
              <div className="flex items-center gap-6">
                <div className={`p-6 rounded-3xl border-2 ${isDark ? 'bg-white/5 border-white/10' : 'bg-white border-slate-200 shadow-sm'}`}>
                  {(() => {
                    const config = STATUS_CONFIG[selectedPod.status];
                    const Icon = config.icon;
                    return <Icon className={`w-10 h-10 ${config.color}`} />;
                  })()}
                </div>
                <div>
                  <h3 className={`text-2xl font-black mb-2 tracking-tight ${isDark ? 'text-white' : 'text-slate-800'}`}>{selectedPod.name}</h3>
                  <div className="flex flex-wrap gap-2">
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${isDark ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' : 'text-indigo-700 bg-indigo-50 border-indigo-100'}`}>NS: {selectedPod.namespace}</span>
                    <span className={`text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${isDark ? 'text-slate-400 bg-slate-800 border-white/10' : 'text-slate-500 bg-slate-100 border-slate-200'}`}>IP: {selectedPod.ip}</span>
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedPod(null)} 
                className={`p-3 transition-colors rounded-full ${isDark ? 'text-slate-400 hover:text-white bg-white/5' : 'text-slate-400 hover:text-slate-600 bg-slate-100'}`}
              >
                <Trash2 className="w-6 h-6 rotate-45" />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-10 space-y-10 custom-scrollbar">
              <div className="grid grid-cols-2 gap-8">
                <div className={`p-8 rounded-3xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                  <h4 className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest mb-8">
                    <Activity className="w-4 h-4" /> PERFORMANCE
                  </h4>
                  <div className="space-y-8">
                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] font-black text-slate-500">
                        <span className="flex items-center gap-2 tracking-widest">CPU</span>
                        <span>{Math.round(selectedPod.usage.cpu)}%</span>
                      </div>
                      <div className={`h-2 w-full rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                        <div className="h-full bg-indigo-500 transition-all duration-1000" style={{ width: `${selectedPod.usage.cpu}%` }} />
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] font-black text-slate-500">
                        <span className="flex items-center gap-2 tracking-widest">MEMORY</span>
                        <span>{Math.round(selectedPod.usage.memory)}%</span>
                      </div>
                      <div className={`h-2 w-full rounded-full overflow-hidden ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                        <div className="h-full bg-violet-600 transition-all duration-1000" style={{ width: `${selectedPod.usage.memory}%` }} />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-6">
                  <div className={`p-8 rounded-3xl border ${isDark ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest mb-5">
                      <Network className="w-4 h-4" /> NETWORK MESH
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {(selectedPod.connections || []).length > 0 ? (selectedPod.connections || []).map(id => (
                        <div key={id} className={`text-[9px] font-black px-3 py-1.5 rounded-xl border ${isDark ? 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20' : 'text-indigo-700 bg-white border-indigo-200 shadow-sm'}`}>
                          {clusterState.pods.find(p => p.id === id)?.name.split('-')[0] || id}
                        </div>
                      )) : <span className="text-[10px] italic text-slate-400">No mesh connections</span>}
                    </div>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-[10px] font-black text-slate-400 uppercase flex items-center gap-2 tracking-widest mb-6">
                  <Clock className="w-4 h-4" /> RESOURCE EVENTS
                </h4>
                <div className="space-y-4">
                  {selectedPod.events.slice().reverse().map((event) => (
                    <div key={event.id} className={`p-5 rounded-3xl border transition-all ${isDark ? 'bg-white/5 border-white/5' : 'bg-white border-slate-100 shadow-sm'}`}>
                      <div className="flex justify-between items-start mb-2">
                        <span className={`text-sm font-black ${isDark ? 'text-white' : 'text-slate-800'}`}>{event.reason}</span>
                        <span className="text-[9px] text-slate-400 font-bold">{formatTimestamp(event.timestamp)}</span>
                      </div>
                      <p className={`text-xs font-medium leading-relaxed ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>{event.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className={`p-10 border-t shrink-0 rounded-b-[40px] ${isDark ? 'border-white/5 bg-white/5' : 'border-slate-100 bg-slate-50/80'}`}>
              <div className="flex gap-4">
                <button 
                  onClick={() => onAction?.('logs', selectedPod)}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black py-4 rounded-2xl transition-all shadow-xl shadow-indigo-600/30 flex items-center justify-center gap-3 active:scale-95"
                >
                  <TerminalIcon className="w-5 h-5" /> LOGS
                </button>
                <button 
                  onClick={() => onAction?.('exec', selectedPod)}
                  className={`flex-1 text-sm font-black py-4 rounded-2xl transition-all border flex items-center justify-center gap-3 active:scale-95 ${isDark ? 'bg-slate-800 border-white/10 text-white hover:bg-slate-700' : 'bg-white border-slate-200 text-slate-800 hover:bg-slate-50 shadow-sm'}`}
                >
                  <Cpu className="w-5 h-5" /> SHELL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClusterView;